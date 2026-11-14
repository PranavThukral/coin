"use client";

import { useEffect, useState } from "react";
import type { AccountView } from "../../contracts";
import { api, unwrap, type AccountDetailPayload, type DashboardPayload } from "../../lib/api";
import { money, signedMoney } from "../../lib/format";
import { ChartCard } from "../charts/chart-card";
import { AccountList, BalanceHero, TransactionList, UpcomingStrip } from "./pieces";

function Loading() {
  return (
    <div className="space-y-6" aria-label="Loading your accounts">
      <div className="h-52 animate-pulse rounded-coin-lg bg-surface-ink/80" />
      <div className="h-32 animate-pulse rounded-coin bg-surface" />
      <div className="h-64 animate-pulse rounded-coin bg-surface" />
    </div>
  );
}

function Overview({ data, onOpen }: { data: DashboardPayload; onOpen: (account: AccountView) => void }) {
  return (
    <div className="space-y-8">
      <BalanceHero accounts={data.accounts} monthChange={data.month_change_cents} />
      <UpcomingStrip events={unwrap(data.upcoming)} today={data.today} />
      <div className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <AccountList accounts={data.accounts} today={data.today} onOpen={onOpen} />
        <div className="space-y-8">
          <ChartCard chart={data.net_worth} height={220} />
          <TransactionList transactions={unwrap(data.recent_transactions)} title="Recent activity" />
        </div>
      </div>
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: NonNullable<AccountDetailPayload["holdings"]> }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-extrabold text-muted">Holdings</h3>
      <div className="overflow-hidden rounded-coin border border-border bg-surface shadow-coin">
        <table className="w-full text-sm">
          <thead className="bg-surface-soft text-left text-xs font-extrabold text-muted">
            <tr>
              <th className="px-4 py-2.5">Holding</th>
              <th className="px-4 py-2.5 text-right">Value</th>
              <th className="px-4 py-2.5 text-right">Gain</th>
              <th className="px-4 py-2.5 text-right">Of portfolio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {holdings.map((h) => (
              <tr key={h.ticker}>
                <td className="px-4 py-3">
                  <span className="block font-extrabold">{h.ticker}</span>
                  <span className="block text-xs font-semibold text-subtle">{h.name}, {h.quantity} shares</span>
                </td>
                <td className="money px-4 py-3 text-right font-extrabold">{money(h.market_value_cents)}</td>
                <td className={`money px-4 py-3 text-right font-extrabold ${h.unrealized_gain_cents >= 0 ? "text-gain" : "text-loss"}`}>
                  {signedMoney(h.unrealized_gain_cents, true)}
                </td>
                <td className={`money px-4 py-3 text-right font-extrabold ${h.weight_of_portfolio > 0.2 ? "text-warning" : ""}`}>
                  {(h.weight_of_portfolio * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountDetail({ accountId, refreshKey, onBack }: { accountId: string; refreshKey: number; onBack: () => void }) {
  const [detail, setDetail] = useState<AccountDetailPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .account(accountId)
      .then((payload) => !cancelled && setDetail(payload))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshKey]);

  if (failed && !detail) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm font-extrabold text-accent hover:underline">
          &larr; All accounts
        </button>
        <p className="font-semibold text-muted">This account didn&rsquo;t load. Refresh the page to try again.</p>
      </div>
    );
  }
  if (!detail) return <Loading />;
  const { account } = detail;

  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className="text-sm font-extrabold text-accent hover:underline">
        &larr; All accounts
      </button>
      <header>
        <p className="text-sm font-bold text-muted">{account.name}, ends {account.mask}</p>
        <p className={`money mt-1 text-5xl font-extrabold tracking-tight ${account.total_value_cents < 0 ? "text-loss" : ""}`}>
          {signedMoney(account.total_value_cents)}
        </p>
        {account.market_value_cents !== null && (
          <p className="money mt-2 text-sm font-semibold text-muted">
            {money(account.market_value_cents)} invested, {money(account.balance_cents)} cash
          </p>
        )}
      </header>
      <ChartCard chart={detail.chart} height={240} />
      {detail.holdings && <HoldingsTable holdings={detail.holdings} />}
      <TransactionList transactions={unwrap(detail.transactions)} title="Transactions" />
    </div>
  );
}

export function Dashboard({
  openAccountId,
  onOpenAccount,
  refreshKey,
}: {
  openAccountId: string | null;
  onOpenAccount: (account: AccountView | null) => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .dashboard()
      .then((payload) => !cancelled && setData(payload))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // A failed refresh keeps showing what already loaded.
  if (failed && !data) {
    return <p className="font-semibold text-muted">Your accounts didn&rsquo;t load. Refresh the page to try again.</p>;
  }
  if (openAccountId) {
    return <AccountDetail accountId={openAccountId} refreshKey={refreshKey} onBack={() => onOpenAccount(null)} />;
  }
  if (!data) return <Loading />;
  return <Overview data={data} onOpen={onOpenAccount} />;
}
