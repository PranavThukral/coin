import Link from "next/link";
import { Mascot } from "../components/coin/mascot";
import { CheckIcon } from "../components/ui/icons";
import { areaPath, plot, smoothPath, type Scale } from "../lib/chart-path";

const beat = (index: number) => ({ "--i": index }) as React.CSSProperties;

/** Ask: a plain question and a short answer. */
function AskScene() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <p className="ml-auto w-fit max-w-[88%] rounded-[20px] rounded-br-md bg-surface-ink px-3.5 py-2 text-sm font-semibold text-on-ink">
        Where did my money go this month?
      </p>
      <div className="flex items-start gap-2.5">
        <span className="mt-1 shrink-0">
          <Mascot size={26} />
        </span>
        <p className="rounded-[20px] rounded-tl-md bg-surface px-3.5 py-2 text-sm font-medium shadow-coin">
          Mostly rent and groceries. Dining is up <strong className="font-[800]">18%</strong> on last month.
        </p>
      </div>
    </div>
  );
}

const SCENE_VALUES = [20, 23, 22, 27, 26, 31, 29, 28, 35, 39, 38, 44, 47];
const SCENE_SCALE: Scale = { min: 16, max: 49, left: 2, right: 278, top: 4, bottom: 68 };

/** See: a figure with the chart that backs it up, drawing itself. */
function SeeScene() {
  const points = plot(SCENE_VALUES, SCENE_SCALE);
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <p className="money text-2xl font-extrabold tracking-tight">$349,400</p>
        <p className="money text-xs font-extrabold text-gain">+19.4% past year</p>
      </div>
      <div className="coin-wipe" style={beat(8)}>
        <svg viewBox="0 0 280 72" className="block w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="see-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(points, 72)} fill="url(#see-fill)" />
          <path d={smoothPath(points)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" fill="var(--accent)" stroke="var(--surface-soft)" strokeWidth="2.5" />
        </svg>
      </div>
    </div>
  );
}

/** Approve: Coin proposes, the checks run, the button is yours. */
function ApproveScene() {
  return (
    <div className="flex h-full flex-col justify-center" aria-hidden="true">
      <div className="rounded-coin bg-surface p-4 shadow-coin">
        <p className="flex w-fit items-center gap-1.5 rounded-full bg-gain-soft px-2.5 py-1 text-[11px] font-extrabold text-gain">
          <CheckIcon className="h-3 w-3" />
          Checks passed
        </p>
        <p className="mt-2.5 text-sm font-extrabold">Pay your credit card</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="money text-2xl font-extrabold tracking-tight">$1,250.00</p>
          <span className="rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold text-accent-ink shadow-coin-accent">Approve</span>
        </div>
      </div>
    </div>
  );
}

const CARDS = [
  {
    title: "Ask",
    body: "Plain questions about every account you have, answered in a sentence or two.",
    scene: <AskScene />,
    offset: "",
  },
  {
    title: "See",
    body: "Every answer comes with its chart. The numbers are computed in code, never guessed.",
    scene: <SeeScene />,
    offset: "lg:mt-12",
  },
  {
    title: "Approve",
    body: "Coin proposes a move, nine checks run, and nothing happens until you say so.",
    scene: <ApproveScene />,
    offset: "lg:mt-5",
  },
];

function FloatingCards() {
  return (
    <section className="grid gap-6 md:grid-cols-3 lg:gap-8" aria-label="What Coin does">
      {CARDS.map((card, index) => (
        <div key={card.title} className={`coin-rise ${card.offset}`} style={beat(index * 2 + 4)}>
          <article className="coin-float rounded-coin-lg bg-surface p-3 shadow-coin-float">
            <div className="h-44 rounded-coin bg-surface-soft p-4">{card.scene}</div>
            <div className="px-3 pb-4 pt-5">
              <h2 className="text-2xl font-[800] tracking-tight">{card.title}</h2>
              <p className="mt-1.5 text-[15px] font-medium leading-snug text-muted">{card.body}</p>
            </div>
          </article>
        </div>
      ))}
    </section>
  );
}

const MOCK_VALUES = [18, 20, 19, 23, 22, 21, 26, 30, 29, 34, 33, 39, 43, 41];
const MOCK_SCALE: Scale = { min: 14, max: 46, left: 0, right: 330, top: 6, bottom: 96 };
const MOCK_ACCOUNTS = [
  { name: "Everyday Chequing", value: "$2,840.12" },
  { name: "Personal Investing", value: "$87,286.75" },
  { name: "TFSA", value: "$97,548.40" },
];

/** The dashboard half of the mock: the net worth figure, its chart and a few accounts. */
function MockDashboard() {
  const points = plot(MOCK_VALUES, MOCK_SCALE);
  return (
    <div className="min-w-0 flex-1 p-5">
      <p className="text-[11px] font-bold text-subtle">Net worth</p>
      <p className="money text-3xl font-[800] tracking-tight">$349,400</p>
      <p className="money text-[11px] font-[800] text-gain">+19.4% past year</p>
      <svg viewBox="0 0 330 100" className="coin-wipe mt-3 block w-full overflow-visible" style={beat(6)}>
        <defs>
          <linearGradient id="mock-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(points, 100)} fill="url(#mock-fill)" />
        <path d={smoothPath(points)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <ul className="mt-4 space-y-2">
        {MOCK_ACCOUNTS.map((account) => (
          <li key={account.name} className="flex items-center justify-between rounded-coin-sm bg-surface-soft px-3 py-2 text-xs font-bold">
            <span>{account.name}</span>
            <span className="money">{account.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Coin half of the mock: a question, a short answer and a card waiting for approval. */
function MockCoinPanel() {
  return (
    <div className="w-[44%] shrink-0 space-y-3 border-l border-border bg-surface-soft/60 p-4">
      <p className="flex items-center gap-2 text-sm font-[800]">
        <Mascot size={20} />
        Coin
      </p>
      <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-surface-ink px-3 py-1.5 text-[11px] font-semibold text-on-ink">
        Move $2,000 to chequing
      </p>
      <p className="text-[11px] font-medium text-muted">Here&rsquo;s the card to approve.</p>
      <div className="rounded-coin-sm bg-surface p-3 shadow-coin">
        <p className="flex w-fit items-center gap-1 rounded-full bg-gain-soft px-2 py-0.5 text-[9px] font-[800] text-gain">
          <CheckIcon className="h-2.5 w-2.5" />
          Checks passed
        </p>
        <p className="mt-2 text-[11px] font-[800]">Move to Everyday Chequing</p>
        <p className="money text-xl font-[800] tracking-tight">$2,000.00</p>
        <span className="mt-2 block rounded-full bg-accent py-1.5 text-center text-[11px] font-[800] text-accent-ink">Approve</span>
      </div>
    </div>
  );
}

/** A browser window showing Coin, tilted back behind the pitch. Decorative. */
function WindowMock() {
  return (
    <div className="coin-rise pointer-events-none hidden select-none lg:block" style={beat(3)} aria-hidden="true">
      <div className="coin-tilt overflow-hidden rounded-coin-lg border border-border bg-surface shadow-coin-float">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="ml-3 rounded-full bg-surface-soft px-3 py-0.5 text-[10px] font-bold text-subtle">coin / app</span>
        </div>
        <div className="flex">
          <MockDashboard />
          <MockCoinPanel />
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="grid items-center gap-10 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr]">
      <div>
        <p className="coin-rise max-w-2xl text-lg font-semibold text-muted sm:text-xl">
          AI financial agents are surging, so I decided to explore building my own.
        </p>
        <h1
          className="coin-rise mt-3 text-[2.5rem] font-[800] leading-[1.05] tracking-[-0.035em] sm:text-5xl lg:text-[3.5rem]"
          style={beat(1)}
        >
          Meet Coin, an agent that lets you take charge of your finances.
        </h1>
        <div className="coin-rise mt-8 flex flex-wrap items-center gap-3" style={beat(2)}>
          <Link
            href="/app"
            className="rounded-full bg-accent px-7 py-3.5 text-base font-[800] text-accent-ink shadow-coin-accent transition-transform hover:-translate-y-0.5"
          >
            Try it live
          </Link>
          <Link
            href="/demo"
            className="rounded-full bg-surface px-7 py-3.5 text-base font-[800] text-foreground shadow-coin transition-transform hover:-translate-y-0.5"
          >
            Watch the scripted demo
          </Link>
        </div>
        <p className="coin-rise mt-5 text-sm font-semibold text-subtle" style={beat(3)}>
          Completely synthetic data.
        </p>
      </div>
      <WindowMock />
    </section>
  );
}

export default function Landing() {
  return (
    <main className="coin-canvas min-h-dvh overflow-x-clip text-foreground">
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-7 sm:px-8 lg:px-10">
        <header className="flex items-center gap-2.5">
          <Mascot size={32} />
          <span className="text-xl font-[800] tracking-tight">Coin</span>
        </header>
        <Hero />
        <FloatingCards />
      </div>
    </main>
  );
}
