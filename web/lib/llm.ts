// ============================================================
// 独立的"创意 Agent 接入层"——把 LLM 调用从业务里抽出来。
//
// 设计目标（应"设计好独立的 Agent，下次给 api 跑通"）：
//   · 业务侧（agent.ts / decompose.ts / customstyle.ts）只依赖 complete()，
//     完全不关心底层是本机 CLI 还是云端 API。
//   · 现在 POC：spawn 本机 claude CLI（零 key，复用本地登录）。
//   · 下次切生产：把 VR_LLM=api + ANTHROPIC_API_KEY 配上即可，业务零改动。
//
// 切换开关（env）：
//   VR_LLM   = "cli"（默认）| "api" | "openrouter"
//   CLAUDE_BIN  本机 claude 路径（cli 用）
//   ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL / ANTHROPIC_VERSION（api 用）
//   OPENROUTER_API_KEY / OPENROUTER_MODEL（openrouter 用）
//   VR_MODEL    默认模型档（sonnet/opus/haiku 或完整 model id）
// ============================================================

import { spawn } from "node:child_process";

export interface LlmOptions {
  model: string; // 模型档或完整 id；provider 自行解释
  system?: string; // 可选 system 提示
  maxTokens?: number; // api 用，默认 2048
  timeoutMs?: number; // 单次调用超时
}

export interface LlmProvider {
  readonly name: string;
  complete(prompt: string, opts: LlmOptions): Promise<string>;
}

// ---- 模型档别名 → 具体 model id（api provider 用；cli 直接吃别名）----
const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
  haiku: "claude-haiku-4-5-20251001",
};

function resolveModelId(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}

// ============================================================
// Provider A —— 本机 claude CLI（POC 默认）
//   claude -p "<prompt>" --output-format json --model <m> --tools ""
//   外层是单个 JSON，助手文本在 .result。
// ============================================================
interface ClaudePrintJson {
  result?: string;
  [k: string]: unknown;
}

class CliProvider implements LlmProvider {
  readonly name = "cli";

  complete(prompt: string, opts: LlmOptions): Promise<string> {
    const bin = process.env.CLAUDE_BIN || "claude";
    // system 以前缀方式拼入（CLI 无独立 system 形参时的稳妥做法）。
    const full = opts.system ? `${opts.system}\n\n${prompt}` : prompt;
    const args = [
      "-p",
      full,
      "--output-format",
      "json",
      "--model",
      opts.model,
      "--tools",
      "",
    ];
    const timeoutMs = opts.timeoutMs ?? 120000;

    return new Promise<string>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill("SIGKILL");
        reject(new Error(`claude 调用超时（${timeoutMs}ms）`));
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
        finish(() => reject(new Error(`无法启动 claude: ${err.message}`)))
      );
      child.on("close", (code) =>
        finish(() => {
          if (code !== 0) {
            const tail = stderr.trim().slice(-500) || stdout.trim().slice(-500);
            reject(new Error(`claude 退出码 ${code}: ${tail}`));
            return;
          }
          let result: string | null = null;
          try {
            const obj = JSON.parse(stdout) as ClaudePrintJson;
            if (typeof obj.result === "string") result = obj.result;
          } catch {
            result = stdout; // 退化：stdout 直接是助手文本
          }
          if (result == null) {
            reject(
              new Error(`claude 输出缺少 .result: ${stdout.trim().slice(-500)}`)
            );
            return;
          }
          resolve(result);
        })
      );
    });
  }
}

// ============================================================
// Provider B —— Anthropic Messages API（生产，留好接口待 key）
//   现在没 key 也能 import；真正调用时才校验 ANTHROPIC_API_KEY。
//   "下次给 api 跑通"：设 VR_LLM=api + ANTHROPIC_API_KEY 即可。
// ============================================================
interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

class ApiProvider implements LlmProvider {
  readonly name = "api";

  async complete(prompt: string, opts: LlmOptions): Promise<string> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "VR_LLM=api 但未设置 ANTHROPIC_API_KEY（请在 .env.local 配置后重试）"
      );
    }
    const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
    const version = process.env.ANTHROPIC_VERSION || "2023-06-01";
    const model = resolveModelId(opts.model);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120000);
    try {
      const res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": version,
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 2048,
          ...(opts.system ? { system: opts.system } : {}),
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = (await res.json()) as AnthropicMessageResponse;
      if (!res.ok) {
        throw new Error(
          `Anthropic API ${res.status}: ${data?.error?.message ?? "未知错误"}`
        );
      }
      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
      if (!text) throw new Error("Anthropic API 返回空内容");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ============================================================
// Provider C —— OpenRouter（临时/测试，支持 Anthropic Claude 型号代理）
//   VR_LLM=openrouter + OPENROUTER_API_KEY 即可。
//   model 默认映射：sonnet → anthropic/claude-sonnet-4-5
// ============================================================
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  sonnet: "anthropic/claude-sonnet-4.5",
  opus: "anthropic/claude-opus-4.1",
  haiku: "anthropic/claude-haiku-4.5",
};

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter";

  async complete(prompt: string, opts: LlmOptions): Promise<string> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error(
        "VR_LLM=openrouter 但未设置 OPENROUTER_API_KEY"
      );
    }
    const model =
      process.env.OPENROUTER_MODEL ||
      OPENROUTER_MODEL_MAP[opts.model] ||
      opts.model;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 180000);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://vibereel.local",
          "X-Title": "VibeReel",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 4096,
          messages: [
            ...(opts.system ? [{ role: "system", content: opts.system }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      const data = (await res.json()) as OpenRouterResponse;
      if (!res.ok) {
        throw new Error(
          `OpenRouter ${res.status}: ${data?.error?.message ?? "未知错误"}`
        );
      }
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("OpenRouter 返回空内容");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---- 单例选择（HMR 安全）----
const g = globalThis as unknown as { __vrLlm?: LlmProvider };

export function getProvider(): LlmProvider {
  if (g.__vrLlm) return g.__vrLlm;
  const mode = (process.env.VR_LLM || "cli").toLowerCase();
  if (mode === "api") g.__vrLlm = new ApiProvider();
  else if (mode === "openrouter") g.__vrLlm = new OpenRouterProvider();
  else g.__vrLlm = new CliProvider();
  return g.__vrLlm;
}

// 业务唯一入口：一次补全。model 缺省走 VR_MODEL / sonnet。
export function complete(
  prompt: string,
  opts?: Partial<LlmOptions>
): Promise<string> {
  const model = opts?.model || process.env.VR_MODEL || "sonnet";
  return getProvider().complete(prompt, { ...opts, model });
}

// 给 UI/日志用：当前用的是哪个 provider。
export function providerName(): string {
  return getProvider().name;
}
