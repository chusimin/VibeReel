import { NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { retryStoryboard } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// B1 测试期：storyboard 阶段因品味硬校验失败后,让用户从 failed 态一键重跑分镜。
// v1 生产可能改为"自动重试 1 次"或换更细的错误提示,当前先走"错误 → 用户按按钮 → 重来"。
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const p = getProject(params.id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (p.stage !== "failed" && p.stage !== "storyboard") {
    return NextResponse.json(
      { error: `当前状态 ${p.stage} 不支持重生成分镜` },
      { status: 400 }
    );
  }
  retryStoryboard(p.projectId).catch((err) => {
    console.error("retryStoryboard 失败", p.projectId, err);
  });
  return NextResponse.json({ ok: true });
}
