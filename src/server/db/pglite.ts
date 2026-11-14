/**
 * PGlite adapter: real Postgres (compiled to WASM) in memory, for tests.
 * Same Db interface and the same type parsing as the app's adapter.
 */
import { PGlite, types } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PG_TYPE, parseSafeInt, type Db, type Tx } from "./types";

function wrap(pg: Pick<PGlite, "query">): Tx {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pg.query<T>(sql, params);
      return result.rows;
    },
  };
}

export async function pgliteDb(): Promise<Db & { pg: PGlite }> {
  const pg = new PGlite({
    parsers: {
      [PG_TYPE.int8]: (v: string) => parseSafeInt(v),
      [PG_TYPE.date]: (v: string) => v,
      [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
    },
  });
  return {
    pg,
    ...wrap(pg),
    async transaction<T>(fn: (tx: Tx) => Promise<T>) {
      return pg.transaction((tx) => fn(wrap(tx)));
    },
  };
}

/** A fresh in-memory database with the schema applied (no seed data). */
export async function migratedTestDb(): Promise<Db & { pg: PGlite }> {
  const db = await pgliteDb();
  const migration = readFileSync(resolve(process.cwd(), "db/migrations/0001_init.sql"), "utf8");
  await db.pg.exec(migration);
  return db;
}
