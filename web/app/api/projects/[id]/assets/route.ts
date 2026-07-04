import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { AssetItem, AssetKind, AssetUsage } from "@/lib/types";
import { assetsDir, getProject, saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 项目级素材库（#1）：图/logo/片段（文件型）+ 色值/字体（非文件型）。
function safeName(name: string): string {
  return (name || "asset").replace(/[/\\]/g, "_").replace(/[^\w.\-]+/g, "_").slice(0, 80);
}
function assetId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const p = getProject(params.id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ assets: p.assets });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const p = getProject(params.id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

  const ctype = req.headers.get("content-type") || "";

  const validUsage = (u: unknown): AssetUsage =>
    u === "must-appear" || u === "tone-only" ? u : "may-use";

  // ---- 非文件型素材：color / font ----
  if (ctype.includes("application/json")) {
    let body: {
      kind?: AssetKind;
      ref?: string;
      name?: string;
      note?: string;
      usage?: AssetUsage;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
    }
    if ((body.kind !== "color" && body.kind !== "font") || !body.ref) {
      return NextResponse.json(
        { error: "json 仅支持 kind:color|font 且需 ref" },
        { status: 400 }
      );
    }
    const asset: AssetItem = {
      id: assetId(),
      name: body.name || body.ref,
      kind: body.kind,
      ref: body.ref,
      note: body.note,
      usage: validUsage(body.usage),
    };
    p.assets.push(asset);
    saveProject(p);
    return NextResponse.json({ ok: true, asset });
  }

  // ---- 文件型素材：image / logo / clip ----
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "表单解析失败" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }
  const kindRaw = String(form.get("kind") || "image");
  const kind: AssetKind = (["image", "logo", "clip"] as const).includes(
    kindRaw as "image" | "logo" | "clip"
  )
    ? (kindRaw as AssetKind)
    : "image";
  const note = form.get("note") ? String(form.get("note")) : undefined;
  const usage = validUsage(form.get("usage"));

  const id = assetId();
  const stored = `${id}-${safeName(file.name)}`;
  fs.mkdirSync(assetsDir(p.projectId), { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(assetsDir(p.projectId), stored), bytes);

  const asset: AssetItem = {
    id,
    name: file.name || stored,
    kind,
    ref: `assets/${stored}`,
    note,
    usage,
  };
  p.assets.push(asset);
  saveProject(p);
  return NextResponse.json({ ok: true, asset });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const p = getProject(params.id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const assetId = new URL(req.url).searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "缺少 assetId" }, { status: 400 });
  const before = p.assets.length;
  p.assets = p.assets.filter((a) => a.id !== assetId);
  if (p.assets.length === before) {
    return NextResponse.json({ error: "素材不存在" }, { status: 404 });
  }
  saveProject(p);
  return NextResponse.json({ ok: true });
}
