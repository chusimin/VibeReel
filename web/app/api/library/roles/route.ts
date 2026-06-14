import { NextResponse } from "next/server";
import type { RoleKind } from "@/lib/types";
import { addRole, deleteRole, listRoles } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 角色 / 品牌库（#1，跨项目复用）。
const KINDS: RoleKind[] = ["brand", "character", "product"];

export async function GET() {
  return NextResponse.json({ roles: listRoles() });
}

export async function POST(req: Request) {
  let body: {
    kind?: RoleKind;
    name?: string;
    description?: string;
    palette?: string[];
    assetRefs?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }
  if (!body.name || !body.description || !body.kind || !KINDS.includes(body.kind)) {
    return NextResponse.json(
      { error: "缺少 kind(brand|character|product)/name/description" },
      { status: 400 }
    );
  }
  const role = addRole({
    kind: body.kind,
    name: body.name,
    description: body.description,
    palette: Array.isArray(body.palette) ? body.palette.map(String) : undefined,
    assetRefs: Array.isArray(body.assetRefs) ? body.assetRefs.map(String) : undefined,
  });
  return NextResponse.json({ ok: true, role });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const ok = deleteRole(id);
  if (!ok) return NextResponse.json({ error: "角色不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
