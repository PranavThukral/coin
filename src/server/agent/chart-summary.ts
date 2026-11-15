/**
 * What the model reads back after render_chart. The chart itself goes to the
 * browser; the model gets the key numbers code computed for it, so it can say
 * what the chart means ("up **$4,210** since March") without inventing figures.
 */
import type { ChartPayload } from "../../contracts";

const MOST_CATEGORIES = 8;

type Point = Record<string, string | number | null>;

function formatValue(value: number, format: ChartPayload["value_format"]): string {
  if (format === "cad") {
    return (value / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  }
  if (format === "percent") return `${value}%`;
  return value.toLocaleString("en-CA");
}

function numbersFor(data: Point[], key: string): Array<{ x: string; value: number }> {
  const points: Array<{ x: string; value: number }> = [];
  for (const row of data) {
    const value = row[key];
    if (typeof value === "number") points.push({ x: String(row.x), value });
  }
  return points;
}

/** Dates on the x axis: where the line started, ended, and its high and low. */
function trendSummary(chart: ChartPayload, key: string): Record<string, string> | null {
  const points = numbersFor(chart.data, key);
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const high = points.reduce((best, p) => (p.value > best.value ? p : best));
  const low = points.reduce((best, p) => (p.value < best.value ? p : best));
  const format = (value: number) => formatValue(value, chart.value_format);
  return {
    start: `${format(first.value)} on ${first.x}`,
    end: `${format(last.value)} on ${last.x}`,
    change: format(last.value - first.value),
    high: `${format(high.value)} on ${high.x}`,
    low: `${format(low.value)} on ${low.x}`,
  };
}

/** Categories on the x axis: the largest slices, biggest first. */
function breakdownSummary(chart: ChartPayload, key: string): string[] {
  const points = numbersFor(chart.data, key).sort((a, b) => b.value - a.value);
  return points.slice(0, MOST_CATEGORIES).map((p) => `${p.x}: ${formatValue(p.value, chart.value_format)}`);
}

export function chartSummaryForModel(chart: ChartPayload): Record<string, unknown> {
  const series: Record<string, unknown> = {};
  for (const { key, label } of chart.series) {
    series[label] = chart.x.type === "date" ? trendSummary(chart, key) : breakdownSummary(chart, key);
  }
  return {
    outcome: "chart_shown",
    title: chart.title,
    period: chart.subtitle,
    series,
    highlight: chart.highlight?.label ? `${chart.highlight.label}: ${chart.highlight.x}` : null,
    note: "These numbers were computed by code. Say what they mean; the chart already shows them.",
  };
}
