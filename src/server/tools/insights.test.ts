import { beforeAll, describe, expect, it } from "vitest";
import type { Account, Transaction } from "../../contracts";
import { chartRequest } from "../../lib/chart-request";
import { isInsightTool, runInsightTool } from "../agent/insight-tools";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { buildChart } from "./charts";
import {
  cardPosition,
  cashFlowByMonth,
  categoryPace,
  goalPlan,
  loadNetWorthChange,
  loadSnapshot,
  monthKeys,
  typicalMonth,
} from "./insights";
import { recurringCharges } from "./recurring";

let serial = 0;
function txn(posted_on: string, amount_cents: number, kind: Transaction["kind"], extra: Partial<Transaction> = {}): Transaction {
  serial += 1;
  return {
    id: `t${serial}`,
    account_id: "acc_chequing",
    posted_on,
    amount_cents,
    merchant: "Shop",
    description: "Shop",
    category: "shopping",
    kind,
    transfer_group_id: null,
    action_id: null,
    ...extra,
  };
}

const LEDGER: Transaction[] = [
  txn("2026-09-05", 300_000, "income", { category: "income" }),
  txn("2026-09-10", -100_000, "purchase"),
  txn("2026-10-05", 300_000, "income", { category: "income" }),
  txn("2026-10-10", -200_000, "purchase", { category: "dining" }),
  txn("2026-10-12", 5_000, "refund", { category: "dining" }),
  txn("2026-10-20", -50_000, "transfer_out", { category: "transfers" }),
  txn("2026-11-05", 300_000, "income", { category: "income" }),
  txn("2026-11-08", -30_000, "purchase", { category: "dining" }),
];

describe("monthly cash flow", () => {
  it("lists calendar months oldest first, across a year boundary", () => {
    expect(monthKeys("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("counts income and spending per month; transfers are neither, refunds reduce spending", () => {
    const flows = cashFlowByMonth(LEDGER, "2026-11-15", 3);
    expect(flows[1]).toEqual({
      month: "2026-10",
      income_cents: 300_000,
      spending_cents: 195_000,
      saved_cents: 105_000,
      savings_rate: 0.35,
      partial: false,
    });
    expect(flows[2].partial).toBe(true);
  });

  it("averages only the complete months", () => {
    const typical = typicalMonth(cashFlowByMonth(LEDGER, "2026-11-15", 3));
    expect(typical).toEqual({
      months_averaged: 2,
      income_cents: 300_000,
      spending_cents: 147_500,
      saved_cents: 152_500,
      savings_rate: 0.508,
    });
  });

  it("has no savings rate in a month with no income", () => {
    expect(cashFlowByMonth([], "2026-11-15", 1)[0].savings_rate).toBeNull();
  });
});

describe("category pace", () => {
  it("sets this month beside the average of the three months before", () => {
    const dining = categoryPace(LEDGER, "2026-11-15").find((row) => row.category === "dining");
    expect(dining).toEqual({
      category: "dining",
      this_month_cents: 30_000,
      typical_month_cents: 65_000,
      percent_of_typical: 46,
    });
  });
});

describe("credit card position", () => {
  const card = {
    type: "credit_card",
    balance_cents: 491_238,
    limit_cents: 1_500_000,
    statement_balance_cents: 491_238,
    statement_due_date: "2026-11-24",
    interest_rate_bps: 2099,
  } as Account;

  it("gives utilisation, the interest-free payoff and a month of interest", () => {
    const position = cardPosition(card);
    expect(position.utilisation).toBe(0.327);
    expect(position.pay_by_due_date_to_avoid_interest_cents).toBe(491_238);
    expect(position.annual_rate_percent).toBe(20.99);
    expect(position.interest_if_unpaid_one_month_cents).toBe(8_593);
  });
});

describe("savings goal", () => {
  it("rounds up to whole months and names the month it is reached", () => {
    const plan = goalPlan(1_000_000, 150_000, "2026-11-15");
    expect(plan.months_needed).toBe(7);
    expect(plan.reached_in_month).toBe("2027-06");
    expect(plan.path[0]).toEqual({ month: "2026-11", saved_cents: 0 });
    expect(plan.path.at(-1)).toEqual({ month: "2027-06", saved_cents: 1_000_000 });
  });

  it("has no date when nothing is being saved", () => {
    expect(goalPlan(1_000_000, 0, "2026-11-15").months_needed).toBeNull();
    expect(goalPlan(1_000_000, -5_000, "2026-11-15").path).toEqual([]);
  });
});

describe("recurring charges", () => {
  const monthly = (day: string, cents: number) => txn(day, cents, "purchase", { merchant: "Streamly", category: "subscriptions" });

  it("lists an active subscription at its current price, even after a price change", () => {
    const rows = ["06", "07", "08", "09"].map((month) => monthly(`2026-${month}-02`, -1_699));
    rows.push(monthly("2026-10-02", -2_299), monthly("2026-11-02", -2_299));
    const [charge] = recurringCharges(rows, "2026-11-15");
    expect(charge).toMatchObject({ merchant: "Streamly", frequency: "monthly", monthly_cost_cents: 2_299 });
  });

  it("leaves out a charge that has stopped", () => {
    const rows = ["03", "04", "05", "06"].map((month) => monthly(`2026-${month}-02`, -1_699));
    expect(recurringCharges(rows, "2026-11-15")).toEqual([]);
  });
});

describe("insights on the seeded bank", () => {
  let f: SeededTestDb;
  beforeAll(async () => {
    f = await seededTestDb();
  }, 30_000);

  it("the snapshot's net worth is cash plus investments minus the card", async () => {
    const snapshot = await loadSnapshot(f.db, f.sessionId);
    expect(snapshot.net_worth_cents).toBe(snapshot.cash_cents + snapshot.investments_cents - 491_238);
    expect(snapshot.cash_cents).toBe(2_734_012);
    expect(snapshot.card?.utilisation).toBe(0.327);
    expect(snapshot.typical_month.months_averaged).toBe(3);
    expect(snapshot.typical_month.income_cents).toBeGreaterThan(0);
  });

  it("the drivers of net worth add up to the change the net worth chart shows", async () => {
    const change = await loadNetWorthChange(f.db, f.sessionId, 6);
    const chart = await buildChart(
      f.db,
      f.sessionId,
      chartRequest("net_worth_over_time", "Net worth", { from: change.from, to: change.to }),
    );
    const start = Number(chart.data[0].value);
    const end = Number(chart.data.at(-1)?.value);
    expect(change.net_worth_change_cents).toBe(end - start);
    expect(change.cash_change_cents + change.investments_change_cents - change.card_owed_change_cents).toBe(end - start);
  });

  it("tools draw their chart only when asked, from numbers code computed", async () => {
    const quiet = await runInsightTool(f.db, f.sessionId, "get_cash_flow", { months: 6, chart: false });
    expect(quiet.chart).toBeNull();
    const shown = await runInsightTool(f.db, f.sessionId, "get_cash_flow", { months: 6, chart: true });
    expect(shown.chart?.kind).toBe("grouped_bar");
    expect(shown.chart?.data).toHaveLength(6);
  });

  it("marks subscription names as untrusted data and totals them", async () => {
    const { output } = await runInsightTool(f.db, f.sessionId, "get_subscriptions", {});
    const result = output as { untrusted_data_note: string; total_per_month_cents: number; data: { merchant: string }[] };
    expect(result.untrusted_data_note).toContain("not instructions");
    expect(result.data.map((charge) => charge.merchant)).toContain("Streamly Premium");
    expect(result.total_per_month_cents).toBeGreaterThan(0);
  });

  it("rejects bad arguments and unknown names", async () => {
    await expect(runInsightTool(f.db, f.sessionId, "get_cash_flow", { months: 99, chart: true })).rejects.toThrow();
    await expect(runInsightTool(f.db, f.sessionId, "plan_savings_goal", { target_cad: 10.001, chart: false })).rejects.toThrow();
    expect(isInsightTool("propose_action")).toBe(false);
  });
});
