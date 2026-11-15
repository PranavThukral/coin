/**
 * Rules 0 and 8 for an action the sale planner built (origin "plan").
 *
 * The user asked to sell without naming each holding ("sell enough to cover
 * my card", "sell everything in my TFSA"), so there are no tickers or share
 * counts to match against. Planner code chose those, never the model. What
 * the rules still insist on comes from the user's own recent messages:
 *   - they asked to sell, and their latest message doesn't back away from it;
 *   - the account being sold from is one they named (or they spoke of their
 *     investments as a whole);
 *   - money only moves on to an account they named.
 * Text from the data never enters the thread, so it cannot authorize a plan.
 */
import { type AccountId, type Proposal, type RuleContext } from "../../contracts";
import { declinesAction, extractRequestEntities } from "./extract";

const SELL_REQUEST = /\b(?:sell|selling|liquidate|cash out)\b/i;
const WHOLE_PORTFOLIO = /\b(?:portfolio|investments?|holdings|stocks|shares|everything)\b/i;
const INVESTMENT_ACCOUNTS: AccountId[] = ["acc_tfsa", "acc_rrsp", "acc_nonreg"];
const SHORT_ANSWER_WORDS = 14;

function thread(ctx: RuleContext): string[] {
  return ctx.request_thread ?? [ctx.user_message.text];
}

/** The messages that count as the request: everything the user said without backing away. */
function standingMessages(ctx: RuleContext): string[] {
  return thread(ctx).filter((message) => !declinesAction(message));
}

function mentions(messages: string[], account: AccountId): boolean {
  return messages.some((message) => extractRequestEntities(message).accounts_mentioned.includes(account));
}

/** A reply to Coin's question: short, and not itself a question. */
function isShortAnswer(message: string): boolean {
  const words = message.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= SHORT_ANSWER_WORDS && !message.includes("?");
}

/** The account sold from is one the user named, or they spoke of their investments as a whole. */
function sellingAccountAsked(account: AccountId, messages: string[]): boolean {
  const named = INVESTMENT_ACCOUNTS.filter((id) => mentions(messages, id));
  if (named.length > 0) {
    return named.includes(account);
  }
  return messages.some((message) => WHOLE_PORTFOLIO.test(message));
}

/** Rule 0 for a planned step: the user asked to sell and hasn't backed away. */
export function planHasIntent(proposal: Proposal, ctx: RuleContext): boolean {
  if (proposal.type !== "trade" && proposal.type !== "transfer") {
    return false;
  }
  const latest = ctx.user_message.text;
  if (declinesAction(latest)) {
    return false;
  }
  const latestActs = extractRequestEntities(latest).has_action_intent || isShortAnswer(latest);
  return latestActs && standingMessages(ctx).some((message) => SELL_REQUEST.test(message));
}

/** Rule 8 for a planned step: it stays inside the accounts the user named. */
export function planMatchesRequest(proposal: Proposal, ctx: RuleContext): boolean {
  const messages = standingMessages(ctx);
  if (proposal.type === "trade") {
    return proposal.side === "sell" && sellingAccountAsked(proposal.account_id as AccountId, messages);
  }
  if (proposal.type === "transfer") {
    return sellingAccountAsked(proposal.from_account_id as AccountId, messages)
      && mentions(messages, proposal.to_account_id as AccountId);
  }
  return false;
}
