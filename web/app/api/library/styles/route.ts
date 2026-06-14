import { NextResponse } from "next/server";
import type { CustomStyleBody } from "@/lib/types";
import { addCustomStyle, deleteCustomStyle, listCustomStyles } from "@/lib/library";
import { buildCustomStyle } from "@/lib/customstyle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 自定义风格库（#4）：三法（image / manual / text）统一产出 StylePack 落库。
export async function GET() {
  return NextResponse.json({ styles: listCustomStyles() });
}

export async function POST(req: Request) {
  let body: CustomStyleBody;
  try {
    body = (await req.json()) as CustomStyleBody;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }
  if (!body || !body.mode) {
    return NextResponse.json(
      { error: "缺少 mode(image|manual|text)" },
      { status: 400 }
    );
  }
  try {
    const draft = await buildCustomStyle(body);
    const style = addCustomStyle({ ...draft, name: body.name || draft.name });
    return NextResponse.json({ ok: true, style });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "生成自定义风格失败" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const ok = deleteCustomStyle(id);
  if (!ok) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
