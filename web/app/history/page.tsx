"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell, { EnginePill, IconBtn, BellIcon } from "@/components/AppShell";
import Status from "@/components/Status";
import Cover from "@/components/Cover";
import {
  api,
  projectStatus,
  stageLabel,
  fmtRelTime,
  fileUrl,
  type ProjStatusKey,
  type StatsResp,
} from "@/app/_ui";
import type { ProjectSummary, VideoType } from "@/lib/types";

// videoType → 展示名（与首页模板卡一致）。
const TYPE_LABEL: Record<VideoType, string> = {
  showreel: "产品展示",
  teaching: "教学短片",
  popsci: "知识科普",
};

// 筛选 tab（不含「已归档」：后端无归档概念）。
const TABS: { k: "all" | ProjStatusKey; label: string }[] = [
  { k: "all", label: "全部" },
  { k: "draft", label: "草稿" },
  { k: "rendering", label: "渲染中" },
  { k: "done", label: "已完成" },
];

const PAGE_SIZE = 20;

// 操作列动词（按项目状态给上下文动作）。
function actionFor(statusKey: string): string {
  if (statusKey === "done") return "导出";
  if (statusKey === "rendering") return "预览";
  if (statusKey === "failed") return "重试";
  return "继续";
}

export default function HistoryPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"all" | ProjStatusKey>("all");
  const [page, setPage] = useState(1);

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

  // 全部项目，按更新时间倒序。
  const all = useMemo(
    () =>
      (projects ?? [])
        .slice()
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [projects]
  );

  // 当前 tab 过滤。
  const filtered = useMemo(
    () => (tab === "all" ? all : all.filter((p) => projectStatus(p.stage).key === tab)),
    [all, tab]
  );

  // 客户端分页（20/页）。
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const curPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  // 切 tab 回到第一页。
  function pickTab(k: "all" | ProjStatusKey) {
    setTab(k);
    setPage(1);
  }

  // 最近继续：草稿/渲染中（未完成）的前 3 个。
  const continueRows = useMemo(
    () => all.filter((p) => projectStatus(p.stage).key !== "done").slice(0, 3),
    [all]
  );

  const c = stats?.counts;

  return (
    <AppShell
      active="history"
      searchPlaceholder="搜索项目、类型或状态"
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
        <div style={{ marginBottom: 20 }}>
          <h1>历史项目</h1>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start", gap: 24 }}>
          {/* 左：筛选 + 表格 + 分页 */}
          <div>
            <div className="tabs" style={{ marginBottom: 16 }}>
              {TABS.map((t) => (
                <button
                  key={t.k}
                  className={`tab ${tab === t.k ? "on" : ""}`}
                  onClick={() => pickTab(t.k)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {err ? <div className="banner err" style={{ marginBottom: 12 }}>{err}</div> : null}

            <div className="card" style={{ overflow: "hidden" }}>
              {projects === null ? (
                <div className="pad row" style={{ gap: 11 }}>
                  <span className="spin" /> <span className="muted">加载项目…</span>
                </div>
              ) : total === 0 ? (
                <div className="empty">
                  <div className="ic">🎬</div>
                  <h3>{tab === "all" ? "还没有项目" : "没有符合的项目"}</h3>
                  <p>
                    {tab === "all"
                      ? "点左上角「首页」新建你的第一个视频。"
                      : "换个筛选条件试试。"}
                  </p>
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
                    {pageRows.map((p) => {
                      const st = projectStatus(p.stage);
                      return (
                        <tr
                          key={p.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => router.push("/projects/" + p.id)}
                        >
                          <td>
                            <div className="row" style={{ gap: 11 }}>
                              <Cover
                                seed={p.id}
                                src={p.thumb ? fileUrl(p.id, p.thumb) : undefined}
                                aspect="16/9"
                                rounded={6}
                                style={{ width: 52, flex: "0 0 auto" }}
                              />
                              <div className="col">
                                <span className="pri">{p.title}</span>
                                <span className="dim" style={{ fontSize: 11.5 }}>{p.aspect}</span>
                              </div>
                            </div>
                          </td>
                          <td>{TYPE_LABEL[p.videoType] ?? p.videoType}</td>
                          <td>{stageLabel(p.stage)}</td>
                          <td><Status cls={st.cls} label={st.label} /></td>
                          <td className="dim">{fmtRelTime(p.createdAt)}</td>
                          <td>
                            <div className="actions">
                              <Link
                                className="btn ghost sm"
                                href={"/projects/" + p.id}
                                onClick={(e) => e.stopPropagation()}
                              >
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

            {/* 分页 */}
            {total > 0 ? (
              <div className="spaced" style={{ marginTop: 16 }}>
                <span className="dim" style={{ fontSize: 13 }}>共 {total} 项</span>
                {pageCount > 1 ? (
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      className="btn ghost sm"
                      disabled={curPage <= 1}
                      onClick={() => setPage((n) => Math.max(1, n - 1))}
                    >
                      ‹
                    </button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        className="btn ghost sm"
                        aria-current={n === curPage ? "page" : undefined}
                        style={
                          n === curPage
                            ? { background: "var(--surface-2)", borderColor: "var(--border-strong)" }
                            : undefined
                        }
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      className="btn ghost sm"
                      disabled={curPage >= pageCount}
                      onClick={() => setPage((n) => Math.min(pageCount, n + 1))}
                    >
                      ›
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 右：本周概览 + 最近继续 */}
          <div className="col" style={{ gap: 16 }}>
            <div className="summary">
              <h3>本周概览</h3>
              <div className="kv"><span className="k">已生成</span><span className="v">{c?.total ?? "—"}</span></div>
              <div className="kv"><span className="k">渲染中</span><span className="v">{c?.rendering ?? "—"}</span></div>
              <div className="kv"><span className="k">待确认</span><span className="v">{c?.draft ?? "—"}</span></div>
              <div className="kv"><span className="k">已完成</span><span className="v">{c?.done ?? "—"}</span></div>
            </div>

            <div className="summary">
              <h3>最近继续</h3>
              {projects === null ? (
                <div className="row" style={{ gap: 10 }}>
                  <span className="spin" /> <span className="muted" style={{ fontSize: 13 }}>加载中…</span>
                </div>
              ) : continueRows.length === 0 ? (
                <p className="aux">没有待继续的项目。</p>
              ) : (
                <div className="col" style={{ gap: 10 }}>
                  {continueRows.map((p) => (
                    <Link
                      key={p.id}
                      href={"/projects/" + p.id}
                      className="card hover spaced"
                      style={{ padding: "12px 14px" }}
                    >
                      <div className="col" style={{ gap: 3, minWidth: 0 }}>
                        <span
                          className="pri"
                          style={{
                            fontSize: 13.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.title}
                        </span>
                        <span className="dim" style={{ fontSize: 12 }}>{stageLabel(p.stage)}</span>
                      </div>
                      <span className="dim">→</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
