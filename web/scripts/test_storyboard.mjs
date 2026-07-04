#!/usr/bin/env node
// 冒烟测试：从旧 project.json 起手,重新生成 storyboard,看 skill 是否被喂进 prompt,
// 分镜是否符合 B1 硬约束。跑前 export VR_LLM=cli (默认) 用本机 claude。
//
// 用法: cd web && node scripts/test_storyboard.mjs <projectId>

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// 简易 tsx bridge: 用 ts-node 或直接 node --loader
// 这里改成先编译一下，然后 dynamic import
import { execSync } from "node:child_process";

const projId = process.argv[2];
if (!projId) {
  console.error("用法: node scripts/test_storyboard.mjs <projectId>");
  process.exit(1);
}

const projFile = path.resolve("data/projects", projId, "project.json");
if (!fs.existsSync(projFile)) {
  console.error("项目不存在:", projFile);
  process.exit(1);
}

// 直接编译成 CJS 跑
console.log("[test] compiling ts sources → /tmp/vr_test/...");
execSync(
  `npx tsc --outDir /tmp/vr_test --rootDir . --module commonjs --target es2020 --esModuleInterop --moduleResolution node --resolveJsonModule --skipLibCheck lib/agent.ts lib/skills.ts lib/types.ts lib/store.ts lib/llm.ts lib/decompose.ts lib/ingest.ts lib/library.ts lib/json.ts lib/fourpack.ts lib/styles.ts lib/customstyle.ts`,
  { stdio: "inherit", cwd: process.cwd() }
);

// paths alias 需要手动接
process.env.NODE_PATH = "/tmp/vr_test";

const { generateStoryboard } = await import("/tmp/vr_test/lib/agent.js");
const proj = JSON.parse(fs.readFileSync(projFile, "utf8"));
console.log("[test] project:", proj.title, "| type:", proj.videoType, "| concept:", proj.concepts?.[proj.chosenConcept ?? 0]?.title);

const t0 = Date.now();
try {
  const scenes = await generateStoryboard(proj);
  console.log(`[test] 生成 ${scenes.length} 镜, 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const s of scenes) {
    console.log(
      `  #${s.index} ${s.role} dur=${s.durationSec}s prim=${s.primaryMotion || "-"} den=${s.density || "-"} drop=${s.isDropShot ? "★" : ""} text="${(s.onScreenText || "").slice(0, 30)}"`
    );
  }
} catch (e) {
  console.error("[test] 失败:", e.message);
  process.exit(2);
}
