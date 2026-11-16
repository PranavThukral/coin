"use client";

// Side panels that can be dragged wider or narrower by their edge, and
// collapse when dragged narrow enough. Used by the navigation on the left and
// Coin's panel on the right. Widths and choices are remembered between visits.
import { useEffect, useRef, useState } from "react";

const NUDGE = 24;

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the choice just won't persist.
  }
}

function recall(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** An on/off choice remembered between visits. Starts off; the saved value arrives after the page loads. */
export function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOn(recall(key) === "1"));
    return () => cancelAnimationFrame(frame);
  }, [key]);
  const set = (next: boolean) => {
    setOn(next);
    remember(key, next ? "1" : "0");
  };
  return [on, set];
}

interface Options {
  storageKey: string;
  initial: number;
  min: number;
  /** The widest allowed right now (it can depend on the window). */
  max: () => number;
  /** Which edge of the panel is dragged: a panel on the right is dragged by its left edge. */
  edge: "left" | "right";
  /** Dragged narrower than this, the panel collapses instead. */
  collapseBelow: number;
  onCollapse: () => void;
}

export type Grip = Pick<
  React.HTMLAttributes<HTMLDivElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onKeyDown"
>;

export function useResizable(options: Options): { width: number; grip: Grip } {
  const { storageKey, initial, min, max, edge, collapseBelow, onCollapse } = options;
  const [width, setWidth] = useState(initial);
  // While dragging: where the pointer went down and how wide the panel was then.
  const dragging = useRef<{ x: number; width: number } | null>(null);
  const clamp = (wanted: number) => Math.round(Math.min(Math.max(wanted, min), Math.max(min, max())));
  // Moving the pointer away from the panel's body makes it wider.
  const outward = edge === "left" ? -1 : 1;

  // Restore the saved width after the page loads (the server renders the default).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = Number(recall(storageKey));
      if (saved) setWidth(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  const grip: Grip = {
    onPointerDown(event) {
      // Without this the press starts a text selection, and the browser can
      // turn the drag into dragging that text, which cancels the resize.
      event.preventDefault();
      dragging.current = { x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      const from = dragging.current;
      if (!from) return;
      const wanted = from.width + (event.clientX - from.x) * outward;
      if (wanted < collapseBelow) {
        dragging.current = null;
        // Reopening brings the panel back at the width it had before this drag.
        setWidth(from.width);
        onCollapse();
        return;
      }
      setWidth(clamp(wanted));
    },
    onPointerUp() {
      if (!dragging.current) return;
      dragging.current = null;
      remember(storageKey, String(width));
    },
    onPointerCancel() {
      dragging.current = null;
    },
    onKeyDown(event) {
      if (event.key === "ArrowRight") setWidth((current) => clamp(current + NUDGE * outward));
      if (event.key === "ArrowLeft") setWidth((current) => clamp(current - NUDGE * outward));
    },
  };
  return { width, grip };
}

/** The strip along a panel's edge that is grabbed to resize it. `className` places it. */
export function ResizeGrip({ grip, label, hint, className }: {
  grip: Grip;
  label: string;
  hint: string;
  className: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={hint}
      tabIndex={0}
      {...grip}
      className={`group absolute z-20 hidden w-5 cursor-col-resize touch-none select-none place-items-center lg:grid ${className}`}
    >
      <span className="h-14 w-1 rounded-full bg-border-strong opacity-50 transition-all group-hover:h-20 group-hover:bg-accent group-hover:opacity-100 group-focus-visible:opacity-100" />
    </div>
  );
}
