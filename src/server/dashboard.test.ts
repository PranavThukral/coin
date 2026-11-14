/**
 * GET /api/dashboard through the real route handler: the "this month" figure
 * is net worth now minus net worth at the end of last month, from exact points.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as dashboardGet } from "../app/api/dashboard/route";
import { POST as confirmPost } from "../app/api/actions/[id]/confirm-recipient/route";
import { addDays } from "../contracts";
import { proposeAction } from "./actions/service";
import { seededTestDb, type SeededTestDb } from "./db/test-db";
import { useDbForTests } from "./session/http";

let f: SeededTestDb;
let cookie: string;

type Dashboard = { today: string; month_change_cents: number | null };

async function loadDashboard(): Promise<Dashboard> {
  const response = await dashboardGet(new Request("http://coin.test/api/dashboard", { headers: { cookie } }));
  cookie = (response.headers.get("set-cookie") ?? cookie).split(";")[0];
  return response.json();
}

const sessionId = () => cookie.split("=")[1];

/** A deposit into chequing on `date`, with the balance kept in step. */
async function deposit(date: string, cents: number, id: string): Promise<void> {
  await f.db.query(
    `insert into transactions (session_id, id, account_id, posted_on, amount_cents, merchant, description, category, kind)
     values ($1, $2, 'acc_chequing', $3, $4, 'Test deposit', 'Test deposit', 'income', 'income')`,
    [sessionId(), id, date, cents],
  );
  await f.db.query(
    "update accounts set balance_cents = balance_cents + $2 where session_id = $1 and id = 'acc_chequing'",
    [sessionId(), cents],
  );
}

beforeEach(async () => {
  f = await seededTestDb();
  useDbForTests(f.db);
  cookie = "";
}, 30_000);

afterEach(() => useDbForTests(null));

describe("dashboard month change", () => {
  it("counts money that arrived this month and ignores money that arrived before it", async () => {
    const before = await loadDashboard();
    expect(before.month_change_cents).not.toBeNull();
    const lastMonthEnd = addDays(`${before.today.slice(0, 7)}-01`, -1);

    await deposit(before.today, 100_000, "txn_test_today");
    const afterToday = await loadDashboard();
    expect(afterToday.month_change_cents).toBe(before.month_change_cents! + 100_000);

    await deposit(lastMonthEnd, 50_000, "txn_test_last_month");
    const afterLastMonth = await loadDashboard();
    expect(afterLastMonth.month_change_cents).toBe(afterToday.month_change_cents);
  });
});

describe("confirming a new recipient", () => {
  it("answers a mistyped email with a sentence the visitor can act on", async () => {
    await loadDashboard(); // creates the session
    const [message] = await f.db.query<{ id: string }>(
      "insert into messages (session_id, role, content) values ($1, 'user', 'Send $50 to Alex') returning id",
      [sessionId()],
    );
    const card = await proposeAction(f.db, sessionId(), message.id, {
      type: "etransfer",
      from_account_id: "acc_chequing",
      contact_id: null,
      new_recipient_name: "Alex",
      new_recipient_email: null,
      amount_cad: 50,
      memo: null,
      rationale: "",
    });
    const request = new Request(`http://coin.test/api/actions/${card.action_id}/confirm-recipient`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ email: "alex-at-example" }),
    });
    const response = await confirmPost(request, { params: Promise.resolve({ id: card.action_id }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "That doesn't look like an email address." });
  });
});
