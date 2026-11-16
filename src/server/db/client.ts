import "server-only";
import postgres from "postgres";
import { POSTGRES_TYPES } from "./postgres-types";
import type { Db, Tx } from "./types";

export type { Db, Tx } from "./types";

type Sql = postgres.Sql<Record<string, never>>;

function createSql(url: string): Sql {
  return postgres(url, {
    max: 5,
    prepare: false, // works behind Neon / pgbouncer transaction pooling
    idle_timeout: 20, // seconds; a frozen serverless instance shouldn't hold connections open
    connect_timeout: 10, // seconds; fail fast instead of hanging a request on a cold database
    types: POSTGRES_TYPES,
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
    } else if (process.env.NODE_ENV === "development") {
      // Only `next dev` sets this; any other environment fails closed below.
      shared = lazyLocalDb();
    } else {
      throw new Error("DATABASE_URL is not set");
    }
  }
  return shared;
}
