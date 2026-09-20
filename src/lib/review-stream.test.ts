import assert from "node:assert/strict";
import test from "node:test";
import { encodeReviewEvent, readReviewStream, type ReviewStreamEvent } from "./review-stream";

test("review events survive arbitrary network chunk boundaries and surface stream errors", async () => {
  const first = encodeReviewEvent({ type: "progress", data: { stage: "reading", message: "Reading records", current: 2, total: 3 } });
  const second = encodeReviewEvent({ type: "result", data: { count: 3 } });
  const bytes = new Uint8Array([...first, ...second]);
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    },
  }));
  const events: ReviewStreamEvent<{ count: number }>[] = [];
  await readReviewStream<{ count: number }>(response, (event) => { events.push(event); });
  assert.deepEqual(events.map((event) => event.type), ["progress", "result"]);
  assert.deepEqual(events[1], { type: "result", data: { count: 3 } });

  const failed = new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(encodeReviewEvent({ type: "error", data: { error: "Federato unavailable" } }));
    controller.close();
  } }));
  await assert.rejects(readReviewStream(failed, () => {}), /Federato unavailable/);
});
