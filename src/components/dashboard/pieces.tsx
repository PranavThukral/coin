"use client";

// Small dashboard building blocks. Pure presentation; data comes in as props.
// Lists reveal row by row, and a figure that changes counts to its new value.
import {
  CASH_ACCOUNT_TYPES,
  INVESTMENT_ACCOUNT_TYPES,
  type AccountType,
  type AccountView,
  type Transaction,
} from "../../contracts";
import type { UpcomingEvent } from "../../lib/api";
import { relativeDay, shortDate, signedMoney } from "../../lib/format";
import { CardGlyph, CashGlyph, ChevronIcon, TrendGlyph } from "../ui/icons";
import { AnimatedMoney, useChanged } from "../ui/motion";

/** `--i` staggers a row's reveal behind the rows before it. */
export function stagger(index: number): React.CSSProperties {
  return { "--i": index } as React.CSSProperties;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 px-1 text-lg font-extrabold tracking-tight">{children}</h3>;
}

const CARD = "rounded-coin bg-surface shadow-coin";

export interface Totals {
  cash: number;
  investments: number;
  card: number;
  netWorth: number;
}

export function totalsOf(accounts: AccountView[]): Totals {
  const sum = (types: readonly AccountType[]) =>
    accounts.filter((a) => types.includes(a.type)).reduce((total, a) => total + a.total_value_cents, 0);
  const cash = sum(CASH_ACCOUNT_TYPES);
  const investments = sum(INVESTMENT_ACCOUNT_TYPES);
  const card = sum(["credit_card"]);
  return { cash, investments, card, netWorth: cash + investments + card };
}

function HeroStat({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold text-subtle">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold sm:text-lg">
        <AnimatedMoney cents={cents} />
      </p>
    </div>
  );
}

/** What the net worth is made of, under the hero chart. */
export function HeroStats({ totals }: { totals: Totals }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <HeroStat label="Cash" cents={totals.cash} />
      <HeroStat label="Investments" cents={totals.investments} />
      <HeroStat label="Card owing" cents={totals.card} />
    </div>
  );
}

const GROUPS: { title: string; types: readonly AccountType[]; glyph: React.ReactNode }[] = [
  { title: "Cash", types: CASH_ACCOUNT_TYPES, glyph: <CashGlyph /> },
  { title: "Investments", types: INVESTMENT_ACCOUNT_TYPES, glyph: <TrendGlyph /> },
  { title: "Credit", types: ["credit_card"], glyph: <CardGlyph /> },
];

/** A gain or loss as coloured text on a pale capsule. */
export function ChangePill({ cents }: { cents: number }) {
  const tone = cents >= 0 ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss";
  return <span className={`money rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{signedMoney(cents, true)}</span>;
}

const KIND: Record<AccountType, string> = {
  chequing: "Chequing",
  hisa: "Savings",
  tfsa: "Tax-free savings",
  rrsp: "Retirement savings",
  non_registered: "Investing",
  credit_card: "Credit card",
};

/** Under the name: the card's due date, an investment account's all-time gain, or the kind of account. */
function AccountNote({ account, today, gain }: { account: AccountView; today: string; gain: number | undefined }) {
  if (account.type === "credit_card" && account.statement_due_date) {
    return <span className="text-loss">Statement due {relativeDay(account.statement_due_date, today)}</span>;
  }
  if (gain !== undefined) {
    return (
      <span className="flex items-center gap-1.5">
        <ChangePill cents={gain} />
        <span className="text-subtle">all time</span>
      </span>
    );
  }
  return <span>{KIND[account.type]}</span>;
}

function AccountRow({ account, today, gain, glyph, index, onOpen }: {
  account: AccountView;
  today: string;
  gain: number | undefined;
  glyph: React.ReactNode;
  index: number;
  onOpen: (account: AccountView) => void;
}) {
  const changed = useChanged(account.total_value_cents);
  return (
    <button
      type="button"
      onClick={() => onOpen(account)}
      style={stagger(index)}
      className={`coin-rise group flex w-full items-center gap-3.5 rounded-coin-sm px-3 py-3 text-left transition-colors hover:bg-surface-soft ${
        changed ? "coin-flash" : ""
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent-text">
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold">{account.name}</span>
        <span className="block truncate text-sm font-bold text-subtle">
          <AccountNote account={account} today={today} gain={gain} />
        </span>
      </span>
      <span className="shrink-0 text-right">
        {/* A card shows what is owed as a plain balance; its due date carries the urgency. */}
        <AnimatedMoney cents={Math.abs(account.total_value_cents)} className="block text-base font-extrabold sm:text-lg" />
        <span className="money block text-xs font-bold tracking-wide text-subtle">
          <span aria-hidden="true">&bull;&bull;&bull;&bull;</span> {account.mask}
        </span>
      </span>
      <ChevronIcon className="h-4 w-4 shrink-0 text-border-strong transition-transform group-hover:translate-x-0.5 group-hover:text-muted" />
    </button>
  );
}

export function AccountList({ accounts, gains, today, onOpen }: {
  accounts: AccountView[];
  gains: Record<string, number>;
  today: string;
  onOpen: (account: AccountView) => void;
}) {
  return (
    <section>
      <SectionTitle>Accounts</SectionTitle>
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group.title} className={`${CARD} p-3`}>
            <p className="px-3 pb-1 pt-2 text-xs font-extrabold uppercase tracking-wider text-subtle">{group.title}</p>
            {accounts
              .filter((a) => group.types.includes(a.type))
              .map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  today={today}
                  gain={gains[account.id]}
                  glyph={group.glyph}
                  index={accounts.indexOf(account)}
                  onOpen={onOpen}
                />
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function DateTile({ date }: { date: string }) {
  const [month, day] = shortDate(date).split(" ");
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-coin-sm bg-surface-soft text-center leading-none">
      <span>
        <span className="block text-[10px] font-extrabold text-subtle">{month}</span>
        <span className="money mt-0.5 block text-base font-extrabold">{day}</span>
      </span>
    </span>
  );
}

const LOW_BALANCE_CENTS = 50_000;

export function UpcomingList({ events, today }: { events: UpcomingEvent[]; today: string }) {
  if (events.length === 0) return null;
  return (
    <section>
      <SectionTitle>Next 14 days</SectionTitle>
      <ul className={`${CARD} px-5 py-2`}>
        {events.map((event, index) => {
          const low = event.projected_balance_cents < LOW_BALANCE_CENTS;
          return (
            <li key={`${event.date}-${event.label}`} style={stagger(index)} className="coin-rise flex items-center gap-3.5 py-3">
              <DateTile date={event.date} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold">{event.label}</span>
                <span className={`money block truncate text-xs font-semibold ${low ? "text-warning" : "text-subtle"}`}>
                  {relativeDay(event.date, today)}, chequing after {signedMoney(event.projected_balance_cents)}
                </span>
              </span>
              <span className={`money shrink-0 text-sm font-extrabold ${event.amount_cents > 0 ? "text-gain" : ""}`}>
                {signedMoney(event.amount_cents, true)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MerchantBadge({ name }: { name: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-soft text-sm font-extrabold text-muted" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function TransactionList({ transactions, title }: { transactions: Transaction[]; title: string }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <ul className={`${CARD} px-5 py-2`}>
        {transactions.map((t, index) => (
          <li key={t.id} style={stagger(Math.min(index, 14))} className="coin-rise flex items-center gap-3.5 py-3">
            <MerchantBadge name={t.merchant} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold">{t.merchant}</span>
              <span className="block truncate text-xs font-semibold text-subtle">
                {shortDate(t.posted_on)}, {t.category.replace(/_/g, " ")}
              </span>
            </span>
            <span className={`money shrink-0 text-sm font-extrabold ${t.amount_cents > 0 ? "text-gain" : ""}`}>
              {signedMoney(t.amount_cents, true)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
