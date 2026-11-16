"use client";

// Activity: every recent transaction across the accounts, searchable, with
// this month's money in and out summed above it.
import { useEffect, useMemo, useState } from "react";
import type { AccountView, Transaction, TxnKind } from "../../contracts";
import { unwrap, type Wrapped } from "../../lib/api";
import { shortDate, signedMoney } from "../../lib/format";
import { SearchGlyph } from "../ui/icons";
import { stagger } from "./pieces";

interface ActivityPayload {
  today: string;
  accounts: AccountView[];
  transactions: Wrapped<Transaction[]>;
}

/** Money arriving from outside, and money leaving for good. Moves between your own accounts are neither. */
const MONEY_IN: TxnKind[] = ["income", "refund", "dividend", "interest", "etransfer_in"];
const MONEY_OUT: TxnKind[] = ["purchase", "bill_payment", "etransfer_out"];

function useActivity(refreshKey: number): ActivityPayload | null {
  const [data, setData] = useState<ActivityPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/activity", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => !cancelled && payload && setData(payload))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return data;
}

function monthTotals(transactions: Transaction[], today: string) {
  const month = today.slice(0, 7);
  const thisMonth = transactions.filter((t) => t.posted_on.startsWith(month));
  const sum = (kinds: TxnKind[]) =>
    thisMonth.filter((t) => kinds.includes(t.kind)).reduce((total, t) => total + t.amount_cents, 0);
  const moneyIn = sum(MONEY_IN);
  const moneyOut = sum(MONEY_OUT);
  return { moneyIn, moneyOut, net: moneyIn + moneyOut };
}

function Stat({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-xs font-medium text-subtle">{label}</p>
      <p className={`money mt-1 truncate text-xl font-bold tracking-tight ${tone}`}>{signedMoney(cents)}</p>
    </div>
  );
}

function Summary({ transactions, today }: { transactions: Transaction[]; today: string }) {
  const totals = monthTotals(transactions, today);
  return (
    <div className="coin-rise grid grid-cols-3 divide-x divide-border rounded-coin bg-surface shadow-coin">
      <Stat label="Net change this month" cents={totals.net} tone={totals.net >= 0 ? "text-gain" : "text-foreground"} />
      <Stat label="Money in" cents={totals.moneyIn} tone="text-gain" />
      <Stat label="Money out" cents={totals.moneyOut} tone="text-foreground" />
    </div>
  );
}

function Filters({ accounts, account, query, onAccount, onQuery }: {
  accounts: AccountView[];
  account: string;
  query: string;
  onAccount: (id: string) => void;
  onQuery: (text: string) => void;
}) {
  const field = "h-9 rounded-coin-sm bg-surface text-sm font-medium shadow-coin";
  return (
    <div className="flex flex-wrap gap-2">
      <label className={`${field} flex min-w-0 flex-1 items-center gap-2 px-3 text-subtle focus-within:shadow-[0_0_0_2px_var(--accent)]`}>
        <SearchGlyph />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search activity"
          aria-label="Search activity"
          className="coin-quiet-focus min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-subtle"
        />
      </label>
      <select
        value={account}
        onChange={(event) => onAccount(event.target.value)}
        aria-label="Account"
        className={`${field} px-3 text-foreground`}
      >
        <option value="">All accounts</option>
        {accounts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Row({ transaction, accountName, index }: { transaction: Transaction; accountName: string; index: number }) {
  const incoming = transaction.amount_cents > 0;
  return (
    <tr className="coin-rise" style={stagger(Math.min(index, 16))}>
      <td className="money whitespace-nowrap py-3 pl-5 pr-3 text-subtle">{shortDate(transaction.posted_on)}</td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-soft text-xs font-bold text-muted" aria-hidden="true">
            {transaction.merchant.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{transaction.merchant}</span>
            <span className="block truncate text-xs font-medium text-subtle">{accountName}</span>
          </span>
        </span>
      </td>
      <td className="hidden px-3 py-3 sm:table-cell">
        <span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium capitalize text-muted">
          {transaction.category.replace(/_/g, " ")}
        </span>
      </td>
      <td className={`money whitespace-nowrap py-3 pl-3 pr-5 text-right font-bold ${incoming ? "text-gain" : ""}`}>
        {signedMoney(transaction.amount_cents, true)}
      </td>
    </tr>
  );
}

function matches(transaction: Transaction, account: string, query: string): boolean {
  if (account && transaction.account_id !== account) return false;
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return transaction.merchant.toLowerCase().includes(text) || transaction.category.replace(/_/g, " ").includes(text);
}

export function ActivityView({ refreshKey }: { refreshKey: number }) {
  const data = useActivity(refreshKey);
  const [account, setAccount] = useState("");
  const [query, setQuery] = useState("");
  const transactions = useMemo(() => (data ? unwrap(data.transactions) : []), [data]);
  const shown = useMemo(() => transactions.filter((t) => matches(t, account, query)), [transactions, account, query]);

  if (!data) return <div className="h-[32rem] animate-pulse rounded-coin bg-surface shadow-coin" aria-label="Loading activity" />;
  const names = new Map(data.accounts.map((item) => [item.id as string, item.name]));

  return (
    <div className="space-y-5">
      <h1 className="coin-rise text-[1.75rem] font-bold tracking-[-0.02em]">Activity</h1>
      <Summary transactions={transactions} today={data.today} />
      <Filters accounts={data.accounts} account={account} query={query} onAccount={setAccount} onQuery={setQuery} />
      <div className="overflow-hidden rounded-coin bg-surface shadow-coin">
        <table className="w-full table-fixed text-sm">
          <thead className="text-left text-xs font-medium text-subtle">
            <tr className="border-b border-border">
              <th className="w-[5.5rem] py-2.5 pl-5 pr-3 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">To / from</th>
              <th className="hidden w-36 px-3 py-2.5 font-medium sm:table-cell">Category</th>
              <th className="w-32 py-2.5 pl-3 pr-5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((transaction, index) => (
              <Row key={transaction.id} transaction={transaction} accountName={names.get(transaction.account_id) ?? ""} index={index} />
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-5 py-10 text-center text-sm font-medium text-subtle">Nothing matches that.</p>}
      </div>
      <p className="money text-xs font-medium text-subtle">
        Showing {shown.length} of the latest {transactions.length} transactions, newest first.
      </p>
    </div>
  );
}
