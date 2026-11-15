// SVG path geometry for the hand-drawn charts (the net worth hero and the
// small charts on the landing page).

export interface XY {
  x: number;
  y: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A smooth line through every point (Catmull-Rom, written as cubic Beziers).
 * Control points sit a sixth of the way along the neighbouring chord, so the
 * curve never overshoots far past the data.
 */
export function smoothPath(points: XY[]): string {
  if (points.length === 0) return "";
  const commands = [`M${round(points[0].x)} ${round(points[0].y)}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const before = points[Math.max(0, i - 1)];
    const from = points[i];
    const to = points[i + 1];
    const after = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 };
    const c2 = { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 };
    commands.push(`C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(to.x)} ${round(to.y)}`);
  }
  return commands.join(" ");
}

/** The same line, closed down to a baseline, for the soft fill under it. */
export function areaPath(points: XY[], baselineY: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${smoothPath(points)} L${round(last.x)} ${round(baselineY)} L${round(first.x)} ${round(baselineY)} Z`;
}

export interface Scale {
  min: number;
  max: number;
  /** Pixel box the values are drawn into. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Evenly spaced values placed into the scale's box. */
export function plot(values: number[], scale: Scale): XY[] {
  const lastIndex = Math.max(1, values.length - 1);
  return values.map((value, i) => ({
    x: scale.left + ((scale.right - scale.left) * i) / lastIndex,
    y: yOf(value, scale),
  }));
}

export function yOf(value: number, scale: Scale): number {
  const span = scale.max - scale.min;
  const share = span === 0 ? 0.5 : (value - scale.min) / span;
  return scale.bottom - (scale.bottom - scale.top) * share;
}
