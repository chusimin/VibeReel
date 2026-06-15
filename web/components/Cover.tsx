"use client";

import type { CSSProperties, ReactNode } from "react";

/* ============================================================
   Cover —— 美术化封面框
   统一替代「空盒子」：即使没有真实图，也用「种子→双色相」生成的
   影院级渐变 mesh + 细网格 + 暗角，让每个视觉位都像「高级内容」。
   有真实草稿帧/缩略图（src）时叠在 mesh 之上 + 底部暗角压字。
   SSR 安全：不依赖随机/时间，纯由 seed 派生。
   单一真相源见 design/DESIGN.md。
   ============================================================ */

// 字符串种子 → 稳定色相（0–359）。同一项目/同一镜恒定一种封面色。
function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function Cover({
  seed = "vibereel",
  src,
  aspect = "16/9",
  badge,
  caption,
  right,
  play = false,
  icon,
  rounded = 12,
  hoverPop = false,
  className = "",
  style,
  children,
}: {
  seed?: string; // 决定封面色（项目 id / 镜序 / 模板类型…）
  src?: string; // 真实图（草稿帧 / 缩略图），可空
  aspect?: string; // CSS aspect-ratio
  badge?: ReactNode; // 左上角角标（如「草稿」「16:9」）
  caption?: ReactNode; // 底部左（标题）
  right?: ReactNode; // 底部右（时长 / 标签）
  play?: boolean; // 居中播放态
  icon?: ReactNode; // 无图时居中大图标（淡）
  rounded?: number; // 圆角 px
  hoverPop?: boolean; // 悬停时播放键放大
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const h1 = hueFromSeed(seed);
  const h2 = (h1 + 38) % 360;
  const vars = { "--h1": String(h1), "--h2": String(h2) } as CSSProperties;
  const hasMedia = Boolean(src);

  return (
    <div
      className={`cover ${hoverPop ? "hover-pop" : ""} ${className}`}
      style={{ aspectRatio: aspect, borderRadius: rounded, ...vars, ...style }}
    >
      <span className="mesh" />
      <span className="grain" />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="media" />
      ) : icon ? (
        <span className="ic">{icon}</span>
      ) : null}
      <span className="scrim" />
      {play ? <span className="playbtn" aria-hidden /> : null}
      {badge ? <span className="cv-badge">{badge}</span> : null}
      {caption || right ? (
        <span className="cv-foot">
          {caption ? <span className="cap">{caption}</span> : <span />}
          {right ? <span className="rt">{right}</span> : null}
        </span>
      ) : null}
      {children}
    </div>
  );
}
