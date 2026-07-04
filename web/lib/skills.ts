// ============================================================
// 品味库加载器 —— 从 docs/skills/**/*.md 读取沉淀的审美 skill，
// 拼接成可以直接注入 agent prompt 的字符串块。
//
// 三层结构（与 docs/skills/README.md 对齐）：
//   atomic/       原子 skill（一个维度一条）
//   templates/    模板 skill（一条视频 = 一个配方）
//   antipatterns/ 反例 skill（什么是丑）
//
// 每个 md 头有 frontmatter：适用类型/成熟度/样本量。
// 加载策略：进程内缓存一次；hot-reload 走 VR_SKILLS_NOCACHE=1。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import type { ProjectMeta, VideoType } from "@/lib/types";

export type SkillKind = "atomic" | "template" | "antipattern";

export interface SkillDoc {
  slug: string;                 // 文件名不带扩展
  kind: SkillKind;
  path: string;                 // 绝对路径
  frontmatter: Record<string, unknown>;
  body: string;                 // 不含 frontmatter 的正文
  title: string;                // frontmatter.title 或首个 # 标题
  applies: VideoType[];         // frontmatter.适用类型 解析结果
  maturity: "draft" | "validated" | "hard";
}

// ---- 定位 skills 根目录（web/ 位于仓库 web 子目录，需向上找 docs/skills）----
function findSkillsRoot(): string {
  // 优先 env 覆盖
  if (process.env.VR_SKILLS_DIR) return process.env.VR_SKILLS_DIR;
  // web/ → 上一级仓库根 → docs/skills
  const guess = path.resolve(process.cwd(), "..", "docs", "skills");
  if (fs.existsSync(guess)) return guess;
  const inside = path.resolve(process.cwd(), "docs", "skills");
  if (fs.existsSync(inside)) return inside;
  return guess; // 让上层报错时能看到寻址
}

// ---- 极简 frontmatter 解析（YAML 子集：key: value / list ----
function parseFrontmatter(text: string): { fm: Record<string, unknown>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: text };
  const raw = m[1];
  const fm: Record<string, unknown> = {};
  let currentListKey: string | null = null;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (currentListKey && /^\s+-\s/.test(line)) {
      const val = line.replace(/^\s+-\s+/, "").trim();
      const arr = (fm[currentListKey] as string[]) || [];
      arr.push(val);
      fm[currentListKey] = arr;
      continue;
    }
    // key: value  或  key:  （list 开头）
    const km = line.match(/^([^:]+):\s*(.*)$/);
    if (!km) continue;
    const key = km[1].trim();
    const val = km[2].trim();
    if (val === "") {
      currentListKey = key;
      fm[key] = [];
    } else {
      currentListKey = null;
      fm[key] = val;
    }
  }
  return { fm, body: text.slice(m[0].length) };
}

function firstH1(body: string): string {
  const m = body.match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

function parseApplies(fm: Record<string, unknown>): VideoType[] {
  // 多个可能的 key（早期 md 写了不同名）
  const raw =
    fm["适用类型"] ??
    fm["适用场景"] ??
    fm["applies"] ??
    "showreel";
  const s = String(raw).toLowerCase();
  const all: VideoType[] = ["showreel", "popsci", "teaching"];
  if (s.includes("all") || s.includes("全部")) return all;
  const hit = all.filter((t) => s.includes(t));
  // 完全无命中→默认都适用（不报错也不丢掉 skill）
  return hit.length > 0 ? hit : all;
}

function parseMaturity(fm: Record<string, unknown>): SkillDoc["maturity"] {
  const raw = String(fm["成熟度"] ?? fm["maturity"] ?? "draft").toLowerCase();
  if (raw.includes("hard")) return "hard";
  if (raw.includes("validated")) return "validated";
  return "draft";
}

// ---- 加载单个目录 ----
function loadDir(dir: string, kind: SkillKind): SkillDoc[] {
  if (!fs.existsSync(dir)) return [];
  const docs: SkillDoc[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const full = path.join(dir, name);
    const text = fs.readFileSync(full, "utf8");
    const { fm, body } = parseFrontmatter(text);
    docs.push({
      slug: name.replace(/\.md$/, ""),
      kind,
      path: full,
      frontmatter: fm,
      body,
      title: (fm["title"] as string) || firstH1(body) || name,
      applies: parseApplies(fm),
      maturity: parseMaturity(fm),
    });
  }
  return docs;
}

// ---- 缓存（进程内） ----
const gCache = globalThis as unknown as { __vrSkills?: SkillDoc[] };
export function loadAllSkills(): SkillDoc[] {
  if (gCache.__vrSkills && !process.env.VR_SKILLS_NOCACHE) return gCache.__vrSkills;
  const root = findSkillsRoot();
  const all = [
    ...loadDir(path.join(root, "atomic"), "atomic"),
    ...loadDir(path.join(root, "templates"), "template"),
    ...loadDir(path.join(root, "antipatterns"), "antipattern"),
  ];
  gCache.__vrSkills = all;
  return all;
}

// ---- 抽正文里的"Agent 使用指令"章节（如果有）----
// skill md 里约定：## Agent 使用指令 后到下一个 ## 之前（允许后面括号注释）
function extractAgentInstructions(body: string): string {
  const re =
    /##\s*(?:Agent\s*使用指令|Agent instructions?|AI 使用指令)[^\n]*\n([\s\S]*?)(?=\n##\s+|\n---\s*$|$)/i;
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

// ---- 组装喂 agent 的 skill block ----
// 场景：generateStoryboard 时调用，videoType 会过滤 applies。
export function skillBlockFor(
  step: "storyboard" | "concept" | "script",
  videoType: VideoType
): string {
  const all = loadAllSkills();
  const applicable = all.filter((s) => s.applies.includes(videoType));

  const templates = applicable.filter((s) => s.kind === "template");
  const atomics = applicable.filter((s) => s.kind === "atomic");
  const antis = applicable.filter((s) => s.kind === "antipattern");

  const sections: string[] = [];

  // 模板 skill（结构参考，不做硬约束）
  if (templates.length > 0 && step === "storyboard") {
    sections.push("【可参考的分镜结构模板（templates）】");
    for (const t of templates) {
      // 只取 body 的前 2500 字符，避免 prompt 爆炸
      const excerpt = t.body.split(/\n---\s*\n/)[0].slice(0, 2500);
      sections.push(`--- 模板: ${t.title} ---\n${excerpt}`);
    }
  }

  // 原子 skill：只喂"Agent 使用指令"章节（无指令的降级喂标题+一句摘要）
  if (atomics.length > 0) {
    sections.push("\n【必须遵守的品味规则（atomic skills）】");
    for (const a of atomics) {
      const inst = extractAgentInstructions(a.body);
      if (inst) {
        sections.push(`### ${a.title}\n${inst}`);
      } else {
        // 无 Agent 指令的原子 skill 直接列名字提示（不占大量 token）
        sections.push(`### ${a.title}\n(见 docs/skills/atomic/${a.slug}.md)`);
      }
    }
  }

  // 反例 skill：只喂完整正文（内容本身就是清单）
  if (antis.length > 0 && step === "storyboard") {
    sections.push("\n【生成前必须自检的反例清单】");
    for (const p of antis) {
      const excerpt = p.body.split(/\n---\s*\n/)[0].slice(0, 3500);
      sections.push(excerpt);
    }
  }

  return sections.join("\n\n");
}

// ---- 从 project 上下文推断"应该激活哪些 skill"（v1 不用；预留） ----
export function skillsForProject(p: ProjectMeta): SkillDoc[] {
  return loadAllSkills().filter((s) => s.applies.includes(p.videoType));
}
