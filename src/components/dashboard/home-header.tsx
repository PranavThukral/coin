"use client";

// The top of Home: a greeting, today's date, and the things people come to do.
// Each quick action hands Coin a ready-to-edit request; nothing happens until
// the request is sent and its card is approved.
import { useEffect, useState } from "react";
import { longDate } from "../../lib/format";
import { ActivityGlyph, BillGlyph, TrendGlyph } from "../ui/icons";
import { SendIcon } from "../ui/icons";

const ACTIONS = [
  { label: "Move money", request: "Move $500 from savings to chequing", glyph: <ActivityGlyph /> },
  { label: "Pay a bill", request: "Pay my hydro bill", glyph: <BillGlyph /> },
  { label: "Send money", request: "Send $50 to Sam", glyph: <SendIcon className="h-[18px] w-[18px]" /> },
  { label: "Trade", request: "Buy 5 shares of Northwind Robotics in my TFSA", glyph: <TrendGlyph /> },
];

function timeOfDay(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The greeting follows the visitor's clock, so it is filled in after the page loads. */
function useGreeting(): string {
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGreeting(timeOfDay(new Date().getHours())));
    return () => cancelAnimationFrame(frame);
  }, []);
  return greeting;
}

export function HomeHeader({ today, onCompose }: {
  today: string;
  /** Puts a request in Coin's message box, ready to edit and send. Absent in the scripted demo. */
  onCompose?: (request: string) => void;
}) {
  const greeting = useGreeting();
  return (
    <header className="coin-rise">
      <p className="text-sm font-medium text-subtle">{longDate(today)}</p>
      <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2rem]">
        {greeting}
      </h1>
      {onCompose && (
        <div className="mt-5 flex flex-wrap gap-2">
          {ACTIONS.map((action, index) => (
            <button
              key={action.label}
              type="button"
              onClick={() => onCompose(action.request)}
              className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-bold transition-transform active:scale-[0.97] ${
                index === 0
                  ? "bg-accent text-accent-ink shadow-coin-accent hover:bg-accent-strong"
                  : "bg-surface text-foreground shadow-coin hover:bg-surface-soft"
              }`}
            >
              <span className={index === 0 ? "" : "text-subtle"}>{action.glyph}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
