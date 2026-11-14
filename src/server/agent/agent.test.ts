import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { torontoToday, type ChatEvent } from "../../contracts";
import { readEventStream } from "../../lib/chat";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { chat, setModelForTests } from "./chat";
import { buildSystemPrompt } from "./prompt";
import type { AgentModel, ModelCall } from "./model";

const now = new Date();
let fixture: SeededTestDb;
let oldEnv: NodeJS.ProcessEnv;

function fake(calls: ModelCall[][]): AgentModel & { run: ReturnType<typeof vi.fn> } {
  let step = 0;
  return { modelId: "test-model", run: vi.fn(async (_messages, onText) => {
    onText("Here is what I found.");
    return { responseId: `resp_${step}`, calls: calls[step++] ?? [], inputTokens: 100, outputTokens: 20 };
  }) };
}

function call(name: string, args: object, id = "call1"): ModelCall {
  return { id, name, arguments: JSON.stringify(args) };
}

async function send(message: string, model: AgentModel, sessionId = fixture.sessionId): Promise<ChatEvent[]> {
  setModelForTests(model);
  const request = new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ message, viewing_account_id: null }) });
  const response = await chat(request, { db: fixture.db, sessionId, now });
  const events: ChatEvent[] = [];
  for await (const event of readEventStream(response.body!)) events.push(event);
  return events;
}

describe("agent", () => {
  beforeAll(async () => {
    oldEnv = { ...process.env };
    process.env.PRICE_INPUT_USD_PER_MTOK = "2";
    process.env.PRICE_OUTPUT_USD_PER_MTOK = "5";
    process.env.COIN_KILL_SWITCH = "0";
    fixture = await seededTestDb({ today: torontoToday(now) });
  }, 30000);
  afterAll(() => { process.env = oldEnv; setModelForTests(null); });

  it("snapshots the system prompt", () => {
    expect(buildSystemPrompt({ firstName: "Jordan", today: "2026-11-14", viewingAccountName: "TFSA" })).toMatchSnapshot();
  });

  it("streams a proposed transfer and records usage", async () => {
    const sid = await fixture.newSession();
    const model = fake([[call("propose_action", { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cad: 2000, rationale: "" })], []]);
    const events = await send("Move $2,000 from savings to chequing", model, sid);
    expect(events.map((event) => event.type)).toEqual([
      "message_start", "text_delta", "tool_status", "action_card", "text_delta", "text_delta", "done",
    ]);
    // The second model step's text starts a new paragraph.
    const texts = events.filter((e) => e.type === "text_delta").map((e) => (e as { text: string }).text);
    expect(texts[1]).toBe(String.fromCharCode(10, 10));
    const card = events.find((event) => event.type === "action_card");
    expect(card?.type === "action_card" && card.card.status).toBe("proposed");
    const rows = await fixture.db.query<{ cost_micro_usd: number }>("select cost_micro_usd from usage_ledger where session_id = $1", [sid]);
    expect(rows.map((row) => row.cost_micro_usd)).toEqual([300, 300]);
  });

  it("blocks an unsolicited proposal and refuses a second proposal", async () => {
    const sid = await fixture.newSession();
    const proposal = { type: "etransfer", from_account_id: "acc_chequing", contact_id: null, new_recipient_name: "Alex", new_recipient_email: null, amount_cad: 500, memo: null, rationale: "" };
    const events = await send("Explain my last refund", fake([[call("propose_action", proposal)], [call("propose_action", proposal, "call2")], []]), sid);
    const cards = events.filter((event) => event.type === "action_card");
    expect(cards).toHaveLength(1);
    expect(cards[0].type === "action_card" && cards[0].card.checks.find((check) => check.rule === "R0_intent")?.outcome).toBe("fail");
  });

  it("stops after six model calls", async () => {
    const model = fake(Array.from({ length: 10 }, (_, i) => [call("get_accounts", {}, `call${i}`)]));
    const events = await send("Show accounts", model, await fixture.newSession());
    expect(model.run).toHaveBeenCalledTimes(6);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("enforces kill switch, daily budget, and session rate", async () => {
    const model = fake([]);
    process.env.COIN_KILL_SWITCH = "1";
    expect((await send("Hello", model)).find((event) => event.type === "error")?.code).toBe("budget_exhausted");
    process.env.COIN_KILL_SWITCH = "0";
    await fixture.db.query("insert into usage_ledger (day_toronto, model, input_tokens, output_tokens, cost_micro_usd) values ($1, 'test', 0, 0, 500000)", [torontoToday(now)]);
    expect((await send("Hello", model)).find((event) => event.type === "error")?.code).toBe("budget_exhausted");
    expect(model.run).not.toHaveBeenCalled();
    await fixture.db.query("delete from usage_ledger");
    const sid = await fixture.newSession();
    for (let i = 0; i < 15; i++) await send("Hello", model, sid);
    expect((await send("Hello", model, sid)).find((event) => event.type === "error")?.code).toBe("rate_limited");
  });
});
