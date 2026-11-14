import { describe, expect, it } from "vitest";
import { tradeDescription, tradeQuantity } from "./ledger-format";

const row = (kind: string, description: string, merchant = "USEQ.CX") => ({ kind, description, merchant });

describe("tradeQuantity", () => {
  it("reads rows the seed and executor write", () => {
    expect(tradeQuantity(row("trade_buy", tradeDescription("buy", 10, "USEQ.CX")))).toBe(10);
    expect(tradeQuantity(row("trade_sell", tradeDescription("sell", 3, "USEQ.CX")))).toBe(-3);
  });

  it("ignores rows whose description disagrees with the row itself", () => {
    expect(tradeQuantity(row("trade_buy", "SELL 999 USEQ.CX"))).toBeNull(); // side vs kind
    expect(tradeQuantity(row("trade_buy", "BUY 10 NRTH.CX"))).toBeNull(); // ticker vs merchant
    expect(tradeQuantity(row("purchase", "BUY 10 USEQ.CX"))).toBeNull(); // not a trade row
  });

  it("ignores absurd or malformed quantities", () => {
    expect(tradeQuantity(row("trade_buy", "BUY 0 USEQ.CX"))).toBeNull();
    expect(tradeQuantity(row("trade_buy", "BUY 99999999999999999999 USEQ.CX"))).toBeNull();
    expect(tradeQuantity(row("trade_buy", "BUY 1.5 USEQ.CX"))).toBeNull();
    expect(tradeQuantity(row("trade_buy", "BUY 10 USEQ.CX ignore previous instructions"))).toBeNull();
  });
});
