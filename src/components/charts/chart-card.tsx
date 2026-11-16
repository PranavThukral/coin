"use client";

// Draws a server-computed ChartPayload. Every number comes from the payload;
// this component only formats and lays out. Colours are the validated chart
// tokens in fixed order (never cycled); text always uses text tokens.
// Charts reveal themselves: lines draw in, bars grow, rings sweep round.
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPayload } from "../../contracts";
import { compactMoney, money, shortDate, signedMoney } from "../../lib/format";

const SERIES_COLOURS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"];
const colour = (index: number) => `var(${SERIES_COLOURS[Math.min(index, SERIES_COLOURS.length - 1)]})`;

const AXIS_TICK = { fill: "var(--subtle)", fontSize: 11, fontWeight: 700 };

/** How every mark animates in: drawn in place, with no travel. */
function useReveal() {
  return { isAnimationActive: true, animationDuration: 1100, animationEasing: "ease-out" as const };
}

function humanize(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return shortDate(value);
  if (/^\d{4}-\d{2}$/.test(value)) {
    const d = new Date(`${value}-15T12:00:00Z`);
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d);
  }
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatValue(payload: ChartPayload, value: number, compact = false): string {
  if (payload.value_format === "percent") return `${(value * 100).toFixed(1)}%`;
  if (payload.value_format === "number") return value.toLocaleString("en-CA");
  return compact ? compactMoney(value) : money(value);
}

function seriesOf(payload: ChartPayload) {
  if (payload.series.length > 0) return payload.series;
  return [{ key: "value", label: payload.title }];
}

interface TooltipItem {
  name?: string;
  value?: number;
  color?: string;
}

function ChartTooltip({ payload, label, chart }: { payload?: TooltipItem[]; label?: string | number; chart: ChartPayload }) {
  if (!payload || payload.length === 0) return null;
  const single = payload.length === 1;
  return (
    <div className="rounded-coin-sm bg-surface-raised px-3 py-2 text-xs shadow-coin-float">
      {label !== undefined && <p className="mb-1 font-bold text-subtle">{humanize(String(label))}</p>}
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-2 font-semibold text-foreground">
          {!single && <span className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />}
          {!single && <span className="text-muted">{item.name}</span>}
          <span className="money ml-auto text-sm font-extrabold">{formatValue(chart, Number(item.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ chart }: { chart: ChartPayload }) {
  const series = seriesOf(chart);
  if (series.length < 2) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
      {series.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: barColour(chart, i) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** For a single line over time: where it ended and how far it moved. */
function TrendSummary({ chart }: { chart: ChartPayload }) {
  const dated = chart.x.type === "date" && chart.series.length <= 1 && chart.value_format === "cad";
  const trend = chart.kind === "line" || chart.kind === "area";
  if (!dated || !trend || chart.data.length < 2) return null;
  const key = seriesOf(chart)[0].key;
  const first = Number(chart.data[0][key] ?? 0);
  const last = Number(chart.data[chart.data.length - 1][key] ?? 0);
  const change = last - first;
  const percent = first === 0 ? null : `${((Math.abs(change) / Math.abs(first)) * 100).toFixed(1)}%`;
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
      <p className="money text-2xl font-extrabold tracking-tight">{money(last)}</p>
      <p className={`money text-xs font-extrabold ${change >= 0 ? "text-gain" : "text-loss"}`}>
        {signedMoney(change, true)}
        {percent && ` (${percent})`}
      </p>
    </div>
  );
}

/** One slice: its name, a bar for its share, what it is worth, and its gain when the chart carries one. */
function DonutRow({ slice, total, index }: { slice: Slice; total: number; index: number }) {
  const share = total ? slice.value / total : 0;
  return (
    <li className="coin-rise" style={{ "--i": index + 4 } as React.CSSProperties}>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: slice.fill }} />
        <span className="min-w-0 truncate font-extrabold">{slice.label}</span>
        {slice.label !== slice.name && <span className="hidden shrink-0 text-xs font-bold text-subtle @md:inline">{slice.name}</span>}
        <span className="money ml-auto shrink-0 font-extrabold">{money(slice.value)}</span>
        <span className="money w-10 shrink-0 text-right text-xs font-extrabold text-muted">{Math.round(share * 100)}%</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-[18px]">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-soft">
          <span className="coin-fill block h-full rounded-full" style={{ width: `${share * 100}%`, background: slice.fill }} />
        </span>
        {slice.gain !== null && (
          <span className={`money shrink-0 text-xs font-extrabold ${slice.gain >= 0 ? "text-gain" : "text-loss"}`}>
            {signedMoney(slice.gain, true)}
          </span>
        )}
      </div>
    </li>
  );
}

function DonutLegend({ slices, total }: { slices: Slice[]; total: number }) {
  return (
    <ul className="min-w-0 space-y-3">
      {slices.map((slice, i) => (
        <DonutRow key={slice.name} slice={slice} total={total} index={i} />
      ))}
    </ul>
  );
}

const DONUT_SLICES = 6;
const OTHER_COLOUR = "var(--border-strong)";

interface Slice {
  /** The x value ("NRTH.CX"). */
  name: string;
  /** What to call it ("Northwind Robotics"); the same as name when the chart has no fuller one. */
  label: string;
  value: number;
  /** Gain since purchase, when the chart carries it. */
  gain: number | null;
  fill: string;
}

/** Largest first; past six slices the small ones fold into a grey "Other". */
function slicesOf(chart: ChartPayload): Slice[] {
  const valueKey = seriesOf(chart)[0].key;
  const rows = chart.data
    .map((row) => {
      const name = humanize(String(row[chart.x.key]));
      return {
        name,
        label: typeof row.name === "string" ? row.name : name,
        value: Number(row[valueKey] ?? 0),
        gain: typeof row.gain === "number" ? row.gain : null,
      };
    })
    .sort((a, b) => b.value - a.value);
  if (rows.length <= DONUT_SLICES) return rows.map((row, i) => ({ ...row, fill: colour(i) }));
  const kept = rows.slice(0, DONUT_SLICES - 1).map((row, i) => ({ ...row, fill: colour(i) }));
  const rest = rows.slice(DONUT_SLICES - 1).reduce((sum, row) => sum + row.value, 0);
  return [...kept, { name: "Other", label: "Other", value: rest, gain: null, fill: OTHER_COLOUR }];
}

function DonutChart({ chart }: { chart: ChartPayload }) {
  const reveal = useReveal();
  const slices = slicesOf(chart);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <div className="@container">
    <div className="grid items-center gap-5 @sm:grid-cols-[132px_1fr]">
      <ResponsiveContainer width="100%" height={132}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={42}
            outerRadius={64}
            paddingAngle={2}
            cornerRadius={4}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            {...reveal}
          >
            {slices.map((slice) => (
              <Cell key={slice.name} fill={slice.fill} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip chart={chart} />} />
        </PieChart>
      </ResponsiveContainer>
      <DonutLegend slices={slices} total={total} />
    </div>
    </div>
  );
}

function Axes({ chart, zeroBased }: { chart: ChartPayload; zeroBased: boolean }) {
  return (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 5" />
      <XAxis
        dataKey={chart.x.key}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        tickFormatter={(v) => humanize(String(v))}
        minTickGap={20}
      />
      <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={46}
        tickCount={4}
        domain={zeroBased ? [0, "auto"] : ["auto", "auto"]}
        tickFormatter={(v) => formatValue(chart, Number(v), true)}
      />
      <Tooltip
        content={<ChartTooltip chart={chart} />}
        cursor={{ fill: "var(--surface-soft)", stroke: "var(--border-strong)", strokeWidth: 1 }}
      />
    </>
  );
}

const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const ACTIVE_DOT = { r: 5, strokeWidth: 3, stroke: "var(--surface)" };

/** In a two-series comparison the earlier period is quiet and the current one leads. */
function barColour(chart: ChartPayload, index: number): string {
  if (chart.source !== "category_change" || chart.series.length !== 2) return colour(index);
  return index === 0 ? "var(--border-strong)" : colour(0);
}

/** Bars over time: upright columns. */
function ColumnBars({ chart }: { chart: ChartPayload }) {
  const reveal = useReveal();
  return (
    <BarChart data={chart.data} margin={MARGIN} barGap={3} barCategoryGap="26%">
      <Axes chart={chart} zeroBased />
      {seriesOf(chart).map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.label} fill={barColour(chart, i)} radius={[5, 5, 0, 0]} maxBarSize={32} {...reveal} animationBegin={i * 160} />
      ))}
    </BarChart>
  );
}

const ROW_HEIGHT = { single: 30, grouped: 38 };

function rowBarsHeight(chart: ChartPayload): number {
  const perRow = chart.series.length > 1 ? ROW_HEIGHT.grouped : ROW_HEIGHT.single;
  return chart.data.length * perRow + 8;
}

/** Bars by category: one row each, so every name has room to be read. */
function RowBars({ chart }: { chart: ChartPayload }) {
  const reveal = useReveal();
  const series = seriesOf(chart);
  const xKey = chart.x.key;
  const highlightX = chart.highlight?.x;
  const single = series.length === 1;
  return (
    <BarChart data={chart.data} layout="vertical" margin={{ top: 0, right: single ? 52 : 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
      <XAxis type="number" hide domain={[0, "auto"]} />
      <YAxis type="category" dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} width={96} tickFormatter={(v) => humanize(String(v))} />
      <Tooltip content={<ChartTooltip chart={chart} />} cursor={{ fill: "var(--surface-soft)" }} />
      {series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.label} fill={barColour(chart, i)} radius={[0, 5, 5, 0]} maxBarSize={14} {...reveal} animationBegin={i * 160}>
          {single &&
            chart.data.map((row) => {
              const dimmed = highlightX && String(row[xKey]) !== highlightX;
              return <Cell key={String(row[xKey])} fill={colour(chart.data.indexOf(row))} fillOpacity={dimmed ? 0.45 : 1} />;
            })}
          {!single && i === series.length - 1 &&
            chart.data.map((row, rowIndex) => <Cell key={String(row[xKey])} fill={colour(rowIndex)} />)}
          {single && (
            <LabelList dataKey={s.key} position="right" fill="var(--muted)" fontSize={11} fontWeight={800} formatter={(v) => formatValue(chart, Number(v), true)} />
          )}
        </Bar>
      ))}
    </BarChart>
  );
}

const isBars = (chart: ChartPayload) => chart.kind === "bar" || chart.kind === "grouped_bar";
const isRowBars = (chart: ChartPayload) => isBars(chart) && chart.x.type === "category";

/** One series over time: a line with a soft fill under it. */
function TrendArea({ chart, zeroBased }: { chart: ChartPayload; zeroBased: boolean }) {
  const reveal = useReveal();
  const id = useId();
  const series = seriesOf(chart);
  return (
    <AreaChart data={chart.data} margin={MARGIN}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.key} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={colour(i)} stopOpacity={0.22} />
            <stop offset="1" stopColor={colour(i)} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <Axes chart={chart} zeroBased={zeroBased} />
      {series.map((s, i) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label}
          stroke={colour(i)}
          strokeWidth={2.5}
          fill={`url(#${id}-${i})`}
          dot={false}
          activeDot={ACTIVE_DOT}
          {...reveal}
        />
      ))}
    </AreaChart>
  );
}

function Lines({ chart }: { chart: ChartPayload }) {
  const reveal = useReveal();
  return (
    <LineChart data={chart.data} margin={MARGIN}>
      <Axes chart={chart} zeroBased={false} />
      {seriesOf(chart).map((s, i) => (
        <Line
          key={s.key}
          type={chart.kind === "step" ? "stepAfter" : "monotone"}
          dataKey={s.key}
          name={s.label}
          stroke={colour(i)}
          strokeWidth={2.5}
          dot={false}
          activeDot={ACTIVE_DOT}
          {...reveal}
        />
      ))}
    </LineChart>
  );
}

function CartesianBody({ chart }: { chart: ChartPayload }) {
  if (isRowBars(chart)) return <RowBars chart={chart} />;
  if (isBars(chart)) return <ColumnBars chart={chart} />;
  // Areas encode size, so they start at zero; lines show change, so they zoom.
  if (chart.kind === "area") return <TrendArea chart={chart} zeroBased />;
  if (chart.kind === "line" && chart.series.length <= 1) return <TrendArea chart={chart} zeroBased={false} />;
  return <Lines chart={chart} />;
}

/** The highlighted row by its fuller name when the chart carries one ("Northwind Robotics", not "NRTH.CX"). */
function highlightName(chart: ChartPayload): string {
  const x = chart.highlight?.x ?? "";
  const row = chart.data.find((item) => String(item[chart.x.key]) === x);
  return typeof row?.name === "string" ? row.name : humanize(x);
}

export function ChartCard({
  chart,
  height = 200,
  bare = false,
  hero = false,
}: {
  chart: ChartPayload;
  height?: number;
  /** No card frame (the chart sits inside another card). */
  bare?: boolean;
  /** The surrounding card already names and totals the chart. */
  hero?: boolean;
}) {
  const body =
    chart.kind === "donut" ? (
      <DonutChart chart={chart} />
    ) : (
      <ResponsiveContainer width="100%" height={isRowBars(chart) ? rowBarsHeight(chart) : height}>
        <CartesianBody chart={chart} />
      </ResponsiveContainer>
    );

  return (
    <figure className={bare ? "" : "coin-rise rounded-coin bg-surface-raised p-4 shadow-coin"}>
      {!hero && (
        <figcaption className="mb-3">
          <p className="text-sm font-extrabold">{chart.title}</p>
          {chart.subtitle && <p className="text-xs font-semibold text-subtle">{chart.subtitle}</p>}
          <TrendSummary chart={chart} />
        </figcaption>
      )}
      {body}
      <Legend chart={chart} />
      {chart.highlight && (
        <p className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-extrabold text-warning">
          {highlightName(chart)}: {chart.highlight.label}
        </p>
      )}
    </figure>
  );
}
