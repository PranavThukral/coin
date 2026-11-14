import { addDays, daysBetween, HISTORY_START, SEED_ANCHOR_DATE, PERSONA, SEED_ACCOUNTS, SEED_BILLS, SEED_CONTACTS, SEED_HOLDINGS, SEED_ROOM, SEED_SECURITIES, PLANTED_TRANSACTIONS, PLANTED_SUBSCRIPTION, type Account, type AccountId, type Category, type Transaction, type Price, type Security } from "../../src/contracts";

export type SeedData = {
  accounts: Account[]; transactions: Transaction[]; holdings: typeof SEED_HOLDINGS;
  bills: typeof SEED_BILLS; contacts: typeof SEED_CONTACTS; room: typeof SEED_ROOM;
  securities: Security[]; prices: Price[];
};

// Fixed seed makes amounts repeatable while keeping the history varied.
function randomSource() {
  let state = 20261115;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

const purchases: { merchant: string; category: Category; cents: number }[] = [
  { merchant: "Moss Market", category: "groceries", cents: 4800 },
  { merchant: "Copper Spoon Cafe", category: "dining", cents: 2100 },
  { merchant: "Cityline Transit", category: "transport", cents: 700 },
  { merchant: "Willow Pantry", category: "groceries", cents: 3600 },
  { merchant: "Paper Lantern Kitchen", category: "dining", cents: 2900 },
  { merchant: "Cloudberry Goods", category: "shopping", cents: 4100 },
  { merchant: "Ridge Cinema", category: "entertainment", cents: 1800 },
];

export function generateSeed(): SeedData {
  const random = randomSource();
  const transactions: Transaction[] = [];
  let sequence = 0;
  const add = (account_id: AccountId, posted_on: string, amount_cents: number, merchant: string, category: Category, kind: Transaction["kind"], description: string, transfer_group_id: string | null = null) => {
    transactions.push({ id: `txn_${String(++sequence).padStart(6, "0")}`, account_id, posted_on, amount_cents, merchant, description, category, kind, transfer_group_id, action_id: null });
  };
  const pair = (date: string, destination: AccountId, cents: number, card = false) => {
    const group = `move_${date}_${destination}`;
    const label = card ? "bill_card - Rewards Credit Card" : `Transfer to ${destination}`;
    add("acc_chequing", date, -cents, label, "transfers", card ? "card_payment_out" : "transfer_out", label, group);
    add(destination, date, cents, card ? "bill_card - Rewards Credit Card" : "Transfer from chequing", "transfers", card ? "card_payment" : "transfer_in", card ? "Bill payment received: bill_card" : "Transfer from chequing", group);
  };
  for (let date = HISTORY_START; date <= SEED_ANCHOR_DATE; date = addDays(date, 1)) {
    const day = Number(date.slice(8));
    const month = Number(date.slice(5, 7));
    if (daysBetween(PERSONA.pay.anchor_payday, date) % 14 === 0) add("acc_chequing", date, PERSONA.pay.net_cents, PERSONA.employer, "income", "income", "Payroll deposit");
    // Two ordinary purchases per day, with modest deterministic variation.
    for (let i = 0; i < 2; i++) {
      const item = purchases[Math.floor(random() * purchases.length)];
      add("acc_card", date, -Math.round(item.cents * (80 + Math.floor(random() * 41)) / 100), item.merchant, item.category, "purchase", `POS ${item.merchant}`);
    }
    if (day === 3) add("acc_card", date, -(date >= PLANTED_SUBSCRIPTION.first_new_charge ? PLANTED_SUBSCRIPTION.new_cents : PLANTED_SUBSCRIPTION.old_cents), PLANTED_SUBSCRIPTION.merchant, "subscriptions", "purchase", "Monthly subscription");
    if (day === 8) add("acc_card", date, -1299, "Moonbeam Audio", "subscriptions", "purchase", "Monthly subscription");
    for (const bill of SEED_BILLS.filter(b => b.saved && b.id !== "bill_card")) {
      if (day === Number(bill.due_date.slice(8))) add("acc_chequing", date, -bill.amount_cents, bill.payee, bill.category, "bill_payment", `Bill payment ${bill.id}`);
    }
    if (day === 24) pair(date, "acc_card", 200000, true);
    if (day === 12) pair(date, "acc_hisa", 170000);
    if (day === 14) pair(date, "acc_tfsa", 50000);
    if (day === 16) pair(date, "acc_rrsp", 50000);
    if (day === 18) {
      const group = `move_${date}_savings_investing`;
      add("acc_hisa", date, -100000, "Transfer to investing", "transfers", "transfer_out", "Transfer to personal investing", group);
      add("acc_nonreg", date, 100000, "Transfer from savings", "transfers", "transfer_in", "Transfer from savings", group);
      add("acc_tfsa", date, -50000, "CAEQ.CX", "investments", "trade_buy", "Investment purchase");
      add("acc_rrsp", date, -52000, "INTL.CX", "investments", "trade_buy", "Investment purchase");
      add("acc_nonreg", date, -100000, "FERN.CX", "investments", "trade_buy", "Investment purchase");
    }
    if (day === 28) add("acc_hisa", date, 4200, "Coin Bank", "investments", "interest", "Monthly savings interest");
    if (day === 20 && month % 3 === 0) {
      for (const account of ["acc_tfsa", "acc_rrsp", "acc_nonreg"] as const) add(account, date, 7500, "CAEQ.CX", "investments", "dividend", "Quarterly distribution");
      add("acc_chequing", date, -4500, "Sam Lee", "gifts_social", "etransfer_out", "E-transfer to saved contact ct_sam");
    }
    if (month === 7 && day === 18) add("acc_card", date, -90000, "Sunridge Getaways", "travel", "purchase", "Summer trip booking");
    if (month === 12 && day === 12) add("acc_card", date, -28000, "Pinecone Gifts", "gifts_social", "purchase", "Holiday gifts");
  }
  transactions.push(...PLANTED_TRANSACTIONS.map(t => ({ ...t, transfer_group_id: null, action_id: null })));
  transactions.sort((a, b) => a.posted_on.localeCompare(b.posted_on) || a.id.localeCompare(b.id));
  const accounts: Account[] = SEED_ACCOUNTS.map(a => {
    const sum = transactions.filter(t => t.account_id === a.id).reduce((n, t) => n + t.amount_cents, 0);
    return { ...a, institution_label: "Coin Bank", opening_balance_cents: a.balance_cents + (a.type === "credit_card" ? sum : -sum) };
  });
  const weekdays: string[] = [];
  for (let date = HISTORY_START; date <= SEED_ANCHOR_DATE; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) weekdays.push(date);
  }
  const prices: Price[] = [];
  for (const security of SEED_SECURITIES) {
    weekdays.forEach((date, i) => {
      const progress = i / (weekdays.length - 1);
      const start = security.ticker === "NRTH.CX" ? 0.5 : security.ticker === "BOND.CX" ? 1.01 : 0.83;
      const drawdown = security.ticker === "NRTH.CX" ? 0.18 * Math.max(0, 1 - Math.abs(progress - 0.65) / 0.12) : 0;
      const wave = 0.025 * Math.sin(progress * Math.PI * 8) * Math.sin(progress * Math.PI);
      const factor = start + (1 - start) * progress - drawdown + wave;
      prices.push({ ticker: security.ticker, date, close_cents: Math.round(security.as_of_close_cents * factor) });
    });
  }
  return { accounts, transactions, holdings: SEED_HOLDINGS.map(h => ({ ...h })), bills: SEED_BILLS.map(b => ({ ...b })), contacts: SEED_CONTACTS.map(c => ({ ...c })), room: SEED_ROOM.map(r => ({ ...r })), securities: SEED_SECURITIES.map(s => ({ ticker: s.ticker, name: s.name, kind: s.kind, sector: s.sector, dividend_yield_bps: s.dividend_yield_bps })), prices };
}


