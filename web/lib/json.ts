// 健壮 JSON 提取（被 agent / decompose / customstyle 共用，独立成文件避免循环依赖）。
// 先直接 parse；失败则剥 ```json fences、截取第一个 [ 或 { 到匹配收尾再 parse。

export function extractJson<T = unknown>(text: string): T {
  const direct = tryParse<T>(text);
  if (direct.ok) return direct.value;

  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    const inner = tryParse<T>(fence[1]);
    if (inner.ok) return inner.value;
    t = fence[1].trim();
  }

  const startArr = t.indexOf("[");
  const startObj = t.indexOf("{");
  const candidates: number[] = [startArr, startObj].filter((i) => i >= 0);
  if (candidates.length === 0) {
    throw new Error(`无法从输出中提取 JSON：${text.slice(0, 300)}`);
  }
  const start = Math.min(...candidates);
  const open = t[start];
  const close = open === "[" ? "]" : "}";

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const slice = t.slice(start, i + 1);
        const parsed = tryParse<T>(slice);
        if (parsed.ok) return parsed.value;
        break;
      }
    }
  }
  throw new Error(`无法从输出中提取 JSON：${text.slice(0, 300)}`);
}

function tryParse<T>(s: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s.trim()) as T };
  } catch {
    return { ok: false };
  }
}
