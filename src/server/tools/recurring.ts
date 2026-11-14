import { daysBetween, type RecurringChange, type Transaction } from "../../contracts";

function similarAmount(a: Transaction, b: Transaction): boolean {
  const baseline = Math.abs(a.amount_cents);
  return baseline > 0 && Math.abs(a.amount_cents - b.amount_cents) * 100 <= baseline * 2;
}

function cadence(rows: Transaction[]): "weekly" | "monthly" | null {
  const gaps = rows.slice(1).map((row, index) => daysBetween(rows[index].posted_on, row.posted_on));
  if (gaps.every(gap => gap >= 6 && gap <= 8)) return "weekly";
  if (gaps.every(gap => gap >= 24 && gap <= 35)) return "monthly";
  return null;
}

function priceChange(rows: Transaction[]): RecurringChange | null {
  const last = rows[rows.length - 1];
  let step = rows.length - 1;
  while (step > 0 && similarAmount(last, rows[step - 1])) step--;
  if (step < 3 || rows.length - step < 2) return null;
  const old = rows[step - 1];
  if (!rows.slice(0, step).every(row => similarAmount(old, row))) return null;
  const oldCents = -old.amount_cents;
  const newCents = -last.amount_cents;
  return {
    merchant: last.merchant,
    account_id: last.account_id,
    change: newCents > oldCents ? "price_up" : "price_down",
    old_cents: oldCents,
    new_cents: newCents,
    since: rows[step].posted_on,
  };
}

function changesForGroup(rows: Transaction[], today: string): RecurringChange[] {
  rows.sort((a, b) => a.posted_on.localeCompare(b.posted_on));
  if (rows.length < 3) return [];
  const frequency = cadence(rows);
  if (!frequency) return [];
  const change = priceChange(rows);
  if (!change && !rows.every(row => similarAmount(rows[0], row))) return [];
  const first = rows[0];
  const last = rows[rows.length - 1];
  const age = daysBetween(last.posted_on, today);
  const stoppedAfter = frequency === "weekly" ? 11 : 45;
  if (age > stoppedAfter) {
    return [{
      merchant: last.merchant, account_id: last.account_id, change: "stopped",
      old_cents: -last.amount_cents, new_cents: null, since: last.posted_on,
    }];
  }
  const result: RecurringChange[] = [];
  const newWithin = frequency === "weekly" ? 21 : 62;
  if (daysBetween(first.posted_on, today) <= newWithin) {
    result.push({
      merchant: last.merchant, account_id: last.account_id, change: "new",
      old_cents: null, new_cents: -last.amount_cents, since: first.posted_on,
    });
  }
  if (change) result.push(change);
  return result;
}

export function recurringChanges(rows: Transaction[], today: string): RecurringChange[] {
  const groups = new Map<string, Transaction[]>();
  for (const row of rows) {
    const key = `${row.account_id}:${row.merchant}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].flatMap(group => changesForGroup(group, today));
}
