/**
 * A question from Coin and the user's answer are one request. The answer alone
 * names no action and the first message alone names no amount; rules 0 and 8
 * read the two together, and never anything but the user's own words.
 */
import { describe, expect, it } from "vitest";
import {
  RULE_LIMITS, SEED_ACCOUNTS, SEED_BILLS, SEED_CONTACTS, SEED_HOLDINGS, SEED_ROOM, SEED_SECURITIES,
  type Proposal, type RuleContext,
} from "../../contracts";
import { evaluateRules } from "./index";

function context(thread: string[]): RuleContext {
  return {
    user_message: { id: "m", text: thread[thread.length - 1] },
    request_thread: thread,
    accounts: SEED_ACCOUNTS.map((a) => ({ ...a, institution_label: "Coin", opening_balance_cents: a.balance_cents })),
    bills: SEED_BILLS.map((b) => ({ ...b })),
    contacts: SEED_CONTACTS.map((c) => ({ ...c })),
    room: SEED_ROOM.map((r) => ({ ...r })),
    holdings: SEED_HOLDINGS.map((h) => ({ ...h })),
    prices: Object.fromEntries(SEED_SECURITIES.map((s) => [s.ticker, s.as_of_close_cents])),
    daily_used_cents: 0,
    limits: RULE_LIMITS,
    today: "2026-11-15",
    confirmed_recipient_email: null,
  };
}

const toTfsa: Proposal = { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_tfsa", amount_cents: 100_000 };
const toSam: Proposal = {
  type: "etransfer", from_account_id: "acc_chequing", recipient: { kind: "saved", contact_id: "ct_sam" }, amount_cents: 5_000, memo: null,
};
const outcome = (proposal: Proposal, thread: string[], rule: string) =>
  evaluateRules(proposal, context(thread)).checks.find((check) => check.rule === rule)?.outcome;

describe("a bill can be asked for in everyday words", () => {
  const phone: Proposal = { type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_mobile", amount_cents: 6_500 };
  const internet: Proposal = { type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_internet", amount_cents: 8_500 };

  it("\"my phone bill\" is the bill saved as Northstar Mobile", () => {
    expect(evaluateRules(phone, context(["pay my phone bill and my internet bill"])).allowed).toBe(true);
    expect(evaluateRules(internet, context(["pay my phone bill and my internet bill"])).allowed).toBe(true);
  });

  it("a bill nobody named is still not asked for", () => {
    expect(outcome(phone, ["pay my internet bill"], "R0_intent")).toBe("fail");
  });
});

describe("an answer to Coin's question completes the request", () => {
  it("\"put some money into my tfsa\" then \"1000 from savings\" is a request for exactly that", () => {
    const thread = ["put some money into my tfsa", "1000 from savings"];
    expect(evaluateRules(toTfsa, context(thread)).allowed).toBe(true);
  });

  it("\"send Sam some money\" then \"$50\" passes", () => {
    expect(evaluateRules(toSam, context(["send Sam some money", "$50"])).allowed).toBe(true);
  });

  it("the answer alone is still not a request", () => {
    expect(outcome(toTfsa, ["1000 from savings"], "R0_intent")).toBe("fail");
  });

  it("the amount in the answer is the only amount that passes", () => {
    const more: Proposal = { ...toTfsa, amount_cents: 500_000 };
    expect(evaluateRules(more, context(["put some money into my tfsa", "1000 from savings"])).allowed).toBe(false);
  });

  it("backing away is not an answer", () => {
    expect(outcome(toSam, ["send Sam $50", "no, don't send anything"], "R0_intent")).toBe("fail");
  });

  it("a question is not an answer", () => {
    expect(outcome(toSam, ["send Sam $50", "how much is in chequing?"], "R0_intent")).toBe("fail");
  });

  it("an earlier question about the past never becomes a request", () => {
    expect(outcome(toSam, ["why did I send Sam $50 last month", "ok"], "R0_intent")).toBe("fail");
  });

  it("a new request stands on its own words, not on the earlier message", () => {
    const thread = ["send Alex some money", "move $1,000 from savings to my tfsa"];
    expect(evaluateRules(toTfsa, context(thread)).allowed).toBe(true);
    expect(outcome(toSam, thread, "R0_intent")).toBe("fail");
  });
});
