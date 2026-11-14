import { beforeAll, describe, expect, it } from "vitest";
import { SPENDING_KINDS } from "../../contracts";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { runReadTool } from "./read";
import { checkAffordability } from "./affordability";
import { buildChart } from "./charts";

describe("session reads", () => {
  let seed: SeededTestDb;
  beforeAll(async () => { seed = await seededTestDb(); }, 60000);
  it("returns planted holdings, room, bills and recurring change", async () => {
    const { db, sessionId: sid } = seed;
    const holdings = await runReadTool(db, sid, "get_holdings", { account_id: null }) as Array<{ ticker: string; weight_of_portfolio: number }>;
    expect(holdings.filter(h => h.ticker === "NRTH.CX").reduce((sum, h) => sum + h.weight_of_portfolio, 0)).toBeCloseTo(0.329, 2);
    expect(await runReadTool(db, sid, "get_contribution_room", {})).toEqual(expect.arrayContaining([expect.objectContaining({ account_type: "tfsa", room_remaining_cents: 350000 })]));
    const upcoming = await runReadTool(db, sid, "get_upcoming", { days: 14 }) as { data: Array<{ label: string; date: string }> };
    expect(upcoming.data).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2026-11-20", label: "Payday" }), expect.objectContaining({ date: "2026-11-18" }), expect.objectContaining({ date: "2026-11-24" })]));
    const changes = await runReadTool(db, sid, "find_recurring_changes", { lookback_months: 6 }) as { data: unknown[] };
    expect(changes.data).toEqual(expect.arrayContaining([expect.objectContaining({ merchant: "Streamly Premium", change: "price_up", old_cents: 1699, new_cents: 2299, since: "2026-10-03" })]));
  });
  it("computes spending and affordability from ledger facts", async () => {
    const { db, sessionId: sid } = seed;
    const tx = await db.query<{ amount_cents: number; kind: string }>("select amount_cents, kind from transactions where session_id = $1 and posted_on between $2 and $3", [sid, "2026-11-01", "2026-11-15"]);
    const total = -tx.filter(t => SPENDING_KINDS.includes(t.kind as typeof SPENDING_KINDS[number])).reduce((sum, t) => sum + t.amount_cents, 0);
    const rows = await runReadTool(db, sid, "summarize_spending", { from: "2026-11-01", to: "2026-11-15", group_by: "category", account_id: null, category: null }) as Array<{ total_cents: number }>;
    expect(rows.reduce((sum, row) => sum + row.total_cents, 0)).toBe(total);
    expect((await checkAffordability(db, sid, 300000, seed.today)).verdict).toBe("not_now");
  });
  it("isolates cloned sessions", async () => {
    const other = await seed.newSession();
    await seed.db.query("update transactions set description = $2 where session_id = $1", [other, "OTHER SESSION ONLY"]);
    await seed.db.query("update bills set payee = $2 where session_id = $1", [other, "OTHER SESSION ONLY"]);
    await seed.db.query("update contacts set name = $2 where session_id = $1", [other, "OTHER SESSION ONLY"]);
    const result = await runReadTool(seed.db, seed.sessionId, "get_transactions", { account_id: null, from: null, to: null, category: null, merchant_query: null, limit: 200 });
    expect(JSON.stringify(result)).not.toContain("OTHER SESSION ONLY");
    for (const [name, input] of [["get_bills", { saved_only: false }], ["get_contacts", {}], ["get_upcoming", { days: 60 }]] as const) {
      expect(JSON.stringify(await runReadTool(seed.db, seed.sessionId, name, input))).not.toContain("OTHER SESSION ONLY");
    }
  });
  it("builds a computed allocation chart", async () => {
    const chart = await buildChart(seed.db, seed.sessionId, { source: "allocation_by_holding", title: "Allocation", kind: null, from: null, to: null, compare_from: null, compare_to: null, account_id: null, category: null, ticker: null, days: null });
    expect(chart.highlight?.x).toBe("NRTH.CX");
    expect(chart.data.length).toBeGreaterThan(0);
  });
  it("shifts dates with a session", async () => {
    const sid = await seed.newSession("2027-01-05");
    const upcoming = await runReadTool(seed.db, sid, "get_upcoming", { days: 14 }) as { data: Array<{ date: string; label: string }> };
    expect(upcoming.data).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2027-01-10", label: "Payday" })]));
  });
});
