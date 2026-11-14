import {
  addDays, daysBetween, PERSONA, SPENDING_KINDS,
  type AccountId, type HoldingView, type SpendingRow, type Transaction,
} from "../../contracts";
import { holdingsAt } from "../../../scripts/seed/generate";
import * as q from "../db/queries";
import type { Tx } from "../db/types";

export async function holdingViews(db: Tx, sid: string): Promise<HoldingView[]> {
  const [hs, ps, session] = await Promise.all([
    q.holdings(db, sid), q.prices(db, sid), q.sessionInfo(db, sid),
  ]);
  const latest = new Map<string, number>();
  for (const p of ps) if (p.date <= session.today_date) latest.set(p.ticker, p.close_cents);
  const total = hs.reduce((sum, h) => sum + h.quantity * (latest.get(h.ticker) ?? 0), 0);
  return hs.map(h => {
    const price = latest.get(h.ticker) ?? 0;
    const value = h.quantity * price;
    return { ...h, last_price_cents: price, market_value_cents: value,
      unrealized_gain_cents: value - h.quantity * h.avg_cost_cents,
      weight_of_portfolio: total ? value / total : 0 };
  });
}

type SpendingGroup = "category" | "merchant" | "month" | "week";

function spendingKey(row: Transaction, group: SpendingGroup): string {
  if (group === "month") return row.posted_on.slice(0, 7);
  if (group === "week") {
    const weekday = new Date(`${row.posted_on}T00:00:00Z`).getUTCDay();
    return addDays(row.posted_on, -((weekday + 6) % 7));
  }
  return row[group];
}

export function spending(
  rows: Transaction[], from: string, to: string, group: SpendingGroup,
  account: AccountId | null = null, category: string | null = null,
): SpendingRow[] {
  const totals = new Map<string, SpendingRow>();
  for (const row of rows) {
    if (row.posted_on < from || row.posted_on > to || !SPENDING_KINDS.includes(row.kind)) continue;
    if ((account && row.account_id !== account) || (category && row.category !== category)) continue;
    const key = spendingKey(row, group);
    const item = totals.get(key) ?? { key, total_cents: 0, count: 0 };
    item.total_cents -= row.amount_cents;
    item.count++;
    totals.set(key, item);
  }
  return [...totals.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function cashflow(db: Tx, sid: string, from: string, to: string) {
  const [bs, session, accounts] = await Promise.all([
    q.bills(db, sid), q.sessionInfo(db, sid), q.accounts(db, sid),
  ]);
  const card = accounts.find(a => a.id === "acc_card");
  const events = bs.filter(b => b.saved && b.due_date >= from && b.due_date <= to)
    .map(b => ({
      label: b.payee, date: b.due_date,
      amount_cents: -(b.id === "bill_card"
        ? card?.statement_balance_cents ?? b.amount_cents : b.amount_cents),
    }));
  const anchor = addDays(PERSONA.pay.anchor_payday, session.date_offset_days);
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (daysBetween(anchor, date) % 14 === 0) {
      events.push({ label: "Payday", date, amount_cents: PERSONA.pay.net_cents });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export async function portfolioSeries(
  db: Tx, sid: string, from: string, to: string, account: AccountId | null, interval: "week" | "month",
) {
  const [ps, session] = await Promise.all([q.prices(db, sid), q.sessionInfo(db, sid)]);
  const result: { date: string; value_cents: number }[] = [];
  for (let date = from; date <= to;) {
    const hs = holdingsAt(addDays(date, -session.date_offset_days));
    let value = 0;
    for (const h of hs) {
      if (account && h.account_id !== account) continue;
      const price = ps.filter(p => p.ticker === h.ticker && p.date <= date).at(-1);
      value += h.quantity * (price?.close_cents ?? 0);
    }
    result.push({ date, value_cents: value });
    if (date === to) break;
    const next = interval === "week" ? addDays(date, 7) : addDays(date, 30);
    date = next > to ? to : next;
  }
  return result;
}
