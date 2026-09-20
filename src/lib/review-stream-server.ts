import { encodeStreamEvent } from "./review-stream";

/** Shared SSE transport. Disconnects stop writes and cannot reject a route task. */
export function createEventStream<T>(work: (emit: (event: T) => void, signal: AbortSignal) => Promise<void>, requestSignal?: AbortSignal): Response {
  const abort = new AbortController();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stop = () => { closed = true; abort.abort(); };
      requestSignal?.addEventListener("abort", stop, { once: true });
      if (requestSignal?.aborted) stop();
      const emit = (event: T) => {
        if (closed) return;
        try { controller.enqueue(encodeStreamEvent(event)); }
        catch { stop(); }
      };
      void work(emit, abort.signal).catch((error) => {
        if (!closed) console.error("Review stream failed", error);
      }).finally(() => {
        requestSignal?.removeEventListener("abort", stop);
        if (!closed) { closed = true; try { controller.close(); } catch { /* Browser disconnected. */ } }
      });
    },
    cancel() { closed = true; abort.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
