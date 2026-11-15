// The net worth chart's ranges, and the pure maths behind the hero chart:
// which dates to ask the server for, how to merge what comes back, and how to
// resample a series so two ranges can morph into each other point by point.
import { addDays } from "../contracts";

export const NET_WORTH_RANGES = ["1M", "3M", "6M", "1Y", "ALL"] as const;
export type NetWorthRange = (typeof NET_WORTH_RANGES)[number];

export interface NetWorthPoint {
  date: string;
  cents: number;
}

export interface NetWorthSeries {
  range: NetWorthRange;
  points: NetWorthPoint[];
}

const RANGE_DAYS: Record<NetWorthRange, number> = { "1M": 30, "3M": 91, "6M": 182, "1Y": 365, ALL: 730 };

/** Days between neighbouring points. Shorter ranges get a finer line. */
const STRIDE_DAYS: Record<NetWorthRange, number> = { "1M": 2, "3M": 3, "6M": 6, "1Y": 10, ALL: 15 };

/** The chart builder returns one point every 30 days from its start date. */
const SERVER_STEP_DAYS = 30;

export function isNetWorthRange(value: string | null): value is NetWorthRange {
  return NET_WORTH_RANGES.includes(value as NetWorthRange);
}

/**
 * Start dates to request so the merged result has a point every stride:
 * each request is the same 30-day comb, shifted by one stride.
 */
export function seriesStarts(range: NetWorthRange, today: string): string[] {
  const first = addDays(today, -RANGE_DAYS[range]);
  const starts: string[] = [];
  for (let offset = 0; offset < SERVER_STEP_DAYS; offset += STRIDE_DAYS[range]) {
    starts.push(addDays(first, offset));
  }
  return starts;
}

/** One point per date, oldest first. */
export function mergePoints(lists: NetWorthPoint[][]): NetWorthPoint[] {
  const byDate = new Map<string, number>();
  for (const list of lists) {
    for (const point of list) byDate.set(point.date, point.cents);
  }
  const merged = [...byDate].map(([date, cents]) => ({ date, cents }));
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * The series as `count` evenly spaced values (linear between real points).
 * Every range resampled to the same count can tween into any other.
 */
export function resample(points: NetWorthPoint[], count: number): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => points[0].cents);
  const days = points.map((point) => dayNumber(point.date));
  const span = days[days.length - 1] - days[0];
  const values: number[] = [];
  let segment = 0;
  for (let i = 0; i < count; i += 1) {
    const day = days[0] + (span * i) / (count - 1);
    while (segment < days.length - 2 && days[segment + 1] < day) segment += 1;
    const width = days[segment + 1] - days[segment];
    const share = width === 0 ? 0 : (day - days[segment]) / width;
    values.push(points[segment].cents + (points[segment + 1].cents - points[segment].cents) * share);
  }
  return values;
}

/** Where a real point sits along the chart (0 = oldest, 1 = newest). */
export function positionOf(points: NetWorthPoint[], index: number): number {
  if (points.length < 2) return 1;
  const first = dayNumber(points[0].date);
  const last = dayNumber(points[points.length - 1].date);
  return last === first ? 1 : (dayNumber(points[index].date) - first) / (last - first);
}

/** The real point nearest to a position along the chart (0 = oldest, 1 = newest). */
export function pointAt(points: NetWorthPoint[], position: number): number {
  const target = Math.min(1, Math.max(0, position));
  let nearest = 0;
  for (let i = 1; i < points.length; i += 1) {
    const closer = Math.abs(positionOf(points, i) - target) < Math.abs(positionOf(points, nearest) - target);
    if (closer) nearest = i;
  }
  return nearest;
}

export interface Change {
  cents: number;
  /** Share of the starting value, or null when it started at zero. */
  ratio: number | null;
}

/** Change from the first point to the point at `index`. */
export function changeTo(points: NetWorthPoint[], index: number): Change {
  if (points.length === 0) return { cents: 0, ratio: null };
  const start = points[0].cents;
  const cents = points[index].cents - start;
  return { cents, ratio: start === 0 ? null : cents / Math.abs(start) };
}
