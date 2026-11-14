import { randomUUID } from "node:crypto";
import { addDays, ChartRequest, type ChartPayload, type ChartSource } from "../../contracts";
import type { Tx } from "../db/types";
import * as q from "../db/queries";
import { cashflow, holdingViews, portfolioSeries, spending } from "./data";

type Context = { db: Tx; sid: string; req: ChartRequest; today: string; from: string; to: string };
type Result = Pick<ChartPayload, "data"> &
  Partial<Pick<ChartPayload, "kind" | "x" | "series" | "highlight">>;
type Builder = (context: Context) => Promise<Result>;

async function spendingChart(context: Context, group: "category" | "month" | "merchant"): Promise<Result> {
  const { db, sid, req, from, to } = context;
  const rows = spending(await q.transactions(db, sid), from, to, group, req.account_id, req.category);
  let data = rows.map(row => ({ x: row.key, value: row.total_cents }));
  if (group === "merchant") data = data.sort((a, b) => b.value - a.value).slice(0, 10);
  return { data, kind: "bar", x: { key: "x", type: group === "month" ? "date" : "category" } };
}

async function spendingByCategory(context: Context): Promise<Result> {
  return spendingChart(context, "category");
}

async function spendingByMonth(context: Context): Promise<Result> {
  return spendingChart(context, "month");
}

async function topMerchants(context: Context): Promise<Result> {
  return spendingChart(context, "merchant");
}

async function categoryChange({ db, sid, req, from, to }: Context): Promise<Result> {
  const tx = await q.transactions(db, sid);
  const a = spending(
    tx, req.compare_from ?? addDays(from, -30), req.compare_to ?? addDays(from, -1), "category",
  );
  const b = spending(tx, from, to, "category");
  const keys = new Set([...a.map(row => row.key), ...b.map(row => row.key)]);
  const data = [...keys].map(key => ({
    x: key,
    a: a.find(row => row.key === key)?.total_cents ?? 0,
    b: b.find(row => row.key === key)?.total_cents ?? 0,
  }));
  const largest = [...data].sort((l, r) => r.b - r.a - (l.b - l.a))[0];
  let highlight: ChartPayload["highlight"] = null;
  if (largest && largest.b > largest.a) {
    highlight = { x: largest.x, series: "b", label: "Largest increase" };
  }
  return {
    data, highlight, kind: "grouped_bar", x: { key: "x", type: "category" },
    series: [{ key: "a", label: "Previous" }, { key: "b", label: "Current" }],
  };
}

async function allocationByHolding({ db, sid, req }: Context): Promise<Result> {
  const holdings = (await holdingViews(db, sid))
    .filter(h => !req.account_id || h.account_id === req.account_id);
  const values = new Map<string, number>();
  for (const holding of holdings) {
    values.set(holding.ticker, (values.get(holding.ticker) ?? 0) + holding.market_value_cents);
  }
  const data = [...values].map(([x, value]) => ({ x, value }));
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const biggest = [...data].sort((a, b) => b.value - a.value)[0];
  let highlight: ChartPayload["highlight"] = null;
  if (biggest && total && biggest.value / total > 0.2) {
    highlight = { x: biggest.x, series: "value", label: "Over 20% of holdings" };
  }
  return { data, highlight, kind: "donut", x: { key: "x", type: "category" } };
}

async function allocationByAccount({ db, sid }: Context): Promise<Result> {
  const accounts = await q.accounts(db, sid);
  const holdings = await holdingViews(db, sid);
  const data = accounts.filter(account => account.type !== "credit_card").map(account => ({
    x: account.name,
    value: account.balance_cents + holdings.filter(h => h.account_id === account.id)
      .reduce((sum, h) => sum + h.market_value_cents, 0),
  }));
  return { data, kind: "donut", x: { key: "x", type: "category" } };
}

async function portfolioValue({ db, sid, req, from, to }: Context): Promise<Result> {
  const rows = await portfolioSeries(db, sid, from, to, req.account_id, "month");
  return { data: rows.map(row => ({ x: row.date, value: row.value_cents })) };
}

async function priceHistory({ db, sid, req, from, to }: Context): Promise<Result> {
  if (!req.ticker) throw new Error("Ticker required");
  const rows = (await q.prices(db, sid))
    .filter(p => p.ticker === req.ticker && p.date >= from && p.date <= to);
  return { data: rows.map(row => ({ x: row.date, value: row.close_cents })) };
}

async function upcomingCashflow({ db, sid, req, today }: Context): Promise<Result> {
  let balance = (await q.accounts(db, sid)).find(a => a.id === "acc_chequing")?.balance_cents ?? 0;
  const data = [{ x: today, value: balance }];
  for (const event of await cashflow(db, sid, today, addDays(today, req.days ?? 30))) {
    balance += event.amount_cents;
    data.push({ x: event.date, value: balance });
  }
  return { data, kind: "step" };
}

async function balanceHistory(context: Context, netWorth: boolean): Promise<Result> {
  const { db, sid, req, from, to } = context;
  if (!netWorth && !req.account_id) throw new Error("Account required");
  const [accounts, tx, series] = await Promise.all([
    q.accounts(db, sid), q.transactions(db, sid), portfolioSeries(db, sid, from, to, null, "month"),
  ]);
  const selected = accounts.filter(account => !req.account_id || account.id === req.account_id);
  const data = series.map(point => {
    const balances = selected.reduce((sum, account) => {
      const after = tx.filter(t => t.account_id === account.id && t.posted_on > point.date)
        .reduce((total, t) => total + t.amount_cents, 0);
      if (account.type === "credit_card") {
        return sum + (netWorth ? -account.balance_cents - after : account.balance_cents + after);
      }
      return sum + account.balance_cents - after;
    }, 0);
    return { x: point.date, value: balances + (netWorth ? point.value_cents : 0) };
  });
  return { data, kind: netWorth ? "area" : "line" };
}

async function netWorth(context: Context): Promise<Result> {
  return balanceHistory(context, true);
}

async function accountBalance(context: Context): Promise<Result> {
  return balanceHistory(context, false);
}

const CHART_BUILDERS: Record<ChartSource, Builder> = {
  spending_by_category: spendingByCategory,
  spending_by_month: spendingByMonth,
  top_merchants: topMerchants,
  category_change: categoryChange,
  net_worth_over_time: netWorth,
  portfolio_value_over_time: portfolioValue,
  allocation_by_holding: allocationByHolding,
  allocation_by_account: allocationByAccount,
  account_balance_over_time: accountBalance,
  upcoming_cashflow: upcomingCashflow,
  price_history: priceHistory,
};

export async function buildChart(db: Tx, sid: string, request: ChartRequest): Promise<ChartPayload> {
  const req = ChartRequest.parse(request);
  const today = (await q.sessionInfo(db, sid)).today_date;
  const monthly = ["spending_by_category", "top_merchants", "category_change"].includes(req.source);
  const from = req.from ?? (monthly ? `${today.slice(0, 7)}-01` : addDays(today, -365));
  const to = req.to ?? today;
  const result = await CHART_BUILDERS[req.source]({ db, sid, req, today, from, to });
  return {
    id: randomUUID(), source: req.source, kind: req.kind ?? result.kind ?? "line", title: req.title,
    subtitle: null, x: result.x ?? { key: "x", type: "date" },
    series: result.series ?? [{ key: "value", label: "Value" }], data: result.data,
    value_format: "cad", highlight: result.highlight ?? null,
  };
}
