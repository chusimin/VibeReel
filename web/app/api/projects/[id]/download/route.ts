import fs from "node:fs";
import path from "node:path";
import { getProject, outputsDir } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_MAP: Record<
  string,
  { file: string; ct: string; outKey: "mp4" | "srt" | "zip" }
> = {
  mp4: { file: "final.mp4", ct: "video/mp4", outKey: "mp4" },
  srt: { file: "final.srt", ct: "text/plain; charset=utf-8", outKey: "srt" },
  zip: { file: "final.zip", ct: "application/zip", outKey: "zip" },
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "mp4";

  const spec = KIND_MAP[kind];
  if (!spec) {
    return new Response("不支持的下载类型", { status: 400 });
  }

  const project = getProject(id);
  if (!project) {
    return new Response("项目不存在", { status: 404 });
  }

  const abs = path.join(outputsDir(id), spec.file);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return new Response("产物不存在", { status: 404 });
  }

  const data = fs.readFileSync(abs);
  // 注意：HTTP 头是 Latin1，filename= 必须纯 ASCII；中文标题只放进 RFC5987 的 filename*。
  const utf8Name = `${sanitize(project.title) || "vibereel"}.${kind}`;
  const asciiName = `vibereel-${id.slice(0, 8)}.${kind}`;

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": spec.ct,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
        utf8Name
      )}`,
      "Cache-Control": "no-cache",
    },
  });
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}
