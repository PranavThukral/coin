import { addDays, fillDateTokens, SINCE_LAST_VISIT, type AccountId, type OverviewPayload } from "../contracts";
import type { Tx } from "./db/types";
import * as q from "./db/queries";
import { holdingViews } from "./tools/data";

export async function getOverview(db: Tx, sid: string, accountId: AccountId | null): Promise<OverviewPayload> {
  const today = (await q.sessionInfo(db, sid)).today_date;
  if (!accountId) return { scope: "all", greeting: "Since your last visit", items: SINCE_LAST_VISIT.items.map(item => ({ ...item, detail: fillDateTokens(item.detail, today) })) };
  const [accounts, tx, bills, hs] = await Promise.all([q.accounts(db, sid), q.transactions(db, sid), q.bills(db, sid), holdingViews(db, sid)]);
  const account = accounts.find(a => a.id === accountId);
  if (!account) throw new Error("Account not found");
  const recent = tx.filter(t => t.account_id === accountId && t.posted_on >= addDays(today, -29) && t.posted_on <= today);
  const incoming = recent.filter(t => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0);
  const outgoing = -recent.filter(t => t.amount_cents < 0).reduce((s, t) => s + t.amount_cents, 0);
  const items: OverviewPayload["items"] = [
    { kind: "balance", title: "Balance", detail: account.name, amount_cents: account.balance_cents },
    { kind: "in", title: "Money in, last 30 days", detail: "Transactions received", amount_cents: incoming },
    { kind: "out", title: "Money out, last 30 days", detail: "Transactions sent", amount_cents: outgoing },
  ];
  const own = hs.filter(h => h.account_id === accountId);
  if (own.length) {
    const top = [...own].sort((a, b) => b.market_value_cents - a.market_value_cents)[0];
    items.push({ kind: "holdings", title: "Investments", detail: `Top holding: ${top.ticker}; unrealized gain: ${own.reduce((s, h) => s + h.unrealized_gain_cents, 0)} cents`, amount_cents: own.reduce((s, h) => s + h.market_value_cents, 0) });
  } else {
    const due = bills.find(b => b.saved && b.due_date >= today && (accountId !== "acc_card" || b.id === "bill_card"));
    if (due) items.push({ kind: "due", title: "Next due", detail: `${due.payee}, ${due.due_date}`, amount_cents: due.amount_cents });
  }
  return { scope: accountId, greeting: account.name, items };
}
