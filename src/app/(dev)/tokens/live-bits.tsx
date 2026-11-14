"use client";

import { useEffect, useState } from "react";

const WINDOW_SECONDS = 60;
const RADIUS = 24;
const RING_LENGTH = 2 * Math.PI * RADIUS;

/** The undo ring: drains over the real 60 seconds, with a live label. */
export function UndoRing() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.min(WINDOW_SECONDS, Math.floor((now - startedAt) / 1000));
  const secondsLeft = WINDOW_SECONDS - elapsed;

  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center" aria-live="polite">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="var(--pending-soft)" strokeWidth="4" />
        <circle
          className="coin-undo-ring"
          cx="28"
          cy="28"
          r={RADIUS}
          fill="none"
          stroke="var(--pending)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          style={{ ["--ring-length" as string]: `${RING_LENGTH}` }}
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
