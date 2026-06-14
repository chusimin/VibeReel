"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import {
  api,
  toast,
  ratio,
  libraryFileUrl,
  TYPES,
  STYLE_PACKS,
  recommendedFor,
} from "@/app/_ui";
import type {
  VideoType,
  Aspect,
  InputItem,
  RoleEntry,
  RoleKind,
  CustomStyleMode,
} from "@/lib/types";
import type { StylePack } from "@/lib/styles";

const WIZ_STEPS = ["选类型", "填输入", "选画幅", "选风格", "素材/角色"];

/* ============================================================
   风格主图：内置 → /styles/<id>.png；自定义 → 库主图 or 色板渐变占位
   ============================================================ */
function StyleThumb({ s }: { s: StylePack }) {
  const [err, setErr] = useState(false);
  const src = s.custom && s.heroImage ? libraryFileUrl(s.heroImage) : `/styles/${s.id}.png`;
  if (err || (s.custom && !s.heroImage)) {
    return (
      <div
        className="thumb"
        style={{
          background: `linear-gradient(135deg, ${s.bg}, ${s.accent})`,
          display: "grid",
          placeItems: "center",
          border: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            color: s.fg,
            fontSize: 12,
            background: "rgba(255,255,255,.55)",
            padding: "2px 10px",
            borderRadius: 999,
          }}
        >
          {s.custom ? "自定义风格" : "主图待上传"}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={s.name}
      className="thumb"
      style={{ width: "100%", objectFit: "cover", border: "1px solid var(--border)" }}
      onError={() => setErr(true)}
    />
  );
}

/* 草稿输入项（#2 多输入：浏览器侧暂存，创建后再落库） */
interface DraftText {
  kind: "url" | "idea";
  value: string;
}
interface DraftAssetFile {
  file: File;
  url: string; // 预览 objectURL
}
interface DraftColor {
  ref: string;
  name: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<VideoType>("showreel");

  // #2 多输入
  const [texts, setTexts] = useState<DraftText[]>([
    { kind: "url", value: "https://acme.example.com" },
  ]);
  const [codeFiles, setCodeFiles] = useState<File[]>([]);

  const [aspect, setAspect] = useState<Aspect>("16:9");

  // #4 风格（内置 + 自定义）
  const [style, setStyle] = useState("editorial-saas");
  const [customStyles, setCustomStyles] = useState<StylePack[]>([]);

  // #1 项目素材
  const [assetFiles, setAssetFiles] = useState<DraftAssetFile[]>([]);
  const [colors, setColors] = useState<DraftColor[]>([]);

  // #1 角色/品牌库
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [roleRefs, setRoleRefs] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);

  // 进 4/5 步时拉库数据
  useEffect(() => {
    api.listCustomStyles().then((d) => setCustomStyles(d.styles)).catch(() => {});
    api.listRoles().then((d) => setRoles(d.roles)).catch(() => {});
  }, []);

  function pickType(k: VideoType) {
    setType(k);
    const reco = recommendedFor(k);
    setStyle(reco[0] ?? STYLE_PACKS[0].id);
  }

  // ---- 多输入编辑 ----
  function addText(kind: "url" | "idea") {
    setTexts([...texts, { kind, value: kind === "url" ? "https://" : "" }]);
  }
  function setTextAt(i: number, patch: Partial<DraftText>) {
    setTexts(texts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function rmText(i: number) {
    setTexts(texts.filter((_, idx) => idx !== i));
  }
  function addCodeFiles(files: FileList | null) {
    if (!files) return;
    setCodeFiles([...codeFiles, ...Array.from(files)]);
  }
  function rmCode(i: number) {
    setCodeFiles(codeFiles.filter((_, idx) => idx !== i));
  }

  // ---- 素材 ----
  function addAssetFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setAssetFiles([...assetFiles, ...next]);
  }
  function rmAsset(i: number) {
    setAssetFiles(assetFiles.filter((_, idx) => idx !== i));
  }
  function addColor() {
    setColors([...colors, { ref: "#5B9BFF", name: "品牌色" }]);
  }
  function setColorAt(i: number, patch: Partial<DraftColor>) {
    setColors(colors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function rmColor(i: number) {
    setColors(colors.filter((_, idx) => idx !== i));
  }

  // ---- 角色 ----
  function toggleRole(id: string) {
    setRoleRefs((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  }

  // ---- 两段式创建 ----
  async function finish() {
    setBusy(true);
    try {
      const inputs: InputItem[] = texts
        .filter((t) => t.value.trim())
        .map((t) => ({ id: "", kind: t.kind, value: t.value.trim() }));
      // 仅有代码包时，合成一句想法兜底（后端创建需 ≥1 输入）
      if (inputs.length === 0 && codeFiles.length > 0) {
        inputs.push({ id: "", kind: "idea", value: `基于上传代码包「${codeFiles[0].name}」制作视频` });
      }
      if (inputs.length === 0) {
        toast("至少填一条链接或想法");
        setBusy(false);
        return;
      }

      const { id } = await api.createProject({
        videoType: type,
        inputs,
        aspect,
        styleId: style,
        roleRefs,
        autostart: false,
      });

      // 传代码包（#2）
      for (const f of codeFiles) {
        await api.addInputFile(id, f);
      }
      // 传素材（#1）
      for (const a of assetFiles) {
        await api.uploadAsset(id, a.file, a.file.type.includes("svg") ? "logo" : "image");
      }
      for (const c of colors) {
        await api.addAssetMeta(id, { kind: "color", ref: c.ref, name: c.name });
      }

      await api.start(id);
      router.push("/projects/" + id);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) {
        router.push("/login");
        return;
      }
      toast("创建失败，请重试");
      setBusy(false);
    }
  }

  const last = step === 5;
  const reco = recommendedFor(type);
  const allStyles: StylePack[] = [...STYLE_PACKS, ...customStyles];
  const hasInput = texts.some((t) => t.value.trim()) || codeFiles.length > 0;

  return (
    <div className="shell">
      <TopBar active="home" />
      <div className="page">
        <div className="fade">
          <div className="spaced" style={{ marginBottom: 6 }}>
            <h1>新建项目</h1>
            <Link href="/">取消</Link>
          </div>

          {/* 步骤指示 rail */}
          <div className="rail" style={{ margin: "18px 0 26px" }}>
            {WIZ_STEPS.map((s, idx) => {
              const n = idx + 1;
              const cls = n < step ? "done" : n === step ? "cur" : "";
              return (
                <span key={s} style={{ display: "contents" }}>
                  <div className={`step ${cls}`}>
                    <span className="num">{n < step ? "✓" : n}</span>
                    {s}
                  </div>
                  {idx < 4 ? (
                    <span className={`bar ${n < step ? "done" : ""}`}></span>
                  ) : null}
                </span>
              );
            })}
          </div>

          {/* 步骤 1：选类型 */}
          {step === 1 && (
            <>
              <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                {(Object.keys(TYPES) as VideoType[]).map((k) => {
                  const t = TYPES[k];
                  return (
                    <div
                      key={k}
                      className={`sel ${type === k ? "on" : ""}`}
                      onClick={() => pickType(k)}
                    >
                      <div className="thumb" style={{ background: t.grad }}></div>
                      <h2 style={{ fontSize: 16 }}>{t.name}</h2>
                      <p className="aux" style={{ margin: "6px 0 10px" }}>{t.desc}</p>
                      <span className="chip">{t.note}</span>
                    </div>
                  );
                })}
              </div>
              <div className="hint" style={{ marginTop: 16 }}>
                📌 选类型 = 装上该类型的<b>四件套</b>（知识包 / 风格包 / 闸门配置 / QA 规则），再走同一条公共骨架。
              </div>
            </>
          )}

          {/* 步骤 2：填输入（#2 多输入：链接/想法多条 + 代码包） */}
          {step === 2 && (
            <div style={{ maxWidth: 660 }}>
              <div className="banner info" style={{ marginBottom: 16 }}>
                可同时投<b>多条</b>：链接、想法、产品代码包一起发，后台会统一抓取并<b>拆成可引用料块</b>。
              </div>

              {/* 文本输入列表 */}
              <div className="col" style={{ gap: 12 }}>
                {texts.map((t, i) => (
                  <div key={i} className="card pad" style={{ background: "#fff" }}>
                    <div className="spaced" style={{ marginBottom: 10 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span
                          className={`pill ${t.kind === "url" ? "on" : ""}`}
                          onClick={() => setTextAt(i, { kind: "url", value: t.kind === "url" ? t.value : "https://" })}
                        >
                          链接 URL
                        </span>
                        <span
                          className={`pill ${t.kind === "idea" ? "on" : ""}`}
                          onClick={() => setTextAt(i, { kind: "idea", value: t.kind === "idea" ? t.value : "" })}
                        >
                          想法
                        </span>
                      </div>
                      <button className="btn ghost sm" onClick={() => rmText(i)}>
                        ✕ 删除
                      </button>
                    </div>
                    {t.kind === "url" ? (
                      <input
                        className="input"
                        value={t.value}
                        placeholder="https://..."
                        onChange={(e) => setTextAt(i, { value: e.target.value })}
                      />
                    ) : (
                      <textarea
                        placeholder="例：把我们的数据分析工具做成 15s 高级感 showreel"
                        value={t.value}
                        onChange={(e) => setTextAt(i, { value: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="row" style={{ gap: 10, marginTop: 12 }}>
                <button className="btn ghost sm" onClick={() => addText("url")}>+ 加链接</button>
                <button className="btn ghost sm" onClick={() => addText("idea")}>+ 加想法</button>
              </div>

              {/* 代码包上传 */}
              <h2 style={{ fontSize: 15, margin: "24px 0 10px" }}>产品代码包（可选）</h2>
              <label
                className="card pad"
                style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer", display: "block" }}
              >
                <div style={{ fontSize: 22 }}>🗜️</div>
                <p style={{ fontWeight: 500, margin: "6px 0 2px" }}>点击上传 .zip 代码包</p>
                <p className="aux">后台自动解压、读 README/源码，拆成可引用料块</p>
                <input
                  type="file"
                  accept=".zip"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => addCodeFiles(e.target.files)}
                />
              </label>
              {codeFiles.length ? (
                <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  {codeFiles.map((f, i) => (
                    <span key={i} className="chip">
                      🗜️ {f.name}
                      <span style={{ cursor: "pointer", marginLeft: 6 }} onClick={() => rmCode(i)}>✕</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* 步骤 3：选画幅 */}
          {step === 3 && (
            <>
              <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", maxWidth: 720 }}>
                {([
                  { a: "16:9" as Aspect, label: "横屏 · 默认", desc: "网页 / B 站 / YouTube" },
                  { a: "9:16" as Aspect, label: "竖屏", desc: "抖音 / Reels · --platform douyin" },
                  { a: "1:1" as Aspect, label: "方形", desc: "Instagram / 朋友圈" },
                ]).map(({ a, label, desc }) => (
                  <div
                    key={a}
                    className={`sel ${aspect === a ? "on" : ""}`}
                    onClick={() => setAspect(a)}
                  >
                    <div style={{ height: 130, display: "grid", placeItems: "center", marginBottom: 14 }}>
                      <div
                        style={{
                          aspectRatio: ratio(a),
                          height: a === "16:9" ? "auto" : 120,
                          width: a === "16:9" ? "92%" : "auto",
                          maxWidth: "100%",
                          maxHeight: 120,
                          borderRadius: 10,
                          background: "#0B0B0F",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <span style={{ color: "#fff", opacity: 0.6, fontSize: 12 }}>{a}</span>
                      </div>
                    </div>
                    <div className="spaced">
                      <h2 style={{ fontSize: 15 }}>{a}</h2>
                      {aspect === a ? <span className="tag bk-kenburns">已选</span> : null}
                    </div>
                    <p className="aux" style={{ marginTop: 5 }}>
                      <b style={{ color: "var(--text)" }}>{label}</b>
                    </p>
                    <p className="aux" style={{ marginTop: 3 }}>{desc}</p>
                  </div>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 16 }}>
                ⚠️ 9:16 会显式告诉引擎 <span className="mono">--platform douyin</span>，不会因默认出成 16:9。
              </div>
            </>
          )}

          {/* 步骤 4：选风格（内置 11 + 自定义 + 自定义创建器） */}
          {step === 4 && (
            <StyleStep
              allStyles={allStyles}
              reco={reco}
              style={style}
              setStyle={setStyle}
              onCreated={async (newId) => {
                const d = await api.listCustomStyles();
                setCustomStyles(d.styles);
                setStyle(newId);
              }}
            />
          )}

          {/* 步骤 5：素材 + 角色 */}
          {step === 5 && (
            <div style={{ maxWidth: 720 }}>
              {/* 素材库 */}
              <h2 style={{ fontSize: 16 }}>项目素材（可选）</h2>
              <p className="aux" style={{ margin: "4px 0 12px" }}>
                产品截图 / logo / 品牌色——传得越全，<span className="mono">still-kenburns</span> 推拉镜越能用上真图。
              </p>
              <label
                className="card pad"
                style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer", display: "block" }}
              >
                <div style={{ fontSize: 24 }}>⬆️</div>
                <p style={{ fontWeight: 500, margin: "8px 0 4px" }}>点击上传图片 / logo</p>
                <p className="aux">支持多选，png/jpg/svg</p>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => addAssetFiles(e.target.files)}
                />
              </label>
              {assetFiles.length ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 14 }}>
                  {assetFiles.map((a, i) => (
                    <div key={i} className="col" style={{ gap: 6 }}>
                      <div className="thumb" style={{ height: 72, margin: 0, position: "relative", overflow: "hidden" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span
                          className="corner"
                          onClick={() => rmAsset(i)}
                          style={{ cursor: "pointer", top: 6, right: 6, left: "auto" }}
                        >
                          ✕
                        </span>
                      </div>
                      <span className="aux" style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.file.name}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* 品牌色 */}
              <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <button className="btn ghost sm" onClick={addColor}>+ 加品牌色</button>
                {colors.map((c, i) => (
                  <span key={i} className="chip" style={{ gap: 8 }}>
                    <input
                      type="color"
                      value={c.ref}
                      onChange={(e) => setColorAt(i, { ref: e.target.value })}
                      style={{ width: 22, height: 22, border: "none", background: "none", padding: 0, cursor: "pointer" }}
                    />
                    <input
                      value={c.name}
                      onChange={(e) => setColorAt(i, { name: e.target.value })}
                      style={{ width: 70, border: "none", background: "transparent", fontSize: 12.5 }}
                    />
                    <span style={{ cursor: "pointer" }} onClick={() => rmColor(i)}>✕</span>
                  </span>
                ))}
              </div>

              {/* 角色 / 品牌库 */}
              <div className="divider" style={{ margin: "26px 0 16px" }}></div>
              <RoleStep
                roles={roles}
                roleRefs={roleRefs}
                toggleRole={toggleRole}
                onCreated={async (id) => {
                  const d = await api.listRoles();
                  setRoles(d.roles);
                  setRoleRefs((r) => [...r, id]);
                }}
              />
            </div>
          )}

          {/* 导航按钮 */}
          <div className="row" style={{ marginTop: 28 }}>
            {step > 1 ? (
              <button className="btn ghost" onClick={() => setStep((s) => s - 1)}>上一步</button>
            ) : null}
            <div style={{ flex: 1 }}></div>
            {step === 5 ? (
              <button className="btn ghost" disabled={busy} onClick={finish}>跳过，直接生成</button>
            ) : null}
            <button
              className="btn"
              disabled={busy || (step === 2 && !hasInput)}
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
            >
              {last ? (busy ? "创建中…" : "开始生成 →") : "下一步"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   步骤 4 子组件：风格网格 + 自定义风格创建器（#4 三法）
   ============================================================ */
function StyleStep({
  allStyles,
  reco,
  style,
  setStyle,
  onCreated,
}: {
  allStyles: StylePack[];
  reco: string[];
  style: string;
  setStyle: (id: string) => void;
  onCreated: (newId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {allStyles.map((s) => {
          const isReco = reco.includes(s.id);
          return (
            <div
              key={s.id}
              className={`sel ${style === s.id ? "on" : ""}`}
              onClick={() => setStyle(s.id)}
              style={{ position: "relative" }}
            >
              {isReco ? (
                <span className="tag bk-kenburns" style={{ position: "absolute", top: 12, right: 12 }}>推荐</span>
              ) : s.custom ? (
                <span className="tag" style={{ position: "absolute", top: 12, right: 12 }}>自定义</span>
              ) : null}
              <StyleThumb s={s} />
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                {[s.bg, s.fg, s.accent].map((c, i) => (
                  <span
                    key={i}
                    style={{ width: 26, height: 26, borderRadius: 7, background: c, border: "1px solid var(--border)", display: "inline-block" }}
                  ></span>
                ))}
              </div>
              <h2 style={{ fontSize: 15, paddingRight: 44 }}>{s.name}</h2>
              <p className="aux" style={{ marginTop: 5 }}>{s.label}</p>
            </div>
          );
        })}

        {/* + 自定义风格 入口卡 */}
        <div
          className="sel"
          onClick={() => setOpen(true)}
          style={{ display: "grid", placeItems: "center", minHeight: 200, borderStyle: "dashed", cursor: "pointer" }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>＋</div>
            <p style={{ fontWeight: 500, marginTop: 6 }}>自定义风格</p>
            <p className="aux" style={{ marginTop: 2 }}>手填色板 / 一句描述 / 参考图</p>
          </div>
        </div>
      </div>

      <div className="hint" style={{ marginTop: 16 }}>
        风格包决定<b>草稿基因词</b>与<b>每个后端</b>渲染吃的统一 config（色板/字体）。「推荐」按当前视频类型给出。
      </div>

      {open ? (
        <CustomStyleCreator
          onClose={() => setOpen(false)}
          onCreated={async (id) => {
            await onCreated(id);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function CustomStyleCreator({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<CustomStyleMode>("manual");
  const [name, setName] = useState("");
  const [bg, setBg] = useState("#0B0B0F");
  const [fg, setFg] = useState("#FFFFFF");
  const [accent, setAccent] = useState("#5B9BFF");
  const [font, setFont] = useState("");
  const [desc, setDesc] = useState("");
  const [imageRef, setImageRef] = useState("");
  const [busy, setBusy] = useState(false);

  async function uploadRef(files: FileList | null) {
    if (!files || !files[0]) return;
    setBusy(true);
    try {
      const { ref } = await api.uploadLibraryFile(files[0]);
      setImageRef(ref);
    } catch {
      toast("上传失败");
    }
    setBusy(false);
  }

  async function create() {
    setBusy(true);
    try {
      const body =
        mode === "manual"
          ? { mode, name, bg, fg, accent, font }
          : mode === "text"
          ? { mode, name, description: desc }
          : { mode, name, imageRef };
      const { style } = await api.createCustomStyle(body);
      await onCreated(style.id);
    } catch (e) {
      toast((e as Error).message?.slice(0, 40) || "创建失败");
      setBusy(false);
    }
  }

  const canCreate =
    mode === "manual"
      ? true
      : mode === "text"
      ? desc.trim().length > 0
      : imageRef.length > 0;

  return (
    <div className="card pad fade" style={{ marginTop: 18, background: "#fff" }}>
      <div className="spaced">
        <b>自定义风格</b>
        <button className="btn ghost sm" onClick={onClose}>✕ 关闭</button>
      </div>
      <div className="row" style={{ gap: 8, margin: "14px 0" }}>
        {([
          ["manual", "手填色板"],
          ["text", "一句描述"],
          ["image", "参考图"],
        ] as [CustomStyleMode, string][]).map(([m, label]) => (
          <span key={m} className={`pill ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>{label}</span>
        ))}
      </div>

      <label className="fld">风格名（可空，自动生成）</label>
      <input className="input" value={name} placeholder="如 冷夜蓝" onChange={(e) => setName(e.target.value)} />

      {mode === "manual" ? (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
            {([["背景 bg", bg, setBg], ["文字 fg", fg, setFg], ["点缀 accent", accent, setAccent]] as [string, string, (v: string) => void][]).map(
              ([lab, val, set]) => (
                <div key={lab} className="col" style={{ gap: 6 }}>
                  <label className="fld">{lab}</label>
                  <input type="color" value={val} onChange={(e) => set(e.target.value)} style={{ width: 54, height: 34, cursor: "pointer" }} />
                </div>
              )
            )}
          </div>
          <label className="fld" style={{ marginTop: 12 }}>字体倾向（可空）</label>
          <input className="input" value={font} placeholder="如 大字号无衬线 / 衬线精装" onChange={(e) => setFont(e.target.value)} />
        </div>
      ) : mode === "text" ? (
        <div style={{ marginTop: 12 }}>
          <label className="fld">一句风格描述</label>
          <textarea
            placeholder="例：赛博朋克霓虹夜景，强烈紫粉对比，暗黑背景"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <p className="aux" style={{ marginTop: 6 }}>交给 agent 提取色板 / 字体 / 风格基因。</p>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label className="card pad" style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer", display: "block" }}>
            <div style={{ fontSize: 22 }}>🖼️</div>
            <p style={{ fontWeight: 500, margin: "6px 0 2px" }}>{imageRef ? "已上传，可重传" : "上传参考图"}</p>
            <p className="aux">用 ffmpeg 从图里提主色生成风格</p>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadRef(e.target.files)} />
          </label>
          {imageRef ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={libraryFileUrl(imageRef)} alt="参考图" style={{ marginTop: 12, maxHeight: 120, borderRadius: 8 }} />
          ) : null}
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" disabled={busy || !canCreate} onClick={create}>
          {busy ? "生成中…" : "生成并选用"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   步骤 5 子组件：角色/品牌库选择 + 新建
   ============================================================ */
const ROLE_KIND_LABEL: Record<RoleKind, string> = {
  brand: "品牌",
  character: "角色",
  product: "产品",
};

function RoleStep({
  roles,
  roleRefs,
  toggleRole,
  onCreated,
}: {
  roles: RoleEntry[];
  roleRefs: string[];
  toggleRole: (id: string) => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RoleKind>("brand");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim() || !desc.trim()) {
      toast("填名称和描述");
      return;
    }
    setBusy(true);
    try {
      const { role } = await api.createRole({ kind, name: name.trim(), description: desc.trim() });
      await onCreated(role.id);
      setName("");
      setDesc("");
      setOpen(false);
    } catch {
      toast("新建失败");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="spaced">
        <div>
          <h2 style={{ fontSize: 16 }}>角色 / 品牌库（可选）</h2>
          <p className="aux" style={{ marginTop: 4 }}>选用的品牌/角色设定会贯穿全流程，保证多镜一致。</p>
        </div>
        <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>+ 新建</button>
      </div>

      {roles.length ? (
        <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {roles.map((r) => {
            const on = roleRefs.includes(r.id);
            return (
              <div
                key={r.id}
                className={`sel ${on ? "on" : ""}`}
                onClick={() => toggleRole(r.id)}
                style={{ padding: "10px 14px", minWidth: 180, maxWidth: 260, cursor: "pointer" }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <span className="tag">{ROLE_KIND_LABEL[r.kind]}</span>
                  <b style={{ fontSize: 14 }}>{r.name}</b>
                  {on ? <span className="chip" style={{ marginLeft: "auto" }}>已选</span> : null}
                </div>
                <p className="aux" style={{ marginTop: 6 }}>{r.description}</p>
                {r.palette?.length ? (
                  <div className="row" style={{ gap: 5, marginTop: 8 }}>
                    {r.palette.map((c, i) => (
                      <span key={i} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid var(--border)" }}></span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="aux" style={{ marginTop: 12 }}>还没有角色/品牌条目，点「+ 新建」创建第一个。</p>
      )}

      {open ? (
        <div className="card pad fade" style={{ marginTop: 16, background: "#fff", maxWidth: 480 }}>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            {(["brand", "character", "product"] as RoleKind[]).map((k) => (
              <span key={k} className={`pill ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{ROLE_KIND_LABEL[k]}</span>
            ))}
          </div>
          <label className="fld">名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 QuickShip" />
          <label className="fld" style={{ marginTop: 10 }}>设定描述</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="如 边缘部署工具品牌，冷静高级的科技调性" />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" disabled={busy} onClick={create}>{busy ? "保存中…" : "保存并选用"}</button>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>取消</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
