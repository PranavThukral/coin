/**
 * The one database interface every server module uses. Two adapters
 * implement it: Postgres (the app, see client.ts) and PGlite (tests, see
 * pglite.ts). Both return bigint columns as safe JS integers (cents) and
 * `date` columns as "YYYY-MM-DD" strings, so money and dates never drift.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs fn in one transaction; the tx handle cannot start a nested one. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export type Tx = Pick<Db, "query">;

/** Parse a Postgres int8 into a safe integer, refusing to lose precision. */
export function parseSafeInt(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`bigint ${value} is outside the safe integer range`);
  }
  return n;
}

export const PG_TYPE = { int8: 20, date: 1082 } as const;
