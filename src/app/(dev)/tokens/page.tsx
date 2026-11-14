// Design token review page (dev only). Renders the whole sheet in light and
// dark so Pranav can approve Coin's look before any product screen is built.
import { ApprovalCardPreview } from "./approval-card";
import { chartSeries, colourRoles, exampleCards, money, outflow } from "./preview-data";

function SectionIntro({ index, title, body }: { index: string; title: string; body?: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-accent">{index}</p>
      <h3 className="mt-3 text-2xl font-bold">{title}</h3>
      {body && <p className="mt-3 text-sm leading-6 text-muted">{body}</p>}
    </div>
  );
}

function Section({ intro, children }: { intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-16 grid gap-12 border-t border-border pt-12 lg:grid-cols-[200px_1fr]">
      {intro}
      {children}
    </div>
  );
}

function ColourSwatches() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {colourRoles.map(([name, role]) => (
        <div key={name} className="overflow-hidden rounded-coin-sm border border-border bg-surface">
          <div className="h-16 border-b border-border" style={{ background: `var(--${name})` }} />
          <div className="p-3">
            <p className="text-sm font-bold">{name}</p>
            <p className="mt-1 text-xs text-muted">{role}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TypeScale() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted">Display / 48</p>
        <p className="money mt-1 text-4xl font-bold tracking-tight md:text-5xl">$128,450.12</p>
      </div>
      <div>
        <p className="text-xs text-muted">Heading / 30</p>
        <p className="mt-1 text-3xl font-bold">Your money, in view</p>
      </div>
      <div>
        <p className="text-xs text-muted">Title / 20</p>
        <p className="mt-1 text-xl font-bold">Everyday Chequing</p>
      </div>
      <div>
        <p className="text-xs text-muted">Body / 16 &middot; Caption / 12</p>
        <p className="mt-1 text-base">A clear next step, whenever you need one.</p>
        <p className="money mt-1 text-xs text-muted">Available balance &middot; $2,840.12</p>
      </div>
    </div>
  );
}

function Foundations() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="rounded-coin border border-border bg-surface p-5">
        <p className="font-bold">Spacing</p>
        <div className="mt-4 flex items-end gap-2">
          {[4, 8, 12, 16, 24, 32, 48].map((n) => (
            <div key={n} className="text-center">
              <div className="mx-auto bg-accent" style={{ width: n, height: n }} />
              <span className="text-xs text-muted">{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-coin border border-border bg-surface p-5">
        <p className="font-bold">Radius</p>
        <div className="mt-4 flex gap-3">
          {[8, 16, 24].map((n) => (
            <div key={n} className="grid h-14 w-14 place-items-center border border-accent text-xs" style={{ borderRadius: n }}>
              {n}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-coin border border-border bg-surface p-5 shadow-coin">
        <p className="font-bold">Elevation</p>
        <p className="mt-4 text-sm text-muted">A soft card shadow separates layers without adding noise.</p>
      </div>
    </div>
  );
}

function ChartPalette() {
  const max = Math.max(...chartSeries.map((s) => s.value));
  return (
    <div className="rounded-coin border border-border bg-surface p-6 shadow-coin">
      <p className="font-bold">A categorical palette</p>
      <div className="mt-6 grid grid-cols-6 items-end gap-4">
        {chartSeries.map((series, i) => (
          <div key={series.name} className="flex flex-col items-center gap-2">
            <div
              className="w-full max-w-14 rounded-md"
              style={{ height: (series.value / max) * 110, background: `var(--chart-${i + 1})` }}
            />
            <p className="flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: `var(--chart-${i + 1})` }} />
              {series.name}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoinAvatar({ size = "h-8 w-8 text-sm" }: { size?: string }) {
  return (
    <div className={`grid shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-ink ${size}`} aria-label="Coin">
      C
    </div>
  );
}

function ProductSamples() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-coin border border-border bg-surface p-6 shadow-coin">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Balance header</p>
        <p className="mt-4 text-sm text-muted">Net worth</p>
        <p className="money mt-1 text-4xl font-bold tracking-tight">$386,214.07</p>
        <p className="money mt-2 text-sm text-gain">+$4,812.30 (1.3%) this month</p>

        <p className="mt-8 text-xs font-bold uppercase tracking-wider text-muted">Account rows</p>
        <div className="mt-2 divide-y divide-border">
          <AccountRow name="Everyday Chequing" kind={"Chequing · 4471"} amount={284_012} />
          <AccountRow name="TFSA" kind={"Investments · 1188"} amount={9_754_840} />
          <AccountRow name="Rewards Credit Card" kind="Due in 9 days" amount={-491_238} />
        </div>
      </div>

      <div className="rounded-coin border border-border bg-surface-soft p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Coin sidebar message</p>
        <div className="mt-4 flex gap-3">
          <CoinAvatar />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-6">
              Your investments are up 14.2% this year. Northwind Robotics is 33% of everything you hold, the one
              position worth a closer look.
            </p>
            <div className="mt-3 rounded-coin border border-border bg-surface p-4">
              <p className="text-sm font-bold">Allocation by holding</p>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                {[33, 26, 13, 11, 10, 7].map((w, i) => (
                  <div key={i} style={{ width: `${w}%`, background: `var(--chart-${i + 1})` }} />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Chart placeholder &middot; real charts come from W7</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ name, kind, amount }: { name: string; kind: string; amount: number }) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="font-bold">{name}</p>
        <p className="text-xs text-muted">{kind}</p>
      </div>
      <p className={`money font-bold ${amount < 0 ? "text-loss" : ""}`}>
        {amount < 0 ? `−${money(-amount)}` : money(amount)}
      </p>
    </div>
  );
}

function OutflowMeter() {
  const share = (outflow.used_cents / outflow.limit_cents) * 100;
  return (
    <div className="max-w-md rounded-coin border border-border bg-surface p-5">
      <div className="money flex justify-between gap-4 text-sm font-bold">
        <span>Paid out today</span>
        <span>
          {money(outflow.used_cents)} of {money(outflow.limit_cents)}
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-soft"
        role="meter"
        aria-label="Paid out today"
        aria-valuemin={0}
        aria-valuemax={outflow.limit_cents / 100}
        aria-valuenow={outflow.used_cents / 100}
      >
        <div className="h-full rounded-full bg-pending" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">Includes pending and executed bill payments and e-transfers.</p>
    </div>
  );
}

function ThemeSheet({ theme }: { theme: "light" | "dark" }) {
  return (
    <section data-theme={theme} className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-14 md:px-12 md:py-20">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Coin / Design system</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">A little more clarity.</h2>
            <p className="mt-3 max-w-xl text-muted">
              A quiet foundation for confident decisions. This is a static design review, not a working product.
            </p>
          </div>
          <span className="rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wider">
            {theme} mode
          </span>
        </header>

        <Section intro={<SectionIntro index="01 / Colour" title="Useful by nature." body="Soft surfaces, clear ink and a single grounded accent." />}>
          <ColourSwatches />
        </Section>
        <Section intro={<SectionIntro index="02 / Type" title="Room to breathe." body="Manrope, with tabular figures for every money value." />}>
          <TypeScale />
        </Section>
        <Section intro={<SectionIntro index="03 / Foundations" title="Measured details." />}>
          <Foundations />
        </Section>
        <Section intro={<SectionIntro index="04 / Data" title="Distinct, not loud." body="Categories carry labels as well as colour." />}>
          <ChartPalette />
        </Section>
        <Section intro={<SectionIntro index="05 / Product" title="Numbers first." body="The dashboard and Coin share one calm voice." />}>
          <ProductSamples />
        </Section>

        <div className="mt-16 border-t border-border pt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionIntro index="06 / Action language" title="A moment to decide." body="Every state of the approval card, with the rule checks." />
            <CoinAvatar size="h-14 w-14 text-lg" />
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {exampleCards.map(({ label, card }) => (
              <div key={label}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
                <ApprovalCardPreview card={card} />
              </div>
            ))}
          </div>
          <div className="mt-8">
            <OutflowMeter />
          </div>
        </div>
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
