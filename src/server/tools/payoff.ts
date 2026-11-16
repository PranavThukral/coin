/**
 * The real ways to pay the credit card statement, worked out in code: what
 * chequing can spare today, what payday changes, what savings or investments
 * could cover, and what paying only part would cost. The model relays these;
 * it never has to guess whether an account can afford the payment.
 */
import { addDays, RULE_LIMITS, type Account } from "../../contracts";
import { money, roundUpTo100, shortDate, wholeDollars } from "../../lib/format";
import * as q from "../db/queries";
import type { Tx } from "../db/types";
import { cashflow, holdingViews } from "./data";

const LOOK_AHEAD_DAYS = 30;

export interface PayoffWay {
  id: "pay_today" | "after_payday" | "move_from_savings" | "pay_part_now" | "sell_investments";
  /** One sentence the model can say as written. */
  summary: string;
  /** A request the user could make right now to do it, built only from their own accounts and balances. Null when the way is to wait. */
  request: string | null;
}

export interface CardPayoff {
  statement_cents: number;
  due_date: string | null;
  chequing_balance_cents: number;
  /** What chequing can pay today and stay at or above its buffer. */
  chequing_spare_cents: number;
  short_today_cents: number;
  savings_balance_cents: number;
  ways: PayoffWay[];
  /** A squeeze that follows the payment (rent, usually), or null. */
  watch_out: string | null;
  /** The requests that go with the ways, for one-tap suggestions. */
  suggested_requests: string[];
}

type Event = { label: string; date: string; amount_cents: number };

function payToday(statement: number): PayoffWay {
  return {
    id: "pay_today",
    summary: `Chequing covers the full ${money(statement)} today and stays above its buffer.`,
    request: "Pay my credit card in full",
  };
}

/** Payday lands before the due date and, with the bills in between, leaves enough for the statement. */
function afterPayday(chequing: Account, statement: number, due: string, events: Event[]): PayoffWay | null {
  const payday = events.find((event) => event.label === "Payday" && event.date <= due);
  if (!payday) return null;
  const before = events.filter((event) => event.date <= due && !event.label.includes("Credit Card"));
  const onDueDate = chequing.balance_cents + before.reduce((sum, event) => sum + event.amount_cents, 0);
  const left = onDueDate - statement;
  if (left < RULE_LIMITS.min_buffer_cents) return null;
  return {
    id: "after_payday",
    summary:
      `Wait for payday on ${shortDate(payday.date)} (${money(payday.amount_cents)}), then pay the full `
      + `${money(statement)} from chequing before it's due ${shortDate(due)}. That leaves chequing at ${money(left)}.`,
    request: null,
  };
}

function moveFromSavings(short: number, savings: Account | undefined): PayoffWay | null {
  const amount = roundUpTo100(short);
  if (!savings || savings.balance_cents < amount) return null;
  return {
    id: "move_from_savings",
    summary:
      `Pay it today: move ${wholeDollars(amount)} from ${savings.name} to chequing first, then pay in full. `
      + `Savings would have ${money(savings.balance_cents - amount)} left.`,
    request: `Move ${wholeDollars(amount)} from savings to chequing`,
  };
}

function payPartNow(spare: number, statement: number, card: Account, due: string | null): PayoffWay | null {
  if (spare <= 0) return null;
  const rest = statement - spare;
  const monthlyInterest = Math.round((rest * (card.interest_rate_bps ?? 0)) / 10_000 / 12);
  const by = due ? ` on ${shortDate(due)}` : "";
  return {
    id: "pay_part_now",
    summary:
      `Pay ${money(spare)} now and the other ${money(rest)} later. Whatever is still unpaid${by} costs about `
      + `${money(monthlyInterest)} a month in interest.`,
    request: `Pay ${money(spare)} on my credit card`,
  };
}

async function sellInvestments(db: Tx, sid: string, short: number): Promise<PayoffWay | null> {
  const personal = (await holdingViews(db, sid)).filter((holding) => holding.account_id === "acc_nonreg");
  const invested = personal.reduce((sum, holding) => sum + holding.market_value_cents, 0);
  if (invested < short) return null;
  return {
    id: "sell_investments",
    summary:
      `Sell about ${wholeDollars(roundUpTo100(short))} from Personal Investing (${money(invested)} invested; gains there are taxable) `
      + "and move it to chequing. I can plan that sale.",
    request: "Sell enough of my personal investments to cover my card and move it to chequing",
  };
}

/** After the card is paid on its due date: does anything in the next month take chequing under its buffer? */
function squeezeAfter(chequing: Account, events: Event[], savings: Account | undefined): string | null {
  let balance = chequing.balance_cents;
  let lowest = balance;
  let lowestDate = "";
  for (const event of events) {
    balance += event.amount_cents;
    if (balance < lowest) {
      lowest = balance;
      lowestDate = event.date;
    }
  }
  if (lowest >= RULE_LIMITS.min_buffer_cents) return null;
  const outgoing = events.filter((event) => event.amount_cents < 0 && event.date <= lowestDate && !event.label.includes("Credit Card"));
  const biggest = outgoing.sort((a, b) => a.amount_cents - b.amount_cents)[0];
  const cover = roundUpTo100(RULE_LIMITS.min_buffer_cents - lowest);
  const fromSavings = savings && savings.balance_cents >= cover ? ` Moving ${wholeDollars(cover)} from savings before then keeps it above $500.` : "";
  const cause = biggest ? `${biggest.label} on ${shortDate(biggest.date)}` : "the bills after it";
  return `With the card paid, ${cause} would take chequing to ${money(lowest)} on ${shortDate(lowestDate)}.${fromSavings}`;
}

export async function loadCardPayoff(db: Tx, sid: string): Promise<CardPayoff> {
  const [accounts, session] = await Promise.all([q.accounts(db, sid), q.sessionInfo(db, sid)]);
  const find = (id: string) => accounts.find((account) => account.id === id);
  const card = find("acc_card");
  const chequing = find("acc_chequing");
  if (!card || !chequing) throw new Error("Accounts not found");
  const savings = find("acc_hisa");
  const today = session.today_date;
  const statement = Math.min(card.statement_balance_cents ?? card.balance_cents, card.balance_cents);
  const due = card.statement_due_date;
  const spare = Math.max(0, chequing.balance_cents - RULE_LIMITS.min_buffer_cents);
  const short = Math.max(0, statement - spare);
  const events = await cashflow(db, sid, addDays(today, 1), addDays(today, LOOK_AHEAD_DAYS));

  const ways: Array<PayoffWay | null> = short === 0
    ? [payToday(statement)]
    : [
      due ? afterPayday(chequing, statement, due, events) : null,
      moveFromSavings(short, savings),
      payPartNow(spare, statement, card, due),
      await sellInvestments(db, sid, short),
    ];
  const open = ways.filter((way): way is PayoffWay => way !== null);
  return {
    statement_cents: statement,
    due_date: due,
    chequing_balance_cents: chequing.balance_cents,
    chequing_spare_cents: spare,
    short_today_cents: short,
    savings_balance_cents: savings?.balance_cents ?? 0,
    ways: open,
    watch_out: squeezeAfter(chequing, events, savings),
    suggested_requests: open.flatMap((way) => (way.request ? [way.request] : [])),
  };
}
