"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { api, TYPES } from "@/app/_ui";
import type { ProjectSummary, Stage } from "@/lib/types";

function stageLabel(st: Stage): string {
  const map: Partial<Record<Stage, string>> = {
    done: "已完成",
    storyboard: "待确认分镜",
    rendering: "分段渲染中",
    concept: "待选方向",
    script: "待确认讲稿",
    final: "待终检下载",
    failed: "失败",
    ingesting: "抓取内容中",
    briefing: "拆解定调中",
    scripting: "写讲稿中",
    storyboarding: "写分镜中",
    drafting: "出草稿中",
    assembling: "合成中",
    qa: "体检中",
  };
  return map[st] || st;
}

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .projects()
      .then((d) => setProjects(d.projects))
      .catch((e) => {
        if ((e as { status?: number }).status === 401) {
          router.push("/login");
          return;
        }
        setErr("加载项目失败");
        setProjects([]);
      });
  }, [router]);

  return (
    <div className="shell">
      <TopBar active="home" />
      <div className="page wide">
        <div className="fade">
          <div className="banner info" style={{ marginBottom: 20 }}>
            POC 模式：创意步调用本机 <b>claude</b>{" "}
            命令行（零 key，复用本地登录态）·{" "}
            <Link href="/settings">查看设置 →</Link>
          </div>
          <div className="spaced" style={{ marginBottom: 22 }}>
            <div>
              <h1>我的项目</h1>
              <p className="muted" style={{ marginTop: 4 }}>
                一套骨架装三类视频 · 共 {projects?.length ?? 0} 个
              </p>
            </div>
            <Link className="btn" href="/new">
              + 新建项目
            </Link>
          </div>

          {err ? (
            <div className="banner err" style={{ marginBottom: 16 }}>
              {err}
            </div>
          ) : null}

          {projects === null ? (
            <div className="card pad">
              <div className="row" style={{ gap: 11 }}>
                <span className="spin"></span>
                <b>加载项目…</b>
              </div>
            </div>
          ) : projects.length === 0 && !err ? (
            <div className="card pad">
              <p className="muted">还没有项目，点右上角「新建项目」开始。</p>
            </div>
          ) : (
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(3,1fr)" }}
            >
              {projects.map((p) => {
                const t = TYPES[p.videoType];
                return (
                  <div
                    key={p.id}
                    className="card pad"
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push("/projects/" + p.id)}
                  >
                    <div className="spaced">
                      <span
                        className="tag"
                        style={{ background: t.grad, color: "#fff" }}
                      >
                        {t.name}
                      </span>
                      <span className="aux">{p.aspect}</span>
                    </div>
                    <h2 style={{ margin: "14px 0 6px", fontSize: 17 }}>
                      {p.title}
                    </h2>
                    <div className="spaced">
                      <span className="chip">
                        {p.stage === "done" ? "✅" : "⏳"}{" "}
                        {stageLabel(p.stage)}
                      </span>
                      <span className="aux">
                        {p.stage === "done" ? "下载 / 重开" : "继续 →"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
