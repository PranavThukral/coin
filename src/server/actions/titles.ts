/**
 * Card titles name the action, never the amount: the amount is the large
 * figure directly underneath, so repeating it in the title is noise.
 * Executed cards read in the past tense ("Paid your credit card").
 */
import { CARD_BILL_ID, type ActionStatus, type Proposal } from "../../contracts";

const VERBS = {
  transfer: ["Move", "Moved"],
  bill_payment: ["Pay", "Paid"],
  etransfer: ["Send", "Sent"],
  buy: ["Buy", "Bought"],
  sell: ["Sell", "Sold"],
} as const;

function verb(kind: keyof typeof VERBS, status: ActionStatus): string {
  const [present, past] = VERBS[kind];
  return status === "executed" ? past : present;
}

/** `destination` is the display name of the account, payee or person. */
export function actionTitle(p: Proposal | null, status: ActionStatus, destination: string | null): string {
  if (!p) return "Request Coin couldn't read";

  switch (p.type) {
    case "transfer":
      return `${verb("transfer", status)} to ${destination ?? "account"}`;
    case "bill_payment":
      if (p.bill_id === CARD_BILL_ID) return `${verb("bill_payment", status)} your credit card`;
      return `${verb("bill_payment", status)} ${destination ?? "bill"}`;
    case "etransfer":
      return `${verb("etransfer", status)} to ${destination ?? "recipient"}`;
    case "trade": {
      const shares = p.quantity === 1 ? "1 share" : `${p.quantity} shares`;
      return `${verb(p.side, status)} ${shares} of ${p.ticker}`;
    }
  }
}
