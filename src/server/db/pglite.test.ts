import { describe, expect, it } from "vitest";
import { TEMPLATE_SESSION_ID } from "../../contracts";
import { migratedTestDb } from "./pglite";

describe("PGlite test adapter", () => {
  it("returns int8 as numbers, dates as strings, and rolls back failed transactions", async () => {
    const db = await migratedTestDb();
    await db.query(
      `insert into accounts values ($1,'acc_chequing','chequing','Everyday Chequing','Coin Bank','4471',284012,100000,null,null,null,null)`,
      [TEMPLATE_SESSION_ID],
    );
    const [row] = await db.query<{ balance_cents: number; today_date: string }>(
      `select a.balance_cents, s.today_date from accounts a join sessions s on s.id = a.session_id where a.id = 'acc_chequing'`,
    );
    expect(row).toEqual({ balance_cents: 284012, today_date: "2026-11-15" });

    await expect(
      db.transaction(async (tx) => {
        await tx.query(`update accounts set balance_cents = 0 where id = 'acc_chequing'`);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const [after] = await db.query<{ balance_cents: number }>(`select balance_cents from accounts where id = 'acc_chequing'`);
    expect(after.balance_cents).toBe(284012);
  });

  it("refuses bigints that would lose precision", async () => {
    const db = await migratedTestDb();
    await expect(db.query(`select 9007199254740993::bigint as n`)).rejects.toThrow(/safe integer/);
  });
});
