/**
 * Zero-setup local database for `npm run dev` when DATABASE_URL is not set:
 * an in-process Postgres (PGlite) with the real migration and seed. Data lives
 * in memory and resets when the dev server restarts. Never used in production.
 */
import { insertSeed } from "../../../scripts/seed";
import { migratedTestDb } from "./pglite";
import type { Db } from "./types";

type Holder = { coinLocalDb?: Promise<Db> };

async function create(): Promise<Db> {
  const db = await migratedTestDb();
  await insertSeed(db);
  return db;
}

/** One instance per dev server, kept across hot reloads. */
export function localDb(): Promise<Db> {
  const holder = globalThis as Holder;
  holder.coinLocalDb ??= create();
  return holder.coinLocalDb;
}
