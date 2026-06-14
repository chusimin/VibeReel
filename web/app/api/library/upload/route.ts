import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { libraryFilesDir, shortId } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 上传库文件（自定义风格参考图 / 角色图）。返回 ref（相对 library 根），
// 可直接作为 CustomStyleBody.imageRef 或 RoleEntry.assetRefs。
function safeName(name: string): string {
  return (name || "file").replace(/[/\\]/g, "_").replace(/[^\w.\-]+/g, "_").slice(0, 80);
}

export async function POST(req: Request) {
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
  const stored = `${shortId("f")}-${safeName(file.name)}`;
  fs.mkdirSync(libraryFilesDir(), { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(libraryFilesDir(), stored), bytes);
  return NextResponse.json({ ok: true, ref: `files/${stored}` });
}
