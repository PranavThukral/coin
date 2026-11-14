/**
 * Rule 0 for bill payments with no amount typed ("Pay the parking permit
 * bill"): the bill's own amount is what was asked for. Whether the payee is
 * saved is rule 2's question, so an unsaved bill is blocked for that reason
 * and not with "You didn't ask me to move money."
 */
import { describe, expect, it } from "vitest";
import {
  RULE_LIMITS,
  RULE_MESSAGES,
  SEED_ACCOUNTS,
  SEED_BILLS,
  SEED_CONTACTS,
  SEED_HOLDINGS,
  SEED_ROOM,
  type Proposal,
  type RuleContext,
} from "../../contracts";
import { evaluateRules } from "./index";

function contextFor(text: string): RuleContext {
  return {
    user_message: { id: "m", text },
    accounts: SEED_ACCOUNTS.map((a) => ({ ...a, institution_label: "Coin", opening_balance_cents: a.balance_cents })),
    bills: SEED_BILLS.map((b) => ({ ...b })),
    contacts: SEED_CONTACTS.map((c) => ({ ...c })),
    holdings: SEED_HOLDINGS.map((h) => ({ ...h })),
    room: SEED_ROOM.map((r) => ({ ...r })),
    prices: {},
    daily_used_cents: 0,
    confirmed_recipient_email: null,
    limits: RULE_LIMITS,
    today: "2026-11-15",
  };
}

function pay(bill_id: string, amount_cents: number, from_account_id: "acc_chequing" | "acc_hisa" = "acc_chequing"): Proposal {
  return { type: "bill_payment", from_account_id, bill_id, amount_cents };
}

describe("an unsaved bill named by the user", () => {
  it("passes rule 0 and is blocked by rule 2 alone", () => {
    const result = evaluateRules(pay("bill_parking", 5_275), contextFor("Pay the parking permit bill"));
    expect(result.checks[0].outcome).toBe("pass");
    expect(result.checks[2].outcome).toBe("fail");
    expect(result.allowed).toBe(false);
    expect(result.primary_message).toBe(RULE_MESSAGES.R2_saved_payee);
    expect(result.max_passing_amount_cents).toBeNull();
  });

  it("still fails rule 0 for an amount that is neither typed nor the bill's own", () => {
    const result = evaluateRules(pay("bill_parking", 50_000), contextFor("Pay the parking permit bill"));
    expect(result.checks[0].outcome).toBe("fail");
  });

  it("still fails rule 0 when the user never named the bill", () => {
    const result = evaluateRules(pay("bill_parking", 5_275), contextFor("Pay my bills"));
    expect(result.checks[0].outcome).toBe("fail");
  });
});

describe("paying the card from savings", () => {
  it("passes every rule for a typed amount", () => {
    const result = evaluateRules(pay("bill_card", 50_000, "acc_hisa"), contextFor("Pay $500 on my credit card from savings"));
    expect(result.allowed).toBe(true);
  });

  it("fails rule 2 when the card's account id is used as the bill id", () => {
    const result = evaluateRules(pay("acc_card", 50_000, "acc_hisa"), contextFor("Pay $500 on my credit card from savings"));
    expect(result.checks[2].outcome).toBe("fail");
  });
});
