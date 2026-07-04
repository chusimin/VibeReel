import type {
  EditBody,
  GateBody,
  NavBody,
  ProjectMeta,
  Renderer,
  SceneMeta,
} from "@/lib/types";
import { getProject, saveProject } from "@/lib/store";
import {
  generateConcepts,
  generateScript,
  generateStoryboard,
} from "@/lib/agent";
import { decomposeMaterial } from "@/lib/decompose";
import { assemble, makeDraft, renderScene } from "@/lib/render";
import { emit } from "@/lib/bus";

// HMR 安全 + 并发锁：同一项目串行处理，避免重入。
const g = globalThis as unknown as {
  __vrLocks?: Set<string>;
};

function locks(): Set<string> {
  if (!g.__vrLocks) g.__vrLocks = new Set<string>();
  return g.__vrLocks;
}

async function withLock(id: string, fn: () => Promise<void>): Promise<void> {
  const l = locks();
  if (l.has(id)) {
    // 已在处理：直接忽略并发触发，避免状态机重入。
    return;
  }
  l.add(id);
  try {
    await fn();
  } finally {
    l.delete(id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 无依赖并发限制：把 items 切成每组 ≤ limit，逐组并行、组间串行。
// 用于草图出图——一次最多并发 limit 路，避免 codex 被挤爆全超时。
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const size = Math.max(1, limit);
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map(fn));
  }
}

function push(p: ProjectMeta, message?: string, pct?: number): void {
  saveProject(p);
  emit(p.projectId, { project: p, message, pct });
}

function fail(p: ProjectMeta, err: unknown): void {
  p.stage = "failed";
  p.error = err instanceof Error ? err.message : String(err);
  p.awaitingGate = null;
  push(p, `失败：${p.error}`);
}

function scenesSorted(p: ProjectMeta): SceneMeta[] {
  return [...p.scenes].sort((a, b) => a.index - b.index);
}

const VALID_RENDERERS: Renderer[] = [
  "remotion",
  "generative",
  "lottie",
  "still-kenburns",
];

// ---- 流程：从创建开始（ingesting → briefing → concept 闸门）----
export async function runFromCreate(id: string): Promise<void> {
  await withLock(id, async () => {
    const p = getProject(id);
    if (!p) return;
    try {
      p.stage = "ingesting";
      p.error = null;
      push(p, `正在解析 ${p.inputs.length} 条素材…`, 5);
      await sleep(150);

      // #5 内容拆解：把素材拆成可引用料块，存到 p.material，后续生成据此引用。
      p.stage = "decomposing";
      push(p, "正在拆解内容为可引用料块…", 12);
      p.material = await decomposeMaterial(p);
      push(p, `已拆出 ${p.material.chunks.length} 个料块`, 18);

      p.stage = "briefing";
      push(p, "正在生成创意简报…", 22);
      await sleep(150);

      const concepts = await generateConcepts(p);
      p.concepts = concepts;
      p.stage = "concept";
      p.awaitingGate = "concept";
      push(p, `已生成 ${concepts.length} 个创意方向，请选择`, 30);
    } catch (err) {
      fail(p, err);
    }
  });
}

// ---- 子流程：分镜（storyboarding → drafting → storyboard 闸门）----
async function runStoryboard(
  p: ProjectMeta,
  opts?: { note?: string }
): Promise<void> {
  p.stage = "storyboarding";
  p.awaitingGate = null;
  push(p, opts?.note ? "正在按意见重做分镜…" : "正在生成分镜…", 45);

  const scenes = await generateStoryboard(p, opts);

  // 打回重做：累加 rev 并记一条 agent revision
  if (opts?.note) {
    const at = new Date().toISOString();
    for (const s of scenes) {
      s.rev = 1;
      s.revisions = [{ at, reason: opts.note, by: "agent" }];
    }
  }
  p.scenes = scenes;

  p.stage = "drafting";
  push(p, "正在生成分镜草图…", 55);
  // 并发上限 2 分批出图（6 路一起会把 codex 挤爆全超时；本机 codex 还要起 MCP
  // 插件，并发越高单张越慢——实测 3 路在真流水线里会有镜超时退回纯色，降到 2 稳）。
  await mapWithConcurrency(p.scenes, 2, async (scene) => {
    const rel = await makeDraft(p, scene);
    scene.draftImage = rel;
  });

  p.stage = "storyboard";
  p.awaitingGate = "storyboard";
  push(p, "分镜草图已就绪，请确认或打回", 60);
}

// ---- 子流程：渲染单个镜（rendering → renderScene → await_review，逐镜 emit）----
async function renderOneScene(p: ProjectMeta, scene: SceneMeta): Promise<void> {
  p.stage = "rendering";
  p.awaitingGate = "chunk";
  scene.status = "rendering";
  push(p, `正在渲染第 ${scene.index} 镜…`, 70);

  const rel = await renderScene(p, scene);
  scene.mp4 = rel;
  scene.status = "await_review";
  push(p, `第 ${scene.index} 镜已渲染，请审核`, 75);
}

// 按 1-based index 顺序渲染 [from, to] 区间内尚未生成的镜（逐镜 emit），渲完停在 chunk 闸门。
async function renderSceneRange(
  p: ProjectMeta,
  from: number,
  to: number
): Promise<void> {
  const ordered = scenesSorted(p);
  for (const scene of ordered) {
    if (scene.index < from || scene.index > to) continue;
    await renderOneScene(p, scene);
  }
  // 区间渲完，停在 rendering / chunk 闸门
  p.stage = "rendering";
  p.awaitingGate = "chunk";
}

// ---- 子流程：拼合 → 质检 → final 闸门 ----
async function runAssemble(p: ProjectMeta): Promise<void> {
  p.stage = "assembling";
  p.awaitingGate = null;
  push(p, "正在拼合成片…", 88);

  const rel = await assemble(p);
  p.outputs = { ...p.outputs, mp4: rel };

  p.stage = "qa";
  push(p, "正在质检…", 94);
  await sleep(300);

  p.stage = "final";
  p.awaitingGate = "final";
  push(p, "成片已就绪，请最终确认", 98);
}

// ---- 闸门处理 ----
export async function handleGate(id: string, body: GateBody): Promise<void> {
  await withLock(id, async () => {
    const p = getProject(id);
    if (!p) return;
    try {
      switch (body.gate) {
        case "concept": {
          p.chosenConcept = body.choice;
          const needsScript = p.fourPack.gates.includes("script");
          if (needsScript) {
            p.stage = "scripting";
            p.awaitingGate = null;
            push(p, "正在撰写讲稿…", 38);
            const script = await generateScript(p);
            p.script = script;
            p.stage = "script";
            p.awaitingGate = "script";
            push(p, "讲稿已生成，请确认或打回", 42);
          } else {
            await runStoryboard(p);
          }
          break;
        }

        case "script": {
          if (body.action === "confirm") {
            await runStoryboard(p);
          } else {
            // redo：重新生成讲稿，仍停在 script
            p.stage = "scripting";
            p.awaitingGate = null;
            push(p, "正在按意见重写讲稿…", 38);
            const script = await generateScript(p, { note: body.note });
            p.script = script;
            p.stage = "script";
            p.awaitingGate = "script";
            push(p, "讲稿已重写，请确认或打回", 42);
          }
          break;
        }

        case "storyboard": {
          if (body.action === "confirm") {
            // 确认分镜 → 自动按顺序渲染前 2 镜，渲完停下（不渲后续）。
            await renderSceneRange(p, 1, 2);
            push(p, "已渲染前 2 镜，确认方向后可续渲其余", 75);
          } else {
            // redo：整组分镜重写
            await runStoryboard(p, { note: body.note });
          }
          break;
        }

        case "chunk": {
          if (body.action === "continue") {
            // 确认前 2 镜方向 → 自动续渲第 3..N 镜（逐镜 emit），全部渲完停在 chunk。
            const max = p.scenes.reduce((m, s) => Math.max(m, s.index), 0);
            await renderSceneRange(p, 3, max);
            push(p, "其余分镜已全部渲染，请审核", 85);
            break;
          }

          if (body.action === "assemble") {
            // 全部满意 → 合成成片。
            await runAssemble(p);
            break;
          }

          // approve / redo 都需要定位具体镜
          const scene = p.scenes.find((s) => s.index === body.index);
          if (!scene) {
            throw new Error(`分镜 ${body.index} 不存在`);
          }

          if (body.action === "approve") {
            // 保留：把该镜标 approved（前端可能不再用，不报错即可），停在 chunk。
            scene.status = "approved";
            p.stage = "rendering";
            p.awaitingGate = "chunk";
            push(p, `第 ${scene.index} 镜已标记通过`, 80);
            break;
          }

          // redo 单镜：rev++、记 revision、重渲、停在 await_review。
          scene.rev += 1;
          scene.revisions = [
            ...scene.revisions,
            {
              at: new Date().toISOString(),
              reason: body.note ?? "用户打回重渲",
              by: "user",
            },
          ];
          scene.status = "rendering";
          p.stage = "rendering";
          p.awaitingGate = "chunk";
          push(p, `正在重渲第 ${scene.index} 镜…`, 72);
          const rel = await renderScene(p, scene);
          scene.mp4 = rel;
          scene.status = "await_review";
          push(p, `第 ${scene.index} 镜已重渲，请审核`, 76);
          break;
        }

        case "final": {
          if (body.action === "done") {
            p.stage = "done";
            p.awaitingGate = null;
            push(p, "项目已完成", 100);
          }
          break;
        }

        default: {
          const _exhaustive: never = body;
          throw new Error(`未知闸门 body: ${JSON.stringify(_exhaustive)}`);
        }
      }
    } catch (err) {
      fail(p, err);
    }
  });
}

// ---- 逐项编辑（#7 #8）：合并 patch，不触发重渲/重绘草稿 ----
export async function handleEdit(id: string, body: EditBody): Promise<void> {
  await withLock(id, async () => {
    const p = getProject(id);
    if (!p) return;
    try {
      const { target, index, patch } = body;

      if (target === "concept") {
        const c = p.concepts[index];
        if (!c) throw new Error(`概念 ${index} 不存在`);
        if (typeof patch.title === "string") c.title = patch.title;
        if (typeof patch.tone === "string") c.tone = patch.tone;
        if (typeof patch.look === "string") c.look = patch.look;
        if (typeof patch.palette === "string") c.palette = patch.palette;
        if (typeof patch.pacing === "string") c.pacing = patch.pacing;
        if (Array.isArray(patch.words)) {
          c.words = patch.words.map((w) => String(w));
        }
        push(p, "已更新创意方向");
        return;
      }

      // target === "scene"：按 1-based index 找
      const scene = p.scenes.find((s) => s.index === index);
      if (!scene) throw new Error(`分镜 ${index} 不存在`);

      if (typeof patch.role === "string") scene.role = patch.role;
      if (typeof patch.onScreenText === "string") {
        scene.onScreenText = patch.onScreenText;
      }
      if (patch.durationSec != null) {
        const d = Number(patch.durationSec);
        if (Number.isFinite(d) && d > 0) scene.durationSec = Math.round(d);
      }
      if (patch.renderer != null) {
        const r = String(patch.renderer) as Renderer;
        if (!VALID_RENDERERS.includes(r)) {
          throw new Error(`非法 renderer：${String(patch.renderer)}`);
        }
        scene.renderer = r;
      }
      if (typeof patch.vo === "string") scene.vo = patch.vo;

      scene.rev += 1;
      scene.revisions = [
        ...scene.revisions,
        { at: new Date().toISOString(), reason: "手动编辑", by: "user" },
      ];
      // 仅更新 meta，不触发重渲 / 重绘草稿。
      push(p, `已更新第 ${scene.index} 镜`);
    } catch (err) {
      fail(p, err);
    }
  });
}

// ---- 失败后重试分镜（B1 测试阶段）：stage=failed 时直接开一次分镜重生。
// 需要 concept 已选定（否则回退到 concept 闸门重选）。
export async function retryStoryboard(id: string): Promise<void> {
  await withLock(id, async () => {
    const p = getProject(id);
    if (!p) return;
    if (p.chosenConcept == null) {
      p.stage = "concept";
      p.awaitingGate = "concept";
      p.error = null;
      push(p, "请先选定创意方向");
      return;
    }
    try {
      p.error = null;
      await runStoryboard(p);
    } catch (err) {
      fail(p, err);
    }
  });
}

// ---- 每步可返回（#6）：按当前 stage 回退到上一个闸门并重置下游 ----
export async function goBack(id: string): Promise<void> {
  await withLock(id, async () => {
    const p = getProject(id);
    if (!p) return;
    try {
      switch (p.stage) {
        // 闸门②（分镜）/ 讲稿 → 回 concept
        case "storyboard":
        case "storyboarding":
        case "drafting":
        case "script":
        case "scripting": {
          p.stage = "concept";
          p.awaitingGate = "concept";
          p.scenes = [];
          p.chosenConcept = null; // 清空更直观，让用户重选
          push(p, "已返回创意方向，请重新选择");
          break;
        }

        // 闸门③（渲染 / chunk）→ 回 storyboard。assembling/qa 是成片中途的瞬态，一并退回分镜。
        case "rendering":
        case "assembling":
        case "qa": {
          p.stage = "storyboard";
          p.awaitingGate = "storyboard";
          for (const s of p.scenes) {
            s.status = "pending";
            s.mp4 = undefined; // 清空正片段（保留 draftImage）
          }
          push(p, "已返回分镜确认");
          break;
        }

        // 闸门④（成片）→ 回 rendering
        case "final": {
          p.stage = "rendering";
          p.awaitingGate = "chunk";
          p.outputs = { ...p.outputs, mp4: undefined }; // 清空成片（scene.mp4 保留）
          for (const s of p.scenes) {
            // 已生成的镜回到待审核态
            if (s.mp4) s.status = "await_review";
          }
          push(p, "已返回分镜渲染");
          break;
        }

        // concept（最前闸门）/ 其它前置态 → 无操作，原样 emit
        default: {
          push(p, "已在最前一步，无法再返回");
          break;
        }
      }
    } catch (err) {
      fail(p, err);
    }
  });
}
