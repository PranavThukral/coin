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

export async function loadRuleContext(
  db: Tx,
  sessionId: string,
  messageId: string,
  actionId?: string,
): Promise<RuleContext> {
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
  return {
    user_message: { id: messages[0].id, text: messages[0].content },
    accounts, bills, contacts, room, holdings,
    prices: Object.fromEntries(priceRows.map((row) => [row.ticker, row.close_cents])),
    daily_used_cents: outflow.used_cents - ownAmount,
    limits: RULE_LIMITS,
    today: outflow.date,
    confirmed_recipient_email: confirmed[0]?.email ?? null,
  };
}
