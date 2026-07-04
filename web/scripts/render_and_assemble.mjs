#!/usr/bin/env node
// 用当前 project.json 直接跑引擎渲染 + ffmpeg 拼合。绕开 next 服务。
// 用法: node scripts/render_and_assemble.mjs <projectId>
//
// 步骤:
// 1) 用 engine.ts 的写盘逻辑生成 engine/ 目录 (config/storyboard/STATE)
// 2) 依次 spawn vibemotion render --chunk N
// 3) 拷 chunk-N.mp4 到 scenes/scene-(N+1).mp4
// 4) ffmpeg concat 拼 outputs/final.mp4

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const projId = process.argv[2];
if (!projId) { console.error("需要 projectId"); process.exit(1); }
const projDir = path.resolve("data/projects", projId);
const projFile = path.join(projDir, "project.json");
const p = JSON.parse(fs.readFileSync(projFile, "utf8"));
console.log(`[render] project ${projId} | ${p.scenes.length} scenes`);

// ---- 复制 engine.ts 的写盘逻辑 (简化) ----
function aspectSpec(a) {
  if (a === "9:16") return { platform: "douyin", aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } };
  if (a === "1:1") return { platform: "generic", aspectRatio: "1:1", resolution: { width: 1080, height: 1080 } };
  return { platform: "generic", aspectRatio: "16:9", resolution: { width: 1920, height: 1080 } };
}

const spec = aspectSpec(p.aspect);
const engDir = path.join(projDir, "engine");
for (const d of ["00_input","05_assets","05_assets/audio","05_assets/captions","06_renders","07_final"]) {
  fs.mkdirSync(path.join(engDir, d), { recursive: true });
}

const scenesArr = [...p.scenes].sort((a,b)=>a.index-b.index);
let cursor = 0;
const engScenes = [], chunks = [];
scenesArr.forEach((s, i) => {
  const id = `s${String(i+1).padStart(2,"0")}`;
  const dur = Math.max(0.5, s.durationSec || 4);
  const engPurpose = (s.onScreenText || "").trim() ? s.role || "" : "";
  const pm = (s.primaryMotion || "").toLowerCase();
  const transitionIn = i === 0 ? "fade" : (pm === "slide" ? "slide" : pm === "cross-fade" ? "cross-fade" : "fade");
  engScenes.push({
    id, startSec: cursor, durationSec: dur,
    purpose: engPurpose, vo: s.vo || "",
    onScreenText: s.onScreenText || "",
    // 把 AI 可能写进 value/subtitle 的描述性文本清掉（防“镜头描述”上屏）
    visual: (() => {
      if (!(s.onScreenText||"").trim()) return { type: "bg-only" };
      const v = s.visual ? { ...s.visual } : { type: "kinetic-text" };
      const desc = /实录|实拍|背景|画中画|镜头|画面|取景|处理|镜射|模拟|叠加|重叠|悬浮|字色|字体|充|无内容|红色|蓝色|颜色/;
      const clean = t => (typeof t === 'string' && !desc.test(t)) ? t : undefined;
      if (v.subtitle) v.subtitle = clean(v.subtitle);
      if (v.value) {
        if (v.type === 'stat') { if (!/\d/.test(v.value) || v.value.length > 12) v.value = undefined; }
        else v.value = undefined;
      }
      if (v.term) v.term = clean(v.term);
      if (v.definition) v.definition = clean(v.definition);
      if (v.chapter?.title) v.chapter = { ...v.chapter, title: clean(v.chapter.title) };
      return v;
    })(),
    transitionIn,
    primaryMotion: s.primaryMotion || null,
    density: s.density || null,
    isDropShot: s.isDropShot === true,
  });
  chunks.push({ index: i, sceneIds: [id], startSec: cursor, durationSec: dur, status: "pending" });
  cursor += dur;
});

// motion 从 pacing 推断
const pacing = ((p.concepts?.[p.chosenConcept ?? 0]?.pacing) || "").toLowerCase();
const avgDur = scenesArr.length ? scenesArr.reduce((s,x)=>s+x.durationSec,0)/scenesArr.length : 1.5;
let motion = "balanced";
if (/快切|punchy|高密/.test(pacing) || avgDur < 1.2) motion = "punchy";
else if (/舒缓|克制|淡入淡出/.test(pacing) || avgDur > 2.2) motion = "calm";
// 从引擎预设读真实 palette (不能写硬黑底白字!)
const enginePresetPath = path.resolve(os.homedir(), '.claude/skills/vibe-motion-video/presets/styles', `${p.fourPack.styleId}.json`);
let palette = {bg:"#0B0B0F",fg:"#FFF",accent:["#5B9BFF"]};
let fonts = {display:'"PingFang SC"',body:'"PingFang SC"'};
if (fs.existsSync(enginePresetPath)) {
  const preset = JSON.parse(fs.readFileSync(enginePresetPath, 'utf8'));
  if (preset.palette) palette = preset.palette;
  if (preset.fonts) fonts = preset.fonts;
  console.log(`[render] palette from preset: bg=${palette.bg} fg=${palette.fg} accent=${palette.accent?.[0]}`);
} else {
  console.warn(`[render] preset not found: ${enginePresetPath}, 使用内置默认`);
}
const style = { preset: p.fourPack?.styleId, palette, fonts, motion };

const config = {
  projectName: p.title, outputType: "showreel", platform: spec.platform,
  aspectRatio: spec.aspectRatio, resolution: spec.resolution, fps: 30,
  durationTargetSec: cursor, chunkSec: 15, language: "zh-CN",
  style, voiceover: {enabled:false,provider:"none"},
  captions: {enabled:false,style:"line",burnIn:false},
};

const concept = p.concepts?.[p.chosenConcept ?? 0];
const storyboard = {
  concept: { id: "c01", hook: concept?.title || p.title, angle: concept?.tone || "", logline: concept?.look || "" },
  fps: 30, resolution: spec.resolution, totalDurationSec: cursor,
  scenes: engScenes, chunks,
};
const state = {
  name: p.title, slug: projId, createdAt: p.createdAt, updatedAt: new Date().toISOString(),
  phase: "render", steps: {ingest:"done",brief:"done",config:"done",concept:"done",script:"done",storyboard:"done",voice:"pending",render:"active",assemble:"pending",export:"pending"},
  chunks,
};
fs.writeFileSync(path.join(engDir,"config.json"), JSON.stringify(config,null,2));
fs.writeFileSync(path.join(engDir,"storyboard.json"), JSON.stringify(storyboard,null,2));
fs.writeFileSync(path.join(engDir,"STATE.json"), JSON.stringify(state,null,2));
console.log(`[render] wrote engine files, total ${cursor.toFixed(1)}s`);

// ---- 逐镜渲染 ----
const engineBin = path.join(os.homedir(),".claude/skills/vibe-motion-video/bin/vibemotion.mjs");
const engineRoot = path.resolve(path.dirname(engineBin), "..");
const scenesDir = path.join(projDir, "scenes");
fs.mkdirSync(scenesDir, { recursive: true });

for (let i = 0; i < scenesArr.length; i++) {
  const chunkIdx = i;
  const t0 = Date.now();
  process.stdout.write(`[render] 镜 ${i+1}/${scenesArr.length} ... `);
  await new Promise((resolve, reject) => {
    const child = spawn("node", [engineBin, "render", "--chunk", String(chunkIdx), "--project", engDir, "--force"],
      { cwd: engineRoot, stdio: ["ignore","pipe","pipe"] });
    let err = "";
    child.stderr.on("data", d => err += d.toString());
    child.stdout.on("data", () => {}); // 静默 stdout
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`chunk ${chunkIdx} exit ${code}: ${err.slice(-300)}`));
    });
  });
  const src = path.join(engDir, "06_renders", `chunk-${chunkIdx}.mp4`);
  const dst = path.join(scenesDir, `scene-${i+1}.mp4`);
  if (!fs.existsSync(src)) { console.log(`FAIL (no output)`); process.exit(3); }
  fs.copyFileSync(src, dst);
  scenesArr[i].mp4 = `scenes/scene-${i+1}.mp4`;
  scenesArr[i].status = "await_review";
  const dt = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`ok ${dt}s`);
}

// ---- ffmpeg concat 拼合 ----
console.log(`[render] ffmpeg concat...`);
const outDir = path.join(projDir, "outputs");
fs.mkdirSync(outDir, { recursive: true });
const listFile = path.join(outDir, "_concat.txt");
fs.writeFileSync(listFile, scenesArr.map(s => `file '${path.resolve(projDir, s.mp4)}'`).join("\n"));

const finalOut = path.join(outDir, "final.mp4");
const r = spawnSync("ffmpeg", ["-y","-f","concat","-safe","0","-i",listFile,"-c","copy",finalOut], { encoding:"utf8" });
if (r.status !== 0) {
  // 尝试重编码
  console.log("[render] concat copy 失败,重编码...");
  const r2 = spawnSync("ffmpeg", ["-y","-f","concat","-safe","0","-i",listFile,"-c:v","libx264","-preset","fast","-pix_fmt","yuv420p",finalOut], { encoding:"utf8" });
  if (r2.status !== 0) { console.error(r2.stderr?.slice(-500)); process.exit(4); }
}

// 更新 project.json
p.outputs = { mp4: "outputs/final.mp4" };
p.stage = "done";
p.scenes = scenesArr;
fs.writeFileSync(projFile, JSON.stringify(p, null, 2));
console.log(`[render] done → ${finalOut}`);
