import { AppError } from "../errors";
import {
  RULE_LIMITS,
  type Account,
  type Bill,
  type Contact,
  type DailyOutflow,
  type Holding,
  type Room,
  type RuleContext,
} from "../../contracts";
import type { Tx } from "../db/types";

type OutflowRow = {
  action_id: string;
  type: "bill_payment" | "etransfer";
  amount_cents: number;
  status: "pending_undo" | "executed";
  label: string;
};

export async function dailyOutflow(db: Tx, sessionId: string): Promise<DailyOutflow> {
  const sessions = await db.query<{ today_date: string }>(
    "select today_date from sessions where id = $1 and not is_template",
    [sessionId],
  );
  if (!sessions[0]) throw new AppError("not_found", "Session not found");
  const items = await db.query<OutflowRow>(
    `select a.id as action_id, a.type, (a.payload->>'amount_cents')::bigint as amount_cents,
       a.status, case when a.type = 'bill_payment' then coalesce(b.payee, a.payload->>'bill_id')
       when a.payload->'recipient'->>'kind' = 'saved' then coalesce(c.name, a.payload->'recipient'->>'contact_id')
       else a.payload->'recipient'->>'name' end as label
     from actions a join sessions s on s.id = a.session_id
     left join bills b on b.session_id = a.session_id and b.id = a.payload->>'bill_id'
     left join contacts c on c.session_id = a.session_id and c.id = a.payload->'recipient'->>'contact_id'
     where a.session_id = $1 and a.type in ('bill_payment', 'etransfer')
       and a.status in ('pending_undo', 'executed')
       and (a.created_at at time zone 'America/Toronto')::date = s.today_date
     order by a.created_at, a.id`,
    [sessionId],
  );
  const used = items.reduce((sum, item) => sum + item.amount_cents, 0);
  const pending = items.reduce((sum, item) => sum + (item.status === "pending_undo" ? item.amount_cents : 0), 0);
  return {
    date: sessions[0].today_date,
    used_cents: used,
    pending_cents: pending,
    remaining_cents: Math.max(0, RULE_LIMITS.daily_limit_cents - used),
    limit_cents: RULE_LIMITS.daily_limit_cents,
    items,
  };
}

const THREAD_MESSAGES = 3;

/**
 * The user's own recent messages, oldest first, ending with the request. It
 * reaches back only over messages whose actions the user has not approved
 * (they are still talking it through), so a request that already went ahead
 * never authorizes a later plan.
 */
async function requestThread(db: Tx, sessionId: string, messageId: string): Promise<string[]> {
  const rows = await db.query<{ content: string; acted: boolean; is_request: boolean }>(
    `select m.content, m.id = $2 as is_request,
       exists (select 1 from actions a where a.request_message_id = m.id
               and a.status in ('pending_undo', 'executed')) as acted
     from messages m
     where m.session_id = $1 and m.role = 'user'
       and m.created_at <= (select created_at from messages where id = $2)
     order by m.created_at desc, m.id desc limit $3`,
    [sessionId, messageId, THREAD_MESSAGES],
  );
  const thread: string[] = [];
  for (const row of rows) {
    if (!row.is_request && row.acted) break;
    thread.unshift(row.content);
  }
  return thread;
}

/**
 * A planned transfer moves the proceeds of the sales before it. Until those
 * sales execute, the cash isn't there, so for proposing and approving (never
 * for executing) the selling account is shown with those proceeds added.
 */
async function addPlannedProceeds(
  db: Tx, sessionId: string, messageId: string, actionId: string | undefined, accounts: Account[],
): Promise<void> {
  const sales = await db.query<{ account_id: string; proceeds: number }>(
    `select payload->>'account_id' as account_id,
       sum((payload->>'quantity')::bigint * (payload->>'price_cents')::bigint)::bigint as proceeds
     from actions
     where session_id = $1 and request_message_id = $2 and origin = 'plan' and type = 'trade'
       and status in ('proposed', 'pending_undo') and ($3::uuid is null or id <> $3)
     group by 1`,
    [sessionId, messageId, actionId ?? null],
  );
  for (const sale of sales) {
    const account = accounts.find((item) => item.id === sale.account_id);
    if (account) account.balance_cents += Number(sale.proceeds);
  }
}

export type ContextOptions = {
  actionId?: string;
  origin?: "message" | "plan";
  /** Count the proceeds of this plan's unsettled sales. Never set when executing. */
  withPlannedProceeds?: boolean;
};

export async function loadRuleContext(
  db: Tx,
  sessionId: string,
  messageId: string,
  options: ContextOptions = {},
): Promise<RuleContext> {
  const { actionId } = options;
  const messages = await db.query<{ id: string; content: string }>(
    "select id, content from messages where id = $1 and session_id = $2 and role = 'user'",
    [messageId, sessionId],
  );
  if (!messages[0]) throw new AppError("not_found", "User message not found");
  const accounts = await db.query<Account>("select * from accounts where session_id = $1", [sessionId]);
  const bills = await db.query<Bill>("select * from bills where session_id = $1", [sessionId]);
  const contacts = await db.query<Contact>("select * from contacts where session_id = $1", [sessionId]);
  const room = await db.query<Room>("select * from room where session_id = $1", [sessionId]);
  const holdings = await db.query<Holding>("select * from holdings where session_id = $1", [sessionId]);
  const priceRows = await db.query<{ ticker: string; close_cents: number }>(
    `select distinct on (p.ticker) p.ticker, p.close_cents from session_prices($1) p
     join sessions s on s.id = $1 where p.date <= s.today_date order by p.ticker, p.date desc`,
    [sessionId],
  );
  const outflow = await dailyOutflow(db, sessionId);
  const ownAmount = outflow.items.find((item) => item.action_id === actionId)?.amount_cents ?? 0;
  const confirmed = actionId ? await db.query<{ email: string | null }>(
    `select payload->'recipient'->>'email' as email from actions
     where id = $1 and session_id = $2 and second_confirmed_at is not null`,
    [actionId, sessionId],
  ) : [];
  let origin = options.origin ?? "message";
  if (actionId) {
    const [row] = await db.query<{ origin: "message" | "plan" }>(
      "select origin from actions where id = $1 and session_id = $2", [actionId, sessionId],
    );
    origin = row?.origin ?? origin;
  }
  if (origin === "plan" && options.withPlannedProceeds) {
    await addPlannedProceeds(db, sessionId, messageId, actionId, accounts);
  }
  return {
    origin,
    request_thread: await requestThread(db, sessionId, messageId),
    user_message: { id: messages[0].id, text: messages[0].content },
    accounts, bills, contacts, room, holdings,
    prices: Object.fromEntries(priceRows.map((row) => [row.ticker, row.close_cents])),
    daily_used_cents: outflow.used_cents - ownAmount,
    limits: RULE_LIMITS,
    today: outflow.date,
    confirmed_recipient_email: confirmed[0]?.email ?? null,
  };
}
