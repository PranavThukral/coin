import { describe, expect, it } from "vitest";
import { changeTo, isNetWorthRange, mergePoints, pointAt, positionOf, resample, seriesStarts } from "./net-worth";

const points = [
  { date: "2026-11-01", cents: 1_000 },
  { date: "2026-11-11", cents: 2_000 },
  { date: "2026-11-21", cents: 1_500 },
];

describe("net worth ranges", () => {
  it("accepts only the five ranges", () => {
    expect(isNetWorthRange("1M")).toBe(true);
    expect(isNetWorthRange("ALL")).toBe(true);
    expect(isNetWorthRange("2W")).toBe(false);
    expect(isNetWorthRange(null)).toBe(false);
  });

  it("shifts the 30-day comb by one stride per request", () => {
    const starts = seriesStarts("1Y", "2026-11-14");
    expect(starts).toEqual(["2025-11-14", "2025-11-24", "2025-12-04"]);
    expect(seriesStarts("1M", "2026-11-14")).toHaveLength(15);
    expect(seriesStarts("ALL", "2026-11-14")[0]).toBe("2024-11-14");
  });

  it("merges requests into one point per date, oldest first", () => {
    const merged = mergePoints([
      [points[2], points[0]],
      [points[1], { date: "2026-11-21", cents: 1_500 }],
    ]);
    expect(merged).toEqual(points);
  });
});

describe("net worth maths", () => {
  it("resamples evenly in time and keeps both ends", () => {
    const values = resample(points, 5);
    expect(values).toEqual([1_000, 1_500, 2_000, 1_750, 1_500]);
  });

  it("resamples a single point to a flat line and nothing to nothing", () => {
    expect(resample([points[0]], 3)).toEqual([1_000, 1_000, 1_000]);
    expect(resample([], 3)).toEqual([]);
  });

  it("finds the nearest real point to a position, and its position back", () => {
    expect(pointAt(points, 0)).toBe(0);
    expect(pointAt(points, 0.45)).toBe(1);
    expect(pointAt(points, 2)).toBe(2);
    expect(positionOf(points, 1)).toBe(0.5);
    expect(positionOf([points[0]], 0)).toBe(1);
  });

  it("measures change from the start of the range", () => {
    expect(changeTo(points, 2)).toEqual({ cents: 500, ratio: 0.5 });
    expect(changeTo(points, 0)).toEqual({ cents: 0, ratio: 0 });
    expect(changeTo([{ date: "2026-11-01", cents: 0 }], 0).ratio).toBeNull();
    expect(changeTo([], 0)).toEqual({ cents: 0, ratio: null });
  });
});
