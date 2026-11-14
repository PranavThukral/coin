/**
 * The "Use $X instead" button must produce a request the rule engine accepts
 * for exactly the offered amount (and nothing else).
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
  type ActionCard,
  type Proposal,
  type RuleContext,
} from "../contracts";
import { evaluateRules } from "../server/rules";
import { insteadMessage, plainLabel } from "./instead";

const ctx = (text: string): RuleContext => ({
  user_message: { id: "m", text },
  accounts: SEED_ACCOUNTS.map((a) => ({ ...a, institution_label: "Coin Bank", opening_balance_cents: 0 })),
  bills: SEED_BILLS.map((b) => ({ ...b })),
  contacts: SEED_CONTACTS.map((c) => ({ ...c })),
  room: SEED_ROOM.map((r) => ({ ...r })),
  holdings: SEED_HOLDINGS.map((h) => ({ ...h })),
  prices: Object.fromEntries(SEED_SECURITIES.map((s) => [s.ticker, s.as_of_close_cents])),
  daily_used_cents: 0,
  limits: RULE_LIMITS,
  today: "2026-11-15",
  confirmed_recipient_email: null,
});

const card = (over: Partial<ActionCard>) => ({ title: "", from_label: null, to_label: null, ...over }) as ActionCard;

describe("plainLabel", () => {
  it("drops masks and the new-recipient tag", () => {
    expect(plainLabel("Rewards Credit Card ••3019")).toBe("Rewards Credit Card");
    expect(plainLabel("Alex (new recipient)")).toBe("Alex");
    expect(plainLabel("Everyday Chequing")).toBe("Everyday Chequing");
  });
});

describe("Use $X instead passes the rules at the offered amount", () => {
  it("card payment blocked by the buffer -> $2,340.12", () => {
    const text = insteadMessage(
      card({ type: "bill_payment", from_label: "Everyday Chequing", to_label: "Rewards Credit Card ••3019" }),
      234_012,
    );
    const proposal: Proposal = { type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_card", amount_cents: 234_012 };
    const result = evaluateRules(proposal, ctx(text));
    expect(result.allowed, `${text}\n${JSON.stringify(result.checks.filter((c) => c.outcome === "fail"))}`).toBe(true);
  });

  it("new recipient over the cap -> $300 to Alex (flagged for confirmation, not blocked)", () => {
    const text = insteadMessage(
      card({ type: "etransfer", from_label: "Everyday Chequing", to_label: "Alex (new recipient)" }),
      30_000,
    );
    const proposal: Proposal = {
      type: "etransfer",
      from_account_id: "acc_chequing",
      recipient: { kind: "new", name: "Alex", email: null },
      amount_cents: 30_000,
      memo: null,
    };
    const result = evaluateRules(proposal, ctx(text));
    expect(result.allowed, text).toBe(true);
    expect(result.requires_second_confirmation).toBe(true);
  });

  it("TFSA contribution over room -> $3,500 from savings", () => {
    const text = insteadMessage(card({ type: "transfer", from_label: "High-Interest Savings", to_label: "TFSA" }), 350_000);
    const proposal: Proposal = { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_tfsa", amount_cents: 350_000 };
    expect(evaluateRules(proposal, ctx(text)).allowed, text).toBe(true);
  });

  it("the new message never authorises a different amount", () => {
    const text = insteadMessage(card({ type: "transfer", from_label: "High-Interest Savings", to_label: "TFSA" }), 350_000);
    const bigger: Proposal = { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_tfsa", amount_cents: 350_001 };
    expect(evaluateRules(bigger, ctx(text)).allowed).toBe(false);
  });
});
