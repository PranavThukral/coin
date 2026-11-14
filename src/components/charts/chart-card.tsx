"use client";

// Draws a server-computed ChartPayload. Every number comes from the payload;
// this component only formats and lays out. Colours are the validated chart
// tokens in fixed order (never cycled); text always uses text tokens.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { compactMoney, money, shortDate } from "../../lib/format";

const SERIES_COLOURS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"];
const colour = (index: number) => `var(${SERIES_COLOURS[Math.min(index, SERIES_COLOURS.length - 1)]})`;

const AXIS_TICK = { fill: "var(--subtle)", fontSize: 12, fontWeight: 600 };

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

function ChartTooltip({ payload, chart }: { payload?: Array<{ name?: string; value?: number; color?: string }>; chart: ChartPayload; label?: string }) {
  if (!payload || payload.length === 0) return null;
  return (
    <div className="rounded-coin-sm border border-border bg-surface px-3 py-2 text-xs shadow-coin">
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-2 font-semibold text-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />
          <span className="text-muted">{item.name}</span>
          <span className="money ml-auto font-extrabold">{formatValue(chart, Number(item.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ chart }: { chart: ChartPayload }) {
  const series = seriesOf(chart);
  if (series.length < 2) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
      {series.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colour(i) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function DonutChart({ chart }: { chart: ChartPayload }) {
  const valueKey = seriesOf(chart)[0].key;
  const rows = chart.data.map((row) => ({ name: humanize(String(row[chart.x.key])), value: Number(row[valueKey] ?? 0) }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-4">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} stroke="var(--surface)" strokeWidth={2}>
            {rows.map((row, i) => (
              <Cell key={row.name} fill={colour(i)} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip chart={chart} />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-1.5 text-sm">
        {rows.slice(0, 6).map((row, i) => (
          <li key={row.name} className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour(i) }} />
            <span className="truncate text-muted">{row.name}</span>
            <span className="money ml-auto font-extrabold">{total ? `${Math.round((row.value / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CartesianBody({ chart }: { chart: ChartPayload }) {
  const series = seriesOf(chart);
  const xKey = chart.x.key;
  // Bars and areas encode size, so they start at zero; lines show change, so they zoom.
  const zeroBased = chart.kind === "bar" || chart.kind === "grouped_bar" || chart.kind === "area";
  const common = {
    data: chart.data,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
      <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => humanize(String(v))} minTickGap={16} />
      <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={56}
        domain={zeroBased ? [0, "auto"] : ["auto", "auto"]}
        tickFormatter={(v) => formatValue(chart, Number(v), true)}
      />
      <Tooltip content={<ChartTooltip chart={chart} />} cursor={{ fill: "var(--surface-soft)", stroke: "var(--border-strong)" }} labelFormatter={(v) => humanize(String(v))} />
    </>
  );

  if (chart.kind === "bar" || chart.kind === "grouped_bar") {
    const highlightX = chart.highlight?.x;
    return (
      <BarChart {...common} barGap={2} barCategoryGap="24%">
        {axes}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={colour(i)} radius={[4, 4, 0, 0]} maxBarSize={40}>
            {series.length === 1 &&
              chart.data.map((row) => (
                <Cell
                  key={String(row[xKey])}
                  fill={colour(i)}
                  fillOpacity={highlightX && String(row[xKey]) !== highlightX ? 0.45 : 1}
                />
              ))}
          </Bar>
        ))}
      </BarChart>
    );
  }
  if (chart.kind === "area") {
    return (
      <AreaChart {...common}>
        {axes}
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colour(i)} strokeWidth={2} fill={colour(i)} fillOpacity={0.12} dot={false} />
        ))}
      </AreaChart>
    );
  }
  return (
    <LineChart {...common}>
      {axes}
      {series.map((s, i) => (
        <Line
          key={s.key}
          type={chart.kind === "step" ? "stepAfter" : "monotone"}
          dataKey={s.key}
          name={s.label}
          stroke={colour(i)}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
        />
      ))}
    </LineChart>
  );
}

export function ChartCard({ chart, height = 200, bare = false }: { chart: ChartPayload; height?: number; bare?: boolean }) {
  const body =
    chart.kind === "donut" ? (
      <DonutChart chart={chart} />
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <CartesianBody chart={chart} />
      </ResponsiveContainer>
    );

  return (
    <figure className={bare ? "" : "rounded-coin border border-border bg-surface p-4"}>
      <figcaption className="mb-3">
        <p className="text-sm font-extrabold">{chart.title}</p>
        {chart.subtitle && <p className="text-xs font-semibold text-subtle">{chart.subtitle}</p>}
      </figcaption>
      {body}
      <Legend chart={chart} />
      {chart.highlight && (
        <p className="mt-2 text-xs font-bold text-warning">
          {humanize(chart.highlight.x)}: {chart.highlight.label}
        </p>
      )}
    </figure>
  );
}
