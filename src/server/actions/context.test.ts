import { describe, expect, it } from "vitest";
import { seededTestDb } from "../db/test-db";
import { dailyOutflow, loadRuleContext } from "./context";

describe("action rule context", () => {
  it("loads the stored user message, shifted prices, and session data", async () => {
    const { db, sessionId, today, newSession } = await seededTestDb({ today: "2027-01-05" });
    const other = await newSession();
    const [message] = await db.query<{ id: string }>(
      "insert into messages (session_id, role, content) values ($1, 'user', $2) returning id",
      [sessionId, "Move $100 from savings to chequing"],
    );
    const context = await loadRuleContext(db, sessionId, message.id);
    expect(context.user_message.text).toBe("Move $100 from savings to chequing");
    expect(context.today).toBe(today);
    expect(context.prices["NRTH.CX"]).toBeGreaterThan(0);
    expect(context.accounts).toHaveLength(6);
    await expect(loadRuleContext(db, other, message.id)).rejects.toThrow("User message not found");
  });

  it("counts today's pending and executed outflow and excludes the evaluated action", async () => {
    const { db, sessionId, today } = await seededTestDb({ today: "2027-01-05" });
    const [message] = await db.query<{ id: string }>(
      "insert into messages (session_id, role, content) values ($1, 'user', 'Pay card $100') returning id",
      [sessionId],
    );
    const payload = JSON.stringify({ type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_card", amount_cents: 10000 });
    const [action] = await db.query<{ id: string }>(
      `insert into actions (session_id, request_message_id, type, payload, status, checks,
        created_at, approved_at, execute_at)
       values ($1, $2, 'bill_payment', $3, 'pending_undo', '[]', $4::date + interval '12 hours', now(), now()) returning id`,
      [sessionId, message.id, payload, today],
    );
    const result = await dailyOutflow(db, sessionId);
    expect(result.used_cents).toBe(10000);
    expect(result.pending_cents).toBe(10000);
    expect(result.items[0].action_id).toBe(action.id);
    expect((await loadRuleContext(db, sessionId, message.id, action.id)).daily_used_cents).toBe(0);
  });
});
