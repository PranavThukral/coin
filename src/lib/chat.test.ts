import { describe, expect, it } from "vitest";
import type { ActionCard, ChatEvent } from "../contracts";
import { addUserMessage, applyEvent, endTurn, initialChat, readEventStream, replaceCard, REPLY_CUT_OFF } from "./chat";

const card = (status: ActionCard["status"]) => ({ action_id: "a1", status }) as ActionCard;

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      // Split mid-event to prove buffering works.
      controller.enqueue(bytes.slice(0, 17));
      controller.enqueue(bytes.slice(17));
      controller.close();
    },
  });
}

describe("chat reducer", () => {
  it("streams text, parts and completion into the last Coin message", () => {
    let state = addUserMessage(initialChat, "Move $2,000 from savings to chequing");
    expect(state.busy).toBe(true);
    const events: ChatEvent[] = [
      { type: "message_start", message_id: "m" },
      { type: "tool_status", label: "Checking the rules…" },
      { type: "text_delta", text: "Here's the card " },
      { type: "text_delta", text: "to approve." },
      { type: "action_card", card: card("proposed") },
      { type: "done" },
    ];
    for (const event of events) state = applyEvent(state, event);

    const coin = state.messages[1];
    expect(coin.text).toBe("Here's the card to approve.");
    expect(coin.parts).toHaveLength(1);
    expect(coin.done).toBe(true);
    expect(state.busy).toBe(false);
    expect(state.status).toBeNull();
  });

  it("shows errors on the Coin message and stops being busy", () => {
    let state = addUserMessage(initialChat, "hi");
    state = applyEvent(state, { type: "error", code: "budget_exhausted", message: "Today's demo budget is used up." });
    expect(state.messages[1].error).toMatch(/budget/);
    expect(state.busy).toBe(false);
  });

  it("replaces a card in place after it changes state", () => {
    let state = addUserMessage(initialChat, "x");
    state = applyEvent(state, { type: "action_card", card: card("proposed") });
    state = replaceCard(state, card("pending_undo"));
    const part = state.messages[1].parts[0];
    expect(part.kind === "card" && part.card.status).toBe("pending_undo");
  });
});

describe("a stream that ends", () => {
  it("without a done event: unlocks the composer and says the reply was cut off", () => {
    let state = addUserMessage(initialChat, "Where did my money go?");
    state = applyEvent(state, { type: "text_delta", text: "Most of it went to" });
    state = endTurn(state);
    expect(state.busy).toBe(false);
    expect(state.status).toBeNull();
    expect(state.messages[1].text).toBe("Most of it went to");
    expect(state.messages[1].error).toBe(REPLY_CUT_OFF);
    expect(state.messages[1].done).toBe(true);
  });

  it("after a done event: changes nothing", () => {
    let state = addUserMessage(initialChat, "hi");
    state = applyEvent(state, { type: "text_delta", text: "Hello." });
    state = applyEvent(state, { type: "done" });
    expect(endTurn(state)).toBe(state);
    expect(state.messages[1].error).toBeNull();
  });
});

describe("readEventStream", () => {
  it("parses SSE data lines across chunk boundaries", async () => {
    const raw = 'data: {"type":"text_delta","text":"Hi"}\n\ndata: {"type":"done"}\n\n';
    const events: ChatEvent[] = [];
    for await (const event of readEventStream(streamOf(raw))) events.push(event);
    expect(events).toEqual([{ type: "text_delta", text: "Hi" }, { type: "done" }]);
  });
});

describe("one card per action", () => {
  const attempt = (id: string, status: ActionCard["status"], title = "Pay your credit card") =>
    ({ action_id: id, status, type: "bill_payment", title }) as ActionCard;
  const cardsAfter = (events: ChatEvent[]) => {
    let state = addUserMessage(initialChat, "pay off my credit card");
    for (const event of events) state = applyEvent(state, event);
    return state.messages[1].parts.flatMap((part) => (part.kind === "card" ? [part.card.action_id] : []));
  };

  it("a corrected card replaces Coin's blocked first try at the same action", () => {
    const events: ChatEvent[] = [
      { type: "action_card", card: attempt("first", "blocked") },
      { type: "action_card", card: attempt("second", "blocked") },
    ];
    expect(cardsAfter(events)).toEqual(["second"]);
  });

  it("two different actions both stay, and a card waiting for approval is never replaced", () => {
    const different: ChatEvent[] = [
      { type: "action_card", card: attempt("phone", "blocked", "Pay Northstar Mobile") },
      { type: "action_card", card: attempt("internet", "proposed", "Pay Fibrenet Internet") },
    ];
    expect(cardsAfter(different)).toEqual(["phone", "internet"]);
    const waiting: ChatEvent[] = [
      { type: "action_card", card: attempt("first", "proposed") },
      { type: "action_card", card: attempt("second", "proposed") },
    ];
    expect(cardsAfter(waiting)).toEqual(["first", "second"]);
  });
});
