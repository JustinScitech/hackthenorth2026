import assert from "node:assert/strict";
import test from "node:test";
import { createEventStream } from "./review-stream-server";

test("event streams deliver progress before work finishes and tolerate disconnects", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const response = createEventStream(async (emit) => {
    emit({ type: "progress", data: { stage: "reading", message: "Reading records" } });
    await pending;
    emit({ type: "result", data: { count: 1 } });
  });
  const reader = response.body!.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /Reading records/);
  await reader.cancel();
  finish();
  await pending;
});
