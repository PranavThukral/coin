"use client";

// The pointer that plays the scripted demo. It glides to a real element on
// the page (marked with a data-demo attribute) and clicks it, so the demo
// drives the same buttons a visitor would.
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const MOVE_MS = 800;
const SETTLE_MS = 380;
const PRESS_MS = 220;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Point {
  x: number;
  y: number;
}

export interface DemoCursor {
  /** Glide to the element and click it. False when it isn't on screen (a phone hides the navigation). */
  click(name: string): Promise<boolean>;
  /** Glide to the element without clicking. */
  moveTo(name: string): Promise<boolean>;
}

/** The last visible element carrying this data-demo name: the newest card's button, not an earlier one's. */
function find(name: string): HTMLElement | null {
  const marked = [...document.querySelectorAll<HTMLElement>(`[data-demo="${name}"]`)];
  return marked.filter((element) => element.getClientRects().length > 0).at(-1) ?? null;
}

/** Drawn on the page itself, so it is placed against the window whatever it is rendered inside. */
function Pointer({ point, press }: { point: Point | null; press: number }) {
  if (!point) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[70]"
      style={{
        transform: `translate(${point.x}px, ${point.y}px)`,
        transition: `transform ${MOVE_MS}ms cubic-bezier(0.3, 0, 0.15, 1)`,
      }}
    >
      {/* Keyed by press, so each click starts a fresh ripple. */}
      {press > 0 && <span key={press} className="coin-click absolute -left-4 -top-4 h-8 w-8 rounded-full bg-accent" />}
      <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]">
        <path d="M4 2.5l15.5 8.6-6.8 1.7-1.9 6.9z" fill="#0c0e13" stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>,
    document.body,
  );
}

export function useDemoCursor(): { cursor: DemoCursor; pointer: React.ReactNode } {
  const [point, setPoint] = useState<Point | null>(null);
  const [press, setPress] = useState(0);

  const moveToElement = useCallback(async (name: string): Promise<HTMLElement | null> => {
    const element = find(name);
    if (!element) return null;
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    await pause(SETTLE_MS);
    const box = element.getBoundingClientRect();
    setPoint({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    await pause(MOVE_MS);
    return element;
  }, []);

  const cursor = useMemo<DemoCursor>(
    () => ({
      moveTo: async (name) => (await moveToElement(name)) !== null,
      click: async (name) => {
        const element = await moveToElement(name);
        if (!element) return false;
        setPress((count) => count + 1);
        await pause(PRESS_MS);
        element.click();
        return true;
      },
    }),
    [moveToElement],
  );

  return { cursor, pointer: <Pointer point={point} press={press} /> };
}
