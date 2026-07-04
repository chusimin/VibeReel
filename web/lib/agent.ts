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
import { describeRoles, resolveStyle } from "@/lib/library";
import { extractJson } from "@/lib/json";
import { skillBlockFor } from "@/lib/skills";

// 把用户选定的 styleId 翻译成能嗂给 AI 的文本（bg/fg/accent + label + 风格内含义）。
// 这是修复“concept 编风格、与用户选择完全无关”的关键桁。
function styleBriefFor(styleId: string): string {
  const pack = resolveStyle(styleId);
  if (!pack) return `风格：${styleId}（未知）`;
  const lines = [
    `styleId: ${pack.id}`,
    `styleName: ${pack.name}（${pack.label}）`,
    `硬约束色盘（必须基于这 3 个颜色设计 concept.palette 与分镜配色）：`,
    `  bg（底色）  = ${pack.bg}`,
    `  fg（主字）  = ${pack.fg}`,
    `  accent（强调）= ${pack.accent}`,
  ];
  if (pack.font) lines.push(`字体倾向：${pack.font}`);
  if (pack.descriptor) lines.push(`风格基因：${pack.descriptor}`);
  return lines.join("\n");
}

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

  const styleBrief = styleBriefFor(p.fourPack.styleId);
  const skills = skillBlockFor("concept", p.videoType);

  const prompt = [
    NO_BROWSE,
    `你是资深短视频创意总监。视频类型：${TYPE_LABEL[p.videoType]}。`,
    await materialBlock(p),
    `画幅：${p.aspect}。`,
    "",
    "【用户已选定的风格（palette 必须从下面 3 个 hex 衍生，不得自创无关颜色）】",
    styleBrief,
    "",
    skills ? "【品味库参考（方向也得遵守）】" : "",
    skills,
    "",
    knowledge,
    "",
    "请基于以上素材 + 风格 + 品味，产出 2 到 3 个差异化的创意方向。",
    "额外硬约束：",
    "- palette 必须基于用户选定风格的 bg/fg/accent 衍生（可以描述“以 accent 强调、底色坐镇”等），禁止自创完全无关的颜色。",
    "- pacing 必须包含一个具体的“平均镜时长建议”（如 快切 ~0.8s/镜 或 中速 ~1.5s/镜），后面分镜会据此定时长。",
    "- look 必须包含主动效基因（3 个动词组合，如 “fade+slide+typewriter”）——下一步分镜会严格遵守。",
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

  // 品味库注入（B1 核心）：把 docs/skills 没开发好的 skill 拼进 prompt。
  const skills = skillBlockFor("storyboard", p.videoType);

  const prompt = [
    NO_BROWSE,
    `你是顶级分镜导演（对标 Linear.app / Vercel / Aftermagics 那种品位）。视频类型：${TYPE_LABEL[p.videoType]}。画幅：${p.aspect}。`,
    await materialBlock(p),
    concept ? [
      `选定方向：${concept.title}（调性：${concept.tone}；关键词：${concept.words.join("、")}）`,
      concept.look ? `方向 look（分镜必须遵守这个画面描述）：${concept.look}` : "",
      concept.palette ? `方向 palette（分镜配色基因）：${concept.palette}` : "",
      concept.pacing ? `方向 pacing（分镜时长必须匹配）：${concept.pacing}` : "",
      Array.isArray(concept.refs) && concept.refs.length ?
        `方向使用的料块（优先在分镜里引用）：${concept.refs.join(", ")}` : "",
    ].filter(Boolean).join("\n") : "",
    // 用户选定风格——分镜阶段再次强调（保证与 concept.palette 一致时能双重锁定）
    `【用户选定风格（需严格匹配）】\n${styleBriefFor(p.fourPack.styleId)}`,
    // 脚本（如果前面过了 script 闸门）：必须咘合进分镜。
    p.script ? `【已确认讲稿（必须逐镜咘合）】\n${p.script}` : "",
    p.vo ? "本片需要配音（vo 必须填写口播文案）。" : "本片无配音（vo 留空字符串）。",
    opts?.note ? `用户打回意见（务必据此明显调整）：${opts.note}` : "",
    "",
    skills ? "─".repeat(60) : "",
    skills ? "【品味库（以下规则必须遵守）】" : "",
    skills,
    skills ? "─".repeat(60) : "",
    "",
    "请基于以上方向 + 料块 + 风格 + 品味规则，产出 12~16 个分镜（showreel 快切节奏）。",
    "严格要求：",
    "1. 只输出一个 JSON 数组，不要解释、不要 Markdown，第一个字符必须是 [",
    "2. 分镜总数 12-16（不可少于 12，不可多于 16）",
    "3. durationSec 只允许 0.6~2.5 的数（首尾镜最多 3.5s；末镜必须 >= 1.5s 给用户“静止记住”时间）",
    "4. 全片主动效动词（primaryMotion）只允许 3 个从 {fade, slide, typewriter, scale, mask-reveal, blur, cross-fade} 中选，必须在每一镜声明使用哪一个",
    "5. 至多 1 个镜标记为 isDropShot=true（位置在 60-75% 时长处，密度必须是 minimal，动效可用 mask-reveal/scale）",
    "6. 每一镜声明 density: minimal(1-2元素) 或 medium(3-5元素)，禁止 dense；相邻两镜密度不能均为 medium",
    "7. onScreenText 每镜 <= 8 个词，末镜必须包含 CTA (如 URL / 按钮文字)",
    "8. 首镜 必须是 minimal，前 1.5s 留空拍（无元素入场）",
    "",
    "每一项形如：",
    '{"index": 1, "role": "镜头作用(中文，如 钩子/讲解/证据/drop/收束/CTA)", "durationSec": 1.2, "onScreenText": "屏幕文字(<=8词)", "vo": "", "visual": {"type": "stat", "value": "24×"}, "refs": ["m1"], "primaryMotion": "fade", "density": "minimal", "isDropShot": false}',
    VISUAL_CATALOG,
    "refs 填这一镜引用的料块/素材 @id（没有就空数组）。index 从 1 连续递增。全部中文。",
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
      renderer: visual ? rendererForVisual(visual.type) : normalizeRenderer(o.renderer, i),
      visual,
      status: "pending",
      rev: 0,
      revisions: [],
      refs: strList(o.refs),
      // 新字段（B1 注入，类型定义已扩）
      primaryMotion: typeof o.primaryMotion === "string" ? o.primaryMotion : undefined,
      density: (o.density === "minimal" || o.density === "medium") ? o.density : undefined,
      isDropShot: o.isDropShot === true,
    };
  });

  if (scenes.length === 0) {
    throw new Error("未产出任何分镜");
  }
  scenes.forEach((s, i) => {
    s.index = i + 1;
  });

  // B2：硬校验——命中致命反例就报错，让用户重来（Q3=a 严格模式）。
  validateStoryboard(scenes);

  return scenes;
}

// ---- 硬校验（命中致命反例报错，前端展示、用户重新触发）----
function validateStoryboard(scenes: SceneMeta[]): void {
  const errs: string[] = [];

  // R 镜数：必须 12-16 之间
  if (scenes.length < 12 || scenes.length > 16) {
    errs.push(`分镜总数 ${scenes.length} 不在 12-16 区间`);
  }

  // R1.3 末镜需 >= 1.5s，且包含 CTA 不能为空
  const last = scenes[scenes.length - 1];
  if (last && last.durationSec < 1.5) {
    errs.push(`末镜时长 ${last.durationSec}s < 1.5s（用户无时间记住 CTA）`);
  }
  if (last && !last.onScreenText.trim()) {
    errs.push("末镜 onScreenText 为空（CTA 丢失）");
  }

  // R1.2 首镜 minimal + 长度 >= 2s（预留拍） —— 只当 AI 标了 density 时才硬检
  const first = scenes[0];
  if (first?.density === "medium") {
    errs.push("首镜 density=medium（需 minimal）");
  }

  // R3.1 主动效基因：全片 primaryMotion 不重复的数 <= 5
  const motions = scenes
    .map((s) => s.primaryMotion)
    .filter((v): v is string => !!v);
  if (motions.length > 0) {
    const uniq = new Set(motions);
    if (uniq.size > 5) {
      errs.push(`主动效种类 ${uniq.size} > 5（primary: ${[...uniq].join(",")}）`);
    }
  }

  // R2.2 禁止密度=dense（虽然 schema 不允许，也多一道防线）
  // 相邻两镜密度不能均为 medium
  for (let i = 1; i < scenes.length; i++) {
    if (
      scenes[i].density === "medium" &&
      scenes[i - 1].density === "medium"
    ) {
      errs.push(
        `分镜 ${i} 和 ${i + 1} 均为 medium 密度（需交替）`
      );
      break;
    }
  }

  // isDropShot 至多 1 个
  const drops = scenes.filter((s) => s.isDropShot);
  if (drops.length > 1) {
    errs.push(`isDropShot 镜 ${drops.length} 个 > 1`);
  }

  if (errs.length > 0) {
    throw new Error(
      `分镜不符合品味库硬约束（本次不部分采纳、请重新生成）：\n- ${errs.join("\n- ")}`
    );
  }
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
