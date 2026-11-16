/**
 * The ways to pay the card are worked out from what each account can really
 * afford, and each way's one-tap request is one the rules accept as asked.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { proposeAction } from "../actions/service";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { checkAffordability } from "./affordability";
import { loadCardPayoff } from "./payoff";

let f: SeededTestDb;

beforeAll(async () => {
  f = await seededTestDb();
}, 30_000);

async function say(text: string): Promise<string> {
  const [row] = await f.db.query<{ id: string }>(
    "insert into messages (session_id, role, content) values ($1, 'user', $2) returning id",
    [f.sessionId, text],
  );
  return row.id;
}

describe("loadCardPayoff", () => {
  it("knows chequing can't cover the statement today, and by how much", async () => {
    const payoff = await loadCardPayoff(f.db, f.sessionId);
    expect(payoff.statement_cents).toBe(491_238);
    expect(payoff.chequing_spare_cents).toBe(234_012); // $2,840.12 less the $500 buffer
    expect(payoff.short_today_cents).toBe(257_226);
  });

  it("offers payday, savings, a part payment and a sale, each with its own figures", async () => {
    const { ways } = await loadCardPayoff(f.db, f.sessionId);
    expect(ways.map((way) => way.id)).toEqual(["after_payday", "move_from_savings", "pay_part_now", "sell_investments"]);
    const summary = (id: string) => ways.find((way) => way.id === id)!.summary;
    expect(summary("after_payday")).toContain("leaves chequing at $1,198.06");
    expect(summary("move_from_savings")).toContain("move $2,600 from High-Interest Savings");
    expect(summary("move_from_savings")).toContain("$21,900.00 left");
    expect(summary("pay_part_now")).toContain("Pay $2,340.12 now and the other $2,572.26 later");
    expect(summary("sell_investments")).toContain("taxable");
  });

  it("warns about the squeeze that follows: rent before the next payday", async () => {
    const { watch_out: warning } = await loadCardPayoff(f.db, f.sessionId);
    expect(warning).toContain("Kingsway Property Management");
    expect(warning).toContain("-$1,355.94");
    expect(warning).toContain("Moving $1,900 from savings");
  });

  it("affordability works out the transfer that would cover a purchase chequing can't", async () => {
    const result = await checkAffordability(f.db, f.sessionId, 150_000, f.today);
    expect(result.shortfall_cents).toBe(80_194);
    expect(result.suggested_requests).toEqual(["Move $900 from savings to chequing"]);
    expect((await checkAffordability(f.db, f.sessionId, 5_000, f.today)).suggested_requests).toEqual([]);
  });

  it("never suggests paying today from an account that can't afford it", async () => {
    const { ways } = await loadCardPayoff(f.db, f.sessionId);
    expect(ways.some((way) => way.id === "pay_today")).toBe(false);
  });

  it("each one-tap request is accepted by the rules as a request for exactly that", async () => {
    const move = await proposeAction(f.db, f.sessionId, await say("Move $2,600 from savings to chequing"), {
      type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cad: 2600, rationale: "",
    });
    expect(move.status).toBe("proposed");
    const part = await proposeAction(f.db, f.sessionId, await say("Pay $2,340.12 on my credit card"), {
      type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_card", amount_cad: 2340.12, rationale: "",
    });
    expect(part.status).toBe("proposed");
  });
});
