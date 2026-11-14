/**
 * Trade rows record their quantity in the description ("BUY 10 USEQ.CX"),
 * the same format the seed uses, so holdings on any past date can be rebuilt
 * from the ledger: current holdings, minus later buys, plus later sells.
 *
 * Only the seed and the executor write trade rows, but descriptions are free
 * text, so the parser accepts a row only when every part agrees with the
 * row's own structured fields. Anything else is ignored, never trusted.
 */
const MAX_TRADE_SHARES = 1_000_000;
const TRADE_TEXT = /^(BUY|SELL) (\d{1,7}) ([A-Z]{3,5}\.CX)$/;

export function tradeDescription(side: "buy" | "sell", quantity: number, ticker: string): string {
  return `${side.toUpperCase()} ${quantity} ${ticker}`;
}

type TradeRow = { kind: string; description: string; merchant: string };

/** Signed share change from a trade row: +n for a buy, -n for a sell, null if not a valid trade row. */
export function tradeQuantity(row: TradeRow): number | null {
  const match = TRADE_TEXT.exec(row.description);
  if (!match) return null;

  const [, side, digits, ticker] = match;
  const kindAgrees = (side === "BUY" && row.kind === "trade_buy") || (side === "SELL" && row.kind === "trade_sell");
  const quantity = Number(digits);
  if (!kindAgrees || ticker !== row.merchant || quantity < 1 || quantity > MAX_TRADE_SHARES) return null;

  return side === "BUY" ? quantity : -quantity;
}
