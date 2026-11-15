"use client";

// Drives the scripted demo: opens accounts, asks the demo's questions, and
// clicks the card buttons a viewer would, with a caption saying what each
// step proves. Everything it triggers runs through the real rules.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountId } from "../../contracts";
import { DEMO_STEPS, type CardStep, type DemoStep } from "../../demo/script";
import { latestCard } from "../coin/use-coin-chat";
import type { CoinConversation } from "../coin/sidebar";

const READ_MS = 10_000;
const BEFORE_CLICK_MS = 1_600;
const SHOW_UNDO_MS = 3_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Props {
  coin: CoinConversation;
  viewing: AccountId | null;
  setViewing: (account: AccountId | null) => void;
}

async function clickCard(coin: CoinConversation, action: CardStep): Promise<void> {
  const card = latestCard(coin.getChat());
  if (!card) return;
  if (action === "approve") {
    await coin.controls.approve(card);
    // Let the viewer see the undo ring start before skipping the wait.
    await pause(SHOW_UNDO_MS);
  } else if (action === "execute_now") {
    await coin.controls.executeNow(card);
  } else {
    await coin.controls.useInstead(card);
  }
}

function usePlayback({ coin, viewing, setViewing }: Props) {
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  // The demo moves on by itself; Pause hands the pace to the viewer.
  const [autoplay, setAutoplay] = useState(true);
  const viewingRef = useRef(viewing);
  useEffect(() => {
    viewingRef.current = viewing;
  }, [viewing]);

  const run = useCallback(
    async (step: DemoStep) => {
      setRunning(true);
      if (step.openAccount !== undefined) {
        setViewing(step.openAccount);
        viewingRef.current = step.openAccount;
        await pause(900);
      }
      if (step.prompt) await coin.send(step.prompt, viewingRef.current);
      for (const action of step.cardSteps ?? []) {
        await pause(BEFORE_CLICK_MS);
        await clickCard(coin, action);
      }
      setRunning(false);
    },
    [coin, setViewing],
  );

  const next = useCallback(async () => {
    if (running || index >= DEMO_STEPS.length - 1) return;
    const target = index + 1;
    setIndex(target);
    await run(DEMO_STEPS[target]);
  }, [index, run, running]);

  // `/demo?play=1` starts playing on its own (handy for recording the video).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (new URLSearchParams(window.location.search).get("play") === "1") setAutoplay(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Play all: after each step, give the viewer time to read, then continue.
  useEffect(() => {
    if (!autoplay || running) return;
    if (index >= DEMO_STEPS.length - 1) {
      const stop = setTimeout(() => setAutoplay(false), 0);
      return () => clearTimeout(stop);
    }
    const timer = setTimeout(next, READ_MS);
    return () => clearTimeout(timer);
  }, [autoplay, running, index, next]);

  return { index, running, autoplay, setAutoplay, next };
}

async function restart(): Promise<void> {
  await fetch("/api/demo/reset", { method: "POST" }).catch(() => undefined);
  window.location.reload();
}

/** One segment per step; finished steps are filled, the running one pulses. */
function Progress({ index, running }: { index: number; running: boolean }) {
  return (
    <ol className="flex gap-1" aria-label={`Step ${index + 1} of ${DEMO_STEPS.length}`}>
      {DEMO_STEPS.map((step, i) => {
        const tone = i <= index ? "bg-accent" : "bg-border";
        const pulsing = running && i === index ? "animate-pulse" : "";
        return <li key={step.id} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${tone} ${pulsing}`} />;
      })}
    </ol>
  );
}

const BUTTON = "rounded-full px-4 py-2 text-sm font-extrabold transition-transform active:scale-[0.97] disabled:opacity-40";
const PRIMARY = `${BUTTON} bg-accent text-accent-ink shadow-coin-accent`;
const SECONDARY = `${BUTTON} bg-border/70 text-foreground hover:bg-border`;

export function DemoPlayer(props: Props) {
  const { index, running, autoplay, setAutoplay, next } = usePlayback(props);
  const step = DEMO_STEPS[index];
  const finished = index >= DEMO_STEPS.length - 1 && !running;

  return (
    <section
      aria-label="Scripted demo"
      className="coin-rise fixed inset-x-0 bottom-0 z-50 h-52 overflow-y-auto rounded-t-coin-lg bg-surface-raised p-5 shadow-coin-float lg:static lg:z-auto lg:mx-10 lg:mb-3 lg:h-auto lg:shrink-0 lg:overflow-visible lg:rounded-coin-lg lg:px-7"
    >
      <Progress index={index} running={running} />
      <div className="mt-4 lg:flex lg:items-center lg:justify-between lg:gap-8">
        {/* Keyed by step, so each new caption rises in. */}
        <div key={step.id} className="coin-rise min-w-0">
          <h2 className="text-lg font-extrabold leading-snug tracking-tight">{step.title}</h2>
          <p className="mt-1 text-sm font-medium leading-snug text-muted" aria-live="polite">
            {step.proves}
          </p>
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap gap-2 lg:mt-0">
          {!finished && (
            <button type="button" className={`relative overflow-hidden ${PRIMARY}`} disabled={running} onClick={next}>
              {autoplay && !running && (
                <span
                  key={index}
                  aria-hidden="true"
                  className="coin-countdown absolute inset-0 bg-black/30"
                  style={{ animationDuration: `${READ_MS}ms` }}
                />
              )}
              <span className="relative">Next step</span>
            </button>
          )}
          {!finished && (
            <button type="button" className={SECONDARY} onClick={() => setAutoplay(!autoplay)}>
              {autoplay ? "Pause" : "Auto-play"}
            </button>
          )}
          <button type="button" className={SECONDARY} disabled={running} onClick={restart}>
            Restart
          </button>
          {finished && (
            <a href="/app" className={PRIMARY}>
              Try it live
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
