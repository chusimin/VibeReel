import fs from "node:fs";
import path from "node:path";
import { libraryFileAbs } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 取库文件（角色图 / 自定义风格主图）。?ref=files/xxx
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const abs = libraryFileAbs(ref);
  if (!abs) return new Response("非法路径", { status: 400 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return new Response("文件不存在", { status: 404 });
  }
  if (!stat.isFile()) return new Response("不是文件", { status: 404 });

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
