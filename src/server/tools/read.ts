import { addDays, daysBetween, dollarsToCents, ToolInputs, UNTRUSTED_NOTE, type RecurringChange, type ToolName } from "../../contracts";
import type { Tx } from "../db/types";
import * as q from "../db/queries";
import { cashflow, holdingViews, portfolioSeries, spending } from "./data";
import { checkAffordability } from "./affordability";

type ReadName = Exclude<ToolName, "render_chart" | "propose_action">;
const wrap = (data: unknown) => ({ untrusted_data_note: UNTRUSTED_NOTE, data });

export async function runReadTool(db: Tx, sid: string, name: ReadName, input: unknown): Promise<unknown> {
  const session = await q.sessionInfo(db, sid);
  const today = session.today_date;
  switch (name) {
    case "get_accounts": {
      ToolInputs.get_accounts.parse(input);
      const [accounts, holdings] = await Promise.all([q.accounts(db, sid), holdingViews(db, sid)]);
      return accounts.map(a => {
        const investment = ["tfsa", "rrsp", "non_registered"].includes(a.type);
        const market = investment ? holdings.filter(h => h.account_id === a.id).reduce((s, h) => s + h.market_value_cents, 0) : null;
        return { ...a, market_value_cents: market, total_value_cents: a.type === "credit_card" ? -a.balance_cents : a.balance_cents + (market ?? 0) };
      });
    }
    case "get_transactions": {
      const p = ToolInputs.get_transactions.parse(input);
      const rows = await q.transactions(db, sid);
      return wrap(rows.filter(t => (!p.account_id || t.account_id === p.account_id) && (!p.from || t.posted_on >= p.from) && (!p.to || t.posted_on <= p.to) && (!p.category || t.category === p.category) && (!p.merchant_query || t.merchant.toLowerCase().includes(p.merchant_query.toLowerCase()))).slice(0, p.limit ?? 50));
    }
    case "summarize_spending": {
      const p = ToolInputs.summarize_spending.parse(input);
      const rows = spending(await q.transactions(db, sid), p.from, p.to, p.group_by, p.account_id, p.category);
      return p.group_by === "merchant" ? wrap(rows) : rows;
    }
    case "compare_spending": {
      const p = ToolInputs.compare_spending.parse(input);
      const tx = await q.transactions(db, sid);
      const a = spending(tx, p.a_from, p.a_to, p.group_by);
      const b = spending(tx, p.b_from, p.b_to, p.group_by);
      const keys = new Set([...a.map(x => x.key), ...b.map(x => x.key)]);
      const rows = [...keys].sort().map(key => {
        const av = a.find(x => x.key === key)?.total_cents ?? 0;
        const bv = b.find(x => x.key === key)?.total_cents ?? 0;
        return { key, a_cents: av, b_cents: bv, delta_cents: bv - av, delta_pct: av ? (bv - av) / av : null };
      });
      return p.group_by === "merchant" ? wrap(rows) : rows;
    }
    case "find_recurring_changes": {
      const p = ToolInputs.find_recurring_changes.parse(input);
      const rows = (await q.transactions(db, sid)).filter(t => t.kind === "purchase" && t.posted_on >= addDays(today, -p.lookback_months * 31) && t.posted_on <= today);
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = `${row.account_id}:${row.merchant}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      const changes: RecurringChange[] = [];
      for (const group of groups.values()) {
        group.sort((a, b) => a.posted_on.localeCompare(b.posted_on));
        if (group.length < 2) continue;
        const intervals = group.slice(1).map((row, index) => daysBetween(group[index].posted_on, row.posted_on));
        const recurring = intervals.filter(days => days >= 20 && days <= 40).length >= Math.ceil(intervals.length / 2);
        if (!recurring) continue;
        const last = group.at(-1)!;
        if (daysBetween(last.posted_on, today) > 45) {
          changes.push({ merchant: last.merchant, account_id: last.account_id, change: "stopped", old_cents: -last.amount_cents, new_cents: null, since: last.posted_on });
          continue;
        }
        if (daysBetween(group[0].posted_on, today) <= 62) {
          changes.push({ merchant: last.merchant, account_id: last.account_id, change: "new", old_cents: null, new_cents: -last.amount_cents, since: group[0].posted_on });
        }
        const prior = [...group].reverse().find(t => t.amount_cents !== last.amount_cents);
        if (prior) {
          const first = group.find(t => t.posted_on > prior.posted_on && t.amount_cents === last.amount_cents)!;
          changes.push({ merchant: last.merchant, account_id: last.account_id, change: -last.amount_cents > -prior.amount_cents ? "price_up" : "price_down", old_cents: -prior.amount_cents, new_cents: -last.amount_cents, since: first.posted_on });
        }
      }
      return wrap(changes);
    }
    case "get_holdings": {
      const p = ToolInputs.get_holdings.parse(input);
      return (await holdingViews(db, sid)).filter(h => !p.account_id || h.account_id === p.account_id);
    }
    case "get_portfolio_performance": {
      const p = ToolInputs.get_portfolio_performance.parse(input);
      const from = p.from ?? addDays(today, -365);
      const to = p.to ?? today;
      const [holdingsSeries, transactions, accounts] = await Promise.all([portfolioSeries(db, sid, from, to, p.account_id, p.interval), q.transactions(db, sid), q.accounts(db, sid)]);
      const investments = accounts.filter(a => ["tfsa", "rrsp", "non_registered"].includes(a.type) && (!p.account_id || a.id === p.account_id));
      const series = holdingsSeries.map(point => ({ ...point, value_cents: point.value_cents + investments.reduce((sum, account) => sum + account.balance_cents - transactions.filter(t => t.account_id === account.id && t.posted_on > point.date).reduce((total, t) => total + t.amount_cents, 0), 0) }));
      const contributions = transactions.filter(t => t.posted_on >= from && t.posted_on <= to && (p.account_id ? t.account_id === p.account_id : ["acc_tfsa", "acc_rrsp", "acc_nonreg"].includes(t.account_id)) && (t.kind === "transfer_in" || t.kind === "transfer_out")).reduce((sum, t) => sum + t.amount_cents, 0);
      const start = series[0]?.value_cents ?? 0;
      const end = series.at(-1)?.value_cents ?? 0;
      return { series, contributions_cents: contributions, return_cents: end - start - contributions };
    }
    case "get_price_history": {
      const p = ToolInputs.get_price_history.parse(input);
      return (await q.prices(db, sid)).filter(x => x.ticker === p.ticker && x.date >= (p.from ?? addDays(today, -365)) && x.date <= (p.to ?? today));
    }
    case "get_upcoming": {
      const p = ToolInputs.get_upcoming.parse(input);
      const events = await cashflow(db, sid, today, addDays(today, p.days));
      let balance = (await q.accounts(db, sid)).find(a => a.id === "acc_chequing")?.balance_cents ?? 0;
      return wrap(events.map(event => ({ ...event, projected_balance_cents: balance += event.amount_cents })));
    }
    case "get_bills": {
      const p = ToolInputs.get_bills.parse(input);
      return wrap((await q.bills(db, sid)).filter(b => !p.saved_only || b.saved));
    }
    case "get_contacts":
      ToolInputs.get_contacts.parse(input);
      return wrap(await q.contacts(db, sid));
    case "get_contribution_room":
      ToolInputs.get_contribution_room.parse(input);
      return (await q.room(db, sid)).filter(r => r.year === Number(today.slice(0, 4)));
    case "check_affordability": {
      const p = ToolInputs.check_affordability.parse(input);
      const cents = dollarsToCents(p.amount_cad);
      if (cents === null) throw new Error("Invalid amount");
      return wrap(await checkAffordability(db, sid, cents, p.on_date ?? today, p.from_account_id ?? "acc_chequing"));
    }
  }
}
