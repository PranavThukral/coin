import { addDays, type ChartRequest } from "../../../contracts";
import { dailyOutflow } from "../../../server/actions/context";
import type { Db } from "../../../server/db/types";
import { withSession } from "../../../server/session/http";
import { buildChart } from "../../../server/tools/charts";
import { runReadTool } from "../../../server/tools/read";

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

const RECENT_TRANSACTIONS = {
  account_id: null,
  from: null,
  to: null,
  category: null,
  merchant_query: null,
  limit: 10,
};

/**
 * Net worth now, minus net worth at the end of last month. Computed from two
 * exact points; the year-long chart only has a point every 30 days, which is
 * too coarse to read "this month" from.
 */
async function monthChangeCents(db: Db, sessionId: string, today: string): Promise<number | null> {
  const lastMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
  const chart = await buildChart(db, sessionId, { ...NET_WORTH_CHART, from: lastMonthEnd, to: today });
  const start = chart.data[0]?.value;
  const end = chart.data.at(-1)?.value;
  if (typeof start !== "number" || typeof end !== "number") return null;
  return end - start;
}

export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const [session] = await db.query<{ today_date: string }>(
      "select today_date from sessions where id = $1",
      [sessionId],
    );
    const [accounts, recent, upcoming, netWorth, monthChange, outflow] = await Promise.all([
      runReadTool(db, sessionId, "get_accounts", {}),
      runReadTool(db, sessionId, "get_transactions", RECENT_TRANSACTIONS),
      runReadTool(db, sessionId, "get_upcoming", { days: 14 }),
      buildChart(db, sessionId, NET_WORTH_CHART),
      monthChangeCents(db, sessionId, session.today_date),
      dailyOutflow(db, sessionId),
    ]);
    return Response.json({
      today: session.today_date,
      accounts,
      recent_transactions: recent,
      upcoming,
      net_worth: netWorth,
      month_change_cents: monthChange,
      daily_outflow: outflow,
    });
  });
}
