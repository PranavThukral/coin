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
          Mostly rent and groceries. Dining is up <strong className="font-extrabold">18%</strong> on last month.
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
              <h3 className="font-display text-3xl tracking-tight">{card.title}</h3>
              <p className="mt-1.5 text-[15px] font-medium leading-snug text-muted">{card.body}</p>
            </div>
          </article>
        </div>
      ))}
    </section>
  );
}

const STATS = [
  { label: "Rule checks on every action", value: "9" },
  { label: "Requests in the test set", value: "40" },
  { label: "Unsafe actions executed", value: "0" },
  { label: "Automated tests", value: "463" },
];

/** What the tests measured, as a quiet strip of labelled figures. */
function Stats() {
  return (
    <dl className="coin-rise flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px] uppercase tracking-wider text-white/55" style={beat(4)}>
      {STATS.map((stat) => (
        <div key={stat.label} className="flex items-center gap-2.5">
          <dt>{stat.label}</dt>
          <dd className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Nav() {
  return (
    <header className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.07] py-2 pl-5 pr-2 backdrop-blur-md">
      <span className="flex items-center gap-2.5">
        <Mascot size={26} />
        <span className="font-display text-2xl tracking-tight text-white">Coin</span>
      </span>
      <nav className="flex items-center gap-1.5 text-sm font-bold">
        <Link href="/demo" className="rounded-full px-4 py-2 text-white/80 transition-colors hover:text-white">
          Scripted demo
        </Link>
        <Link href="/app" className="rounded-full bg-white px-4 py-2 text-[#0b1030] transition-transform hover:-translate-y-0.5">
          Try it live
        </Link>
      </nav>
    </header>
  );
}

/** The hero: a deep field of blue with one large coin, and the pitch set in a serif. */
function Hero() {
  return (
    <section className="coin-hero relative overflow-hidden text-white">
      <div className="pointer-events-none absolute -right-40 top-24 hidden opacity-95 md:block lg:-right-24" aria-hidden="true">
        <div className="coin-float">
          <Mascot size={620} />
        </div>
      </div>
      <div className="relative mx-auto flex min-h-[44rem] max-w-6xl flex-col px-5 pb-12 pt-5 sm:px-8 lg:px-10">
        <Nav />
        <div className="mt-auto max-w-3xl pt-24">
          <p className="coin-rise font-display text-xl italic text-white/75 sm:text-2xl">
            AI financial agents are surging, so I decided to explore building my own.
          </p>
          <h1 className="coin-rise mt-4 font-display text-[2.9rem] leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-7xl" style={beat(1)}>
            Meet Coin, an agent that lets you take charge of your finances.
          </h1>
          <div className="coin-rise mt-9 flex flex-wrap items-center gap-3" style={beat(2)}>
            <Link href="/app" className="rounded-full bg-white px-7 py-3.5 text-base font-bold text-[#0b1030] transition-transform hover:-translate-y-0.5">
              Try it live
            </Link>
            <Link href="/demo" className="rounded-full border border-white/40 px-7 py-3.5 text-base font-bold text-white transition-colors hover:bg-white/10">
              Watch the scripted demo
            </Link>
          </div>
          <p className="coin-rise mt-5 text-sm font-medium text-white/55" style={beat(3)}>
            Completely synthetic data.
          </p>
        </div>
        <div className="mt-14 border-t border-white/10 pt-6">
          <Stats />
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <main className="min-h-dvh overflow-x-clip text-foreground">
      <Hero />
      <div className="coin-canvas">
        <div className="mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8 lg:px-10">
          <h2 className="max-w-3xl font-display text-4xl leading-[1.08] tracking-[-0.015em] sm:text-5xl">
            Ask, see, approve. <span className="text-subtle">The model proposes; code decides what can execute.</span>
          </h2>
          <div className="mt-12">
            <FloatingCards />
          </div>
        </div>
      </div>
    </main>
  );
}
