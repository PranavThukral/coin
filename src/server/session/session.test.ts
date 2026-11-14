import { beforeEach, describe, expect, it } from "vitest";
import { TEMPLATE_SESSION_ID, daysBetween, SEED_ANCHOR_DATE } from "../../contracts";
import { approve, proposeAction } from "../actions/service";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { createSession, hashIp, resolveSession } from "./session";

// 15:00 UTC = 10:00 in Toronto on Nov 20, 2026.
const NOON = new Date("2026-11-20T15:00:00Z");
const minutes = (n: number) => new Date(NOON.getTime() + n * 60_000);

let f: SeededTestDb;
beforeEach(async () => {
  f = await seededTestDb();
}, 30_000);

async function sessionRow(id: string) {
  const rows = await f.db.query<{ today_date: string; date_offset_days: number; last_seen_at: string }>(
    "select today_date, date_offset_days, last_seen_at from sessions where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

describe("createSession", () => {
  it("clones the bank for today's Toronto date with the right offset", async () => {
    const id = await createSession(f.db, NOON, "ip");
    const row = await sessionRow(id);
    expect(row.today_date).toBe("2026-11-20");
    expect(row.date_offset_days).toBe(daysBetween(SEED_ANCHOR_DATE, "2026-11-20"));

    const [bill] = await f.db.query<{ due_date: string }>(
      "select due_date from bills where session_id = $1 and id = 'bill_hydro'",
      [id],
    );
    expect(bill.due_date).toBe("2026-11-23");
  });

  it("sweeps sessions idle past the window", async () => {
    const old = await createSession(f.db, NOON, null);
    await createSession(f.db, minutes(121), null);
    expect(await sessionRow(old)).toBeNull();
  });
});

describe("resolveSession", () => {
  it("creates a session when there is no cookie", async () => {
    const result = await resolveSession(f.db, null, NOON, null);
    expect(result.isNew).toBe(true);
    expect(await sessionRow(result.sessionId)).not.toBeNull();
  });

  it.each([
    ["malformed", "not-a-uuid"],
    ["unknown", "5b6c1f2a-1111-4222-8333-444455556666"],
    ["the template", TEMPLATE_SESSION_ID],
  ])("gives a fresh session for a %s cookie", async (_, cookie) => {
    const result = await resolveSession(f.db, cookie, NOON, null);
    expect(result.isNew).toBe(true);
    expect(result.sessionId).not.toBe(cookie);
  });

  it("reuses a live session and touches last_seen_at", async () => {
    const id = await createSession(f.db, NOON, null);
    const result = await resolveSession(f.db, id, minutes(30), null);
    expect(result).toEqual({ sessionId: id, isNew: false });
    expect(new Date((await sessionRow(id)).last_seen_at).getTime()).toBe(minutes(30).getTime());
  });

  it("replaces and deletes a session idle longer than the window", async () => {
    const id = await createSession(f.db, NOON, null);
    const result = await resolveSession(f.db, id, minutes(121), null);
    expect(result.isNew).toBe(true);
    expect(await sessionRow(id)).toBeNull();
  });

  it("replaces a session from yesterday so dates never go stale", async () => {
    // 04:50 UTC Nov 21 is 23:50 Nov 20 in Toronto; 05:10 UTC is 00:10 Nov 21.
    const lateNight = new Date("2026-11-21T04:50:00Z");
    const afterMidnight = new Date("2026-11-21T05:10:00Z");
    const id = await createSession(f.db, lateNight, null);
    const result = await resolveSession(f.db, id, afterMidnight, null);
    expect(result.isNew).toBe(true);
    expect((await sessionRow(result.sessionId)).today_date).toBe("2026-11-21");
    expect(await sessionRow(id)).toBeNull();
  });

  it("settles an approved action whose undo window has ended", async () => {
    const id = await createSession(f.db, NOON, null);
    const [message] = await f.db.query<{ id: string }>(
      "insert into messages (session_id, role, content) values ($1, 'user', $2) returning id",
      [id, "Move $2,000 from savings to chequing"],
    );
    const card = await proposeAction(f.db, id, message.id, {
      type: "transfer",
      from_account_id: "acc_hisa",
      to_account_id: "acc_chequing",
      amount_cad: 2000,
      rationale: "asked",
    });
    await approve(f.db, id, card.action_id, NOON);

    await resolveSession(f.db, id, minutes(2), null);

    const [action] = await f.db.query<{ status: string }>("select status from actions where id = $1", [card.action_id]);
    expect(action.status).toBe("executed");
  });
});

describe("hashIp", () => {
  it("is stable for the same salt and differs across salts", () => {
    expect(hashIp("1.2.3.4", "a")).toBe(hashIp("1.2.3.4", "a"));
    expect(hashIp("1.2.3.4", "a")).not.toBe(hashIp("1.2.3.4", "b"));
    expect(hashIp("1.2.3.4", "a")).not.toContain("1.2.3.4");
  });
});
