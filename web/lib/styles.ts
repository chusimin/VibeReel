// VibeReel —— 引擎内置 11 个风格包（数据取自 vibe-motion-video/presets/styles）。
// 前后端共用：fourpack 用 recommendedFor 标推荐，向导用 STYLE_PACKS 列全部（#4）。
import type { VideoType } from "@/lib/types";

export interface StylePack {
  id: string;
  name: string; // 短名
  label: string; // 全描述
  bg: string;
  fg: string;
  accent: string;
  // ---- #4 自定义风格扩展（内置包这些字段为空）----
  font?: string; // 字体倾向
  descriptor?: string; // 风格基因描述（喂给 agent）
  heroImage?: string; // 自定义主图（library 相对路径，经 /api/library/file 取）
  custom?: boolean; // 来自全局 library 的自定义风格
  createdAt?: string;
}

export const STYLE_PACKS: StylePack[] = [
  { id: "editorial-saas", name: "克制编辑感 SaaS", label: "Editorial SaaS(对标 ObiN / Varchasva 产品片)", bg: "#F4F2EC", fg: "#0B0B0C", accent: "#6C4CF6" },
  { id: "apple-keynote-light", name: "明亮 Keynote", label: "Apple Keynote(极简大字 · 浅色)", bg: "#FBFBFD", fg: "#1D1D1F", accent: "#0071E3" },
  { id: "apple-keynote", name: "深色 Keynote", label: "Apple Keynote(极简大字 · 深色)", bg: "#000000", fg: "#F5F5F7", accent: "#0A84FF" },
  { id: "alibaba-premium", name: "阿里高级感", label: "暗金外壳 + 蓝白玻璃揭示，对标阿里云发布会 / Ant Design", bg: "#0a0a0a", fg: "#f5f5f5", accent: "#e8682a" },
  { id: "kinetic-type", name: "动感大字幕", label: "Kinetic Type(动感大字幕 · punchy)", bg: "#0B0B0F", fg: "#FFFFFF", accent: "#FFE600" },
  { id: "deep-space-diagram", name: "深空图解", label: "深空图解(暗色 · 语义化冷光 · 渐进揭示)", bg: "#05070d", fg: "#ffffff", accent: "#5b9bff" },
  { id: "minimal-ink", name: "净白极简", label: "净白极简(纯白 · 单一蓝 · 清爽无衬线)", bg: "#FFFFFF", fg: "#18181B", accent: "#2563EB" },
  { id: "cool-mono", name: "冷感工程", label: "冷感工程(冷灰白 · 等宽标注 · 克制青)", bg: "#F4F6F8", fg: "#1A2027", accent: "#0E7C86" },
  { id: "bento", name: "Bento 便当格", label: "Bento 便当格(暖色 · 卡片分区)", bg: "#FFF7ED", fg: "#1C1917", accent: "#F97316" },
  { id: "editorial-serif", name: "书卷精装", label: "书卷精装(暖纸 · 衬线大字 · 铜金点缀)", bg: "#FAF7F1", fg: "#1E1B17", accent: "#9A6A3C" },
  { id: "duoji-pixel", name: "多吉像素", label: "多吉像素柯基(像素风 showreel 风格包)", bg: "#F0F0E0", fg: "#181922", accent: "#F0A020" },
];

const RECO: Record<VideoType, string[]> = {
  showreel: ["apple-keynote-light", "editorial-saas", "alibaba-premium", "kinetic-type"],
  popsci: ["deep-space-diagram", "minimal-ink", "cool-mono"],
  teaching: ["apple-keynote-light", "bento", "editorial-serif"],
};

export function recommendedFor(videoType: VideoType): string[] {
  return RECO[videoType] ?? [];
}

export function styleById(id: string): StylePack | undefined {
  return STYLE_PACKS.find((s) => s.id === id);
}
