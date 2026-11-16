import { describe, expect, it } from "vitest";
import { extractRequestEntities } from "../rules/extract";
import { followUps } from "./follow-ups";

const affordability = (shortfall: number, savings: number) => ({
  name: "check_affordability",
  result: { untrusted_data_note: "data", data: { shortfall_cents: shortfall, savings_balance_cents: savings } },
});

describe("followUps", () => {
  it("offers to cover a shortfall from savings, rounded up to a round amount", () => {
    const [first] = followUps([affordability(80_194, 2_450_000)], "can I afford a laptop");
    expect(first).toBe("Move $900 from savings to chequing");
  });

  it("doesn't offer a transfer savings can't cover, or when nothing is short", () => {
    expect(followUps([affordability(80_194, 50_000)], "x").join(" ")).not.toContain("Move");
    expect(followUps([affordability(0, 2_450_000)], "x").join(" ")).not.toContain("Move");
  });

  it("offers nothing when a card or plan is already on screen", () => {
    expect(followUps([{ name: "propose_action", result: {} }], "pay hydro")).toEqual([]);
    expect(followUps([{ name: "get_holdings", result: {} }, { name: "plan_sale", result: {} }], "sell")).toEqual([]);
  });

  it("gives a first-time visitor somewhere to start, and never echoes the question just asked", () => {
    expect(followUps([], "hi")).toHaveLength(3);
    expect(followUps([], "What bills are coming up?")).not.toContain("What bills are coming up?");
  });

  it("apart from covering a shortfall, every suggestion is a question that asks for no action", () => {
    const tools = ["summarize_spending", "compare_spending", "get_cash_flow", "get_upcoming", "get_money_snapshot",
      "get_portfolio_performance", "get_holdings", "get_subscriptions", "plan_savings_goal", "check_affordability"];
    for (const name of tools) {
      for (const suggestion of followUps([{ name, result: {} }], "")) {
        expect(extractRequestEntities(suggestion).has_action_intent, suggestion).toBe(false);
      }
    }
  });
});
