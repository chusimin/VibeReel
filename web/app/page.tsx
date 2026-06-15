"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell, { EnginePill, IconBtn, BellIcon } from "@/components/AppShell";
import Status from "@/components/Status";
import {
  api,
  projectStatus,
  stageLabel,
  fmtRelTime,
  fmtBytes,
  fileUrl,
  type StatsResp,
} from "@/app/_ui";
import type { ProjectSummary } from "@/lib/types";

const TEMPLATES = [
  { type: "showreel", title: "产品展示", desc: "突出产品卖点，提升转化", tag: "适合发布会 · 电商" },
  { type: "teaching", title: "教学短片", desc: "一步步把怎么做讲清楚", tag: "适合演示 · 教程" },
  { type: "popsci", title: "知识科普", desc: "把概念讲懂、讲出高级感", tag: "适合科普 · 解读" },
] as const;

// 模板卡视觉：线性图标（替代空占位框，贴近 v1 的图像感）。
const TPL_ICON: Record<string, JSX.Element> = {
  showreel: (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  ),
  teaching: (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 6h10M4 12h10M4 18h7" />
      <circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  popsci: (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.7.6-1 1-1 2H9c0-1-.3-1.4-1-2A6 6 0 0 1 12 3Z" />
    </svg>
  ),
};

function actionFor(statusKey: string): string {
  if (statusKey === "done") return "导出";
  if (statusKey === "rendering") return "预览";
  if (statusKey === "failed") return "重试";
  return "继续";
}

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .projects()
      .then((d) => setProjects(d.projects))
      .catch((e) => {
        if ((e as { status?: number }).status === 401) return router.push("/login");
        setErr("加载项目失败");
        setProjects([]);
      });
    api.stats().then(setStats).catch(() => {});
  }, [router]);

  const recent = (projects ?? [])
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6);

  const diskUsed = stats ? stats.diskTotal - stats.diskFree : 0;
  const diskPct = stats && stats.diskTotal ? Math.round((diskUsed / stats.diskTotal) * 100) : 0;

  return (
    <AppShell
      active="home"
      searchPlaceholder="搜索项目或素材"
      actions={
        <>
          <EnginePill />
          <IconBtn title="通知">
            <BellIcon />
          </IconBtn>
        </>
      }
    >
      <div className="fade">
        {/* Hero */}
        <div className="spaced" style={{ alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1>今天要生成什么？</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              选择一个方式开始，几步即可生成可确认的视频方案。
            </p>
          </div>
          <Link className="btn" href="/new">
            ＋ 新建视频
          </Link>
        </div>

        {/* 模板卡 */}
        <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 28 }}>
          {TEMPLATES.map((t) => (
            <Link key={t.type} href={`/new?type=${t.type}`} className="card hover" style={{ padding: 20 }}>
              <div className="thumb" style={{ height: 120, marginBottom: 16, display: "grid", placeItems: "center", color: "var(--text-3)", background: "radial-gradient(120% 120% at 70% 0%, #16181b, #0c0d0f)" }}>
                {TPL_ICON[t.type]}
              </div>
              <h2 style={{ fontSize: 16 }}>{t.title}</h2>
              <p className="aux" style={{ marginTop: 5 }}>{t.desc}</p>
              <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>{t.tag}</p>
            </Link>
          ))}
        </div>

        {/* 快速开始 */}
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 32 }}>
          <Link href="/new" className="card hover spaced" style={{ padding: "16px 20px" }}>
            <div>
              <div style={{ fontWeight: 600 }}>粘贴链接</div>
              <div className="aux" style={{ marginTop: 3 }}>从网页链接或素材直接生成</div>
            </div>
            <span className="dim">→</span>
          </Link>
          <Link href="/new" className="card hover spaced" style={{ padding: "16px 20px" }}>
            <div>
              <div style={{ fontWeight: 600 }}>上传素材</div>
              <div className="aux" style={{ marginTop: 3 }}>上传音视频文件开始</div>
            </div>
            <span className="dim">→</span>
          </Link>
        </div>

        {/* 最近项目 + 右栏 */}
        <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start", gap: 24 }}>
          <div>
            <div className="spaced" style={{ marginBottom: 12 }}>
              <h2>最近项目</h2>
              <Link href="/history" className="aux">查看全部 →</Link>
            </div>

            {err ? <div className="banner err" style={{ marginBottom: 12 }}>{err}</div> : null}

            <div className="card" style={{ overflow: "hidden" }}>
              {projects === null ? (
                <div className="pad row" style={{ gap: 11 }}>
                  <span className="spin" /> <span className="muted">加载项目…</span>
                </div>
              ) : recent.length === 0 ? (
                <div className="empty">
                  <div className="ic">🎬</div>
                  <h3>还没有项目</h3>
                  <p>点右上角「新建视频」开始第一个。</p>
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>项目</th>
                      <th>类型</th>
                      <th>阶段</th>
                      <th>状态</th>
                      <th>更新时间</th>
                      <th style={{ textAlign: "right" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((p) => {
                      const st = projectStatus(p.stage);
                      return (
                        <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => router.push("/projects/" + p.id)}>
                          <td>
                            <div className="row" style={{ gap: 11 }}>
                              {p.thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={fileUrl(p.id, p.thumb)} alt="" className="thumb" style={{ width: 44, height: 30, margin: 0, flex: "0 0 auto", objectFit: "cover" }} />
                              ) : (
                                <span className="thumb" style={{ width: 44, height: 30, margin: 0, flex: "0 0 auto" }} />
                              )}
                              <div className="col">
                                <span className="pri">{p.title}</span>
                                <span className="dim" style={{ fontSize: 11.5 }}>{p.aspect}</span>
                              </div>
                            </div>
                          </td>
                          <td>{TEMPLATES.find((t) => t.type === p.videoType)?.title ?? p.videoType}</td>
                          <td>{stageLabel(p.stage)}</td>
                          <td><Status cls={st.cls} label={st.label} /></td>
                          <td className="dim">{fmtRelTime(p.createdAt)}</td>
                          <td>
                            <div className="actions">
                              <Link className="btn ghost sm" href={"/projects/" + p.id} onClick={(e) => e.stopPropagation()}>
                                {actionFor(st.key)}
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 右栏：概览 + 存储（真实数据） */}
          <div className="col" style={{ gap: 16 }}>
            <div className="summary">
              <h3>概览</h3>
              <div className="kv"><span className="k">全部项目</span><span className="v">{stats?.counts.total ?? "—"}</span></div>
              <div className="kv"><span className="k">草稿</span><span className="v">{stats?.counts.draft ?? "—"}</span></div>
              <div className="kv"><span className="k">渲染中</span><span className="v">{stats?.counts.rendering ?? "—"}</span></div>
              <div className="kv"><span className="k">已完成</span><span className="v">{stats?.counts.done ?? "—"}</span></div>
            </div>

            <div className="summary">
              <h3>存储</h3>
              <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">{stats ? fmtBytes(stats.usedBytes) : "—"}</div>
              <div className="dim" style={{ fontSize: 12, margin: "2px 0 14px" }}>项目数据占用</div>
              <div className="prog"><i style={{ width: `${diskPct}%` }} /></div>
              <div className="aux" style={{ marginTop: 8 }}>
                磁盘已用 {stats ? fmtBytes(diskUsed) : "—"} / {stats ? fmtBytes(stats.diskTotal) : "—"}（{diskPct}%）
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
