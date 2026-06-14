"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import Rail from "@/components/Rail";
import {
  api,
  toast,
  ratio,
  fileUrl,
  downloadUrl,
  RB,
  TYPES,
  PROG_TXT,
  railFor,
} from "@/app/_ui";
import type {
  ProjectMeta,
  SceneMeta,
  GateBody,
  EditBody,
  Concept,
  Renderer,
  Material,
  MaterialChunk,
  ChunkKind,
} from "@/lib/types";

// 渲染器四选一（#8 分镜行内下拉）
const RENDERER_OPTS: Renderer[] = [
  "remotion",
  "generative",
  "lottie",
  "still-kenburns",
];

// 料块 kind → 中文小标签（#5）
const CHUNK_KIND_LABEL: Record<ChunkKind, string> = {
  feature: "卖点",
  metric: "数据",
  fact: "事实",
  quote: "金句",
  term: "术语",
  step: "步骤",
  audience: "受众",
  differentiator: "差异点",
  other: "其他",
};

/* ---------- 共享：引用料块 chips（#5：@m1 @m2） ---------- */
function RefsChips({ refs }: { refs?: string[] }) {
  if (!refs || refs.length === 0) return null;
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      <span className="aux" style={{ fontSize: 11.5 }}>
        引用料块
      </span>
      {refs.map((r) => (
        <span key={r} className="chip" style={{ fontSize: 11.5 }}>
          @{r}
        </span>
      ))}
    </div>
  );
}

/* ---------- 内容拆解料块面板（#5：可折叠，纯展示） ---------- */
function MaterialPanel({ material }: { material: Material }) {
  const [open, setOpen] = useState(false);
  const chunks = material.chunks;
  return (
    <div className="card pad fade" style={{ marginBottom: 22 }}>
      <div
        className="spaced"
        style={{ cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <b style={{ fontSize: 15 }}>
            内容料块 · 已拆出 {chunks.length} 块
          </b>
          {material.summary ? (
            <p className="aux" style={{ marginTop: 6 }}>
              {material.summary}
            </p>
          ) : null}
        </div>
        <span className="chip" style={{ flexShrink: 0 }}>
          {open ? "收起 ▲" : "展开 ▼"}
        </span>
      </div>

      {open ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(2,1fr)",
            gap: 10,
            marginTop: 16,
          }}
        >
          {chunks.map((ch: MaterialChunk) => (
            <div
              key={ch.id}
              className="card pad"
              style={{ background: "#fff", padding: "10px 12px" }}
            >
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="chip" style={{ fontSize: 11.5 }}>
                  @{ch.id}
                </span>
                <span className="tag">{CHUNK_KIND_LABEL[ch.kind]}</span>
                <b style={{ fontSize: 13.5 }}>{ch.title}</b>
              </div>
              {ch.detail ? (
                <p
                  className="aux"
                  style={{
                    marginTop: 6,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {ch.detail}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [message, setMessage] = useState<string>("");
  const [pct, setPct] = useState<number | undefined>(undefined);
  const [connErr, setConnErr] = useState(false);

  // 挂载即开 EventSource，按推来的 project 纯函数渲染。
  useEffect(() => {
    if (!id) return;
    const es = new EventSource("/api/projects/" + id + "/events");
    es.onmessage = (e) => {
      setConnErr(false);
      try {
        const payload = JSON.parse(e.data) as {
          project: ProjectMeta;
          message?: string;
          pct?: number;
        };
        if (payload.project) setProject(payload.project);
        if (payload.message !== undefined) setMessage(payload.message);
        if (payload.pct !== undefined) setPct(payload.pct);
      } catch {
        /* 忽略非 JSON 心跳 */
      }
    };
    es.onerror = () => {
      // EventSource 会自动重连；仅当还没拿到任何 project 时提示。
      setConnErr(true);
    };
    return () => es.close();
  }, [id]);

  // 发闸门决策：POST 后不手动改本地状态，等 SSE 推新 project。
  async function gate(body: GateBody) {
    try {
      await api.gate(id, body);
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        router.push("/login");
        return;
      }
      toast("操作失败，请重试");
    }
  }

  // 逐项编辑（概念 / 分镜）—— 回填靠 SSE 推新 project（#7 #8）。
  async function edit(body: EditBody) {
    try {
      await api.edit(id, body);
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        router.push("/login");
        return;
      }
      toast("保存失败，请重试");
    }
  }

  // 返回上一步（#6）—— 回退到上一个闸门。
  async function nav() {
    try {
      await api.nav(id);
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        router.push("/login");
        return;
      }
      toast("返回失败，请重试");
    }
  }

  if (!project) {
    return (
      <div className="shell">
        <TopBar active="home" />
        <div className="page wide">
          <div className="card pad">
            <div className="row" style={{ gap: 11 }}>
              <span className="spin"></span>
              <b>{connErr ? "连接中断，正在重连…" : "连接项目状态流…"}</b>
              <span className="chip" style={{ marginLeft: "auto" }}>
                SSE 实时
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const p = project;
  const t = TYPES[p.videoType];

  return (
    <div className="shell">
      <TopBar active="home" />
      <div className="page wide">
        <div className="fade">
          <div className="spaced">
            <div>
              <h1 style={{ fontSize: 24 }}>{p.title}</h1>
            </div>
            <a onClick={() => router.push("/")}>← 项目列表</a>
          </div>

          {/* 四件套 chips */}
          <div
            className="row"
            style={{ flexWrap: "wrap", gap: 8, margin: "14px 0 22px" }}
          >
            <span className="chip">
              类型 <b>{t.name}</b>
            </span>
            <span className="chip">
              画幅 <b>{p.aspect}</b>
            </span>
            <span className="chip">
              风格 <b>{p.fourPack.styleId}</b>
            </span>
            <span className="chip">
              骨架 <b>{railFor(p.videoType).length} 闸门</b>
            </span>
            <span className="chip">
              配音 <b>{p.vo ? "开" : "关"}</b>
            </span>
          </div>

          {/* 公共骨架 rail */}
          <Rail stage={p.stage} videoType={p.videoType} />
          <div className="divider"></div>

          {/* 内容拆解料块（#5）：material 存在且有 chunks 才展示 */}
          {p.material && p.material.chunks.length > 0 ? (
            <MaterialPanel material={p.material} />
          ) : null}

          {/* 各阶段面板 */}
          <StagePanel
            project={p}
            message={message}
            pct={pct}
            gate={gate}
            edit={edit}
            nav={nav}
            onDone={() => router.push("/")}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   各阶段面板分发
   ============================================================ */
function StagePanel({
  project: p,
  message,
  pct,
  gate,
  edit,
  nav,
  onDone,
}: {
  project: ProjectMeta;
  message: string;
  pct?: number;
  gate: (b: GateBody) => void;
  edit: (b: EditBody) => void;
  nav: () => void;
  onDone: () => void;
}) {
  const st = p.stage;
  if (
    [
      "ingesting",
      "decomposing",
      "briefing",
      "scripting",
      "storyboarding",
      "drafting",
      "assembling",
      "qa",
    ].includes(st)
  ) {
    return <ProgressPanel stage={st} message={message} pct={pct} />;
  }
  if (st === "concept")
    return <GateConcept project={p} gate={gate} edit={edit} nav={nav} />;
  if (st === "script") return <GateScript project={p} gate={gate} nav={nav} />;
  if (st === "storyboard")
    return <GateStoryboard project={p} gate={gate} edit={edit} nav={nav} />;
  if (st === "rendering")
    return <GateChunks project={p} gate={gate} nav={nav} />;
  if (st === "final" || st === "done")
    return <GateFinal project={p} gate={gate} nav={nav} onDone={onDone} />;
  if (st === "failed") return <FailedPanel project={p} onDone={onDone} />;
  return null;
}

/* ---------- 共享：闸门顶部「← 上一步」（#6） ---------- */
function BackBar({
  nav,
  disabled,
  label = "← 上一步",
}: {
  nav: () => void;
  disabled?: boolean;
  label?: string;
}) {
  if (disabled) return null;
  return (
    <div className="row" style={{ marginBottom: 14 }}>
      <button className="btn ghost sm" onClick={nav}>
        {label}
      </button>
    </div>
  );
}

/* ---------- 进度面板 ---------- */
function ProgressPanel({
  stage,
  message,
  pct,
}: {
  stage: string;
  message: string;
  pct?: number;
}) {
  const text = message || PROG_TXT[stage] || stage;
  const width = pct !== undefined ? `${Math.max(0, Math.min(100, pct))}%` : "92%";
  return (
    <div className="card pad fade">
      <div className="row" style={{ gap: 11 }}>
        <span className="spin"></span>
        <b>{text}</b>
        <span className="chip" style={{ marginLeft: "auto" }}>
          SSE 实时
        </span>
      </div>
      <div className="prog" style={{ marginTop: 16 }}>
        <i style={{ width }}></i>
      </div>
      {stage === "assembling" ? (
        <div
          className="row"
          style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}
        >
          {["拼接 concat", "混音 mux", "烧字幕", "导出"].map((x) => (
            <span key={x} className="chip">
              {x}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 闸门① 选方向（#7：展示 look/palette/pacing + 逐项可改） ---------- */
function GateConcept({
  project: p,
  gate,
  edit,
  nav,
}: {
  project: ProjectMeta;
  gate: (b: GateBody) => void;
  edit: (b: EditBody) => void;
  nav: () => void;
}) {
  const [sel, setSel] = useState<number | null>(p.chosenConcept);
  return (
    <div className="fade">
      {/* concept 在最前，回退无意义 → 不显示返回按钮 */}
      <div className="spaced">
        <h2>闸门① · 选方向</h2>
        <span className="aux">2–3 个概念方向，挑一个（可逐项编辑）</span>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 16 }}
      >
        {p.concepts.map((c: Concept, idx: number) => (
          <ConceptCard
            key={idx}
            concept={c}
            index={idx}
            selected={sel === idx}
            onSelect={() => setSel(idx)}
            edit={edit}
          />
        ))}
      </div>
      <div className="row" style={{ marginTop: 24 }}>
        <div style={{ flex: 1 }}></div>
        <button
          className="btn"
          disabled={sel === null}
          onClick={() =>
            sel !== null && gate({ gate: "concept", choice: sel })
          }
        >
          用这个方向 →
        </button>
      </div>
    </div>
  );
}

function ConceptCard({
  concept: c,
  index,
  selected,
  onSelect,
  edit,
}: {
  concept: Concept;
  index: number;
  selected: boolean;
  onSelect: () => void;
  edit: (b: EditBody) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: c.title ?? "",
    tone: c.tone ?? "",
    look: c.look ?? "",
    palette: c.palette ?? "",
    pacing: c.pacing ?? "",
  });

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft({
      title: c.title ?? "",
      tone: c.tone ?? "",
      look: c.look ?? "",
      palette: c.palette ?? "",
      pacing: c.pacing ?? "",
    });
    setEditing(true);
  }
  function save(e: React.MouseEvent) {
    e.stopPropagation();
    edit({ target: "concept", index, patch: { ...draft } });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="sel on" style={{ cursor: "default" }}>
        <label className="fld">标题</label>
        <input
          className="input"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <label className="fld" style={{ marginTop: 10 }}>
          基调 tone
        </label>
        <input
          className="input"
          value={draft.tone}
          onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
        />
        <label className="fld" style={{ marginTop: 10 }}>
          画面长这样 look
        </label>
        <textarea
          value={draft.look}
          onChange={(e) => setDraft({ ...draft, look: e.target.value })}
        />
        <label className="fld" style={{ marginTop: 10 }}>
          配色 palette
        </label>
        <input
          className="input"
          value={draft.palette}
          onChange={(e) => setDraft({ ...draft, palette: e.target.value })}
        />
        <label className="fld" style={{ marginTop: 10 }}>
          节奏 pacing
        </label>
        <input
          className="input"
          value={draft.pacing}
          onChange={(e) => setDraft({ ...draft, pacing: e.target.value })}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={save}>
            保存
          </button>
          <button
            className="btn ghost sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(false);
            }}
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`sel ${selected ? "on" : ""}`}
      onClick={onSelect}
    >
      <div className="spaced">
        <h2 style={{ fontSize: 16 }}>{c.title}</h2>
        {selected ? <span className="tag bk-kenburns">已选</span> : null}
      </div>
      <p className="aux" style={{ margin: "8px 0 10px" }}>
        {c.tone}
      </p>

      {/* #7：展示 look / palette / pacing */}
      {c.look ? (
        <p className="aux" style={{ marginBottom: 8 }}>
          <b style={{ color: "var(--text)" }}>画面长这样：</b>
          {c.look}
        </p>
      ) : null}
      <div
        className="row"
        style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}
      >
        {c.palette ? (
          <span className="chip">
            配色 <b>{c.palette}</b>
          </span>
        ) : null}
        {c.pacing ? (
          <span className="chip">
            节奏 <b>{c.pacing}</b>
          </span>
        ) : null}
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {c.words.map((w, i) => (
          <span key={i} className="chip">
            {w}
          </span>
        ))}
      </div>

      {/* #5：本方向引用了哪些料块 */}
      <RefsChips refs={c.refs} />

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn ghost sm" onClick={startEdit}>
          编辑
        </button>
      </div>
    </div>
  );
}

/* ---------- 闸门 讲稿 ---------- */
function GateScript({
  project: p,
  gate,
  nav,
}: {
  project: ProjectMeta;
  gate: (b: GateBody) => void;
  nav: () => void;
}) {
  const [redo, setRedo] = useState<string | null>(null);
  // 讲稿/知识点：从 scenes 的 vo / onScreenText 汇总展示。
  const lines = p.scenes.filter((s) => s.vo || s.onScreenText);
  return (
    <div className="fade">
      <BackBar nav={nav} />
      <div className="spaced">
        <h2>闸门 · 确认讲稿</h2>
        <span className="aux">逐镜旁白 / 知识点，确认后再排分镜</span>
      </div>
      <div className="banner info" style={{ margin: "14px 0" }}>
        讲稿由本机 claude CLI 口语化生成，确认后才会进入分镜与渲染。
      </div>
      <div className="card pad" style={{ background: "#fff" }}>
        {lines.length ? (
          lines.map((s) => (
            <div key={s.index} style={{ marginBottom: 14 }}>
              <div className="spaced">
                <b style={{ fontSize: 14 }}>
                  #{s.index} {s.role}
                </b>
                <span className="aux">{s.durationSec}s</span>
              </div>
              {s.vo ? (
                <p style={{ margin: "6px 0 2px" }}>{s.vo}</p>
              ) : null}
              {s.onScreenText ? (
                <p className="aux" style={{ marginTop: 4 }}>
                  字幕：{s.onScreenText}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="muted">讲稿生成中…</p>
        )}
      </div>

      {redo !== null ? (
        <div className="card pad fade" style={{ marginTop: 18, background: "#fff" }}>
          <label className="fld">
            一句话意见（可空）— agent 会按意见重写讲稿
          </label>
          <textarea
            placeholder="例：开场更口语；术语先打比方再上"
            value={redo}
            onChange={(e) => setRedo(e.target.value)}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn sm"
              onClick={() =>
                gate({ gate: "script", action: "redo", note: redo || undefined })
              }
            >
              提交重写
            </button>
            <button
              className="btn ghost sm"
              onClick={() => setRedo(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => setRedo("")}>
          打回
        </button>
        <div style={{ flex: 1 }}></div>
        <button
          className="btn"
          onClick={() => gate({ gate: "script", action: "confirm" })}
        >
          确认讲稿 →
        </button>
      </div>
    </div>
  );
}

/* ---------- 闸门② 确认分镜（#8：横排表格 + 逐项可改） ---------- */
function GateStoryboard({
  project: p,
  gate,
  edit,
  nav,
}: {
  project: ProjectMeta;
  gate: (b: GateBody) => void;
  edit: (b: EditBody) => void;
  nav: () => void;
}) {
  const [redo, setRedo] = useState<string | null>(null);
  return (
    <div className="fade">
      <BackBar nav={nav} />
      <div className="spaced">
        <h2>闸门② · 确认分镜</h2>
        <span className="aux">每行一镜 · 列项可内联编辑</span>
      </div>
      <div className="banner info" style={{ margin: "14px 0" }}>
        草稿仅供<b>方向确认</b>，不是正片精确长相。确认后才按各自后端渲正片。
      </div>

      {/* 表头 */}
      <div
        className="row"
        style={{
          gap: 12,
          padding: "0 14px 8px",
          fontSize: 12.5,
          color: "var(--text2)",
          fontWeight: 600,
        }}
      >
        <span style={{ width: 96, flexShrink: 0 }}>草稿</span>
        <span style={{ width: 34, flexShrink: 0 }}>#</span>
        <span style={{ width: 150, flexShrink: 0 }}>标题 role</span>
        <span style={{ flex: 1, minWidth: 140 }}>描述 onScreenText</span>
        <span style={{ width: 92, flexShrink: 0 }}>时长 s</span>
        <span style={{ width: 168, flexShrink: 0 }}>镜头类型</span>
      </div>

      <div className="col" style={{ gap: 10 }}>
        {p.scenes.map((s) => (
          <StoryboardRow
            key={s.index}
            scene={s}
            projectId={p.projectId}
            aspect={p.aspect}
            edit={edit}
          />
        ))}
      </div>

      {redo !== null ? (
        <div className="card pad fade" style={{ marginTop: 18, background: "#fff" }}>
          <label className="fld">
            一句话意见（可空）— agent 会按意见重写分镜并追加一条 revision
          </label>
          <textarea
            placeholder="例：第 1 镜更聚焦痛点；整体节奏再快一点"
            value={redo}
            onChange={(e) => setRedo(e.target.value)}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn sm"
              onClick={() =>
                gate({
                  gate: "storyboard",
                  action: "redo",
                  note: redo || undefined,
                })
              }
            >
              提交重写
            </button>
            <button className="btn ghost sm" onClick={() => setRedo(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => setRedo("")}>
          打回重做
        </button>
        <div style={{ flex: 1 }}></div>
        <button
          className="btn"
          onClick={() => gate({ gate: "storyboard", action: "confirm" })}
        >
          确认分镜 → 渲染
        </button>
      </div>
    </div>
  );
}

/* ---------- 分镜行（#8：内联编辑 role/onScreenText/durationSec/renderer） ---------- */
function StoryboardRow({
  scene: s,
  projectId,
  aspect,
  edit,
}: {
  scene: SceneMeta;
  projectId: string;
  aspect: ProjectMeta["aspect"];
  edit: (b: EditBody) => void;
}) {
  const b = RB[s.renderer];

  // 受控草稿：blur / change 时提交单字段 patch（靠 SSE 回填）。
  function commit(patch: EditBody["patch"]) {
    edit({ target: "scene", index: s.index, patch });
  }

  return (
    <div
      className="card pad fade"
      style={{ background: "#fff", padding: "12px 14px" }}
    >
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        {/* 草稿缩略图（带角标） */}
        <div
          className="draft-img"
          style={{
            width: 96,
            flexShrink: 0,
            aspectRatio: ratio(aspect),
            background: "#0B0B0F",
            fontSize: 11,
          }}
        >
          <span className="corner" style={{ fontSize: 9, padding: "2px 6px" }}>
            草稿
          </span>
          {s.draftImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileUrl(projectId, s.draftImage)}
              alt={`镜 ${s.index} 草稿`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ opacity: 0.85 }}>镜 {s.index}</span>
          )}
        </div>

        {/* # 序号 */}
        <div
          style={{ width: 34, flexShrink: 0, fontWeight: 600, paddingTop: 9 }}
        >
          #{s.index}
        </div>

        {/* 标题 role */}
        <div style={{ width: 150, flexShrink: 0 }}>
          <input
            className="input"
            defaultValue={s.role}
            onBlur={(e) =>
              e.target.value !== s.role && commit({ role: e.target.value })
            }
          />
        </div>

        {/* 描述 onScreenText */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <input
            className="input"
            defaultValue={s.onScreenText}
            onBlur={(e) =>
              e.target.value !== s.onScreenText &&
              commit({ onScreenText: e.target.value })
            }
          />
        </div>

        {/* 时长 durationSec */}
        <div style={{ width: 92, flexShrink: 0 }}>
          <input
            className="input"
            type="number"
            min={0}
            step={0.1}
            defaultValue={s.durationSec}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && v !== s.durationSec)
                commit({ durationSec: v });
            }}
          />
        </div>

        {/* 镜头类型 renderer（四选一下拉） */}
        <div style={{ width: 168, flexShrink: 0 }}>
          <select
            value={s.renderer}
            onChange={(e) => commit({ renderer: e.target.value as Renderer })}
          >
            {RENDERER_OPTS.map((r) => (
              <option key={r} value={r}>
                {RB[r].name}
              </option>
            ))}
          </select>
          <span
            className={`tag ${b.cls}`}
            style={{ marginTop: 6, display: "inline-block" }}
          >
            {b.name}
          </span>
          {s.rev ? (
            <span className="chip" style={{ marginLeft: 6 }}>
              已改 {s.rev} 版
            </span>
          ) : null}
        </div>
      </div>

      {/* #5：本镜引用了哪些料块 */}
      <RefsChips refs={s.refs} />
    </div>
  );
}

/* ---------- 闸门③ 渲染（#9：两视图 + 新流程 chunk continue/assemble/redo） ----------
   新流程：先渲前 2 镜 → 用户确认方向 →「续渲全部」→ 全部 await_review →「合成成片」。
   一切以 SSE 的 scene 状态为准；不自造模拟计时。 */
function GateChunks({
  project: p,
  gate,
  nav,
}: {
  project: ProjectMeta;
  gate: (b: GateBody) => void;
  nav: () => void;
}) {
  const [view, setView] = useState<"list" | "full">("list");
  const [cur, setCur] = useState(0); // 全屏视图当前镜索引（纯前端状态）

  const scenes = p.scenes;
  const N = scenes.length;

  // 一镜是否「已生成」（有 mp4，可预览/可重做）。
  const hasMedia = (s: SceneMeta) => Boolean(s.mp4);
  // 一镜是否「待生成」占位（还没出 mp4 且未在渲染）。
  const isPending = (s: SceneMeta) => !s.mp4 && s.status === "pending";

  const generated = scenes.filter(hasMedia);
  const anyPending = scenes.some(isPending);
  // 阶段判定：仍有「待生成」的镜 → 处于「前 2 镜确认」阶段。
  const inPreviewPhase = anyPending;
  // 是否还有镜在渲染中（未全部出片）。
  const anyRendering = scenes.some((s) => s.status === "rendering");
  // 全部已生成且无待生成/无渲染中 → 可合成。
  const allReady = N > 0 && generated.length === N && !anyRendering;

  const clamp = (i: number) => Math.max(0, Math.min(N - 1, i));

  return (
    <div className="fade">
      <BackBar nav={nav} />
      <div className="spaced">
        <h2>闸门③ · 渲染（多后端流式）</h2>
        <div className="row" style={{ gap: 8 }}>
          {/* 视图模式切换 */}
          <span
            className={`pill ${view === "list" ? "on" : ""}`}
            onClick={() => setView("list")}
          >
            列表
          </span>
          <span
            className={`pill ${view === "full" ? "on" : ""}`}
            onClick={() => setView("full")}
          >
            全屏翻页
          </span>
        </div>
      </div>

      <div className="banner info" style={{ margin: "14px 0" }}>
        {inPreviewPhase ? (
          <span>
            先渲<b>前 2 镜</b>给你确认方向：满意就「续渲全部」，其余镜会按各自后端继续生成。
          </span>
        ) : (
          <span>
            每镜按自己的后端渲染（Remotion / 生成式 / Lottie / 推拉），统一 config 防拼贴感。
            任意已生成镜可单独「👎 重做这段」。
          </span>
        )}
      </div>

      {/* 视图主体 */}
      {view === "list" ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          {scenes.map((s) => (
            <ChunkCard
              key={s.index}
              scene={s}
              projectId={p.projectId}
              aspect={p.aspect}
              gate={gate}
            />
          ))}
        </div>
      ) : (
        <FullScreenChunks
          scenes={scenes}
          projectId={p.projectId}
          aspect={p.aspect}
          cur={clamp(cur)}
          setCur={(i) => setCur(clamp(i))}
          gate={gate}
        />
      )}

      {/* 主操作条 */}
      <div className="row" style={{ marginTop: 24 }}>
        <div style={{ flex: 1 }}></div>
        {inPreviewPhase ? (
          <button
            className="btn"
            disabled={generated.length < 1}
            onClick={() => gate({ gate: "chunk", action: "continue" })}
          >
            确认前 {Math.min(2, N)} 镜方向 → 续渲全部
          </button>
        ) : allReady ? (
          <button
            className="btn"
            onClick={() => gate({ gate: "chunk", action: "assemble" })}
          >
            全部满意 → 合成成片
          </button>
        ) : (
          <span className="chip">
            <span className="spin" style={{ width: 13, height: 13 }}></span>
            其余镜渲染中…（{generated.length}/{N}）
          </span>
        )}
      </div>
    </div>
  );
}

/* 媒体块：approved/await_review 且有 mp4 → 播放器；rendering → 渲染中 skel；pending → 待生成占位。*/
function ChunkMedia({
  scene: s,
  projectId,
  ar,
}: {
  scene: SceneMeta;
  projectId: string;
  ar: string;
}) {
  const b = RB[s.renderer];
  if (s.mp4) {
    return (
      <div className="player" style={{ aspectRatio: ar }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={fileUrl(projectId, s.mp4)}
          controls
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div className="meta">
          <span>
            #{s.index} {s.role} · {s.durationSec}s
          </span>
          <span className={`tag ${b.cls}`}>{b.name}</span>
        </div>
      </div>
    );
  }
  if (s.status === "rendering" || s.status === "redo") {
    return (
      <div className="skel" style={{ aspectRatio: ar }}>
        <span className="lbl">{b.name} 渲染中…</span>
      </div>
    );
  }
  // pending：待生成占位（#9 文案）。
  return (
    <div className="skel" style={{ aspectRatio: ar, background: "#F2F3F5" }}>
      <span className="lbl muted">待生成 · {b.name}</span>
    </div>
  );
}

/* 单镜重做控件：任意已生成镜可👎重做（#9 走 chunk/redo）。*/
function RedoControl({
  scene: s,
  gate,
}: {
  scene: SceneMeta;
  gate: (b: GateBody) => void;
}) {
  const [redo, setRedo] = useState<string | null>(null);
  if (!s.mp4) return null;
  return (
    <>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn danger sm"
          onClick={() => setRedo(redo === null ? "" : null)}
        >
          👎 重做这段
        </button>
        {s.rev ? (
          <span className="chip">改过 {s.rev} 版</span>
        ) : null}
      </div>
      {redo !== null ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            placeholder="一句话意见（可空）：这段哪里需要改"
            value={redo}
            onChange={(e) => setRedo(e.target.value)}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn sm"
              onClick={() => {
                gate({
                  gate: "chunk",
                  action: "redo",
                  index: s.index,
                  note: redo || undefined,
                });
                setRedo(null);
              }}
            >
              提交重做
            </button>
            <button className="btn ghost sm" onClick={() => setRedo(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* 列表视图卡片 */
function ChunkCard({
  scene: s,
  projectId,
  aspect,
  gate,
}: {
  scene: SceneMeta;
  projectId: string;
  aspect: ProjectMeta["aspect"];
  gate: (b: GateBody) => void;
}) {
  const ar = ratio(aspect);
  return (
    <div className="card pad fade" style={{ background: "#fff" }}>
      <div style={{ maxWidth: aspect === "9:16" ? 300 : "100%" }}>
        <ChunkMedia scene={s} projectId={projectId} ar={ar} />
      </div>
      <RedoControl scene={s} gate={gate} />
    </div>
  );
}

/* 全屏左右翻页预览视图（#9）：单镜占主区 + 大 video + meta + 重做 + ◀▶ 翻页 */
function FullScreenChunks({
  scenes,
  projectId,
  aspect,
  cur,
  setCur,
  gate,
}: {
  scenes: SceneMeta[];
  projectId: string;
  aspect: ProjectMeta["aspect"];
  cur: number;
  setCur: (i: number) => void;
  gate: (b: GateBody) => void;
}) {
  const N = scenes.length;
  if (N === 0) return null;
  const s = scenes[cur];
  const b = RB[s.renderer];
  const ar = ratio(aspect);
  const narrow = aspect === "9:16";

  return (
    <div className="card pad fade" style={{ background: "#fff" }}>
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        {/* ◀ 翻页 */}
        <button
          className="btn ghost"
          disabled={cur <= 0}
          onClick={() => setCur(cur - 1)}
          style={{ flexShrink: 0 }}
        >
          ◀
        </button>

        {/* 主区域单镜 */}
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <div style={{ maxWidth: narrow ? 320 : 640, width: "100%" }}>
            <ChunkMedia scene={s} projectId={projectId} ar={ar} />
            <div
              className="spaced"
              style={{ marginTop: 12, alignItems: "flex-start" }}
            >
              <div>
                <b style={{ fontSize: 15 }}>
                  #{s.index} {s.role}
                </b>
                <p className="aux" style={{ marginTop: 4 }}>
                  {s.durationSec}s · {s.onScreenText}
                </p>
              </div>
              <span className={`tag ${b.cls}`}>{b.name}</span>
            </div>
            <RedoControl scene={s} gate={gate} />
          </div>
        </div>

        {/* ▶ 翻页 */}
        <button
          className="btn ghost"
          disabled={cur >= N - 1}
          onClick={() => setCur(cur + 1)}
          style={{ flexShrink: 0 }}
        >
          ▶
        </button>
      </div>

      {/* 第 i / N 镜 + 圆点导航 */}
      <div
        className="row"
        style={{ justifyContent: "center", marginTop: 14, gap: 8 }}
      >
        <span className="chip">
          第 {cur + 1} / {N} 镜
        </span>
        <div className="row" style={{ gap: 6 }}>
          {scenes.map((sc, i) => (
            <span
              key={sc.index}
              onClick={() => setCur(i)}
              title={`#${sc.index} ${sc.role}`}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                cursor: "pointer",
                background: i === cur ? "var(--accent)" : "var(--border)",
              }}
            ></span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 闸门④ 终检与下载（#10：全屏预览覆盖层） ---------- */
function GateFinal({
  project: p,
  gate,
  nav,
  onDone,
}: {
  project: ProjectMeta;
  gate: (b: GateBody) => void;
  nav: () => void;
  onDone: () => void;
}) {
  const narrow = p.aspect === "9:16";
  const out = p.outputs || {};
  const [fs, setFs] = useState(false); // 全屏预览遮罩开关

  async function done() {
    await gate({ gate: "final", action: "done" });
    onDone();
  }

  return (
    <div className="fade">
      {/* final 在最后，可回退到上一个闸门 */}
      <BackBar nav={nav} />
      <div className="spaced">
        <h2>闸门④ · 终检与下载</h2>
        <span className="aux">{p.aspect} 成片</span>
      </div>

      {/* QA 条：以 fourPack.qaRules 的首条作为提示项展示 */}
      {p.fourPack.qaRules?.length ? (
        <div className="banner warn" style={{ margin: "14px 0" }}>
          QA：{p.fourPack.qaRules[0]}（提示项，不阻断下载）。
        </div>
      ) : (
        <div className="banner info" style={{ margin: "14px 0" }}>
          QA 已通过，可下载成片。
        </div>
      )}

      <div style={{ display: "grid", placeItems: "center", margin: "8px 0 22px" }}>
        <div
          style={{ maxWidth: narrow ? 300 : 680, width: "100%" }}
        >
          {out.mp4 ? (
            <div
              className="player"
              style={{ aspectRatio: ratio(p.aspect), maxHeight: "70vh" }}
            >
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={fileUrl(p.projectId, out.mp4)}
                controls
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
              <div className="meta">
                <span>{p.title}</span>
                <span>{p.aspect}</span>
              </div>
            </div>
          ) : (
            <div
              className="skel"
              style={{ aspectRatio: ratio(p.aspect), maxHeight: "70vh" }}
            >
              <span className="lbl muted">成片合成中…</span>
            </div>
          )}
        </div>
      </div>

      <div
        className="row"
        style={{ justifyContent: "center", flexWrap: "wrap", gap: 10 }}
      >
        {out.mp4 ? (
          <button className="btn ghost" onClick={() => setFs(true)}>
            ⛶ 全屏预览
          </button>
        ) : null}
        <a className="btn" href={downloadUrl(p.projectId, "mp4")}>
          下载 MP4
        </a>
        {out.srt ? (
          <a className="btn ghost" href={downloadUrl(p.projectId, "srt")}>
            字幕 SRT
          </a>
        ) : null}
        {out.zip ? (
          <a className="btn ghost" href={downloadUrl(p.projectId, "zip")}>
            打包 ZIP
          </a>
        ) : null}
      </div>

      <div className="row" style={{ justifyContent: "center", marginTop: 26 }}>
        <button
          className="btn ghost"
          disabled={p.stage === "done"}
          onClick={done}
        >
          {p.stage === "done" ? "已完成" : "完成，回到项目列表"}
        </button>
      </div>

      {/* #10：全屏预览遮罩层 */}
      {fs && out.mp4 ? (
        <div
          onClick={() => setFs(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(7,7,10,.92)",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          {/* 右上角关闭 */}
          <button
            className="btn ghost"
            onClick={(e) => {
              e.stopPropagation();
              setFs(false);
            }}
            style={{ position: "absolute", top: 18, right: 18, zIndex: 91 }}
          >
            ✕ 关闭
          </button>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={fileUrl(p.projectId, out.mp4)}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "92vw",
              maxHeight: "88vh",
              width: narrow ? "auto" : "100%",
              borderRadius: 12,
              background: "#000",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 失败面板 ---------- */
function FailedPanel({
  project: p,
  onDone,
}: {
  project: ProjectMeta;
  onDone: () => void;
}) {
  return (
    <div className="fade">
      <div className="banner err" style={{ marginBottom: 20 }}>
        生成失败：{p.error || "未知错误"}
      </div>
      <button className="btn ghost" onClick={onDone}>
        返回项目列表
      </button>
    </div>
  );
}
