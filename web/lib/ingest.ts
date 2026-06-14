// 多输入抓取（#2）：把项目的若干输入（链接 / 想法 / 代码包）统一取成"素材正文"。
//   · url  —— 服务端 fetch 网页 → 去标签取正文（截断、超时、缓存）。
//   · idea —— 文本直用。
//   · code —— 读上传时落盘的代码摘要（code/<inputId>.md：文件树 + 关键文件节选）。
// 抓取结果按 inputId 缓存在 globalThis（HMR 安全）；decompose / agent 复用同一份。

import fs from "node:fs";
import path from "node:path";
import type { InputItem, ProjectMeta } from "@/lib/types";
import { codeDir } from "@/lib/store";

const g = globalThis as unknown as { __vrIngest?: Map<string, string> };
const cache = (g.__vrIngest ??= new Map<string, string>());

const MAX_URL_CHARS = 4000;
const MAX_CODE_CHARS = 6000;

export async function fetchUrlText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 VibeReel-POC" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    return htmlToText(html).slice(0, MAX_URL_CHARS);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// 代码摘要落盘约定：上传/解压 /api/projects/:id/inputs 时写到这里。
export function codeDigestPath(projectId: string, inputId: string): string {
  return path.join(codeDir(projectId), `${inputId}.md`);
}

function readCodeDigest(projectId: string, inputId: string): string {
  try {
    return fs
      .readFileSync(codeDigestPath(projectId, inputId), "utf8")
      .slice(0, MAX_CODE_CHARS);
  } catch {
    return "";
  }
}

const KIND_ZH: Record<InputItem["kind"], string> = {
  url: "链接",
  idea: "想法",
  code: "代码包",
};

// 取单条输入的素材正文（带 inputId 缓存；url 抓不到返回空）。
export async function gatherInput(
  projectId: string,
  input: InputItem
): Promise<{ text: string; fetched: boolean }> {
  if (input.kind === "idea") {
    return { text: input.value, fetched: input.value.trim().length > 0 };
  }
  if (input.kind === "code") {
    const text = readCodeDigest(projectId, input.id);
    return { text, fetched: text.length > 0 };
  }
  // url
  const cacheKey = `${projectId}:${input.id}`;
  const cached = cache.get(cacheKey);
  if (cached != null) return { text: cached, fetched: cached.length > 0 };
  const text = await fetchUrlText(input.value);
  cache.set(cacheKey, text);
  return { text, fetched: text.length > 0 };
}

export interface GatheredPart {
  input: InputItem;
  text: string;
  fetched: boolean;
}

// 汇总全部输入 → 拼成喂 agent 的素材块（每条带来源标注），并回传 per-input 明细。
export async function gatherMaterial(
  p: ProjectMeta
): Promise<{ block: string; parts: GatheredPart[] }> {
  const parts: GatheredPart[] = [];
  for (const input of p.inputs) {
    const { text, fetched } = await gatherInput(p.projectId, input);
    parts.push({ input, text, fetched });
  }

  const sections = parts.map((part) => {
    const tag = `${KIND_ZH[part.input.kind]}`;
    const head = `来源 #${part.input.id} · ${tag}${
      part.input.kind === "url" ? `：${part.input.value}` : ""
    }`;
    if (part.fetched && part.text) {
      return `${head}\n${part.text}`;
    }
    if (part.input.kind === "url") {
      return `${head}\n（页面正文抓取失败：请据该链接域名/路径与常识推断其定位，照常产出，不要拒绝。）`;
    }
    return `${head}\n（无可用正文）`;
  });

  return { block: sections.join("\n\n---\n\n"), parts };
}
