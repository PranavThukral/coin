import { describe, expect, it } from "vitest";
import type { RecurringChange, Transaction } from "../../contracts";
import { seededTestDb } from "../db/test-db";
import { recurringChanges } from "./recurring";
import { runReadTool } from "./read";

describe("recurring charges", () => {
  it("finds Streamly as the only seeded price increase", async () => {
    const seed = await seededTestDb();
    const result = await runReadTool(seed.db, seed.sessionId, "find_recurring_changes", {
      lookback_months: 6,
    }) as { data: RecurringChange[] };
    expect(result.data.filter(change => change.change === "price_up")).toEqual([
      expect.objectContaining({ merchant: "Streamly Premium", old_cents: 1699, new_cents: 2299 }),
    ]);
  }, 60000);

  it("does not flag regularly spaced purchases with naturally varying amounts", () => {
    const amounts = [1200, 1900, 1350, 2100, 1650, 2200];
    const rows = amounts.map((amount, index) => ({
      account_id: "acc_card",
      merchant: "Market",
      posted_on: `2026-${String(index + 6).padStart(2, "0")}-03`,
      amount_cents: -amount,
    })) as Transaction[];
    expect(recurringChanges(rows, "2026-11-15")).toEqual([]);
  });

  it("requires a repeated new price and recognizes weekly charges", () => {
    const amounts = [1000, 1000, 1000, 1200, 1200];
    const rows = amounts.map((amount, index) => ({
      account_id: "acc_card",
      merchant: "Weekly service",
      posted_on: `2026-11-${String(1 + index * 7).padStart(2, "0")}`,
      amount_cents: -amount,
    })) as Transaction[];
    expect(recurringChanges(rows.slice(0, 4), "2026-11-22")).toEqual([]);
    expect(recurringChanges(rows, "2026-11-29")).toEqual([
      expect.objectContaining({ change: "price_up", since: "2026-11-22" }),
    ]);
    expect(recurringChanges(rows, "2026-12-15")).toEqual([
      expect.objectContaining({ change: "stopped" }),
    ]);
  });
});
