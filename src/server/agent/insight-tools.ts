/**
 * Coin's bigger-picture tools: cash flow, a typical month, the card, goals and
 * what moved net worth. They sit beside the contract's tools (ToolInputs)
 * without changing the contract: each has its own input schema here, and each
 * may draw its own chart, built from an existing chart kind.
 *
 * Like every read tool, they only read. Merchant names in their output are
 * marked as untrusted data.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dollarsToCents, UNTRUSTED_NOTE, type ChartPayload } from "../../contracts";
import * as q from "../db/queries";
import type { Tx } from "../db/types";
import { AppError } from "../errors";
import {
  loadCashFlow,
  loadCategoryPace,
  loadGoalPlan,
  loadNetWorthChange,
  loadSnapshot,
  type CategoryPace,
  type GoalPlan,
  type MonthFlow,
} from "../tools/insights";
import { loadCardPayoff } from "../tools/payoff";
import { recurringCharges } from "../tools/recurring";

export const InsightToolInputs = {
  get_money_snapshot: z.object({}),
  get_cash_flow: z.object({ months: z.int().min(1).max(24), chart: z.boolean() }),
  get_category_pace: z.object({ chart: z.boolean() }),
  get_subscriptions: z.object({}),
  plan_savings_goal: z.object({ target_cad: z.number().positive().max(10_000_000), chart: z.boolean() }),
  explain_net_worth_change: z.object({ months: z.int().min(1).max(24) }),
  plan_card_payoff: z.object({}),
} as const;
export type InsightToolName = keyof typeof InsightToolInputs;

export const INSIGHT_TOOL_DESCRIPTIONS: Record<InsightToolName, string> = {
  get_money_snapshot:
    "The whole picture in one call: net worth, cash, investments, the credit card (owed, limit, utilisation, what to pay by the due date to avoid interest), a typical month's income, spending and savings rate, and how many months of spending the cash covers.",
  get_cash_flow:
    "Money in vs money out for each of the last N months, with savings and savings rate, plus the typical month. chart: true also shows an income vs spending chart.",
  get_category_pace:
    "A budget check: this month's spending per category beside a typical month (the average of the last three). chart: true also shows the comparison chart.",
  get_subscriptions: "Every subscription and recurring charge still active, with what each costs per month and the total.",
  plan_savings_goal:
    "How long it takes to save a target amount at the typical monthly saving, and the month it is reached. chart: true also shows the path.",
  explain_net_worth_change:
    "What moved net worth over the last N months: cash, investment contributions vs market gains, and card debt.",
  plan_card_payoff:
    "The real ways to pay the credit card statement, checked against what each account can afford: wait for payday, "
    + "move money from savings, pay part now, or sell investments, with the amounts and what each leaves. "
    + "Use for any 'how do I pay my card' question and before suggesting where a card payment should come from.",
};

export function isInsightTool(name: string): name is InsightToolName {
  return name in InsightToolInputs;
}

export interface InsightResult {
  output: unknown;
  /** Shown to the user when the model asked for it. */
  chart: ChartPayload | null;
}

type ChartParts = Pick<ChartPayload, "source" | "kind" | "title" | "x" | "series" | "data">;

function chartOf(parts: ChartParts): ChartPayload {
  return { id: randomUUID(), subtitle: null, value_format: "cad", highlight: null, ...parts };
}

function cashFlowChart(months: MonthFlow[]): ChartPayload {
  return chartOf({
    source: "spending_by_month",
    kind: "grouped_bar",
    title: "Money in vs money out",
    x: { key: "x", type: "date" },
    series: [{ key: "a", label: "In" }, { key: "b", label: "Out" }],
    data: months.map((flow) => ({ x: flow.month, a: flow.income_cents, b: flow.spending_cents })),
  });
}

function categoryPaceChart(categories: CategoryPace[]): ChartPayload {
  return chartOf({
    source: "category_change",
    kind: "grouped_bar",
    title: "This month vs a typical month",
    x: { key: "x", type: "category" },
    series: [{ key: "a", label: "Typical month" }, { key: "b", label: "This month so far" }],
    data: categories.map((row) => ({ x: row.category, a: row.typical_month_cents, b: row.this_month_cents })),
  });
}

function goalChart(plan: GoalPlan): ChartPayload | null {
  if (plan.path.length < 2) return null;
  return chartOf({
    source: "account_balance_over_time",
    kind: "area",
    title: "Path to your goal",
    x: { key: "x", type: "date" },
    series: [{ key: "value", label: "Saved" }],
    data: plan.path.map((step) => ({ x: step.month, value: step.saved_cents })),
  });
}

async function subscriptions(db: Tx, sid: string) {
  const [transactions, session] = await Promise.all([q.transactions(db, sid), q.sessionInfo(db, sid)]);
  const today = session.today_date;
  const purchases = transactions.filter((t) => t.kind === "purchase" && t.posted_on <= today);
  const charges = recurringCharges(purchases, today);
  return {
    untrusted_data_note: UNTRUSTED_NOTE,
    total_per_month_cents: charges.reduce((sum, charge) => sum + charge.monthly_cost_cents, 0),
    data: charges,
  };
}

export async function runInsightTool(db: Tx, sid: string, name: InsightToolName, input: unknown): Promise<InsightResult> {
  switch (name) {
    case "get_money_snapshot":
      InsightToolInputs.get_money_snapshot.parse(input);
      return { output: await loadSnapshot(db, sid), chart: null };
    case "get_cash_flow": {
      const p = InsightToolInputs.get_cash_flow.parse(input);
      const flow = await loadCashFlow(db, sid, p.months);
      return { output: flow, chart: p.chart ? cashFlowChart(flow.months) : null };
    }
    case "get_category_pace": {
      const p = InsightToolInputs.get_category_pace.parse(input);
      const pace = await loadCategoryPace(db, sid);
      return { output: pace, chart: p.chart ? categoryPaceChart(pace.categories) : null };
    }
    case "get_subscriptions":
      InsightToolInputs.get_subscriptions.parse(input);
      return { output: await subscriptions(db, sid), chart: null };
    case "plan_savings_goal": {
      const p = InsightToolInputs.plan_savings_goal.parse(input);
      const cents = dollarsToCents(p.target_cad);
      if (cents === null) throw new AppError("invalid", "target_cad can have at most 2 decimals.");
      const plan = await loadGoalPlan(db, sid, cents);
      const { path, ...summary } = plan;
      return { output: { ...summary, months_on_path: path.length }, chart: p.chart ? goalChart(plan) : null };
    }
    case "explain_net_worth_change": {
      const p = InsightToolInputs.explain_net_worth_change.parse(input);
      return { output: await loadNetWorthChange(db, sid, p.months), chart: null };
    }
    case "plan_card_payoff":
      InsightToolInputs.plan_card_payoff.parse(input);
      return { output: await loadCardPayoff(db, sid), chart: null };
  }
}
