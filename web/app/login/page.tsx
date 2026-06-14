"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/_ui";

export default function LoginPage() {
  const router = useRouter();
  const [pw, setPw] = useState("demo");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    setErr("");
    setBusy(true);
    try {
      await api.login(pw);
      router.push("/");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErr(status === 401 ? "密码错误" : "登录失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="card pad fade" style={{ width: 380, textAlign: "center" }}>
        <div
          className="brand"
          style={{
            justifyContent: "center",
            fontSize: 20,
            marginBottom: 6,
          }}
        >
          <span className="dot"></span>VibeReel
        </div>
        <p className="aux" style={{ marginBottom: 22 }}>
          给小白把内容一键做成视频 · 共享密码进入
        </p>
        <label className="fld" style={{ textAlign: "left" }}>
          访问密码
        </label>
        <input
          className="input"
          id="pw"
          type="password"
          placeholder="输入共享密码"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") login();
          }}
        />
        {err ? (
          <div className="banner err" style={{ marginTop: 12 }}>
            {err}
          </div>
        ) : null}
        <button
          className="btn"
          style={{ width: "100%", marginTop: 16 }}
          disabled={busy}
          onClick={login}
        >
          {busy ? "进入中…" : "进入"}
        </button>
        <p className="aux" style={{ marginTop: 14 }}>
          POC 演示 · 共享密码进入
        </p>
      </div>
    </div>
  );
}
