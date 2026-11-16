/**
 * The bigger-picture answers, computed in code from the visitor's ledger:
 * monthly cash flow and savings rate, how this month compares with a typical
 * one, the credit card's position, a savings goal's timeline, and what moved
 * net worth. The model never adds these up itself.
 */
import {
  addDays,
  CASH_ACCOUNT_TYPES,
  INVESTMENT_ACCOUNT_TYPES,
  type Account,
  type Transaction,
  type TxnKind,
} from "../../contracts";
import * as q from "../db/queries";
import type { Tx } from "../db/types";
import { clampToHistory, holdingViews, portfolioSeries, spending } from "./data";

/** Money arriving from outside the visitor's own accounts. */
const INCOME_KINDS: readonly TxnKind[] = ["income", "interest", "dividend", "etransfer_in"];
const TYPICAL_MONTHS = 3;

export interface MonthFlow {
  /** "2026-11" */
  month: string;
  income_cents: number;
  spending_cents: number;
  saved_cents: number;
  /** Share of income kept (0..1), or null in a month with no income. */
  savings_rate: number | null;
  /** The current month, still in progress. */
  partial: boolean;
}

/** The last `count` calendar months ending with today's, oldest first. */
export function monthKeys(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    keys.push(date.toISOString().slice(0, 7));
  }
  return keys;
}

function monthEnd(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}

export function cashFlowByMonth(transactions: Transaction[], today: string, months: number): MonthFlow[] {
  return monthKeys(today, months).map((month) => {
    const from = `${month}-01`;
    const to = monthEnd(month) < today ? monthEnd(month) : today;
    const income = transactions
      .filter((t) => t.posted_on >= from && t.posted_on <= to && INCOME_KINDS.includes(t.kind))
      .reduce((sum, t) => sum + t.amount_cents, 0);
    const spent = spending(transactions, from, to, "month").reduce((sum, row) => sum + row.total_cents, 0);
    return {
      month,
      income_cents: income,
      spending_cents: spent,
      saved_cents: income - spent,
      savings_rate: ratio(income - spent, income),
      partial: month === today.slice(0, 7),
    };
  });
}

export interface TypicalMonth {
  /** How many complete months the averages cover. */
  months_averaged: number;
  income_cents: number;
  spending_cents: number;
  saved_cents: number;
  savings_rate: number | null;
}

/** Averages over the complete months only; the month in progress would drag them down. */
export function typicalMonth(flows: MonthFlow[]): TypicalMonth {
  const complete = flows.filter((flow) => !flow.partial);
  const count = Math.max(1, complete.length);
  const average = (pick: (flow: MonthFlow) => number) =>
    Math.round(complete.reduce((sum, flow) => sum + pick(flow), 0) / count);
  const income = average((flow) => flow.income_cents);
  const spent = average((flow) => flow.spending_cents);
  return {
    months_averaged: complete.length,
    income_cents: income,
    spending_cents: spent,
    saved_cents: income - spent,
    savings_rate: ratio(income - spent, income),
  };
}

export interface CategoryPace {
  category: string;
  this_month_cents: number;
  typical_month_cents: number;
  /** This month so far as a percentage of a typical month (100 = already a full typical month). */
  percent_of_typical: number | null;
}

/** This month's spending per category beside the average of the three months before it. */
export function categoryPace(transactions: Transaction[], today: string): CategoryPace[] {
  const [oldest, , newest, current] = monthKeys(today, TYPICAL_MONTHS + 1);
  const before = spending(transactions, `${oldest}-01`, monthEnd(newest), "category");
  const now = spending(transactions, `${current}-01`, today, "category");
  const categories = new Set([...before.map((row) => row.key), ...now.map((row) => row.key)]);
  const rows = [...categories].map((category) => {
    const soFar = now.find((row) => row.key === category)?.total_cents ?? 0;
    const typical = Math.round((before.find((row) => row.key === category)?.total_cents ?? 0) / TYPICAL_MONTHS);
    return {
      category,
      this_month_cents: soFar,
      typical_month_cents: typical,
      percent_of_typical: typical > 0 ? Math.round((soFar / typical) * 100) : null,
    };
  });
  return rows.sort((a, b) => b.this_month_cents - a.this_month_cents);
}

export interface CardPosition {
  owed_cents: number;
  limit_cents: number | null;
  /** Share of the limit in use (0..1). */
  utilisation: number | null;
  statement_balance_cents: number;
  statement_due_date: string | null;
  /** Pay this much by the due date and no interest is charged. */
  pay_by_due_date_to_avoid_interest_cents: number;
  annual_rate_percent: number | null;
  /** Roughly one month of interest on the statement balance if it isn't paid. */
  interest_if_unpaid_one_month_cents: number;
}

export function cardPosition(card: Account): CardPosition {
  const statement = card.statement_balance_cents ?? 0;
  const rateBps = card.interest_rate_bps ?? 0;
  return {
    owed_cents: card.balance_cents,
    limit_cents: card.limit_cents,
    utilisation: card.limit_cents ? ratio(card.balance_cents, card.limit_cents) : null,
    statement_balance_cents: statement,
    statement_due_date: card.statement_due_date,
    pay_by_due_date_to_avoid_interest_cents: statement,
    annual_rate_percent: card.interest_rate_bps === null ? null : rateBps / 100,
    interest_if_unpaid_one_month_cents: Math.round((statement * rateBps) / 10_000 / 12),
  };
}

export interface GoalPlan {
  target_cents: number;
  monthly_saving_cents: number;
  /** Null when nothing is being saved, so the goal has no date. */
  months_needed: number | null;
  reached_in_month: string | null;
  /** Cumulative savings month by month, for the chart. */
  path: Array<{ month: string; saved_cents: number }>;
}

const LONGEST_PLAN_MONTHS = 600;

/** Months to save `target` from zero at the typical monthly saving. */
export function goalPlan(targetCents: number, monthlySavingCents: number, today: string): GoalPlan {
  const base = { target_cents: targetCents, monthly_saving_cents: monthlySavingCents };
  const months = monthlySavingCents > 0 ? Math.ceil(targetCents / monthlySavingCents) : null;
  if (months === null || months > LONGEST_PLAN_MONTHS) {
    return { ...base, months_needed: null, reached_in_month: null, path: [] };
  }
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const path = Array.from({ length: months + 1 }, (_, step) => ({
    month: new Date(Date.UTC(year, month - 1 + step, 1)).toISOString().slice(0, 7),
    saved_cents: Math.min(targetCents, monthlySavingCents * step),
  }));
  return { ...base, months_needed: months, reached_in_month: path[months].month, path };
}

/* ------------------------------------------------------------------ loaders */

export async function loadCashFlow(db: Tx, sid: string, months: number) {
  const [transactions, session] = await Promise.all([q.transactions(db, sid), q.sessionInfo(db, sid)]);
  const today = session.today_date;
  // "Typical" always means the same recent complete months, however far back the caller looks.
  const typical = typicalMonth(cashFlowByMonth(transactions, today, TYPICAL_MONTHS + 1));
  return { months: cashFlowByMonth(transactions, today, months), typical_month: typical };
}

export async function loadCategoryPace(db: Tx, sid: string) {
  const [transactions, session] = await Promise.all([q.transactions(db, sid), q.sessionInfo(db, sid)]);
  const today = session.today_date;
  const daysInMonth = Number(monthEnd(today.slice(0, 7)).slice(8));
  return {
    percent_of_month_gone: Math.round((Number(today.slice(8)) / daysInMonth) * 100),
    note: "A category whose percent_of_typical is above percent_of_month_gone is running ahead of a typical month. Rent and other once-a-month bills land on their own dates.",
    categories: categoryPace(transactions, today),
  };
}

export async function loadGoalPlan(db: Tx, sid: string, targetCents: number): Promise<GoalPlan> {
  const [transactions, session] = await Promise.all([q.transactions(db, sid), q.sessionInfo(db, sid)]);
  const flows = cashFlowByMonth(transactions, session.today_date, TYPICAL_MONTHS + 1);
  return goalPlan(targetCents, typicalMonth(flows).saved_cents, session.today_date);
}

const sumOf = (accounts: Account[], pick: (account: Account) => number) =>
  accounts.reduce((sum, account) => sum + pick(account), 0);

export async function loadSnapshot(db: Tx, sid: string) {
  const [accounts, holdings, flow] = await Promise.all([
    q.accounts(db, sid), holdingViews(db, sid), loadCashFlow(db, sid, TYPICAL_MONTHS + 1),
  ]);
  const cash = sumOf(accounts.filter((a) => CASH_ACCOUNT_TYPES.includes(a.type)), (a) => a.balance_cents);
  const investmentCash = sumOf(accounts.filter((a) => INVESTMENT_ACCOUNT_TYPES.includes(a.type)), (a) => a.balance_cents);
  const invested = holdings.reduce((sum, h) => sum + h.market_value_cents, 0);
  const card = accounts.find((a) => a.type === "credit_card");
  const owed = card?.balance_cents ?? 0;
  const typical = flow.typical_month;
  return {
    net_worth_cents: cash + investmentCash + invested - owed,
    cash_cents: cash,
    investments_cents: investmentCash + invested,
    card: card ? cardPosition(card) : null,
    typical_month: typical,
    /** Months of typical spending the cash on hand would cover. */
    cash_covers_months: typical.spending_cents > 0 ? Math.round((cash / typical.spending_cents) * 10) / 10 : null,
  };
}

/** Balance on `date`: today's balance with every later transaction undone. */
function balanceOn(account: Account, transactions: Transaction[], date: string): number {
  const later = transactions
    .filter((t) => t.account_id === account.id && t.posted_on > date)
    .reduce((sum, t) => sum + t.amount_cents, 0);
  // A card's balance is what is owed: purchases (negative amounts) raise it.
  return account.type === "credit_card" ? account.balance_cents + later : account.balance_cents - later;
}

/** What moved net worth over the last `months`: cash, market gains, contributions, card debt. */
export async function loadNetWorthChange(db: Tx, sid: string, months: number) {
  const today = (await q.sessionInfo(db, sid)).today_date;
  // Twelve months is the same 365 days the net worth chart draws.
  const from = clampToHistory(addDays(today, -Math.round((months * 365) / 12)), today);
  const [accounts, transactions, startValue, endValue] = await Promise.all([
    q.accounts(db, sid), q.transactions(db, sid),
    portfolioSeries(db, sid, from, from, null, "month"), portfolioSeries(db, sid, today, today, null, "month"),
  ]);
  const group = (types: readonly string[]) => accounts.filter((a) => types.includes(a.type));
  const change = (list: Account[]) =>
    sumOf(list, (a) => a.balance_cents) - sumOf(list, (a) => balanceOn(a, transactions, from));
  const investmentIds = group(INVESTMENT_ACCOUNT_TYPES).map((a) => a.id);
  const contributions = transactions
    .filter((t) => t.posted_on > from && investmentIds.includes(t.account_id))
    .filter((t) => t.kind === "transfer_in" || t.kind === "transfer_out")
    .reduce((sum, t) => sum + t.amount_cents, 0);
  const investments = change(group(INVESTMENT_ACCOUNT_TYPES)) + endValue[0].value_cents - startValue[0].value_cents;
  const cash = change(group(CASH_ACCOUNT_TYPES));
  const cardOwed = change(group(["credit_card"]));
  return {
    from,
    to: today,
    net_worth_change_cents: cash + investments - cardOwed,
    cash_change_cents: cash,
    investments_change_cents: investments,
    of_which_contributions_cents: contributions,
    of_which_market_gains_and_income_cents: investments - contributions,
    card_owed_change_cents: cardOwed,
  };
}
