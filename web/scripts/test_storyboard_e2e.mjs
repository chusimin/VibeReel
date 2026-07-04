#!/usr/bin/env node
// 端到端测试：真调 claude CLI,生成一次 storyboard,验证 B1 硬约束
// 用法: node scripts/test_storyboard_e2e.mjs <projectId>

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const projId = process.argv[2] || "7a5767c7-ca8a-4d7b-b5af-183ba2e0a1f0";
const projFile = path.resolve("data/projects", projId, "project.json");
const proj = JSON.parse(fs.readFileSync(projFile, "utf8"));
console.log("[e2e] project:", proj.title.slice(0, 40), "| type:", proj.videoType);

const concept = proj.concepts?.[proj.chosenConcept ?? 0];
console.log("[e2e] concept:", concept?.title, "/", concept?.tone);
console.log("[e2e] material chunks:", proj.material?.chunks?.length);

// ------ 复制 skill 加载逻辑（同上）------
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: text };
  const fm = {}; let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (cur && /^\s+-\s/.test(line)) { (fm[cur] ||= []).push(line.replace(/^\s+-\s+/, "").trim()); continue; }
    const km = line.match(/^([^:]+):\s*(.*)$/); if (!km) continue;
    if (km[2].trim() === "") { cur = km[1].trim(); fm[cur] = []; } else { cur = null; fm[km[1].trim()] = km[2].trim(); }
  }
  return { fm, body: text.slice(m[0].length) };
}
function loadDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".md") && f !== "README.md")
    .map(f => { const full = path.join(dir, f); const { fm, body } = parseFrontmatter(fs.readFileSync(full, "utf8"));
      return { slug: f.replace(/\.md$/,""), title: fm.title || f, body }; });
}
function extractAgentInst(body) {
  const re = /##\s*(?:Agent\s*使用指令|Agent instructions?|AI 使用指令)[^\n]*\n([\s\S]*?)(?=\n##\s+|\n---\s*$|$)/i;
  const m = body.match(re); return m ? m[1].trim() : "";
}

const skillRoot = path.resolve("..", "docs", "skills");
const atomics = loadDir(path.join(skillRoot, "atomic"));
const templates = loadDir(path.join(skillRoot, "templates"));
const antis = loadDir(path.join(skillRoot, "antipatterns"));

function buildSkillBlock() {
  const sec = [];
  sec.push("【可参考的分镜结构模板】");
  for (const t of templates) sec.push(`--- 模板: ${t.title} ---\n${t.body.split(/\n---\s*\n/)[0].slice(0, 2500)}`);
  sec.push("\n【必须遵守的品味规则】");
  for (const a of atomics) { const inst = extractAgentInst(a.body); if (inst) sec.push(`### ${a.title}\n${inst}`); }
  sec.push("\n【生成前必须自检的反例清单】");
  for (const p of antis) sec.push(p.body.split(/\n---\s*\n/)[0].slice(0, 3500));
  return sec.join("\n\n");
}

// ------ 组 prompt（对齐 agent.ts）------
const NO_BROWSE = "重要约束：你处于离线、无工具环境——无法联网、无法浏览网页、无法调用任何技能或工具。只能基于下面给出的素材推断。不要回复任何与目标输出无关的话；尤其不要说你需要浏览/访问链接，直接给出要求的输出。";
const material = proj.material;
const chunksBlock = material?.chunks?.length ? [
  `素材总览：${material.summary}`,
  "【可引用料块（用 @id 指代）】",
  ...material.chunks.map(c => `@${c.id} [${c.kind}] ${c.title}：${c.detail}`)
].join("\n") : "";

const VISUAL_CATALOG = [
  "每个分镜还要给一个 visual（决定画面模板，对应真实渲染），从下列里选最贴合内容的一个：",
  '- title：大标题 / 开场钩子。{"type":"title","subtitle":"副标题(可选)"}',
  '- stat：突出一个数字 / 指标。{"type":"stat","value":"24×"}',
  '- kinetic-text：动感强调一句话。{"type":"kinetic-text"}',
  '- bullet-list：2~4 个并列要点。{"type":"bullet-list","items":["要点1","要点2"]}',
  '- quote：金句 / 用户原话。{"type":"quote"}',
  '- section-card：章节过渡卡。{"type":"section-card","chapter":{"num":"01","title":"章节名"}}',
  '- term-define：解释一个术语。{"type":"term-define","term":"术语","definition":"一句话定义"}',
  '- comparison：对比两者。{"type":"comparison","items":["A","B"]}',
  '- cta：收束行动号召。{"type":"cta"}',
].join("\n");

const skills = buildSkillBlock();

const prompt = [
  NO_BROWSE,
  "你是顶级分镜导演（对标 Linear.app / Vercel / Aftermagics 那种品位）。视频类型：产品 showreel。画幅：" + proj.aspect + "。",
  chunksBlock,
  concept ? `选定方向：${concept.title}（调性：${concept.tone}；关键词：${concept.words.join("、")}）` : "",
  "本片无配音（vo 留空字符串）。",
  "",
  "─".repeat(60),
  "【品味库（以下规则必须遵守）】",
  skills,
  "─".repeat(60),
  "",
  "请基于以上方向 + 料块 + 品味规则，产出 12~16 个分镜（showreel 快切节奏）。",
  "严格要求：",
  "1. 只输出一个 JSON 数组，不要解释、不要 Markdown，第一个字符必须是 [",
  "2. 分镜总数 12-16（不可少于 12，不可多于 16）",
  "3. durationSec 只允许 0.6~2.5 的数（首尾镜最多 3.5s；末镜必须 >= 1.5s 给用户\"静止记住\"时间）",
  "4. 全片主动效动词（primaryMotion）只允许 3 个从 {fade, slide, typewriter, scale, mask-reveal, blur, cross-fade} 中选，必须在每一镜声明使用哪一个",
  "5. 至多 1 个镜标记为 isDropShot=true（位置在 60-75% 时长处，密度必须是 minimal，动效可用 mask-reveal/scale）",
  "6. 每一镜声明 density: minimal(1-2元素) 或 medium(3-5元素)，禁止 dense；相邻两镜密度不能均为 medium",
  "7. onScreenText 每镜 <= 8 个词，末镜必须包含 CTA (如 URL / 按钮文字)",
  "8. 首镜 必须是 minimal，前 1.5s 留空拍（无元素入场）",
  "",
  "每一项形如：",
  '{"index": 1, "role": "钩子", "durationSec": 1.2, "onScreenText": "文字", "vo": "", "visual": {"type": "stat", "value": "24×"}, "refs": ["m1"], "primaryMotion": "fade", "density": "minimal", "isDropShot": false}',
  VISUAL_CATALOG,
  "refs 填该镜引用的料块 @id。index 从 1 连续递增。全部中文。",
].filter(Boolean).join("\n");

console.log(`[e2e] prompt: ${prompt.length} chars ≈ ${Math.round(prompt.length/4)} tokens`);
fs.writeFileSync("/tmp/vr_e2e_prompt.txt", prompt);
console.log("[e2e] prompt dumped: /tmp/vr_e2e_prompt.txt");

// ------ 调 OpenRouter (Anthropic Claude Sonnet) ------
const t0 = Date.now();
const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error("需 export OPENROUTER_API_KEY"); process.exit(1); }
const model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
console.log(`[e2e] 调 OpenRouter ${model}...`);

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://vibereel.local",
    "X-Title": "VibeReel B1 Test",
  },
  body: JSON.stringify({
    model,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  }),
});
const data = await res.json();
if (!res.ok) { console.error(`[e2e] ${res.status}:`, data?.error?.message || data); process.exit(2); }
const result = data.choices?.[0]?.message?.content || "";
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[e2e] 响应 ${dt}s | ${data.usage?.total_tokens} tok | \$${(data.usage?.cost || 0).toFixed(4)}`);
fs.writeFileSync("/tmp/vr_e2e_response.txt", result);

{

  // 提 JSON 数组
  let arr;
  try {
    const cleaned = result.replace(/^[^[]*/, "").replace(/[^\]]*$/, "");
    arr = JSON.parse(cleaned);
  } catch (e) {
    console.error("[e2e] JSON 解析失败:", e.message);
    console.log("原始输出:\n", result.slice(0, 800));
    process.exit(3);
  }

  console.log(`\n[e2e] 生成 ${arr.length} 镜:`);
  const totalDur = arr.reduce((s, x) => s + (Number(x.durationSec) || 0), 0);
  console.log(`[e2e] 总时长 ${totalDur.toFixed(1)}s`);
  for (const s of arr) {
    console.log(`  #${s.index} ${s.role} dur=${s.durationSec}s prim=${s.primaryMotion || "-"} den=${s.density || "-"} drop=${s.isDropShot ? "★" : ""} vis=${s.visual?.type} text="${(s.onScreenText || "").slice(0, 40)}"`);
  }

  // 硬约束校验
  console.log("\n[e2e] 硬约束校验:");
  const errs = [];
  if (arr.length < 12 || arr.length > 16) errs.push(`镜数 ${arr.length} 不在 12-16`);
  const last = arr[arr.length - 1];
  if (last.durationSec < 1.5) errs.push(`末镜 ${last.durationSec}s < 1.5s`);
  if (!last.onScreenText?.trim()) errs.push("末镜无文字");
  if (arr[0].density === "medium") errs.push("首镜 density=medium");
  const motions = arr.map(s => s.primaryMotion).filter(Boolean);
  const uniq = new Set(motions);
  if (uniq.size > 5) errs.push(`主动效 ${uniq.size} 种 > 5`);
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].density === "medium" && arr[i-1].density === "medium") { errs.push(`#${i}-${i+1} 均 medium`); break; }
  }
  const drops = arr.filter(s => s.isDropShot);
  if (drops.length > 1) errs.push(`isDropShot ${drops.length} > 1`);

  if (errs.length === 0) {
    console.log("  ✅ 全部通过！");
  } else {
    console.log("  ❌ 未通过：");
    for (const e of errs) console.log("    -", e);
  }
  console.log(`\n[e2e] 主动效基因: ${[...uniq].join(", ")} (${uniq.size} 种)`);
}
