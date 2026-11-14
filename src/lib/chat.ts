// Chat plumbing for the Coin sidebar. A transport turns a user message into a
// stream of contract ChatEvents; the reducer folds those events into the
// visible conversation. Live mode streams from /api/chat; the scripted demo
// replays recorded events through the same interface.
import type { AccountId, ActionCard, ChartPayload, ChatEvent } from "../contracts";

export interface ChatTransport {
  send(message: string, viewingAccountId: AccountId | null, signal: AbortSignal): AsyncIterable<ChatEvent>;
}

export type MessagePart = { kind: "chart"; chart: ChartPayload } | { kind: "card"; card: ActionCard };

export interface ChatMessage {
  id: string;
  role: "user" | "coin";
  text: string;
  parts: MessagePart[];
  error: string | null;
  done: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  /** What Coin is doing right now ("Reading your transactions..."), or null. */
  status: string | null;
  busy: boolean;
}

export const initialChat: ChatState = { messages: [], status: null, busy: false };

let localId = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++localId}`;

export function addUserMessage(state: ChatState, text: string): ChatState {
  const user: ChatMessage = { id: nextId("u"), role: "user", text, parts: [], error: null, done: true };
  const coin: ChatMessage = { id: nextId("c"), role: "coin", text: "", parts: [], error: null, done: false };
  return { messages: [...state.messages, user, coin], status: "Thinking…", busy: true };
}

function updateLastCoin(state: ChatState, update: (message: ChatMessage) => ChatMessage): ChatState {
  const messages = [...state.messages];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "coin") {
      messages[i] = update(messages[i]);
      break;
    }
  }
  return { ...state, messages };
}

/** Fold one server event into the conversation. Pure, so it is easy to test. */
export function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "message_start":
      return state;
    case "tool_status":
      return { ...state, status: event.label };
    case "text_delta":
      return updateLastCoin({ ...state, status: null }, (m) => ({ ...m, text: m.text + event.text }));
    case "chart":
      return updateLastCoin(state, (m) => ({ ...m, parts: [...m.parts, { kind: "chart", chart: event.chart }] }));
    case "action_card":
      return updateLastCoin(state, (m) => ({ ...m, parts: [...m.parts, { kind: "card", card: event.card }] }));
    case "error":
      return updateLastCoin({ ...state, status: null, busy: false }, (m) => ({ ...m, error: event.message, done: true }));
    case "done":
      return updateLastCoin({ ...state, status: null, busy: false }, (m) => ({ ...m, done: true }));
  }
}

/** Replace an action card wherever it appears (after approve, undo, settle...). */
export function replaceCard(state: ChatState, card: ActionCard): ChatState {
  const messages = state.messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.kind === "card" && part.card.action_id === card.action_id ? { kind: "card" as const, card } : part,
    ),
  }));
  return { ...state, messages };
}

/** Parse a text/event-stream body into ChatEvents (one JSON object per data: line). */
export async function* readEventStream(body: ReadableStream<Uint8Array>): AsyncIterable<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (data) yield JSON.parse(data) as ChatEvent;
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/** Live mode: POST /api/chat and stream the reply. */
export const liveTransport: ChatTransport = {
  async *send(message, viewingAccountId, signal) {
    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, viewing_account_id: viewingAccountId }),
        signal,
      });
    } catch {
      yield { type: "error", code: "model_error", message: "Coin can't be reached right now. Try again in a moment." };
      return;
    }
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      const fallback = response.status === 404
        ? "Live mode isn't connected yet. The scripted demo works."
        : "Coin can't answer right now. Try again in a moment.";
      yield { type: "error", code: "model_error", message: body.error ?? fallback };
      return;
    }
    yield* readEventStream(response.body);
  },
};
