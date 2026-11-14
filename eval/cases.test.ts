/**
 * Sanity checks on the eval set itself: right counts per group, unique ids,
 * and every "should pass" / "should block" case agrees with the real rule
 * engine on seed data. If these fail, the eval set is wrong, not Coin.
 */
import { describe, expect, it } from "vitest";
import {
  RULE_LIMITS,
  SEED_ACCOUNTS,
  SEED_BILLS,
  SEED_CONTACTS,
  SEED_HOLDINGS,
  SEED_ROOM,
  SEED_SECURITIES,
  type Proposal,
  type RuleContext,
} from "../src/contracts";
import { evaluateRules } from "../src/server/rules";
import { CASES, type ProposalMatch } from "./cases";

const prices = Object.fromEntries(SEED_SECURITIES.map((s) => [s.ticker, s.as_of_close_cents]));

const ctx = (text: string): RuleContext => ({
  user_message: { id: "m", text },
  accounts: SEED_ACCOUNTS.map((a) => ({ ...a, institution_label: "Coin Bank", opening_balance_cents: 0 })),
  bills: SEED_BILLS.map((b) => ({ ...b })),
  contacts: SEED_CONTACTS.map((c) => ({ ...c })),
  room: SEED_ROOM.map((r) => ({ ...r })),
  holdings: SEED_HOLDINGS.map((h) => ({ ...h })),
  prices,
  daily_used_cents: 0,
  limits: RULE_LIMITS,
  today: "2026-11-15",
  confirmed_recipient_email: null,
});

/** The proposal a correct model would make for a passing case. */
function intended(match: ProposalMatch): Proposal {
  switch (match.type) {
    case "transfer":
      return { type: "transfer", from_account_id: match.from_account_id!, to_account_id: match.to_account_id!, amount_cents: match.amount_cents! };
    case "bill_payment":
      return { type: "bill_payment", from_account_id: match.from_account_id ?? "acc_chequing", bill_id: match.bill_id!, amount_cents: match.amount_cents! };
    case "etransfer":
      return {
        type: "etransfer",
        from_account_id: "acc_chequing",
        recipient: match.new_recipient ? { kind: "new", name: "Taylor", email: "taylor.k@example.com" } : { kind: "saved", contact_id: match.contact_id! },
        amount_cents: match.amount_cents!,
        memo: null,
      };
    case "trade":
      return { type: "trade", account_id: match.account_id as "acc_tfsa", side: match.side!, ticker: match.ticker!, quantity: match.quantity!, price_cents: prices[match.ticker!] };
  }
}

describe("eval set shape", () => {
  it("has 40 cases in the brief's proportions with unique ids", () => {
    const count = (group: string) => CASES.filter((c) => c.group === group).length;
    expect(CASES).toHaveLength(40);
    expect([count("question"), count("action_pass"), count("action_block"), count("injection"), count("ambiguous")]).toEqual([12, 8, 8, 6, 6]);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(40);
  });
});

describe("passing cases really pass the rules", () => {
  for (const c of CASES.filter((x) => x.group === "action_pass")) {
    it(`${c.id}: ${c.prompt}`, () => {
      const result = evaluateRules(intended(c.expect.proposal!), ctx(c.prompt));
      expect(result.allowed, JSON.stringify(result.checks.filter((k) => k.outcome === "fail"))).toBe(true);
    });
  }
});
