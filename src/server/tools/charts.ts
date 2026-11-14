import { randomUUID } from "node:crypto";
import { addDays, ChartRequest, type ChartPayload } from "../../contracts";
import type { Tx } from "../db/types";
import * as q from "../db/queries";
import { cashflow, holdingViews, portfolioSeries, spending } from "./data";

export async function buildChart(db: Tx, sid: string, request: ChartRequest): Promise<ChartPayload> {
  const req = ChartRequest.parse(request);
  const today = (await q.sessionInfo(db, sid)).today_date;
  const monthly = ["spending_by_category", "top_merchants", "category_change"].includes(req.source);
  const from = req.from ?? (monthly ? `${today.slice(0, 7)}-01` : addDays(today, -365));
  const to = req.to ?? today;
  let data: ChartPayload["data"] = [];
  let highlight: ChartPayload["highlight"] = null;
  let kind: ChartPayload["kind"] = "line";
  let xType: "date" | "category" = "date";
  let series = [{ key: "value", label: "Value" }];
  if (["spending_by_category", "spending_by_month", "top_merchants"].includes(req.source)) {
    const group = req.source === "spending_by_category" ? "category" : req.source === "top_merchants" ? "merchant" : "month";
    data = spending(await q.transactions(db, sid), from, to, group, req.account_id, req.category).map(r => ({ x: r.key, value: r.total_cents }));
    if (group === "merchant") data = data.sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 10);
    kind = "bar";
    xType = group === "month" ? "date" : "category";
  } else if (req.source === "category_change") {
    const tx = await q.transactions(db, sid);
    const a = spending(tx, req.compare_from ?? addDays(from, -30), req.compare_to ?? addDays(from, -1), "category");
    const b = spending(tx, from, to, "category");
    data = [...new Set([...a.map(r => r.key), ...b.map(r => r.key)])].map(key => ({ x: key, a: a.find(r => r.key === key)?.total_cents ?? 0, b: b.find(r => r.key === key)?.total_cents ?? 0 }));
    const largest = [...data].sort ( (l, r) => Number(r.b) - Number(r.a) - (Number(l.b) - Number(l.a)) )[0];
    if (largest && Number(largest.b) > Number(largest.a)) highlight = { x: String(largest.x), series: "b", label: "Largest increase" };
    series = [{ key: "a", label: "Previous" }, { key: "b", label: "Current" }];
    kind = "grouped_bar";
    xType = "category";
  } else if (req.source === "allocation_by_holding") {
    const hs = (await holdingViews(db, sid)).filter(h => !req.account_id || h.account_id === req.account_id);
    const values = new Map<string, number>();
    for (const h of hs) values.set(h.ticker, (values.get(h.ticker) ?? 0) + h.market_value_cents);
    data = [...values].map(([x, value]) => ({ x, value }));
    const total = data.reduce((sum, row) => sum + Number(row.value), 0);
    const biggest = [...data].sort((a, b) => Number(b.value) - Number(a.value))[0];
    if (biggest && total && Number(biggest.value) / total > 0.2) highlight = { x: String(biggest.x), series: "value", label: "Over 20% of holdings" };
    kind = "donut";
    xType = "category";
  } else if (req.source === "allocation_by_account") {
    const accounts = await q.accounts(db, sid);
    const hs = await holdingViews(db, sid);
    data = accounts.filter(a => a.type !== "credit_card").map(a => ({ x: a.name, value: a.balance_cents + hs.filter(h => h.account_id === a.id).reduce((s, h) => s + h.market_value_cents, 0) }));
    kind = "donut";
    xType = "category";
  } else if (req.source === "portfolio_value_over_time") {
    data = (await portfolioSeries(db, sid, from, to, req.account_id, "month")).map(r => ({ x: r.date, value: r.value_cents }));
  } else if (req.source === "price_history") {
    if (!req.ticker) throw new Error("Ticker required");
    data = (await q.prices(db, sid)).filter(p => p.ticker === req.ticker && p.date >= from && p.date <= to).map(p => ({ x: p.date, value: p.close_cents }));
  } else if (req.source === "upcoming_cashflow") {
    let balance = (await q.accounts(db, sid)).find(a => a.id === "acc_chequing")?.balance_cents ?? 0;
    data = [{ x: today, value: balance }];
    for (const event of await cashflow(db, sid, today, addDays(today, req.days ?? 30))) data.push({ x: event.date, value: balance += event.amount_cents });
    kind = "step";
  } else {
    const [accounts, tx] = await Promise.all([q.accounts(db, sid), q.transactions(db, sid)]);
    if (req.source === "account_balance_over_time" && !req.account_id) throw new Error("Account required");
    const selected = accounts.filter(a => !req.account_id || a.id === req.account_id);
    const portfolio = req.source === "net_worth_over_time" ? await portfolioSeries(db, sid, from, to, null, "month") : [];
    const dates = portfolio.length ? portfolio.map(p => p.date) : (await portfolioSeries(db, sid, from, to, null, "month")).map(p => p.date);
    data = dates.map(date => {
      const balances = selected.reduce((sum, a) => {
        const after = tx.filter(t => t.account_id === a.id && t.posted_on > date).reduce((s, t) => s + t.amount_cents, 0);
        if (a.type === "credit_card") return sum + (req.source === "net_worth_over_time" ? -a.balance_cents - after : a.balance_cents + after);
        return sum + a.balance_cents - after;
      }, 0);
      return { x: date, value: balances + (portfolio.find(p => p.date === date)?.value_cents ?? 0) };
    });
    kind = req.source === "net_worth_over_time" ? "area" : "line";
  }
  return { id: randomUUID(), source: req.source, kind: req.kind ?? kind, title: req.title, subtitle: null, x: { key: "x", type: xType }, series, data, value_format: "cad", highlight };
}
