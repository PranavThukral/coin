import type { Account, Bill, Contact, Holding, Room, Transaction } from "../../contracts";
import type { Tx } from "./types";

export async function sessionInfo(db: Tx, sessionId: string) {
  const [session] = await db.query<{ today_date: string; date_offset_days: number }>(
    "select today_date, date_offset_days from sessions where id = $1", [sessionId],
  );
  if (!session) throw new Error("Session not found");
  return session;
}

export const accounts = (db: Tx, sessionId: string) => db.query<Account>(
  "select id, type, name, institution_label, mask, balance_cents, opening_balance_cents, limit_cents, statement_balance_cents, statement_due_date, interest_rate_bps from accounts where session_id = $1 order by id", [sessionId],
);
export const transactions = (db: Tx, sessionId: string) => db.query<Transaction>(
  "select id, account_id, posted_on, amount_cents, merchant, description, category, kind, transfer_group_id, action_id from transactions where session_id = $1 order by posted_on desc, id desc", [sessionId],
);
export const bills = (db: Tx, sessionId: string) => db.query<Bill>(
  "select id, payee, amount_cents, due_date, recurrence, category, saved, memo from bills where session_id = $1 order by due_date, id", [sessionId],
);
export const contacts = (db: Tx, sessionId: string) => db.query<Contact>(
  "select id, name, email, saved from contacts where session_id = $1 order by id", [sessionId],
);
export const room = (db: Tx, sessionId: string) => db.query<Room>(
  "select account_type, year, room_remaining_cents from room where session_id = $1 order by account_type, year", [sessionId],
);
export const holdings = (db: Tx, sessionId: string) => db.query<Holding & { name: string }>(
  "select h.account_id, h.ticker, h.quantity, h.avg_cost_cents, s.name from holdings h join securities s on s.ticker = h.ticker where h.session_id = $1 order by h.account_id, h.ticker", [sessionId],
);
export const prices = (db: Tx, sessionId: string) => db.query<{ ticker: string; date: string; close_cents: number }>(
  "select ticker, date, close_cents from session_prices($1) order by date, ticker", [sessionId],
);
