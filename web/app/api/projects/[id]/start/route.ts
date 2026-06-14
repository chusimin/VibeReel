import { NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { runFromCreate } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 两段式创建（#2）：先 POST /api/projects（autostart:false）建项目并上传代码包/素材，
// 再 POST 此处真正启动创意流程。仅当项目仍处于 ingesting（未开跑）时触发。
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const p = getProject(params.id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (p.stage !== "ingesting") {
    return NextResponse.json({ ok: true, already: true, stage: p.stage });
  }
  runFromCreate(p.projectId).catch((err) => {
    console.error("runFromCreate 失败", p.projectId, err);
  });
  return NextResponse.json({ ok: true });
}
