import type { ChartRequest } from "../../../contracts";
import { dailyOutflow } from "../../../server/actions/context";
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

export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const [session] = await db.query<{ today_date: string }>(
      "select today_date from sessions where id = $1",
      [sessionId],
    );
    const [accounts, recent, upcoming, netWorth, outflow] = await Promise.all([
      runReadTool(db, sessionId, "get_accounts", {}),
      runReadTool(db, sessionId, "get_transactions", RECENT_TRANSACTIONS),
      runReadTool(db, sessionId, "get_upcoming", { days: 14 }),
      buildChart(db, sessionId, NET_WORTH_CHART),
      dailyOutflow(db, sessionId),
    ]);
    return Response.json({
      today: session.today_date,
      accounts,
      recent_transactions: recent,
      upcoming,
      net_worth: netWorth,
      daily_outflow: outflow,
    });
  });
}
