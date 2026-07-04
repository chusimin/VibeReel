#!/usr/bin/env node
// 单测 skills.ts 加载器：加载 skill md → 输出 skill block
// 用 pure ESM,不依赖 @/ path alias

import fs from "node:fs";
import path from "node:path";

// -------- 复制 skills.ts 核心逻辑（避免 tsc alias 复杂度） --------
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: text };
  const raw = m[1];
  const fm = {};
  let currentListKey = null;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (currentListKey && /^\s+-\s/.test(line)) {
      const val = line.replace(/^\s+-\s+/, "").trim();
      const arr = fm[currentListKey] || [];
      arr.push(val);
      fm[currentListKey] = arr;
      continue;
    }
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

function loadDir(dir, kind) {
  if (!fs.existsSync(dir)) return [];
  const docs = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const full = path.join(dir, name);
    const text = fs.readFileSync(full, "utf8");
    const { fm, body } = parseFrontmatter(text);
    docs.push({ slug: name.replace(/\.md$/, ""), kind, path: full, fm, body,
      title: fm.title || name });
  }
  return docs;
}

function extractAgentInstructions(body) {
  const re = /##\s*(?:Agent\s*使用指令|Agent instructions?|AI 使用指令)[^\n]*\n([\s\S]*?)(?=\n##\s+|\n---\s*$|$)/i;
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

const root = path.resolve("..", "docs", "skills");
console.log("[test] skills root:", root);

const atomics = loadDir(path.join(root, "atomic"), "atomic");
const templates = loadDir(path.join(root, "templates"), "template");
const antis = loadDir(path.join(root, "antipatterns"), "antipattern");

console.log(`[test] loaded: ${atomics.length} atomic, ${templates.length} templates, ${antis.length} antipatterns`);

// 组装 skill block（模拟 agent.ts 会看到的）
const sections = [];

if (templates.length > 0) {
  sections.push("【可参考的分镜结构模板（templates）】");
  for (const t of templates) {
    const excerpt = t.body.split(/\n---\s*\n/)[0].slice(0, 2500);
    sections.push(`--- 模板: ${t.title} ---\n${excerpt}`);
  }
}

if (atomics.length > 0) {
  sections.push("\n【必须遵守的品味规则（atomic skills）】");
  for (const a of atomics) {
    const inst = extractAgentInstructions(a.body);
    if (inst) sections.push(`### ${a.title}\n${inst}`);
    else sections.push(`### ${a.title}\n(见 docs/skills/atomic/${a.slug}.md)`);
  }
}

if (antis.length > 0) {
  sections.push("\n【生成前必须自检的反例清单】");
  for (const p of antis) {
    const excerpt = p.body.split(/\n---\s*\n/)[0].slice(0, 3500);
    sections.push(excerpt);
  }
}

const block = sections.join("\n\n");
console.log(`[test] skill block: ${block.length} chars ≈ ${Math.round(block.length / 4)} tokens`);
console.log("---");
console.log(block.slice(0, 1200));
console.log("...(truncated)");

// 校验每条 atomic 都有 Agent 使用指令
console.log("\n[audit] 原子 skill 是否都含 Agent 使用指令：");
for (const a of atomics) {
  const inst = extractAgentInstructions(a.body);
  console.log(`  ${inst ? "✓" : "✗"} ${a.slug}${inst ? "" : " (缺 Agent 使用指令!)"}`);
}
