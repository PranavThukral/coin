/**
 * Plays the whole scripted demo, in order, against a seeded visitor session
 * and checks that every step shows what its caption promises. No model.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { type ActionCard, type ChatEvent } from "../../contracts";
import { DEMO_STEPS, demoStepForPrompt } from "../../demo/script";
import { approve, executeNow } from "../actions/service";
import { retryAtMax } from "../actions/retry";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { runScriptedTurn, type TurnTiming } from "./turn";

const INSTANT: TurnTiming = { statusMs: 0, wordMs: 0 };
let f: SeededTestDb;

beforeAll(async () => {
  f = await seededTestDb({ today: "2027-01-05" }); // any day: dates must follow it
}, 30_000);

async function play(stepId: string): Promise<{ events: ChatEvent[]; text: string; card: ActionCard | null }> {
  const step = DEMO_STEPS.find((s) => s.id === stepId)!;
  const events: ChatEvent[] = [];
  await runScriptedTurn(f.db, f.sessionId, step, (event) => events.push(event), INSTANT);
  const text = events.flatMap((e) => (e.type === "text_delta" ? [e.text] : [])).join("");
  const card = events.flatMap((e) => (e.type === "action_card" ? [e.card] : [])).at(-1) ?? null;
  return { events, text, card };
}

async function balance(id: string): Promise<number> {
  const [row] = await f.db.query<{ balance_cents: number }>(
    "select balance_cents from accounts where session_id = $1 and id = $2",
    [f.sessionId, id],
  );
  return row.balance_cents;
}

describe("the scripted demo, step by step", () => {
  it("every prompt maps back to its step, and every turn ends with done", () => {
    for (const step of DEMO_STEPS.filter((s) => s.prompt)) {
      expect(demoStepForPrompt(step.prompt!)).toBe(step);
    }
  });

  it("investments: two charts with data, and the concentration called out", async () => {
    const { events, text } = await play("investments");
    const charts = events.flatMap((e) => (e.type === "chart" ? [e.chart] : []));
    expect(charts.map((c) => c.source)).toEqual(["portfolio_value_over_time", "allocation_by_holding"]);
    expect(charts.every((c) => c.data.length > 0)).toBe(true);
    expect(text).toContain("Northwind Robotics");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("spending: the Streamly change, dated for the visitor's today", async () => {
    const { text } = await play("spending");
    expect(text).toContain("$16.99 to $22.99");
    expect(text).toContain("Nov 23"); // 2027-01-05 minus 43 days
    expect(text).not.toMatch(/\{d/);
  });

  it("transfer: a card that approves and executes for real", async () => {
    const before = await balance("acc_chequing");
    const { card } = await play("transfer");
    expect(card?.status).toBe("proposed");
    const now = new Date();
    await approve(f.db, f.sessionId, card!.action_id, now);
    const done = await executeNow(f.db, f.sessionId, card!.action_id, now);
    expect(done.status).toBe("executed");
    expect(await balance("acc_chequing")).toBe(before + 200_000);
  });

  it("new recipient: blocked at $400 with a $300 offer; the retry needs a second confirmation", async () => {
    const { card } = await play("new-recipient");
    expect(card?.status).toBe("blocked");
    expect(card?.max_passing_amount_cents).toBe(30_000);
    const { card: retry } = await retryAtMax(f.db, f.sessionId, card!.action_id);
    expect(retry.status).toBe("proposed");
    expect(retry.requires_second_confirmation).toBe(true);
  });

  it("card in full: still blocked by the buffer after the transfer, with a smaller offer", async () => {
    const { card } = await play("card");
    expect(card?.status).toBe("blocked");
    expect(card?.checks.find((c) => c.rule === "R4_enough_money")?.outcome).toBe("fail");
    expect(card?.max_passing_amount_cents).toBe(434_012); // $4,840.12 - $500 buffer
  });

  it("injection: the planted $500 send is blocked by rule 0 and offers nothing", async () => {
    const { card, text } = await play("injection");
    expect(card?.status).toBe("blocked");
    expect(card?.checks.find((c) => c.rule === "R0_intent")?.outcome).toBe("fail");
    expect(card?.max_passing_amount_cents).toBeNull();
    expect(text).toContain("Dec 28"); // the refund, 8 days before 2027-01-05
    const [executed] = await f.db.query<{ n: number }>(
      "select count(*)::int as n from actions where session_id = $1 and type = 'etransfer' and status = 'executed'",
      [f.sessionId],
    );
    expect(executed.n).toBe(0);
  });
});
