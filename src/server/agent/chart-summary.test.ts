import { describe, expect, it } from "vitest";
import type { ChartPayload } from "../../contracts";
import { chartSummaryForModel } from "./chart-summary";

function chart(overrides: Partial<ChartPayload>): ChartPayload {
  return {
    id: "c1",
    source: "net_worth_over_time",
    kind: "area",
    title: "Net worth",
    subtitle: "Nov 15, 2025 – Nov 15, 2026",
    x: { key: "x", type: "date" },
    series: [{ key: "value", label: "Net worth" }],
    data: [],
    value_format: "cad",
    highlight: null,
    ...overrides,
  };
}

describe("chartSummaryForModel", () => {
  it("gives a trend its start, end, change, high and low", () => {
    const summary = chartSummaryForModel(
      chart({
        data: [
          { x: "2026-01-01", value: 100_000 },
          { x: "2026-06-01", value: 80_000 },
          { x: "2026-09-01", value: 150_000 },
          { x: "2026-11-01", value: 140_000 },
        ],
      }),
    );
    expect(summary.series).toEqual({
      "Net worth": {
        start: "$1,000.00 on 2026-01-01",
        end: "$1,400.00 on 2026-11-01",
        change: "$400.00",
        high: "$1,500.00 on 2026-09-01",
        low: "$800.00 on 2026-06-01",
      },
    });
  });

  it("lists a breakdown biggest first", () => {
    const summary = chartSummaryForModel(
      chart({
        source: "spending_by_category",
        kind: "bar",
        x: { key: "x", type: "category" },
        series: [{ key: "value", label: "Spent" }],
        data: [
          { x: "groceries", value: 30_000 },
          { x: "housing", value: 180_000 },
          { x: "dining", value: 12_050 },
        ],
      }),
    );
    expect(summary.series).toEqual({ Spent: ["housing: $1,800.00", "groceries: $300.00", "dining: $120.50"] });
  });

  it("skips empty points and survives a chart with no data", () => {
    const summary = chartSummaryForModel(chart({ data: [{ x: "2026-01-01", value: null }] }));
    expect(summary.series).toEqual({ "Net worth": null });
  });
});
