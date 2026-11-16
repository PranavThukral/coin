import { describe, expect, it } from "vitest";
import { extractRequestEntities } from "../rules/extract";
import { followUps } from "./follow-ups";

const affordability = (requests: string[]) => ({
  name: "check_affordability",
  result: { untrusted_data_note: "data", data: { suggested_requests: requests } },
});

describe("followUps", () => {
  it("puts a request a tool worked out from balances first", () => {
    const [first] = followUps([affordability(["Move $900 from savings to chequing"])], "can I afford a laptop");
    expect(first).toBe("Move $900 from savings to chequing");
  });

  it("offers only questions when no tool worked out a request", () => {
    expect(followUps([affordability([])], "x").join(" ")).not.toContain("Move");
  });

  it("offers nothing when a card or plan is already on screen", () => {
    expect(followUps([{ name: "propose_action", result: {} }], "pay hydro")).toEqual([]);
    const rest = { name: "plan_card_payoff", result: { suggested_requests: ["Move $2,600 from savings to chequing"] } };
    expect(followUps([{ name: "propose_action", result: {} }, rest], "pay off my card")).toEqual(["Move $2,600 from savings to chequing"]);
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
