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
import { SEED_ANCHOR_DATE, SESSION, TEMPLATE_SESSION_ID, Uuid, daysBetween, torontoToday } from "../../contracts";
import { settleDueActions } from "../actions/service";
import type { Db } from "../db/types";

export interface ResolvedSession {
  sessionId: string;
  isNew: boolean;
}

type SessionRow = { today_date: string; last_seen_at: string };

const IDLE_MS = SESSION.idle_minutes * 60 * 1000;

export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Remove sessions idle past the window; their rows cascade away. */
async function sweepExpired(db: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - IDLE_MS).toISOString();
  await db.query("delete from sessions where not is_template and last_seen_at < $1", [cutoff]);
}

export async function createSession(db: Db, now: Date, ipHash: string | null): Promise<string> {
  await sweepExpired(db, now);
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

async function findSession(db: Db, cookieValue: string | null): Promise<(SessionRow & { id: string }) | null> {
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
    await db.query("update sessions set last_seen_at = $2 where id = $1", [existing.id, now.toISOString()]);
    await settleDueActions(db, existing.id, now);
    return { sessionId: existing.id, isNew: false };
  }

  if (existing) {
    // Stale (idle or a new day): its pending actions die with it, unexecuted.
    await db.query("delete from sessions where id = $1", [existing.id]);
  }
  const sessionId = await createSession(db, now, ipHash);
  return { sessionId, isNew: true };
}
