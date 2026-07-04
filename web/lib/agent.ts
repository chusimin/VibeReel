// 创意 Agent 业务层 —— 只依赖独立的 llm.complete()，不关心底层是 CLI 还是 API。
// 喂料分三层：① 拆解后的料块(@id 可引用) ② 项目素材库 ③ 角色/品牌库。
import type {
  Concept,
  EngineVisualType,
  ProjectMeta,
  Renderer,
  SceneMeta,
  SceneVisual,
} from "@/lib/types";
import { complete } from "@/lib/llm";
import { gatherMaterial } from "@/lib/ingest";
import { chunksBlock } from "@/lib/decompose";
import { describeRoles } from "@/lib/library";
import { extractJson } from "@/lib/json";

// 兼容旧引用（decompose/customstyle 已直接从 lib/json 取；这里再导出以防外部引用）。
export { extractJson } from "@/lib/json";

const VALID_RENDERERS: Renderer[] = [
  "remotion",
  "generative",
  "lottie",
  "still-kenburns",
];

const TYPE_LABEL: Record<ProjectMeta["videoType"], string> = {
  showreel: "产品 showreel（快节奏、强钩子、卖点驱动）",
  popsci: "科普短片（一个问题切入、把概念讲清楚、有记忆点）",
  teaching: "教学短片（明确目标、分步操作、可复现）",
};

const NO_BROWSE = [
  "重要约束：你处于离线、无工具环境——无法联网、无法浏览网页、无法调用任何技能或工具。",
  "只能基于下面给出的素材推断。不要回复任何与目标输出无关的话；",
  "尤其不要说你需要浏览/访问链接，直接给出要求的输出。",
].join("\n");

// 组装喂 agent 的完整素材上下文：料块优先（已拆解），否则现抓；再叠素材库 + 角色库。
async function materialBlock(p: ProjectMeta): Promise<string> {
  const sections: string[] = [];

  // ① 料块（#5）：拆解过就用料块清单（带 @id），否则现抓原文兜底。
  if (p.material && p.material.chunks.length > 0) {
    sections.push(`素材总览：${p.material.summary}`);
    sections.push(chunksBlock(p.material));
  } else {
    const { block } = await gatherMaterial(p);
    sections.push(`素材原文：\n${block}`);
  }

  // ② 项目素材库（#1）：图/logo/色/字体，提示 agent 可在分镜里点名引用。
  if (p.assets && p.assets.length > 0) {
    const lines = p.assets.map(
      (a) => `@${a.id} [${a.kind}] ${a.name}${a.note ? `（${a.note}）` : ""}`
    );
    sections.push(["【可用素材（用 @id 指代，推拉镜可点名）】", ...lines].join("\n"));
  }

  // ③ 角色/品牌库（#1）：跨项目复用的品牌/角色设定。
  if (p.roleRefs && p.roleRefs.length > 0) {
    const lines = describeRoles(p.roleRefs);
    if (lines.length) {
      sections.push(["【角色/品牌设定（务必保持一致）】", ...lines].join("\n"));
    }
  }

  return sections.join("\n\n");
}

// 跑一次补全并要求返回 JSON 数组；失败自动加压重试一次。
async function getJsonArray(prompt: string, model: string): Promise<unknown[]> {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ask =
      attempt === 0
        ? prompt
        : `${prompt}\n\n上次未正确输出。再次强调：只输出 JSON 数组本身，不要任何解释或前后缀，第一个字符必须是 [。`;
    const text = await complete(ask, { model });
    try {
      const raw = extractJson<unknown>(text);
      if (Array.isArray(raw) && raw.length > 0) return raw;
      lastErr = `输出不是非空 JSON 数组：${text.slice(0, 200)}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`生成失败（已重试）：${lastErr}`);
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

// ---- 概念（闸门①）----
export async function generateConcepts(p: ProjectMeta): Promise<Concept[]> {
  const knowledge = [
    "好方向要点：",
    "- 一个方向只服务一个核心受众与一个核心诉求；",
    "- 有清晰的「钩子—证据—收束」叙事骨架；",
    "- tone 要可执行（如「冷静专业」「俏皮轻快」「克制高级」），而非泛泛；",
    "- 三个关键词应是这个方向的视觉/情绪锚点，能指导后续分镜。",
  ].join("\n");

  const prompt = [
    NO_BROWSE,
    `你是资深短视频创意总监。视频类型：${TYPE_LABEL[p.videoType]}。`,
    await materialBlock(p),
    `画幅：${p.aspect}。`,
    knowledge,
    "",
    "请基于以上素材，产出 2 到 3 个差异化的创意方向。",
    "严格要求：只输出一个 JSON 数组，不要任何解释或 Markdown。",
    "数组每一项形如：",
    '{"title": "方向标题(中文)", "tone": "调性(中文短语)", "words": ["关键词1","关键词2","关键词3"], "look": "画面长什么样：构图/视觉处理/典型镜头，让外行一看就懂这个方向(2-3句中文)", "palette": "配色倾向(中文描述或 hex 提示)", "pacing": "节奏(如 快切 ~0.8s/镜，硬切为主)", "refs": ["引用到的料块id,如 m1"]}',
    "words 必须正好 3 个中文关键词。refs 填这个方向用到的料块 @id（没有就给空数组）。",
    "look 用 2~3 句具体描述这个方向的画面观感（构图、视觉处理、典型镜头），让小白也能看懂。",
    "palette 给配色倾向（文字或 hex 提示均可）；pacing 给节奏描述。全部用中文。",
  ].join("\n");

  const arr = await getJsonArray(prompt, p.model);
  const concepts: Concept[] = arr.slice(0, 3).map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const words = strList(o.words).slice(0, 3);
    while (words.length < 3) words.push("");
    return {
      title: String(o.title ?? "未命名方向"),
      tone: String(o.tone ?? ""),
      words,
      look: String(o.look ?? ""),
      palette: String(o.palette ?? ""),
      pacing: String(o.pacing ?? ""),
      refs: strList(o.refs),
    };
  });
  if (concepts.length === 0) {
    throw new Error("未产出任何创意方向");
  }
  return concepts;
}

// ---- 讲稿（科普/教学 script 闸门）----
export async function generateScript(
  p: ProjectMeta,
  opts?: { note?: string }
): Promise<string> {
  const concept =
    p.chosenConcept != null ? p.concepts[p.chosenConcept] : undefined;
  const prompt = [
    NO_BROWSE,
    `你是短视频脚本撰稿人。视频类型：${TYPE_LABEL[p.videoType]}。`,
    await materialBlock(p),
    concept
      ? `选定方向：${concept.title}（调性：${concept.tone}；关键词：${concept.words.join("、")}）`
      : "",
    opts?.note ? `用户打回意见（务必据此明显调整内容）：${opts.note}` : "",
    "",
    "请写一段 80~160 字的口播讲稿，口语化、单句不超过 25 字，结构为「开场问题/目标 → 讲解 → 收束记忆点」。",
    "只输出讲稿正文本身，不要标题、不要分镜、不要 Markdown。",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await complete(prompt, { model: p.model });
  return text.trim();
}

// ---- 分镜（闸门②）----
export async function generateStoryboard(
  p: ProjectMeta,
  opts?: { note?: string }
): Promise<SceneMeta[]> {
  const concept =
    p.chosenConcept != null ? p.concepts[p.chosenConcept] : undefined;

  const prompt = [
    NO_BROWSE,
    `你是分镜导演。视频类型：${TYPE_LABEL[p.videoType]}。画幅：${p.aspect}。`,
    await materialBlock(p),
    concept
      ? `选定方向：${concept.title}（调性：${concept.tone}；关键词：${concept.words.join("、")}）`
      : "",
    // 脚本（如果前面过了 script 闸门）：必须嗂合进分镜。
    p.script ? `【已确认讲稿（必须逐镜嗂合）】\n${p.script}` : "",
    p.vo ? "本片需要配音（vo 必须填写口播文案）。" : "本片无配音（vo 留空字符串）。",
    opts?.note ? `用户打回意见（务必据此明显调整分镜内容）：${opts.note}` : "",
    "",
    "请产出 8 到 16 个分镜（motion graphics showreel 节奏：快切、高密度）。严格要求：只输出一个 JSON 数组，不要解释或 Markdown。",
    "每一项形如：",
    '{"index": 1, "role": "镜头作用(中文,如 钩子/讲解/证据/收束)", "durationSec": 4, "onScreenText": "屏幕主文字(中文,简短)", "vo": "配音文案(中文,无配音则空字符串)", "visual": {"type": "stat", "value": "24×"}, "refs": ["引用到的料块/素材id,如 m1"]}',
    VISUAL_CATALOG,
    "refs 填这一镜引用的料块/素材 @id（没有就空数组）。index 从 1 开始连续递增；durationSec 取 0.6~1.8 的数（允许 1 位小数，showreel 头尾镜可放到 3~6s 做长 plate）。全部中文。",
  ]
    .filter(Boolean)
    .join("\n");

  const arr = await getJsonArray(prompt, p.model);

  const scenes: SceneMeta[] = arr.slice(0, 16).map((item, i) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const visual = normalizeVisual(o.visual);
    const dur = Number(o.durationSec);
    return {
      index: Number.isFinite(Number(o.index)) ? Number(o.index) : i + 1,
      role: String(o.role ?? "镜头"),
      durationSec: Number.isFinite(dur) && dur > 0 ? Math.round(dur * 10) / 10 : 4,
      onScreenText: String(o.onScreenText ?? ""),
      vo: p.vo ? String(o.vo ?? "") : "",
      // renderer 仅作 UI 徽章；引擎真实渲染以 visual 为准。
      renderer: visual ? rendererForVisual(visual.type) : normalizeRenderer(o.renderer, i),
      visual,
      status: "pending",
      rev: 0,
      revisions: [],
      refs: strList(o.refs),
    };
  });

  if (scenes.length === 0) {
    throw new Error("未产出任何分镜");
  }
  // 规整 index 连续
  scenes.forEach((s, i) => {
    s.index = i + 1;
  });
  return scenes;
}

function normalizeRenderer(value: unknown, fallbackIdx: number): Renderer {
  const v = String(value ?? "").trim() as Renderer;
  if (VALID_RENDERERS.includes(v)) return v;
  // 兜底：按位置轮转，保证多后端覆盖
  return VALID_RENDERERS[fallbackIdx % VALID_RENDERERS.length];
}

// ---- 引擎视觉模板（真实渲染用）----
const VISUAL_CATALOG = [
  "每个分镜还要给一个 visual（决定画面模板，对应真实渲染），从下列里选最贴合内容的一个：",
  '- title：大标题 / 开场钩子。{"type":"title","subtitle":"副标题(可选)"}（主文字用 onScreenText）',
  '- stat：突出一个数字 / 指标。{"type":"stat","value":"24×"}（onScreenText 当说明文字）',
  '- kinetic-text：动感强调一句话。{"type":"kinetic-text"}',
  '- bullet-list：2~4 个并列要点。{"type":"bullet-list","items":["要点1","要点2"]}',
  '- quote：金句 / 用户原话。{"type":"quote"}',
  '- section-card：章节过渡卡。{"type":"section-card","chapter":{"num":"01","title":"章节名"}}',
  '- term-define：解释一个术语 / 概念。{"type":"term-define","term":"术语","definition":"一句话定义","points":["要点(可选)"]}',
  '- comparison：对比两者。{"type":"comparison","items":["A","B"]}',
  '- cta：收束行动号召。{"type":"cta"}',
  "选型原则：开场用 title；含数字/指标的镜优先 stat 并填 value；科普讲概念用 term-define；并列卖点用 bullet-list；结尾用 cta。",
].join("\n");

const VISUAL_TYPES = new Set<EngineVisualType>([
  "title", "kinetic-text", "bullet-list", "stat", "quote",
  "section-card", "term-define", "cta", "comparison", "bg-only",
]);

// 解析 agent 给的 visual（宽松；非法/缺省返回 undefined，交 engine 启发式兜底）。
function normalizeVisual(raw: unknown): SceneVisual | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? "").trim() as EngineVisualType;
  if (!VISUAL_TYPES.has(type)) return undefined;
  const v: SceneVisual = { type };
  if (typeof o.subtitle === "string") v.subtitle = o.subtitle;
  if (typeof o.value === "string") v.value = o.value;
  if (Array.isArray(o.items)) v.items = o.items.map((x) => String(x)).slice(0, 4);
  if (o.chapter && typeof o.chapter === "object") {
    const c = o.chapter as Record<string, unknown>;
    v.chapter = {
      num: c.num != null ? String(c.num) : undefined,
      title: c.title != null ? String(c.title) : undefined,
    };
  }
  if (typeof o.term === "string") v.term = o.term;
  if (typeof o.definition === "string") v.definition = o.definition;
  if (Array.isArray(o.points)) v.points = o.points.map((x) => String(x)).slice(0, 3);
  return v;
}

// visual.type → UI 徽章用的 renderer（仅展示；不影响真实渲染）。
function rendererForVisual(type: EngineVisualType): Renderer {
  switch (type) {
    case "quote":
    case "cta":
      return "generative";
    case "term-define":
    case "comparison":
      return "lottie";
    case "title":
      return "still-kenburns";
    default:
      return "remotion";
  }
}
