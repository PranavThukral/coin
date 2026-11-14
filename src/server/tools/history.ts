/**
 * Rebuilding the past from the session's own data, fast.
 *
 * Holdings on a past date = today's holdings, minus shares bought after that
 * date, plus shares sold after it. Because this reads the session's ledger
 * (not the seed), trades Coin executed for this visitor are included.
 */
import type { Holding, Transaction } from "../../contracts";
import { tradeQuantity } from "../ledger-format";

type PriceRow = { ticker: string; date: string; close_cents: number };

export interface PriceIndex {
  /** The latest close on or before `date` (0 if none yet). */
  closeOn(ticker: string, date: string): number;
}

export function priceIndex(rows: PriceRow[]): PriceIndex {
  const byTicker = new Map<string, PriceRow[]>();
  for (const row of rows) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }
  for (const list of byTicker.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  return {
    closeOn(ticker, date) {
      const list = byTicker.get(ticker);
      if (!list || list.length === 0 || list[0].date > date) return 0;
      let low = 0;
      let high = list.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (list[mid].date <= date) low = mid;
        else high = mid - 1;
      }
      return list[low].close_cents;
    },
  };
}

type Trade = { key: string; date: string; delta: number };

const keyOf = (accountId: string, ticker: string) => `${accountId}|${ticker}`;

export interface HoldingsTimeline {
  at(date: string): Array<{ account_id: string; ticker: string; quantity: number }>;
}

export function holdingsTimeline(current: Holding[], transactions: Transaction[]): HoldingsTimeline {
  const trades: Trade[] = [];
  for (const t of transactions) {
    if (t.kind !== "trade_buy" && t.kind !== "trade_sell") continue;
    const delta = tradeQuantity(t.description);
    if (delta === null) continue;
    trades.push({ key: keyOf(t.account_id, t.merchant), date: t.posted_on, delta });
  }

  return {
    at(date) {
      const quantities = new Map(current.map((h) => [keyOf(h.account_id, h.ticker), h.quantity]));
      for (const trade of trades) {
        if (trade.date > date) {
          quantities.set(trade.key, (quantities.get(trade.key) ?? 0) - trade.delta);
        }
      }
      return [...quantities.entries()]
        .filter(([, quantity]) => quantity > 0)
        .map(([key, quantity]) => {
          const [account_id, ticker] = key.split("|");
          return { account_id, ticker, quantity };
        });
    },
  };
}
