import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Aspect, ProjectMeta, Renderer, SceneMeta } from "@/lib/types";
import { draftsDir, outputsDir, scenesDir } from "@/lib/store";
import { renderSceneViaEngine } from "@/lib/engine";

function dims(aspect: Aspect): { w: number; h: number } {
  switch (aspect) {
    case "9:16":
      return { w: 720, h: 1280 };
    case "1:1":
      return { w: 720, h: 720 };
    case "16:9":
    default:
      return { w: 1280, h: 720 };
  }
}

// 按 renderer 给一个底色相，再按 index 微调亮度，保证每镜可分辨。
const RENDERER_HUE: Record<Renderer, number> = {
  remotion: 210, // 蓝
  generative: 280, // 紫
  lottie: 30, // 橙
  "still-kenburns": 150, // 绿
};

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sceneColor(scene: SceneMeta): string {
  const base = RENDERER_HUE[scene.renderer] ?? 210;
  const hue = (base + scene.index * 12) % 360;
  const light = 0.42 + ((scene.index % 4) * 0.06); // 0.42~0.6
  return hslToHex(hue, 0.55, light);
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(new Error(`无法启动 ffmpeg: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}: ${stderr.trim().slice(-500)}`));
    });
  });
}

function ffmpegBin(): string {
  return process.env.FFMPEG_BIN || "ffmpeg";
}

// 纯色 PNG 草图（不使用 drawtext，文字由前端叠加）。返回相对路径。
export async function makeDraft(
  p: ProjectMeta,
  scene: SceneMeta
): Promise<string> {
  const { w, h } = dims(p.aspect);
  const hex = sceneColor(scene);
  const rel = `drafts/scene-${scene.index}.png`;
  const abs = path.join(draftsDir(p.projectId), `scene-${scene.index}.png`);
  fs.mkdirSync(draftsDir(p.projectId), { recursive: true });
  await run(ffmpegBin(), [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x${hex}:s=${w}x${h}`,
    "-frames:v",
    "1",
    abs,
  ]);
  return rel;
}

// 单镜正片段。VR_RENDER=engine（默认）→ 走 vibemotion 引擎真渲；stub → ffmpeg 纯色占位。
export async function renderScene(
  p: ProjectMeta,
  scene: SceneMeta
): Promise<string> {
  const mode = (process.env.VR_RENDER || "engine").toLowerCase();
  if (mode === "engine") {
    return renderSceneViaEngine(p, scene);
  }
  return renderSceneStub(p, scene);
}

// 占位渲染（旧实现）：纯色 mp4，时长 = durationSec。返回相对路径。
async function renderSceneStub(
  p: ProjectMeta,
  scene: SceneMeta
): Promise<string> {
  const { w, h } = dims(p.aspect);
  const hex = sceneColor(scene);
  const dur = Math.max(1, Math.round(scene.durationSec || 4));
  const rel = `scenes/scene-${scene.index}.mp4`;
  const abs = path.join(scenesDir(p.projectId), `scene-${scene.index}.mp4`);
  fs.mkdirSync(scenesDir(p.projectId), { recursive: true });
  await run(ffmpegBin(), [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x${hex}:s=${w}x${h}:d=${dur}`,
    "-r",
    "30",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    abs,
  ]);
  return rel;
}

// 拼接所有已渲染分镜为 outputs/final.mp4。优先 -c copy，失败退化重编码。返回相对路径。
export async function assemble(p: ProjectMeta): Promise<string> {
  const sceneFiles = [...p.scenes]
    .sort((a, b) => a.index - b.index)
    .map((s) => path.join(scenesDir(p.projectId), `scene-${s.index}.mp4`))
    .filter((f) => fs.existsSync(f));

  if (sceneFiles.length === 0) {
    throw new Error("没有可拼接的分镜片段");
  }

  fs.mkdirSync(outputsDir(p.projectId), { recursive: true });
  const rel = "outputs/final.mp4";
  const outAbs = path.join(outputsDir(p.projectId), "final.mp4");

  // concat demuxer list 文件（放临时目录，绝对路径 + -safe 0）
  const listFile = path.join(
    os.tmpdir(),
    `vr-concat-${p.projectId}-${Date.now()}.txt`
  );
  const listContent = sceneFiles
    .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listFile, listContent);

  try {
    try {
      await run(ffmpegBin(), [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listFile,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outAbs,
      ]);
    } catch {
      // 退化：重编码
      await run(ffmpegBin(), [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listFile,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outAbs,
      ]);
    }
  } finally {
    try {
      fs.unlinkSync(listFile);
    } catch {
      /* ignore */
    }
  }

  return rel;
}
