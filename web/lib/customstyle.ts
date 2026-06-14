// 自定义风格三法（#4）：统一产出一个 StylePack（不含 id/custom，由 library.addCustomStyle 落库）。
//   · manual —— 用户直接给 bg/fg/accent(+字体)。
//   · text   —— 一句描述 → 走 Agent 提"风格基因"(色板/字体/descriptor)。
//   · image  —— 上传参考图 → ffmpeg 抽主色 → 推出 bg/fg/accent，图本身做 heroImage。

import { spawn } from "node:child_process";
import type { CustomStyleBody } from "@/lib/types";
import type { StylePack } from "@/lib/styles";
import { complete } from "@/lib/llm";
import { extractJson } from "@/lib/json";
import { libraryFileAbs } from "@/lib/library";

export type StyleDraft = Omit<StylePack, "id" | "custom" | "createdAt">;

const HEX = /^#?[0-9a-fA-F]{6}$/;
function normHex(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  if (!HEX.test(s)) return fallback;
  return s.startsWith("#") ? s : `#${s}`;
}

export async function buildCustomStyle(body: CustomStyleBody): Promise<StyleDraft> {
  switch (body.mode) {
    case "manual":
      return buildManual(body);
    case "text":
      return buildFromText(body);
    case "image":
      return buildFromImage(body);
    default:
      throw new Error(`未知自定义风格模式：${String((body as { mode?: string }).mode)}`);
  }
}

// ---- manual ----
function buildManual(body: CustomStyleBody): StyleDraft {
  const bg = normHex(body.bg, "#FFFFFF");
  const fg = normHex(body.fg, "#111111");
  const accent = normHex(body.accent, "#2563EB");
  const name = (body.name || "自定义风格").trim();
  return {
    name,
    label: `自定义(手填) · ${name}`,
    bg,
    fg,
    accent,
    font: body.font?.trim() || undefined,
    descriptor: body.description?.trim() || undefined,
  };
}

// ---- text → Agent 提风格基因 ----
async function buildFromText(body: CustomStyleBody): Promise<StyleDraft> {
  const desc = (body.description || "").trim();
  if (!desc) throw new Error("文字自定义风格需要一句描述");
  const prompt = [
    "你是视觉风格设计师。根据下面一句风格描述，给出一套可直接用于视频的风格基因。",
    `风格描述：${desc}`,
    "严格只输出一个 JSON 对象，不要解释：",
    '{"name":"短名(中文,8字内)","bg":"#RRGGBB","fg":"#RRGGBB","accent":"#RRGGBB","font":"字体倾向(中文短语)","descriptor":"风格基因一两句(中文:质感/构图/光感/排版)"}',
    "bg=背景主色，fg=主文字色(与 bg 高对比)，accent=点缀色。颜色必须是 6 位 hex。",
  ].join("\n");

  const text = await complete(prompt, { model: body.name ? undefined : undefined });
  const o = extractJson<Record<string, unknown>>(text);
  const name = String(o.name ?? body.name ?? "自定义风格").trim() || "自定义风格";
  return {
    name,
    label: `自定义(描述) · ${name}`,
    bg: normHex(o.bg, "#0B0B0F"),
    fg: normHex(o.fg, "#FFFFFF"),
    accent: normHex(o.accent, "#6C4CF6"),
    font: String(o.font ?? "").trim() || undefined,
    descriptor: String(o.descriptor ?? desc).trim() || desc,
  };
}

// ---- image → ffmpeg 抽主色 ----
async function buildFromImage(body: CustomStyleBody): Promise<StyleDraft> {
  if (!body.imageRef) throw new Error("图片自定义风格需要 imageRef");
  const abs = libraryFileAbs(body.imageRef);
  if (!abs) throw new Error("非法 imageRef");

  const colors = await dominantColors(abs); // 已按出现/区域排序
  const { bg, fg, accent } = pickRoles(colors);
  const name = (body.name || "参考图风格").trim();
  return {
    name,
    label: `自定义(参考图) · ${name}`,
    bg,
    fg,
    accent,
    heroImage: body.imageRef,
    descriptor: body.description?.trim() || "由参考图自动提取的色板风格",
  };
}

// 用 ffmpeg 把图缩成 4x4，导出 rawvideo rgb24，读 48 字节 → 16 个代表色。
function dominantColors(absImage: string): Promise<string[]> {
  const bin = process.env.FFMPEG_BIN || "ffmpeg";
  const args = [
    "-v", "error",
    "-i", absImage,
    "-vf", "scale=4:4:flags=area",
    "-frames:v", "1",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "-",
  ];
  return new Promise<string[]>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => reject(new Error(`无法启动 ffmpeg: ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg 提色失败 ${code}: ${stderr.trim().slice(-300)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const out: string[] = [];
      for (let i = 0; i + 2 < buf.length; i += 3) {
        out.push(hex(buf[i], buf[i + 1], buf[i + 2]));
      }
      if (out.length === 0) reject(new Error("未能从图片提取颜色"));
      else resolve(out);
    });
  });
}

function hex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function luminance(c: string): number {
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function saturation(c: string): number {
  const r = parseInt(c.slice(1, 3), 16) / 255;
  const g = parseInt(c.slice(3, 5), 16) / 255;
  const b = parseInt(c.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
// 取最亮做背景、最暗做文字、最饱和做点缀，保证三者可区分。
function pickRoles(colors: string[]): { bg: string; fg: string; accent: string } {
  const sorted = [...colors];
  const bg = sorted.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
  const fg = sorted.reduce((a, b) => (luminance(b) < luminance(a) ? b : a));
  const accent = sorted.reduce((a, b) => (saturation(b) > saturation(a) ? b : a));
  return { bg, fg, accent: accent === bg || accent === fg ? defaultAccent(bg) : accent };
}
function defaultAccent(bg: string): string {
  return luminance(bg) > 0.5 ? "#2563EB" : "#FFE600";
}
