// Small dashboard building blocks. Pure presentation; data comes in as props.
import type { AccountView, Transaction } from "../../contracts";
import type { UpcomingEvent } from "../../lib/api";
import { money, relativeDay, shortDate, signedMoney } from "../../lib/format";
import { Mascot } from "../coin/mascot";

export function HeroStat({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <p className="text-xs font-bold text-on-ink-muted">{label}</p>
      <p className="money mt-1 text-lg font-extrabold">{signedMoney(cents)}</p>
    </div>
  );
}

export function BalanceHero({ accounts, monthChange }: { accounts: AccountView[]; monthChange: number | null }) {
  const sum = (types: string[]) =>
    accounts.filter((a) => types.includes(a.type)).reduce((total, a) => total + a.total_value_cents, 0);
  const cash = sum(["chequing", "hisa"]);
  const investments = sum(["tfsa", "rrsp", "non_registered"]);
  const card = sum(["credit_card"]);
  const netWorth = cash + investments + card;

  return (
    <section className="relative overflow-hidden rounded-coin-lg bg-surface-ink p-7 text-on-ink shadow-coin ring-1 ring-gold/25">
      <p className="text-sm font-bold text-on-ink-muted">Net worth</p>
      <p className="money mt-1 text-5xl font-extrabold tracking-tight">{money(netWorth)}</p>
      {monthChange !== null && (
        <p
          className={`money mt-3 inline-flex rounded-full px-3 py-1 text-sm font-extrabold ${
            monthChange >= 0 ? "bg-accent text-accent-ink" : "bg-loss text-white"
          }`}
        >
          {signedMoney(monthChange, true)} this month
        </p>
      )}
      <div className="mt-7 grid grid-cols-3 gap-4 border-t border-white/15 pt-5">
        <HeroStat label="Cash" cents={cash} />
        <HeroStat label="Investments" cents={investments} />
        <HeroStat label="Card owing" cents={card} />
      </div>
      <div className="absolute right-6 top-6">
        <Mascot size={56} />
      </div>
    </section>
  );
}

const GROUPS: { title: string; types: string[] }[] = [
  { title: "Cash", types: ["chequing", "hisa"] },
  { title: "Investments", types: ["tfsa", "rrsp", "non_registered"] },
  { title: "Credit", types: ["credit_card"] },
];

function accountSubtitle(account: AccountView, today: string): string {
  if (account.type === "credit_card" && account.statement_due_date) {
    return `Statement due ${relativeDay(account.statement_due_date, today)}`;
  }
  if (account.market_value_cents !== null) return `Holdings ${money(account.market_value_cents)}`;
  return `Ends ${account.mask}`;
}

export function AccountList({
  accounts,
  today,
  onOpen,
}: {
  accounts: AccountView[];
  today: string;
  onOpen: (account: AccountView) => void;
}) {
  return (
    <section className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="mb-2 text-sm font-extrabold text-muted">{group.title}</h3>
          <div className="divide-y divide-border rounded-coin border border-border bg-surface px-5 shadow-coin">
            {accounts
              .filter((a) => group.types.includes(a.type))
              .map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onOpen(account)}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span>
                    <span className="block font-extrabold">{account.name}</span>
                    <span className="block text-sm font-semibold text-subtle">{accountSubtitle(account, today)}</span>
                  </span>
                  <span className={`money text-lg font-extrabold ${account.total_value_cents < 0 ? "text-loss" : ""}`}>
                    {signedMoney(account.total_value_cents)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function UpcomingStrip({ events, today }: { events: UpcomingEvent[]; today: string }) {
  if (events.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-extrabold text-muted">Next 14 days</h3>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {events.map((event) => {
          const low = event.projected_balance_cents < 50_000;
          return (
            <div
              key={`${event.date}-${event.label}`}
              className={`min-w-44 rounded-coin border bg-surface p-4 shadow-coin ${low ? "border-warning" : "border-border"}`}
            >
              <p className="text-xs font-bold text-subtle">
                {shortDate(event.date)}, {relativeDay(event.date, today)}
              </p>
              <p className="mt-1 truncate text-sm font-extrabold">{event.label}</p>
              <p className={`money mt-1 text-base font-extrabold ${event.amount_cents > 0 ? "text-gain" : ""}`}>
                {signedMoney(event.amount_cents, true)}
              </p>
              <p className={`money mt-1 text-xs font-semibold ${low ? "text-warning" : "text-muted"}`}>
                Chequing after: {signedMoney(event.projected_balance_cents)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TransactionList({ transactions, title }: { transactions: Transaction[]; title: string }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-extrabold text-muted">{title}</h3>
      <ul className="divide-y divide-border rounded-coin border border-border bg-surface px-5 shadow-coin">
        {transactions.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
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
