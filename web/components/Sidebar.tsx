"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// 左侧导航轨（顶层页面）。design/DESIGN.md §5.1。
type Nav = "home" | "history" | "library" | "settings";

const ICONS: Record<Nav, JSX.Element> = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5M9.5 20v-6h5v6" />
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  library: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
};

const ITEMS: { k: Nav; href: string; label: string }[] = [
  { k: "home", href: "/", label: "首页" },
  { k: "history", href: "/history", label: "历史" },
  { k: "library", href: "/library", label: "素材库" },
  { k: "settings", href: "/settings", label: "设置" },
];

export default function Sidebar({ active }: { active?: Nav }) {
  const router = useRouter();
  return (
    <aside className="sidebar">
      <div className="logo" onClick={() => router.push("/")} title="VibeReel">
        V
      </div>
      <nav className="navcol">
        {ITEMS.map((it) => (
          <Link
            key={it.k}
            href={it.href}
            className={`navitem ${active === it.k ? "on" : ""}`}
            title={it.label}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              {ICONS[it.k]}
            </svg>
            <span>{it.label}</span>
          </Link>
        ))}
      </nav>
      <div className="grow" />
      <div
        className="me"
        title="账户 / 退出"
        onClick={() => router.push("/settings")}
      >
        我
      </div>
    </aside>
  );
}
