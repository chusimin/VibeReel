// End-to-end Duoji showreel run (keynote-light style, motion graphics tempo).
// IMPORTANT: env must be set BEFORE importing any lib/* modules.
process.env.APP_PASSWORD = process.env.APP_PASSWORD || "demo";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "poc-dev-secret-change-me";
process.env.CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
process.env.VR_MODEL = process.env.VR_MODEL || "sonnet";
process.env.FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";
process.env.VIBEMOTION_BIN =
  process.env.VIBEMOTION_BIN ||
  `${process.env.HOME}/.claude/skills/vibe-motion-video/bin/vibemotion.mjs`;
// Per PRD: don't set VR_RENDER (defaults to engine inside render.ts).
delete process.env.VR_RENDER;

/* eslint-disable @typescript-eslint/no-var-requires */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createProject, getProject, projDir } from "@/lib/store";
import { runFromCreate, handleGate } from "@/lib/orchestrator";

const IDEA = `桌宠产品名「多吉 · 像素柯基桌宠」。

一只住在 Mac 桌面右下角的像素柯基（Electron 桌宠），把"桌面萌宠"和"开发工作流状态指示器"缝在了一起——既是玩具，也是趁手的小工具。

核心功能：
1) Claude Code 状态胶囊：头顶迷你胶囊实时显示全机任务状态（🔵旋转圈=在跑 / 🟡琥珀脉冲=等你确认 / ✅绿勾闪现=完成，配一声"汪！"+系统通知）。监听这台机器所有项目，多任务并行显示。
2) 拖文件夹起终端，一键开任务：把 Finder 文件/文件夹拖到它身上 → 自动打开 Terminal、cd 过去并运行 claude；拖文件时还把"@文件名"预填进输入框。
3) 眼睛跟随鼠标：休息时眼睛在 9 个注视帧间切换（30Hz 刷新）；鼠标贴脸 30px 内会"看鼻子"斗鸡眼。
4) 会休息会溜达会回家：约 50% 时间安静趴着带呼吸起伏（3.2s 周期）；散步只横着走、在家左右 240px 内，走完一定回家。拖动它=搬家。
5) 双击和多吉聊天（Kimi 驱动），用 Obsidian 笔记回答你的提问，本地检索 500 篇 <1 秒。
6) 像素级点击穿透 + 悬浮于一切之上：透明区域穿透到下面应用，全屏 app 都压不住。

目标用户：整天跑 Claude Code / 终端的开发者与 AI 从业者；喜欢桌宠、想给桌面加点温度的 Mac 用户。

价值主张：跑长任务不用盯终端——干活/等确认/完成，柯基第一时间用表情告诉你；等 Claude 的几十分钟，从盯日志的焦虑变成有温度的陪伴；存在感低但有温度，50% 时间安静趴着，眼睛一直跟着你。

技术：Electron 33 + 原生 Canvas 2D，macOS。`;

const T0 = Date.now();
function elapsed(): string {
  return `${((Date.now() - T0) / 1000).toFixed(1)}s`;
}
function log(msg: string): void {
  console.log(`[${elapsed()}] ${msg}`);
}

function snapshot(id: string, label: string): void {
  const p = getProject(id);
  if (!p) {
    log(`${label}: project missing!`);
    return;
  }
  log(
    `${label}: stage=${p.stage} gate=${p.awaitingGate ?? "-"} scenes=${p.scenes.length} error=${p.error ?? "-"}`,
  );
}

async function waitForGate(
  id: string,
  expected: string | null,
  opts: { timeoutMs: number; label: string },
): Promise<void> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < opts.timeoutMs) {
    const p = getProject(id);
    if (!p) throw new Error(`${opts.label}: project lost`);
    if (p.error) throw new Error(`${opts.label}: ${p.error}`);
    if (p.awaitingGate === expected || (expected === null && p.stage === "final")) {
      log(`${opts.label}: ✓ reached gate=${p.awaitingGate ?? "-"} stage=${p.stage}`);
      return;
    }
    const tag = `${p.stage}/${p.awaitingGate ?? "-"}/${p.scenes.length}`;
    if (tag !== last) {
      log(`${opts.label}: waiting… ${tag}`);
      last = tag;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`${opts.label}: timeout waiting for ${expected}`);
}

function ffprobe(file: string): string {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,r_frame_rate,duration",
      "-show_entries",
      "format=duration,size",
      "-of",
      "default=noprint_wrappers=0",
      file,
    ],
    { encoding: "utf8" },
  );
  return r.stdout || r.stderr || "";
}

function copyOut(src: string, dst: string): void {
  fs.copyFileSync(src, dst);
}

function extractFrames(mp4: string, prefix: string, count: number): string[] {
  // Probe duration first.
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4],
    { encoding: "utf8" },
  );
  const dur = parseFloat((probe.stdout || "0").trim()) || 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // Even spread; clamp away from 0 / end.
    const t = ((i + 1) / (count + 1)) * dur;
    const outFile = `${prefix}_${i + 1}.png`;
    const r = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-ss",
        t.toFixed(2),
        "-i",
        mp4,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outFile,
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      console.error(`ffmpeg frame ${i + 1} failed`, r.stderr?.slice(0, 300));
    }
    out.push(outFile);
  }
  return out;
}

async function main(): Promise<void> {
  log("creating project…");
  const proj = createProject({
    videoType: "showreel",
    aspect: "16:9",
    styleId: "apple-keynote-light",
    voiceover: false,
    subtitle: false,
    inputs: [{ id: "in-duoji", kind: "idea", value: IDEA }],
  });
  const id = proj.projectId;
  log(`projectId=${id}`);

  // 1) ingestion → concept gate
  log("runFromCreate (→ concept)…");
  await runFromCreate(id);
  await waitForGate(id, "concept", { timeoutMs: 8 * 60_000, label: "concept" });

  const p1 = getProject(id)!;
  log(`concepts (${p1.concepts.length}):`);
  p1.concepts.forEach((c, i) => {
    console.log(
      `  [${i}] ${c.title}  tone=${c.tone}  words=${(c.words || []).join("/")}`,
    );
  });
  const choice = 0;
  log(`→ choosing concept #${choice}: "${p1.concepts[choice]?.title}"`);

  // 2) concept → storyboard gate
  log("handleGate concept → 0…");
  await handleGate(id, { gate: "concept", choice });
  await waitForGate(id, "storyboard", { timeoutMs: 10 * 60_000, label: "storyboard" });

  const p2 = getProject(id)!;
  log(`storyboard scenes (${p2.scenes.length}):`);
  p2.scenes.forEach((s) => {
    const vt = s.visual?.type || "-";
    console.log(
      `  [${s.index}] role=${s.role} dur=${s.durationSec}s visual=${vt} text="${s.onScreenText}"`,
    );
  });

  // 3) storyboard confirm → renders first 2 → chunk gate
  log("handleGate storyboard confirm (render scenes 1-2)…");
  await handleGate(id, { gate: "storyboard", action: "confirm" });
  await waitForGate(id, "chunk", { timeoutMs: 15 * 60_000, label: "chunk1" });
  snapshot(id, "after first 2 renders");

  // 4) chunk continue → renders remainder
  log("handleGate chunk continue (render remaining scenes)…");
  await handleGate(id, { gate: "chunk", action: "continue" });
  await waitForGate(id, "chunk", { timeoutMs: 25 * 60_000, label: "chunkAll" });
  snapshot(id, "after all scenes rendered");

  const p3 = getProject(id)!;
  log("per-scene mp4 status:");
  p3.scenes.forEach((s) => {
    let exists = false;
    let size = 0;
    if (s.mp4) {
      const abs = path.join(projDir(id), s.mp4);
      try {
        const st = fs.statSync(abs);
        exists = st.isFile();
        size = st.size;
      } catch {
        /* */
      }
    }
    console.log(
      `  [${s.index}] mp4=${s.mp4 ?? "(none)"} exists=${exists} size=${size}`,
    );
  });

  // 5) chunk assemble → final gate
  log("handleGate chunk assemble (build final)…");
  await handleGate(id, { gate: "chunk", action: "assemble" });
  await waitForGate(id, "final", { timeoutMs: 8 * 60_000, label: "final" });

  const pFinal = getProject(id)!;
  const finalRel = pFinal.outputs?.mp4;
  if (!finalRel) {
    throw new Error("final.mp4 not produced");
  }
  const finalAbs = path.join(projDir(id), finalRel);
  log(`final.mp4 at: ${finalAbs}`);
  log(`ffprobe:\n${ffprobe(finalAbs)}`);

  const here = __dirname;
  const dstFinal = path.join(here, "__duoji_final.mp4");
  copyOut(finalAbs, dstFinal);
  log(`copied to: ${dstFinal}`);

  const frames = extractFrames(finalAbs, path.join(here, "__duoji"), 6);
  frames.forEach((f) => log(`frame: ${f}`));

  log(`DONE in ${elapsed()}`);
}

main().catch((err) => {
  console.error("E2E FAILED:", err);
  const id = (err as { _id?: string })?._id;
  if (id) {
    const p = getProject(id);
    if (p) console.error("project error:", p.error);
  }
  process.exit(1);
});
