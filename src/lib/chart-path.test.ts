import { describe, expect, it } from "vitest";
import { areaPath, plot, smoothPath, yOf, type Scale } from "./chart-path";

const scale: Scale = { min: 0, max: 100, left: 10, right: 110, top: 0, bottom: 50 };

describe("chart geometry", () => {
  it("places values into the box, high values at the top", () => {
    expect(plot([0, 50, 100], scale)).toEqual([
      { x: 10, y: 50 },
      { x: 60, y: 25 },
      { x: 110, y: 0 },
    ]);
  });

  it("draws a flat series through the middle", () => {
    expect(yOf(7, { ...scale, min: 7, max: 7 })).toBe(25);
  });

  it("starts at the first point and ends at the last", () => {
    const path = smoothPath(plot([0, 50, 100], scale));
    expect(path.startsWith("M10 50")).toBe(true);
    expect(path.endsWith("110 0")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(2);
  });

  it("closes the area down to the baseline", () => {
    const path = areaPath(plot([0, 100], scale), 50);
    expect(path.endsWith("L110 50 L10 50 Z")).toBe(true);
  });

  it("returns nothing for an empty series", () => {
    expect(smoothPath([])).toBe("");
    expect(areaPath([], 50)).toBe("");
  });
});
