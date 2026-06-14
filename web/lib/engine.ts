// ============================================================
// 真实渲染桥 —— 复用 vibemotion 引擎的 Remotion 渲染（不重写、不绕过引擎）。
// VibeReel 把自己的状态翻译成引擎的 config.json + storyboard.json + STATE.json，
// 落到 data/projects/<id>/engine/，再调 `vibemotion render --chunk N` 出真片段。
//
// 边界（见 docs/prd/06-引擎边界）：remotion 段走引擎；assemble 仍由 VibeReel ffmpeg 拼。
// 一镜 = 一个 chunk（与引擎样例一致：s01→chunk0）。
// 开关：VR_RENDER=engine（默认）| stub ；VIBEMOTION_BIN 指向引擎入口。
// ============================================================

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  Aspect,
  ProjectMeta,
  SceneMeta,
  SceneVisual,
  VideoType,
} from "@/lib/types";
import { projDir, scenesDir } from "@/lib/store";
import { resolveStyle } from "@/lib/library";

export function engineBin(): string {
  return (
    process.env.VIBEMOTION_BIN ||
    path.join(os.homedir(), ".claude/skills/vibe-motion-video/bin/vibemotion.mjs")
  );
}
function engineRepoRoot(): string {
  // bin/vibemotion.mjs → 仓库根
  return path.resolve(path.dirname(engineBin()), "..");
}
export function engineAvailable(): boolean {
  try {
    return fs.existsSync(engineBin());
  } catch {
    return false;
  }
}
function engineProjDir(id: string): string {
  return path.join(projDir(id), "engine");
}

// ---- aspect → 引擎平台 / 画幅 / 分辨率 ----
function aspectSpec(aspect: Aspect): {
  platform: string;
  aspectRatio: string;
  resolution: { width: number; height: number };
} {
  switch (aspect) {
    case "9:16":
      return { platform: "douyin", aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } };
    case "1:1":
      return { platform: "generic", aspectRatio: "1:1", resolution: { width: 1080, height: 1080 } };
    case "16:9":
    default:
      return { platform: "generic", aspectRatio: "16:9", resolution: { width: 1920, height: 1080 } };
  }
}

const OUTPUT_TYPE: Record<VideoType, string> = {
  showreel: "showreel",
  popsci: "knowledge-popsci",
  teaching: "knowledge-explainer",
};

const DEFAULT_FONTS = {
  display: '"PingFang SC", "Source Han Sans SC", "Helvetica Neue", Arial, sans-serif',
  body: '"PingFang SC", "Source Han Sans SC", "Helvetica Neue", Arial, sans-serif',
};

// 风格 → 引擎 config.style：内置风格给 preset（引擎读 presets/styles/<id>.json 取全套），
// 自定义风格直接喂合并后的 palette/fonts（引擎对缺 preset 容错）。
function styleConfig(styleId: string) {
  const pack = resolveStyle(styleId);
  const builtin = pack && !pack.custom;
  const palette = pack
    ? { bg: pack.bg, fg: pack.fg, accent: [pack.accent] }
    : { bg: "#0B0B0F", fg: "#FFFFFF", accent: ["#5B9BFF"] };
  const fonts = pack?.font
    ? { display: pack.font, body: pack.font }
    : DEFAULT_FONTS;
  return {
    ...(builtin ? { preset: styleId } : {}),
    palette,
    fonts,
    motion: "balanced" as const,
  };
}

// ---- 视觉模板：用 scene.visual（若 agent 给了且合法），否则启发式推断 + 兜底补全 ----
const VALID_VISUAL = new Set<SceneVisual["type"]>([
  "title", "kinetic-text", "bullet-list", "stat", "quote",
  "section-card", "term-define", "cta", "comparison", "bg-only",
]);

function splitItems(text: string): string[] {
  return text
    .split(/[、，,;；\n|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function heuristicVisual(scene: SceneMeta): SceneVisual {
  const txt = scene.onScreenText || "";
  const tag = `${scene.role || ""} ${txt}`;
  if (scene.index === 1) return { type: "title" };
  if (/收束|结尾|行动|关注|下载|开始|了解更多|cta|call to action/i.test(tag)) {
    return { type: "cta" };
  }
  const num = txt.match(/\d[\d.,]*\s*[%×xX倍kKwW万亿+]?/);
  if (num) return { type: "stat", value: num[0].trim() };
  if (/对比|vs\b|versus|之前|之后|前后/i.test(tag)) {
    const items = splitItems(txt);
    if (items.length >= 2) return { type: "comparison", items };
  }
  const items = splitItems(txt);
  if (items.length >= 2) return { type: "bullet-list", items };
  if (/["“「『]/.test(txt)) return { type: "quote" };
  return { type: "kinetic-text" };
}

// 把（可能不完整的）visual 规整成引擎能直接渲的合法形状。
function coerceVisual(scene: SceneMeta): SceneVisual {
  let v: SceneVisual =
    scene.visual && VALID_VISUAL.has(scene.visual.type)
      ? { ...scene.visual }
      : heuristicVisual(scene);

  const txt = scene.onScreenText || "";
  switch (v.type) {
    case "stat":
      if (!v.value || !/\d/.test(v.value)) {
        const num = txt.match(/\d[\d.,]*\s*[%×xX倍kKwW万亿+]?/);
        if (num) v.value = num[0].trim();
        else v = { type: "kinetic-text" }; // 没数字就别用 stat
      }
      break;
    case "bullet-list":
    case "comparison": {
      const items = Array.isArray(v.items) && v.items.length ? v.items : splitItems(txt);
      if (items.length >= 2) v.items = items.slice(0, 4);
      else v = { type: "kinetic-text" };
      break;
    }
    case "section-card":
      if (!v.chapter?.title) v.chapter = { num: v.chapter?.num, title: txt || scene.role };
      break;
    case "term-define":
      if (!v.term) v.term = txt || scene.role;
      if (!v.definition) v.definition = scene.vo || txt;
      break;
    default:
      break;
  }
  return v;
}

// ---- 生成引擎 IR ----
function buildScenes(p: ProjectMeta): {
  scenes: Array<Record<string, unknown>>;
  chunks: Array<Record<string, unknown>>;
  total: number;
} {
  const ordered = [...p.scenes].sort((a, b) => a.index - b.index);
  const scenes: Array<Record<string, unknown>> = [];
  const chunks: Array<Record<string, unknown>> = [];
  let cursor = 0;
  ordered.forEach((s, i) => {
    const id = `s${String(i + 1).padStart(2, "0")}`;
    const dur = Math.max(1, Math.round(s.durationSec || 4));
    scenes.push({
      id,
      startSec: cursor,
      durationSec: dur,
      purpose: s.role || "镜头",
      vo: s.vo || "",
      onScreenText: s.onScreenText || "",
      visual: coerceVisual(s),
      transitionIn: i === 0 ? "fade" : "fade",
    });
    chunks.push({
      index: i, // 一镜一段（与引擎样例一致）
      sceneIds: [id],
      startSec: cursor,
      durationSec: dur,
      status: "pending",
    });
    cursor += dur;
  });
  return { scenes, chunks, total: cursor };
}

function buildConfig(p: ProjectMeta, total: number): Record<string, unknown> {
  const spec = aspectSpec(p.aspect);
  return {
    projectName: p.title,
    outputType: OUTPUT_TYPE[p.videoType],
    platform: spec.platform,
    aspectRatio: spec.aspectRatio,
    resolution: spec.resolution,
    fps: 30,
    durationTargetSec: Math.max(3, total),
    chunkSec: 15,
    language: "zh-CN",
    style: styleConfig(p.fourPack.styleId),
    voiceover: { enabled: false, provider: "none" }, // POC 暂不接 TTS
    captions: { enabled: false, style: "line", burnIn: false },
  };
}

// 把引擎项目目录写好（每次渲染前重建 json，确保编辑后立即反映；不动 06_renders）。
function ensureEngineProject(p: ProjectMeta): {
  dir: string;
  scenes: Array<Record<string, unknown>>;
} {
  const dir = engineProjDir(p.projectId);
  for (const d of ["00_input", "05_assets", "05_assets/audio", "05_assets/captions", "06_renders", "07_final"]) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  const { scenes, chunks, total } = buildScenes(p);
  const config = buildConfig(p, total);
  const concept =
    p.chosenConcept != null && p.concepts[p.chosenConcept]
      ? p.concepts[p.chosenConcept]
      : undefined;
  const storyboard = {
    concept: {
      id: "c01",
      hook: concept?.title || p.title,
      angle: concept?.tone || "",
      logline: concept?.look || "",
    },
    fps: 30,
    resolution: aspectSpec(p.aspect).resolution,
    totalDurationSec: total,
    scenes,
    chunks,
  };
  const state = {
    name: p.title,
    slug: p.projectId,
    createdAt: p.createdAt,
    updatedAt: new Date().toISOString(),
    phase: "render",
    steps: {
      ingest: "done", brief: "done", config: "done", concept: "done",
      script: "done", storyboard: "done", voice: "pending",
      render: "active", assemble: "pending", export: "pending",
    },
    chunks,
  };
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(dir, "storyboard.json"), JSON.stringify(storyboard, null, 2));
  fs.writeFileSync(path.join(dir, "STATE.json"), JSON.stringify(state, null, 2));
  return { dir, scenes };
}

function runEngineRender(projDirAbs: string, chunkIndex: number): Promise<void> {
  const args = [
    engineBin(),
    "render",
    "--chunk",
    String(chunkIndex),
    "--project",
    projDirAbs,
    "--force",
  ];
  return new Promise<void>((resolve, reject) => {
    const child = spawn("node", args, {
      cwd: engineRepoRoot(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => reject(new Error(`无法启动 vibemotion: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const tail = (stderr || stdout).trim().slice(-600);
      reject(new Error(`引擎渲染失败（退出码 ${code}）：${tail}`));
    });
  });
}

// 渲染单镜：写引擎项目 → render --chunk(index-1) → 拷 chunk-N.mp4 到 VibeReel scenes/scene-i.mp4。
export async function renderSceneViaEngine(
  p: ProjectMeta,
  scene: SceneMeta
): Promise<string> {
  if (!engineAvailable()) {
    throw new Error(`未找到 vibemotion 引擎（VIBEMOTION_BIN=${engineBin()}）`);
  }
  const { dir } = ensureEngineProject(p);
  const chunkIndex = scene.index - 1;
  await runEngineRender(dir, chunkIndex);

  const out = path.join(dir, "06_renders", `chunk-${chunkIndex}.mp4`);
  if (!fs.existsSync(out)) {
    throw new Error(`引擎未产出 chunk-${chunkIndex}.mp4`);
  }
  fs.mkdirSync(scenesDir(p.projectId), { recursive: true });
  const rel = `scenes/scene-${scene.index}.mp4`;
  fs.copyFileSync(out, path.join(scenesDir(p.projectId), `scene-${scene.index}.mp4`));
  return rel;
}
