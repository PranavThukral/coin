import {
  addDays, daysBetween, HISTORY_START, SEED_ANCHOR_DATE, PERSONA,
  SEED_ACCOUNTS, SEED_BILLS, SEED_CONTACTS, SEED_HOLDINGS, SEED_ROOM,
  SEED_SECURITIES, PLANTED_TRANSACTIONS, PLANTED_SUBSCRIPTION,
  type Account, type AccountId, type Category, type Transaction, type Price, type Security,
} from "../../src/contracts";

export type SeedData = {
  accounts: Account[];
  transactions: Transaction[];
  holdings: typeof SEED_HOLDINGS;
  bills: typeof SEED_BILLS;
  contacts: typeof SEED_CONTACTS;
  room: typeof SEED_ROOM;
  securities: Security[];
  prices: Price[];
};

type Merchant = { name: string; category: Category; cents: number; interval: number; offset: number };
const merchants: Merchant[] = [
  { name: "Moss Market", category: "groceries", cents: 6800, interval: 7, offset: 0 },
  { name: "Willow Pantry", category: "groceries", cents: 4500, interval: 10, offset: 2 },
  { name: "Cedar Produce", category: "groceries", cents: 2400, interval: 14, offset: 3 },
  { name: "Copper Spoon Cafe", category: "dining", cents: 850, interval: 4, offset: 0 },
  { name: "Thimble Coffee", category: "dining", cents: 720, interval: 6, offset: 1 },
  { name: "Paper Lantern Kitchen", category: "dining", cents: 4200, interval: 12, offset: 2 },
  { name: "Juniper Table", category: "dining", cents: 5600, interval: 21, offset: 4 },
  { name: "Pond Noodle House", category: "dining", cents: 3100, interval: 16, offset: 7 },
  { name: "Cityline Transit", category: "transport", cents: 340, interval: 4, offset: 2 },
  { name: "Swiftway Rides", category: "transport", cents: 2400, interval: 13, offset: 5 },
  { name: "Cloudberry Goods", category: "shopping", cents: 4900, interval: 18, offset: 3 },
  { name: "Birch Bookshop", category: "shopping", cents: 2900, interval: 30, offset: 8 },
  { name: "Harbourfront Outfitters", category: "shopping", cents: 7200, interval: 35, offset: 10 },
  { name: "Ridge Cinema", category: "entertainment", cents: 2300, interval: 30, offset: 1 },
  { name: "Lantern Theatre", category: "entertainment", cents: 6200, interval: 90, offset: 7 },
  { name: "Pine Pharmacy", category: "health_fitness", cents: 2600, interval: 30, offset: 4 },
  { name: "Brightvale Dental", category: "health_fitness", cents: 18500, interval: 182, offset: 18 },
  { name: "Riverbend Gifts", category: "gifts_social", cents: 4500, interval: 75, offset: 9 },
  { name: "Northcrest Service", category: "fees", cents: 450, interval: 60, offset: 11 },
  { name: "Harvest Lane Market", category: "groceries", cents: 7000, interval: 7, offset: 1 },
  { name: "Meadow Kitchen", category: "dining", cents: 5000, interval: 7, offset: 3 },
  { name: "Stonebridge Outfitters", category: "shopping", cents: 5000, interval: 7, offset: 4 },
  { name: "Evergreen Supplies", category: "shopping", cents: 4000, interval: 7, offset: 6 },
];
const subscriptions = [
  ["Moonbeam Audio", 1299, 8], ["Pagehaven", 999, 11],
  ["Cloudnest Storage", 399, 17], ["Framebox Films", 1499, 21],
] as const;

function dates(): string[] {
  return Array.from({ length: daysBetween(HISTORY_START, SEED_ANCHOR_DATE) + 1 },
    (_, index) => addDays(HISTORY_START, index));
}

function createLedger() {
  const transactions: Transaction[] = [];
  let sequence = 0;
  function add(account_id: AccountId, posted_on: string, amount_cents: number,
    merchant: string, category: Category, kind: Transaction["kind"], description: string,
    transfer_group_id: string | null = null) {
    sequence += 1;
    transactions.push({ id: `txn_${String(sequence).padStart(6, "0")}`, account_id,
      posted_on, amount_cents, merchant, category, kind, description, transfer_group_id, action_id: null });
  }
  function pair(date: string, from: AccountId, to: AccountId, cents: number, card = false) {
    const group = `move_${date}_${from}_${to}_${sequence}`;
    const label = card ? "bill_card" : "ACCOUNT TRANSFER";
    add(from, date, -cents, label, "transfers", card ? "card_payment_out" : "transfer_out", label, group);
    add(to, date, cents, label, "transfers", card ? "card_payment" : "transfer_in", label, group);
  }
  return { transactions, add, pair };
}
type Ledger = ReturnType<typeof createLedger>;

function generatePayAndBills(ledger: Ledger, date: string) {
  const day = Number(date.slice(8));
  if (daysBetween(PERSONA.pay.anchor_payday, date) % 14 === 0) {
    ledger.add("acc_chequing", date, PERSONA.pay.net_cents, PERSONA.employer, "income", "income",
      "PAYROLL DEP MAPLEWAVE STUDIO");
  }
  for (const bill of SEED_BILLS.filter(item => item.saved && item.id !== "bill_card")) {
    if (bill.id === "bill_gym" && date < "2026-01-01") continue;
    if (day === Number(bill.due_date.slice(8))) {
      ledger.add("acc_chequing", date, -bill.amount_cents, bill.payee, bill.category,
        "bill_payment", `PREAUTH ${bill.payee.toUpperCase()}`);
    }
  }
}

function generateSpending(ledger: Ledger, date: string, index: number) {
  for (const merchant of merchants) {
    if (index % merchant.interval !== merchant.offset) continue;
    const variation = 80 + (index * 17 + merchant.offset * 13) % 41;
    const trend = merchant.category === "dining" && date >= "2026-08-01" ? 135 : 100;
    const amount = Math.round(merchant.cents * variation * trend / 10000);
    const format = merchant.category === "groceries" ? "DEBIT PURCHASE" :
      merchant.category === "dining" ? "MOBILE WALLET" : "POS";
    ledger.add("acc_card", date, -amount, merchant.name, merchant.category, "purchase",
      `${format} ${merchant.name.toUpperCase()} TORONTO ON`);
  }
  const day = Number(date.slice(8));
  if (day === 3) {
    const amount = date >= PLANTED_SUBSCRIPTION.first_new_charge
      ? PLANTED_SUBSCRIPTION.new_cents : PLANTED_SUBSCRIPTION.old_cents;
    ledger.add("acc_card", date, -amount, PLANTED_SUBSCRIPTION.merchant, "subscriptions",
      "purchase", "RECURRING STREAMLY PREMIUM");
  }
  for (const [name, amount, chargeDay] of subscriptions) {
    if (day === chargeDay) ledger.add("acc_card", date, -amount, name, "subscriptions",
      "purchase", `RECURRING ${name.toUpperCase()}`);
  }
  if (day === 1) ledger.add("acc_card", date, -15600, "Cityline Pass", "transport",
    "purchase", "MONTHLY CITYLINE PASS");
}

function generateEvents(ledger: Ledger, date: string) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8));
  if (month === 12 && [6, 13, 20].includes(day)) {
    ledger.add("acc_card", date, -14500, "Pinecone Gifts", "gifts_social", "purchase", "POS PINECONE GIFTS OTTAWA ON");
    ledger.add("acc_card", date, -8500, "Hearth Dining", "dining", "purchase", "POS HEARTH DINING");
  }
  if (month === 7 && [4, 10, 15].includes(day)) {
    const names = ["Northshore Air", "Summit Haven Hotel", "Wandertrail Tours"];
    const amount = date.startsWith("2026") ? 70000 : 30000;
    const name = names[[4, 10, 15].indexOf(day)];
    ledger.add("acc_card", date, -amount, name, "travel", "purchase", `TRAVEL ${name.toUpperCase()} HALIFAX NS`);
  }
  if (month === 4 && day === 15) ledger.add("acc_card", date, -58000, "Lakeshore Furniture Co.",
    "shopping", "purchase", "POS LAKESHORE FURNITURE");
  if (day === 20 && month % 2 === 0) {
    const name = month % 4 === 0 ? "Priya Nair" : "Sam Lee";
    ledger.add("acc_chequing", date, -4500, name, "gifts_social", "etransfer_out", `Interac e-Transfer to ${name}`);
  }
  if (day === 22 && month % 3 === 0) ledger.add("acc_chequing", date, 3200, "Marcus Bell",
    "other", "etransfer_in", "Interac e-Transfer from Marcus Bell");
  if (day === 20 && month % 4 === 0) ledger.add("acc_card", date, 2400, "Cloudberry Goods",
    "shopping", "refund", "REFUND CLOUDBERRY GOODS");
}

const investmentAccounts = ["acc_tfsa", "acc_rrsp", "acc_nonreg"] as const;

function contribution(account: typeof investmentAccounts[number], date: string): number {
  if (account === "acc_tfsa") return 60000;
  if (account === "acc_nonreg") return 40000;
  return date.startsWith("2026-02") ? 150000 : 50000;
}

function buyInvestments(ledger: Ledger, date: string, prices: Price[]) {
  const monthIndex = (Number(date.slice(0, 4)) - 2024) * 12 + Number(date.slice(5, 7)) - 11;
  for (const account of investmentAccounts) {
    const holdings = SEED_HOLDINGS.filter(item => item.account_id === account);
    const holding = holdings[monthIndex % holdings.length];
    const close = prices.find(item => item.ticker === holding.ticker && item.date === date)!.close_cents;
    const quantity = Math.round(contribution(account, date) / close);
    ledger.add(account, date, -quantity * close, holding.ticker,
      "investments", "trade_buy", `BUY ${quantity} ${holding.ticker}`);
  }
}

function generateInvesting(ledger: Ledger, date: string, prices: Price[]) {
  const day = Number(date.slice(8));
  if (day === 12) {
    const sweep = date === "2026-07-12" || date === "2026-11-12" ? 260000 :
      date >= "2026-08-01" && date < "2026-11-01" ? 10000 : 60000;
    if (sweep > 0) ledger.pair(date, "acc_chequing", "acc_hisa", sweep);
  }
  if ((day === 16 && date !== "2024-11-16" || date === "2024-11-22") && date < "2026-11-01") {
    for (const account of investmentAccounts) {
      ledger.pair(date, "acc_chequing", account, contribution(account, date));
    }
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (date === "2024-11-25" || (date >= "2024-12-01" && date < "2026-11-01" && day >= 18 && day <= 20 && weekday >= 1 && weekday <= 5 &&
    (day === 18 || (day === 19 && weekday === 1) || (day === 20 && weekday === 1)))) {
    buyInvestments(ledger, date, prices);
  }
  if (day === 20 && Number(date.slice(5, 7)) % 3 === 0) {
    for (const account of ["acc_tfsa", "acc_rrsp", "acc_nonreg"] as const) {
      ledger.add(account, date, 3000, "CAEQ.CX", "investments", "dividend", "QUARTERLY DISTRIBUTION");
    }
  }
}

function generateCardCycle(ledger: Ledger, date: string) {
  if (!date.endsWith("-24")) return;
  const cardTotal = ledger.transactions.filter(item => item.account_id === "acc_card")
    .reduce((sum, item) => sum - item.amount_cents, 0);
  if (cardTotal > 0) ledger.pair(date, "acc_chequing", "acc_card", cardTotal, true);
}

/** Market swings as a share of price: a single stock moves more than an index fund, a bond fund least. */
const SWING: Record<string, number> = { stock: 0.07, etf: 0.035, bond: 0.012 };
/** Cycles over the two years, slow to fast, each weaker than the last: together they read as a market. */
const WAVES = [2, 5, 11, 23, 47, 97];
/** The last trading days ease back onto the exact closing price the seed facts name. */
const SETTLE_DAYS = 15;

/** A repeatable number in 0..1 from a string (the same seed gives the same history every run). */
function unit(text: string): number {
  let hash = 2166136261;
  for (const char of text) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return ((hash >>> 0) % 100_000) / 100_000;
}

/** How far this day sits above or below the trend, as a share of price. Zero on the final day. */
/** NRTH's planted spring drawdown stays a clean slide: swings fade out around it. */
function outsideDrawdown(ticker: string, date: string): number {
  if (ticker !== "NRTH.CX") return 1;
  const away = Math.max(daysBetween(date, "2026-05-01"), daysBetween("2026-06-12", date));
  return Math.max(0, Math.min(1, away / 21));
}

function marketSwing(security: { ticker: string; kind: string }, index: number, days: number, date: string): number {
  const progress = index / (days - 1);
  let wave = 0;
  WAVES.forEach((cycles, n) => {
    const phase = unit(`${security.ticker}-wave-${n}`) * Math.PI * 2;
    wave += Math.sin(progress * cycles * Math.PI * 2 + phase) / (n + 1.5);
  });
  const jitter = (unit(`${security.ticker}-day-${index}`) - 0.5) * 0.5;
  const settle = Math.min(1, (days - 1 - index) / SETTLE_DAYS);
  const size = security.ticker === "BOND.CX" ? SWING.bond : SWING[security.kind] ?? SWING.etf;
  return (wave + jitter) * size * settle * outsideDrawdown(security.ticker, date);
}

function generatePrices(): Price[] {
  const weekdays = dates().filter(date => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));
  return SEED_SECURITIES.flatMap(security => weekdays.map((date, index) => {
    const progress = index / (weekdays.length - 1);
    const start = security.ticker === "NRTH.CX" ? 0.5 : security.ticker === "BOND.CX" ? 1.01 : 0.83;
    let factor = start + (1 - start) * progress;
    if (security.ticker === "NRTH.CX" && date >= "2026-05-01" && date <= "2026-08-01") {
      const dip = date <= "2026-06-12"
        ? daysBetween("2026-05-01", date) / 42
        : daysBetween(date, "2026-08-01") / 50;
      factor -= 0.22 * dip;
    }
    factor *= 1 + marketSwing(security, index, weekdays.length, date);
    return { ticker: security.ticker, date, close_cents: Math.round(security.as_of_close_cents * factor) };
  }));
}

function balanceCardCycle(ledger: Ledger) {
  const card = ledger.transactions.filter(item => item.account_id === "acc_card")
    .reduce((sum, item) => sum - item.amount_cents, 0);
  let remainder = 491238 - card;
  const purchases = ledger.transactions.filter(item => item.account_id === "acc_card" &&
    item.kind === "purchase" && item.posted_on > "2026-10-24" &&
    !item.id.startsWith("txn_planted") && item.category !== "subscriptions");
  for (const [index, purchase] of purchases.entries()) {
    const adjustment = Math.trunc(remainder / (purchases.length - index));
    if (Math.abs(adjustment) > 4000 || purchase.amount_cents - adjustment >= 0) {
      throw new Error(`Card cycle cannot be balanced within purchase limits: ${remainder}, ${purchases.length}`);
    }
    purchase.amount_cents -= adjustment;
    remainder -= adjustment;
  }
  if (remainder !== 0) throw new Error("Card cycle has an unallocated remainder");
}

export function requiredTopUp(balance: number, amounts: number[]): number {
  let projected = balance;
  let minimum = Infinity;
  for (const amount of amounts) {
    projected += amount;
    if (amount < 0) minimum = Math.min(minimum, projected);
  }
  return minimum < 30000 ? Math.ceil((30000 - minimum) / 50000) * 50000 : 0;
}

function savingsTopUps(ledger: Ledger) {
  const daily = dates().map(date => ledger.transactions
    .filter(item => item.account_id === "acc_chequing" && item.posted_on === date)
    .sort((a, b) => a.id.localeCompare(b.id)));
  const net = daily.flat().reduce((sum, item) => sum + item.amount_cents, 0);
  const target = SEED_ACCOUNTS.find(account => account.id === "acc_chequing")!.balance_cents;
  const baseline = target - net;

  // Walk chequing forward from an opening balance, topping up from savings
  // the day before any outflow would take it under $300.
  const simulate = (opening: number) => {
    let balance = opening;
    const topUps: { date: string; amount: number }[] = [];
    for (let index = 0; index < daily.length; index += 1) {
      for (const transaction of daily[index]) balance += transaction.amount_cents;
      if (index === daily.length - 1) continue;
      const amount = requiredTopUp(balance, daily[index + 1].map(item => item.amount_cents));
      if (amount > 0) {
        balance += amount;
        topUps.push({ date: addDays(HISTORY_START, index), amount });
      }
    }
    return topUps;
  };

  // The opening balance must leave room for the top-ups: opening + net +
  // top-ups = target. Iterate to the fixed point (top-ups only grow as the
  // opening shrinks, so this converges quickly).
  let opening = baseline;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const topUps = simulate(opening);
    const total = topUps.reduce((sum, item) => sum + item.amount, 0);
    const next = baseline - total;
    if (next === opening) {
      for (const topUp of topUps) {
        ledger.pair(topUp.date, "acc_hisa", "acc_chequing", topUp.amount);
      }
      return;
    }
    if (next < 0) break;
    opening = next;
  }
  throw new Error("Cannot reconcile need-based savings top-ups");
}

function balanceLedger(ledger: Ledger) {
  for (const date of dates().filter(item => item.endsWith("-28")).reverse()) {
    const later = ledger.transactions.filter(item => item.account_id === "acc_hisa" && item.posted_on > date)
      .reduce((sum, item) => sum + item.amount_cents, 0);
    const after = 2450000 - later;
    const before = Math.round(after * 120000 / 120310);
    ledger.add("acc_hisa", date, after - before, "Coin Bank", "investments", "interest", "SAVINGS INTEREST");
  }
  ledger.transactions.sort((a, b) => a.posted_on.localeCompare(b.posted_on) || a.id.localeCompare(b.id));
  return SEED_ACCOUNTS.map(account => {
    const sum = ledger.transactions.filter(item => item.account_id === account.id)
      .reduce((total, item) => total + item.amount_cents, 0);
    return { ...account, institution_label: "Coin Bank",
      opening_balance_cents: account.balance_cents + (account.type === "credit_card" ? sum : -sum) };
  });
}

export function generateSeed(): SeedData {
  const ledger = createLedger();
  const prices = generatePrices();
  dates().forEach((date, index) => {
    generatePayAndBills(ledger, date);
    generateSpending(ledger, date, index);
    generateEvents(ledger, date);
    generateInvesting(ledger, date, prices);
    generateCardCycle(ledger, date);
  });
  ledger.transactions.push(...PLANTED_TRANSACTIONS.map(item => ({ ...item, transfer_group_id: null, action_id: null })));
  balanceCardCycle(ledger);
  savingsTopUps(ledger);
  const accounts = balanceLedger(ledger);
  return { accounts, transactions: ledger.transactions, holdings: SEED_HOLDINGS.map(item => ({ ...item })),
    bills: SEED_BILLS.map(item => ({ ...item })), contacts: SEED_CONTACTS.map(item => ({ ...item })),
    room: SEED_ROOM.map(item => ({ ...item })), securities: SEED_SECURITIES.map(({ ticker, name, kind, sector, dividend_yield_bps }) =>
      ({ ticker, name, kind, sector, dividend_yield_bps })), prices };
}

export function holdingsAt(date: string): typeof SEED_HOLDINGS {
  const trades = generateSeed().transactions.filter(item => item.kind === "trade_buy");
  return SEED_HOLDINGS.map(holding => {
    const later = trades.filter(item => item.account_id === holding.account_id &&
      item.merchant === holding.ticker && item.posted_on > date);
    const quantity = later.reduce((total, item) => total - Number(item.description.split(" ")[1]), holding.quantity);
    return { ...holding, quantity };
  });
}
