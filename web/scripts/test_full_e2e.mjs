#!/usr/bin/env node
// 完整 e2e: 从 briefing 到 storyboard, 测 B3-B7 数据串通
// 用法: node scripts/test_full_e2e.mjs <projectId>

import fs from "node:fs";
import path from "node:path";

const projId = process.argv[2];
if (!projId) { console.error("需要 projectId"); process.exit(1); }
const projFile = path.resolve("data/projects", projId, "project.json");
const p = JSON.parse(fs.readFileSync(projFile, "utf8"));

const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error("需 OPENROUTER_API_KEY"); process.exit(1); }
const model = "anthropic/claude-sonnet-4.5";

async function callLLM(prompt) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vibereel.local",
      "X-Title": "VibeReel Full E2E",
    },
    body: JSON.stringify({
      model, max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const text = data.choices?.[0]?.message?.content || "";
  console.log(`  → ${dt}s | ${data.usage?.total_tokens} tok | $${(data.usage?.cost || 0).toFixed(4)}`);
  return text;
}

function extractJson(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = Math.min(...[t.indexOf("["), t.indexOf("{")].filter(i => i >= 0));
  const open = t[start], close = open === "[" ? "]" : "}";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  throw new Error("no valid JSON");
}

// ---- skill 加载 (复制自 skills.ts) ----
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

function skillBlock(step) {
  const sec = [];
  if (step === "storyboard" && templates.length) {
    sec.push("【可参考的分镜结构模板】");
    for (const t of templates) sec.push(`--- 模板: ${t.title} ---\n${t.body.split(/\n---\s*\n/)[0].slice(0, 2500)}`);
  }
  if (atomics.length) {
    sec.push("\n【必须遵守的品味规则】");
    for (const a of atomics) { const inst = extractAgentInst(a.body); if (inst) sec.push(`### ${a.title}\n${inst}`); }
  }
  if (step === "storyboard" && antis.length) {
    sec.push("\n【生成前必须自检的反例清单】");
    for (const q of antis) sec.push(q.body.split(/\n---\s*\n/)[0].slice(0, 3500));
  }
  return sec.join("\n\n");
}

// ---- styleBrief ----
const STYLE_PACKS = {
  "apple-keynote-light": { bg: "#FBFBFD", fg: "#1D1D1F", accent: "#0071E3", label: "Apple Keynote(极简大字·浅色)" },
  "editorial-saas": { bg: "#F4F2EC", fg: "#0B0B0C", accent: "#6C4CF6", label: "克制编辑感 SaaS" },
  "alibaba-premium": { bg: "#0a0a0a", fg: "#f5f5f5", accent: "#e8682a", label: "阿里高级感" },
};
function styleBrief(id) {
  const s = STYLE_PACKS[id] || { bg:"?",fg:"?",accent:"?",label:id };
  return `styleId: ${id}\nstyleName: ${s.label}\n硬约束色盘(必须基于这 3 个 hex 衍生 palette):\n  bg=${s.bg}\n  fg=${s.fg}\n  accent=${s.accent}`;
}

const NO_BROWSE = "重要约束: 离线无工具环境, 只能基于给定素材推断, 不要提浏览链接.";
const TYPE_LABEL = { showreel: "产品 showreel(快节奏、强钩子、卖点驱动)" };

// ---- material block ----
function materialBlock() {
  const m = p.material;
  if (!m?.chunks?.length) return "";
  return [
    `素材总览: ${m.summary}`,
    "【可引用料块(用 @id 指代)】",
    ...m.chunks.map(c => `@${c.id} [${c.kind}] ${c.title}: ${c.detail}`),
  ].join("\n");
}

// =======================================================
// Step 1: generateConcepts (测 B3 concept 阶段的 styleId + skill 注入)
// =======================================================
console.log("=".repeat(60));
console.log("STEP 1: 生成 concepts (测 B3 styleId 注入)");
console.log("=".repeat(60));
console.log(`选定 styleId: ${p.fourPack.styleId}`);

const conceptPrompt = [
  NO_BROWSE,
  `你是资深短视频创意总监. 视频类型: ${TYPE_LABEL[p.videoType]}.`,
  materialBlock(),
  `画幅: ${p.aspect}.`,
  "",
  "【用户已选定的风格 (palette 必须从下面 3 个 hex 衍生, 不得自创无关颜色)】",
  styleBrief(p.fourPack.styleId),
  "",
  "【品味库参考】",
  skillBlock("concept"),
  "",
  "好方向要点: 一个方向服务一个受众; 有钩子-证据-收束骨架; tone 可执行; 3 个关键词是视觉/情绪锚点.",
  "",
  "请产出 2-3 个差异化创意方向. 严格 JSON 数组输出, 第一个字符是 [.",
  '每项形如: {"title":"","tone":"","words":["","",""],"look":"...","palette":"...","pacing":"...","refs":["m1"]}',
  "额外硬约束:",
  "- palette 必须基于用户风格的 3 个 hex 衍生(可以描述'以 accent 为强调, bg 底色, fg 点缀' 等)",
  "- pacing 必须包含具体镜时长建议(如 '~0.8s/镜 快切' 或 '~1.5s/镜 中速')",
  "- look 必须包含 3 个主动效动词组合(如 'fade+slide+typewriter')",
  "全部中文.",
].filter(Boolean).join("\n");

fs.writeFileSync("/tmp/vr_e2e_concept_prompt.txt", conceptPrompt);
console.log(`prompt ${conceptPrompt.length} chars`);
const concepts = extractJson(await callLLM(conceptPrompt));
console.log(`\n生成 ${concepts.length} 个方向:`);
for (const [i, c] of concepts.entries()) {
  console.log(`\n[${i}] ${c.title}`);
  console.log(`    tone: ${c.tone}`);
  console.log(`    palette: ${c.palette}`);
  console.log(`    pacing: ${c.pacing}`);
  console.log(`    look: ${c.look}`);
  console.log(`    refs: ${JSON.stringify(c.refs)}`);
}

// 挑第 0 个作为 chosen
p.concepts = concepts;
p.chosenConcept = 0;
const chosen = concepts[0];

// =======================================================
// Step 2: generateStoryboard (测 B3+B4+B7 全字段传递)
// =======================================================
console.log("\n" + "=".repeat(60));
console.log("STEP 2: 生成 storyboard (测 B3 全字段 + B7 素材)");
console.log("=".repeat(60));

// 模拟一个 must-appear 素材
p.assets = [
  { id: "a1", kind: "logo", name: "多吉Logo.png", ref: "assets/a1.png", usage: "must-appear" },
  { id: "a2", kind: "image", name: "桌面截图.png", ref: "assets/a2.png", usage: "must-appear" },
  { id: "a3", kind: "color", name: "琥珀金", ref: "#F59E0B", usage: "tone-only" },
];

function assetSection() {
  const must = p.assets.filter(a => a.usage === "must-appear");
  const may = p.assets.filter(a => !a.usage || a.usage === "may-use");
  const tone = p.assets.filter(a => a.usage === "tone-only");
  const brief = a => `@${a.id} [${a.kind}] ${a.name}${a.note?`(${a.note})`:""}`;
  const s = [];
  if (must.length) s.push(["【必现素材(每一个必须在分镜中至少出现一镜, refs 里点名对应 @id)】", ...must.map(brief)].join("\n"));
  if (may.length) s.push(["【可参考素材】", ...may.map(brief)].join("\n"));
  if (tone.length) s.push(["【仅基调参考】", ...tone.map(brief)].join("\n"));
  return s.join("\n\n");
}

const VISUAL_CATALOG = `每个分镜给一个 visual, 从下列选:
- title/stat/kinetic-text/bullet-list/quote/section-card/term-define/cta/comparison/bg-only`;

const sbPrompt = [
  NO_BROWSE,
  `你是顶级分镜导演(对标 Linear.app / Vercel / Aftermagics). 视频类型: ${TYPE_LABEL[p.videoType]}. 画幅: ${p.aspect}.`,
  materialBlock(),
  assetSection(),
  [
    `选定方向: ${chosen.title}(调性: ${chosen.tone}; 关键词: ${chosen.words.join("、")})`,
    chosen.look ? `方向 look(分镜必须遵守画面描述): ${chosen.look}` : "",
    chosen.palette ? `方向 palette(分镜配色基因): ${chosen.palette}` : "",
    chosen.pacing ? `方向 pacing(分镜时长必须匹配): ${chosen.pacing}` : "",
    chosen.refs?.length ? `方向使用的料块: ${chosen.refs.join(", ")}` : "",
  ].filter(Boolean).join("\n"),
  `【用户选定风格(与 concept.palette 一致时双重锁定)】\n${styleBrief(p.fourPack.styleId)}`,
  "本片无配音(vo 留空字符串).",
  "",
  "─".repeat(60),
  "【品味库(以下规则必须遵守)】",
  skillBlock("storyboard"),
  "─".repeat(60),
  "",
  "请基于以上方向 + 料块 + 风格 + 品味规则, 产出 12-16 分镜(showreel 快切).",
  "严格要求:",
  "1. 只输出 JSON 数组",
  "2. 分镜总数 12-16",
  "3. durationSec 0.6-2.5 (首尾镜最多 3.5s; 末镜 >=1.5s)",
  "4. 全片 primaryMotion 只允许 3 个动词, 每镜声明",
  "5. 至多 1 个 isDropShot=true (60-75% 位置, minimal 密度)",
  "6. 每镜 density: minimal 或 medium, 相邻不能均 medium, 禁止 dense",
  "7. onScreenText <= 8 词, 末镜必须含 CTA",
  "8. 首镜必须 minimal, 前 1.5s 空拍",
  "9. 必现素材(a1, a2) 每一个必须在某镜的 refs 中出现至少一次",
  "",
  '每项形如: {"index":1,"role":"","durationSec":1.2,"onScreenText":"","vo":"","visual":{"type":"stat","value":"24×"},"refs":["m1","a1"],"primaryMotion":"fade","density":"minimal","isDropShot":false}',
  VISUAL_CATALOG,
  "index 从 1 连续递增. 全部中文.",
].filter(Boolean).join("\n");

fs.writeFileSync("/tmp/vr_e2e_sb_prompt.txt", sbPrompt);
console.log(`prompt ${sbPrompt.length} chars`);

const scenes = extractJson(await callLLM(sbPrompt));
console.log(`\n生成 ${scenes.length} 镜, 总时长 ${scenes.reduce((s,x)=>s+x.durationSec,0).toFixed(1)}s`);

// 打印精简版
for (const s of scenes) {
  const refs = s.refs?.join(",") || "";
  console.log(`  #${String(s.index).padStart(2)} ${s.role} dur=${s.durationSec}s prim=${s.primaryMotion} den=${s.density} drop=${s.isDropShot?"★":""} refs=[${refs}] text="${(s.onScreenText||"").slice(0,35)}"`);
}

// ---- 校验 B3-B7 联动 ----
console.log("\n" + "=".repeat(60));
console.log("B3-B7 联动校验");
console.log("=".repeat(60));
const checks = [];

// B3: palette 是否命中风格 hex
const styleHex = [STYLE_PACKS[p.fourPack.styleId].bg, STYLE_PACKS[p.fourPack.styleId].fg, STYLE_PACKS[p.fourPack.styleId].accent].map(h => h.toLowerCase());
const paletteHit = styleHex.some(h => (chosen.palette || "").toLowerCase().includes(h.replace("#","")));
checks.push({ name: "B3.1 concept.palette 提到用户风格 hex", pass: paletteHit, detail: `styleHex=${styleHex.join(",")} vs "${chosen.palette}"` });

// B3.2: pacing 有具体时长
checks.push({ name: "B3.2 concept.pacing 含时长数字", pass: /\d+[.。]?\d*\s*s|\d+\s*秒/.test(chosen.pacing), detail: chosen.pacing });

// B3.3: look 有动效动词
const verbList = ["fade","slide","typewriter","scale","mask","blur","cross-fade","cut","reveal"];
const verbHit = verbList.filter(v => (chosen.look || "").toLowerCase().includes(v));
checks.push({ name: "B3.3 concept.look 声明主动效基因", pass: verbHit.length >= 2, detail: `hits: ${verbHit.join(",")}` });

// B4: 每镜 primaryMotion 都存在
const motionSet = new Set(scenes.map(s => s.primaryMotion).filter(Boolean));
checks.push({ name: "B4.1 每镜 primaryMotion 都声明", pass: scenes.every(s => s.primaryMotion), detail: `unique: ${[...motionSet].join(",")}` });
checks.push({ name: "B4.2 主动效基因收敛 (<=5 种)", pass: motionSet.size <= 5, detail: `${motionSet.size} 种` });

// B7: 每个 must-appear 素材都被引用
const mustAssets = p.assets.filter(a => a.usage === "must-appear");
const allRefs = new Set(scenes.flatMap(s => s.refs || []));
for (const a of mustAssets) {
  checks.push({ name: `B7 必现素材 @${a.id}(${a.name}) 有入镜`, pass: allRefs.has(a.id), detail: allRefs.has(a.id) ? "命中" : "缺失!" });
}

// B6: concept.refs 里的料块是否至少部分被 storyboard 引用
if (chosen.refs?.length) {
  const conceptRefsHit = chosen.refs.filter(r => allRefs.has(r));
  checks.push({ name: "B6 concept.refs 部分承接到 storyboard", pass: conceptRefsHit.length > 0, detail: `${conceptRefsHit.length}/${chosen.refs.length} 命中` });
}

for (const c of checks) {
  console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  console.log(`     ${c.detail}`);
}

const passed = checks.filter(c=>c.pass).length;
console.log(`\n=== 总分: ${passed}/${checks.length} ===`);

// 保存 scenes 到 project.json (B4 primaryMotion 会随 scene 落盘)
p.scenes = scenes.map((o, i) => ({
  index: i + 1,
  role: String(o.role || ""),
  durationSec: Math.max(0.5, Number(o.durationSec) || 4),
  onScreenText: String(o.onScreenText || ""),
  vo: "",
  renderer: "remotion",
  visual: o.visual || { type: "kinetic-text" },
  status: "pending",
  rev: 0,
  revisions: [],
  refs: Array.isArray(o.refs) ? o.refs.map(String) : [],
  primaryMotion: o.primaryMotion,
  density: o.density,
  isDropShot: o.isDropShot === true,
}));
p.stage = "storyboard";
p.awaitingGate = "storyboard";
p.outputs = {};
fs.writeFileSync(projFile, JSON.stringify(p, null, 2));
console.log(`\n[e2e] project 已保存, 下一步可跑 render_and_assemble.mjs`);
