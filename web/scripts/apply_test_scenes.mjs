#!/usr/bin/env node
// 把 /tmp/vr_e2e_response.txt 的 storyboard 应用到指定项目,准备渲染。
// 用法: node scripts/apply_test_scenes.mjs <projectId>

import fs from "node:fs";
import path from "node:path";

const projId = process.argv[2];
if (!projId) { console.error("需要 projectId"); process.exit(1); }
const projFile = path.resolve("data/projects", projId, "project.json");
const proj = JSON.parse(fs.readFileSync(projFile, "utf8"));

const raw = fs.readFileSync("/tmp/vr_e2e_response.txt", "utf8");
const cleaned = raw.replace(/^[^[]*/, "").replace(/[^\]]*$/, "");
const arr = JSON.parse(cleaned);

const scenes = arr.slice(0, 16).map((o, i) => ({
  index: i + 1,
  role: String(o.role || "镜头"),
  durationSec: Math.max(0.5, Number(o.durationSec) || 4),
  onScreenText: String(o.onScreenText || ""),
  vo: "",
  renderer: "remotion",
  visual: o.visual && typeof o.visual === "object" ? o.visual : { type: "kinetic-text" },
  status: "pending",
  rev: 0,
  revisions: [],
  refs: Array.isArray(o.refs) ? o.refs.map(String) : [],
  primaryMotion: o.primaryMotion,
  density: o.density,
  isDropShot: o.isDropShot === true,
}));

proj.scenes = scenes;
proj.stage = "storyboard";
proj.awaitingGate = "storyboard";
proj.error = null;
// 清掉旧的输出/scene 文件路径,让重新渲染
proj.outputs = {};
for (const s of proj.scenes) { s.mp4 = undefined; s.draftImage = undefined; }

fs.writeFileSync(projFile, JSON.stringify(proj, null, 2));
console.log(`✓ 已写入 ${scenes.length} 镜到 ${projId}`);
console.log("下一步: 启动 web dev, 打开项目, 点'确认分镜 → 渲染'");
