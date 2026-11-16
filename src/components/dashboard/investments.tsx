"use client";

// Investments: everything invested as one figure and one line, how it splits
// by holding and by account, and every position. A position opens its security.
import { useEffect, useState } from "react";
import type { AccountView, ChartPayload, HoldingView } from "../../contracts";
import { money } from "../../lib/format";
import { ChartCard } from "../charts/chart-card";
import { AnimatedMoney } from "../ui/motion";
import { ChangePill, SectionTitle, stagger } from "./pieces";
import { SecurityDetail } from "./security-detail";

interface InvestmentsPayload {
  accounts: AccountView[];
  holdings: HoldingView[];
  value: ChartPayload;
  by_holding: ChartPayload;
  by_account: ChartPayload;
}

function useInvestments(refreshKey: number): InvestmentsPayload | null {
  const [data, setData] = useState<InvestmentsPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/investments", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => !cancelled && payload && setData(payload))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return data;
}

function Hero({ data }: { data: InvestmentsPayload }) {
  const invested = data.holdings.reduce((sum, holding) => sum + holding.market_value_cents, 0);
  const gain = data.holdings.reduce((sum, holding) => sum + holding.unrealized_gain_cents, 0);
  return (
    <section className="coin-rise rounded-coin-lg bg-surface shadow-coin">
      <div className="px-6 pt-6 sm:px-8 sm:pt-7">
        <p className="text-sm font-medium text-subtle">Invested</p>
        <p className="mt-1 text-[2.5rem] font-bold leading-none tracking-[-0.03em] sm:text-5xl">
          <AnimatedMoney cents={invested} split />
        </p>
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-subtle">
          <ChangePill cents={gain} />
          all-time gain
        </p>
      </div>
      <div className="px-3 pb-5 pt-3 sm:px-6">
        <ChartCard chart={data.value} height={220} bare hero />
      </div>
    </section>
  );
}

function Position({ holding, accountName, index, onOpen }: {
  holding: HoldingView;
  accountName: string;
  index: number;
  onOpen: (ticker: string) => void;
}) {
  return (
    <tr
      className="coin-rise cursor-pointer transition-colors hover:bg-surface-soft"
      style={stagger(Math.min(index, 14))}
      tabIndex={0}
      onClick={() => onOpen(holding.ticker)}
      onKeyDown={(event) => event.key === "Enter" && onOpen(holding.ticker)}
    >
      <td className="py-3 pl-5 pr-3">
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-coin-sm bg-surface-soft font-mono text-[10px] font-medium text-muted">
            {holding.ticker.replace(".CX", "")}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{holding.name}</span>
            <span className="block text-xs font-medium text-subtle">
              {holding.quantity} shares, {accountName}
            </span>
          </span>
        </span>
      </td>
      <td className="money hidden px-3 py-3 text-right text-subtle sm:table-cell">{money(holding.last_price_cents)}</td>
      <td className="money px-3 py-3 text-right font-bold">{money(holding.market_value_cents)}</td>
      <td className="py-3 pl-3 pr-5 text-right">
        <ChangePill cents={holding.unrealized_gain_cents} />
      </td>
    </tr>
  );
}

function Positions({ data, onOpen }: { data: InvestmentsPayload; onOpen: (ticker: string) => void }) {
  const names = new Map(data.accounts.map((account) => [account.id as string, account.name]));
  const largestFirst = [...data.holdings].sort((a, b) => b.market_value_cents - a.market_value_cents);
  return (
    <section>
      <SectionTitle>Positions</SectionTitle>
      <div className="overflow-hidden rounded-coin bg-surface shadow-coin">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-subtle">
            <tr className="border-b border-border">
              <th className="py-2.5 pl-5 pr-3 font-medium">Holding</th>
              <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Price</th>
              <th className="px-3 py-2.5 text-right font-medium">Value</th>
              <th className="py-2.5 pl-3 pr-5 text-right font-medium">All-time gain</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {largestFirst.map((holding, index) => (
              <Position
                key={`${holding.account_id}-${holding.ticker}`}
                holding={holding}
                accountName={names.get(holding.account_id) ?? ""}
                index={index}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function InvestmentsView({ refreshKey, onAsk }: { refreshKey: number; onAsk?: (question: string) => void }) {
  const data = useInvestments(refreshKey);
  const [ticker, setTicker] = useState<string | null>(null);

  if (ticker) {
    return <SecurityDetail ticker={ticker} refreshKey={refreshKey} backLabel="Investments" onBack={() => setTicker(null)} onAsk={onAsk} />;
  }
  if (!data) return <div className="h-[32rem] animate-pulse rounded-coin-lg bg-surface shadow-coin" aria-label="Loading investments" />;

  return (
    <div className="space-y-8">
      <h1 className="coin-rise text-[1.75rem] font-bold tracking-[-0.02em]">Investments</h1>
      <Hero data={data} />
      <div className="grid gap-5 @3xl:grid-cols-2">
        <ChartCard chart={data.by_holding} />
        <ChartCard chart={data.by_account} />
      </div>
      <Positions data={data} onOpen={setTicker} />
    </div>
  );
}
