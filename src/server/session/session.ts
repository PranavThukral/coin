/**
 * Visitor sessions (contracts section 11).
 *
 * Each visitor gets their own copy of the fake bank, cloned from the template
 * session with every date shifted to their real Toronto "today". A session is
 * replaced when it goes idle for SESSION.idle_minutes, or when the calendar day
 * changes, so dates are never stale. Every resolved request first settles any
 * approved action whose undo window has ended (there is no background timer).
 */
import { createHash, randomUUID } from "node:crypto";
import {
  SEED_ANCHOR_DATE,
  SESSION,
  TEMPLATE_SESSION_ID,
  Uuid,
  daysBetween,
  torontoToday,
} from "../../contracts";
import { settleDueActions } from "../actions/service";
import type { Db } from "../db/types";
import { AppError } from "../errors";

export interface ResolvedSession {
  sessionId: string;
  isNew: boolean;
}

type SessionRow = { today_date: string; last_seen_at: string };
type FoundSession = SessionRow & { id: string };

const IDLE_MS = SESSION.idle_minutes * 60 * 1000;

/**
 * Each new session clones ~2,300 rows (roughly 0.7 MB with indexes), so
 * creation is capped. 500 live sessions stay inside a free-tier Postgres
 * (0.5 GB); idle ones are swept as new visitors arrive.
 */
export const SESSION_LIMITS = {
  newPerIpPerHour: 20,
  maxActive: 500,
  sweepBatch: 25,
} as const;

export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Remove a bounded batch of idle sessions (rows cascade), oldest first. */
async function sweepExpired(db: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - IDLE_MS).toISOString();
  await db.query(
    `delete from sessions where id in (
       select id from sessions where not is_template and last_seen_at < $1
       order by last_seen_at limit $2)`,
    [cutoff, SESSION_LIMITS.sweepBatch],
  );
}

async function enforceCreationLimits(db: Db, now: Date, ipHash: string | null): Promise<void> {
  if (ipHash) {
    const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const [recent] = await db.query<{ n: number }>(
      "select count(*)::int as n from sessions where ip_hash = $1 and created_at > $2",
      [ipHash, since],
    );
    if (recent.n >= SESSION_LIMITS.newPerIpPerHour) {
      throw new AppError("rate_limited", "Too many new visits from here. Try again in an hour.");
    }
  }
  const [active] = await db.query<{ n: number }>("select count(*)::int as n from sessions where not is_template");
  if (active.n >= SESSION_LIMITS.maxActive) {
    throw new AppError("unavailable", "Coin is busy right now. Try again in a few minutes.");
  }
}

export async function createSession(db: Db, now: Date, ipHash: string | null): Promise<string> {
  await sweepExpired(db, now);
  await enforceCreationLimits(db, now, ipHash);
  const id = randomUUID();
  const today = torontoToday(now);
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into sessions (id, created_at, last_seen_at, today_date, date_offset_days, ip_hash)
       values ($1, $2, $2, $3, $4, $5)`,
      [id, now.toISOString(), today, daysBetween(SEED_ANCHOR_DATE, today), ipHash],
    );
    await tx.query("select clone_template($1)", [id]);
  });
  return id;
}

async function findSession(db: Db, cookieValue: string | null): Promise<FoundSession | null> {
  const parsed = Uuid.safeParse(cookieValue);
  if (!parsed.success || parsed.data === TEMPLATE_SESSION_ID) return null;

  const rows = await db.query<SessionRow>(
    "select today_date, last_seen_at from sessions where id = $1 and not is_template",
    [parsed.data],
  );
  return rows[0] ? { id: parsed.data, ...rows[0] } : null;
}

function isUsable(session: SessionRow, now: Date): boolean {
  const idleFor = now.getTime() - new Date(session.last_seen_at).getTime();
  const sameDay = session.today_date === torontoToday(now);
  return idleFor <= IDLE_MS && sameDay;
}

/**
 * The session for this request: the visitor's existing one when it is still
 * fresh, otherwise a new copy. Settles due actions before returning.
 */
export async function resolveSession(
  db: Db,
  cookieValue: string | null,
  now: Date,
  ipHash: string | null,
): Promise<ResolvedSession> {
  const existing = await findSession(db, cookieValue);

  if (existing && isUsable(existing, now)) {
    // Monotonic touch; zero rows means a sweep removed it a moment ago.
    const touched = await db.query(
      "update sessions set last_seen_at = greatest(last_seen_at, $2) where id = $1 returning id",
      [existing.id, now.toISOString()],
    );
    if (touched.length === 1) {
      await settleDueActions(db, existing.id, now);
      return { sessionId: existing.id, isNew: false };
    }
  }

  if (existing) {
    // Stale (idle or a new day): its pending actions die with it, unexecuted.
    await db.query("delete from sessions where id = $1", [existing.id]);
  }
  const sessionId = await createSession(db, now, ipHash);
  return { sessionId, isNew: true };
}
