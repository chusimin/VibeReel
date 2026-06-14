import { NextResponse } from "next/server";
import type { CreateProjectBody } from "@/lib/types";
import { createProject, listProjects } from "@/lib/store";
import { runFromCreate } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(req: Request) {
  let body: CreateProjectBody;
  try {
    body = (await req.json()) as CreateProjectBody;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const hasInput =
    (Array.isArray(body.inputs) && body.inputs.some((i) => i?.value)) ||
    Boolean(body.input && body.input.value);
  if (!body || !body.videoType || !hasInput || !body.aspect || !body.styleId) {
    return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
  }

  let project;
  try {
    project = createProject(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "创建失败" },
      { status: 400 }
    );
  }

  // autostart=false：仅建项目，等代码包/素材上传完再 POST /start 触发流程。
  if (body.autostart !== false) {
    // 不 await：后台跑创意流程，UI 靠 SSE 更新。
    runFromCreate(project.projectId).catch((err) => {
      console.error("runFromCreate 失败", project!.projectId, err);
    });
  }

  return NextResponse.json({ id: project.projectId });
}
