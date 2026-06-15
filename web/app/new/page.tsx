"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EnginePill } from "@/components/AppShell";
import Switch from "@/components/Switch";
import {
  api,
  toast,
  ratio,
  libraryFileUrl,
  TYPES,
  STYLE_PACKS,
  recommendedFor,
  railFor,
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

// 视频类型展示名（对齐设计稿措辞）。
const TYPE_LABEL: Record<VideoType, { name: string; desc: string }> = {
  showreel: { name: "产品展示", desc: "适合发布会、功能介绍、产品更新" },
  teaching: { name: "教学短片", desc: "适合演示、操作教学、知识传播" },
  popsci: { name: "知识科普", desc: "适合概念解析、原理科普、信息解读" },
};
const TYPE_ICON: Record<VideoType, JSX.Element> = {
  showreel: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  ),
  teaching: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6h10M4 12h10M4 18h7" /><circle cx="19" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  popsci: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.7.6-1 1-1 2H9c0-1-.3-1.4-1-2A6 6 0 0 1 12 3Z" />
    </svg>
  ),
};

// 工作流步进器标签映射（与项目页一致）。
const RAIL_LABEL: Record<string, string> = {
  方向: "方向确认",
  讲稿: "讲稿确认",
  分镜: "分镜确认",
  分段: "分段预览",
  终检: "最终检查",
};
// 顶部预览步进器：随类型动态——教学/科普会多出「讲稿确认」一步。
function journeyFor(type: VideoType): string[] {
  return ["内容准备", ...railFor(type).map((g) => RAIL_LABEL[g.l] ?? g.l)];
}

/* 单页表单分区（标题式，不用①②③避免与底部步进器双重编号——修复审查 #4） */
function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 16 }}>{title}</h2>
      {desc ? <p className="aux" style={{ margin: "4px 0 14px" }}>{desc}</p> : <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

function StyleThumb({ s }: { s: StylePack }) {
  const [err, setErr] = useState(false);
  const src = s.custom && s.heroImage ? libraryFileUrl(s.heroImage) : `/styles/${s.id}.png`;
  if (err || (s.custom && !s.heroImage)) {
    return (
      <div className="thumb" style={{ background: `linear-gradient(135deg, ${s.bg}, ${s.accent})`, display: "grid", placeItems: "center" }}>
        <span style={{ color: s.fg, fontSize: 12, background: "rgba(0,0,0,.4)", padding: "2px 10px", borderRadius: 999 }}>
          {s.custom ? "自定义风格" : "主图待上传"}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={s.name} className="thumb" style={{ width: "100%", objectFit: "cover" }} onError={() => setErr(true)} />
  );
}

interface DraftText { kind: "url" | "idea"; value: string; }
interface DraftAssetFile { file: File; url: string; }
interface DraftColor { ref: string; name: string; }

export default function NewProjectPage() {
  return (
    <Suspense fallback={<div className="center"><span className="spin" /></div>}>
      <NewProjectInner />
    </Suspense>
  );
}

function NewProjectInner() {
  const router = useRouter();
  const search = useSearchParams();

  const [type, setType] = useState<VideoType>("showreel");
  const [texts, setTexts] = useState<DraftText[]>([{ kind: "url", value: "https://acme.example.com" }]);
  const [codeFiles, setCodeFiles] = useState<File[]>([]);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [style, setStyle] = useState("editorial-saas");
  const [customStyles, setCustomStyles] = useState<StylePack[]>([]);
  const [assetFiles, setAssetFiles] = useState<DraftAssetFile[]>([]);
  const [colors, setColors] = useState<DraftColor[]>([]);
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [roleRefs, setRoleRefs] = useState<string[]>([]);
  // 输出偏好（配音随类型缺省；字幕默认开）。生成待后端 TTS/烧录，当前仅持久化偏好。
  const [voiceover, setVoiceover] = useState<boolean>(TYPES.showreel.vo);
  const [subtitle, setSubtitle] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);

  // 进页面拉库数据 + 接受首页模板带来的 ?type=
  useEffect(() => {
    api.listCustomStyles().then((d) => setCustomStyles(d.styles)).catch(() => {});
    api.listRoles().then((d) => setRoles(d.roles)).catch(() => {});
    const t = search.get("type") as VideoType | null;
    if (t && TYPES[t]) pickType(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickType(k: VideoType) {
    setType(k);
    const reco = recommendedFor(k);
    setStyle(reco[0] ?? STYLE_PACKS[0].id);
    setVoiceover(TYPES[k].vo); // 配音缺省随类型（showreel 关，教学/科普 开）
  }
  function addText(kind: "url" | "idea") { setTexts([...texts, { kind, value: kind === "url" ? "https://" : "" }]); }
  function setTextAt(i: number, patch: Partial<DraftText>) { setTexts(texts.map((t, idx) => (idx === i ? { ...t, ...patch } : t))); }
  function rmText(i: number) { setTexts(texts.filter((_, idx) => idx !== i)); }
  function addCodeFiles(files: FileList | null) { if (files) setCodeFiles([...codeFiles, ...Array.from(files)]); }
  function rmCode(i: number) { setCodeFiles(codeFiles.filter((_, idx) => idx !== i)); }
  function addAssetFiles(files: FileList | null) {
    if (!files) return;
    setAssetFiles([...assetFiles, ...Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }
  function rmAsset(i: number) { setAssetFiles(assetFiles.filter((_, idx) => idx !== i)); }
  function addColor() { setColors([...colors, { ref: "#5B9BFF", name: "品牌色" }]); }
  function setColorAt(i: number, patch: Partial<DraftColor>) { setColors(colors.map((c, idx) => (idx === i ? { ...c, ...patch } : c))); }
  function rmColor(i: number) { setColors(colors.filter((_, idx) => idx !== i)); }
  function toggleRole(id: string) { setRoleRefs((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id])); }

  const hasInput = texts.some((t) => t.value.trim()) || codeFiles.length > 0;

  async function createProject(autostart: boolean) {
    const inputs: InputItem[] = texts.filter((t) => t.value.trim()).map((t) => ({ id: "", kind: t.kind, value: t.value.trim() }));
    if (inputs.length === 0 && codeFiles.length > 0) {
      inputs.push({ id: "", kind: "idea", value: `基于上传代码包「${codeFiles[0].name}」制作视频` });
    }
    if (inputs.length === 0) {
      toast("至少填一条链接或想法");
      return null;
    }
    const { id } = await api.createProject({ videoType: type, inputs, aspect, styleId: style, roleRefs, voiceover, subtitle, autostart: false });
    for (const f of codeFiles) await api.addInputFile(id, f);
    for (const a of assetFiles) await api.uploadAsset(id, a.file, a.file.type.includes("svg") ? "logo" : "image");
    for (const c of colors) await api.addAssetMeta(id, { kind: "color", ref: c.ref, name: c.name });
    if (autostart) await api.start(id);
    return id;
  }

  async function generate() {
    setBusy(true);
    try {
      const id = await createProject(true);
      if (!id) { setBusy(false); return; }
      router.push("/projects/" + id);
    } catch (e) {
      if ((e as { status?: number }).status === 401) return router.push("/login");
      toast("创建失败，请重试");
      setBusy(false);
    }
  }
  async function saveDraft() {
    setBusy(true);
    try {
      const id = await createProject(false);
      if (!id) { setBusy(false); return; }
      toast("已保存草稿");
      router.push("/");
    } catch (e) {
      if ((e as { status?: number }).status === 401) return router.push("/login");
      toast("保存失败，请重试");
      setBusy(false);
    }
  }

  const reco = recommendedFor(type);
  const allStyles: StylePack[] = [...STYLE_PACKS, ...customStyles];
  const curStyle = allStyles.find((s) => s.id === style);

  return (
    <div className="shell">
      {/* 顶栏：返回 + 品牌 + 引擎（无左导航——专注创建流，对齐设计稿 02） */}
      <div className="topbar">
        <span className="back" onClick={() => router.push("/")}>← 返回首页</span>
        <div className="brand"><span className="dot" />VibeReel</div>
        <div className="sp" />
        <EnginePill />
      </div>

      <div className="page wide fade">
        <h1 style={{ marginBottom: 4 }}>新建视频</h1>
        <p className="muted" style={{ marginBottom: 26 }}>准备内容、画幅和风格，先生成可确认的方向。</p>

        <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start", gap: 28 }}>
          {/* ---------------- 左：表单分区 ---------------- */}
          <div>
            <Section title="内容来源" desc="可同时投多条：链接、想法、产品代码包一起发，后台统一抓取并拆成可引用料块。">
              <div className="col" style={{ gap: 12 }}>
                {texts.map((t, i) => (
                  <div key={i} className="card pad">
                    <div className="spaced" style={{ marginBottom: 10 }}>
                      <div className="seg">
                        <span className={`pill ${t.kind === "url" ? "on" : ""}`} onClick={() => setTextAt(i, { kind: "url", value: t.kind === "url" ? t.value : "https://" })}>链接</span>
                        <span className={`pill ${t.kind === "idea" ? "on" : ""}`} onClick={() => setTextAt(i, { kind: "idea", value: t.kind === "idea" ? t.value : "" })}>想法</span>
                      </div>
                      {texts.length > 1 ? <button className="btn ghost sm" onClick={() => rmText(i)}>✕</button> : null}
                    </div>
                    {t.kind === "url" ? (
                      <input className="input" value={t.value} placeholder="粘贴产品页、文章或作品链接" onChange={(e) => setTextAt(i, { value: e.target.value })} />
                    ) : (
                      <textarea placeholder="例：把我们的数据分析工具做成 15s 高级感 showreel" value={t.value} onChange={(e) => setTextAt(i, { value: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
              <div className="row" style={{ gap: 10, marginTop: 12 }}>
                <button className="btn ghost sm" onClick={() => addText("url")}>＋ 加链接</button>
                <button className="btn ghost sm" onClick={() => addText("idea")}>＋ 加想法</button>
                <label className="btn ghost sm" style={{ cursor: "pointer" }}>
                  ⬆ 上传代码包
                  <input type="file" accept=".zip" multiple style={{ display: "none" }} onChange={(e) => addCodeFiles(e.target.files)} />
                </label>
              </div>
              {codeFiles.length ? (
                <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  {codeFiles.map((f, i) => (
                    <span key={i} className="chip">🗜 {f.name}<span style={{ cursor: "pointer", marginLeft: 6 }} onClick={() => rmCode(i)}>✕</span></span>
                  ))}
                </div>
              ) : null}
            </Section>

            <Section title="视频类型">
              <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                {(Object.keys(TYPES) as VideoType[]).map((k) => (
                  <div key={k} className={`sel ${type === k ? "on" : ""}`} onClick={() => pickType(k)} style={{ padding: 16 }}>
                    <span className="check">✓</span>
                    <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", placeItems: "center", color: "var(--text-2)", flex: "0 0 auto" }}>
                        {TYPE_ICON[k]}
                      </span>
                      <h2 style={{ fontSize: 15 }}>{TYPE_LABEL[k].name}</h2>
                    </div>
                    <p className="aux">{TYPE_LABEL[k].desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="画幅">
              <div className="seg">
                {([
                  { a: "16:9" as Aspect, label: "横屏" },
                  { a: "9:16" as Aspect, label: "竖屏" },
                  { a: "1:1" as Aspect, label: "方形" },
                ]).map(({ a, label }) => (
                  <span key={a} className={`pill ${aspect === a ? "on" : ""}`} onClick={() => setAspect(a)} style={{ minWidth: 110, textAlign: "center" }}>
                    {a} · {label}
                  </span>
                ))}
              </div>
            </Section>

            <Section title="风格">
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
            </Section>

            <Section title="素材准备" desc="可选——产品截图 / logo / 品牌色 / 角色，传得越全，成片越贴。">
              <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <label className="dropzone" style={{ display: "block", cursor: "pointer", padding: 16 }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>◆</div>
                  <p style={{ color: "var(--text-2)", fontWeight: 500, fontSize: 13.5 }}>Logo</p>
                  <p className="aux" style={{ fontSize: 12 }}>上传图片 / SVG</p>
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => addAssetFiles(e.target.files)} />
                </label>
                <label className="dropzone" style={{ display: "block", cursor: "pointer", padding: 16 }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>▦</div>
                  <p style={{ color: "var(--text-2)", fontWeight: 500, fontSize: 13.5 }}>产品截图</p>
                  <p className="aux" style={{ fontSize: 12 }}>上传图片</p>
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => addAssetFiles(e.target.files)} />
                </label>
                <div className="dropzone" style={{ cursor: "pointer", padding: 16 }} onClick={addColor}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>◐</div>
                  <p style={{ color: "var(--text-2)", fontWeight: 500, fontSize: 13.5 }}>品牌色</p>
                  <p className="aux" style={{ fontSize: 12 }}>点击添加</p>
                </div>
              </div>
              {assetFiles.length ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 14 }}>
                  {assetFiles.map((a, i) => (
                    <div key={i} className="col" style={{ gap: 6 }}>
                      <div className="thumb" style={{ height: 72, margin: 0, position: "relative", overflow: "hidden" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span className="corner" onClick={() => rmAsset(i)} style={{ cursor: "pointer", top: 6, right: 6, left: "auto" }}>✕</span>
                      </div>
                      <span className="aux" style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {colors.length ? (
              <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                {colors.map((c, i) => (
                  <span key={i} className="chip" style={{ gap: 8 }}>
                    <input type="color" value={c.ref} onChange={(e) => setColorAt(i, { ref: e.target.value })} style={{ width: 22, height: 22, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
                    <input value={c.name} onChange={(e) => setColorAt(i, { name: e.target.value })} style={{ width: 70, border: "none", background: "transparent", fontSize: 12.5, color: "var(--text)" }} />
                    <span style={{ cursor: "pointer" }} onClick={() => rmColor(i)}>✕</span>
                  </span>
                ))}
              </div>
              ) : null}

              <div className="divider" />
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
            </Section>
          </div>

          {/* ---------------- 右：生成摘要（贴边） ---------------- */}
          <div style={{ position: "sticky", top: 80 }}>
            <div className="summary">
              <h3>生成摘要</h3>
              <div className="kv"><span className="k">类型</span><span className="v">{TYPE_LABEL[type].name}</span></div>
              <div className="kv"><span className="k">画幅</span><span className="v">{aspect}</span></div>
              <div className="kv"><span className="k">风格</span><span className="v">{curStyle?.name ?? style}</span></div>
              <div className="kv"><span className="k">素材</span><span className="v">{assetFiles.length + colors.length} 项</span></div>
              <div className="kv"><span className="k">草稿图</span><span className="v">开启</span></div>
            </div>

            {/* 输出偏好：真实开关，持久化保存；生成能力（TTS/字幕烧录）后端稍后接入 */}
            <div className="summary" style={{ marginTop: 14 }}>
              <h3>输出偏好</h3>
              <div className="kv">
                <span className="k">配音</span>
                <span className="row" style={{ marginLeft: "auto", gap: 10 }}>
                  <span className="dim" style={{ fontSize: 11 }}>{voiceover ? "开" : "关"}</span>
                  <Switch on={voiceover} onChange={setVoiceover} />
                </span>
              </div>
              <div className="kv">
                <span className="k">字幕</span>
                <span className="row" style={{ marginLeft: "auto", gap: 10 }}>
                  <span className="dim" style={{ fontSize: 11 }}>{subtitle ? "开" : "关"}</span>
                  <Switch on={subtitle} onChange={setSubtitle} />
                </span>
              </div>
              <p className="aux" style={{ marginTop: 10 }}>已保存为偏好，生成能力稍后上线。</p>
            </div>

            <button className="btn block" style={{ marginTop: 14 }} disabled={busy || !hasInput} onClick={generate}>
              {busy ? "创建中…" : "✨ 生成方向"}
            </button>
            <button className="btn ghost block" style={{ marginTop: 10 }} disabled={busy || !hasInput} onClick={saveDraft}>
              保存草稿
            </button>
            {!hasInput ? <p className="aux" style={{ marginTop: 10, textAlign: "center" }}>先填一条链接或想法</p> : null}
          </div>
        </div>

        {/* 底部全局步进器（内容准备 = 当前；预览整段旅程） */}
        <div className="divider" style={{ margin: "32px 0 18px" }} />
        <div className="rail">
          {journeyFor(type).map((s, idx, arr) => (
            <span key={s} style={{ display: "contents" }}>
              <div className={`step ${idx === 0 ? "cur" : ""}`}>
                <span className="num">{idx + 1}</span>
                {s}
              </div>
              {idx < arr.length - 1 ? <span className="bar" /> : null}
            </span>
          ))}
        </div>
        {TYPES[type].vo ? (
          <p className="aux" style={{ marginTop: 8 }}>教学 / 科普 类型多一步「讲稿确认」。</p>
        ) : null}
      </div>
    </div>
  );
}

/* ============================================================
   风格网格 + 自定义风格创建器（#4 三法）—— 逻辑保持不变
   ============================================================ */
function StyleStep({
  allStyles, reco, style, setStyle, onCreated,
}: {
  allStyles: StylePack[]; reco: string[]; style: string; setStyle: (id: string) => void; onCreated: (newId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {allStyles.map((s) => {
          const isReco = reco.includes(s.id);
          return (
            <div key={s.id} className={`sel ${style === s.id ? "on" : ""}`} onClick={() => setStyle(s.id)}>
              {isReco ? <span className="tag reco" style={{ position: "absolute", top: 12, right: 12 }}>推荐</span> : s.custom ? <span className="tag" style={{ position: "absolute", top: 12, right: 12 }}>自定义</span> : null}
              <StyleThumb s={s} />
              <div className="row" style={{ gap: 8, margin: "12px 0" }}>
                {[s.bg, s.fg, s.accent].map((c, i) => (
                  <span key={i} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: "1px solid var(--border)", display: "inline-block" }} />
                ))}
              </div>
              <h2 style={{ fontSize: 14, paddingRight: 44 }}>{s.name}</h2>
              <p className="aux" style={{ marginTop: 4 }}>{s.label}</p>
            </div>
          );
        })}
        <div className="sel" onClick={() => setOpen(true)} style={{ display: "grid", placeItems: "center", minHeight: 200, borderStyle: "dashed" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>＋</div>
            <p style={{ fontWeight: 500, marginTop: 6 }}>自定义风格</p>
            <p className="aux" style={{ marginTop: 2 }}>手填色板 / 一句描述 / 参考图</p>
          </div>
        </div>
      </div>
      {open ? <CustomStyleCreator onClose={() => setOpen(false)} onCreated={async (id) => { await onCreated(id); setOpen(false); }} /> : null}
    </>
  );
}

function CustomStyleCreator({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void>; }) {
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
    try { const { ref } = await api.uploadLibraryFile(files[0]); setImageRef(ref); } catch { toast("上传失败"); }
    setBusy(false);
  }
  async function create() {
    setBusy(true);
    try {
      const body = mode === "manual" ? { mode, name, bg, fg, accent, font } : mode === "text" ? { mode, name, description: desc } : { mode, name, imageRef };
      const { style } = await api.createCustomStyle(body);
      await onCreated(style.id);
    } catch (e) { toast((e as Error).message?.slice(0, 40) || "创建失败"); setBusy(false); }
  }
  const canCreate = mode === "manual" ? true : mode === "text" ? desc.trim().length > 0 : imageRef.length > 0;

  return (
    <div className="card pad fade" style={{ marginTop: 18 }}>
      <div className="spaced"><b>自定义风格</b><button className="btn ghost sm" onClick={onClose}>✕ 关闭</button></div>
      <div className="seg" style={{ margin: "14px 0" }}>
        {([["manual", "手填色板"], ["text", "一句描述"], ["image", "参考图"]] as [CustomStyleMode, string][]).map(([m, label]) => (
          <span key={m} className={`pill ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>{label}</span>
        ))}
      </div>
      <label className="fld">风格名（可空，自动生成）</label>
      <input className="input" value={name} placeholder="如 冷夜蓝" onChange={(e) => setName(e.target.value)} />
      {mode === "manual" ? (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
            {([["背景 bg", bg, setBg], ["文字 fg", fg, setFg], ["点缀 accent", accent, setAccent]] as [string, string, (v: string) => void][]).map(([lab, val, set]) => (
              <div key={lab} className="col" style={{ gap: 6 }}>
                <label className="fld">{lab}</label>
                <input type="color" value={val} onChange={(e) => set(e.target.value)} style={{ width: 54, height: 34, cursor: "pointer" }} />
              </div>
            ))}
          </div>
          <label className="fld" style={{ marginTop: 12 }}>字体倾向（可空）</label>
          <input className="input" value={font} placeholder="如 大字号无衬线 / 衬线精装" onChange={(e) => setFont(e.target.value)} />
        </div>
      ) : mode === "text" ? (
        <div style={{ marginTop: 12 }}>
          <label className="fld">一句风格描述</label>
          <textarea placeholder="例：赛博朋克霓虹夜景，强烈紫粉对比，暗黑背景" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <p className="aux" style={{ marginTop: 6 }}>交给 agent 提取色板 / 字体 / 风格基因。</p>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label className="dropzone" style={{ display: "block", cursor: "pointer" }}>
            <div style={{ fontSize: 22 }}>🖼</div>
            <p style={{ fontWeight: 500, margin: "6px 0 2px", color: "var(--text-2)" }}>{imageRef ? "已上传，可重传" : "上传参考图"}</p>
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
        <button className="btn" disabled={busy || !canCreate} onClick={create}>{busy ? "生成中…" : "生成并选用"}</button>
      </div>
    </div>
  );
}

/* ============================================================
   角色/品牌库选择 + 新建 —— 逻辑保持不变
   ============================================================ */
const ROLE_KIND_LABEL: Record<RoleKind, string> = { brand: "品牌", character: "角色", product: "产品" };

function RoleStep({
  roles, roleRefs, toggleRole, onCreated,
}: {
  roles: RoleEntry[]; roleRefs: string[]; toggleRole: (id: string) => void; onCreated: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RoleKind>("brand");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim() || !desc.trim()) { toast("填名称和描述"); return; }
    setBusy(true);
    try {
      const { role } = await api.createRole({ kind, name: name.trim(), description: desc.trim() });
      await onCreated(role.id);
      setName(""); setDesc(""); setOpen(false);
    } catch { toast("新建失败"); }
    setBusy(false);
  }

  return (
    <>
      <div className="spaced">
        <div>
          <h2 style={{ fontSize: 15 }}>角色 / 品牌库（可选）</h2>
          <p className="aux" style={{ marginTop: 4 }}>选用的品牌/角色设定会贯穿全流程，保证多镜一致。</p>
        </div>
        <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>＋ 新建</button>
      </div>
      {roles.length ? (
        <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {roles.map((r) => {
            const on = roleRefs.includes(r.id);
            return (
              <div key={r.id} className={`sel ${on ? "on" : ""}`} onClick={() => toggleRole(r.id)} style={{ padding: "10px 14px", minWidth: 180, maxWidth: 260 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="tag">{ROLE_KIND_LABEL[r.kind]}</span>
                  <b style={{ fontSize: 14 }}>{r.name}</b>
                  {on ? <span className="chip" style={{ marginLeft: "auto" }}>已选</span> : null}
                </div>
                <p className="aux" style={{ marginTop: 6 }}>{r.description}</p>
                {r.palette?.length ? (
                  <div className="row" style={{ gap: 5, marginTop: 8 }}>
                    {r.palette.map((c, i) => (<span key={i} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid var(--border)" }} />))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="aux" style={{ marginTop: 12 }}>还没有角色/品牌条目，点「＋ 新建」创建第一个。</p>
      )}
      {open ? (
        <div className="card pad fade" style={{ marginTop: 16, maxWidth: 480 }}>
          <div className="seg" style={{ marginBottom: 12 }}>
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
