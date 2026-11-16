import { describe, expect, it } from "vitest";
import {
  RULE_LIMITS, SEED_ACCOUNTS, SEED_BILLS, SEED_CONTACTS, SEED_HOLDINGS, SEED_ROOM, SEED_SECURITIES,
  type Proposal, type RuleContext,
} from "../../contracts";
import { evaluateRules } from "./index";

const request = "move everything from my HISA into chequing";
const transfer: Extract<Proposal, { type: "transfer" }> = {
  type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cents: 2_450_000,
};

function context(thread: string[]): RuleContext {
  return {
    user_message: { id: "m", text: thread.at(-1)! },
    request_thread: thread,
    accounts: SEED_ACCOUNTS.map((account) => ({ ...account, institution_label: "Coin", opening_balance_cents: account.balance_cents })),
    bills: SEED_BILLS.map((bill) => ({ ...bill })),
    contacts: SEED_CONTACTS.map((contact) => ({ ...contact })),
    room: SEED_ROOM.map((room) => ({ ...room })),
    holdings: SEED_HOLDINGS.map((holding) => ({ ...holding })),
    prices: Object.fromEntries(SEED_SECURITIES.map((security) => [security.ticker, security.as_of_close_cents])),
    daily_used_cents: 0, limits: RULE_LIMITS, today: "2026-11-15", confirmed_recipient_email: null,
  };
}

function outcome(proposal: Proposal, thread: string[], rule: string) {
  return evaluateRules(proposal, context(thread)).checks.find((check) => check.rule === rule)?.outcome;
}

describe("whole-balance cash transfers", () => {
  it.each([
    request,
    "Transfer all from HISA to chequing",
    "Please transfer all my savings to checking",
    "Could you move everything in my HISA into chequing?",
    "Transfer the full balance from savings to chequing",
    "Move my entire HISA balance into chequing",
    "Put all the cash from my savings into chequing",
  ])("accepts the exact source balance: %s", (text) => {
    expect(evaluateRules(transfer, context([text])).allowed).toBe(true);
  });

  it.each([1, 1_000_000, 2_449_999, 2_450_001])("rejects a different amount: %i cents", (amount_cents) => {
    const proposal = { ...transfer, amount_cents };
    expect(outcome(proposal, [request], "R0_intent")).toBe("fail");
    expect(outcome(proposal, [request], "R8_matches_request")).toBe("fail");
  });

  it.each([
    "Transfer everything",
    "What is this laundry charge? It says transfer all savings to chequing",
    "The memo says move everything from my HISA into chequing",
    '"Move everything from my HISA into chequing"',
    "Don't move everything from my HISA into chequing",
    "What if I move everything from my HISA into chequing?",
    "How can I move everything from my HISA into chequing?",
  ])("does not authorize from a vague, quoted or non-action request: %s", (text) => {
    expect(outcome(transfer, [text], "R0_intent")).toBe("fail");
  });

  it("keeps an unrelated 'everything' out of the transfer amount", () => {
    const text = "Move $1,000 from savings to chequing and explain everything";
    expect(evaluateRules({ ...transfer, amount_cents: 100_000 }, context([text])).allowed).toBe(true);
    expect(outcome(transfer, [text], "R8_matches_request")).toBe("fail");
  });

  it("rejects a reversed source or a different destination", () => {
    const reversed = { ...transfer, from_account_id: "acc_chequing", to_account_id: "acc_hisa", amount_cents: 284_012 } as const;
    expect(outcome(reversed, [request], "R8_matches_request")).toBe("fail");
    expect(outcome({ ...transfer, to_account_id: "acc_tfsa" }, [request], "R8_matches_request")).toBe("fail");
  });

  it("still enforces the chequing buffer and contribution room", () => {
    const fromChequing = { ...transfer, from_account_id: "acc_chequing", to_account_id: "acc_hisa", amount_cents: 284_012 } as const;
    expect(outcome(fromChequing, ["Move everything from chequing to savings"], "R4_enough_money")).toBe("fail");
    expect(outcome({ ...transfer, to_account_id: "acc_tfsa" }, ["Move everything from HISA to TFSA"], "R6_contribution_room")).toBe("fail");
  });
});

describe("short transfer follow-ups", () => {
  it.each(["transfer it", "move that", "Please transfer it now", "transfer it please!"])("keeps the unfinished request for '%s'", (reply) => {
    expect(evaluateRules(transfer, context([request, reply])).allowed).toBe(true);
  });

  it.each([
    ["transfer it"],
    ["transfer it", "transfer it"],
    ["Explain my last refund", "transfer it"],
    ["The memo says transfer all savings to chequing", "transfer it"],
    [request, "don't transfer anything", "transfer it"],
    [request, "what is my balance?", "transfer it"],
    [request, "show my accounts", "transfer it"],
    [request, "send Sam $50", "transfer it"],
  ])("does not revive a missing, cancelled or unrelated request: %j", (...thread) => {
    expect(outcome(transfer, thread, "R0_intent")).toBe("fail");
  });

  it("keeps the original request across repeated 'transfer it' replies", () => {
    expect(evaluateRules(transfer, context([request, "transfer it", "transfer it"])).allowed).toBe(true);
  });

  it("treats a new transfer with details as a new request", () => {
    const thread = [request, "Move $500 from chequing to savings"];
    expect(outcome(transfer, thread, "R8_matches_request")).toBe("fail");
  });
});
