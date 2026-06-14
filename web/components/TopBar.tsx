"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// 顶栏 + 壳（移植原型 shell）。active: 'home' | 'settings'。
export default function TopBar({
  active,
}: {
  active?: "home" | "settings";
}) {
  const router = useRouter();
  return (
    <div className="topbar">
      <div className="brand" onClick={() => router.push("/")}>
        <span className="dot"></span>VibeReel
      </div>
      <div className="nav">
        <Link className={active === "home" ? "on" : ""} href="/">
          项目
        </Link>
        <Link className={active === "settings" ? "on" : ""} href="/settings">
          设置
        </Link>
      </div>
      <div className="sp"></div>
      <span className="chip" title="POC：后端 spawn 本机 claude CLI，零 key">
        ⚙️ POC · 本地 claude CLI
      </span>
    </div>
  );
}
