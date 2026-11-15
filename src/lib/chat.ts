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
  return { messages: [...state.messages, user, coin], status: "Thinking\u2026", busy: true };
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

export const REPLY_CUT_OFF = "The reply was cut off. Try asking again.";

/**
 * The stream has ended. If no "done" or "error" event closed the turn (the
 * connection dropped, or the server ran out of time), close it here so the
 * composer unlocks and the visitor sees why the reply stopped.
 */
export function endTurn(state: ChatState): ChatState {
  if (!state.busy) return state;
  return applyEvent(state, { type: "error", code: "model_error", message: REPLY_CUT_OFF });
}

/** "Use $X instead": the server's request text, then Coin's new card. */
export function addRetry(state: ChatState, text: string, card: ActionCard): ChatState {
  const user: ChatMessage = { id: nextId("u"), role: "user", text, parts: [], error: null, done: true };
  const coin: ChatMessage = {
    id: nextId("c"),
    role: "coin",
    text: "Here it is at the largest amount that passes the checks.",
    parts: [{ kind: "card", card }],
    error: null,
    done: true,
  };
  return { ...state, messages: [...state.messages, user, coin] };
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
/** POST a message to a streaming endpoint and yield its events. */
function streamingTransport(path: string, notFoundMessage: string): ChatTransport {
  return {
    async *send(message, viewingAccountId, signal) {
      let response: Response;
      try {
        response = await fetch(path, {
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
        const fallback = response.status === 404 ? notFoundMessage : "Coin can't answer right now. Try again in a moment.";
        yield { type: "error", code: "model_error", message: body.error ?? fallback };
        return;
      }
      yield* readEventStream(response.body);
    },
  };
}

/** Live mode: Coin on the model, POST /api/chat. */
export const liveTransport = streamingTransport("/api/chat", "Live mode isn't connected yet. The scripted demo works.");

/** Scripted demo: the same pipeline without a model, POST /api/demo/chat. */
export const demoTransport = streamingTransport("/api/demo/chat", "That isn't one of the demo's questions.");
