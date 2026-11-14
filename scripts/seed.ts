import { loadScriptEnv } from "./env";
import postgres from "postgres";
import { resolve } from "node:path";
import { generateSeed, type SeedData } from "./seed/generate";
import { TEMPLATE_SESSION_ID } from "../src/contracts";

export interface Query { query(sql: string, params?: unknown[]): Promise<unknown> }
export interface Database extends Query { transaction<T>(fn: (tx: Query) => Promise<T>): Promise<T> }

// All identifiers below are fixed here; only row values are parameters.
export async function insertSeed(db: Database, seed: SeedData = generateSeed()): Promise<void> {
  await db.transaction(async tx => {
    for (const table of ["transactions", "holdings", "accounts", "bills", "contacts", "room"]) {
      await tx.query(`delete from ${table} where session_id = $1`, [TEMPLATE_SESSION_ID]);
    }
    await tx.query("delete from prices");

    const insert = async (table: string, columns: string[], rows: object[], session = false) => {
      for (let start = 0; start < rows.length; start += 100) {
        const params: unknown[] = [];
        const values = rows.slice(start, start + 100).map(row => {
          const record = row as Record<string, unknown>;
          const fields = session ? [TEMPLATE_SESSION_ID, ...columns.map(c => record[c])] : columns.map(c => record[c]);
          return `(${fields.map(value => { params.push(value); return `$${params.length}`; }).join(", ")})`;
        });
        await tx.query(`insert into ${table} (${session ? "session_id, " : ""}${columns.join(", ")}) values ${values.join(", ")}${table === "securities" ? " on conflict (ticker) do update set name = excluded.name, kind = excluded.kind, sector = excluded.sector, dividend_yield_bps = excluded.dividend_yield_bps" : ""}`, params);
      }
    };
    await insert("securities", ["ticker", "name", "kind", "sector", "dividend_yield_bps"], seed.securities);
    await insert("prices", ["ticker", "date", "close_cents"], seed.prices);
    await insert("accounts", ["id", "type", "name", "institution_label", "mask", "balance_cents", "opening_balance_cents", "limit_cents", "statement_balance_cents", "statement_due_date", "interest_rate_bps"], seed.accounts, true);
    await insert("transactions", ["id", "account_id", "posted_on", "amount_cents", "merchant", "description", "category", "kind", "transfer_group_id", "action_id"], seed.transactions, true);
    await insert("holdings", ["account_id", "ticker", "quantity", "avg_cost_cents"], [...seed.holdings], true);
    await insert("bills", ["id", "payee", "amount_cents", "due_date", "recurrence", "category", "saved", "memo"], [...seed.bills], true);
    await insert("contacts", ["id", "name", "email", "saved"], [...seed.contacts], true);
    await insert("room", ["account_type", "year", "room_remaining_cents"], [...seed.room], true);
  });
}

export async function seedDatabase(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  const query = (client: typeof sql): Query => ({ query: async (text, params = []) => client.unsafe(text, params as postgres.ParameterOrJSON<never>[]) });
  try {
    await insertSeed({ ...query(sql), transaction: async fn => sql.begin(async tx => fn(query(tx as unknown as typeof sql))) as Promise<Awaited<ReturnType<typeof fn>>> });
  } finally { await sql.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/seed.ts")) {
  loadScriptEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  seedDatabase(process.env.DATABASE_URL).catch(error => { console.error(error); process.exitCode = 1; });
}

