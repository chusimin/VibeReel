// 内容拆解（#5）：抓料后主动把素材拆成"可被 @引用 的料块"。
// 拆出来的 chunk 有稳定短 id，后续 concept / script / storyboard 生成与编辑都能引用。
// 走独立 Agent 层（llm.complete），不直接耦合 CLI。

import type { Material, MaterialChunk, ChunkKind, ProjectMeta } from "@/lib/types";
import { complete } from "@/lib/llm";
import { gatherMaterial } from "@/lib/ingest";
import { extractJson } from "@/lib/json";

const CHUNK_KINDS: ChunkKind[] = [
  "feature",
  "metric",
  "fact",
  "quote",
  "term",
  "step",
  "audience",
  "differentiator",
  "other",
];

const TYPE_HINT: Record<ProjectMeta["videoType"], string> = {
  showreel: "产品 showreel：重点抓卖点(feature)、亮眼数据(metric)、差异点(differentiator)、目标受众(audience)。",
  popsci: "科普：重点抓核心概念(term)、关键事实(fact)、可类比的点、记忆金句(quote)。",
  teaching: "教学：重点抓学习目标、可操作步骤(step)、易错点(fact)、术语(term)。",
};

function normalizeKind(v: unknown): ChunkKind {
  const s = String(v ?? "").trim().toLowerCase() as ChunkKind;
  return CHUNK_KINDS.includes(s) ? s : "other";
}

// 把素材拆成 6~12 个料块 + 一句总览。失败则回退一个"整段"料块，保证流程不断。
export async function decomposeMaterial(p: ProjectMeta): Promise<Material> {
  const { block } = await gatherMaterial(p);

  const prompt = [
    "你处于离线、无工具环境，只能基于下面素材作业，不要说要浏览/访问链接。",
    `视频类型：${p.videoType}。${TYPE_HINT[p.videoType]}`,
    "【素材】",
    block,
    "",
    "请把上述素材拆解成 6~12 个互不重复的「料块」，每块是后续做视频时可单独引用的最小信息单元。",
    "严格只输出一个 JSON 对象，不要解释或 Markdown：",
    '{"summary":"一句话总览(中文,40字内)","chunks":[{"id":"m1","kind":"feature","title":"短标题(中文,12字内)","detail":"一两句正文(中文)"}]}',
    `kind 只能取：${CHUNK_KINDS.join(" / ")}。`,
    "id 用 m1、m2… 顺序编号，保证唯一、简短。全部中文。",
  ].join("\n");

  try {
    const text = await complete(prompt, { model: p.model });
    const obj = extractJson<{
      summary?: unknown;
      chunks?: unknown;
    }>(text);
    const rawChunks = Array.isArray(obj?.chunks) ? obj.chunks : [];
    const chunks: MaterialChunk[] = rawChunks
      .slice(0, 12)
      .map((item, i) => {
        const o = (item ?? {}) as Record<string, unknown>;
        const id = String(o.id ?? `m${i + 1}`).trim() || `m${i + 1}`;
        return {
          id,
          kind: normalizeKind(o.kind),
          title: String(o.title ?? "").trim() || `要点 ${i + 1}`,
          detail: String(o.detail ?? "").trim(),
        };
      })
      .filter((c) => c.detail.length > 0);

    if (chunks.length === 0) return fallback(block);

    // 去重 id（极少数模型重复编号时兜底）
    const seen = new Set<string>();
    for (const c of chunks) {
      let id = c.id;
      let n = 1;
      while (seen.has(id)) id = `${c.id}-${n++}`;
      c.id = id;
      seen.add(id);
    }

    const summary =
      typeof obj?.summary === "string" && obj.summary.trim()
        ? obj.summary.trim()
        : chunks[0].detail.slice(0, 40);

    return { summary, chunks };
  } catch {
    return fallback(block);
  }
}

function fallback(block: string): Material {
  return {
    summary: block.slice(0, 40),
    chunks: [
      {
        id: "m1",
        kind: "other",
        title: "原始素材",
        detail: block.slice(0, 600),
      },
    ],
  };
}

// 把选中的料块渲染成喂 agent 的引用清单（带 @id，鼓励模型在产出里回填 refs）。
export function chunksBlock(material: Material | null): string {
  if (!material || material.chunks.length === 0) return "";
  const lines = material.chunks.map(
    (c) => `@${c.id} [${c.kind}] ${c.title}：${c.detail}`
  );
  return ["【可引用料块（用 @id 指代）】", ...lines].join("\n");
}
