/**
 * Date ranges come from the model, so they are kept inside the two years of
 * history that exist. Also: a ticker held in two accounts reports one
 * combined weight, so Coin can state a concentration without adding numbers.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { ChartRequest } from "../../contracts";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { buildChart } from "./charts";
import { clampToHistory } from "./data";
import { runReadTool } from "./read";

const TODAY = "2026-11-15";
const EARLIEST = "2024-11-15";

const chartRequest = (overrides: Partial<ChartRequest>): ChartRequest => ({
  source: "net_worth_over_time",
  title: "Net worth",
  kind: null,
  from: null,
  to: null,
  compare_from: null,
  compare_to: null,
  account_id: null,
  category: null,
  ticker: null,
  days: null,
  ...overrides,
});

describe("clampToHistory", () => {
  it.each([
    ["1990-01-01", EARLIEST],
    [EARLIEST, EARLIEST],
    ["2026-03-01", "2026-03-01"],
    [TODAY, TODAY],
    ["2031-01-01", TODAY],
  ])("%s becomes %s", (date, expected) => {
    expect(clampToHistory(date, TODAY)).toBe(expected);
  });
});

describe("tools with model-chosen ranges", () => {
  let seed: SeededTestDb;
  beforeAll(async () => {
    seed = await seededTestDb({ today: TODAY });
  }, 60_000);

  it("a chart asked for from 1900 starts where the history starts", async () => {
    const chart = await buildChart(seed.db, seed.sessionId, chartRequest({ from: "1900-01-01" }));
    expect(chart.data[0].x).toBe(EARLIEST);
    expect(chart.data.length).toBeLessThanOrEqual(26);
  });

  it("portfolio performance asked for from 1900 stays within two years of weeks", async () => {
    const input = { account_id: null, from: "1900-01-01", to: "2040-01-01", interval: "week" };
    const result = (await runReadTool(seed.db, seed.sessionId, "get_portfolio_performance", input)) as {
      series: Array<{ date: string }>;
    };
    expect(result.series[0].date).toBe(EARLIEST);
    expect(result.series.at(-1)?.date).toBe(TODAY);
    expect(result.series.length).toBeLessThanOrEqual(106);
  });

  it("price history never reaches past today", async () => {
    const input = { ticker: "NRTH.CX", from: "2026-11-01", to: "2030-01-01" };
    const rows = (await runReadTool(seed.db, seed.sessionId, "get_price_history", input)) as Array<{ date: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.date >= "2026-11-01" && row.date <= TODAY)).toBe(true);
  });

  it("reports a ticker's combined weight across accounts on every row", async () => {
    type Row = { account_id: string; ticker: string; weight_of_portfolio: number; ticker_weight_of_portfolio: number };
    const all = (await runReadTool(seed.db, seed.sessionId, "get_holdings", { account_id: null })) as Row[];
    const northwind = all.filter((row) => row.ticker === "NRTH.CX");
    expect(northwind).toHaveLength(2);
    for (const row of northwind) expect(row.ticker_weight_of_portfolio).toBeCloseTo(0.329, 3);

    // Filtering to one account still reports the weight across all of them.
    const tfsaOnly = (await runReadTool(seed.db, seed.sessionId, "get_holdings", { account_id: "acc_tfsa" })) as Row[];
    const inTfsa = tfsaOnly.find((row) => row.ticker === "NRTH.CX")!;
    expect(inTfsa.ticker_weight_of_portfolio).toBeCloseTo(0.329, 3);
    expect(inTfsa.weight_of_portfolio).toBeLessThan(inTfsa.ticker_weight_of_portfolio);
  });
});
