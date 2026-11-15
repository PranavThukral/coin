/**
 * Audit of the read tools (round 1). Failing tests are findings; severity in the
 * describe name.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { AffordabilityResult, ChartPayload, HoldingView, RecurringChange, SpendingRow } from "../../contracts";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { buildChart } from "./charts";
import { runReadTool } from "./read";

// A visitor arriving on Jan 5, 2027: every date must follow them.
let f: SeededTestDb;
beforeAll(async () => {
  f = await seededTestDb({ today: "2027-01-05" });
}, 30_000);

const tool = <T>(name: string, input: unknown) => runReadTool(f.db, f.sessionId, name as never, input) as Promise<T>;
const unwrap = <T>(value: unknown): T =>
  (value && typeof value === "object" && "data" in value ? (value as { data: T }).data : value) as T;

const chartArgs = {
  title: "t", kind: null, from: null, to: null, compare_from: null, compare_to: null,
  account_id: null, category: null, ticker: null, days: null,
};

describe("HIGH: untrusted text is always wrapped", () => {
  it.each([
    ["get_transactions", { account_id: null, from: null, to: null, category: null, merchant_query: null, limit: 20 }],
    ["get_bills", { saved_only: false }],
    ["get_contacts", {}],
    ["get_upcoming", { days: 14 }],
  ])("%s output carries untrusted_data_note", async (name, input) => {
    const out = await tool<Record<string, unknown>>(name, input);
    expect(out).toHaveProperty("untrusted_data_note");
  });
});

describe("Dates follow the visitor (today = 2027-01-05)", () => {
  it("upcoming 14 days: hydro in 3 days, card in 9, pay in 5", async () => {
    const out = JSON.stringify(await tool("get_upcoming", { days: 14 }));
    expect(out).toContain("2027-01-08"); // hydro
    expect(out).toContain("2027-01-14"); // card statement
    expect(out).toContain("2027-01-10"); // payday (anchor +5)
  });

  it("the planted refund is 8 days ago", async () => {
    const rows = unwrap<{ id: string; posted_on: string }[]>(
      await tool("get_transactions", { account_id: "acc_card", from: null, to: null, category: null, merchant_query: "Harbourfront", limit: 50 }),
    );
    const refund = rows.find((r) => r.id === "txn_planted_refund");
    expect(refund?.posted_on).toBe("2026-12-28");
  });

  it("contribution room is this year's (2027)", async () => {
    const out = JSON.stringify(await tool("get_contribution_room", {}));
    expect(out).toContain("2027");
    expect(out).toContain("350000");
  });

  it("default chart range ends today", async () => {
    const chart = await buildChart(f.db, f.sessionId, { ...chartArgs, source: "spending_by_month" });
    const last = chart.data.at(-1)?.[chart.x.key];
    expect(String(last)).toMatch(/^2027-01/);
  });
});

describe("Planted facts are found", () => {
  it("Streamly is the subscription that went up", async () => {
    const changes = unwrap<RecurringChange[]>(await tool("find_recurring_changes", { lookback_months: 6 }));
    const streamly = changes.find((c) => c.merchant === "Streamly Premium");
    expect(streamly).toMatchObject({ change: "price_up", old_cents: 1_699, new_cents: 2_299 });
  });

  it("MEDIUM: recurring changes are not noisy (at most 4 price changes flagged)", async () => {
    const changes = unwrap<RecurringChange[]>(await tool("find_recurring_changes", { lookback_months: 6 }));
    const priceMoves = changes.filter((c) => c.change === "price_up" || c.change === "price_down");
    expect(priceMoves.length).toBeLessThanOrEqual(4);
  });

  it("NRTH.CX is ~33% and the allocation chart highlights it", async () => {
    const holdings = unwrap<HoldingView[]>(await tool("get_holdings", { account_id: null }));
    const nrth = holdings.filter((h) => h.ticker === "NRTH.CX").reduce((s, h) => s + h.weight_of_portfolio, 0);
    expect(nrth).toBeGreaterThan(0.31);
    expect(nrth).toBeLessThan(0.35);
    const chart: ChartPayload = await buildChart(f.db, f.sessionId, { ...chartArgs, source: "allocation_by_holding" });
    expect(chart.highlight?.x).toMatch(/NRTH/);
  });

  it("affording $3,000 today is not comfortable (rent + card are coming)", async () => {
    const result = unwrap<AffordabilityResult>(
      await tool("check_affordability", { amount_cad: 3000, from_account_id: null, on_date: null }),
    );
    expect(result.verdict).not.toBe("comfortable");
    expect(result.max_comfortable_cents).toBeLessThan(300_000);
  });
});

describe("Numbers agree everywhere", () => {
  it("the category chart shows summarize_spending's five largest for the same range", async () => {
    const range = { from: "2026-12-01", to: "2026-12-31" };
    const rows = unwrap<SpendingRow[]>(
      await tool("summarize_spending", { ...range, group_by: "category", account_id: null, category: null }),
    );
    const chart = await buildChart(f.db, f.sessionId, { ...chartArgs, ...range, source: "spending_by_category" });
    // The chart shows the five largest categories, each with the tool's own figure.
    const largest = [...rows].sort((a, b) => b.total_cents - a.total_cents).slice(0, 5);
    expect(chart.data.map((d) => [d.x, d[chart.series[0].key]])).toEqual(largest.map((r) => [r.key, r.total_cents]));
  });

  it("transfers between own accounts never count as spending", async () => {
    const rows = unwrap<SpendingRow[]>(
      await tool("summarize_spending", { from: "2026-01-01", to: "2026-12-31", group_by: "category", account_id: null, category: null }),
    );
    expect(rows.map((r) => r.key)).not.toContain("transfers");
    expect(rows.map((r) => r.key)).not.toContain("investments");
  });
});

describe("MEDIUM: portfolio reflects trades Coin executed this session", () => {
  it("after buying 10 USEQ.CX in the TFSA, get_holdings and today's portfolio value include them", async () => {
    const before = unwrap<HoldingView[]>(await tool("get_holdings", { account_id: "acc_tfsa" }));
    const qtyBefore = before.find((h) => h.ticker === "USEQ.CX")!.quantity;
    await f.db.query(
      "update holdings set quantity = quantity + 10 where session_id = $1 and account_id = 'acc_tfsa' and ticker = 'USEQ.CX'",
      [f.sessionId],
    );
    const after = unwrap<HoldingView[]>(await tool("get_holdings", { account_id: "acc_tfsa" }));
    expect(after.find((h) => h.ticker === "USEQ.CX")!.quantity).toBe(qtyBefore + 10);

    const chart = await buildChart(f.db, f.sessionId, { ...chartArgs, source: "portfolio_value_over_time", account_id: "acc_tfsa" });
    const lastValue = Number(chart.data.at(-1)?.[chart.series[0].key]);
    const holdingsValue = after.reduce((s, h) => s + h.market_value_cents, 0);
    expect(Math.abs(lastValue - holdingsValue)).toBeLessThan(holdingsValue * 0.02);
  });
});
