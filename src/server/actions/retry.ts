/**
 * "Use $X instead" on a blocked card.
 *
 * The follow-up request is built here, on the server, from trusted pieces
 * only: the amount the rules computed, fixed account words, bill ids, and the
 * recipient's name reduced to plain letters. Labels and ledger text (payee
 * names, contact names) never pass through, so data can't put words in the
 * user's mouth. The new request then goes through every rule like any other.
 */
import {
  ACCOUNT_ALIASES,
  CARD_BILL_ID,
  Proposal,
  type ActionCard,
  type ModelProposal,
  type RuleContext,
} from "../../contracts";
import { money } from "../../lib/format";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import { evaluateRules } from "../rules";
import { loadRuleContext } from "./context";
import { audit, getAction, proposeAction } from "./service";

const RATIONALE = "Largest amount that passes the checks, chosen by the user.";

/** Letters only (plus ' and -), at most three words: enough for rule 0 to match a name. */
export function plainName(name: string, firstWordOnly: boolean): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}'-]/gu, ""))
    .filter((word) => word.length > 0 && word.length <= 30);
  return (firstWordOnly ? words.slice(0, 1) : words.slice(0, 3)).join(" ");
}

function accountWord(id: keyof typeof ACCOUNT_ALIASES): string {
  return ACCOUNT_ALIASES[id][0];
}

/** The request text, from trusted pieces only. */
export function retryMessage(p: Proposal, context: RuleContext): string {
  switch (p.type) {
    case "transfer":
      return `Move ${money(p.amount_cents)} from ${accountWord(p.from_account_id)} to ${accountWord(p.to_account_id)}`;
    case "bill_payment": {
      const from = accountWord(p.from_account_id);
      if (p.bill_id === CARD_BILL_ID) return `Pay ${money(p.amount_cents)} on my card from ${from}`;
      const billWord = p.bill_id.replace(/^bill_/, "").replace(/_/g, " ");
      return `Pay ${money(p.amount_cents)} for my ${billWord} bill from ${from}`;
    }
    case "etransfer": {
      const recipient = p.recipient;
      const name =
        recipient.kind === "saved"
          ? plainName(context.contacts.find((c) => c.id === recipient.contact_id)?.name ?? "", true)
          : plainName(recipient.name, false);
      return `Send ${money(p.amount_cents)} to ${name} from ${accountWord(p.from_account_id)}`;
    }
    case "trade":
      throw new AppError("conflict", "Pick a smaller number of shares instead.");
  }
}

function asModelProposal(p: Proposal): ModelProposal {
  const amount_cad = "amount_cents" in p ? p.amount_cents / 100 : 0;
  switch (p.type) {
    case "transfer":
      return {
        type: "transfer",
        from_account_id: p.from_account_id,
        to_account_id: p.to_account_id,
        amount_cad,
        rationale: RATIONALE,
      };
    case "bill_payment":
      return { type: p.type, from_account_id: p.from_account_id, bill_id: p.bill_id, amount_cad, rationale: RATIONALE };
    case "etransfer": {
      return {
        type: "etransfer",
        from_account_id: p.from_account_id,
        contact_id: p.recipient.kind === "saved" ? p.recipient.contact_id : null,
        new_recipient_name: p.recipient.kind === "new" ? plainName(p.recipient.name, false) : null,
        new_recipient_email: null, // a new recipient's email is always typed by the user
        amount_cad,
        memo: null,
        rationale: RATIONALE,
      };
    }
    case "trade":
      throw new AppError("conflict", "Pick a smaller number of shares instead.");
  }
}

export interface RetryResult {
  message: string;
  card: ActionCard;
}

export async function retryAtMax(db: Db, sessionId: string, actionId: string): Promise<RetryResult> {
  const original = await getAction(db, sessionId, actionId);
  if (original.status !== "blocked") throw new AppError("conflict", "Only a blocked action can be retried.");

  const parsed = Proposal.safeParse(original.payload);
  if (!parsed.success) throw new AppError("conflict", "This action can't be retried.");

  // Re-check now, so the offer reflects current balances, not a stale card.
  const context = await loadRuleContext(db, sessionId, original.request_message_id, { actionId: original.id });
  const max = evaluateRules(parsed.data, context).max_passing_amount_cents;
  if (max === null || !("amount_cents" in parsed.data)) {
    throw new AppError("conflict", "There's no smaller amount that would pass.");
  }

  const smaller = { ...parsed.data, amount_cents: max } as Proposal;
  const text = retryMessage(smaller, context);
  const [message] = await db.query<{ id: string }>(
    "insert into messages (session_id, role, content, parts) values ($1, 'user', $2, $3) returning id",
    [sessionId, text, JSON.stringify({ retry_of: actionId })],
  );
  await audit(db, sessionId, actionId, "user", "retried_at_max");

  const card = await proposeAction(db, sessionId, message.id, asModelProposal(smaller));
  return { message: text, card };
}
