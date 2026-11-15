/**
 * The sale planner: code picks holdings for a sale the user asked for without
 * naming them, every step still passes the rules, and nothing in it can be
 * authorized by anything but the user's own messages.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ActionCard } from "../../contracts";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { planSale } from "./planner";
import { approve, executeNow } from "./service";

let f: SeededTestDb;

beforeEach(async () => {
  f = await seededTestDb();
}, 30_000);

async function say(text: string): Promise<string> {
  const [row] = await f.db.query<{ id: string }>(
    "insert into messages (session_id, role, content) values ($1, 'user', $2) returning id",
    [f.sessionId, text],
  );
  return row.id;
}

async function balance(id: string): Promise<number> {
  const [row] = await f.db.query<{ balance_cents: number }>(
    "select balance_cents from accounts where session_id = $1 and id = $2", [f.sessionId, id],
  );
  return row.balance_cents;
}

const total = (cards: ActionCard[], type: string) =>
  cards.filter((card) => card.type === type).reduce((sum, card) => sum + (card.amount_cents ?? 0), 0);

const COVER_CARD = { account_ids: ["acc_nonreg"], raise_cad: 4912.38, method: "equal", move_proceeds_to: "acc_chequing" };

describe("planSale", () => {
  it("covers the card: sells across holdings, then moves the proceeds, all approvable", async () => {
    await say("Pay off my credit card");
    const id = await say("Sell enough of my personal investments to cover the amount and transfer the money into chequing");
    const { cards, output } = await planSale(f.db, f.sessionId, id, COVER_CARD);
    expect(output.outcome).toBe("plan_shown_for_approval");
    const sales = cards.filter((card) => card.type === "trade");
    expect(sales).toHaveLength(4);
    expect(cards.every((card) => card.status === "proposed" && card.origin === "plan")).toBe(true);
    expect(total(cards, "trade")).toBeGreaterThanOrEqual(491_238);
    expect(total(cards, "transfer")).toBe(total(cards, "trade"));
  });

  it("executes in order: chequing rises by exactly what the sales raised", async () => {
    await say("Pay off my credit card");
    const id = await say("Sell enough of my personal investments to cover it and move it to chequing");
    const { cards } = await planSale(f.db, f.sessionId, id, COVER_CARD);
    const before = await balance("acc_chequing");
    const now = new Date();
    for (const card of cards) await approve(f.db, f.sessionId, card.action_id, now);
    for (const card of cards) {
      const done = await executeNow(f.db, f.sessionId, card.action_id, now);
      expect(done.status).toBe("executed");
    }
    expect(await balance("acc_chequing")).toBe(before + total(cards, "trade"));
  });

  it("a transfer executed before its sales is blocked: the cash isn't there yet", async () => {
    await say("Pay off my credit card");
    const id = await say("Sell enough of my personal investments to cover it and move it to chequing");
    const { cards } = await planSale(f.db, f.sessionId, id, COVER_CARD);
    const transfer = cards.find((card) => card.type === "transfer")!;
    const now = new Date();
    await approve(f.db, f.sessionId, transfer.action_id, now);
    const done = await executeNow(f.db, f.sessionId, transfer.action_id, now);
    expect(done.status).toBe("blocked");
  });

  it("refuses an amount the user never gave", async () => {
    const id = await say("Sell some of my personal investments");
    const { cards, output } = await planSale(f.db, f.sessionId, id, { ...COVER_CARD, raise_cad: 9000 });
    expect(cards).toHaveLength(0);
    expect(output.outcome).toBe("not_planned");
  });

  it("a question is not a request: every step is blocked by rule 0", async () => {
    const id = await say("What if I sold $2,000 of my personal investments?");
    const { cards } = await planSale(f.db, f.sessionId, id, { ...COVER_CARD, raise_cad: 2000, move_proceeds_to: null });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.status === "blocked")).toBe(true);
    expect(cards[0].checks.find((check) => check.rule === "R0_intent")?.outcome).toBe("fail");
  });

  it("stays inside the account the user named", async () => {
    const id = await say("Sell $2,000 from my TFSA");
    const { cards } = await planSale(f.db, f.sessionId, id, { ...COVER_CARD, raise_cad: 2000, move_proceeds_to: null });
    expect(cards.every((card) => card.status === "blocked")).toBe(true);
    expect(cards[0].checks.find((check) => check.rule === "R8_matches_request")?.outcome).toBe("fail");
  });

  it("selling everything explains the risks first, then plans once the user confirms", async () => {
    const all = { account_ids: ["acc_tfsa", "acc_rrsp", "acc_nonreg"], raise_cad: null, method: "proportional", move_proceeds_to: "acc_chequing" };
    const first = await say("Sell off my entire portfolio and move into chequing");
    const asked = await planSale(f.db, f.sessionId, first, all);
    expect(asked.cards).toHaveLength(0);
    expect(asked.output.outcome).toBe("needs_confirmation");
    expect(String(asked.output.risks)).toContain("taxable");

    const second = await say("Yes, sell all of it");
    const { cards } = await planSale(f.db, f.sessionId, second, all);
    const sales = cards.filter((card) => card.type === "trade");
    expect(sales).toHaveLength(11);
    expect(sales.every((card) => card.status === "proposed")).toBe(true);
    // The RRSP can't be withdrawn from, so only two accounts move their proceeds.
    expect(cards.filter((card) => card.type === "transfer")).toHaveLength(2);
  });

  it("backing away after the risks stops the plan", async () => {
    const all = { account_ids: ["acc_nonreg"], raise_cad: null, method: "proportional", move_proceeds_to: null };
    await planSale(f.db, f.sessionId, await say("Sell everything in my personal account"), all);
    const { cards } = await planSale(f.db, f.sessionId, await say("No, don't sell anything"), all);
    expect(cards.every((card) => card.status === "blocked")).toBe(true);
  });
});
