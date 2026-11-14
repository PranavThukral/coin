/**
 * Test helper: an in-memory Postgres with the real migration, the real seed
 * and one cloned visitor session. Use it in any test that touches the DB.
 *
 *   const { db, sessionId, today } = await seededTestDb({ today: "2027-01-05" });
 */
import { randomUUID } from "node:crypto";
import { daysBetween, SEED_ANCHOR_DATE } from "../../contracts";
import { insertSeed } from "../../../scripts/seed";
import { migratedTestDb } from "./pglite";
import type { Db } from "./types";

export interface SeededTestDb {
  db: Db;
  sessionId: string;
  today: string;
  /** Clone another visitor session (for isolation tests). */
  newSession(today?: string): Promise<string>;
}

let cachedSeed: Promise<Db> | null = null;

async function seededTemplate(): Promise<Db> {
  const db = await migratedTestDb();
  await insertSeed(db);
  return db;
}

export async function createSession(db: Db, today: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    "insert into sessions (id, today_date, date_offset_days) values ($1, $2, $3)",
    [id, today, daysBetween(SEED_ANCHOR_DATE, today)],
  );
  await db.query("select clone_template($1)", [id]);
  return id;
}

/** A fresh seeded database per call (seeding takes ~1s; fine for tests). */
export async function seededTestDb(options: { today?: string } = {}): Promise<SeededTestDb> {
  const today = options.today ?? SEED_ANCHOR_DATE;
  const db = await seededTemplate();
  const sessionId = await createSession(db, today);
  return {
    db,
    sessionId,
    today,
    newSession: (otherToday = today) => createSession(db, otherToday),
  };
}

/** Shared read-only seeded DB for suites that never write. */
export function sharedSeededTemplate(): Promise<Db> {
  cachedSeed ??= seededTemplate();
  return cachedSeed;
}
