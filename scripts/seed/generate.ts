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
  { name: "Harvest Lane Market", category: "groceries", cents: 17500, interval: 7, offset: 1 },
  { name: "Meadow Kitchen", category: "dining", cents: 14500, interval: 7, offset: 3 },
  { name: "Stonebridge Outfitters", category: "shopping", cents: 16000, interval: 7, offset: 4 },
  { name: "Evergreen Supplies", category: "shopping", cents: 15000, interval: 7, offset: 6 },
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

function generateInvesting(ledger: Ledger, date: string) {
  const day = Number(date.slice(8));
  if (day === 12) ledger.pair(date, "acc_chequing", "acc_hisa", 30000);
  if (day === 14) ledger.pair(date, "acc_chequing", "acc_tfsa", 180000);
  if (day === 16) ledger.pair(date, "acc_chequing", "acc_rrsp", date.slice(5, 7) === "02" ? 180000 : 110000);
  if ((day === 18 && date !== "2026-10-18") || date === "2026-11-14") {
    const monthIndex = date === "2026-11-14" ? 23 :
      (Number(date.slice(0, 4)) - 2024) * 12 + Number(date.slice(5, 7)) - 11;
    for (const holding of SEED_HOLDINGS) {
      const quantity = Math.floor(holding.quantity / 24) + (monthIndex < holding.quantity % 24 ? 1 : 0);
      if (quantity > 0 && monthIndex >= 0 && monthIndex < 24) {
        ledger.add(holding.account_id, date, -quantity * holding.avg_cost_cents, holding.ticker,
          "investments", "trade_buy", `BUY ${quantity} ${holding.ticker}`);
      }
    }
  }
  if (day === 20 && Number(date.slice(5, 7)) % 3 === 0) {
    for (const account of ["acc_tfsa", "acc_rrsp", "acc_nonreg"] as const) {
      ledger.add(account, date, 7500, "CAEQ.CX", "investments", "dividend", "QUARTERLY DISTRIBUTION");
    }
  }
}

function generateCardCycle(ledger: Ledger, date: string) {
  if (!date.endsWith("-24")) return;
  const cardTotal = ledger.transactions.filter(item => item.account_id === "acc_card")
    .reduce((sum, item) => sum - item.amount_cents, 0);
  if (cardTotal > 0) ledger.pair(date, "acc_chequing", "acc_card", cardTotal, true);
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
      throw new Error("Card cycle cannot be balanced within purchase limits");
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
  for (let opening = baseline; opening >= 0; opening -= 50000) {
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
    if (balance === target) {
      for (const topUp of topUps) {
        ledger.pair(topUp.date, "acc_hisa", "acc_chequing", topUp.amount);
      }
      return;
    }
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
  dates().forEach((date, index) => {
    generatePayAndBills(ledger, date);
    generateSpending(ledger, date, index);
    generateEvents(ledger, date);
    generateInvesting(ledger, date);
    generateCardCycle(ledger, date);
  });
  ledger.transactions.push(...PLANTED_TRANSACTIONS.map(item => ({ ...item, transfer_group_id: null, action_id: null })));
  balanceCardCycle(ledger);
  savingsTopUps(ledger);
  const accounts = balanceLedger(ledger);
  return { accounts, transactions: ledger.transactions, holdings: SEED_HOLDINGS.map(item => ({ ...item })),
    bills: SEED_BILLS.map(item => ({ ...item })), contacts: SEED_CONTACTS.map(item => ({ ...item })),
    room: SEED_ROOM.map(item => ({ ...item })), securities: SEED_SECURITIES.map(({ ticker, name, kind, sector, dividend_yield_bps }) =>
      ({ ticker, name, kind, sector, dividend_yield_bps })), prices: generatePrices() };
}
