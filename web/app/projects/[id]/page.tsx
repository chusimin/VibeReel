"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EnginePill } from "@/components/AppShell";
import Status from "@/components/Status";
import Cover from "@/components/Cover";
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
  railIndex,
  projectStatus,
  SCENE_STATUS,
} from "@/app/_ui";
import type { VideoType, Stage } from "@/lib/types";

// 左侧竖向步骤栏（mockups 03-06）：内容准备 + 各闸门。
const RAIL_LABEL: Record<string, string> = {
  方向: "方向确认",
  讲稿: "讲稿确认",
  分镜: "分镜确认",
  分段: "分段预览",
  终检: "最终检查",
};
function WorkRail({ stage, videoType }: { stage: Stage; videoType: VideoType }) {
  const gates = railFor(videoType);
  const steps = ["内容准备", ...gates.map((g) => RAIL_LABEL[g.l] ?? g.l)];
  const prep = ["ingesting", "decomposing", "briefing"].includes(stage);
  const cur = prep ? 0 : railIndex(stage, videoType) + 1;
  return (
    <div className="vrail">
      {steps.map((label, idx) => {
        const cls = idx < cur ? "done" : idx === cur ? "cur" : "";
        return (
          <div key={label} className={`step ${cls}`}>
            <span className="num">{idx < cur ? "✓" : idx + 1}</span>
            {label}
          </div>
        );
      })}
    </div>
  );
}
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

/* ---------- 装饰波形条（时间线观感，由 seed 稳定生成，非随机） ---------- */
function Waveform({
  seed = "vr",
  bars = 64,
  muted = false,
}: {
  seed?: string;
  bars?: number;
  muted?: boolean;
}) {
  let s = 7;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) % 9973;
  const arr = Array.from({ length: bars }, (_, i) => {
    const v =
      Math.abs(Math.sin(i * 0.5 + s * 0.013)) * 0.7 +
      Math.abs(Math.sin(i * 1.7 + s * 0.07)) * 0.3;
    return 16 + Math.round(v * 84);
  });
  return (
    <div className={`waveform ${muted ? "muted" : ""}`} aria-hidden>
      {arr.map((p, i) => (
        <i key={i} style={{ height: `${p}%` }} />
      ))}
    </div>
  );
}

/* ---------- 胶片缩略条（分镜/分段导航：点选切换中央大预览） ---------- */
function Filmstrip({
  scenes,
  projectId,
  aspect,
  sel,
  onSel,
  withStatus = false,
}: {
  scenes: SceneMeta[];
  projectId: string;
  aspect: ProjectMeta["aspect"];
  sel: number;
  onSel: (i: number) => void;
  withStatus?: boolean;
}) {
  const ar = ratio(aspect);
  return (
    <div className="film">
      {scenes.map((s, i) => {
        const ss = SCENE_STATUS[s.status] ?? SCENE_STATUS.pending;
        return (
          <div
            key={s.index}
            className={`cell ${i === sel ? "on" : ""}`}
            onClick={() => onSel(i)}
          >
            <div className="fr">
              <Cover
                seed={`${projectId}-${s.index}`}
                src={s.draftImage ? fileUrl(projectId, s.draftImage) : undefined}
                aspect={ar}
                rounded={8}
                badge={`#${s.index}`}
                play={Boolean(s.mp4)}
              />
            </div>
            <div className="cap">
              {withStatus ? (
                <span className={`status ${ss.cls}`} style={{ gap: 0 }}>
                  <span className="d" />
                </span>
              ) : null}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.role}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 分段大预览舞台：有 mp4 → 播放器；否则状态化封面 ---------- */
function SegStage({
  scene: s,
  projectId,
  aspect,
}: {
  scene: SceneMeta;
  projectId: string;
  aspect: ProjectMeta["aspect"];
}) {
  const ar = ratio(aspect);
  const b = RB[s.renderer];
  const narrow = aspect === "9:16";
  const wrap: React.CSSProperties = {
    maxWidth: narrow ? 320 : 760,
    margin: "0 auto",
    width: "100%",
  };
  if (s.mp4) {
    return (
      <div style={wrap}>
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
      </div>
    );
  }
  const rendering = s.status === "rendering" || s.status === "redo";
  return (
    <div style={wrap}>
      <Cover
        seed={`${projectId}-${s.index}`}
        src={s.draftImage ? fileUrl(projectId, s.draftImage) : undefined}
        aspect={ar}
        rounded={14}
        badge={rendering ? `${b.name} 渲染中…` : `待生成 · ${b.name}`}
        caption={`#${s.index} ${s.role}`}
        right={`${s.durationSec}s`}
      >
        {rendering ? (
          <span
            style={{
              position: "absolute",
              zIndex: 6,
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
            }}
          >
            <span className="spin" style={{ width: 26, height: 26 }} />
          </span>
        ) : null}
      </Cover>
    </div>
  );
}

/* ---------- 选中镜详情卡（右栏：序号/标题/时长/镜头类型/引用料块） ---------- */
function SceneDetail({ scene: s }: { scene: SceneMeta }) {
  const b = RB[s.renderer];
  const ss = SCENE_STATUS[s.status] ?? SCENE_STATUS.pending;
  return (
    <div className="summary">
      <div className="spaced" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>
          镜头 #{s.index}
        </h3>
        <Status cls={ss.cls} label={ss.label} ring={s.status === "rendering"} />
      </div>
      <div className="kv">
        <span className="k">标题</span>
        <span className="v">{s.role}</span>
      </div>
      <div className="kv">
        <span className="k">时长</span>
        <span className="v mono">{s.durationSec}s</span>
      </div>
      <div className="kv">
        <span className="k">镜头类型</span>
        <span className="v">{b.name}</span>
      </div>
      {s.onScreenText ? (
        <div className="kv" style={{ alignItems: "flex-start" }}>
          <span className="k">画面字</span>
          <span className="v" style={{ textAlign: "right", fontWeight: 400 }}>
            {s.onScreenText}
          </span>
        </div>
      ) : null}
      {s.rev ? (
        <div className="kv">
          <span className="k">修订</span>
          <span className="v">已改 {s.rev} 版</span>
        </div>
      ) : null}
      <RefsChips refs={s.refs} />
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
              style={{ background: "var(--surface-1)", padding: "10px 12px" }}
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
      <div className="center">
        <div className="card pad">
          <div className="row" style={{ gap: 11 }}>
            <span className="spin"></span>
            <b>{connErr ? "连接中断，正在重连…" : "连接项目状态流…"}</b>
            <span className="chip" style={{ marginLeft: "auto" }}>SSE 实时</span>
          </div>
        </div>
      </div>
    );
  }

  const p = project;
  const t = TYPES[p.videoType];
  const ps = projectStatus(p.stage);

  return (
    <div className="app">
      {/* 左侧竖向步骤栏（mockups 03-06） */}
      <aside className="sidebar steps">
        <div className="logo" onClick={() => router.push("/")} title="VibeReel">V</div>
        <WorkRail stage={p.stage} videoType={p.videoType} />
        <div className="grow" />
        <div className="me" onClick={() => router.push("/settings")} title="账户">我</div>
      </aside>

      <div className="main">
        {/* 顶栏：返回 + 项目名 + 状态 + 画幅 + 引擎 */}
        <div className="topbar">
          <span className="back" onClick={() => router.push("/")}>← 项目列表</span>
          <div className="sp" />
          <b style={{ fontSize: 14 }}>{p.title}</b>
          <Status cls={ps.cls} label={ps.label} />
          <span className="chip">{p.aspect}</span>
          <EnginePill />
        </div>

        <div className="content wide fade">
          {/* 四件套 chips */}
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            <span className="chip">类型 <b>{t.name}</b></span>
            <span className="chip">风格 <b>{p.fourPack.styleId}</b></span>
            <span className="chip">骨架 <b>{railFor(p.videoType).length} 闸门</b></span>
            <span className="chip">配音 <b>{p.vo ? "开" : "关"}</b></span>
          </div>

          {/* 内容拆解料块（#5） */}
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

/* ---------- 小图标（方向封面 / 来源素材） ---------- */
const DIR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="12" cy="12" r="9" />
    <path d="m9.5 14.5 1.4-4.6 4.6-1.4-1.4 4.6z" fill="currentColor" stroke="none" />
  </svg>
);
function InputIcon({ kind }: { kind: string }) {
  if (kind === "url")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M10 14a4 4 0 0 0 5.66 0l2.5-2.5a4 4 0 1 0-5.66-5.66L11 7.3" />
        <path d="M14 10a4 4 0 0 0-5.66 0l-2.5 2.5a4 4 0 1 0 5.66 5.66L13 16.7" />
      </svg>
    );
  if (kind === "idea")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.7.6-1 1-1 2H9c0-1-.3-1.4-1-2A6 6 0 0 1 12 3Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="m9 9-3 3 3 3M15 9l3 3-3 3" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}
const INPUT_LABEL: Record<string, string> = {
  url: "链接",
  idea: "想法",
  code: "代码包",
};

/* ---------- 闸门① 选方向（preview-centric：方向封面 + look/palette/pacing + 来源素材） ---------- */
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
      <div className="spaced">
        <h2>选择一个创作方向</h2>
        <span className="aux">2–3 个创作方向，挑一个（可逐项编辑）</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 300px", alignItems: "start", gap: 24, marginTop: 16 }}>
        {/* 左：方向大卡 + 来源素材条 */}
        <div>
          <div className="grid" style={{ gridTemplateColumns: p.concepts.length >= 3 ? "repeat(3,1fr)" : "repeat(2,1fr)" }}>
            {p.concepts.map((c: Concept, idx: number) => (
              <ConceptCard
                key={idx}
                concept={c}
                index={idx}
                projectId={p.projectId}
                selected={sel === idx}
                onSelect={() => setSel(idx)}
                edit={edit}
              />
            ))}
          </div>

          {/* 来源素材条（对齐 v1 03 底部） */}
          {p.inputs && p.inputs.length > 0 ? (
            <div style={{ marginTop: 22 }}>
              <div className="spaced" style={{ marginBottom: 10 }}>
                <h3 style={{ fontSize: 14 }}>来源素材</h3>
                <span className="aux">这些方向基于以下输入</span>
              </div>
              <div className="film">
                {p.inputs.map((it) => (
                  <div key={it.id} className="cell" style={{ cursor: "default", width: 132 }}>
                    <div className="fr">
                      <Cover seed={it.id} aspect="16/9" rounded={8} icon={<InputIcon kind={it.kind} />} />
                    </div>
                    <div className="cap">
                      <span className="tag" style={{ fontSize: 10.5 }}>{INPUT_LABEL[it.kind] ?? it.kind}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{it.label || it.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 右侧方向摘要（对齐 v1 03 三栏布局） */}
        <div style={{ position: "sticky", top: 80 }}>
          <div className="summary">
            <h3>方向摘要</h3>
            <div className="kv"><span className="k">类型</span><span className="v">{TYPES[p.videoType].name}</span></div>
            <div className="kv"><span className="k">风格</span><span className="v">{p.fourPack.styleId}</span></div>
            <div className="kv"><span className="k">配音</span><span className="v">{p.vo ? "开启" : "关闭"}</span></div>
            {sel !== null && p.concepts[sel] ? (
              <>
                <div className="kv"><span className="k">已选方向</span><span className="v">{p.concepts[sel].title}</span></div>
                {p.concepts[sel].palette ? <div className="kv"><span className="k">配色</span><span className="v">{p.concepts[sel].palette}</span></div> : null}
                {p.concepts[sel].pacing ? <div className="kv"><span className="k">节奏</span><span className="v">{p.concepts[sel].pacing}</span></div> : null}
              </>
            ) : null}
          </div>
          <button className="btn block" style={{ marginTop: 14 }} disabled={sel === null} onClick={() => sel !== null && gate({ gate: "concept", choice: sel })}>
            确认方向 →
          </button>
          {sel === null ? <p className="aux" style={{ marginTop: 10, textAlign: "center" }}>先选一个方向</p> : null}
        </div>
      </div>
    </div>
  );
}

function ConceptCard({
  concept: c,
  index,
  projectId,
  selected,
  onSelect,
  edit,
}: {
  concept: Concept;
  index: number;
  projectId: string;
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
      style={{ padding: 0, overflow: "hidden" }}
    >
      <Cover
        seed={`${projectId}-concept-${index}`}
        aspect="16/10"
        rounded={0}
        icon={DIR_ICON}
        play
        hoverPop
        badge={`方向 ${String.fromCharCode(65 + index)}`}
      />
      <div style={{ padding: 18 }}>
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
        <h2>讲稿确认</h2>
        <span className="aux">逐镜旁白 / 知识点，确认后再排分镜</span>
      </div>
      <div className="banner info" style={{ margin: "14px 0" }}>
        讲稿由本机 claude CLI 口语化生成，确认后才会进入分镜与渲染。
      </div>
      <div className="card pad" style={{ background: "var(--surface-1)" }}>
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
        <div className="card pad fade" style={{ marginTop: 18, background: "var(--surface-1)" }}>
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

/* ---------- 闸门② 确认分镜（preview-centric：中央大草稿 + 波形 + 胶片条 + 右详情 + 逐镜表） ---------- */
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
  const [sel, setSel] = useState(0);
  const scenes = p.scenes;
  const totalDur = scenes.reduce((a, s) => a + (s.durationSec || 0), 0);
  const cur = Math.max(0, Math.min(scenes.length - 1, sel));
  const s = scenes[cur];
  const narrow = p.aspect === "9:16";

  return (
    <div className="fade">
      <BackBar nav={nav} />
      <div className="spaced">
        <h2>分镜确认</h2>
        <span className="aux">草稿仅供方向确认 · 点胶片切换 · 下方逐镜可改</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start", gap: 24, marginTop: 14 }}>
        {/* 左：中央大草稿 + 波形 + 胶片条 + 逐镜表 */}
        <div>
          {/* 中央影院位 */}
          <div className="stage">
            {s ? (
              <Cover
                seed={`${p.projectId}-${s.index}`}
                src={s.draftImage ? fileUrl(p.projectId, s.draftImage) : undefined}
                aspect={ratio(p.aspect)}
                rounded={0}
                badge="草稿"
                caption={`#${s.index} ${s.role}`}
                right={`${s.durationSec}s · ${RB[s.renderer].name}`}
                play
                style={{ maxWidth: narrow ? 360 : "100%", margin: "0 auto" }}
              />
            ) : null}
          </div>
          <div style={{ marginTop: 12 }}>
            <Waveform seed={`${p.projectId}-sb-${cur}`} muted />
          </div>
          <Filmstrip scenes={scenes} projectId={p.projectId} aspect={p.aspect} sel={cur} onSel={setSel} />

          <div className="banner info" style={{ margin: "8px 0 14px" }}>
            草稿仅供<b>方向确认</b>，不是正片精确长相。确认后才按各自后端渲正片。
          </div>

          {/* 逐镜微调（保留内联编辑能力） */}
          <div className="spaced" style={{ margin: "4px 0 10px" }}>
            <h3 style={{ fontSize: 14 }}>逐镜微调</h3>
            <span className="aux">每行一镜 · 列项可内联编辑</span>
          </div>
          <div className="col" style={{ gap: 10 }}>
            {scenes.map((sc) => (
              <StoryboardRow key={sc.index} scene={sc} projectId={p.projectId} aspect={p.aspect} edit={edit} />
            ))}
          </div>

          {redo !== null ? (
            <div className="card pad fade" style={{ marginTop: 18 }}>
              <label className="fld">一句话意见（可空）— agent 会按意见重写分镜并追加一条 revision</label>
              <textarea placeholder="例：第 1 镜更聚焦痛点；整体节奏再快一点" value={redo} onChange={(e) => setRedo(e.target.value)} />
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn sm" onClick={() => gate({ gate: "storyboard", action: "redo", note: redo || undefined })}>提交重写</button>
                <button className="btn ghost sm" onClick={() => setRedo(null)}>取消</button>
              </div>
            </div>
          ) : null}
        </div>

        {/* 右：选中镜详情 + 分镜摘要 + 操作 */}
        <div className="col" style={{ position: "sticky", top: 80, gap: 14 }}>
          {s ? <SceneDetail scene={s} /> : null}
          <div className="summary">
            <h3>分镜摘要</h3>
            <div className="kv"><span className="k">镜头数</span><span className="v">{scenes.length}</span></div>
            <div className="kv"><span className="k">预计时长</span><span className="v mono">{totalDur}s</span></div>
            <div className="kv"><span className="k">风格</span><span className="v">{p.fourPack.styleId}</span></div>
            <div className="kv"><span className="k">配音</span><span className="v">{p.vo ? "开启" : "关闭"}</span></div>
          </div>
          <button className="btn block" onClick={() => gate({ gate: "storyboard", action: "confirm" })}>确认分镜 → 渲染</button>
          <button className="btn ghost block" onClick={() => setRedo("")}>打回重做</button>
        </div>
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
      style={{ background: "var(--surface-1)", padding: "12px 14px" }}
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
  const scenes = p.scenes;
  const N = scenes.length;
  const [sel, setSel] = useState(0);
  const cur = Math.max(0, Math.min(N - 1, sel));
  const s = scenes[cur];

  // 一镜是否「已生成」（有 mp4，可预览/可重做）。
  const hasMedia = (x: SceneMeta) => Boolean(x.mp4);
  // 一镜是否「待生成」占位（还没出 mp4 且未在渲染）。
  const isPending = (x: SceneMeta) => !x.mp4 && x.status === "pending";

  const generated = scenes.filter(hasMedia);
  const anyPending = scenes.some(isPending);
  // 阶段判定：仍有「待生成」的镜 → 处于「前 2 镜确认」阶段。
  const inPreviewPhase = anyPending;
  // 是否还有镜在渲染中（未全部出片）。
  const anyRendering = scenes.some((x) => x.status === "rendering");
  // 全部已生成且无待生成/无渲染中 → 可合成。
  const allReady = N > 0 && generated.length === N && !anyRendering;

  const cAwait = scenes.filter((x) => x.status === "await_review").length;
  const cOk = scenes.filter((x) => x.status === "approved").length;
  const cPending = scenes.filter((x) => x.status === "pending").length;

  return (
    <div className="fade">
      <BackBar nav={nav} />
      <div className="spaced">
        <h2>分段预览</h2>
        <span className="aux">每镜按各自后端渲染 · 点胶片切换 · 可单独重做</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start", gap: 24, marginTop: 14 }}>
        {/* 左：中央大预览 + 波形 + 胶片条 */}
        <div>
          <div className="banner info" style={{ marginBottom: 14 }}>
            {inPreviewPhase ? (
              <span>先渲<b>前 2 镜</b>给你确认方向：满意就「续渲全部」，其余镜会按各自后端继续生成。</span>
            ) : (
              <span>每镜按自己的后端渲染（Remotion / 生成式 / Lottie / 推拉），统一 config 防拼贴感。任意已生成镜可单独重做。</span>
            )}
          </div>
          {s ? <SegStage scene={s} projectId={p.projectId} aspect={p.aspect} /> : null}
          <div style={{ marginTop: 12 }}>
            <Waveform seed={`${p.projectId}-seg-${cur}`} muted={!s || !s.mp4} />
          </div>
          <Filmstrip scenes={scenes} projectId={p.projectId} aspect={p.aspect} sel={cur} onSel={setSel} withStatus />
        </div>

        {/* 右：选中镜详情 + 单镜重做 + 渲染进度 + 主操作 */}
        <div className="col" style={{ position: "sticky", top: 80, gap: 14 }}>
          {s ? <SceneDetail scene={s} /> : null}
          {s ? <RedoControl scene={s} gate={gate} /> : null}
          <div className="summary">
            <h3>渲染进度</h3>
            <div className="kv"><span className="k">已生成</span><span className="v mono">{generated.length}/{N}</span></div>
            <div className="kv"><span className="k status review"><span className="d" />待确认</span><span className="v">{cAwait}</span></div>
            <div className="kv"><span className="k status ok"><span className="d" />已通过</span><span className="v">{cOk}</span></div>
            <div className="kv"><span className="k status pending"><span className="d" />待生成</span><span className="v">{cPending}</span></div>
          </div>
          <div>
            {inPreviewPhase ? (
              <button className="btn block" disabled={generated.length < 1} onClick={() => gate({ gate: "chunk", action: "continue" })}>
                确认前 {Math.min(2, N)} 镜 → 续渲全部
              </button>
            ) : allReady ? (
              <button className="btn block" onClick={() => gate({ gate: "chunk", action: "assemble" })}>全部满意 → 合成成片</button>
            ) : (
              <button className="btn block" disabled>
                <span className="spin" style={{ width: 13, height: 13 }} />其余镜渲染中（{generated.length}/{N}）
              </button>
            )}
          </div>
        </div>
      </div>
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
        <h2>最终检查</h2>
        <span className="aux">{p.aspect} 成片</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start", gap: 24, marginTop: 14 }}>
        {/* 左：成片预览 */}
        <div>
          {out.mp4 ? (
            <div className="player" style={{ aspectRatio: ratio(p.aspect), maxHeight: "70vh", maxWidth: narrow ? 300 : "100%", margin: narrow ? "0 auto" : undefined }}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={fileUrl(p.projectId, out.mp4)} controls style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              <div className="meta"><span>{p.title}</span><span>{p.aspect}</span></div>
            </div>
          ) : (
            <div className="skel" style={{ aspectRatio: ratio(p.aspect), maxHeight: "70vh" }}>
              <span className="lbl muted">成片合成中…</span>
            </div>
          )}
          {out.mp4 ? (
            <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
              <button className="btn ghost sm" onClick={() => setFs(true)}>⛶ 全屏预览</button>
            </div>
          ) : null}
        </div>

        {/* 右：导出设置 + 终检结果 + 下载（对齐 v1 06） */}
        <div style={{ position: "sticky", top: 80 }}>
          <div className="summary">
            <h3>导出设置</h3>
            <div className="kv"><span className="k">格式</span><span className="v">MP4</span></div>
            <div className="kv"><span className="k">分辨率</span><span className="v">1080p</span></div>
            <div className="kv"><span className="k">画幅</span><span className="v">{p.aspect}</span></div>
            <div className="kv"><span className="k">配音</span><span className="v">{p.vo ? "开" : "关"}{p.vo ? <span className="tag" style={{ marginLeft: 8 }}>待生成支持</span> : null}</span></div>
            <div className="kv"><span className="k">字幕</span><span className="v">{p.subtitle ? "开" : "关"}{p.subtitle ? <span className="tag" style={{ marginLeft: 8 }}>{out.srt ? "已生成" : "待生成支持"}</span> : null}</span></div>
          </div>

          <div className="summary" style={{ marginTop: 14 }}>
            <h3>终检结果</h3>
            <div className="kv">
              <span className="k">文件完整性</span>
              <span className="v">{out.mp4 ? <Status cls="ok" label="通过" /> : <Status cls="pending" label="待合成" />}</span>
            </div>
            {(p.fourPack.qaRules ?? []).slice(0, 4).map((r, i) => (
              <div className="kv" key={i}>
                <span className="k" style={{ fontSize: 12, lineHeight: 1.4, paddingRight: 8 }}>{r}</span>
                <span className="tag" style={{ flex: "0 0 auto" }}>提示</span>
              </div>
            ))}
            <p className="aux" style={{ marginTop: 8 }}>QA 为提示项，不阻断下载。</p>
          </div>

          <a className="btn block" style={{ marginTop: 14 }} href={downloadUrl(p.projectId, "mp4")}>下载 MP4</a>
          {out.srt ? <a className="btn ghost block" style={{ marginTop: 10 }} href={downloadUrl(p.projectId, "srt")}>字幕 SRT</a> : null}
          {out.zip ? <a className="btn ghost block" style={{ marginTop: 10 }} href={downloadUrl(p.projectId, "zip")}>打包 ZIP</a> : null}
          <button className="btn ghost block" style={{ marginTop: 10 }} disabled={p.stage === "done"} onClick={done}>
            {p.stage === "done" ? "已完成" : "完成，回到项目列表"}
          </button>
        </div>
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
  const [busy, setBusy] = useState(false);
  const canRetryStoryboard = p.chosenConcept != null;
  async function retry() {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${p.projectId}/retry-storyboard`, {
        method: "POST",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(`重试失败：${j.error || r.status}`);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fade">
      <div className="banner err" style={{ marginBottom: 20, whiteSpace: "pre-wrap" }}>
        生成失败：{p.error || "未知错误"}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {canRetryStoryboard && (
          <button className="btn" onClick={retry} disabled={busy}>
            {busy ? "重新生成中…" : "重新生成分镜"}
          </button>
        )}
        <button className="btn ghost" onClick={onDone}>
          返回项目列表
        </button>
      </div>
    </div>
  );
}
