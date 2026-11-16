"use client";

// The centrepiece: one large net worth figure over one large chart.
// Pick a range and the line morphs to it; drag across the chart and the
// figure, the change and the date follow the pointer. After an action
// executes the parent bumps `refreshKey` and everything glides to the new values.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { areaPath, plot, smoothPath, yOf, type Scale } from "../../lib/chart-path";
import { longDate, shortDate, signedMoney } from "../../lib/format";
import {
  changeTo,
  NET_WORTH_RANGES,
  pointAt,
  positionOf,
  resample,
  type Change,
  type NetWorthPoint,
  type NetWorthRange,
  type NetWorthSeries,
} from "../../lib/net-worth";
import { AnimatedMoney, useTweenedList } from "../ui/motion";

const SAMPLES = 72;
const NO_POINTS: NetWorthPoint[] = [];
const INSET = { x: 8, top: 18, bottom: 18 };

const RANGE_LABEL: Record<NetWorthRange, string> = {
  "1M": "Past month",
  "3M": "Past 3 months",
  "6M": "Past 6 months",
  "1Y": "Past year",
  ALL: "Past 2 years",
};

function useNetWorthSeries(range: NetWorthRange, refreshKey: number): NetWorthSeries | null {
  const [series, setSeries] = useState<NetWorthSeries | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .netWorth(range)
      .then((loaded) => !cancelled && setSeries(loaded))
      .catch(() => undefined); // Keep showing the last series; the figure still comes from the accounts.
    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);
  return series;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function scaleFor(values: number[], width: number, height: number): Scale {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const room = (high - low) * 0.08 || 1;
  return {
    min: low - room,
    max: high + room,
    left: INSET.x,
    right: Math.max(INSET.x + 1, width - INSET.x),
    top: INSET.top,
    bottom: height - INSET.bottom,
  };
}

function ChangeLine({ change, label }: { change: Change; label: string }) {
  const up = change.cents >= 0;
  const percent = change.ratio === null ? null : `${(Math.abs(change.ratio) * 100).toFixed(2)}%`;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-extrabold">
      <span className={`money flex items-center gap-1.5 ${up ? "text-gain" : "text-loss"}`}>
        <svg viewBox="0 0 10 8" className={`h-2.5 w-2.5 ${up ? "" : "rotate-180"}`} aria-hidden="true">
          <path d="M5 0l5 8H0z" fill="currentColor" />
        </svg>
        {signedMoney(Math.abs(change.cents))}
        {percent && <span>({percent})</span>}
      </span>
      <span className="font-semibold text-subtle">{label}</span>
    </p>
  );
}

function RangeTabs({ range, onPick }: { range: NetWorthRange; onPick: (range: NetWorthRange) => void }) {
  return (
    <div className="flex gap-1" role="tablist" aria-label="Chart range">
      {NET_WORTH_RANGES.map((option) => {
        const active = option === range;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onPick(option)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-extrabold transition-colors duration-300 ${
              active ? "bg-accent-soft text-accent-text" : "text-subtle hover:text-foreground"
            }`}
          >
            {option === "ALL" ? "All" : option}
          </button>
        );
      })}
    </div>
  );
}

/** The line, its soft fill and the dashed line at the range's starting value. */
function Plot({ values, scale, width, height, splitAt }: {
  values: number[];
  scale: Scale;
  width: number;
  height: number;
  /** While scrubbing: x where the line turns quiet. */
  splitAt: number | null;
}) {
  const id = useId();
  const points = plot(values, scale);
  const line = smoothPath(points);
  const startY = yOf(values[0], scale);
  const lit = splitAt ?? width;
  return (
    <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.2" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-lit`}>
          <rect x="0" y="-20" width={lit} height={height + 40} />
        </clipPath>
        <clipPath id={`${id}-quiet`}>
          <rect x={lit} y="-20" width={Math.max(0, width - lit)} height={height + 40} />
        </clipPath>
      </defs>
      <line x1={scale.left} x2={scale.right} y1={startY} y2={startY} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 6" strokeLinecap="round" />
      <path d={areaPath(points, height)} fill={`url(#${id}-fill)`} clipPath={`url(#${id}-lit)`} />
      <path d={line} fill="none" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" clipPath={`url(#${id}-quiet)`} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${id}-lit)`} />
    </svg>
  );
}

function Marker({ x, y, live }: { x: number; y: number; live: boolean }) {
  return (
    <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
      {live && <span className="coin-pulse absolute inset-0 rounded-full bg-accent" />}
      <span className="absolute inset-0 rounded-full bg-accent ring-[3px] ring-surface" />
    </span>
  );
}

function HeroChart({ points, height, scrub, onScrub }: {
  points: NetWorthPoint[];
  height: number;
  scrub: number | null;
  onScrub: (index: number | null) => void;
}) {
  const [ref, width] = useWidth();
  const target = useMemo(() => resample(points, SAMPLES), [points]);
  const values = useTweenedList(target);
  const ready = width > 0 && values.length > 0;
  const scale = ready ? scaleFor(values, width, height) : null;

  const follow = (event: React.PointerEvent) => {
    if (!scale) return;
    const box = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - box.left - scale.left) / (scale.right - scale.left);
    onScrub(pointAt(points, position));
  };
  const scrubX = scale && scrub !== null ? scale.left + (scale.right - scale.left) * positionOf(points, scrub) : null;

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair touch-pan-y select-none"
      style={{ height }}
      onPointerDown={follow}
      onPointerMove={follow}
      onPointerLeave={() => onScrub(null)}
      onPointerCancel={() => onScrub(null)}
    >
      {scale && (
        <>
          <div className="coin-wipe">
            <Plot values={values} scale={scale} width={width} height={height} splitAt={scrubX} />
          </div>
          {scrubX !== null && scrub !== null && (
            <>
              <span className="pointer-events-none absolute inset-y-0 w-px bg-border-strong" style={{ left: scrubX }} />
              <Marker x={scrubX} y={yOf(points[scrub].cents, scale)} live={false} />
            </>
          )}
          {scrubX === null && (
            <span className="coin-fade" style={{ "--i": 16 } as React.CSSProperties}>
              <Marker x={scale.right} y={yOf(values[values.length - 1], scale)} live />
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function NetWorthHero({ netWorthCents, refreshKey, children }: {
  /** The exact figure from the accounts; the chart's last point agrees with it. */
  netWorthCents: number;
  refreshKey: number;
  /** A quiet row under the chart (cash, investments, card). */
  children?: React.ReactNode;
}) {
  const [range, setRange] = useState<NetWorthRange>("1Y");
  const [scrub, setScrub] = useState<number | null>(null);
  const series = useNetWorthSeries(range, refreshKey);
  const points = series?.points ?? NO_POINTS;
  const at = scrub !== null && scrub < points.length ? scrub : null;

  const shownCents = at !== null ? points[at].cents : netWorthCents;
  const change = changeTo(points, at ?? Math.max(0, points.length - 1));
  const label = at !== null ? longDate(points[at].date) : RANGE_LABEL[series?.range ?? range];
  const pickRange = (next: NetWorthRange) => {
    setScrub(null);
    setRange(next);
  };

  return (
    <section className="coin-rise rounded-coin-lg bg-surface shadow-coin" aria-label="Net worth">
      <div className="px-6 pt-7 sm:px-9 sm:pt-9">
        <p className="text-sm font-bold text-subtle">Net worth</p>
        <p className="mt-1 text-[2.75rem] font-extrabold leading-none tracking-[-0.035em] sm:text-6xl lg:text-7xl">
          <AnimatedMoney cents={shownCents} split instant={at !== null} />
        </p>
        <ChangeLine change={change} label={label} />
      </div>
      <div className="mt-4 px-2 sm:px-4">
        <HeroChart points={points} height={260} scrub={at} onScrub={setScrub} />
      </div>
      {points.length > 1 && (
        <p className="money flex justify-between px-6 text-[11px] font-medium text-subtle sm:px-9" aria-hidden="true">
          <span>{shortDate(points[0].date)}</span>
          <span>{shortDate(points[Math.floor(points.length / 2)].date)}</span>
          <span>Today</span>
        </p>
      )}
      <div className="px-4 pb-5 pt-3 sm:px-7">
        <RangeTabs range={range} onPick={pickRange} />
      </div>
      {children && <div className="border-t border-border px-6 py-5 sm:px-9">{children}</div>}
    </section>
  );
}
