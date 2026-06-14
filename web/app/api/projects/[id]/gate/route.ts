import { NextResponse } from "next/server";
import type { GateBody } from "@/lib/types";
import { getProject } from "@/lib/store";
import { handleGate } from "@/lib/orchestrator";

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

  let body: GateBody;
  try {
    body = (await req.json()) as GateBody;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  // 不 await：后台处理闸门，UI 靠 SSE 更新。
  handleGate(id, body).catch((err) => {
    console.error("handleGate 失败", id, err);
  });

  return NextResponse.json({ ok: true });
}
