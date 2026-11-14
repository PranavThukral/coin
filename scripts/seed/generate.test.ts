import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { generateSeed, holdingsAt, requiredTopUp } from "./generate";
import { insertSeed, type Database } from "../seed";
import { addDays, daysBetween, HISTORY_START, PERSONA, PLANTED_SUBSCRIPTION, PLANTED_TRANSACTIONS, SEED_ACCOUNTS, SEED_ANCHOR_DATE, SEED_BILLS, SEED_CONTACTS, SEED_HOLDINGS, SEED_ROOM, SEED_SECURITIES, SPENDING_KINDS, TEMPLATE_SESSION_ID } from "../../src/contracts";

const seed = generateSeed();
describe("deterministic seed", () => {
  it("reconstructs nonnegative positions through the anchor", () => {
    expect(holdingsAt(SEED_ANCHOR_DATE)).toEqual(SEED_HOLDINGS);
    const dates = [HISTORY_START, ...new Set(seed.transactions.filter(t => t.kind === "trade_buy").map(t => t.posted_on))];
    for (const date of dates) expect(holdingsAt(date).every(item => item.quantity >= 0), date).toBe(true);
  });
  it("keeps savings and investment opening cash plausible", () => {
    const hisa = seed.accounts.find(a => a.id === "acc_hisa")!;
    expect(hisa.opening_balance_cents).toBeGreaterThanOrEqual(500000);
    expect(hisa.opening_balance_cents).toBeLessThanOrEqual(1200000);
    for (const account of seed.accounts.filter(a => ["tfsa", "rrsp", "non_registered"].includes(a.type))) {
      expect(Math.abs(account.opening_balance_cents - account.balance_cents), account.id).toBeLessThanOrEqual(500000);
    }
  });
  it("buys shares near each monthly contribution at the recorded close", () => {
    for (const row of seed.transactions.filter(t => t.kind === "trade_buy")) {
      const month = row.posted_on.slice(0, 7);
      const contribution = seed.transactions.find(t => t.account_id === row.account_id &&
        t.kind === "transfer_in" && t.posted_on.startsWith(month))!;
      expect(-row.amount_cents).toBeGreaterThanOrEqual(contribution.amount_cents * 0.75);
      expect(-row.amount_cents).toBeLessThanOrEqual(contribution.amount_cents * 1.25);
      const close = seed.prices.find(p => p.ticker === row.merchant && p.date === row.posted_on)!;
      expect(-row.amount_cents).toBe(Number(row.description.split(" ")[1]) * close.close_cents);
    }
  });
  it("keeps typical spending and annual spending below income", () => {
    const months = ["2025-11", "2025-12", ...Array.from({ length: 10 }, (_, i) =>
      `2026-${String(i + 1).padStart(2, "0")}`)];
    const spending = months.map(month => -seed.transactions
      .filter(t => t.posted_on.startsWith(month) && SPENDING_KINDS.includes(t.kind))
      .reduce((sum, t) => sum + t.amount_cents, 0));
    const sorted = [...spending].sort((a, b) => a - b);
    const median = (sorted[5] + sorted[6]) / 2;
    const income = seed.transactions.filter(t => t.posted_on >= "2025-11-01" &&
      t.posted_on < "2026-11-01" && t.kind === "income").reduce((sum, t) => sum + t.amount_cents, 0);
    expect(median).toBeGreaterThanOrEqual(480000);
    expect(median).toBeLessThanOrEqual(560000);
    expect(spending.reduce((sum, amount) => sum + amount, 0)).toBeLessThan(income * 0.8);
  });
  it("keeps recent purchases plausible and has only the planted November sofa", () => {
    const recent = seed.transactions.filter(t => t.kind === "purchase" &&
      t.posted_on >= addDays(SEED_ANCHOR_DATE, -10) && !t.id.startsWith("txn_planted"));
    expect(recent.every(t => -t.amount_cents <= 128900)).toBe(true);
    const furniture = seed.transactions.filter(t => t.kind === "purchase" &&
      t.merchant === "Lakeshore Furniture Co." && t.posted_on.startsWith(SEED_ANCHOR_DATE.slice(0, 7)));
    expect(furniture).toHaveLength(1);
    expect(furniture[0].id).toBe("txn_planted_furniture");
  });
  it("moves round savings amounts only when the next day's outflows need them", () => {
    expect(requiredTopUp(80000, [-50001])).toBe(50000);
    expect(requiredTopUp(80000, [-100001])).toBe(100000);
    expect(requiredTopUp(80000, [-50000])).toBe(0);
    expect(requiredTopUp(10000, [100000])).toBe(0);
    const chequing = seed.accounts.find(a => a.id === "acc_chequing")!;
    const rows = seed.transactions.filter(t => t.account_id === chequing.id);
    let balance = chequing.opening_balance_cents;
    const topUps = rows.filter(t => t.kind === "transfer_in" &&
      seed.transactions.some(other => other.transfer_group_id === t.transfer_group_id && other.account_id === "acc_hisa"));
    for (const row of rows) {
      balance += row.amount_cents;
      if (!topUps.includes(row)) continue;
      expect(row.amount_cents % 50000).toBe(0);
      let projected = balance - row.amount_cents;
      let minimum = Infinity;
      for (const next of rows.filter(t => t.posted_on === addDays(row.posted_on, 1))) {
        projected += next.amount_cents;
        if (next.amount_cents < 0) minimum = Math.min(minimum, projected);
      }
      expect(minimum, row.posted_on).toBeLessThan(30000);
      expect(row.amount_cents).toBe(Math.ceil((30000 - minimum) / 50000) * 50000);
    }
  });
  it("leaves the anchor month's TFSA contribution unmade", () => {
    const contributions = seed.transactions.filter(t => t.account_id === "acc_tfsa" && t.kind === "transfer_in");
    expect(contributions.some(t => t.posted_on >= "2026-11-01")).toBe(false);
  });
  it("credits monthly savings interest on the balance before interest", () => {
    const account = seed.accounts.find(a => a.id === "acc_hisa")!;
    let balance = account.opening_balance_cents;
    const rows = seed.transactions.filter(t => t.account_id === account.id);
    const interest = rows.filter(t => t.kind === "interest");
    expect(interest).toHaveLength(24);
    for (const row of rows) {
      if (row.kind === "interest") {
        const expected = Math.round(balance * account.interest_rate_bps! / 120000);
        expect(Math.abs(row.amount_cents - expected), row.posted_on).toBeLessThanOrEqual(1);
      }
      balance += row.amount_cents;
    }
  });
  it("shows a 20 to 25 percent NRTH drawdown over about six weeks", () => {
    const prices = seed.prices.filter(p => p.ticker === "NRTH.CX");
    const peak = prices.find(p => p.date === "2026-05-01")!;
    const trough = prices.find(p => p.date === "2026-06-12")!;
    const decline = (peak.close_cents - trough.close_cents) / peak.close_cents;
    expect(daysBetween(peak.date, trough.date)).toBe(42);
    expect(decline).toBeGreaterThanOrEqual(0.20);
    expect(decline).toBeLessThanOrEqual(0.25);
    expect(prices.filter(p => p.date >= peak.date && p.date <= trough.date)
      .every(p => p.close_cents <= peak.close_cents && p.close_cents >= trough.close_cents)).toBe(true);
  });
  it("covers spending categories and limits merchant frequency", () => {
    const categories = ["housing", "groceries", "dining", "transport", "utilities", "phone_internet",
      "subscriptions", "shopping", "health_fitness", "travel", "entertainment", "insurance",
      "gifts_social", "fees"];
    for (const category of categories) {
      expect(seed.transactions.some(t => t.category === category && t.amount_cents < 0)).toBe(true);
    }
    const purchases = seed.transactions.filter(t => t.kind === "purchase");
    for (const merchant of new Set(purchases.map(t => t.merchant))) {
      expect(purchases.filter(t => t.merchant === merchant).length, merchant).toBeLessThanOrEqual(260);
    }
  });
  it("shows holiday and summer spending spikes", () => {
    const total = (month: string, category: string) => -seed.transactions
      .filter(t => t.posted_on.startsWith(month) && t.category === category)
      .reduce((sum, t) => sum + t.amount_cents, 0);
    expect(total("2025-12", "gifts_social")).toBeGreaterThan(total("2025-11", "gifts_social"));
    expect(total("2025-12", "dining")).toBeGreaterThan(total("2025-11", "dining"));
    expect(total("2026-07", "travel")).toBeGreaterThan(total("2026-06", "travel"));
    expect(total("2026-07", "travel")).toBeGreaterThan(total("2026-08", "travel"));
  });
  it("pays each card balance in full, leaving the anchor statement unpaid", () => {
    const card = seed.accounts.find(a => a.id === "acc_card")!;
    let owed = card.opening_balance_cents;
    for (const transaction of seed.transactions.filter(t => t.account_id === card.id)) {
      owed -= transaction.amount_cents;
      if (transaction.kind === "card_payment") expect(owed, transaction.posted_on).toBe(0);
    }
    expect(owed).toBe(card.statement_balance_cents);
    expect(seed.transactions.filter(t => t.kind === "card_payment").at(-1)?.posted_on).toBe("2026-10-24");
  });
  it("changes only the planted subscription price", () => {
    const subscriptions = seed.transactions.filter(t => t.category === "subscriptions" && t.kind === "purchase");
    for (const merchant of new Set(subscriptions.map(t => t.merchant))) {
      const amounts = new Set(subscriptions.filter(t => t.merchant === merchant).map(t => t.amount_cents));
      expect(amounts.size, merchant).toBe(merchant === PLANTED_SUBSCRIPTION.merchant ? 2 : 1);
    }
  });
  it("matches pinned facts and planted rows", () => {
    for (const pinned of SEED_ACCOUNTS) expect(seed.accounts.find(a => a.id === pinned.id)).toMatchObject(pinned);
    expect(seed.bills).toEqual(SEED_BILLS); expect(seed.contacts).toEqual(SEED_CONTACTS);
    expect(seed.holdings).toEqual(SEED_HOLDINGS); expect(seed.room).toEqual(SEED_ROOM);
    for (const row of PLANTED_TRANSACTIONS) expect(seed.transactions.find(t => t.id === row.id)).toMatchObject(row);
    for (const s of SEED_SECURITIES) {
      expect(seed.securities.find(x => x.ticker === s.ticker)).toMatchObject({ name: s.name, kind: s.kind, sector: s.sector, dividend_yield_bps: s.dividend_yield_bps });
      expect(seed.prices.filter(p => p.ticker === s.ticker).at(-1)?.close_cents).toBe(s.as_of_close_cents);
    }
    const charges = seed.transactions.filter(t => t.merchant === PLANTED_SUBSCRIPTION.merchant);
    expect(charges.find(t => t.posted_on === "2026-09-03")?.amount_cents).toBe(-1699);
    expect(charges.find(t => t.posted_on === "2026-10-03")?.amount_cents).toBe(-2299);
  });
  it("reconciles every running balance and respects limits", () => {
    for (const account of seed.accounts) {
      let balance = account.opening_balance_cents; expect(balance, account.id).toBeGreaterThanOrEqual(0);
      for (const t of seed.transactions.filter(t => t.account_id === account.id)) {
        balance += account.type === "credit_card" ? -t.amount_cents : t.amount_cents;
        if (account.type !== "credit_card") expect(balance, `${account.id} ${t.posted_on} ${t.id}`).toBeGreaterThanOrEqual(0);
        if (account.id === "acc_card") { expect(balance, `${t.posted_on} ${t.id}`).toBeLessThanOrEqual(account.limit_cents!); expect(balance, `${t.posted_on} ${t.id}`).toBeGreaterThanOrEqual(0); }
      }
      expect(balance).toBe(account.balance_cents);
    }
  });
  it("pairs transfers and card bill payments", () => {
    const groups = new Map<string, typeof seed.transactions>();
    for (const t of seed.transactions.filter(t => t.transfer_group_id)) groups.set(t.transfer_group_id!, [...(groups.get(t.transfer_group_id!) ?? []), t]);
    for (const rows of groups.values()) {
      expect(rows).toHaveLength(2); expect(rows[0].amount_cents + rows[1].amount_cents).toBe(0);
      expect(rows[0].posted_on).toBe(rows[1].posted_on);
      if (rows.some(t => t.kind === "card_payment")) { expect(rows.map(t => t.kind).sort()).toEqual(["card_payment", "card_payment_out"]); expect(rows.every(t => t.description.includes("bill_card"))).toBe(true); }
    }
    expect([...groups.values()].filter(rows => rows.some(t => t.kind === "card_payment"))).toHaveLength(24);
  });
  it("has bounded dates, stable output, sufficient history and relative timing", () => {
    expect(generateSeed()).toEqual(seed); expect(seed.transactions.length).toBeGreaterThanOrEqual(1500); expect(seed.transactions.length).toBeLessThanOrEqual(3000);
    expect(seed.transactions.every(t => t.posted_on >= HISTORY_START && t.posted_on <= SEED_ANCHOR_DATE)).toBe(true);
    expect(seed.bills.every(b => b.due_date > SEED_ANCHOR_DATE)).toBe(true);
    expect(daysBetween(SEED_ANCHOR_DATE, seed.bills.find(b => b.id === "bill_hydro")!.due_date)).toBe(3);
    expect(daysBetween(SEED_ANCHOR_DATE, seed.bills.find(b => b.id === "bill_card")!.due_date)).toBe(9);
    expect(daysBetween(SEED_ANCHOR_DATE, seed.bills.find(b => b.id === "bill_rent")!.due_date)).toBe(16);
    const payroll = seed.transactions.filter(t => t.kind === "income");
    expect(payroll.every(t => t.amount_cents === PERSONA.pay.net_cents && daysBetween(PERSONA.pay.anchor_payday, t.posted_on) % 14 === 0 && new Date(`${t.posted_on}T00:00:00Z`).getUTCDay() === 5)).toBe(true);
    expect(addDays(PERSONA.pay.anchor_payday, 14)).toBe(addDays(SEED_ANCHOR_DATE, 5)); expect(addDays(PERSONA.pay.anchor_payday, 28)).toBe(addDays(SEED_ANCHOR_DATE, 19));
    for (const s of SEED_SECURITIES) {
      const prices = seed.prices.filter(p => p.ticker === s.ticker);
      expect(prices.every(p => p.date >= HISTORY_START && p.date <= SEED_ANCHOR_DATE && ![0, 6].includes(new Date(`${p.date}T00:00:00Z`).getUTCDay()))).toBe(true);
      const expected = Array.from({length: daysBetween(HISTORY_START, SEED_ANCHOR_DATE) + 1}, (_, i) => addDays(HISTORY_START, i)).filter(d => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
      expect(prices.map(p => p.date)).toEqual(expected);
    }
  });
  it("seeds and clones shifted rows in PGlite, and can reseed", async () => {
    const pg = new PGlite();
    try {
      await pg.exec(await readFile("db/migrations/0001_init.sql", "utf8"));
      const db: Database = { query: (sql, params) => pg.query(sql, params), transaction: fn => pg.transaction(tx => fn({ query: (sql, params) => tx.query(sql, params) })) };
      await insertSeed(db, seed); await insertSeed(db, seed);
      const sid = "00000000-0000-4000-8000-000000000001";
      await pg.query("insert into sessions (id, today_date, date_offset_days) values ($1, $2, $3)", [sid, "2027-01-05", 51]);
      await pg.query("select clone_template($1)", [sid]);
      for (const table of ["accounts", "transactions", "holdings", "bills", "contacts", "room"]) {
        const result = await pg.query<{ count: number }>(`select count(*)::int as count from ${table} where session_id = $1`, [sid]);
        const original = await pg.query<{ count: number }>(`select count(*)::int as count from ${table} where session_id = $1`, [TEMPLATE_SESSION_ID]);
        expect(result.rows).toEqual(original.rows);
      }
      await insertSeed(db, seed); // Existing cloned holdings must not prevent a reseed.
      const shifted = await pg.query<{ due: string; year: number }>("select b.due_date::text as due, r.year from bills b join room r on r.session_id = b.session_id and r.account_type = 'tfsa' where b.session_id = $1 and b.id = 'bill_hydro'", [sid]);
      expect(shifted.rows[0]).toEqual({ due: "2027-01-08", year: 2027 });
      const price = await pg.query<{ date: string }>("select date::text from session_prices($1) where ticker = 'NRTH.CX' order by date desc limit 1", [sid]);
      expect(price.rows[0].date).toBe(addDays(seed.prices.filter(p => p.ticker === "NRTH.CX").at(-1)!.date, 51));
    } finally { await pg.close(); }
  }, 30000);
});





