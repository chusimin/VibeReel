"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell, { EnginePill } from "@/components/AppShell";
import { api, toast } from "@/app/_ui";

export default function SettingsPage() {
  const router = useRouter();
  // POC：模型档为本地状态，不必持久化。
  const [model, setModel] = useState("claude-sonnet-4-6");

  function save() {
    toast("已保存模型档（POC 用本机 claude）");
    router.push("/");
  }
  async function logout() {
    try {
      await api.post("/api/logout");
    } catch {
      /* ignore */
    }
    router.push("/login");
  }

  return (
    <AppShell active="settings" actions={<EnginePill />}>
      <div className="fade" style={{ maxWidth: 640 }}>
        <h1>设置</h1>
        <p className="muted" style={{ margin: "6px 0 24px" }}>
          POC 阶段：创意步直接调用<b>本机 claude 命令行</b>，复用你已登录的 Claude Code，<b>零 API key</b>。
        </p>

        <div className="card pad">
          <div className="spaced">
            <label className="fld" style={{ margin: 0 }}>运行方式（POC）</label>
            <span className="status ok"><span className="d" />本地 claude CLI 已检测</span>
          </div>
          <div className="mono aux" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 13px", marginTop: 10, overflowX: "auto", whiteSpace: "nowrap" }}>
            claude -p &quot;…&quot; --output-format json --model &lt;档&gt; --append-system-prompt &quot;&lt;四件套知识包&gt;&quot;
          </div>

          <label className="fld" style={{ marginTop: 18 }}>模型档（映射 claude --model）</label>
          <select className="input" id="model" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="claude-haiku-4-5">Haiku · 快而省</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6 · 默认</option>
            <option value="claude-opus-4-8">Opus · 最强</option>
          </select>

          <div className="banner info" style={{ marginTop: 18 }}>
            平台 key（OpenAI 草稿 / 生成式视频）仍预置在服务端，无需你填。
          </div>
          <div className="hint" style={{ marginTop: 12 }}>
            v1 生产将增加 <b>BYO Anthropic key</b>（粘贴到设置 · 仅存浏览器 · 请求透传 · 不落盘）。POC 先用本机 CLI 跑通。
          </div>

          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn" onClick={save}>保存</button>
            <button className="btn ghost" onClick={() => router.push("/")}>返回</button>
            <div style={{ flex: 1 }} />
            <button className="btn danger" onClick={logout}>退出登录</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
