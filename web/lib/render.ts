import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Aspect, Concept, ProjectMeta, Renderer, SceneMeta } from "@/lib/types";
import { draftsDir, outputsDir, scenesDir } from "@/lib/store";
import { renderSceneViaEngine } from "@/lib/engine";
import { generateImage } from "@/lib/image";

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

// ImageMagick 7 可执行名（命令是 `magick`）。可用 MAGICK_BIN 覆盖。
function magickBin(): string {
  return process.env.MAGICK_BIN || "magick";
}

// ---- magick 是否可用（核心版 ffmpeg 无 drawtext，字幕改走 magick 渲 PNG）。探一次缓存。----
const gMagick = globalThis as unknown as { __vrMagick?: boolean };
function magickAvailable(): boolean {
  if (typeof gMagick.__vrMagick === "boolean") return gMagick.__vrMagick;
  let ok = false;
  try {
    const out = spawnSync(magickBin(), ["-version"], {
      encoding: "utf8",
      timeout: 10000,
    });
    ok = out.status === 0 && /ImageMagick/i.test(out.stdout || "");
  } catch {
    ok = false;
  }
  gMagick.__vrMagick = ok;
  return ok;
}

// 画幅 → 出图取向描述（喂给图像模型，约束竖/横/方构图）。
function aspectGuidance(aspect: Aspect): string {
  switch (aspect) {
    case "9:16":
      return "vertical 9:16 portrait composition, full-frame mobile-friendly framing";
    case "1:1":
      return "square 1:1 composition, centered subject";
    case "16:9":
    default:
      return "wide 16:9 landscape cinematic composition";
  }
}

// 取当前选中的创意方向（chosenConcept 索引；缺省退首个；都没有则 null）。
function selectedConcept(p: ProjectMeta): Concept | null {
  if (
    p.chosenConcept != null &&
    p.chosenConcept >= 0 &&
    p.chosenConcept < p.concepts.length
  ) {
    return p.concepts[p.chosenConcept];
  }
  return p.concepts[0] ?? null;
}

// 把 scene + 选中 concept + 风格拼成一段英文图像 prompt。
// 要点：concept.look（画面方向）+ scene.role + onScreenText 主题 + palette/风格倾向 +
//       画幅取向；并明确要求图里"不要有任何文字/字母/水印"（屏幕文字后续单独叠）。
function buildDraftPrompt(p: ProjectMeta, scene: SceneMeta): string {
  const c = selectedConcept(p);
  const parts: string[] = [];

  // 画面方向（最重要）：concept.look。
  if (c?.look) parts.push(c.look.trim());

  // 这一镜的叙事角色 + 屏幕文字承载的主题（作为画面"讲什么"的线索，但不入画为文字）。
  const roleBits: string[] = [];
  if (scene.role) roleBits.push(`scene role: ${scene.role.trim()}`);
  if (scene.onScreenText) {
    roleBits.push(`thematically about "${scene.onScreenText.trim()}"`);
  }
  if (roleBits.length) parts.push(roleBits.join(", "));

  // 配色 / 调性 / 风格倾向。
  if (c?.palette) parts.push(`color palette: ${c.palette.trim()}`);
  if (c?.tone) parts.push(`mood: ${c.tone.trim()}`);
  if (p.fourPack.styleId) parts.push(`visual style ref: ${p.fourPack.styleId}`);

  // 画幅取向。
  parts.push(aspectGuidance(p.aspect));

  // 质量 + 硬约束：无文字/字母/水印（屏幕文字后续叠）。
  parts.push(
    "high quality, cohesive lighting, clean professional look, no text, no letters, no words, no captions, no watermark, no logo, no UI"
  );

  return parts.filter(Boolean).join(". ");
}

// 分镜草图：优先用 codex 出真图；VR_IMAGE=none / 失败 / 超时 → 退回 ffmpeg 纯色兜底。
// 返回相对路径（不变），scene.draftImage 不变。
export async function makeDraft(
  p: ProjectMeta,
  scene: SceneMeta
): Promise<string> {
  const rel = `drafts/scene-${scene.index}.png`;
  const abs = path.join(draftsDir(p.projectId), `scene-${scene.index}.png`);
  fs.mkdirSync(draftsDir(p.projectId), { recursive: true });

  try {
    const prompt = buildDraftPrompt(p, scene);
    await generateImage(prompt, abs);
    return rel;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[makeDraft] 第 ${scene.index} 镜出图失败，退回纯色兜底: ${msg}`
    );
    await makeDraftFallback(p, scene, abs);
    return rel;
  }
}

// 兜底：纯色 PNG 草图（旧实现，不使用 drawtext，文字由前端叠加）。
async function makeDraftFallback(
  p: ProjectMeta,
  scene: SceneMeta,
  abs: string
): Promise<void> {
  const { w, h } = dims(p.aspect);
  const hex = sceneColor(scene);
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
}

// 单镜正片段。
//   VR_RENDER=kenburns → 所有镜走 still-kenburns（codex 静图 + 运镜 + 字幕）。
//   否则 scene.renderer="still-kenburns" → 仅该镜走 kenburns。
//   否则 VR_RENDER=engine（默认）→ vibemotion 引擎真渲；stub → ffmpeg 纯色占位。
export async function renderScene(
  p: ProjectMeta,
  scene: SceneMeta
): Promise<string> {
  const mode = (process.env.VR_RENDER || "engine").toLowerCase();
  if (mode === "kenburns" || scene.renderer === "still-kenburns") {
    return renderSceneKenBurns(p, scene);
  }
  if (mode === "engine") {
    return renderSceneViaEngine(p, scene);
  }
  return renderSceneStub(p, scene);
}

// ============================================================
// still-kenburns：把 codex 静图变成「运镜 + 屏幕文字」的镜头 mp4。
// 字幕方案：核心版 ffmpeg 无 drawtext，改为 magick 渲透明 PNG → ffmpeg overlay。
//   底视频：ffmpeg scale/crop/zoompan 运镜；
//   字幕：magick 把文案渲成带半透明衬底的透明 PNG（自动折行），作为第二输入 overlay 到底部居中。
// 不碰 engine/Remotion。magick 不可用 / 失败 → 退回仅运镜不烧字（绝不硬崩）。
// ============================================================

// 草图绝对路径（与 makeDraft 落点一致：drafts/scene-N.png）。
function draftAbsPath(p: ProjectMeta, scene: SceneMeta): string {
  return path.join(draftsDir(p.projectId), `scene-${scene.index}.png`);
}

// 解析中文字体文件：优先 env FONT_FILE，默认 Arial Unicode（CJK 全覆盖），
// 再退候选链 Hiragino Sans GB → STHeiti Medium 等。
// 全都不存在 → 返回 null（调用方降级为不叠字）。
function resolveFontFile(): string | null {
  const candidates = [
    process.env.FONT_FILE,
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Songti.ttc",
  ].filter(Boolean) as string[];
  for (const f of candidates) {
    try {
      if (fs.statSync(f).isFile()) return f;
    } catch {
      /* next */
    }
  }
  return null;
}

// 用 magick 把 text 渲成「透明背景 + 半透明深色衬底」的字幕 PNG。
//   - 宽度 ≈ 视频宽 86%，magick `-size <w>x caption:` 按宽度自动折行（中文长句可折）。
//   - 白字 + 细黑描边（一遍 stroke+fill），pointsize ≈ 视频高 5%，提升深/浅底上的可读性。
//   - 文本经临时文件 `caption:@file` 传入，避开 shell/参数转义问题。
//   - 衬底：把文本块包进一条半透明圆角深色压条（同尺寸 roundrectangle），保证深色衬底上清晰。
//   失败时抛错，调用方据此降级为仅运镜。
async function renderCaptionPng(
  text: string,
  videoW: number,
  videoH: number,
  absPngPath: string
): Promise<void> {
  const fontFile = resolveFontFile();
  if (!fontFile) throw new Error("未找到可用 CJK 字体文件（FONT_FILE 未设或不存在）");

  const capW = Math.round(videoW * 0.86); // 文本折行宽度 ≈ 视频宽 86%
  const pt = Math.max(12, Math.round(videoH * 0.05)); // 字号 ≈ 视频高 5%
  const pad = Math.max(8, Math.round(videoH * 0.02)); // 文本块内边距
  const radius = Math.round(pt * 0.5); // 圆角半径

  // 文本写临时文件，用 caption:@file 传入（安全，避免特殊字符转义问题）。
  const txtFile = path.join(
    os.tmpdir(),
    `vr-cap-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  );
  const textPng = `${absPngPath}.text.png`;
  fs.writeFileSync(txtFile, text, "utf8");

  try {
    // ① 渲文本（白字 + 细黑描边），RGBA 透明底，按 capW 自动折行，四周留 pad。
    await run(magickBin(), [
      "-background",
      "none",
      "-fill",
      "white",
      "-stroke",
      "black",
      "-strokewidth",
      "2",
      "-font",
      fontFile,
      "-pointsize",
      String(pt),
      "-size",
      `${capW}x`,
      "-gravity",
      "center",
      `caption:@${txtFile}`,
      "-bordercolor",
      "none",
      "-border",
      String(pad),
      `PNG32:${textPng}`,
    ]);

    // ② 量文本块尺寸 → 画同尺寸半透明圆角深色衬底 → 文本居中合成到衬底上。
    const ident = spawnSync(
      magickBin(),
      ["identify", "-format", "%w %h", textPng],
      { encoding: "utf8", timeout: 10000 }
    );
    if (ident.status !== 0) {
      throw new Error(`magick identify 失败: ${(ident.stderr || "").trim().slice(-300)}`);
    }
    const [tw, th] = (ident.stdout || "").trim().split(/\s+/).map((n) => parseInt(n, 10));
    if (!tw || !th) throw new Error(`无法解析字幕画布尺寸: "${ident.stdout}"`);

    await run(magickBin(), [
      "-size",
      `${tw}x${th}`,
      "xc:none",
      "-fill",
      "rgba(0,0,0,0.5)",
      "-draw",
      `roundrectangle 0,0 ${tw - 1},${th - 1} ${radius},${radius}`,
      textPng,
      "-gravity",
      "center",
      "-composite",
      `PNG32:${absPngPath}`,
    ]);
  } finally {
    for (const f of [txtFile, textPng]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

// 构造底视频运镜滤镜链（scale 覆盖 → crop 裁切 → zoompan 缓推）。
//   inLabel/outLabel 为空字符串时省略对应 pad 标签（适配 -vf 纯链；filter_complex 传 [0:v]/[bg]）。
//   不含字幕（字幕走 overlay）。
//   - 先放大到 1.25× 再缓推到 1.12×，给 zoompan 留采样余量、避免抖动/越界。
//   - z 平滑递增并 clamp，居中推。
function buildKenBurnsMotion(
  w: number,
  h: number,
  frames: number,
  fps: number,
  inLabel: string,
  outLabel: string
): string {
  const coverW = Math.round(w * 1.25);
  const coverH = Math.round(h * 1.25);
  const zoomMax = 1.12;
  const zoomStep = (zoomMax - 1) / Math.max(1, frames - 1);
  return (
    `${inLabel}scale=${coverW}:${coverH}:force_original_aspect_ratio=increase,` +
    `crop=${coverW}:${coverH},` +
    `zoompan=z='min(zoom+${zoomStep.toFixed(6)},${zoomMax})':` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${frames}:s=${w}x${h}:fps=${fps}${outLabel}`
  );
}

// 在运镜底视频上叠字幕 PNG 的完整 filter_complex（第二输入 [1:v] = caption.png）。
//   底部居中，留底边距 ≈ 视频高 8%；最后 format=yuv420p。
function buildKenBurnsOverlayComplex(
  w: number,
  h: number,
  frames: number,
  fps: number
): string {
  const bottomMargin = Math.round(h * 0.08); // 底边距 ≈ 视频高 8%
  const motion = buildKenBurnsMotion(w, h, frames, fps, "[0:v]", "[bg]");
  return (
    `${motion};` +
    `[bg][1:v]overlay=x=(W-w)/2:y=H-h-${bottomMargin}:format=auto,` +
    `format=yuv420p[out]`
  );
}

// 主入口：still-kenburns 单镜渲染。返回相对路径 scenes/scene-N.mp4。
export async function renderSceneKenBurns(
  p: ProjectMeta,
  scene: SceneMeta
): Promise<string> {
  const { w, h } = dims(p.aspect);
  const fps = 30;
  const dur = Math.max(1, Math.round(scene.durationSec || 4));
  const frames = dur * fps;

  const rel = `scenes/scene-${scene.index}.mp4`;
  const outAbs = path.join(scenesDir(p.projectId), `scene-${scene.index}.mp4`);
  fs.mkdirSync(scenesDir(p.projectId), { recursive: true });

  // 1) 取源图：drafts/scene-N.png 不存在则补出一张 codex 真图（失败则纯色兜底）。
  const srcAbs = draftAbsPath(p, scene);
  if (!fileExistsNonEmpty(srcAbs)) {
    fs.mkdirSync(draftsDir(p.projectId), { recursive: true });
    try {
      await generateImage(buildDraftPrompt(p, scene), srcAbs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[kenburns] 第 ${scene.index} 镜源图缺失且出图失败，退回纯色底图: ${msg}`
      );
      await makeDraftFallback(p, scene, srcAbs);
    }
  }

  // 2) 字幕 PNG：仅当 onScreenText 非空 && magick 可用，才用 magick 渲透明字幕 PNG。
  //    magick 不可用 / 渲染失败 → captionPng 置空，降级为仅运镜（不硬崩）。
  let captionPng: string | null = null;
  const wantText = !!(scene.onScreenText && scene.onScreenText.trim());
  if (wantText) {
    if (!magickAvailable()) {
      console.warn(
        `[kenburns] 未检测到可用 magick（MAGICK_BIN），第 ${scene.index} 镜降级为仅运镜（不叠字）。`
      );
    } else {
      const tmpPng = path.join(
        os.tmpdir(),
        `vr-kb-${p.projectId}-${scene.index}-${Date.now()}.png`
      );
      try {
        await renderCaptionPng(scene.onScreenText.trim(), w, h, tmpPng);
        captionPng = tmpPng;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[kenburns] 第 ${scene.index} 镜字幕 PNG 渲染失败，降级为仅运镜（不叠字）: ${msg}`
        );
        captionPng = null;
        try {
          fs.unlinkSync(tmpPng);
        } catch {
          /* ignore */
        }
      }
    }
  }

  // 3) 出片：有字幕 → 双输入 filter_complex + overlay；无字幕 → 单输入仅运镜。
  try {
    if (captionPng) {
      const filter = buildKenBurnsOverlayComplex(w, h, frames, fps);
      await run(ffmpegBin(), [
        "-y",
        "-loop",
        "1",
        "-i",
        srcAbs,
        "-i",
        captionPng,
        "-filter_complex",
        filter,
        "-map",
        "[out]",
        "-t",
        String(dur),
        "-r",
        String(fps),
        "-frames:v",
        String(frames),
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-movflags",
        "+faststart",
        outAbs,
      ]);
    } else {
      const filter = `${buildKenBurnsMotion(w, h, frames, fps, "", "")},format=yuv420p`;
      await run(ffmpegBin(), [
        "-y",
        "-loop",
        "1",
        "-i",
        srcAbs,
        "-t",
        String(dur),
        "-vf",
        filter,
        "-r",
        String(fps),
        "-frames:v",
        String(frames),
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-movflags",
        "+faststart",
        outAbs,
      ]);
    }
  } finally {
    if (captionPng) {
      try {
        fs.unlinkSync(captionPng);
      } catch {
        /* ignore */
      }
    }
  }

  return rel;
}

// 文件存在且非空（render 内部用；与 image.ts 内同名函数职责一致）。
function fileExistsNonEmpty(f: string): boolean {
  try {
    return fs.statSync(f).size > 0;
  } catch {
    return false;
  }
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
