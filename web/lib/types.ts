// VibeReel POC —— 单一真相源类型（前后端共用）。
// 与 docs/prd/03-数据模型 对齐，POC 精简：去掉未用字段，渲染走 ffmpeg 占位。

export type VideoType = "showreel" | "teaching" | "popsci";
export type Aspect = "16:9" | "9:16" | "1:1";
export type Renderer = "remotion" | "generative" | "lottie" | "still-kenburns";
export type GateId = "concept" | "script" | "storyboard" | "chunk" | "final";

export type Stage =
  | "ingesting"
  | "decomposing" // 批 B(#5)：抓料后把内容拆成可引用料块
  | "briefing"
  | "concept" // 闸门①
  | "scripting" // 科普/教学特有
  | "script" // 闸门 script
  | "storyboarding"
  | "drafting"
  | "storyboard" // 闸门②
  | "rendering" // 闸门③（逐镜）
  | "assembling"
  | "qa"
  | "final" // 闸门④
  | "done"
  | "failed";

export type SceneStatus =
  | "pending"
  | "rendering"
  | "await_review"
  | "approved"
  | "redo";

// ============================================================
// 批 B —— 多输入 / 料块 / 素材 / 角色 / 自定义风格
// ============================================================

// ---- #2 多输入：链接 / 想法 / 代码包，可同时存在多条 ----
export type InputKind = "url" | "idea" | "code";

export interface InputItem {
  id: string; // 短 id（前端/引用用）
  kind: InputKind;
  value: string; // url / 想法文本 / 代码包原始文件名
  label?: string; // 展示用短标签
  meta?: {
    // 代码包解析摘要（上传时由后端填）
    fileName?: string;
    fileCount?: number;
    bytes?: number;
    tree?: string; // 文件树文本（节选）
    fetched?: boolean; // url 是否抓到正文
  };
}

// ---- #5 料块：把素材主动拆成可被 @引用 的小块 ----
export type ChunkKind =
  | "feature" // 功能/卖点
  | "metric" // 数据/指标
  | "fact" // 事实/背景
  | "quote" // 金句/原话
  | "term" // 术语/概念
  | "step" // 步骤（教学）
  | "audience" // 受众
  | "differentiator" // 差异点
  | "other";

export interface MaterialChunk {
  id: string; // 短 slug，作为 @引用 token（如 m1 / feat-speed）
  kind: ChunkKind;
  title: string; // 短标题
  detail: string; // 一两句正文
  sourceInputId?: string; // 来自哪条输入
}

export interface Material {
  summary: string; // 一段话总览（喂 agent 定调用）
  chunks: MaterialChunk[]; // 可引用料块
}

// ---- #1 素材库（项目级）：图 / logo / 片段 / 色 / 字体 ----
export type AssetKind = "image" | "logo" | "clip" | "color" | "font";

export interface AssetItem {
  id: string;
  name: string;
  kind: AssetKind;
  ref: string; // 文件相对路径（assets/xxx）或色值/字体名
  note?: string;
}

// ---- #1 角色 / 品牌库（跨项目复用，存全局 library）----
export type RoleKind = "brand" | "character" | "product";

export interface RoleEntry {
  id: string;
  kind: RoleKind;
  name: string;
  description: string;
  palette?: string[]; // hex 列表
  assetRefs?: string[]; // library 内文件相对路径
  createdAt: string;
}

// ============================================================

export interface Concept {
  title: string;
  tone: string;
  words: string[];
  look: string; // 画面长什么样：构图 / 视觉处理 / 典型镜头（#7 让方向被看懂）
  palette: string; // 配色倾向（文字描述或 hex 提示）
  pacing: string; // 节奏（如"快切 ~0.8s/镜，硬切为主"）
  refs?: string[]; // 引用到的料块 id（#5，可空）
}

export interface Revision {
  at: string;
  reason: string;
  by: "agent" | "user";
}

// 引擎模板视觉（真实渲染）：对应 vibemotion remotion/src/templates 的 visual.type + props。
export type EngineVisualType =
  | "title"
  | "kinetic-text"
  | "bullet-list"
  | "stat"
  | "quote"
  | "section-card"
  | "term-define"
  | "cta"
  | "comparison"
  | "bg-only";

export interface SceneVisual {
  type: EngineVisualType;
  subtitle?: string; // title / section-card
  value?: string; // stat 大数字
  items?: string[]; // bullet-list / comparison
  chapter?: { num?: string; title?: string }; // section-card
  term?: string; // term-define
  definition?: string; // term-define
  points?: string[]; // term-define
}

export interface SceneMeta {
  index: number; // 1-based
  role: string;
  durationSec: number;
  onScreenText: string;
  vo: string; // 配音文案（showreel 可空）
  renderer: Renderer; // agent 选（UI 徽章；引擎渲染以 visual 为准）
  visual?: SceneVisual; // 引擎模板视觉（真实渲染用；缺省由 engine 启发式推断）
  draftImage?: string; // /api/projects/:id/file?path=drafts/scene-N.png
  mp4?: string; // 正片段相对路径
  status: SceneStatus;
  rev: number;
  revisions: Revision[];
  refs?: string[]; // 引用到的料块/素材 id（#5，可空）
}

export interface ProjectMeta {
  version: 2;
  projectId: string;
  createdAt: string;
  title: string;
  videoType: VideoType;
  fourPack: {
    structureId: string;
    playbookRef: string;
    styleId: string;
    gates: GateId[];
    qaRules: string[];
  };
  inputs: InputItem[]; // #2 多输入（链接/想法/代码包）
  material: Material | null; // #5 拆解后的料块（decomposing 后填）
  assets: AssetItem[]; // #1 项目级素材库
  roleRefs: string[]; // #1 选用的角色/品牌库条目 id（指向全局 library）
  aspect: Aspect;
  vo: boolean; // 配音（缺省随类型；可被创建时 voiceover 覆盖。TTS 生成待后端接入）
  subtitle: boolean; // 字幕开关（烧录待后端接入；当前仅记录偏好）
  model: string; // claude --model 档（POC：sonnet/opus/haiku 别名）
  stage: Stage;
  concepts: Concept[]; // 闸门① 候选
  chosenConcept: number | null;
  scenes: SceneMeta[];
  error: string | null;
  outputs: { mp4?: string; srt?: string; zip?: string };
  // 闸门排队提示：当前是否在等用户决策（不为 null 即"卡在闸门"）
  awaitingGate: GateId | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  videoType: VideoType;
  aspect: Aspect;
  stage: Stage;
  createdAt: string;
  thumb?: string; // 首帧缩略图相对路径（草稿/成片）；列表展示用，可空
}

// ---- API 形状（前后端契约） ----

export interface CreateProjectBody {
  videoType: VideoType;
  // 新：多输入；旧：单 input（兼容旧前端/旧 curl，后端会归一化为 inputs）。
  inputs?: InputItem[];
  input?: { kind: "url" | "idea"; value: string };
  aspect: Aspect;
  styleId: string; // 内置 11 个之一，或 custom-* 自定义风格 id
  model?: string;
  roleRefs?: string[]; // #1 选用的角色/品牌库条目
  voiceover?: boolean; // 用户覆盖配音开关（缺省随类型）。生成待后端 TTS。
  subtitle?: boolean; // 字幕开关（缺省关）。烧录待后端。
  // 若 false：创建后不自动跑流程（等代码包/素材上传完再 /start）。默认 true。
  autostart?: boolean;
}

// POST /api/projects/:id/gate 的 body 联合
export type GateBody =
  | { gate: "concept"; choice: number }
  | { gate: "script"; action: "confirm" } | { gate: "script"; action: "redo"; note?: string }
  | { gate: "storyboard"; action: "confirm" }
  | { gate: "storyboard"; action: "redo"; note?: string }
  | { gate: "chunk"; action: "approve"; index: number }
  | { gate: "chunk"; action: "redo"; index: number; note?: string }
  | { gate: "chunk"; action: "continue" } // 确认前 2 镜方向 → 自动续渲其余全部（#9）
  | { gate: "chunk"; action: "assemble" } // 全部满意 → 合成成片（#9）
  | { gate: "final"; action: "done" };

// POST /api/projects/:id/edit —— 概念/分镜逐项可改（#7 #8）
export interface EditBody {
  target: "concept" | "scene";
  index: number; // concept 数组下标 / scene 的 1-based index
  patch: Partial<{
    // concept 字段
    title: string;
    tone: string;
    look: string;
    palette: string;
    pacing: string;
    words: string[];
    // scene 字段
    role: string;
    onScreenText: string;
    durationSec: number;
    renderer: Renderer;
    vo: string;
    // 共用：引用料块/素材 id
    refs: string[];
  }>;
}

// POST /api/projects/:id/nav —— 每一步可返回（#6）
export interface NavBody {
  action: "back"; // 回退到上一个闸门（重置下游状态）
}

// ---- 自定义风格（#4）：三种来源，统一产出一个 StylePack ----
export type CustomStyleMode = "image" | "manual" | "text";

export interface CustomStyleBody {
  mode: CustomStyleMode;
  name?: string;
  // manual：直接给色板/字体
  bg?: string;
  fg?: string;
  accent?: string;
  font?: string;
  // text：一句风格描述（交给 agent 提风格基因）
  description?: string;
  // image：已上传到 library 的参考图相对路径（后端用 ffmpeg 提主色）
  imageRef?: string;
}

// SSE：每个事件直接推全量 project 快照，前端做纯函数渲染。
// event: message ; data: JSON.stringify({ project, message?, pct? })
export interface SSEPayload {
  project: ProjectMeta;
  message?: string;
  pct?: number;
}
