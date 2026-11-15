"use client";

// One security: its price over the past year and what you hold of it, by
// account. Opened by clicking a holding. Read-only; trades go through Coin.
import { useEffect, useState } from "react";
import type { ChartPayload, HoldingView } from "../../contracts";
import { money, signedMoney } from "../../lib/format";
import { ChartCard } from "../charts/chart-card";
import { BackIcon } from "../ui/icons";
import { SectionTitle, stagger } from "./pieces";

interface SecurityPayload {
  security: { ticker: string; name: string; kind: string; sector: string; dividend_yield_bps: number };
  chart: ChartPayload;
  positions: HoldingView[];
}

const ACCOUNT_NAME: Record<string, string> = {
  acc_tfsa: "TFSA",
  acc_rrsp: "RRSP",
  acc_nonreg: "Personal Investing",
};

const KIND: Record<string, string> = { stock: "Stock", etf: "Index fund (ETF)" };

function useSecurity(ticker: string, refreshKey: number): SecurityPayload | null {
  const [data, setData] = useState<SecurityPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/securities/${encodeURIComponent(ticker)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => !cancelled && payload && setData(payload))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ticker, refreshKey]);
  return data;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold text-subtle">{label}</p>
      <p className="money mt-1 truncate text-sm font-extrabold sm:text-base">{children}</p>
    </div>
  );
}

function PriceHeader({ data }: { data: SecurityPayload }) {
  const prices = data.chart.data.map((row) => Number(row.value ?? 0));
  const last = prices.at(-1) ?? 0;
  const first = prices[0] ?? last;
  const change = last - first;
  const percent = first ? `${((Math.abs(change) / first) * 100).toFixed(1)}%` : "";
  return (
    <header className="px-6 pt-7 sm:px-9 sm:pt-9">
      <p className="text-sm font-bold text-subtle">
        {data.security.name}{" "}
        <span className="ml-1 rounded-full bg-surface-soft px-2 py-0.5 text-xs font-extrabold">{data.security.ticker}</span>
      </p>
      <p className="money mt-1 text-[2.75rem] font-extrabold leading-none tracking-[-0.035em] sm:text-6xl">{money(last)}</p>
      <p className={`money mt-3 text-base font-extrabold ${change >= 0 ? "text-gain" : "text-loss"}`}>
        {signedMoney(change, true)} ({percent}) <span className="font-semibold text-subtle">past year, per share</span>
      </p>
    </header>
  );
}

function Positions({ positions }: { positions: HoldingView[] }) {
  if (positions.length === 0) {
    return <p className="rounded-coin bg-surface p-5 text-sm font-semibold text-muted shadow-coin">You don&rsquo;t hold this one.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-coin bg-surface px-5 shadow-coin">
      {positions.map((position, index) => (
        <li key={position.account_id} className="coin-rise grid grid-cols-2 gap-4 py-4 sm:grid-cols-4" style={stagger(index)}>
          <Fact label={ACCOUNT_NAME[position.account_id] ?? position.account_id}>{position.quantity} shares</Fact>
          <Fact label="Worth">{money(position.market_value_cents)}</Fact>
          <Fact label="Average cost">{money(position.avg_cost_cents)}</Fact>
          <Fact label="All-time gain">
            <span className={position.unrealized_gain_cents >= 0 ? "text-gain" : "text-loss"}>
              {signedMoney(position.unrealized_gain_cents, true)}
            </span>
          </Fact>
        </li>
      ))}
    </ul>
  );
}

function AskCoin({ name, onAsk }: { name: string; onAsk: (question: string) => void }) {
  const questions = [`How has ${name} done for me?`, `How concentrated am I in ${name}?`];
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onAsk(question)}
          className="rounded-full bg-accent-soft px-4 py-2.5 text-sm font-bold text-accent-text transition-transform hover:-translate-y-0.5"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

export function SecurityDetail({ ticker, refreshKey, onBack, onAsk }: {
  ticker: string;
  refreshKey: number;
  onBack: () => void;
  /** Hands a question about this security to Coin. */
  onAsk?: (question: string) => void;
}) {
  const data = useSecurity(ticker, refreshKey);
  if (!data) return <div className="h-[30rem] animate-pulse rounded-coin-lg bg-surface shadow-coin" />;
  const { security } = data;
  return (
    <div className="space-y-10">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-extrabold shadow-coin transition-transform hover:-translate-x-0.5"
      >
        <BackIcon />
        Back to the account
      </button>
      <section className="coin-rise rounded-coin-lg bg-surface shadow-coin-float">
        <PriceHeader data={data} />
        <div className="px-4 pb-4 pt-4 sm:px-7">
          <ChartCard chart={data.chart} height={260} bare hero />
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-border px-6 py-5 sm:px-9">
          <Fact label="Kind">{KIND[security.kind] ?? security.kind}</Fact>
          <Fact label="Sector">{security.sector}</Fact>
          <Fact label="Dividend yield">{(security.dividend_yield_bps / 100).toFixed(2)}%</Fact>
        </div>
      </section>
      <section>
        <SectionTitle>Your position</SectionTitle>
        <Positions positions={data.positions} />
      </section>
      {onAsk && <AskCoin name={security.name} onAsk={onAsk} />}
    </div>
  );
}
