"use client";

import { useEffect, useState } from "react";
import type { AccountView } from "../../contracts";
import { api, unwrap, type AccountDetailPayload, type DashboardPayload } from "../../lib/api";
import { money, signedMoney } from "../../lib/format";
import { ChartCard } from "../charts/chart-card";
import { BackIcon } from "../ui/icons";
import { AnimatedMoney } from "../ui/motion";
import { NetWorthHero } from "./net-worth-hero";
import { SecurityDetail } from "./security-detail";
import { AccountList, HeroStats, SectionTitle, stagger, totalsOf, TransactionList, UpcomingList } from "./pieces";

function Loading() {
  return (
    <div className="space-y-8" aria-label="Loading your accounts">
      <div className="h-[30rem] animate-pulse rounded-coin-lg bg-surface shadow-coin" />
      <div className="grid gap-8 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-coin bg-surface shadow-coin" />
        <div className="h-80 animate-pulse rounded-coin bg-surface shadow-coin" />
      </div>
    </div>
  );
}

function Overview({ data, refreshKey, onOpen }: {
  data: DashboardPayload;
  refreshKey: number;
  onOpen: (account: AccountView) => void;
}) {
  const totals = totalsOf(data.accounts);
  return (
    <div className="space-y-10">
      <NetWorthHero netWorthCents={totals.netWorth} refreshKey={refreshKey}>
        <HeroStats totals={totals} />
      </NetWorthHero>
      <div className="grid items-start gap-x-8 gap-y-10 xl:grid-cols-2">
        <AccountList accounts={data.accounts} gains={data.account_gains ?? {}} today={data.today} onOpen={onOpen} />
        <div className="space-y-10">
          <UpcomingList events={unwrap(data.upcoming)} today={data.today} />
          <TransactionList transactions={unwrap(data.recent_transactions)} title="Recent activity" />
        </div>
      </div>
    </div>
  );
}

type Holding = NonNullable<AccountDetailPayload["holdings"]>[number];

const CONCENTRATED_WEIGHT = 0.2;

function HoldingRow({ holding, index, onOpen }: { holding: Holding; index: number; onOpen: (ticker: string) => void }) {
  const gain = holding.unrealized_gain_cents;
  const concentrated = holding.weight_of_portfolio > CONCENTRATED_WEIGHT;
  return (
    <tr
      className="coin-rise cursor-pointer transition-colors hover:bg-surface-soft"
      style={stagger(index)}
      tabIndex={0}
      onClick={() => onOpen(holding.ticker)}
      onKeyDown={(event) => event.key === "Enter" && onOpen(holding.ticker)}
    >
      <td className="py-3.5 pl-5 pr-3">
        <span className="block font-extrabold">{holding.name}</span>
        <span className="block text-xs font-semibold text-subtle">
          {holding.ticker}, {holding.quantity} shares
        </span>
      </td>
      <td className="money px-3 py-3.5 text-right font-extrabold">{money(holding.market_value_cents)}</td>
      <td className={`money px-3 py-3.5 text-right font-extrabold ${gain >= 0 ? "text-gain" : "text-loss"}`}>
        {signedMoney(gain, true)}
      </td>
      <td className={`money py-3.5 pl-3 pr-5 text-right font-extrabold ${concentrated ? "text-warning" : ""}`}>
        {(holding.weight_of_portfolio * 100).toFixed(1)}%
      </td>
    </tr>
  );
}

function HoldingsTable({ holdings, onOpen }: { holdings: Holding[]; onOpen: (ticker: string) => void }) {
  return (
    <section>
      <SectionTitle>Holdings</SectionTitle>
      <div className="overflow-x-auto rounded-coin bg-surface shadow-coin">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-left text-xs font-extrabold text-subtle">
            <tr className="border-b border-border">
              <th className="py-3 pl-5 pr-3">Holding</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="px-3 py-3 text-right">Gain</th>
              <th className="py-3 pl-3 pr-5 text-right">Of portfolio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {holdings.map((holding, index) => (
              <HoldingRow key={holding.ticker} holding={holding} index={index} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-extrabold shadow-coin transition-transform hover:-translate-x-0.5"
    >
      <BackIcon />
      All accounts
    </button>
  );
}

function AccountHeader({ account }: { account: AccountView }) {
  const owing = account.total_value_cents < 0;
  return (
    <header className="px-6 pt-7 sm:px-9 sm:pt-9">
      <p className="text-sm font-bold text-subtle">
        {account.name}, ends {account.mask}
      </p>
      <p className={`mt-1 text-[2.75rem] font-extrabold leading-none tracking-[-0.035em] sm:text-6xl ${owing ? "text-loss" : ""}`}>
        <AnimatedMoney cents={account.total_value_cents} split />
      </p>
      {account.market_value_cents !== null && (
        <p className="money mt-3 text-sm font-semibold text-muted">
          {money(account.market_value_cents)} invested, {money(account.balance_cents)} cash
        </p>
      )}
    </header>
  );
}

function AccountDetail({ accountId, refreshKey, onBack, onAsk }: {
  accountId: string;
  refreshKey: number;
  onBack: () => void;
  onAsk?: (question: string) => void;
}) {
  const [ticker, setTicker] = useState<string | null>(null);
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
        <BackButton onBack={onBack} />
        <p className="font-semibold text-muted">This account didn&rsquo;t load. Refresh the page to try again.</p>
      </div>
    );
  }
  if (!detail) return <Loading />;
  if (ticker) {
    return <SecurityDetail ticker={ticker} refreshKey={refreshKey} onBack={() => setTicker(null)} onAsk={onAsk} />;
  }

  return (
    <div className="space-y-10">
      <BackButton onBack={onBack} />
      <section className="coin-rise rounded-coin-lg bg-surface shadow-coin-float">
        <AccountHeader account={detail.account} />
        <div className="px-4 pb-6 pt-4 sm:px-7">
          <ChartCard chart={detail.chart} height={260} bare hero />
        </div>
      </section>
      {detail.holdings && <HoldingsTable holdings={detail.holdings} onOpen={setTicker} />}
      <TransactionList transactions={unwrap(detail.transactions)} title="Transactions" />
    </div>
  );
}

export function Dashboard({
  openAccountId,
  onOpenAccount,
  refreshKey,
  onAsk,
}: {
  openAccountId: string | null;
  onOpenAccount: (account: AccountView | null) => void;
  refreshKey: number;
  /** Hands a question to Coin (from a security's page). */
  onAsk?: (question: string) => void;
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
    return <AccountDetail accountId={openAccountId} refreshKey={refreshKey} onBack={() => onOpenAccount(null)} onAsk={onAsk} />;
  }
  if (!data) return <Loading />;
  return <Overview data={data} refreshKey={refreshKey} onOpen={onOpenAccount} />;
}
