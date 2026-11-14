/**
 * Rule 8 for trades: the security and the size must come from the user's own
 * words. Before this, any message with a verb like "invest" let the model pick
 * the ticker and the share count, which text planted in the data could steer.
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
} from "../../contracts";
import { evaluateRules, extractRequestEntities } from "./index";

const PRICES = Object.fromEntries(SEED_SECURITIES.map((s) => [s.ticker, s.as_of_close_cents]));

function contextFor(text: string): RuleContext {
  return {
    user_message: { id: "m", text },
    accounts: SEED_ACCOUNTS.map((a) => ({ ...a, institution_label: "Coin", opening_balance_cents: a.balance_cents })),
    bills: SEED_BILLS.map((b) => ({ ...b })),
    contacts: SEED_CONTACTS.map((c) => ({ ...c })),
    holdings: SEED_HOLDINGS.map((h) => ({ ...h })),
    room: SEED_ROOM.map((r) => ({ ...r })),
    prices: PRICES,
    daily_used_cents: 0,
    confirmed_recipient_email: null,
    limits: RULE_LIMITS,
    today: "2026-11-15",
  };
}

function trade(side: "buy" | "sell", ticker: string, quantity: number): Proposal {
  return { type: "trade", account_id: "acc_tfsa", side, ticker, quantity, price_cents: PRICES[ticker] };
}

function rule8(text: string, proposal: Proposal): string {
  return evaluateRules(proposal, contextFor(text)).checks[8].outcome;
}

describe("rule 8: the user names the security", () => {
  it.each([
    ["Buy 5 shares of NRTH.CX in my TFSA", "NRTH.CX"],
    ["Buy 5 shares of NRTH in my TFSA", "NRTH.CX"],
    ["buy 5 shares of northwind in my tfsa", "NRTH.CX"],
    ["Buy 5 shares of the Canadian equity ETF in my TFSA", "CAEQ.CX"],
    ["Buy 5 shares of the US total market ETF in my TFSA", "USEQ.CX"],
    ["Buy 5 shares of the bond ETF in my TFSA", "BOND.CX"],
  ])("passes: %s", (text, ticker) => {
    expect(rule8(text, trade("buy", ticker, 5))).toBe("pass");
  });

  it.each([
    ["I want to invest more in my TFSA", "NRTH.CX"],
    ["Buy 5 shares of Northwind in my TFSA", "ORCA.CX"],
    ["Buy 5 shares of an ETF in my TFSA", "CAEQ.CX"],
    ["Buy us 5 shares of Orca in my TFSA", "USEQ.CX"],
    ["Buy 5 shares of my biggest holding in my TFSA", "NRTH.CX"],
  ])("fails when the security is the model's pick: %s", (text, ticker) => {
    expect(rule8(text, trade("buy", ticker, 5))).toBe("fail");
  });
});

describe("rule 8: the user says how much", () => {
  it("fails when no share count or dollar budget was typed", () => {
    expect(rule8("Buy some Northwind in my TFSA", trade("buy", "NRTH.CX", 5))).toBe("fail");
  });

  it("accepts a bare count in front of the ticker", () => {
    expect(rule8("Buy 5 NRTH.CX in my TFSA", trade("buy", "NRTH.CX", 5))).toBe("pass");
    expect(rule8("Buy 5 NRTH in my TFSA", trade("buy", "NRTH.CX", 5))).toBe("pass");
    expect(rule8("Buy 5 NRTH in my TFSA", trade("buy", "NRTH.CX", 6))).toBe("fail");
  });

  it("sells the whole position on 'all', and only the whole position", () => {
    const held = SEED_HOLDINGS.find((h) => h.account_id === "acc_tfsa" && h.ticker === "NRTH.CX")!.quantity;
    expect(rule8("Sell all my Northwind in my TFSA", trade("sell", "NRTH.CX", held))).toBe("pass");
    expect(rule8("Sell all my Northwind in my TFSA", trade("sell", "NRTH.CX", held - 1))).toBe("fail");
    expect(rule8("Buy all the Northwind I can in my TFSA", trade("buy", "NRTH.CX", 6))).toBe("fail");
  });

  it("reads a dollar figure as a budget for buys and sells", () => {
    // NRTH.CX closes at $182.40: $2,000 covers 10 whole shares.
    expect(rule8("Sell $2,000 of NRTH.CX in my TFSA", trade("sell", "NRTH.CX", 10))).toBe("pass");
    expect(rule8("Sell $2,000 of NRTH.CX in my TFSA", trade("sell", "NRTH.CX", 11))).toBe("fail");
    expect(rule8("Buy $2,000 of NRTH.CX in my TFSA", trade("buy", "NRTH.CX", 10))).toBe("pass");
  });

  it("still fails when a typed budget disagrees with the typed share count", () => {
    expect(rule8("Buy 10 shares of NRTH.CX with $500 in my TFSA", trade("buy", "NRTH.CX", 10))).toBe("fail");
  });
});

describe("share counts in the user's message", () => {
  it.each([
    ["buy 10 NRTH.CX", [10], []],
    ["buy 10 nrth", [10], []],
    ["buy 1,000 shares of BOND.CX", [1000], []],
    ["buy 3 units of CAEQ.CX", [3], []],
    ["buy $10 of NRTH.CX", [], [1000]],
    ["buy 2.5 NRTH.CX", [], [250]],
  ])("%s", (text, quantities, amounts) => {
    const entities = extractRequestEntities(text);
    expect(entities.quantities).toEqual(quantities);
    expect(entities.amounts_cents).toEqual(amounts);
  });
});
