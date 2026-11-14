import {
  ACCOUNT_ALIASES, FULL_AMOUNT_PHRASES, INTENT_VERBS, SEED_CONTACTS, SEED_SECURITIES,
  type AccountId, type ExtractRequestEntities,
} from "../../contracts";

// Email addresses are excluded from numeric extraction.
const EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
// Tickers use the invented exchange suffix.
const TICKER = /\b[A-Z]{3,5}\.CX\b/gi;
// Dates are not amounts.
const DATE = /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/g;
// Share counts are quantities, not amounts: "10 shares", "10 NRTH.CX", "10 NRTH".
// A number with a dollar sign or a decimal point is money, never a share count.
const SHORT_TICKERS = SEED_SECURITIES.map((security) => security.ticker.replace(".CX", "")).join("|");
const QUANTITY = new RegExp(
  "(?<![$\\w.,])(\\d[\\d,]*)\\s+(?:shares?|units?|[a-z]{3,5}\\.CX|(?:" + SHORT_TICKERS + "))(?![\\w])",
  "gi",
);
// Amounts can include commas, decimals, and a thousands suffix.
const AMOUNT = /(?<![\w.])\$?\d[\d,]*(?:\.\d{1,2})?\s*k?(?![\w]|\.\d)/gi;
// Capitalized words can be names.
const CAPITALIZED = /\b[A-Z][a-z]+\b/g;
// A word after "to" can be a recipient.
const TARGET = /\bto\s+([a-z][a-z'-]*)/gi;
// Explicit negative instructions block action intent.
const NEGATION = new RegExp(
  "\\b(?:don'?t|do not|never)\\s+(?!forget\\b|mind\\b|stop\\b)\\w+"
    + "|\\b(?:stop|cancel)\\b|\\bwithout\\s+(?!fail\\b)\\w+",
  "i",
);
// These phrases do not negate the requested action.
const NON_NEGATING_STOP = /\b(?:doesn'?t|does not|don'?t|do not|never)\s+stop\b/gi;
// Hypotheticals do not authorize actions.
const HYPOTHETICAL = /\b(?:what if|suppose|hypothetically|if i|would i|could i)\b/i;
// Questions about past events do not authorize actions.
const PAST = new RegExp(
  "\\b(?:why|what|when|how|explain|show|tell)\\b[^.!?]*"
    + "\\b(?:did|last|previous|previously|sent|paid|moved|refund|mean)\\b",
  "i",
);
// Advice and instruction questions do not authorize actions.
const ADVICE = /\b(?:should i|can i afford|is it smart to|how do i|how can i)\b/i;
// Trade side is read from the user's words.
const BUY = /\b(?:buy|purchase)\b/i;
// Sell is the other supported trade side.
const SELL = /\bsell\b/i;

const STOP_WORDS = new Set([
  "i", "coin", "the", "a", "an", "my", "please", "can", "could", "would", "should",
  "what", "why", "how", "send", "pay", "move", "transfer", "buy", "sell",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "tfsa", "rrsp",
  ...Object.values(ACCOUNT_ALIASES).flatMap((aliases) =>
    aliases.flatMap((alias) => alias.toLowerCase().split(/[\s-]+/))),
]);

function boundary(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![\\w])" + escaped + "(?![\\w])", "gi");
}

export function normalizeText(text: string): string {
  return text.normalize("NFKC")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

function findAmounts(text: string): number[] {
  // Share counts go first: "10 NRTH.CX" must be read whole, before tickers are removed.
  const masked = text.replace(EMAIL, " ").replace(DATE, " ")
    .replace(QUANTITY, " ").replace(TICKER, " ");
  return [...masked.matchAll(AMOUNT)].map((match) => {
    const raw = match[0].replace(/[$,\s]/g, "").toLowerCase();
    const thousands = raw.endsWith("k");
    const number = thousands ? raw.slice(0, -1) : raw;
    const [whole, fraction = ""] = number.split(".");
    const scale = thousands ? 100000 : 100;
    return Number(whole) * scale + Number((fraction + "00").slice(0, 2)) * (thousands ? 1000 : 1);
  });
}

function findAccounts(text: string): AccountId[] {
  const matches = Object.entries(ACCOUNT_ALIASES).flatMap(([id, aliases]) =>
    aliases.flatMap((alias) => [...text.matchAll(boundary(alias))].map((match) => ({
      id: id as AccountId,
      index: match.index,
      length: match[0].length,
    }))));
  matches.sort((a, b) => a.index - b.index || b.length - a.length);
  const chosen: typeof matches = [];
  for (const match of matches) {
    const overlaps = chosen.some((item) =>
      match.index < item.index + item.length && item.index < match.index + match.length);
    if (!overlaps) {
      chosen.push(match);
    }
  }
  return chosen.map((match) => match.id);
}

function findNames(text: string, emails: string[]): string[] {
  const names = [...text.matchAll(CAPITALIZED)].map((match) => match[0])
    .filter((name) => !STOP_WORDS.has(name.toLowerCase()));
  for (const contact of SEED_CONTACTS) {
    const first = contact.name.split(/\s/)[0];
    if (boundary(first).test(text)) {
      names.push(first);
    }
  }
  for (const match of text.matchAll(TARGET)) {
    if (!STOP_WORDS.has(match[1].toLowerCase())) {
      names.push(match[1]);
    }
  }
  return [...names, ...emails];
}

function findEmails(text: string): string[] {
  return [...text.matchAll(EMAIL)].map((match) => match[0]);
}

function findTickers(text: string): string[] {
  return [...text.matchAll(TICKER)].map((match) => match[0].toUpperCase());
}

function findQuantities(text: string): number[] {
  return [...text.matchAll(QUANTITY)].map((match) => Number(match[1].replace(/,/g, "")));
}

function readIntent(text: string): boolean {
  const verb = INTENT_VERBS.some((value) => boundary(value).test(text));
  const negationText = text.replace(NON_NEGATING_STOP, "");
  return verb && !NEGATION.test(negationText) && !HYPOTHETICAL.test(text)
    && !PAST.test(text) && !ADVICE.test(text);
}

export const extractRequestEntities: ExtractRequestEntities = (input) => {
  const text = normalizeText(input);
  const emails = findEmails(text);
  let side: "buy" | "sell" | null = null;
  if (BUY.test(text)) {
    side = "buy";
  } else if (SELL.test(text)) {
    side = "sell";
  }
  return {
    has_action_intent: readIntent(text),
    amounts_cents: findAmounts(text),
    full_amount: FULL_AMOUNT_PHRASES.some((phrase) => text.toLowerCase().includes(phrase)),
    accounts_mentioned: findAccounts(text),
    names: findNames(text, emails),
    emails,
    tickers: findTickers(text),
    quantities: findQuantities(text),
    side,
  };
};
