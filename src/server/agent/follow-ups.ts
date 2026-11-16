/**
 * The suggestions shown under Coin's reply ("How does that compare with last
 * month?"). Code chooses them from what Coin just looked at; the model never
 * writes them. That matters because tapping one sends it as the user's own
 * message, and the user's own messages are what authorize actions: a
 * suggestion the model could word would be a way for text in the data to put
 * words in the user's mouth.
 *
 * Every suggestion is a question, with one exception built entirely from
 * balances: moving money between the user's own accounts to cover a shortfall.
 */
import { money } from "../../lib/format";

export interface ToolUse {
  name: string;
  /** The tool's result, as the model saw it. */
  result: unknown;
}

const MOST_SUGGESTIONS = 3;

const AFTER_TOOL: Record<string, string[]> = {
  summarize_spending: ["How does that compare with last month?", "What are my top merchants?"],
  compare_spending: ["Did any subscription change price?", "Am I overspending this month?"],
  get_category_pace: ["Where did my money go this month?", "How much do I save each month?"],
  get_cash_flow: ["How long would it take to save $10,000?", "Where did my money go this month?"],
  get_subscriptions: ["Did any subscription change price?", "How much do I save each month?"],
  find_recurring_changes: ["What subscriptions am I paying for?"],
  get_upcoming: ["Can I cover everything due before payday?", "How is my card balance looking?"],
  get_bills: ["What bills are coming up?"],
  get_money_snapshot: ["How much do I save each month?", "What bills are coming up?", "How have my investments done?"],
  get_portfolio_performance: ["How concentrated am I?", "What moved my net worth this year?"],
  get_holdings: ["How have my investments done?", "How much contribution room do I have left?"],
  get_contribution_room: ["How have my investments done?"],
  explain_net_worth_change: ["How have my investments done?", "How much do I save each month?"],
  plan_savings_goal: ["How much do I save each month?", "Am I overspending this month?"],
  check_affordability: ["What bills are coming up?", "How much do I save each month?"],
};

const TO_START = ["How am I doing overall?", "What bills are coming up?", "Where did my money go this month?"];

/** Rounded up to the next $100, so the amount reads like one a person would pick. */
function roundedUp(cents: number): number {
  return Math.ceil(cents / 10_000) * 10_000;
}

/** "Move $2,400 from savings to chequing", when savings covers what chequing is short by. */
function coverShortfall(uses: ToolUse[]): string | null {
  const result = uses.find((use) => use.name === "check_affordability")?.result as
    | { data?: { shortfall_cents?: number; savings_balance_cents?: number } }
    | undefined;
  // Read tools hand their result back inside a wrapper that marks it as data.
  const check = result?.data;
  const shortfall = check?.shortfall_cents ?? 0;
  if (shortfall <= 0) return null;
  const amount = roundedUp(shortfall);
  if ((check?.savings_balance_cents ?? 0) < amount) return null;
  return `Move ${money(amount).replace(/\.00$/, "")} from savings to chequing`;
}

const sameQuestion = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function followUps(uses: ToolUse[], userText: string): string[] {
  // A card or a plan is on screen: the next step is on it.
  if (uses.some((use) => use.name === "propose_action" || use.name === "plan_sale")) return [];

  const suggestions: string[] = [];
  const cover = coverShortfall(uses);
  if (cover) suggestions.push(cover);
  for (const use of uses) {
    suggestions.push(...(AFTER_TOOL[use.name] ?? []));
  }
  if (uses.length === 0) suggestions.push(...TO_START);

  const unique = [...new Set(suggestions)].filter((suggestion) => !sameQuestion(suggestion, userText));
  return unique.slice(0, MOST_SUGGESTIONS);
}
