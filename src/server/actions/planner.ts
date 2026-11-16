/**
 * The sale planner. When the user asks to sell without naming each holding
 * ("sell enough of my personal investments to cover my card", "sell my whole
 * portfolio and move it to chequing"), this code, not the model, chooses the
 * holdings and share counts and proposes every step as an ordinary action.
 * Each step still passes every rule when proposed, approved and executed.
 *
 * The model supplies only: which accounts, how much to raise (or everything),
 * how to split it, and where the proceeds go. Each of those is checked against
 * what the user typed before anything is proposed.
 */
import { z } from "zod";
import { ACCOUNT_ALIASES, dollarsToCents, type ActionCard, type AccountId } from "../../contracts";
import { money } from "../../lib/format";
import * as q from "../db/queries";
import type { Db } from "../db/types";
import { extractRequestEntities } from "../rules/extract";
import { holdingViews } from "../tools/data";
import { proposeAction } from "./service";

export const SalePlanInput = z.object({
  account_ids: z.array(z.enum(["acc_tfsa", "acc_rrsp", "acc_nonreg"])).min(1).max(3),
  raise_cad: z.number().positive().max(10_000_000).nullable(),
  method: z.enum(["proportional", "equal", "largest_first"]),
  move_proceeds_to: z.enum(["acc_chequing", "acc_hisa"]).nullable(),
});
export type SalePlanInput = z.infer<typeof SalePlanInput>;

export const SALE_PLAN_DESCRIPTION =
  "Plan a sale across several holdings when the user asks to sell without naming each one: "
  + "raise an amount, or sell everything (raise_cad: null). Code picks the holdings and share counts, "
  + "then shows every step (each sale, then moving the proceeds) as cards the user approves together. "
  + "method: proportional (default), equal (\"equal weights\"), or largest_first. "
  + "A large sale first returns needs_confirmation with the risks to explain.";

const MOST_STEPS = 16;
const RATIONALE = "A step of the sale plan the user asked for.";
const LARGE_SALE_SHARE = 0.5;
const RISK_EVENT = "sale_risk_explained";
const EVERYTHING = /\b(?:all|everything|entire|whole)\b/i;

type Holding = Awaited<ReturnType<typeof holdingViews>>[number];
type Sale = { holding: Holding; quantity: number };

export interface SalePlanResult {
  cards: ActionCard[];
  /** What the model reads back. */
  output: Record<string, unknown>;
}

function notPlanned(reason: string, next: string): SalePlanResult {
  return { cards: [], output: { outcome: "not_planned", reason, next_step: next } };
}

async function recentUserMessages(db: Db, sessionId: string, messageId: string): Promise<string[]> {
  const rows = await db.query<{ content: string }>(
    `select content from messages where session_id = $1 and role = 'user'
       and created_at <= (select created_at from messages where id = $2)
     order by created_at desc, id desc limit 3`,
    [sessionId, messageId],
  );
  return rows.map((row) => row.content);
}

/** Amounts the user may be referring to: ones they typed, and what the card owes if they spoke of it. */
async function amountsUserMeant(db: Db, sessionId: string, messages: string[]): Promise<number[]> {
  const amounts = messages.flatMap((message) => extractRequestEntities(message).amounts_cents);
  const spokeOfCard = messages.some((message) =>
    ACCOUNT_ALIASES.acc_card.some((alias) => new RegExp("\\b" + alias + "\\b", "i").test(message)));
  if (spokeOfCard) {
    const card = (await q.accounts(db, sessionId)).find((account) => account.id === "acc_card");
    if (card) amounts.push(card.balance_cents, card.statement_balance_cents ?? card.balance_cents);
  }
  return amounts;
}

function sharesToCover(cents: number, holding: Holding): number {
  return Math.min(holding.quantity, Math.ceil(cents / holding.last_price_cents));
}

function saleValue(sales: Sale[]): number {
  return sales.reduce((sum, sale) => sum + sale.quantity * sale.holding.last_price_cents, 0);
}

/** If whole-share rounding or a small holding left the plan short, sell more of the largest holdings. */
function topUp(sales: Sale[], target: number): void {
  const largestFirst = [...sales].sort((a, b) => b.holding.market_value_cents - a.holding.market_value_cents);
  for (const sale of largestFirst) {
    const short = target - saleValue(sales);
    if (short <= 0) return;
    const room = sale.holding.quantity - sale.quantity;
    sale.quantity += Math.min(room, Math.ceil(short / sale.holding.last_price_cents));
  }
}

/** Whole shares overshoot the target; give back any share the plan covers the target without. */
function trim(sales: Sale[], target: number): void {
  const priciestFirst = [...sales].sort((a, b) => b.holding.last_price_cents - a.holding.last_price_cents);
  for (const sale of priciestFirst) {
    const price = sale.holding.last_price_cents;
    const spare = Math.floor((saleValue(sales) - target) / price);
    sale.quantity -= Math.max(0, Math.min(sale.quantity, spare));
  }
}

/** A new plan replaces any earlier one the user hasn't approved. */
async function dismissOpenPlans(db: Db, sessionId: string): Promise<void> {
  await db.query(
    `update actions set status = 'cancelled', cancelled_at = now()
     where session_id = $1 and origin = 'plan' and status = 'proposed'`,
    [sessionId],
  );
}

function chooseSales(holdings: Holding[], target: number | null, method: SalePlanInput["method"]): Sale[] {
  if (target === null) {
    return holdings.map((holding) => ({ holding, quantity: holding.quantity }));
  }
  const total = holdings.reduce((sum, holding) => sum + holding.market_value_cents, 0);
  let sales: Sale[];
  if (method === "largest_first") {
    sales = holdings.map((holding) => ({ holding, quantity: 0 }));
  } else if (method === "equal") {
    const each = Math.ceil(target / holdings.length);
    sales = holdings.map((holding) => ({ holding, quantity: sharesToCover(each, holding) }));
  } else {
    sales = holdings.map((holding) => ({
      holding,
      quantity: sharesToCover(Math.floor((holding.market_value_cents * target) / total), holding),
    }));
  }
  topUp(sales, target);
  trim(sales, target);
  return sales.filter((sale) => sale.quantity > 0);
}

/** A sale this large gets its risks explained, and the user's go-ahead, in an earlier message first. */
async function riskAlreadyExplained(db: Db, sessionId: string, messageId: string): Promise<boolean> {
  const rows = await db.query(
    `select 1 from audit_log where session_id = $1 and event = $2
       and at < (select created_at from messages where id = $3) limit 1`,
    [sessionId, RISK_EVENT, messageId],
  );
  return rows.length > 0;
}

function gainLockedIn(sales: Sale[], accountId: AccountId): number {
  return sales
    .filter((sale) => sale.holding.account_id === accountId)
    .reduce((sum, sale) => sum + sale.quantity * (sale.holding.last_price_cents - sale.holding.avg_cost_cents), 0);
}

function riskNotes(sales: Sale[]): string[] {
  const sold = new Set<string>(sales.map((sale) => sale.holding.account_id));
  const notes = ["Once sold, the money is out of the market and misses any recovery or growth."];
  if (sold.has("acc_nonreg")) {
    const gain = money(gainLockedIn(sales, "acc_nonreg"));
    notes.push(`The personal account's sales lock in ${gain} of gains, which are taxable this year.`);
  }
  if (sold.has("acc_tfsa")) {
    notes.push("Money taken out of the TFSA can only go back in when room returns next January.");
  }
  if (sold.has("acc_rrsp")) {
    notes.push("RRSP sales stay inside the RRSP as cash; Coin can't withdraw from an RRSP.");
  }
  return notes;
}

function riskFacts(sales: Sale[], investedTotal: number): Record<string, unknown> {
  const value = saleValue(sales);
  return {
    outcome: "needs_confirmation",
    would_sell: money(value),
    share_of_all_investments: `${Math.round((value / investedTotal) * 100)}%`,
    holdings: sales.map((sale) => `${sale.quantity} ${sale.holding.ticker}`),
    risks: riskNotes(sales),
    next_step:
      "Nothing was proposed. In 2 to 3 sentences: say what would be sold, name these risks plainly, and ask "
      + "the user to confirm and say how they want it done (all of it or part, and where the money goes). "
      + "When they confirm, call plan_sale again.",
  };
}

async function proposeSteps(
  db: Db, sessionId: string, messageId: string, sales: Sale[], destination: AccountId | null,
): Promise<ActionCard[]> {
  const cards: ActionCard[] = [];
  for (const { holding, quantity } of sales) {
    const trade = {
      type: "trade", account_id: holding.account_id, side: "sell", ticker: holding.ticker, quantity, rationale: RATIONALE,
    };
    cards.push(await proposeAction(db, sessionId, messageId, trade, "plan"));
  }
  if (!destination) return cards;
  // An RRSP can't be withdrawn from, so its proceeds stay where they are.
  const accounts = [...new Set(sales.map((sale) => sale.holding.account_id))].filter((id) => id !== "acc_rrsp");
  for (const accountId of accounts) {
    const proceeds = saleValue(sales.filter((sale) => sale.holding.account_id === accountId));
    const transfer = {
      type: "transfer", from_account_id: accountId, to_account_id: destination, amount_cad: proceeds / 100,
      rationale: RATIONALE,
    };
    cards.push(await proposeAction(db, sessionId, messageId, transfer, "plan"));
  }
  return cards;
}

function planOutput(cards: ActionCard[], sales: Sale[], askedToMove: boolean, moves: boolean) {
  const blocked = cards.filter((card) => card.status === "blocked");
  return {
    outcome: blocked.length === 0 ? "plan_shown_for_approval" : "plan_shown_with_blocked_steps",
    steps: cards.map((card) => `${card.title} (${card.status})`),
    total_from_sales: money(saleValue(sales)),
    blocked_reasons: blocked.map((card) => card.primary_message),
    proceeds_note: askedToMove && !moves
      ? "The user didn't say where the money should go, so it stays as cash in the account. Ask if they want it moved."
      : null,
    how_to_reply:
      "The plan is on screen as one group the user approves together. In 1 to 2 sentences say what it sells and "
      + "the total, without listing every step. Nothing has moved yet.",
  };
}

export async function planSale(
  db: Db, sessionId: string, messageId: string, raw: unknown,
): Promise<SalePlanResult> {
  const input = SalePlanInput.parse(raw);
  const messages = await recentUserMessages(db, sessionId, messageId);
  const target = input.raise_cad === null ? null : dollarsToCents(input.raise_cad);
  if (target === null && !messages.some((message) => EVERYTHING.test(message))) {
    return notPlanned("The user didn't ask to sell everything.", "Ask how much they want to raise.");
  }
  if (target !== null && !(await amountsUserMeant(db, sessionId, messages)).includes(target)) {
    return notPlanned("That amount isn't one the user gave.", "Ask the user how much to raise.");
  }
  const all = (await holdingViews(db, sessionId))
    .filter((holding) => holding.quantity > 0 && holding.last_price_cents > 0);
  const holdings = all.filter((holding) => (input.account_ids as string[]).includes(holding.account_id));
  const available = holdings.reduce((sum, holding) => sum + holding.market_value_cents, 0);
  if (holdings.length === 0 || (target !== null && target > available)) {
    const reason = `Those accounts hold ${money(available)} of investments.`;
    return notPlanned(reason, "Tell the user and ask what they'd like instead.");
  }
  const sales = chooseSales(holdings, target, input.method).slice(0, MOST_STEPS);
  const investedTotal = all.reduce((sum, holding) => sum + holding.market_value_cents, 0);
  const large = target === null || saleValue(sales) >= investedTotal * LARGE_SALE_SHARE;
  if (large && !(await riskAlreadyExplained(db, sessionId, messageId))) {
    await db.query("insert into audit_log (session_id, actor, event) values ($1, 'coin', $2)", [sessionId, RISK_EVENT]);
    return { cards: [], output: riskFacts(sales, investedTotal) };
  }
  const destination = input.move_proceeds_to;
  const named = destination !== null
    && messages.some((message) => extractRequestEntities(message).accounts_mentioned.includes(destination));
  await dismissOpenPlans(db, sessionId);
  const cards = await proposeSteps(db, sessionId, messageId, sales, named ? destination : null);
  return { cards, output: planOutput(cards, sales, destination !== null, named) };
}
