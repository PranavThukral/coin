import { describe, expect, it } from "vitest";
import type { ActionStatus, Proposal } from "../../contracts";
import { actionTitle } from "./titles";

const proposals: Array<[Proposal, string]> = [
  [{ type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cents: 200_000 }, "Everyday Chequing"],
  [{ type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_card", amount_cents: 125_000 }, "Rewards Credit Card ••3019"],
  [{ type: "bill_payment", from_account_id: "acc_chequing", bill_id: "bill_hydro", amount_cents: 14_218 }, "Lakeside Hydro"],
  [
    { type: "etransfer", from_account_id: "acc_chequing", recipient: { kind: "new", name: "Alex", email: null }, amount_cents: 20_000, memo: null },
    "Alex",
  ],
  [{ type: "trade", account_id: "acc_tfsa", side: "buy", ticker: "USEQ.CX", quantity: 10, price_cents: 6_180 }, "USEQ.CX"],
];
const statuses: ActionStatus[] = ["proposed", "blocked", "pending_undo", "executed", "cancelled"];

describe("action titles", () => {
  it("never repeat the amount (it is the large figure below)", () => {
    for (const [proposal, destination] of proposals) {
      for (const status of statuses) {
        expect(actionTitle(proposal, status, destination)).not.toMatch(/\$|\d+\.\d{2}/);
      }
    }
  });

  it("read naturally, past tense once executed", () => {
    const [transfer, card, hydro, send, trade] = proposals;
    expect(actionTitle(transfer[0], "proposed", transfer[1])).toBe("Move to Everyday Chequing");
    expect(actionTitle(card[0], "pending_undo", card[1])).toBe("Pay your credit card");
    expect(actionTitle(card[0], "executed", card[1])).toBe("Paid your credit card");
    expect(actionTitle(hydro[0], "proposed", hydro[1])).toBe("Pay Lakeside Hydro");
    expect(actionTitle(send[0], "executed", send[1])).toBe("Sent to Alex");
    expect(actionTitle(trade[0], "proposed", trade[1])).toBe("Buy 10 shares of US Total Market ETF");
  });

  it("never shows the card's masked number", () => {
    expect(actionTitle(proposals[1][0], "proposed", proposals[1][1])).not.toMatch(/3019|•/);
  });
});
