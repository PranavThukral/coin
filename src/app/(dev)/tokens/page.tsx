// Design review page (dev only), v2. Renders Coin's identity in light and
// dark so Pranav can approve it before any product screen is built.
import { ApprovalCardPreview } from "../../../components/actions/approval-card";
import { Replay } from "../../../components/ui/live-bits";
import { MASCOT_OPTIONS, Mascot, type MascotMood } from "../../../components/coin/mascot";
import { chartSeries, exampleCards, money, outflow } from "./preview-data";

const GREYS = ["grey-0", "grey-50", "grey-100", "grey-200", "grey-300", "grey-500", "grey-700", "grey-900"];

const ACCENTS = [
  { name: "accent", role: "Actions, gains" },
  { name: "gold", role: "Coin itself" },
  { name: "pending", role: "Undo window" },
  { name: "loss", role: "Losses, blocks" },
  { name: "warning", role: "Needs a look" },
];

const MOODS: { mood: MascotMood; when: string }[] = [
  { mood: "idle", when: "Waiting" },
  { mood: "thinking", when: "Reading your data (glint sweeps)" },
  { mood: "happy", when: "Action went through" },
  { mood: "concerned", when: "A check blocked it" },
];

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <h3 className="text-3xl font-extrabold tracking-tight">{title}</h3>
      {body && <p className="mt-2 text-base font-medium text-muted">{body}</p>}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="mt-20 border-t-2 border-border pt-12">{children}</div>;
}

function MascotOptions() {
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MASCOT_OPTIONS.map((option) => (
          <div key={option.variant} className="rounded-coin border border-border bg-surface p-6 shadow-coin">
            <div className="flex h-28 items-center justify-center rounded-coin-sm bg-surface-soft">
              <Mascot variant={option.variant} size={88} />
            </div>
            <p className="mt-4 text-lg font-extrabold">{option.name}</p>
            <p className="mt-1 text-sm font-medium text-muted">{option.idea}</p>
            <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <Mascot variant={option.variant} mood="thinking" size={32} />
              <Mascot variant={option.variant} mood="happy" size={32} />
              <Mascot variant={option.variant} mood="concerned" size={32} />
              <Mascot variant={option.variant} size={16} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-coin border border-border bg-surface p-6 shadow-coin">
        <p className="text-lg font-extrabold">Coin&rsquo;s mark: Ring, in every mood</p>
        <div className="mt-5 grid grid-cols-2 gap-6 md:grid-cols-4">
          {MOODS.map(({ mood, when }) => (
            <div key={mood} className="flex flex-col items-center text-center">
              <Mascot variant="ring" mood={mood} size={72} />
              <p className="mt-3 text-sm font-extrabold capitalize">{mood}</p>
              <p className="text-xs font-medium text-muted">{when}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Colours() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="rounded-coin border border-border bg-surface p-6 shadow-coin">
        <p className="font-extrabold">Grey ladder</p>
        <p className="text-sm font-medium text-muted">Surfaces step up, text steps down. Every pair is chosen for contrast.</p>
        <div className="mt-4 grid grid-cols-8 overflow-hidden rounded-coin-sm border border-border">
          {GREYS.map((name) => (
            <div key={name} className="h-20" style={{ background: `var(--${name})` }} title={name} />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-8 text-center text-[11px] font-bold text-muted">
          {GREYS.map((name) => (
            <span key={name}>{name.replace("grey-", "")}</span>
          ))}
        </div>
      </div>
      <div className="rounded-coin border border-border bg-surface p-6 shadow-coin">
        <p className="font-extrabold">Accents</p>
        <div className="mt-4 space-y-3">
          {ACCENTS.map(({ name, role }) => (
            <div key={name} className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-full" style={{ background: `var(--${name})` }} />
              <span className="font-extrabold capitalize">{name}</span>
              <span className="text-sm font-medium text-muted">{role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypeScale() {
  return (
    <div className="mt-8 grid gap-6 rounded-coin border border-border bg-surface p-8 shadow-coin md:grid-cols-2">
      <div>
        <p className="text-sm font-bold text-subtle">Amount, 56 / 800</p>
        <p className="money text-[56px] font-extrabold leading-none tracking-tight">$386,214.07</p>
        <p className="mt-6 text-sm font-bold text-subtle">Heading, 30 / 800</p>
        <p className="text-3xl font-extrabold tracking-tight">Where your money went</p>
      </div>
      <div className="space-y-5">
        <div>
          <p className="text-sm font-bold text-subtle">Title, 18 / 800</p>
          <p className="text-lg font-extrabold">Everyday Chequing</p>
        </div>
        <div>
          <p className="text-sm font-bold text-subtle">Body, 16 / 500, key figures in 800</p>
          <p className="text-base font-medium">
            You spent <strong className="font-extrabold">$1,268.40</strong> on dining this month,
            <strong className="font-extrabold text-loss"> 18% more</strong> than October.
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-subtle">Supporting, 14 / 600 in grey-700</p>
          <p className="text-sm font-semibold text-muted">Updated just now from all six accounts</p>
        </div>
      </div>
    </div>
  );
}

function BalanceHero() {
  return (
    <div className="relative overflow-hidden rounded-coin-lg bg-surface-ink p-8 text-on-ink shadow-coin">
      <p className="text-sm font-bold text-on-ink-muted">Net worth</p>
      <p className="money mt-1 text-5xl font-extrabold tracking-tight">$386,214.07</p>
      <p className="money mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-extrabold text-accent-ink">
        +$4,812.30 this month
      </p>
      <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-5">
        <HeroStat label="Cash" value={2_734_012} />
        <HeroStat label="Investments" value={36_378_633} />
        <HeroStat label="Card owing" value={-491_238} />
      </div>
      <div className="absolute right-6 top-6">
        <Mascot size={64} />
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-bold text-on-ink-muted">{label}</p>
      <p className="money mt-1 text-lg font-extrabold">{value < 0 ? `−${money(-value)}` : money(value)}</p>
    </div>
  );
}

function AccountRow({ name, kind, amount }: { name: string; kind: string; amount: number }) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="font-extrabold">{name}</p>
        <p className="text-sm font-semibold text-subtle">{kind}</p>
      </div>
      <p className={`money text-lg font-extrabold ${amount < 0 ? "text-loss" : ""}`}>
        {amount < 0 ? `−${money(-amount)}` : money(amount)}
      </p>
    </div>
  );
}

function CoinSidebar() {
  return (
    <div className="rounded-coin-lg border border-border bg-surface shadow-coin">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Mascot size={36} mood="thinking" />
        <div>
          <p className="font-extrabold leading-tight">Coin</p>
          <p className="text-xs font-bold text-pending">Reading your investments&hellip;</p>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <p className="ml-auto w-fit max-w-[80%] rounded-coin bg-surface-ink px-4 py-2.5 text-sm font-semibold text-on-ink">
          How have my investments done, and what am I concentrated in?
        </p>
        <div className="flex gap-3">
          <Mascot size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-6">
              Up <strong className="font-extrabold text-gain">14.2%</strong> this year. One stock,{" "}
              <strong className="font-extrabold">Northwind Robotics</strong>, is{" "}
              <strong className="font-extrabold text-warning">33%</strong> of everything you hold.
            </p>
            <div className="mt-3 rounded-coin-sm border border-border bg-surface-soft p-3">
              <p className="text-sm font-extrabold">Allocation by holding</p>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                {[33, 26, 13, 11, 10, 7].map((width, i) => (
                  <div key={i} style={{ width: `${width}%`, background: `var(--chart-${i + 1})` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsedCoin() {
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-ink shadow-coin ring-4 ring-gold/30">
        <Mascot size={44} />
      </div>
      <div>
        <p className="font-extrabold">Coin, collapsed</p>
        <p className="text-sm font-medium text-muted">Bottom-right corner. Tap to reopen.</p>
      </div>
    </div>
  );
}

function ProductSamples() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <BalanceHero />
        <div className="rounded-coin border border-border bg-surface px-6 shadow-coin">
          <div className="divide-y divide-border">
            <AccountRow name="Everyday Chequing" kind="Chequing, ends 4471" amount={284_012} />
            <AccountRow name="TFSA" kind="Investments, ends 1188" amount={9_754_840} />
            <AccountRow name="Rewards Credit Card" kind="Due in 9 days" amount={-491_238} />
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <CoinSidebar />
        <CollapsedCoin />
      </div>
    </div>
  );
}

function ChartPalette() {
  const max = Math.max(...chartSeries.map((s) => s.value));
  const names = ["Housing", "Groceries", "Dining", "Shopping", "Transport", "Other"];
  return (
    <div className="mt-8 rounded-coin border border-border bg-surface p-6 shadow-coin">
      <p className="font-extrabold">Spending by category</p>
      <div className="mt-6 grid grid-cols-6 items-end gap-4">
        {chartSeries.map((series, i) => (
          <div key={series.name} className="flex flex-col items-center gap-2">
            <div
              className="w-full max-w-16 rounded-t-lg"
              style={{ height: (series.value / max) * 140, background: `var(--chart-${i + 1})` }}
            />
            <p className="text-xs font-bold">{names[i]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutflowMeter() {
  const share = (outflow.used_cents / outflow.limit_cents) * 100;
  return (
    <div className="max-w-md rounded-coin border border-border bg-surface p-5 shadow-coin">
      <div className="money flex justify-between gap-4 text-sm font-extrabold">
        <span>Paid out today</span>
        <span>
          {money(outflow.used_cents)} <span className="font-semibold text-subtle">of {money(outflow.limit_cents)}</span>
        </span>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-soft"
        role="meter"
        aria-label="Paid out today"
        aria-valuemin={0}
        aria-valuemax={outflow.limit_cents / 100}
        aria-valuenow={outflow.used_cents / 100}
      >
        <div className="h-full rounded-full bg-pending" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-2 text-xs font-semibold text-muted">Bill payments and e-transfers, pending and done.</p>
    </div>
  );
}

function ActionCards() {
  return (
    <>
      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {exampleCards.map(({ label, card }) => {
          const replayable = card.status === "executed" || card.status === "cancelled" || card.status === "pending_undo";
          const preview = <ApprovalCardPreview card={card} />;
          return (
            <div key={label}>
              <p className="mb-3 text-sm font-extrabold text-muted">{label}</p>
              {replayable ? <Replay>{preview}</Replay> : preview}
            </div>
          );
        })}
      </div>
      <div className="mt-8">
        <OutflowMeter />
      </div>
    </>
  );
}

function ThemeSheet({ theme }: { theme: "light" | "dark" }) {
  return (
    <section data-theme={theme} className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-14 md:px-12 md:py-20">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Mascot size={72} />
            <div>
              <h2 className="text-5xl font-extrabold tracking-tight">Coin</h2>
              <p className="mt-1 text-lg font-semibold text-muted">Design system v2, {theme} theme</p>
            </div>
          </div>
        </header>

        <Section>
          <Heading title="Meet Coin" body="Four marks, no faces: flat shapes from the same tokens as everything else. Each works at 16px in a tab, 44px collapsed, and large on the welcome screen." />
          <MascotOptions />
        </Section>
        <Section>
          <Heading title="Colour" body="A deliberate grey ladder for contrast, emerald for doing, gold for Coin." />
          <Colours />
        </Section>
        <Section>
          <Heading title="Type" body="Manrope, heavier: 800 for money and headings, so numbers lead." />
          <TypeScale />
        </Section>
        <Section>
          <Heading title="Product" body="One bold dark surface (the balance) and calm cards around it." />
          <ProductSamples />
          <ChartPalette />
        </Section>
        <Section>
          <Heading
            title="Approval cards"
            body="Every state has its own frame. Cards list only the checks that broke."
          />
          <ActionCards />
        </Section>
      </div>
    </section>
  );
}

export default function TokensPage() {
  return (
    <main>
      <ThemeSheet theme="light" />
      <ThemeSheet theme="dark" />
    </main>
  );
}
