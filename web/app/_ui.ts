// 轻客户端工具：toast + api fetch 助手 + 视觉映射常量。
// 仅在浏览器端使用（'use client' 组件里 import）。
import type {
  Renderer,
  VideoType,
  Aspect,
  Stage,
  GateId,
  CreateProjectBody,
  GateBody,
  EditBody,
  ProjectSummary,
  AssetItem,
  InputItem,
  RoleEntry,
  RoleKind,
  CustomStyleBody,
} from "@/lib/types";
import type { StylePack } from "@/lib/styles";

export { STYLE_PACKS, recommendedFor, styleById } from "@/lib/styles";
export type { StylePack } from "@/lib/styles";

/* ---------- toast ---------- */
export function toast(msg: string) {
  if (typeof document === "undefined") return;
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  const anyT = t as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
  clearTimeout(anyT._t);
  anyT._t = setTimeout(() => t.classList.remove("show"), 1900);
}

/* ---------- fetch 助手 ---------- */
async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(
      (data && (data.error || data.message)) || `HTTP ${res.status}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return jsonOrThrow<T>(res);
  },
  async get<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url, { method: "GET" });
    return jsonOrThrow<T>(res);
  },
  // 表单上传（不手动设 Content-Type，让浏览器带 multipart boundary）。
  async postForm<T = unknown>(url: string, form: FormData): Promise<T> {
    const res = await fetch(url, { method: "POST", body: form });
    return jsonOrThrow<T>(res);
  },
  async del<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url, { method: "DELETE" });
    return jsonOrThrow<T>(res);
  },
  login(password: string) {
    return this.post<{ ok: true }>("/api/login", { password });
  },
  projects() {
    return this.get<{ projects: ProjectSummary[] }>("/api/projects");
  },
  createProject(body: CreateProjectBody) {
    return this.post<{ id: string }>("/api/projects", body);
  },
  gate(id: string, body: GateBody) {
    return this.post<unknown>(`/api/projects/${id}/gate`, body);
  },
  // 概念/分镜逐项编辑（#7 #8）—— 回填靠 SSE 推新 project。
  edit(id: string, body: EditBody) {
    return this.post<unknown>(`/api/projects/${id}/edit`, body);
  },
  // 返回上一步（#6）—— 回退到上一个闸门，下游状态由后端重置。
  nav(id: string) {
    return this.post<unknown>(`/api/projects/${id}/nav`, { action: "back" });
  },

  // ---- 批 B：两段式创建 + 多输入 / 素材 / 角色 / 自定义风格 ----
  // 启动流程（两段式创建：autostart:false 建项目并传完料后调它）。
  start(id: string) {
    return this.post<{ ok: boolean }>(`/api/projects/${id}/start`);
  },
  // 追加代码包（#2）：multipart。
  addInputFile(id: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return this.postForm<{ ok: boolean; input: InputItem }>(
      `/api/projects/${id}/inputs`,
      fd
    );
  },
  // 追加文本输入（#2）：url / idea。
  addInputText(id: string, body: { kind: "url" | "idea"; value: string }) {
    return this.post<{ ok: boolean; input: InputItem }>(
      `/api/projects/${id}/inputs`,
      body
    );
  },
  // 项目素材：文件型（image/logo/clip）。
  uploadAsset(
    id: string,
    file: File,
    kind = "image",
    note?: string,
    usage?: "must-appear" | "may-use" | "tone-only"
  ) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (note) fd.append("note", note);
    if (usage) fd.append("usage", usage);
    return this.postForm<{ ok: boolean; asset: AssetItem }>(
      `/api/projects/${id}/assets`,
      fd
    );
  },
  // 项目素材：非文件型（color / font）。
  addAssetMeta(id: string, body: {
    kind: "color" | "font";
    ref: string;
    name?: string;
    usage?: "must-appear" | "may-use" | "tone-only";
  }) {
    return this.post<{ ok: boolean; asset: AssetItem }>(
      `/api/projects/${id}/assets`,
      body
    );
  },
  // 角色 / 品牌库（跨项目）。
  listRoles() {
    return this.get<{ roles: RoleEntry[] }>("/api/library/roles");
  },
  createRole(body: {
    kind: RoleKind;
    name: string;
    description: string;
    palette?: string[];
    assetRefs?: string[];
  }) {
    return this.post<{ ok: boolean; role: RoleEntry }>("/api/library/roles", body);
  },
  // 自定义风格库（#4）。
  listCustomStyles() {
    return this.get<{ styles: StylePack[] }>("/api/library/styles");
  },
  createCustomStyle(body: CustomStyleBody) {
    return this.post<{ ok: boolean; style: StylePack }>("/api/library/styles", body);
  },
  // 上传库文件（自定义风格参考图 / 角色图）→ 返回 ref。
  uploadLibraryFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return this.postForm<{ ok: boolean; ref: string }>("/api/library/upload", fd);
  },
  // 首页/历史：真实统计（状态计数 + 磁盘占用）。
  stats() {
    return this.get<StatsResp>("/api/stats");
  },
};

export interface StatsResp {
  counts: { total: number; draft: number; rendering: number; done: number; failed: number };
  usedBytes: number;
  diskFree: number;
  diskTotal: number;
}

// 库文件 URL（自定义风格主图 / 角色图）。
export function libraryFileUrl(ref: string) {
  return `/api/library/file?ref=${encodeURIComponent(ref)}`;
}

/* ---------- 媒体 URL 助手 ---------- */
export function fileUrl(id: string, path: string) {
  return `/api/projects/${id}/file?path=${encodeURIComponent(path)}`;
}
export function downloadUrl(id: string, kind: string) {
  return `/api/projects/${id}/download?kind=${kind}`;
}

/* ---------- aspect → CSS aspect-ratio ---------- */
export function ratio(aspect: Aspect | string): string {
  return aspect === "9:16" ? "9/16" : aspect === "1:1" ? "1/1" : "16/9";
}

/* ---------- 后端渲染器徽章映射 ---------- */
export const RB: Record<Renderer, { cls: string; name: string }> = {
  remotion: { cls: "bk-remotion", name: "信息镜 · Remotion" },
  generative: { cls: "bk-generative", name: "氛围镜 · 生成式" },
  lottie: { cls: "bk-lottie", name: "动态图标 · Lottie" },
  "still-kenburns": { cls: "bk-kenburns", name: "素材推拉 · KenBurns" },
};

/* ---------- 类型元信息（移植原型 TYPES） ---------- */
export const TYPES: Record<
  VideoType,
  { name: string; desc: string; vo: boolean; note: string; grad: string }
> = {
  showreel: {
    name: "产品 showreel",
    desc: "把产品/网站做成有情绪曲线的高级短片",
    vo: false,
    note: "4 闸门 · 默认不配音",
    grad: "linear-gradient(135deg,#FF5A1F,#FF9A5A)",
  },
  teaching: {
    name: "教学小视频",
    desc: '一步步把"怎么做"讲清楚',
    vo: true,
    note: "5 闸门（含讲稿确认）· 默认配音",
    grad: "linear-gradient(135deg,#2156B4,#5AA0FF)",
  },
  popsci: {
    name: "知识科普",
    desc: "把一个概念讲懂、讲出高级感",
    vo: true,
    note: "5 闸门（含讲稿确认）· 默认配音",
    grad: "linear-gradient(135deg,#0E8C6E,#46C9A4)",
  },
};

/* ---------- 风格候选（按类型） ---------- */
export const STYLES: Record<
  VideoType,
  { id: string; name: string; tone: string; grad: string }[]
> = {
  showreel: [
    {
      id: "editorial-saas",
      name: "克制编辑感 SaaS",
      tone: "大留白 · 单一火花色",
      grad: "linear-gradient(135deg,#F6F7F9,#E9ECF1)",
    },
    {
      id: "apple-keynote-light",
      name: "明亮 Keynote",
      tone: "高 key · 大字号 · 柔和阴影",
      grad: "linear-gradient(135deg,#FFFFFF,#EDEFF3)",
    },
  ],
  popsci: [
    {
      id: "deep-space-diagram",
      name: "深空示意图",
      tone: "深色氛围 · 图解为主 · 高级感",
      grad: "linear-gradient(135deg,#14323a,#1f6b5e)",
    },
    {
      id: "minimal-ink",
      name: "极简水墨",
      tone: "克制留白 · 线条叙事",
      grad: "linear-gradient(135deg,#F6F7F9,#DDE2E8)",
    },
  ],
  teaching: [
    {
      id: "apple-keynote-light",
      name: "明亮 Keynote",
      tone: "高 key · 大字号 · 柔和阴影",
      grad: "linear-gradient(135deg,#FFFFFF,#EDEFF3)",
    },
    {
      id: "bento",
      name: "Bento 网格",
      tone: "分块卡片 · 信息密度",
      grad: "linear-gradient(135deg,#2156B4,#5AA0FF)",
    },
  ],
};

/* ---------- 公共骨架闸门（railFor） ---------- */
export type RailStep = { k: GateId | "script"; l: string };
export function railFor(type: VideoType): RailStep[] {
  const base: RailStep[] = [
    { k: "concept", l: "方向" },
    { k: "storyboard", l: "分镜" },
    { k: "chunk", l: "分段" },
    { k: "final", l: "终检" },
  ];
  if (type === "popsci" || type === "teaching") {
    base.splice(1, 0, { k: "script", l: "讲稿" });
  }
  return base;
}

/* ---------- stage → 当前 rail 索引 ---------- */
export function railIndex(stage: Stage, type: VideoType): number {
  const map: Record<string, RailStep["k"]> = {
    ingesting: "concept",
    decomposing: "concept",
    briefing: "concept",
    concept: "concept",
    scripting: "script",
    script: "script",
    storyboarding: "storyboard",
    drafting: "storyboard",
    storyboard: "storyboard",
    rendering: "chunk",
    assembling: "final",
    qa: "final",
    final: "final",
    done: "final",
  };
  const key = map[stage];
  return railFor(type).findIndex((s) => s.k === key);
}

/* ---------- 统一状态系统（design/DESIGN.md §6）---------- */
// 项目级状态：从 stage 派生（草稿/渲染中/已完成/失败）。
export type ProjStatusKey = "draft" | "rendering" | "done" | "failed";
export function projectStatus(stage: Stage): { key: ProjStatusKey; label: string; cls: string } {
  if (stage === "done") return { key: "done", label: "已完成", cls: "ok" };
  if (stage === "failed") return { key: "failed", label: "失败", cls: "err" };
  if (["rendering", "assembling", "qa", "drafting", "storyboarding", "scripting"].includes(stage))
    return { key: "rendering", label: "渲染中", cls: "progress" };
  return { key: "draft", label: "草稿", cls: "pending" };
}

// 阶段（鼠标可读的当前所在闸门/流程位置）。
export function stageLabel(st: Stage): string {
  const map: Partial<Record<Stage, string>> = {
    done: "已完成",
    storyboard: "分镜确认",
    rendering: "分段预览",
    concept: "方向确认",
    script: "讲稿确认",
    final: "最终检查",
    failed: "失败",
    ingesting: "内容准备",
    decomposing: "内容准备",
    briefing: "内容准备",
    scripting: "讲稿确认",
    storyboarding: "分镜确认",
    drafting: "分镜确认",
    assembling: "最终检查",
    qa: "最终检查",
  };
  return map[st] || st;
}

// 镜头/分段级状态（SceneStatus）→ 展示词 + .status 类名（颜色语义）。
// 关键修正：await_review 用 review(琥珀) 与 rendering 的 progress(蓝) 区分。
export const SCENE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "待生成", cls: "pending" },
  rendering: { label: "渲染中", cls: "progress" },
  await_review: { label: "待确认", cls: "review" },
  approved: { label: "已通过", cls: "ok" },
  redo: { label: "待重做", cls: "err" },
};

/* ---------- 格式化 ---------- */
export function fmtBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtRelTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return `今天 ${hhmm}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hhmm}`;
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 30) return `${days} 天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- 进度阶段文案（兜底；优先用 SSE message） ---------- */
export const PROG_TXT: Record<string, string> = {
  ingesting: "抓取内容…",
  decomposing: "拆解内容为可引用料块…",
  briefing: "本机 claude CLI 拆解定调 · 生成 brief + 统一 config…",
  scripting: "本机 claude CLI 写讲稿 · 梳理知识点…",
  storyboarding: "本机 claude CLI 写分镜骨架 · 给每镜选渲染后端…",
  drafting: "gpt-image 逐镜出方向草稿…",
  assembling: "成片合成 · 拼接 → 混音 → 烧字幕 → 导出…",
  qa: "体检中 · 跑类型特有 QA 规则…",
};
