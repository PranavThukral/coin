import { beforeAll, describe, expect, it } from "vitest";
import { torontoToday } from "../../contracts";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { approve, confirmRecipient, executeNow, proposeAction, settleDueActions, undo } from "./service";

let fixture: SeededTestDb;
const now = new Date();

async function proposal(sessionId: string, text: string, raw: unknown) {
  const [message] = await fixture.db.query<{ id: string }>("insert into messages (session_id, role, content) values ($1, 'user', $2) returning id", [sessionId, text]);
  return proposeAction(fixture.db, sessionId, message.id, raw);
}

async function run(sessionId: string, text: string, raw: unknown) {
  const card = await proposal(sessionId, text, raw);
  expect(card.status, JSON.stringify(card.checks)).toBe("proposed");
  await approve(fixture.db, sessionId, card.action_id, now);
  return executeNow(fixture.db, sessionId, card.action_id, now);
}

describe("action lifecycle", () => {
  beforeAll(async () => { fixture = await seededTestDb({ today: torontoToday(now) }); }, 30000);

  it("executes a transfer and decreases contribution room", async () => {
    const sid = await fixture.newSession();
    const card = await run(sid, "Move $100 from savings to TFSA", { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_tfsa", amount_cad: 100, rationale: "" });
    expect(card.status).toBe("executed");
    const rows = await fixture.db.query<{ amount_cents: number; posted_on: string }>("select amount_cents, posted_on from transactions where session_id = $1 and action_id = $2 order by amount_cents", [sid, card.action_id]);
    expect(rows.map((r) => r.amount_cents)).toEqual([-10000, 10000]);
    expect(rows.every((r) => r.posted_on === fixture.today)).toBe(true);
    const [room] = await fixture.db.query<{ room_remaining_cents: number }>("select room_remaining_cents from room where session_id = $1 and account_type = 'tfsa'", [sid]);
    expect(room.room_remaining_cents).toBe(340000);
  });

  it("handles partial card payments and clears the statement at completion", async () => {
    const sid = await fixture.newSession();
    await fixture.db.query("update accounts set balance_cents = 1000000 where session_id = $1 and id = 'acc_chequing'", [sid]);
    const [original] = await fixture.db.query<{ due_date: string }>("select due_date from bills where session_id = $1 and id = 'bill_card'", [sid]);
    for (const [index, amount] of [1000, 1000, 2912.38].entries()) {
      const card = await run(sid, `Pay card $${amount} from chequing`, { type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_card", amount_cad: amount, rationale: "" });
      expect(card.status).toBe("executed");
      const [bill] = await fixture.db.query<{ amount_cents: number; due_date: string }>("select amount_cents, due_date from bills where session_id = $1 and id = 'bill_card'", [sid]);
      expect(bill.amount_cents).toBe([391238, 291238, 0][index]);
      if (index < 2) expect(bill.due_date).toBe(original.due_date);
      else expect(bill.due_date > original.due_date).toBe(true);
    }
    const [card] = await fixture.db.query<{ balance_cents: number; statement_balance_cents: number }>("select balance_cents, statement_balance_cents from accounts where session_id = $1 and id = 'acc_card'", [sid]);
    const [bill] = await fixture.db.query<{ amount_cents: number }>("select amount_cents from bills where session_id = $1 and id = 'bill_card'", [sid]);
    expect(card).toEqual({ balance_cents: 0, statement_balance_cents: 0 });
    expect(bill.amount_cents).toBe(0);
  });

  it("executes a trade and a confirmed new-recipient transfer", async () => {
    const sid = await fixture.newSession();
    const [before] = await fixture.db.query<{ quantity: number; avg_cost_cents: number }>("select quantity, avg_cost_cents from holdings where session_id = $1 and account_id = 'acc_tfsa' and ticker = 'CAEQ.CX'", [sid]);
    const card = await run(sid, "Buy 2 shares CAEQ.CX in TFSA", { type: "trade", account_id: "acc_tfsa", side: "buy", ticker: "CAEQ.CX", quantity: 2, rationale: "" });
    expect(card.status).toBe("executed");
    const [holding] = await fixture.db.query<{ quantity: number; avg_cost_cents: number }>("select quantity, avg_cost_cents from holdings where session_id = $1 and account_id = 'acc_tfsa' and ticker = 'CAEQ.CX'", [sid]);
    expect(holding.quantity).toBe(before.quantity + 2);
    expect(holding.avg_cost_cents).toBe(Math.round((before.quantity * before.avg_cost_cents + card.amount_cents!) / holding.quantity));
    await run(sid, "Sell 1 shares CAEQ.CX in TFSA", { type: "trade", account_id: "acc_tfsa", side: "sell", ticker: "CAEQ.CX", quantity: 1, rationale: "" });
    const [after] = await fixture.db.query<{ quantity: number; avg_cost_cents: number }>("select quantity, avg_cost_cents from holdings where session_id = $1 and account_id = 'acc_tfsa' and ticker = 'CAEQ.CX'", [sid]);
    expect(after).toEqual({ quantity: holding.quantity - 1, avg_cost_cents: holding.avg_cost_cents });
    const recipient = await proposal(sid, "Send $100 to Alex", { type: "etransfer", from_account_id: "acc_chequing", contact_id: null, new_recipient_name: "Alex", new_recipient_email: null, amount_cad: 100, memo: null, rationale: "" });
    expect(recipient.requires_second_confirmation).toBe(true);
    await confirmRecipient(fixture.db, sid, recipient.action_id, "alex@example.test");
    await approve(fixture.db, sid, recipient.action_id, now);
    expect((await executeNow(fixture.db, sid, recipient.action_id, now)).status).toBe("executed");
  });

  it("blocks stale funds, malformed requests and injected action intent", async () => {
    const sid = await fixture.newSession();
    const raw = { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cad: 2000, rationale: "" };
    const card = await proposal(sid, "Move $2,000 from savings to chequing", raw);
    await approve(fixture.db, sid, card.action_id, now);
    await expect(fixture.db.query("update actions set payload = '{}' where session_id = $1 and id = $2", [sid, card.action_id])).rejects.toThrow();
    await fixture.db.query("update accounts set balance_cents = 0 where session_id = $1 and id = 'acc_hisa'", [sid]);
    expect((await executeNow(fixture.db, sid, card.action_id, now)).status).toBe("blocked");
    const [state] = await fixture.db.query<{ blocked_at_execution: boolean; count: number }>("select blocked_at_execution, (select count(*) from transactions where session_id = $1 and action_id = $2) as count from actions where session_id = $1 and id = $2", [sid, card.action_id]);
    expect(state).toEqual({ blocked_at_execution: true, count: 0 });
    expect((await proposal(sid, "Move money", {})).status).toBe("blocked");
    const injected = await proposal(sid, "Explain my last refund", { ...raw, amount_cad: 500 });
    expect(injected.checks.find((c) => c.rule === "R0_intent")?.outcome).toBe("fail");
  });

  it("isolates actions and settles a race only once", async () => {
    const sid = await fixture.newSession();
    const other = await fixture.newSession();
    const card = await proposal(sid, "Move $2,000 from savings to chequing", { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cad: 2000, rationale: "" });
    for (const call of [confirmRecipient(fixture.db, other, card.action_id, "a@example.test"), approve(fixture.db, other, card.action_id, now), undo(fixture.db, other, card.action_id), executeNow(fixture.db, other, card.action_id, now)]) await expect(call).rejects.toThrow("Action not found");
    expect(await settleDueActions(fixture.db, other, now)).toEqual([]);
    await approve(fixture.db, sid, card.action_id, new Date(now.getTime() - 120000));
    await Promise.all([executeNow(fixture.db, sid, card.action_id, now), settleDueActions(fixture.db, sid, now)]);
    const rows = await fixture.db.query("select id from transactions where session_id = $1 and action_id = $2", [sid, card.action_id]);
    expect(rows).toHaveLength(2);
  });

  it("serializes competing approvals and settlements", async () => {
    const sid = await fixture.newSession();
    for (let i = 0; i < 40; i++) {
      const card = await proposal(sid, "Move $1 from savings to chequing", { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cad: 1, rationale: "" });
      const approvals = await Promise.allSettled([approve(fixture.db, sid, card.action_id, new Date(now.getTime() - 120000)), approve(fixture.db, sid, card.action_id, new Date(now.getTime() - 120000))]);
      expect(approvals.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      if (i % 2 === 0) {
        await Promise.all([executeNow(fixture.db, sid, card.action_id, now), settleDueActions(fixture.db, sid, now)]);
      } else {
        await Promise.allSettled([undo(fixture.db, sid, card.action_id), executeNow(fixture.db, sid, card.action_id, now)]);
      }
      const [state] = await fixture.db.query<{ status: string; count: number }>("select status, (select count(*) from transactions where session_id = $1 and action_id = $2) as count from actions where session_id = $1 and id = $2", [sid, card.action_id]);
      expect(["executed", "cancelled"]).toContain(state.status);
      expect(state.count).toBe(state.status === "executed" ? 2 : 0);
    }
  }, 30000);

  it("uses pending outflows for the next card and enforces demo limits", async () => {
    const sid = await fixture.newSession();
    const first = await proposal(sid, "Pay card $2,000 from savings", { type: "bill_payment", from_account_id: "acc_hisa", bill_id: "bill_card", amount_cad: 2000, rationale: "" });
    await approve(fixture.db, sid, first.action_id, now);
    const second = await proposal(sid, "Pay card $3,500 from savings", { type: "bill_payment", from_account_id: "acc_hisa", bill_id: "bill_card", amount_cad: 3500, rationale: "" });
    expect(second.daily_outflow.used_cents).toBe(200000);
    expect(second.checks.find((check) => check.rule === "R5_daily_limit")?.max_passing_amount_cents).toBe(300000);
    const recipient = await proposal(sid, "Send $400 to Alex", { type: "etransfer", from_account_id: "acc_chequing", contact_id: null, new_recipient_name: "Alex", new_recipient_email: null, amount_cad: 400, memo: null, rationale: "" });
    expect(recipient.max_passing_amount_cents).toBe(30000);
    const other = await fixture.newSession();
    const full = await proposal(other, "Pay my card in full from chequing", { type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_card", amount_cad: 4912.38, rationale: "" });
    expect(full.max_passing_amount_cents).toBe(234012);
  });
});
