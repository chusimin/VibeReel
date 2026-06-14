import type { SSEPayload } from "@/lib/types";
import { getProject } from "@/lib/store";
import { subscribe } from "@/lib/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const sendPayload = (payload: SSEPayload) => {
        send(`data: ${JSON.stringify(payload)}\n\n`);
      };

      // 连接即发当前快照
      const snapshot = getProject(id);
      send(`data: ${JSON.stringify({ project: snapshot })}\n\n`);

      // 订阅后续推送
      const unsub = subscribe(id, sendPayload);

      // 心跳，避免代理/浏览器掐断空闲连接
      const ping = setInterval(() => {
        send(`: ping\n\n`);
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
