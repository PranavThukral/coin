import type { ChartRequest } from "../../../contracts";
import { isNetWorthRange, mergePoints, seriesStarts, type NetWorthPoint } from "../../../lib/net-worth";
import { AppError } from "../../../server/errors";
import { withSession } from "../../../server/session/http";
import { buildChart } from "../../../server/tools/charts";

const NET_WORTH_CHART: ChartRequest = {
  source: "net_worth_over_time",
  title: "Net worth",
  kind: "line",
  from: null,
  to: null,
  compare_from: null,
  compare_to: null,
  account_id: null,
  category: null,
  ticker: null,
  days: null,
};

/**
 * Net worth over one range of the hero chart (read-only). The chart builder
 * gives a point every 30 days, so a finer line is several of its series,
 * each started a few days later, merged.
 */
export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const range = new URL(request.url).searchParams.get("range");
    if (!isNetWorthRange(range)) throw new AppError("invalid", "Unknown range.");

    const [session] = await db.query<{ today_date: string }>(
      "select today_date from sessions where id = $1",
      [sessionId],
    );
    const today = session.today_date;
    const charts = await Promise.all(
      seriesStarts(range, today).map((from) => buildChart(db, sessionId, { ...NET_WORTH_CHART, from, to: today })),
    );
    const lists = charts.map((chart) =>
      chart.data.map((row): NetWorthPoint => ({ date: String(row.x), cents: Number(row.value) })),
    );
    return Response.json({ range, points: mergePoints(lists) });
  });
}
