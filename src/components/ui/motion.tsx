"use client";

// Numbers that move. When a balance changes (an action executed, a range was
// picked) the figure counts to its new value instead of jumping.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { signedMoney } from "../../lib/format";

const easeOut = (t: number) => 1 - (1 - t) ** 3;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function reducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function watchReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the visitor asked their device for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(watchReducedMotion, reducedMotion, () => false);
}

/**
 * Runs `paint(progress)` on every frame from 0 to 1 over `ms`, eased.
 * Returns a function that stops it.
 */
function animate(ms: number, paint: (progress: number) => void): () => void {
  const duration = reducedMotion() ? 0 : ms;
  const startedAt = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const t = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    paint(easeOut(t));
    if (t < 1) frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}

/** A number that glides to each new target. The first value shows at once. */
export function useTween(target: number, ms = 700): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    return animate(ms, (progress) => {
      current.current = from + (target - from) * progress;
      setShown(current.current);
    });
  }, [target, ms]);

  return shown;
}

/** A list of numbers (same length each time) that glides to each new target. */
export function useTweenedList(target: number[], ms = 650): number[] {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from.length !== target.length) {
      current.current = target;
      const frame = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(frame);
    }
    return animate(ms, (progress) => {
      current.current = target.map((value, i) => from[i] + (value - from[i]) * progress);
      setShown(current.current);
    });
  }, [target, ms]);

  return shown;
}

/** True for a moment after `value` changes (not on first render). Drives the row flash. */
export function useChanged(value: number, ms = 1_600): boolean {
  const [changed, setChanged] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const frame = requestAnimationFrame(() => setChanged(true));
    const timer = setTimeout(() => setChanged(false), ms);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [value, ms]);

  return changed;
}

/** Money that counts to its new value. Cents are set smaller when `split`. */
export function AnimatedMoney({
  cents,
  split = false,
  instant = false,
  className,
}: {
  cents: number;
  split?: boolean;
  /** Skip the count (scrubbing a chart should track the pointer exactly). */
  instant?: boolean;
  className?: string;
}) {
  const tweened = useTween(cents);
  const text = signedMoney(Math.round(instant ? cents : tweened));
  if (!split) return <span className={`money ${className ?? ""}`}>{text}</span>;

  const [dollars, fraction] = text.split(".");
  return (
    <span className={`money ${className ?? ""}`}>
      {dollars}
      <span className="text-[0.5em] font-bold text-subtle">.{fraction}</span>
    </span>
  );
}
