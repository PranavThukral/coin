/**
 * The actions API over HTTP: real route handlers, an in-memory Postgres.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listGet } from "../../app/api/actions/route";
import { POST as approvePost } from "../../app/api/actions/[id]/approve/route";
import { POST as confirmPost } from "../../app/api/actions/[id]/confirm-recipient/route";
import { POST as dismissPost } from "../../app/api/actions/[id]/dismiss/route";
import { POST as executePost } from "../../app/api/actions/[id]/execute-now/route";
import { POST as undoPost } from "../../app/api/actions/[id]/undo/route";
import { GET as sessionGet } from "../../app/api/session/route";
import type { ActionCard } from "../../contracts";
import { seededTestDb, type SeededTestDb } from "../db/test-db";
import { useDbForTests } from "../session/http";
import { proposeAction } from "./service";

let f: SeededTestDb;
let cookie: string;

beforeEach(async () => {
  f = await seededTestDb();
  useDbForTests(f.db);
  // First request: no cookie, so the server creates a session and sets one.
  const response = await sessionGet(new Request("http://coin.test/api/session"));
  const setCookie = response.headers.get("set-cookie") ?? "";
  cookie = setCookie.split(";")[0];
}, 30_000);

afterEach(() => useDbForTests(null));

const sessionId = () => cookie.split("=")[1];
const route = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body?: unknown, withCookie = cookie) =>
  new Request(`http://coin.test${path}`, {
    method: "POST",
    headers: { cookie: withCookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function proposeInSession(text: string, raw: unknown): Promise<ActionCard> {
  const [message] = await f.db.query<{ id: string }>(
    "insert into messages (session_id, role, content) values ($1, 'user', $2) returning id",
    [sessionId(), text],
  );
  return proposeAction(f.db, sessionId(), message.id, raw);
}

const move2000 = {
  type: "transfer",
  from_account_id: "acc_hisa",
  to_account_id: "acc_chequing",
  amount_cad: 2000,
  rationale: "asked",
};

describe("session cookie", () => {
  it("keeps the same session and refreshes the cookie on every response", async () => {
    expect(cookie).toMatch(/^coin_sid=[0-9a-f-]{36}$/);
    const again = await sessionGet(new Request("http://coin.test/api/session", { headers: { cookie } }));
    expect((again.headers.get("set-cookie") ?? "").split(";")[0]).toBe(cookie);
    const body = await again.json();
    expect(body.daily_outflow.limit_cents).toBe(500_000);
  });

  it("is Secure over HTTPS (directly or behind a proxy) and not over plain HTTP", async () => {
    const direct = await sessionGet(new Request("https://coin.test/api/session", { headers: { cookie } }));
    expect(direct.headers.get("set-cookie")).toContain("Secure");
    const proxied = await sessionGet(
      new Request("http://coin.test/api/session", { headers: { cookie, "x-forwarded-proto": "https" } }),
    );
    expect(proxied.headers.get("set-cookie")).toContain("Secure");
    const plain = await sessionGet(new Request("http://coin.test/api/session", { headers: { cookie } }));
    expect(plain.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("caps new sessions per visitor IP (429, friendly message)", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 21; i += 1) {
      last = await sessionGet(new Request("http://coin.test/api/session", { headers: { "x-forwarded-for": "9.9.9.9" } }));
    }
    expect(last?.status).toBe(429);
    expect((await last!.json()).error).toMatch(/Try again/);
  });

  it("sets HttpOnly and SameSite=Lax", async () => {
    const response = await sessionGet(new Request("http://coin.test/api/session"));
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
  });
});

describe("approve, then execute now, over HTTP", () => {
  it("moves the money once", async () => {
    const card = await proposeInSession("Move $2,000 from savings to chequing", move2000);
    const approved = await approvePost(post(`/api/actions/${card.action_id}/approve`), route(card.action_id));
    expect(approved.status).toBe(200);
    expect((await approved.json()).status).toBe("pending_undo");

    const executed = await executePost(post(`/api/actions/${card.action_id}/execute-now`), route(card.action_id));
    expect((await executed.json()).status).toBe("executed");

    const list = await listGet(new Request("http://coin.test/api/actions?status=executed", { headers: { cookie } }));
    expect((await list.json()).map((c: ActionCard) => c.action_id)).toEqual([card.action_id]);
  });
});

describe("status codes", () => {
  it("404 for a malformed or unknown action id", async () => {
    expect((await approvePost(post("/api/actions/nope/approve"), route("nope"))).status).toBe(404);
    const unknown = "5b6c1f2a-1111-4222-8333-444455556666";
    expect((await approvePost(post(`/api/actions/${unknown}/approve`), route(unknown))).status).toBe(404);
  });

  it("404 when another visitor tries to approve my action", async () => {
    const card = await proposeInSession("Move $2,000 from savings to chequing", move2000);
    const stranger = await approvePost(
      post(`/api/actions/${card.action_id}/approve`, undefined, ""),
      route(card.action_id),
    );
    expect(stranger.status).toBe(404);
  });

  it("409 for a transition that is no longer allowed", async () => {
    const card = await proposeInSession("Move $2,000 from savings to chequing", move2000);
    await dismissPost(post(`/api/actions/${card.action_id}/dismiss`), route(card.action_id));
    const late = await approvePost(post(`/api/actions/${card.action_id}/approve`), route(card.action_id));
    expect(late.status).toBe(409);
    expect((await late.json()).error).toMatch(/no longer waiting/);

    const undoLate = await undoPost(post(`/api/actions/${card.action_id}/undo`), route(card.action_id));
    expect(undoLate.status).toBe(409);
  });

  it("422 for an invalid recipient email, with no internals leaked", async () => {
    const card = await proposeInSession("Send $200 to Alex", {
      type: "etransfer",
      from_account_id: "acc_chequing",
      contact_id: null,
      new_recipient_name: "Alex",
      new_recipient_email: null,
      amount_cad: 200,
      memo: null,
      rationale: "",
    });
    const response = await confirmPost(
      post(`/api/actions/${card.action_id}/confirm-recipient`, { email: "not an email" }),
      route(card.action_id),
    );
    expect(response.status).toBe(422);
    const body = JSON.stringify(await response.json());
    expect(body).not.toMatch(/zod|stack|select|insert/i);
  });

  it("a blocked card cannot be approved (409 with the rule's message)", async () => {
    const card = await proposeInSession("Send $400 to Alex", {
      type: "etransfer",
      from_account_id: "acc_chequing",
      contact_id: null,
      new_recipient_name: "Alex",
      new_recipient_email: null,
      amount_cad: 400,
      memo: null,
      rationale: "",
    });
    expect(card.status).toBe("blocked");
    const response = await approvePost(post(`/api/actions/${card.action_id}/approve`), route(card.action_id));
    expect(response.status).toBe(409);
  });
});
