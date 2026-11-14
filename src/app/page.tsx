import Link from "next/link";
import { Mascot } from "../components/coin/mascot";

const PROMISES = [
  {
    title: "Answers from your numbers",
    body: "Every figure and chart is computed from your accounts in code. Coin never types a number it didn't look up.",
  },
  {
    title: "Nine checks before any card",
    body: "Coin can only propose. Code checks your words, your balances and your limits before you ever see Approve.",
  },
  {
    title: "A minute to change your mind",
    body: "Approved actions wait 60 seconds with Undo, and every rule is checked again before money moves.",
  },
];

export default function Landing() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-10 md:px-10">
        <header className="flex items-center gap-2.5">
          <Mascot size={30} />
          <span className="text-xl font-extrabold tracking-tight">Coin</span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16">
          <Mascot size={96} />
          <h1 className="mt-8 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Ask about all your money. Approve what moves it.
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-medium text-muted">
            Coin reads every account, answers in plain words with charts, and proposes transfers, bill
            payments, e-transfers and trades. Code, not the model, decides what can execute.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/demo" className="rounded-full bg-accent px-6 py-3 text-base font-extrabold text-accent-ink">
              Watch the two-minute demo
            </Link>
            <Link
              href="/app"
              className="rounded-full border-2 border-border-strong px-6 py-3 text-base font-extrabold text-foreground hover:border-accent"
            >
              Try it live
            </Link>
          </div>
          <p className="mt-4 text-sm font-semibold text-subtle">
            Made-up data. Every action is simulated. Not financial advice.
          </p>
        </section>

        <section className="grid gap-4 border-t-2 border-border pt-10 md:grid-cols-3">
          {PROMISES.map((promise) => (
            <div key={promise.title}>
              <h2 className="text-lg font-extrabold">{promise.title}</h2>
              <p className="mt-2 text-sm font-medium text-muted">{promise.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
