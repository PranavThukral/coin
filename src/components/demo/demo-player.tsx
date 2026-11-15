"use client";

// Drives the scripted demo: opens accounts, asks the demo's questions, and
// clicks the card buttons a viewer would, with a caption saying what each
// step proves. Everything it triggers runs through the real rules.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountId } from "../../contracts";
import { DEMO_STEPS, type CardStep, type DemoStep } from "../../demo/script";
import { latestCard } from "../coin/use-coin-chat";
import type { CoinConversation } from "../coin/sidebar";

const READ_MS = 4_500;
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
  const [autoplay, setAutoplay] = useState(false);
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

export function DemoPlayer(props: Props) {
  const { index, running, autoplay, setAutoplay, next } = usePlayback(props);
  const step = DEMO_STEPS[index];
  const finished = index >= DEMO_STEPS.length - 1 && !running;
  const button = "rounded-full px-4 py-2 text-sm font-extrabold disabled:opacity-40";

  return (
    <section
      aria-label="Scripted demo"
      className="fixed bottom-6 left-6 z-30 w-[min(28rem,calc(100vw-3rem))] rounded-coin-lg bg-surface-ink p-5 text-on-ink shadow-coin ring-1 ring-gold/25"
    >
      <p className="text-xs font-bold text-on-ink-muted">
        Step {index + 1} of {DEMO_STEPS.length}
        {running && " · running"}
      </p>
      <h2 className="mt-1 text-lg font-extrabold leading-snug">{step.title}</h2>
      <p className="mt-1 text-sm font-medium text-on-ink-muted" aria-live="polite">
        {step.proves}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!finished && (
          <button type="button" className={`${button} bg-accent text-accent-ink`} disabled={running} onClick={next}>
            Next step
          </button>
        )}
        {!finished && (
          <button
            type="button"
            className={`${button} border border-white/25`}
            onClick={() => setAutoplay(!autoplay)}
          >
            {autoplay ? "Pause" : "Play all"}
          </button>
        )}
        <button type="button" className={`${button} border border-white/25`} disabled={running} onClick={restart}>
          Restart
        </button>
        {finished && (
          <a href="/app" className={`${button} bg-accent text-accent-ink`}>
            Try it live
          </a>
        )}
      </div>
    </section>
  );
}
