// ============================================================
// 独立的"出图 Agent 接入层"——把图像生成从业务里抽出来。
// 结构镜像 lib/llm.ts：Provider 接口 + 单例 + 唯一入口，env 切换。
//
// 设计目标：
//   · 业务侧（render.ts）只依赖 generateImage()，不关心底层是
//     codex CLI 还是将来的某个图像 API。
//   · 现在 POC：spawn 本机 codex CLI，内置 image_gen 出真图（零 key，
//     吃用户 Codex 会员额度，复用本地登录）。
//
// 切换开关（env）：
//   VR_IMAGE = "codex"（默认）| "none"（关闭→调用方走兜底）
//   CODEX_BIN  本机 codex 路径（默认 "codex"）
// ============================================================

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ImageOptions {
  timeoutMs?: number; // 单次调用超时
}

export interface ImageProvider {
  readonly name: string;
  // 把 prompt 出成图，落到 absOutPath（绝对路径）。出错则 reject。
  generate(prompt: string, absOutPath: string, opts?: ImageOptions): Promise<void>;
}

// ============================================================
// Provider A —— 本机 codex CLI（POC 默认）
//   codex exec --skip-git-repo-check --sandbox workspace-write -C <dir> "<画面描述 + 存成 <file>>"
//   行为：codex 内部 image_gen 出图 → 落 ~/.codex/generated_images/<session>/ig_*.png
//        → agent 自己 cp 到要求的文件名。
//   健壮性：若目标文件没出现，回退去 generated_images 找本次调用期间新建的最新 png 拷过去。
// ============================================================
class CodexCliProvider implements ImageProvider {
  readonly name = "codex";

  generate(
    prompt: string,
    absOutPath: string,
    opts?: ImageOptions
  ): Promise<void> {
    const bin = process.env.CODEX_BIN || "codex";
    const workDir = path.dirname(absOutPath);
    const fileName = path.basename(absOutPath);
    const timeoutMs = opts?.timeoutMs ?? 180000;

    fs.mkdirSync(workDir, { recursive: true });

    // 给 codex 的指令：先出图，再把图存成指定文件名到工作目录。
    const instruction =
      `${prompt}\n\n` +
      `Generate this image, then save it as "${fileName}" in the current working directory. ` +
      `Output a single PNG file named exactly "${fileName}".`;

    const args = [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "-C",
      workDir,
      instruction,
    ];

    // 记起跑时刻：回退查找只认这之后新建的 png（容一点时钟偏差）。
    const startedAt = Date.now() - 2000;

    return new Promise<void>((resolve, reject) => {
      // 关 stdin（等价 < /dev/null），避免 codex 等待交互输入挂死。
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill("SIGKILL");
        const tail = stderr.trim().slice(-500) || stdout.trim().slice(-500);
        reject(
          new Error(`codex 出图超时（${timeoutMs}ms）${tail ? `: ${tail}` : ""}`)
        );
      }, timeoutMs);

      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn();
      };

      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", (err) =>
        finish(() => reject(new Error(`无法启动 codex: ${err.message}`)))
      );
      child.on("close", (code) =>
        finish(() => {
          // 1) 目标文件就位 → 成功。
          if (fileExistsNonEmpty(absOutPath)) {
            resolve();
            return;
          }
          // 2) 没就位但进程正常退出 → 去 generated_images 捞本次新建的最新 png。
          if (code === 0) {
            const found = findLatestGeneratedPng(startedAt);
            if (found) {
              try {
                fs.copyFileSync(found, absOutPath);
                if (fileExistsNonEmpty(absOutPath)) {
                  resolve();
                  return;
                }
              } catch (e) {
                reject(
                  new Error(
                    `codex 出图后拷贝失败: ${
                      e instanceof Error ? e.message : String(e)
                    }`
                  )
                );
                return;
              }
            }
            const tail = stdout.trim().slice(-500);
            reject(
              new Error(
                `codex 退出 0 但未找到生成的 png（目标=${fileName}）${
                  tail ? `: ${tail}` : ""
                }`
              )
            );
            return;
          }
          // 3) 非 0 退出 → 报错带 stderr 末段。
          const tail = stderr.trim().slice(-500) || stdout.trim().slice(-500);
          reject(new Error(`codex 退出码 ${code}: ${tail}`));
        })
      );
    });
  }
}

// 文件存在且非空（非 0 字节）。
function fileExistsNonEmpty(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

// 在 ~/.codex/generated_images/** 找 mtime 在 sinceMs 之后、最新的一张 png。
function findLatestGeneratedPng(sinceMs: number): string | null {
  const root = path.join(os.homedir(), ".codex", "generated_images");
  let bestFile = "";
  let bestMtime = -Infinity;

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".png")) {
        let st: fs.Stats;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        const mtime = st.mtimeMs;
        if (mtime >= sinceMs && mtime > bestMtime) {
          bestMtime = mtime;
          bestFile = full;
        }
      }
    }
  };

  walk(root);
  return bestFile || null;
}

// ---- 单例选择（HMR 安全）----
const g = globalThis as unknown as { __vrImage?: ImageProvider };

export function getImageProvider(): ImageProvider {
  if (g.__vrImage) return g.__vrImage;
  // VR_IMAGE=none 时也给一个 provider（其 generate 会 reject，调用方走兜底）；
  // 但更干净的做法是在 generateImage() 入口判 none，见下。
  g.__vrImage = new CodexCliProvider();
  return g.__vrImage;
}

// 业务唯一入口：把 prompt 出成图落到 absOutPath。
//   VR_IMAGE=none → 直接 reject，让调用方走兜底（不启动 codex）。
export function generateImage(
  prompt: string,
  absOutPath: string,
  opts?: ImageOptions
): Promise<void> {
  const mode = (process.env.VR_IMAGE || "codex").toLowerCase();
  if (mode === "none") {
    return Promise.reject(new Error("VR_IMAGE=none：图像生成已关闭"));
  }
  return getImageProvider().generate(prompt, absOutPath, opts);
}

// 给 UI/日志用：当前 provider 名 / 是否启用。
export function imageProviderName(): string {
  const mode = (process.env.VR_IMAGE || "codex").toLowerCase();
  return mode === "none" ? "none" : getImageProvider().name;
}
