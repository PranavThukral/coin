/**
 * The agent loop around a fake model: what the user is shown, what the model
 * is told after each tool call, and what happens when things go wrong.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { torontoToday, type ChatEvent } from "../../contracts";
import { readEventStream } from "../../lib/chat";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { chat, setModelForTests } from "./chat";
import { runAgent } from "./loop";
import type { AgentModel, ModelCall, ModelTurn } from "./model";
import { repairProposalArguments } from "./proposal-tool";
import { buildSystemPrompt } from "./prompt";

const now = new Date();
let fixture: SeededTestDb;
let oldEnv: NodeJS.ProcessEnv;

type FakeModel = AgentModel & { turns: ModelTurn[] };

/** Replays one list of tool calls per step; says `text` on steps that have one. */
function fakeModel(steps: ModelCall[][], text: string | null = "Okay."): FakeModel {
  const turns: ModelTurn[] = [];
  let step = 0;
  return {
    modelId: "test-model",
    turns,
    async run(turn, onText) {
      turns.push(turn);
      if (text !== null) onText(text);
      const calls = steps[step] ?? [];
      step += 1;
      return { responseId: `resp_${step}`, calls, inputTokens: 100, outputTokens: 20 };
    },
  };
}

function call(name: string, args: object, id = "call1"): ModelCall {
  return { id, name, arguments: JSON.stringify(args) };
}

async function send(message: string, model: AgentModel, sessionId: string): Promise<ChatEvent[]> {
  setModelForTests(model);
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, viewing_account_id: null }),
  });
  const response = await chat(request, { db: fixture.db, sessionId, now });
  const events: ChatEvent[] = [];
  for await (const event of readEventStream(response.body!)) events.push(event);
  return events;
}

/** The JSON the model received as the result of its first tool call in `step`. */
function toolResult(model: FakeModel, step: number): Record<string, unknown> {
  const item = model.turns[step].input[0];
  if (item.kind !== "tool_result") throw new Error("Expected a tool result");
  return JSON.parse(item.output);
}

function cards(events: ChatEvent[]) {
  return events.flatMap((event) => (event.type === "action_card" ? [event.card] : []));
}

function replyText(events: ChatEvent[]): string {
  return events.flatMap((event) => (event.type === "text_delta" ? [event.text] : [])).join("");
}

const payCard = (bill_id: string, amount_cad: number, from_account_id = "acc_hisa") =>
  call("propose_action", { proposal: { type: "bill_payment", from_account_id, bill_id, amount_cad, rationale: "" } });

const buy = (ticker: string, quantity: number, id = "call1") =>
  call("propose_action", { proposal: { type: "trade", account_id: "acc_tfsa", side: "buy", ticker, quantity, rationale: "" } }, id);

beforeAll(async () => {
  oldEnv = { ...process.env };
  process.env.PRICE_INPUT_USD_PER_MTOK = "2";
  process.env.PRICE_OUTPUT_USD_PER_MTOK = "5";
  process.env.COIN_KILL_SWITCH = "0";
  fixture = await seededTestDb({ today: torontoToday(now) });
}, 30_000);

afterAll(() => {
  process.env = oldEnv;
  setModelForTests(null);
});

describe("paying the credit card", () => {
  it("treats the card's account id in bill_id as the card bill", async () => {
    const model = fakeModel([[payCard("acc_card", 500)], []]);
    const events = await send("Pay $500 on my credit card from savings", model, await fixture.newSession());

    const [card] = cards(events);
    expect(card.status).toBe("proposed");
    expect(card.title).toBe("Pay your credit card");
    expect(card.from_label).toBe("High-Interest Savings");
    expect(toolResult(model, 1).outcome).toBe("card_shown_for_approval");
  });

  it("the repair cannot turn another bill or a transfer into a card payment", () => {
    const hydro = { type: "bill_payment", bill_id: "bill_hydro" };
    const transfer = { type: "transfer", to_account_id: "acc_card", bill_id: "acc_card" };
    expect(repairProposalArguments(hydro)).toEqual(hydro);
    expect(repairProposalArguments(transfer)).toEqual(transfer);
    expect(repairProposalArguments(null)).toBeNull();
  });

  it("the prompt names bill_card and tells the model to propose what rules will block", () => {
    const prompt = buildSystemPrompt({ firstName: "Jordan", today: "2026-11-14", viewingAccountName: null });
    expect(prompt).toContain('always type "bill_payment" with bill_id "bill_card"');
    expect(prompt).toContain("Propose even when you can tell a rule will block it: an unsaved bill");
    expect(prompt).toContain("Never describe it as an error, a failure or a tool problem.");
    expect(prompt).toContain("- NRTH.CX: Northwind Robotics");
  });
});

describe("what the model is told after a tool call", () => {
  it("a blocked card is a rule decision with its reasons, not an error", async () => {
    const model = fakeModel([[payCard("bill_card", 4912.38, "acc_chequing")], []]);
    const events = await send("Pay my card in full", model, await fixture.newSession());

    expect(cards(events)[0].status).toBe("blocked");
    const result = toolResult(model, 1);
    expect(result.outcome).toBe("blocked_by_a_rule");
    expect(result.reasons_shown_on_the_card).toEqual([
      "This would leave Everyday Chequing under $500. I can do up to $2,340.12.",
    ]);
    expect(result.largest_amount_that_passes).toBe("$2,340.12");
    expect(result).not.toHaveProperty("error");
    expect(String(result.how_to_reply)).toContain("Never call this an error or a tool failure");
  });

  it("an unsaved bill is proposed and blocked by rule 2 alone", async () => {
    const parking = call("propose_action", {
      proposal: { type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_parking", amount_cad: 52.75, rationale: "" },
    });
    const model = fakeModel([[parking], []]);
    const events = await send("Pay the parking permit bill", model, await fixture.newSession());

    const [card] = cards(events);
    expect(card.status).toBe("blocked");
    expect(card.primary_message).toBe("Save this payee in Bills first.");
    expect(toolResult(model, 1).reasons_shown_on_the_card).toEqual(["Save this payee in Bills first."]);
  });

  it("bad arguments are named so the model can correct them", async () => {
    const model = fakeModel([[call("get_upcoming", { days: 900 })], []]);
    await send("What's coming up?", model, await fixture.newSession());

    const result = toolResult(model, 1);
    expect(result.outcome).toBe("invalid_arguments");
    expect(JSON.stringify(result.problems)).toContain("days");
  });

  it("an internal failure is described as technical, and logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = fakeModel([[call("get_accounts", {})], []]);
    const events: ChatEvent[] = [];
    await runAgent({
      db: fixture.db,
      sessionId: randomUUID(), // no such session, so the tool's query fails
      userMessageId: randomUUID(),
      history: [{ role: "user", content: "Show my accounts" }],
      viewingAccountId: null,
      model,
      systemPrompt: "",
      emit: (event) => events.push(event),
    });

    expect(toolResult(model, 1).outcome).toBe("tool_unavailable");
    expect(logged).toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe("done");
    logged.mockRestore();
  });
});

describe("proposals the code cannot read", () => {
  it("shows no card, lets the model correct itself once, then refuses", async () => {
    const steps = [[buy("Northwind", 5, "a")], [buy("nrth", 5, "b")], [buy("NRTH.CX", 5, "c")], []];
    const model = fakeModel(steps);
    const sid = await fixture.newSession();
    const events = await send("Buy 5 shares of Northwind in my TFSA", model, sid);

    expect(toolResult(model, 1).outcome).toBe("invalid_arguments");
    expect(toolResult(model, 2).outcome).toBe("card_shown_for_approval");
    expect(toolResult(model, 3).outcome).toBe("not_done");
    expect(cards(events).map((card) => card.title)).toEqual(["Buy 5 shares of Northwind Robotics"]);

    // The unreadable attempt is still on record as blocked.
    const rows = await fixture.db.query<{ status: string }>(
      "select status from actions where session_id = $1 order by created_at, id",
      [sid],
    );
    expect(rows.map((row) => row.status).sort()).toEqual(["blocked", "proposed"]);
  });
});

describe("turn limits and empty replies", () => {
  it("says something when the model produced nothing to show", async () => {
    const events = await send("Hello", fakeModel([[]], null), await fixture.newSession());
    expect(replyText(events)).toContain("I couldn't put an answer together");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("starts no new model call once the time limit has passed", async () => {
    const model = fakeModel(Array.from({ length: 6 }, (_, i) => [call("get_contribution_room", {}, `c${i}`)]));
    let time = 0;
    await runAgent({
      db: fixture.db,
      sessionId: await fixture.newSession(),
      userMessageId: randomUUID(),
      history: [{ role: "user", content: "How much room do I have?" }],
      viewingAccountId: null,
      model,
      systemPrompt: "",
      emit: () => {},
      clock: () => (time += 30_000), // every look at the clock is 30s later
    });
    expect(model.turns).toHaveLength(1);
  });

  it("leaves text-less replies out of the history sent to the model", async () => {
    const sid = await fixture.newSession();
    await fixture.db.query(
      "insert into messages (session_id, role, content) values ($1, 'user', 'Pay my card in full'), ($1, 'assistant', '')",
      [sid],
    );
    const model = fakeModel([[]]);
    await send("And my balance?", model, sid);
    expect(model.turns[0].input).toEqual([
      { kind: "message", role: "user", content: "Pay my card in full" },
      { kind: "message", role: "user", content: "And my balance?" },
    ]);
  });
});

describe("a visitor who leaves mid-reply", () => {
  it("still has the model call's cost recorded, and no further calls are made", async () => {
    const sid = await fixture.newSession();
    const slowModel = fakeModel([[call("get_contribution_room", {})], []]);
    const run = slowModel.run.bind(slowModel);
    slowModel.run = async (turn, onText) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return run(turn, onText);
    };
    setModelForTests(slowModel);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "How much TFSA room do I have?", viewing_account_id: null }),
    });
    const response = await chat(request, { db: fixture.db, sessionId: sid, now });
    await response.body!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 400));

    const usage = await fixture.db.query("select id from usage_ledger where session_id = $1", [sid]);
    expect(usage).toHaveLength(1);
    expect(slowModel.turns).toHaveLength(1);
    const saved = await fixture.db.query("select id from messages where session_id = $1 and role = 'assistant'", [sid]);
    expect(saved).toHaveLength(1);
  });
});

describe("insight tools", () => {
  it("shows the tool's own chart and hands the model the numbers", async () => {
    const model = fakeModel([[call("get_cash_flow", { months: 3, chart: true })], []]);
    const events = await send("How much do I save each month?", model, await fixture.newSession());

    const charts = events.filter((event) => event.type === "chart");
    expect(charts).toHaveLength(1);
    const result = toolResult(model, 1) as { chart_shown: string; result: { months: unknown[] } };
    expect(result.chart_shown).toBe("Money in vs money out");
    expect(result.result.months).toHaveLength(3);
  });

  it("counts those charts against the per-reply limit", async () => {
    const ask = (id: string) => call("get_cash_flow", { months: 2, chart: true }, id);
    const model = fakeModel([[ask("c1"), ask("c2"), ask("c3"), ask("c4")], []]);
    const events = await send("Show me my cash flow four times", model, await fixture.newSession());
    expect(events.filter((event) => event.type === "chart")).toHaveLength(3);
  });

  it("names bad arguments so the model can correct them", async () => {
    const model = fakeModel([[call("plan_savings_goal", { target_cad: -5, chart: true })], []]);
    await send("How long to save?", model, await fixture.newSession());
    expect(toolResult(model, 1).outcome).toBe("invalid_arguments");
  });
});
