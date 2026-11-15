import {
  ACCOUNT_ALIASES, ActionType, CARD_BILL_ID, INVESTMENT_ACCOUNT_TYPES, PAYMENT_SOURCE_TYPES,
  RULE_MESSAGES, RULE_MESSAGE_VARIANTS, SEED_SECURITIES, TRANSFER_MATRIX,
  type CheckOutcome, type CheckResult, type EvaluateRules, type Proposal, type RequestEntities,
  type RuleContext, type RuleId,
} from "../../contracts";
import { extractRequestEntities } from "./extract";
import { planHasIntent, planMatchesRequest } from "./plan-intent";

type Result = CheckResult & { amountFailure?: boolean };
type Options = {
  values?: Record<string, string>;
  amount?: number | null;
  quantity?: number | null;
  amountFailure?: boolean;
  variant?: string;
};
type Trade = Extract<Proposal, { type: "trade" }>;
type Payment = Extract<Proposal, { type: "bill_payment" }>;
type Transfer = Extract<Proposal, { type: "transfer" }>;
type Etransfer = Extract<Proposal, { type: "etransfer" }>;

function fillMessage(rule: RuleId, options: Options): string {
  let message = options.variant ?? RULE_MESSAGES[rule];
  for (const [key, value] of Object.entries(options.values ?? {})) {
    message = message.replace("[" + key + "]", value);
  }
  return message;
}

function makeResult(rule: RuleId, outcome: CheckOutcome, options: Options = {}): Result {
  const amount = options.amount ?? null;
  return {
    rule,
    outcome,
    message: outcome === "fail" || outcome === "flag" ? fillMessage(rule, options) : null,
    max_passing_amount_cents: amount !== null && amount > 0 ? amount : null,
    max_passing_quantity: options.quantity ?? null,
    amountFailure: options.amountFailure ?? false,
  };
}

function pass(rule: RuleId): Result {
  return makeResult(rule, "pass");
}

function fail(rule: RuleId, options: Options = {}): Result {
  return makeResult(rule, "fail", options);
}

function flag(rule: RuleId, options: Options = {}): Result {
  return makeResult(rule, "flag", options);
}

function skip(rule: RuleId): Result {
  return makeResult(rule, "skip");
}

function findAccount(ctx: RuleContext, id: string) {
  return ctx.accounts.find((account) => account.id === id);
}

/** "2,340.12": RULE_MESSAGES already supply the dollar sign. */
function money(cents: number): string {
  return (Math.max(0, cents) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function word(text: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.length > 0 && new RegExp("(?<![\\w])" + escaped + "(?![\\w])", "i").test(text);
}

function recipientName(proposal: Etransfer, ctx: RuleContext): string {
  if (proposal.recipient.kind === "new") {
    return proposal.recipient.name;
  }
  const id = proposal.recipient.contact_id;
  return ctx.contacts.find((contact) => contact.id === id)?.name.split(/\s|\(/)[0] ?? "";
}

function billNamed(proposal: Payment, ctx: RuleContext): boolean {
  const text = ctx.user_message.text;
  if (proposal.bill_id === CARD_BILL_ID) {
    return ACCOUNT_ALIASES.acc_card.some((alias) => word(text, alias));
  }
  const bill = ctx.bills.find((item) => item.id === proposal.bill_id);
  if (!bill) {
    return false;
  }
  const id = bill.id.replace(/^bill_/, "").replace(/_/g, " ");
  const terms = [id, ...bill.payee.split(/[^a-z]+/i).filter((part) => part.length > 3)];
  return terms.some((term) => word(text, term));
}

function fullValue(proposal: Proposal, ctx: RuleContext): number | null | undefined {
  if (proposal.type !== "bill_payment") {
    return undefined;
  }
  if (proposal.bill_id === CARD_BILL_ID) {
    return findAccount(ctx, "acc_card")?.statement_balance_cents;
  }
  return ctx.bills.find((bill) => bill.id === proposal.bill_id)?.amount_cents;
}

function nameMatches(text: string, name: string): boolean {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => word(text, part));
}

/**
 * "Pay my hydro bill": no amount typed, so the bill's own amount is the one
 * asked for. Whether the payee is saved is rule 2's question, not this one's,
 * so an unsaved bill is blocked for the right reason.
 */
function billAmountAsListed(proposal: Proposal, ctx: RuleContext, amounts: number[]): boolean {
  if (proposal.type !== "bill_payment" || proposal.bill_id === CARD_BILL_ID) {
    return false;
  }
  if (amounts.length > 0 || !billNamed(proposal, ctx)) {
    return false;
  }
  return ctx.bills.some((bill) =>
    bill.id === proposal.bill_id && bill.amount_cents === proposal.amount_cents);
}

function confirmedEmail(proposal: Etransfer, ctx: RuleContext, emails: string[]): boolean {
  if (proposal.recipient.kind !== "new" || !proposal.recipient.email) {
    return true;
  }
  const email = proposal.recipient.email.toLowerCase();
  return emails.some((item) => item.toLowerCase() === email)
    || ctx.confirmed_recipient_email?.toLowerCase() === email;
}

// R0 protects against actions not authorized by the stored user message.
function rule0Intent(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R0_intent";
  if (ctx.origin === "plan") {
    return planHasIntent(proposal, ctx) ? pass(rule) : fail(rule);
  }
  const entities = extractRequestEntities(ctx.user_message.text);
  if (!entities.has_action_intent) {
    return fail(rule);
  }
  if (proposal.type !== "trade") {
    const amountMatches = entities.amounts_cents.includes(proposal.amount_cents);
    const fullMatches = entities.full_amount && fullValue(proposal, ctx) === proposal.amount_cents;
    if (!amountMatches && !fullMatches && !billAmountAsListed(proposal, ctx, entities.amounts_cents)) {
      return fail(rule);
    }
  }
  if (proposal.type === "bill_payment" && !billNamed(proposal, ctx)) {
    return fail(rule);
  }
  if (proposal.type === "etransfer") {
    const named = nameMatches(ctx.user_message.text, recipientName(proposal, ctx));
    if (!named || !confirmedEmail(proposal, ctx, entities.emails)) {
      return fail(rule);
    }
  }
  return pass(rule);
}

// R1 protects against unsupported actions and account combinations.
function rule1AllowedAction(proposal: Proposal, ctx: RuleContext): Result {
  let allowed = ActionType.safeParse(proposal.type).success;
  if (proposal.type === "transfer") {
    const from = findAccount(ctx, proposal.from_account_id);
    const to = findAccount(ctx, proposal.to_account_id);
    allowed = !!from && !!to && from.id !== to.id && TRANSFER_MATRIX[from.type].includes(to.type);
  } else if (proposal.type === "bill_payment" || proposal.type === "etransfer") {
    const from = findAccount(ctx, proposal.from_account_id);
    allowed = !!from && PAYMENT_SOURCE_TYPES.includes(from.type);
  } else if (proposal.type === "trade") {
    const account = findAccount(ctx, proposal.account_id);
    const price = ctx.prices[proposal.ticker];
    allowed = !!account && INVESTMENT_ACCOUNT_TYPES.includes(account.type)
      && Number.isSafeInteger(price) && price > 0 && price === proposal.price_cents;
  }
  return allowed ? pass("R1_allowed_action") : fail("R1_allowed_action");
}

// R2 protects against paying an unsaved or unknown bill.
function rule2SavedPayee(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R2_saved_payee";
  if (proposal.type !== "bill_payment") {
    return skip(rule);
  }
  return ctx.bills.some((bill) => bill.id === proposal.bill_id && bill.saved) ? pass(rule) : fail(rule);
}

// R3 protects against unconfirmed or oversized payments to new recipients.
function rule3NewRecipient(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R3_new_recipient";
  if (proposal.type !== "etransfer") {
    return skip(rule);
  }
  if (proposal.recipient.kind === "saved") {
    const id = proposal.recipient.contact_id;
    if (ctx.contacts.some((contact) => contact.id === id && contact.saved)) {
      return pass(rule);
    }
    return fail(rule, { values: { name: recipientName(proposal, ctx) } });
  }
  const max = ctx.limits.new_recipient_limit_cents;
  const values = { name: proposal.recipient.name };
  if (proposal.amount_cents <= max) {
    return flag(rule, { values });
  }
  return fail(rule, { values, amount: max, amountFailure: true });
}

// R4 protects the source balance and prevents overpaying the card.
function rule4EnoughMoney(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R4_enough_money";
  if (proposal.type === "trade") {
    return skip(rule);
  }
  const account = findAccount(ctx, proposal.from_account_id);
  if (!account) {
    return fail(rule, { values: { account: "account", max: "0.00" } });
  }
  const floor = account.type === "chequing" ? ctx.limits.min_buffer_cents : 0;
  let max = account.balance_cents - floor;
  let variant: string | undefined;
  if (account.type !== "chequing") {
    variant = RULE_MESSAGE_VARIANTS.R4_no_overdraft;
  }
  if (proposal.type === "bill_payment" && proposal.bill_id === CARD_BILL_ID) {
    const owed = findAccount(ctx, "acc_card")?.balance_cents ?? 0;
    if (owed <= max) {
      variant = RULE_MESSAGE_VARIANTS.R4_card_overpay;
    }
    max = Math.min(max, owed);
  }
  if (proposal.amount_cents <= max) {
    return pass(rule);
  }
  return fail(rule, {
    values: { account: account.name, max: money(max) }, amount: max, amountFailure: true, variant,
  });
}

// R5 protects the daily external payment limit.
function rule5DailyLimit(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R5_daily_limit";
  if (proposal.type !== "bill_payment" && proposal.type !== "etransfer") {
    return skip(rule);
  }
  const max = ctx.limits.daily_limit_cents - ctx.daily_used_cents;
  return proposal.amount_cents <= max ? pass(rule) : fail(rule, { amount: max, amountFailure: true });
}

// R6 protects annual registered-account contribution room.
function rule6ContributionRoom(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R6_contribution_room";
  if (proposal.type !== "transfer") {
    return skip(rule);
  }
  const to = findAccount(ctx, proposal.to_account_id);
  if (!to || (to.type !== "tfsa" && to.type !== "rrsp")) {
    return skip(rule);
  }
  const year = Number(ctx.today.slice(0, 4));
  const max = ctx.room.find((room) => room.account_type === to.type && room.year === year)
    ?.room_remaining_cents ?? 0;
  if (proposal.amount_cents <= max) {
    return pass(rule);
  }
  return fail(rule, { values: { room: money(max) }, amount: max, amountFailure: true });
}

// R7 protects against buying beyond cash or selling unheld shares.
function rule7TradeLimits(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R7_trade_limits";
  if (proposal.type !== "trade") {
    return skip(rule);
  }
  const held = ctx.holdings.find((holding) =>
    holding.account_id === proposal.account_id && holding.ticker === proposal.ticker)?.quantity ?? 0;
  const cash = findAccount(ctx, proposal.account_id)?.balance_cents ?? 0;
  const price = ctx.prices[proposal.ticker];
  let max = held;
  let variant: string | undefined;
  if (proposal.side === "buy") {
    max = price > 0 ? Math.max(0, Math.floor(Math.min(cash, ctx.limits.max_trade_cents) / price)) : 0;
    variant = cash < ctx.limits.max_trade_cents
      ? RULE_MESSAGE_VARIANTS.R7_buy_cash : RULE_MESSAGE_VARIANTS.R7_buy_max_trade;
  }
  if (proposal.quantity <= max) {
    return pass(rule);
  }
  return fail(rule, { values: { n: String(max), ticker: proposal.ticker }, quantity: max, variant });
}

// Words too common across security names to identify one of them.
const GENERIC_NAME_WORDS = new Set(["etf", "index", "equity", "market"]);
// "Sell all my NRTH.CX": the whole position, so the share count needs no number.
const WHOLE_POSITION = /\b(?:all|everything|entire|whole)\b/i;

function nameWordAppears(text: string, nameWord: string): boolean {
  const isAcronym = nameWord === nameWord.toUpperCase();
  if (isAcronym) {
    // "US" must be typed in capitals, so the pronoun "us" never names a fund.
    return new RegExp("(?<![\\w])" + nameWord + "(?![\\w])").test(text);
  }
  return nameWord.length >= 4 && word(text, nameWord);
}

/**
 * True when the user's own words name this security: its ticker ("NRTH.CX" or
 * "NRTH") or a distinctive word of its name ("Northwind"). Names come from the
 * fixed security list, never from text the model read.
 */
function tickerNamed(ticker: string, text: string): boolean {
  const shortTicker = ticker.replace(/\.CX$/, "");
  if (word(text, ticker) || word(text, shortTicker)) {
    return true;
  }
  const security = SEED_SECURITIES.find((item) => item.ticker === ticker);
  if (!security) {
    return false;
  }
  const nameWords = security.name.split(/\s+/)
    .filter((part) => !GENERIC_NAME_WORDS.has(part.toLowerCase()));
  return nameWords.some((part) => nameWordAppears(text, part));
}

/** A dollar figure in a trade request is a budget: the most whole shares it covers. */
function sharesForBudget(budgetCents: number, priceCents: number): number {
  return priceCents > 0 ? Math.floor(budgetCents / priceCents) : 0;
}

function sellsWholePosition(proposal: Trade, ctx: RuleContext): boolean {
  if (proposal.side !== "sell" || !WHOLE_POSITION.test(ctx.user_message.text)) {
    return false;
  }
  const holding = ctx.holdings.find((item) =>
    item.account_id === proposal.account_id && item.ticker === proposal.ticker);
  return holding !== undefined && holding.quantity === proposal.quantity;
}

/**
 * A trade matches the request when the user named the security, said how much
 * (a share count, a dollar budget, or "all" of a position), and nothing they
 * typed disagrees with the proposal. Without this a trade's ticker and size
 * would be the model's choice, which text planted in the data could steer.
 */
function tradeMatches(proposal: Trade, entities: RequestEntities, ctx: RuleContext): boolean {
  if (!tickerNamed(proposal.ticker, ctx.user_message.text)) {
    return false;
  }
  const gaveShares = entities.quantities.length > 0;
  const gaveBudget = entities.amounts_cents.length > 0;
  if (!gaveShares && !gaveBudget && !sellsWholePosition(proposal, ctx)) {
    return false;
  }
  if (entities.quantities.some((quantity) => quantity !== proposal.quantity)) {
    return false;
  }
  const budgetDisagrees = entities.amounts_cents.some((budget) =>
    sharesForBudget(budget, proposal.price_cents) !== proposal.quantity);
  if (budgetDisagrees) {
    return false;
  }
  if (entities.tickers.some((ticker) => ticker !== proposal.ticker)) {
    return false;
  }
  return entities.side === null || entities.side === proposal.side;
}

function recipientMatches(proposal: Etransfer, ctx: RuleContext): boolean {
  const name = recipientName(proposal, ctx);
  const text = ctx.user_message.text;
  if (!nameMatches(text, name)) {
    return false;
  }
  const targets = [...text.matchAll(/\b(?:to|send)\s+(?:my\s+)?([a-z][a-z'-]*)/gi)]
    .map((match) => match[1]);
  const aliases = Object.values(ACCOUNT_ALIASES).flat();
  return !targets.some((target) =>
    !["money", "funds", "cash", "payment"].includes(target.toLowerCase())
    && !word(name, target) && !aliases.some((alias) => alias.toLowerCase() === target.toLowerCase()));
}

function proposalAccounts(proposal: Proposal): string[] {
  if (proposal.type === "transfer") {
    return [proposal.from_account_id, proposal.to_account_id];
  }
  if (proposal.type === "trade") {
    return [proposal.account_id];
  }
  const ids: string[] = [proposal.from_account_id];
  if (proposal.type === "bill_payment" && proposal.bill_id === CARD_BILL_ID) {
    ids.push("acc_card");
  }
  return ids;
}

function transferRolesMatch(proposal: Transfer, text: string, accounts: string[]): boolean {
  for (const [id, aliases] of Object.entries(ACCOUNT_ALIASES)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const from = new RegExp("\\bfrom\\s+(?:my\\s+|the\\s+)?" + escaped + "\\b", "i");
      const to = new RegExp("\\b(?:to|into)\\s+(?:my\\s+|the\\s+)?" + escaped + "\\b", "i");
      if ((from.test(text) && id !== proposal.from_account_id)
        || (to.test(text) && id !== proposal.to_account_id)) {
        return false;
      }
    }
  }
  if (!/\b(?:from|to|into)\b/i.test(text) && accounts.length >= 2) {
    return accounts[0] === proposal.from_account_id && accounts[1] === proposal.to_account_id;
  }
  return true;
}

// R8 protects against changing the user's specified action details.
function rule8MatchesRequest(proposal: Proposal, ctx: RuleContext): Result {
  const rule = "R8_matches_request";
  if (ctx.origin === "plan") {
    return planMatchesRequest(proposal, ctx) ? pass(rule) : fail(rule);
  }
  const entities = extractRequestEntities(ctx.user_message.text);
  if (proposal.type !== "trade" && entities.amounts_cents.some((a) => a !== proposal.amount_cents)) {
    return fail(rule);
  }
  if (proposal.type === "trade" && !tradeMatches(proposal, entities, ctx)) {
    return fail(rule);
  }
  if (proposal.type === "etransfer" && !recipientMatches(proposal, ctx)) {
    return fail(rule);
  }
  const ids = proposalAccounts(proposal);
  if (entities.accounts_mentioned.some((id) => !ids.includes(id))) {
    return fail(rule);
  }
  if (proposal.type === "transfer"
    && !transferRolesMatch(proposal, ctx.user_message.text, entities.accounts_mentioned)) {
    return fail(rule);
  }
  return pass(rule);
}

/**
 * The amount Coin offers instead ("Use $2,340.12 instead"): the smallest limit
 * among the failed checks. Offered only when every failure is an amount limit;
 * if anything else failed too, a smaller amount would not fix it.
 */
function largestPassingAmount(failures: Result[]): number | null {
  const limits: number[] = [];
  for (const failure of failures) {
    if (!failure.amountFailure || failure.max_passing_amount_cents === null) {
      return null;
    }
    limits.push(failure.max_passing_amount_cents);
  }
  return limits.length > 0 ? Math.min(...limits) : null;
}

function largestPassingQuantity(failures: Result[]): number | null {
  const limits = failures
    .map((failure) => failure.max_passing_quantity)
    .filter((quantity): quantity is number => quantity !== null);
  return limits.length > 0 ? Math.min(...limits) : null;
}

/** Drops the engine's internal bookkeeping so the result is exactly a CheckResult. */
function toCheckResult(result: Result): CheckResult {
  const { rule, outcome, message, max_passing_amount_cents, max_passing_quantity } = result;
  return { rule, outcome, message, max_passing_amount_cents, max_passing_quantity };
}

/**
 * All nine rules, always, in order. Pure: it reads only the proposal and the
 * context snapshot, so the same call gives the same verdict when the action is
 * proposed, when it is approved, and again inside the executor's transaction.
 */
export const evaluateRules: EvaluateRules = (proposal, ctx) => {
  const newRecipient = rule3NewRecipient(proposal, ctx);
  const checks = [
    rule0Intent(proposal, ctx),
    rule1AllowedAction(proposal, ctx),
    rule2SavedPayee(proposal, ctx),
    newRecipient,
    rule4EnoughMoney(proposal, ctx),
    rule5DailyLimit(proposal, ctx),
    rule6ContributionRoom(proposal, ctx),
    rule7TradeLimits(proposal, ctx),
    rule8MatchesRequest(proposal, ctx),
  ];
  const failures = checks.filter((check) => check.outcome === "fail");
  return {
    allowed: failures.length === 0,
    checks: checks.map(toCheckResult),
    requires_second_confirmation: newRecipient.outcome === "flag",
    max_passing_amount_cents: largestPassingAmount(failures),
    max_passing_quantity: largestPassingQuantity(failures),
    primary_message: failures[0]?.message ?? null,
  };
};
