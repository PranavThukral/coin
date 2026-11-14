import { beforeAll, describe, expect, it } from "vitest";
import { addDays, SEED_ANCHOR_DATE, SEED_HOLDINGS, type ChartPayload, type ChartRequest } from "../../contracts";
import { holdingsAt } from "../../../scripts/seed/generate";
import { approve, executeNow, proposeAction } from "../actions/service";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import * as q from "../db/queries";
import { buildChart } from "./charts";
import { holdingsTimeline, priceIndex } from "./history";

const CHART: Omit<ChartRequest, "source" | "title"> = {
  kind: null, from: null, to: null, compare_from: null, compare_to: null,
  account_id: null, category: null, ticker: null, days: null,
};
const lastValue = (chart: ChartPayload) => Number(chart.data.at(-1)?.[chart.series[0]?.key ?? "value"]);

let f: SeededTestDb;
beforeAll(async () => {
  f = await seededTestDb({ today: SEED_ANCHOR_DATE });
}, 30_000);

describe("holdingsTimeline", () => {
  it("today equals current holdings", async () => {
    const timeline = holdingsTimeline(await q.holdings(f.db, f.sessionId), await q.transactions(f.db, f.sessionId));
    const today = timeline.at(SEED_ANCHOR_DATE);
    for (const h of SEED_HOLDINGS) {
      expect(today.find((t) => t.account_id === h.account_id && t.ticker === h.ticker)?.quantity).toBe(h.quantity);
    }
  });

  it("matches the seed generator's own history on past dates", async () => {
    const timeline = holdingsTimeline(await q.holdings(f.db, f.sessionId), await q.transactions(f.db, f.sessionId));
    for (const date of ["2025-02-01", "2025-09-15", "2026-06-30"]) {
      const fromSeed = holdingsAt(date).filter((h) => h.quantity > 0);
      const rebuilt = timeline.at(date);
      for (const h of fromSeed) {
        expect(rebuilt.find((r) => r.account_id === h.account_id && r.ticker === h.ticker)?.quantity, `${date} ${h.ticker}`)
          .toBe(h.quantity);
      }
    }
  });
});

describe("priceIndex", () => {
  it("returns the latest close on or before a date, 0 before the first", () => {
    const index = priceIndex([
      { ticker: "A.CX", date: "2026-01-02", close_cents: 100 },
      { ticker: "A.CX", date: "2026-01-05", close_cents: 120 },
    ]);
    expect(index.closeOn("A.CX", "2026-01-01")).toBe(0);
    expect(index.closeOn("A.CX", "2026-01-04")).toBe(100);
    expect(index.closeOn("A.CX", "2026-02-01")).toBe(120);
    expect(index.closeOn("B.CX", "2026-02-01")).toBe(0);
  });
});

describe("charts after Coin executes a trade", () => {
  it("buying shares moves cash into holdings without changing today's net worth", async () => {
    const netWorth = () => buildChart(f.db, f.sessionId, { ...CHART, source: "net_worth_over_time", title: "Net worth" });
    const before = lastValue(await netWorth());

    const [message] = await f.db.query<{ id: string }>(
      "insert into messages (session_id, role, content) values ($1, 'user', $2) returning id",
      [f.sessionId, "Buy 10 shares of USEQ.CX in my TFSA"],
    );
    const card = await proposeAction(f.db, f.sessionId, message.id, {
      type: "trade", account_id: "acc_tfsa", side: "buy", ticker: "USEQ.CX", quantity: 10, rationale: "",
    });
    const now = new Date();
    await approve(f.db, f.sessionId, card.action_id, now);
    const executed = await executeNow(f.db, f.sessionId, card.action_id, now);
    expect(executed.status).toBe("executed");

    expect(lastValue(await netWorth())).toBe(before);
    const [row] = await f.db.query<{ description: string }>(
      "select description from transactions where action_id = $1",
      [card.action_id],
    );
    expect(row.description).toBe("BUY 10 USEQ.CX");
  });
});

describe("speed", () => {
  it("net worth and portfolio charts build in well under a second", async () => {
    const start = performance.now();
    await buildChart(f.db, f.sessionId, { ...CHART, source: "net_worth_over_time", title: "x" });
    await buildChart(f.db, f.sessionId, {
      ...CHART, source: "portfolio_value_over_time", title: "x", account_id: "acc_tfsa",
      from: addDays(SEED_ANCHOR_DATE, -365), interval: undefined,
    } as ChartRequest);
    expect(performance.now() - start).toBeLessThan(800);
  });
});
