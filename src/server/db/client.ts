import "server-only";
import postgres from "postgres";
import { PG_TYPE, parseSafeInt, type Db, type Tx } from "./types";

export type { Db, Tx } from "./types";

type Sql = postgres.Sql<Record<string, never>>;

function createSql(url: string): Sql {
  return postgres(url, {
    max: 5,
    prepare: false, // works behind Neon / pgbouncer transaction pooling
    types: {
      int8: { to: PG_TYPE.int8, from: [PG_TYPE.int8], serialize: String, parse: parseSafeInt },
      date: { to: PG_TYPE.date, from: [PG_TYPE.date], serialize: String, parse: (v: string) => v },
    },
  }) as unknown as Sql;
}

function wrap(sql: Sql | postgres.TransactionSql<Record<string, never>>): Tx {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return rows as unknown as T[];
    },
  };
}

/** Postgres adapter for the app (Neon/Supabase via DATABASE_URL). */
export function postgresDb(url: string): Db {
  const sql = createSql(url);
  return {
    ...wrap(sql),
    async transaction<T>(fn: (tx: Tx) => Promise<T>) {
      const result = await sql.begin((tx) => fn(wrap(tx)));
      return result as T;
    },
  };
}

let shared: Db | null = null;

/** In development without DATABASE_URL: an in-process, seeded Postgres. */
function lazyLocalDb(): Db {
  const ready = import("./local-db").then((module) => module.localDb());
  return {
    async query<T>(text: string, params?: unknown[]) {
      return (await ready).query<T>(text, params);
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>) {
      return (await ready).transaction(fn);
    },
  };
}

/** The app-wide database handle. */
export function db(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (url) {
      shared = postgresDb(url);
    } else if (process.env.NODE_ENV !== "production") {
      shared = lazyLocalDb();
    } else {
      throw new Error("DATABASE_URL is not set");
    }
  }
  return shared;
}
