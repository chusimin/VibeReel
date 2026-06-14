import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listProjects, dataDir } from "@/lib/store";
import { libraryDir } from "@/lib/library";

// 真实统计：项目状态计数 + 真实磁盘占用（不编造数据）。
// 供首页"概览/存储"卡使用。design/DESIGN.md 要求数据真实。

function dirBytes(dir: string): number {
  let total = 0;
  let stack: string[] = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* skip */
        }
      }
    }
  }
  return total;
}

function deriveStatus(stage: string): "draft" | "rendering" | "done" | "failed" {
  if (stage === "done") return "done";
  if (stage === "failed") return "failed";
  if (["rendering", "assembling", "qa", "drafting", "storyboarding", "scripting"].includes(stage))
    return "rendering";
  return "draft";
}

export function GET() {
  const projects = listProjects();
  const counts = { total: projects.length, draft: 0, rendering: 0, done: 0, failed: 0 };
  for (const p of projects) counts[deriveStatus(p.stage)]++;

  const usedBytes = dirBytes(dataDir()) + dirBytes(libraryDir());

  // 真实磁盘容量（statfs，Node 18.15+）；失败则只报已用。
  let diskFree = 0;
  let diskTotal = 0;
  try {
    const st = (fs as unknown as {
      statfsSync?: (p: string) => { bsize: number; blocks: number; bavail: number };
    }).statfsSync?.(process.cwd());
    if (st) {
      diskTotal = st.bsize * st.blocks;
      diskFree = st.bsize * st.bavail;
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json({ counts, usedBytes, diskFree, diskTotal });
}
