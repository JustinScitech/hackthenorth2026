import { streamReviewQuestion, type ChatTurn } from "./chat";
import { createEventStream } from "@/lib/review-stream-server";

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "complete"; reply: string; model: string }
  | { type: "error"; error: string };

export function streamChatResponse(briefing: string, history: ChatTurn[], question: string): Response {
  return createEventStream<ChatEvent>(async (emit) => {
    try {
      const answer = await streamReviewQuestion(briefing, history, question, (text) => emit({ type: "delta", text }));
      emit({ type: "complete", ...answer });
    } catch (error) {
      console.error("Agent chat unavailable", error instanceof Error ? error.name : "UnknownError");
      emit({ type: "error", error: "The agent is unavailable right now. Try again in a moment." });
    }
  });
}
