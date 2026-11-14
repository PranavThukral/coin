/**
 * Audit of the action service (round 1). Tests that fail are findings; severity in the
 * describe name.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import * as service from "./service";
import { approve, executeNow, proposeAction, settleDueActions, undo } from "./service";

let f: SeededTestDb;
const T0 = new Date("2026-11-15T15:00:00Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

beforeEach(async () => {
  f = await seededTestDb({ today: "2026-11-15" });
}, 30_000);

async function say(sessionId: string, text: string, role: "user" | "assistant" = "user") {
  const [m] = await f.db.query<{ id: string }>(
    "insert into messages (session_id, role, content) values ($1, $2, $3) returning id",
    [sessionId, role, text],
  );
  return m.id;
}

const move2000 = {
  type: "transfer",
  from_account_id: "acc_hisa",
  to_account_id: "acc_chequing",
  amount_cad: 2000,
  rationale: "asked",
};

async function ledgerFor(actionId: string) {
  return f.db.query<{ id: string; description: string; amount_cents: number }>(
    "select id, description, amount_cents from transactions where session_id = $1 and action_id = $2 order by id",
    [f.sessionId, actionId],
  );
}

describe("MEDIUM: Dismiss a proposed card (the UI has a Dismiss button)", () => {
  it("service exports dismiss(db, sessionId, actionId): proposed -> cancelled, audited, never executes", async () => {
    const dismiss = (service as Record<string, unknown>).dismiss as
      | ((db: unknown, sessionId: string, actionId: string) => Promise<{ status: string }>)
      | undefined;
    expect(typeof dismiss).toBe("function");
    const card = await proposeAction(f.db, f.sessionId, await say(f.sessionId, "Move $2,000 from savings to chequing"), move2000);
    const dismissed = await dismiss!(f.db, f.sessionId, card.action_id);
    expect(dismissed.status).toBe("cancelled");
    await expect(approve(f.db, f.sessionId, card.action_id, T0)).rejects.toThrow();
  });
});

describe("LOW: e-transfer ledger rows name the person, not an internal id", () => {
  it("sending to saved contact Sam writes 'Sam Lee' in the description", async () => {
    const msg = await say(f.sessionId, "Send Sam $40");
    const card = await proposeAction(f.db, f.sessionId, msg, {
      type: "etransfer", from_account_id: "acc_chequing", contact_id: "ct_sam",
      new_recipient_name: null, new_recipient_email: null, amount_cad: 40, memo: null, rationale: "",
    });
    await approve(f.db, f.sessionId, card.action_id, T0);
    await executeNow(f.db, f.sessionId, card.action_id, T0);
    const rows = await ledgerFor(card.action_id);
    expect(rows.map((r) => r.description).join(" ")).toMatch(/Sam Lee/);
    expect(rows.map((r) => r.description).join(" ")).not.toMatch(/ct_sam/);
  });
});

describe("Regression guards (should already pass)", () => {
  it("nothing executes before the 60-second window ends; it executes once after", async () => {
    const card = await proposeAction(f.db, f.sessionId, await say(f.sessionId, "Move $2,000 from savings to chequing"), move2000);
    await approve(f.db, f.sessionId, card.action_id, T0);
    expect(await settleDueActions(f.db, f.sessionId, later(59))).toHaveLength(0);
    expect(await ledgerFor(card.action_id)).toHaveLength(0);
    const settled = await settleDueActions(f.db, f.sessionId, later(61));
    expect(settled.map((c) => c.status)).toEqual(["executed"]);
    expect(await settleDueActions(f.db, f.sessionId, later(120))).toHaveLength(0);
    expect(await ledgerFor(card.action_id)).toHaveLength(2);
  });

  it("undo wins over a later Execute now: stays cancelled, no ledger rows", async () => {
    const card = await proposeAction(f.db, f.sessionId, await say(f.sessionId, "Move $2,000 from savings to chequing"), move2000);
    await approve(f.db, f.sessionId, card.action_id, T0);
    await undo(f.db, f.sessionId, card.action_id);
    const after = await executeNow(f.db, f.sessionId, card.action_id, later(5));
    expect(after.status).toBe("cancelled");
    expect(await ledgerFor(card.action_id)).toHaveLength(0);
  });

  it("a request message from another session cannot authorise an action", async () => {
    const other = await f.newSession();
    const foreignMessage = await say(other, "Move $2,000 from savings to chequing");
    await expect(proposeAction(f.db, f.sessionId, foreignMessage, move2000)).rejects.toThrow();
  });

  it("Coin's own message cannot be used as the request", async () => {
    const assistantMessage = await say(f.sessionId, "Move $2,000 from savings to chequing", "assistant");
    await expect(proposeAction(f.db, f.sessionId, assistantMessage, move2000)).rejects.toThrow();
  });

  it("session B settling never touches session A's due action", async () => {
    const other = await f.newSession();
    const card = await proposeAction(f.db, f.sessionId, await say(f.sessionId, "Move $2,000 from savings to chequing"), move2000);
    await approve(f.db, f.sessionId, card.action_id, T0);
    expect(await settleDueActions(f.db, other, later(120))).toHaveLength(0);
    expect(await ledgerFor(card.action_id)).toHaveLength(0);
  });

  it("an approved payload is immutable", async () => {
    const card = await proposeAction(f.db, f.sessionId, await say(f.sessionId, "Move $2,000 from savings to chequing"), move2000);
    await approve(f.db, f.sessionId, card.action_id, T0);
    await expect(
      f.db.query("update actions set payload = jsonb_set(payload, '{amount_cents}', '9999999') where id = $1", [card.action_id]),
    ).rejects.toThrow(/immutable/);
  });
});
