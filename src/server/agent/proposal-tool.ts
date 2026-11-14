/**
 * The two ends of the propose_action tool that face the model: tidying its
 * arguments before code checks them, and telling it what code decided.
 *
 * Neither end can make an action pass. Every proposal still goes through
 * normalizeProposal and all nine rules, which read the user's stored message.
 */
import { CARD_BILL_ID, type ActionCard } from "../../contracts";
import { money } from "../../lib/format";

const CARD_ACCOUNT_ID = "acc_card";
const SHORT_TICKER = /^[A-Z]{3,5}$/;

function canonicalTicker(ticker: string): string {
  const upper = ticker.trim().toUpperCase();
  return SHORT_TICKER.test(upper) ? `${upper}.CX` : upper;
}

/**
 * Fixes two slips that have only one possible meaning: the credit card's
 * account id used where its bill id belongs, and a ticker typed in lower case
 * or without the ".CX" suffix. Anything else is left for the rules to judge.
 */
export function repairProposalArguments(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const proposal = { ...(raw as Record<string, unknown>) };
  if (proposal.type === "bill_payment" && proposal.bill_id === CARD_ACCOUNT_ID) {
    proposal.bill_id = CARD_BILL_ID;
  }
  if (proposal.type === "trade" && typeof proposal.ticker === "string") {
    proposal.ticker = canonicalTicker(proposal.ticker);
  }
  return proposal;
}

/** The arguments could not be read as a proposal at all (no payload, so no amount). */
export function isUnreadableProposal(card: ActionCard): boolean {
  return card.status === "blocked" && card.checks.length === 0;
}

function failedCheckMessages(card: ActionCard): string[] {
  return card.checks
    .filter((check) => check.outcome === "fail" && check.message !== null)
    .map((check) => check.message as string);
}

/**
 * What the model is told after proposing. A blocked card is a decision made by
 * code, not a broken tool, and the wording says so: the model once described a
 * blocked card to the user as "the tool failed".
 */
export function proposalResultForModel(card: ActionCard): Record<string, unknown> {
  if (isUnreadableProposal(card)) {
    return {
      outcome: "invalid_arguments",
      problem: card.primary_message,
      next_step: "Nothing was shown to the user. Correct the arguments and call propose_action again.",
    };
  }
  if (card.status === "blocked") {
    const offer = card.max_passing_amount_cents;
    return {
      outcome: "blocked_by_a_rule",
      reasons_shown_on_the_card: failedCheckMessages(card),
      largest_amount_that_passes: offer === null ? null : money(offer),
      largest_quantity_that_passes: card.max_passing_quantity,
      how_to_reply:
        "The tool worked. Code checked the action and blocked it, and the user now sees a card with the reason. "
        + "Say why in plain words using the reasons above. Never call this an error or a tool failure.",
    };
  }
  return {
    outcome: "card_shown_for_approval",
    card_asks_for_recipient_email: card.requires_second_confirmation,
    how_to_reply: "Tell the user the card is ready to approve. Nothing has moved yet.",
  };
}
