import type { SSEPayload } from "@/lib/types";

type Cb = (p: SSEPayload) => void;

interface BusState {
  subs: Map<string, Set<Cb>>;
  last: Map<string, SSEPayload>;
}

// HMR 安全：单例挂到 globalThis，避免 dev 热重载产生多实例。
const g = globalThis as unknown as { __vrBus?: BusState };

function bus(): BusState {
  if (!g.__vrBus) {
    g.__vrBus = {
      subs: new Map<string, Set<Cb>>(),
      last: new Map<string, SSEPayload>(),
    };
  }
  return g.__vrBus;
}

export function emit(id: string, payload: SSEPayload): void {
  const b = bus();
  b.last.set(id, payload);
  const set = b.subs.get(id);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(payload);
    } catch {
      /* 单个订阅者失败不影响其他 */
    }
  }
}

export function subscribe(id: string, cb: Cb): () => void {
  const b = bus();
  let set = b.subs.get(id);
  if (!set) {
    set = new Set<Cb>();
    b.subs.set(id, set);
  }
  set.add(cb);
  return () => {
    const s = b.subs.get(id);
    if (s) {
      s.delete(cb);
      if (s.size === 0) b.subs.delete(id);
    }
  };
}

// 可选：取某 id 最近一次推送（连接时可先补发）。
export function lastPayload(id: string): SSEPayload | undefined {
  return bus().last.get(id);
}
