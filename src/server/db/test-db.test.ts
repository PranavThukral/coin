import { describe, expect, it } from "vitest";
import { seededTestDb } from "./test-db";

describe("seeded test database", () => {
  it("clones the seed for a visitor with dates shifted to their today", async () => {
    const { db, sessionId } = await seededTestDb({ today: "2027-01-05" });
    const [hydro] = await db.query<{ due_date: string }>(
      "select due_date from bills where session_id = $1 and id = 'bill_hydro'",
      [sessionId],
    );
    expect(hydro.due_date).toBe("2027-01-08"); // always due in 3 days

    const [chequing] = await db.query<{ balance_cents: number }>(
      "select balance_cents from accounts where session_id = $1 and id = 'acc_chequing'",
      [sessionId],
    );
    expect(chequing.balance_cents).toBe(284_012);

    const [count] = await db.query<{ n: number }>(
      "select count(*)::int as n from transactions where session_id = $1",
      [sessionId],
    );
    expect(count.n).toBeGreaterThan(2_000);
  });

  it("keeps sessions isolated", async () => {
    const { db, sessionId, newSession } = await seededTestDb();
    const other = await newSession();
    await db.query("update accounts set balance_cents = 1 where session_id = $1 and id = 'acc_chequing'", [other]);
    const [mine] = await db.query<{ balance_cents: number }>(
      "select balance_cents from accounts where session_id = $1 and id = 'acc_chequing'",
      [sessionId],
    );
    expect(mine.balance_cents).toBe(284_012);
  });
});
