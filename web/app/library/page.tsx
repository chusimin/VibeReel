"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell, { EnginePill, IconBtn, BellIcon } from "@/components/AppShell";
import Cover from "@/components/Cover";
import { api, toast, libraryFileUrl, type StylePack } from "@/app/_ui";
import type { RoleEntry, RoleKind } from "@/lib/types";

/* ------------------------------------------------------------------
   素材库 / Asset Library —— design/high-fidelity-ui/08-asset-library.png
   暗色 · 极简黑白。全站只有两类全局素材：自定义风格(StylePack) + 角色/品牌库(RoleEntry)。
   布局：左栏美术化封面网格(Cover) + 右栏常驻详情面板(默认选中首个素材)。
   筛选 tab 对照：风格→风格；RoleEntry.kind brand→品牌，character/product→角色。
   设计-数据缺口（mockup 有、数据无）：项目级截图/视频片段没有全局聚合 feed；
   无删除 API；单素材尺寸/大小/格式/使用次数不在数据模型里。详见末尾汇报。
   ------------------------------------------------------------------ */

type FilterKey = "all" | "brand" | "screenshot" | "clip" | "style" | "role";

const FILTERS: { k: FilterKey; label: string }[] = [
  { k: "all", label: "全部" },
  { k: "brand", label: "品牌" },
  { k: "screenshot", label: "截图" },
  { k: "clip", label: "视频片段" },
  { k: "style", label: "风格" },
  { k: "role", label: "角色" },
];

// 角色库 kind → 类型展示词
const ROLE_KIND_LABEL: Record<RoleKind, string> = {
  brand: "品牌",
  character: "角色",
  product: "角色",
};

// 统一素材项：把风格包与角色条目归一为一种可渲染/可选中的结构。
type LibItem =
  | { uid: string; src: "style"; filter: FilterKey; kind: "风格"; name: string; style: StylePack }
  | { uid: string; src: "role"; filter: FilterKey; kind: string; name: string; role: RoleEntry };

function roleFilter(kind: RoleKind): FilterKey {
  return kind === "brand" ? "brand" : "role";
}

// 创建时间格式化（仅展示素材数据自带的 createdAt，缺省时不渲染该行）。
function fmtDate(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LibraryPage() {
  const router = useRouter();
  const [styles, setStyles] = useState<StylePack[] | null>(null);
  const [roles, setRoles] = useState<RoleEntry[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selUid, setSelUid] = useState<string | null>(null);

  // 上传 / 新建风格
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showStyleForm, setShowStyleForm] = useState(false);
  const [sf, setSf] = useState({ name: "", bg: "#0E0F11", fg: "#F3F4F5", accent: "#5B8DEF" });
  const [savingStyle, setSavingStyle] = useState(false);

  function load() {
    api
      .listCustomStyles()
      .then((d) => setStyles(d.styles))
      .catch((e) => {
        if ((e as { status?: number }).status === 401) return router.push("/login");
        setErr("加载素材失败");
        setStyles([]);
      });
    api
      .listRoles()
      .then((d) => setRoles(d.roles))
      .catch(() => setRoles([]));
  }

  useEffect(load, [router]);

  const loading = styles === null || roles === null;

  const items: LibItem[] = useMemo(() => {
    const styleItems: LibItem[] = (styles ?? []).map((s) => ({
      uid: `style:${s.id}`,
      src: "style",
      filter: "style",
      kind: "风格",
      name: s.name || s.label || s.id,
      style: s,
    }));
    const roleItems: LibItem[] = (roles ?? []).map((r) => ({
      uid: `role:${r.id}`,
      src: "role",
      filter: roleFilter(r.kind),
      kind: ROLE_KIND_LABEL[r.kind] ?? "角色",
      name: r.name,
      role: r,
    }));
    return [...styleItems, ...roleItems];
  }, [styles, roles]);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((it) => it.filter === filter)),
    [items, filter]
  );

  const selected = useMemo(() => items.find((it) => it.uid === selUid) ?? null, [items, selUid]);

  // 详情面板常驻：默认选中当前可见的首个素材；选中项被筛掉时回落到首个可见素材。
  useEffect(() => {
    if (shown.length === 0) {
      if (selUid) setSelUid(null);
      return;
    }
    if (!selUid || !shown.some((it) => it.uid === selUid)) setSelUid(shown[0].uid);
  }, [shown, selUid]);

  /* ---- 上传素材 ---- */
  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const f of list) {
        await api.uploadLibraryFile(f);
      }
      toast(list.length > 1 ? `已上传 ${list.length} 个素材` : `已上传「${list[0].name}」`);
      load();
    } catch {
      toast("上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length) uploadFiles(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }

  /* ---- 新建风格（mode:"manual" + 三色，匹配 CustomStyleBody）---- */
  async function saveStyle() {
    const name = sf.name.trim();
    if (!name) {
      toast("请填写风格名称");
      return;
    }
    setSavingStyle(true);
    try {
      const { style } = await api.createCustomStyle({
        mode: "manual",
        name,
        bg: sf.bg,
        fg: sf.fg,
        accent: sf.accent,
      });
      toast(`已创建风格「${name}」`);
      setShowStyleForm(false);
      setSf({ name: "", bg: "#0E0F11", fg: "#F3F4F5", accent: "#5B8DEF" });
      setFilter("style");
      setSelUid(`style:${style.id}`);
      load();
    } catch {
      toast("创建风格失败，请重试");
    } finally {
      setSavingStyle(false);
    }
  }

  return (
    <AppShell
      active="library"
      searchPlaceholder="搜索素材、项目或标签"
      actions={
        <>
          <button className="btn ghost sm" onClick={() => setShowStyleForm((v) => !v)}>
            ＋ 新建风格
          </button>
          <EnginePill />
          <IconBtn title="通知">
            <BellIcon />
          </IconBtn>
        </>
      }
    >
      <div className="fade">
        {/* 标题 + 主操作 */}
        <div className="spaced" style={{ alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1>素材库</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              自定义风格与角色/品牌库，跨项目复用；可直接拖入新素材。
            </p>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={onPick}
              accept="image/*,video/*,.svg,.glb,.gltf"
            />
            <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <span className="spin" /> : "＋"} 上传素材
            </button>
          </div>
        </div>

        {/* 新建风格内联表单 */}
        {showStyleForm ? (
          <div className="card pad fade" style={{ marginBottom: 20 }}>
            <div className="spaced" style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 16 }}>新建风格</h2>
              <span className="dim" style={{ cursor: "pointer" }} onClick={() => setShowStyleForm(false)}>
                取消
              </span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "2fr repeat(3,1fr)", alignItems: "end" }}>
              <div>
                <label className="fld">名称</label>
                <input
                  className="input"
                  placeholder="如：暗金发布会"
                  value={sf.name}
                  onChange={(e) => setSf((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <ColorField label="背景 bg" value={sf.bg} onChange={(v) => setSf((s) => ({ ...s, bg: v }))} />
              <ColorField label="前景 fg" value={sf.fg} onChange={(v) => setSf((s) => ({ ...s, fg: v }))} />
              <ColorField label="强调 accent" value={sf.accent} onChange={(v) => setSf((s) => ({ ...s, accent: v }))} />
            </div>
            <div className="row" style={{ gap: 12, marginTop: 16 }}>
              <div className="thumb" style={{ ...stylePreview(sf), width: 120, height: 64, margin: 0 }} />
              <div className="sp" style={{ flex: 1 }} />
              <button className="btn" disabled={savingStyle} onClick={saveStyle}>
                {savingStyle ? <span className="spin" /> : null} 创建风格
              </button>
            </div>
          </div>
        ) : null}

        {/* 筛选 tabs */}
        <div className="tabs" style={{ marginBottom: 20 }}>
          {FILTERS.map((f) => (
            <div
              key={f.k}
              className={`tab ${filter === f.k ? "on" : ""}`}
              onClick={() => setFilter(f.k)}
            >
              {f.label}
            </div>
          ))}
        </div>

        {err ? <div className="banner err" style={{ marginBottom: 16 }}>{err}</div> : null}

        {/* 主体：美术化封面网格 + 右侧常驻详情面板 */}
        <div
          className="grid"
          style={{ gridTemplateColumns: selected ? "1fr 320px" : "1fr", alignItems: "start", gap: 24 }}
        >
          <div>
            {loading ? (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="card" style={{ padding: 12 }}>
                    <div className="skel" style={{ aspectRatio: "16/9", marginBottom: 12 }}>
                      <span className="lbl">&nbsp;</span>
                    </div>
                    <div className="skel" style={{ height: 14, width: "70%", borderRadius: 6 }} />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="card">
                <div className="empty">
                  <div className="ic">▦</div>
                  <h3>素材库还是空的</h3>
                  <p>点右上角「上传素材」，或拖拽文件到下方区域开始。</p>
                  <div style={{ marginTop: 18 }}>
                    <button className="btn" onClick={() => fileRef.current?.click()}>
                      ＋ 上传素材
                    </button>
                  </div>
                </div>
              </div>
            ) : shown.length === 0 ? (
              <div className="card">
                <div className="empty">
                  <div className="ic">▦</div>
                  <h3>该分类暂无素材</h3>
                  <p>拖入文件或新建 · 也可切换到「全部」查看已有素材。</p>
                </div>
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                {shown.map((it) => (
                  <AssetCard
                    key={it.uid}
                    item={it}
                    active={it.uid === selUid}
                    onClick={() => setSelUid(it.uid)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 右侧常驻详情面板（sticky，默认指向首个素材）*/}
          {selected ? (
            <div style={{ position: "sticky", top: 16 }}>
              <DetailPanel
                item={selected}
                onClose={() => setSelUid(null)}
                onDelete={() => toast("当前版本暂不支持删除素材")}
              />
            </div>
          ) : null}
        </div>

        {/* 拖拽上传区 */}
        <div
          className={`dropzone ${dragOver ? "drag" : ""}`}
          style={{ marginTop: 24 }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <span className="row" style={{ justifyContent: "center", gap: 10 }}>
              <span className="spin" /> 正在上传…
            </span>
          ) : (
            "可直接拖入素材 · 支持图片、视频、模型、SVG 等多种格式"
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ============================== 子组件 ============================== */

// 风格预览底色：用该风格自有的 bg/fg/accent（属于素材数据本身，可用其色值）。
function stylePreview(s: { bg?: string; fg?: string; accent?: string }): React.CSSProperties {
  const bg = s.bg || "#0c0d0f";
  const accent = s.accent || s.fg || "#888";
  return {
    background: `radial-gradient(120% 120% at 18% 16%, ${accent}33, transparent 55%), ${bg}`,
    border: "1px solid var(--border)",
  };
}

// 取该素材的真实参考图（自定义风格主图 / 角色首张参考图），无则返回 undefined。
function itemImageUrl(item: LibItem): string | undefined {
  const ref = item.src === "style" ? item.style.heroImage : item.role.assetRefs?.[0];
  return ref ? libraryFileUrl(ref) : undefined;
}

// 该素材自有的色值（风格三色 / 角色 palette）—— 属于素材数据本身。
function itemPalette(item: LibItem): string[] {
  const cs = item.src === "style" ? [item.style.bg, item.style.fg, item.style.accent] : item.role.palette ?? [];
  return cs.filter(Boolean) as string[];
}

function AssetCard({
  item,
  active,
  onClick,
}: {
  item: LibItem;
  active: boolean;
  onClick: () => void;
}) {
  const src = itemImageUrl(item);
  const palette = itemPalette(item);
  return (
    <div
      className="card hover"
      style={{ padding: 12, boxShadow: active ? "0 0 0 1px var(--border-strong)" : undefined }}
      onClick={onClick}
    >
      <Cover
        seed={item.src === "style" ? item.style.id : item.role.id}
        src={src}
        aspect="16/9"
        rounded={10}
        hoverPop
        caption={item.name}
        right={<span className="tag" style={{ background: "rgba(0,0,0,.45)", color: "#fff", border: "1px solid rgba(255,255,255,.14)" }}>{item.kind}</span>}
      >
        {/* 无真实图时，把素材自有色值作为底部小色块叠加（真实数据，非杜撰）*/}
        {!src && palette.length ? <Swatches colors={palette} /> : null}
      </Cover>
      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {item.src === "style" && item.style.custom ? <span className="tag">自定义</span> : null}
        {item.src === "style" && !item.style.custom ? <span className="tag">内置</span> : null}
        {item.src === "role" ? (
          <span className="tag">{item.role.assetRefs?.length ?? 0} 图</span>
        ) : null}
        {palette.length ? <span className="tag">{palette.length} 色</span> : null}
      </div>
    </div>
  );
}

// 素材自有色值小条（无真实图时，叠在封面左下角展示该素材真实色板）。
function Swatches({ colors }: { colors: (string | undefined)[] }) {
  const cs = colors.filter(Boolean) as string[];
  if (cs.length === 0) return null;
  return (
    <div style={{ position: "absolute", zIndex: 5, left: 11, bottom: 36, display: "flex", gap: 6 }}>
      {cs.slice(0, 4).map((c, i) => (
        <span
          key={i}
          style={{ width: 16, height: 16, borderRadius: 5, background: c, border: "1px solid rgba(255,255,255,.22)" }}
        />
      ))}
    </div>
  );
}

function DetailPanel({
  item,
  onClose,
  onDelete,
}: {
  item: LibItem;
  onClose: () => void;
  onDelete: () => void;
}) {
  const isStyle = item.src === "style";
  const heroRef = isStyle ? item.style.heroImage : item.role.assetRefs?.[0];
  const src = heroRef ? libraryFileUrl(heroRef) : undefined;
  const palette = itemPalette(item);
  const createdAt = isStyle ? item.style.createdAt : item.role.createdAt;

  return (
    <div className="summary">
      <div className="spaced" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>素材详情</h3>
        <span className="dim" style={{ cursor: "pointer", fontSize: 16, lineHeight: 1 }} onClick={onClose}>
          ×
        </span>
      </div>

      {/* 大封面预览（与网格同一 Cover，有真图叠真图，无图用确定性渐变 + 真实色板）*/}
      <div style={{ marginBottom: 16 }}>
        <Cover
          seed={isStyle ? item.style.id : item.role.id}
          src={src}
          aspect="16/9"
          rounded={12}
          badge={item.kind}
        >
          {!src && palette.length ? <Swatches colors={palette} /> : null}
        </Cover>
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{item.name}</div>

      <div className="kv">
        <span className="k">类型</span>
        <span className="v">{item.kind}</span>
      </div>

      {isStyle ? (
        <>
          {item.style.label ? (
            <div className="kv">
              <span className="k">描述</span>
              <span className="v" style={{ fontWeight: 400, textAlign: "right" }}>{item.style.label}</span>
            </div>
          ) : null}
          {item.style.font ? (
            <div className="kv">
              <span className="k">字体</span>
              <span className="v">{item.style.font}</span>
            </div>
          ) : null}
          <div className="kv">
            <span className="k">来源</span>
            <span className="v">{item.style.custom ? "自定义" : "内置"}</span>
          </div>
        </>
      ) : (
        <>
          {item.role.description ? (
            <div className="kv">
              <span className="k">说明</span>
              <span className="v" style={{ fontWeight: 400, textAlign: "right" }}>{item.role.description}</span>
            </div>
          ) : null}
          <div className="kv">
            <span className="k">参考图</span>
            <span className="v">{item.role.assetRefs?.length ?? 0} 张</span>
          </div>
        </>
      )}

      {createdAt ? (
        <div className="kv">
          <span className="k">创建于</span>
          <span className="v">{fmtDate(createdAt)}</span>
        </div>
      ) : null}

      {/* 配色 */}
      {palette.length ? (
        <div style={{ padding: "12px 0 4px" }}>
          <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>配色</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {palette.map((c, i) => (
              <span key={i} className="row" style={{ gap: 7 }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, background: c, border: "1px solid var(--border-strong)" }} />
                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 标签 */}
      <div style={{ padding: "12px 0 4px" }}>
        <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>标签</div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="tag">{item.kind}</span>
          {isStyle && item.style.custom ? <span className="tag">自定义</span> : null}
          {isStyle && !item.style.custom ? <span className="tag">内置</span> : null}
          {!isStyle ? <span className="tag">可复用</span> : null}
        </div>
      </div>

      {/* 操作 */}
      <div className="col" style={{ gap: 10, marginTop: 16 }}>
        <Link
          className="btn block"
          href={isStyle ? `/new?styleId=${encodeURIComponent(item.style.id)}` : `/new?role=${encodeURIComponent(item.role.id)}`}
        >
          应用到新项目
        </Link>
        {src ? (
          <a className="btn ghost block" href={src} target="_blank" rel="noreferrer" download>
            下载参考图
          </a>
        ) : null}
        <button className="btn danger block" onClick={onDelete}>
          删除
        </button>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="fld">{label}</label>
      <div className="row" style={{ gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 38,
            height: 40,
            padding: 0,
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-btn)",
            background: "var(--surface-2)",
            cursor: "pointer",
            flex: "0 0 auto",
          }}
          aria-label={label}
        />
        <input
          className="input mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 12.5 }}
        />
      </div>
    </div>
  );
}
