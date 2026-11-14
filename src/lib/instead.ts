// "Use $X instead" sends a new, self-contained request in plain words, so rules
// 0 and 8 check it against the user's text exactly like any other message.
import type { ActionCard } from "../contracts";
import { money } from "./format";

/** "Rewards Credit Card ••3019" -> "Rewards Credit Card"; "Alex (new recipient)" -> "Alex". */
export function plainLabel(label: string | null): string {
  if (!label) return "";
  return label
    .replace(/\s*\(new recipient\)\s*$/i, "")
    .replace(/[\s•*#.\-]*\d{3,}\s*$/u, "")
    .trim();
}

export function insteadMessage(card: ActionCard, amountCents: number): string {
  const amount = money(amountCents);
  const from = plainLabel(card.from_label);
  const to = plainLabel(card.to_label);

  switch (card.type) {
    case "transfer":
      return `Move ${amount} from ${from} to ${to}`;
    case "bill_payment":
      return `Pay ${amount} to ${to} from ${from}`;
    case "etransfer":
      return `Send ${amount} to ${to} from ${from}`;
    case "trade":
      return card.title;
  }
}
