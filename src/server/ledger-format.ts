/**
 * Trade rows record their quantity in the description ("BUY 10 USEQ.CX"),
 * the same format the seed uses, so holdings on any past date can be rebuilt
 * from the ledger: current holdings, minus later buys, plus later sells.
 */
export function tradeDescription(side: "buy" | "sell", quantity: number, ticker: string): string {
  return `${side.toUpperCase()} ${quantity} ${ticker}`;
}

/** Signed share change from a trade row: +n for a buy, -n for a sell, null if not a trade. */
export function tradeQuantity(description: string): number | null {
  const match = /^(BUY|SELL) (\d+) /.exec(description);
  if (!match) return null;
  const quantity = Number(match[2]);
  return match[1] === "BUY" ? quantity : -quantity;
}
