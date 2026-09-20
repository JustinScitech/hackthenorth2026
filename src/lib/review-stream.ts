export type ReviewProgress = {
  stage: string;
  message: string;
  detail?: string;
  current?: number;
  total?: number;
};

export type ReviewStreamEvent<T> =
  | { type: "progress"; data: ReviewProgress }
  | { type: "result"; data: T }
  | { type: "error"; data: { error: string } };

export function encodeReviewEvent<T>(event: ReviewStreamEvent<T>): Uint8Array {
  return encodeStreamEvent(event);
}

export function encodeStreamEvent(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** Reads line-delimited SSE frames from a POST response. */
export async function readStream<T>(response: Response, onEvent: (event: T) => void): Promise<void> {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Review stream failed (HTTP ${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
        if (data) {
          onEvent(JSON.parse(data) as T);
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readReviewStream<T>(response: Response, onEvent: (event: ReviewStreamEvent<T>) => void): Promise<void> {
  return readStream<ReviewStreamEvent<T>>(response, (event) => {
    if (event.type === "error") throw new Error(event.data.error);
    onEvent(event);
  });
}
