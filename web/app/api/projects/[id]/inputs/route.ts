import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { InputItem } from "@/lib/types";
import { codeDir, getProject, saveProject, shortInputId } from "@/lib/store";
import { codeDigestPath } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 给已存在项目追加一条输入（#2 多输入）：
//   · multipart(file) —— 代码包 zip：解压 → 建文件树 + 摘取关键文件 → 落盘摘要 → 追加 code 输入
//   · json {kind:"url"|"idea", value} —— 直接追加文本输入

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  ".turbo", ".cache", "out", "vendor", "__pycache__", ".venv",
]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
  ".mp4", ".mov", ".webm", ".mp3", ".wav", ".woff", ".woff2", ".ttf",
  ".otf", ".eot", ".lock", ".zip", ".tar", ".gz", ".pdf", ".min.js",
]);
const SRC_EXT = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".md", ".json"];

function runUnzip(zip: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-o", "-q", zip, "-d", dest], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => reject(new Error(`无法启动 unzip: ${e.message}`)));
    child.on("close", (code) =>
      // unzip 对 warning 返回 1，仍可能解出内容；只把 >1 当失败
      code != null && code > 1
        ? reject(new Error(`unzip 退出码 ${code}: ${err.trim().slice(-300)}`))
        : resolve()
    );
  });
}

interface WalkResult {
  files: string[]; // 相对路径
  count: number;
}
function walk(root: string): WalkResult {
  const files: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".env.example") {
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      }
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(abs);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (BINARY_EXT.has(ext)) continue;
        files.push(path.relative(root, abs));
      }
    }
  }
  return { files, count: files.length };
}

function pickKeyFiles(root: string, files: string[]): string[] {
  const score = (f: string): number => {
    const base = path.basename(f).toLowerCase();
    if (base.startsWith("readme")) return 1000;
    if (base === "package.json") return 900;
    if (base === "pyproject.toml" || base === "go.mod" || base === "cargo.toml") return 850;
    const ext = path.extname(f).toLowerCase();
    let s = SRC_EXT.includes(ext) ? 100 : 0;
    try {
      s += Math.min(50, fs.statSync(path.join(root, f)).size / 1000);
    } catch {
      /* ignore */
    }
    // 顶层文件优先
    s -= (f.split(path.sep).length - 1) * 3;
    return s;
  };
  return [...files].sort((a, b) => score(b) - score(a)).slice(0, 6);
}

function buildDigest(name: string, root: string, w: WalkResult): { md: string; tree: string } {
  const tree = w.files.slice(0, 120).join("\n");
  const keys = pickKeyFiles(root, w.files);
  const blocks = keys.map((f) => {
    let content = "";
    try {
      content = fs.readFileSync(path.join(root, f), "utf8").slice(0, 800);
    } catch {
      content = "(读取失败)";
    }
    return `### ${f}\n\`\`\`\n${content}\n\`\`\``;
  });
  const md = [
    `# 代码包 ${name}`,
    `共 ${w.count} 个文本文件（已跳过依赖/二进制）。`,
    "## 文件树",
    "```",
    tree,
    "```",
    "## 关键文件",
    blocks.join("\n\n"),
  ].join("\n");
  return { md, tree };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const p = getProject(params.id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

  const ctype = req.headers.get("content-type") || "";

  // ---- 文本输入：url / idea ----
  if (ctype.includes("application/json")) {
    let body: { kind?: "url" | "idea"; value?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
    }
    if (!body.value || (body.kind !== "url" && body.kind !== "idea")) {
      return NextResponse.json({ error: "缺少 kind/value" }, { status: 400 });
    }
    const input: InputItem = {
      id: shortInputId(),
      kind: body.kind,
      value: String(body.value),
    };
    p.inputs.push(input);
    saveProject(p);
    return NextResponse.json({ ok: true, input });
  }

  // ---- 代码包：multipart ----
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "表单解析失败" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }

  const inputId = shortInputId();
  const fileName = file.name || "code.zip";
  fs.mkdirSync(codeDir(p.projectId), { recursive: true });
  const zipPath = path.join(codeDir(p.projectId), `${inputId}.zip`);
  const extractDir = path.join(codeDir(p.projectId), `x-${inputId}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(zipPath, bytes);

  try {
    await runUnzip(zipPath, extractDir);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "解压失败" },
      { status: 400 }
    );
  }

  const w = walk(extractDir);
  const { md, tree } = buildDigest(fileName, extractDir, w);
  fs.mkdirSync(path.dirname(codeDigestPath(p.projectId, inputId)), { recursive: true });
  fs.writeFileSync(codeDigestPath(p.projectId, inputId), md);

  const input: InputItem = {
    id: inputId,
    kind: "code",
    value: fileName,
    label: fileName,
    meta: {
      fileName,
      fileCount: w.count,
      bytes: bytes.length,
      tree: tree.slice(0, 1500),
    },
  };
  p.inputs.push(input);
  saveProject(p);
  return NextResponse.json({ ok: true, input });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const p = getProject(params.id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const inputId = new URL(req.url).searchParams.get("inputId");
  if (!inputId) return NextResponse.json({ error: "缺少 inputId" }, { status: 400 });
  const before = p.inputs.length;
  p.inputs = p.inputs.filter((i) => i.id !== inputId);
  if (p.inputs.length === before) {
    return NextResponse.json({ error: "输入不存在" }, { status: 404 });
  }
  saveProject(p);
  return NextResponse.json({ ok: true });
}
