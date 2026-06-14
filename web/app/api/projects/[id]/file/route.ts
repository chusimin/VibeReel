import fs from "node:fs";
import path from "node:path";
import { projDir } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".srt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";

  if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
    return new Response("非法路径", { status: 400 });
  }

  const base = projDir(id);
  const abs = path.resolve(base, rel);

  // 限定在 projDir 内
  const baseResolved = path.resolve(base);
  if (abs !== baseResolved && !abs.startsWith(baseResolved + path.sep)) {
    return new Response("越权", { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return new Response("文件不存在", { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response("不是文件", { status: 404 });
  }

  const ext = path.extname(abs).toLowerCase();
  const ct = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const data = fs.readFileSync(abs);

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": ct,
      "Content-Length": String(stat.size),
      "Cache-Control": "no-cache",
    },
  });
}
