/**
 * Coin's header summary. With no account open: the pre-written "since you
 * were last here" items, with dates filled in for the visitor's today. With an
 * account open: a few computed facts about that account.
 */
import {
  addDays,
  fillDateTokens,
  SINCE_LAST_VISIT,
  type Account,
  type AccountId,
  type Bill,
  type HoldingView,
  type OverviewPayload,
  type Transaction,
} from "../contracts";
import { money, relativeDay, shortDate } from "../lib/format";
import * as q from "./db/queries";
import type { Tx } from "./db/types";
import { AppError } from "./errors";
import { holdingViews } from "./tools/data";

type Item = OverviewPayload["items"][number];

function balanceItem(account: Account, holdings: HoldingView[], today: string): Item {
  if (account.type === "credit_card") {
    const due = account.statement_due_date;
    const when = due ? `Statement due ${shortDate(due)}, ${relativeDay(due, today)}.` : "No statement due.";
    return { kind: "owed", title: "Amount owed", detail: when, amount_cents: -account.balance_cents };
  }
  if (holdings.length > 0) {
    const invested = holdings.reduce((sum, h) => sum + h.market_value_cents, 0);
    return {
      kind: "value",
      title: "Total value",
      detail: `${money(invested)} invested, ${money(account.balance_cents)} in cash.`,
      amount_cents: invested + account.balance_cents,
    };
  }
  return { kind: "balance", title: "Balance", detail: "Available now.", amount_cents: account.balance_cents };
}

function flowItems(transactions: Transaction[]): Item[] {
  const incoming = transactions.filter((t) => t.amount_cents > 0);
  const outgoing = transactions.filter((t) => t.amount_cents < 0);
  const total = (rows: Transaction[]) => rows.reduce((sum, t) => sum + t.amount_cents, 0);
  const count = (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"}.`;
  return [
    { kind: "in", title: "Money in, last 30 days", detail: count(incoming.length), amount_cents: total(incoming) },
    { kind: "out", title: "Money out, last 30 days", detail: count(outgoing.length), amount_cents: total(outgoing) },
  ];
}

function holdingsItem(holdings: HoldingView[]): Item {
  const value = holdings.reduce((sum, h) => sum + h.market_value_cents, 0);
  const gain = holdings.reduce((sum, h) => sum + h.unrealized_gain_cents, 0);
  const top = [...holdings].sort((a, b) => b.market_value_cents - a.market_value_cents)[0];
  const share = value > 0 ? Math.round((top.market_value_cents / value) * 100) : 0;
  return {
    kind: "holdings",
    title: "Unrealized gain",
    detail: `Largest holding: ${top.ticker}, ${share}% of this account.`,
    amount_cents: gain,
  };
}

function nextDueItem(bills: Bill[], accountId: AccountId, today: string): Item | null {
  const due = bills.find(
    (b) => b.saved && b.amount_cents > 0 && b.due_date >= today && (accountId !== "acc_card" || b.id === "bill_card"),
  );
  if (!due) return null;
  return {
    kind: "due",
    title: "Next bill",
    detail: `${due.payee}, due ${shortDate(due.due_date)} (${relativeDay(due.due_date, today)}).`,
    amount_cents: -due.amount_cents,
  };
}

export async function getOverview(db: Tx, sid: string, accountId: AccountId | null): Promise<OverviewPayload> {
  const today = (await q.sessionInfo(db, sid)).today_date;
  if (!accountId) {
    return {
      scope: "all",
      greeting: "Since your last visit",
      items: SINCE_LAST_VISIT.items.map((item) => ({ ...item, detail: fillDateTokens(item.detail, today) })),
    };
  }

  const [accounts, transactions, bills, allHoldings] = await Promise.all([
    q.accounts(db, sid), q.transactions(db, sid), q.bills(db, sid), holdingViews(db, sid),
  ]);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new AppError("not_found", "Account not found");

  const holdings = allHoldings.filter((h) => h.account_id === accountId);
  const recent = transactions.filter(
    (t) => t.account_id === accountId && t.posted_on >= addDays(today, -29) && t.posted_on <= today,
  );

  const items: Item[] = [balanceItem(account, holdings, today), ...flowItems(recent)];
  let extra: Item | null = null;
  if (holdings.length > 0) extra = holdingsItem(holdings);
  else if (account.type !== "credit_card") extra = nextDueItem(bills, accountId, today);
  if (extra) items.push(extra);
  return { scope: accountId, greeting: account.name, items };
}
