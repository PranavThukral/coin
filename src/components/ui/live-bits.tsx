"use client";

import { useEffect, useRef, useState } from "react";

const WINDOW_SECONDS = 60;
const RADIUS = 24;
const RING_LENGTH = 2 * Math.PI * RADIUS;

/** Clamped to the window, so a skewed client clock can never show more than 60s. */
function secondsUntil(executeAt: number, now: number): number {
  const seconds = Math.ceil((executeAt - now) / 1000);
  return Math.min(WINDOW_SECONDS, Math.max(0, seconds));
}

/**
 * The undo ring. With `executeAt` (ISO time from the server) it counts down to
 * that moment and calls `onElapsed` once at zero; without it, it runs a fresh
 * 60 seconds (the design preview).
 */
export function UndoRing({ executeAt, onElapsed }: { executeAt?: string | null; onElapsed?: () => void }) {
  const [target] = useState(() => (executeAt ? Date.parse(executeAt) : Date.now() + WINDOW_SECONDS * 1000));
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = secondsUntil(target, now);

  useEffect(() => {
    if (secondsLeft === 0 && !fired.current) {
      fired.current = true;
      onElapsed?.();
    }
  }, [secondsLeft, onElapsed]);

  const drained = 1 - secondsLeft / WINDOW_SECONDS;

  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center" aria-live="polite">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="var(--pending-soft)" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={RADIUS}
          fill="none"
          stroke="var(--pending)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * drained}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="money text-sm font-extrabold text-pending">{secondsLeft}s</span>
      <span className="sr-only">{secondsLeft} seconds left to undo</span>
    </div>
  );
}

/** Remounts its children so their one-time animations play again. */
export function Replay({ children, label = "Replay" }: { children: React.ReactNode; label?: string }) {
  const [round, setRound] = useState(0);
  return (
    <div>
      <div key={round}>{children}</div>
      <button
        type="button"
        onClick={() => setRound((r) => r + 1)}
        className="mt-3 rounded-full border border-border-strong px-3 py-1 text-xs font-bold text-muted hover:text-foreground"
      >
        {label}
      </button>
    </div>
  );
}
