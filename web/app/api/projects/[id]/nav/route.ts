import { NextResponse } from "next/server";
import type { NavBody } from "@/lib/types";
import { getProject } from "@/lib/store";
import { goBack } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!getProject(id)) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  let body: NavBody;
  try {
    body = (await req.json()) as NavBody;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  if (body.action !== "back") {
    return NextResponse.json({ error: "未知 nav action" }, { status: 400 });
  }

  // 不 await：后台回退并重置下游，UI 靠 SSE 更新。
  goBack(id).catch((err) => {
    console.error("goBack 失败", id, err);
  });

  return NextResponse.json({ ok: true });
}
