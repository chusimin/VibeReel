"use client";

import { ReactNode } from "react";
import Sidebar from "./Sidebar";

type Nav = "home" | "history" | "library" | "settings";

// 顶层页面壳：左导航 + 顶栏（搜索/操作）+ 居中内容。design/DESIGN.md §5.1。
export default function AppShell({
  active,
  searchPlaceholder,
  actions,
  wide,
  children,
}: {
  active?: Nav;
  searchPlaceholder?: string;
  actions?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <Sidebar active={active} />
      <div className="main">
        <div className="topbar">
          {searchPlaceholder ? (
            <div className="search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input placeholder={searchPlaceholder} />
              <span className="kbd">⌘K</span>
            </div>
          ) : (
            <div className="sp" />
          )}
          <div className="sp" />
          {actions}
        </div>
        <div className={`content ${wide ? "wide" : ""}`}>{children}</div>
      </div>
    </div>
  );
}

/* 顶栏常用件 ---------------------------------------------------- */

export function EnginePill({ label = "本地引擎就绪" }: { label?: string }) {
  return (
    <span className="engine">
      <span className="led" />
      {label}
    </span>
  );
}

export function IconBtn({
  title,
  onClick,
  children,
}: {
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button className="iconbtn" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
