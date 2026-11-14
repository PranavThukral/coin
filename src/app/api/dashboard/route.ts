import type { ChartRequest } from "../../../contracts";
import { dailyOutflow } from "../../../server/actions/context";
import { withSession } from "../../../server/session/http";
import { buildChart } from "../../../server/tools/charts";
import { runReadTool } from "../../../server/tools/read";

const NET_WORTH_CHART: ChartRequest = {
  source: "net_worth_over_time",
  title: "Net worth",
  kind: null,
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
    const [accounts, recent, netWorth, outflow] = await Promise.all([
      runReadTool(db, sessionId, "get_accounts", {}),
      runReadTool(db, sessionId, "get_transactions", RECENT_TRANSACTIONS),
      buildChart(db, sessionId, NET_WORTH_CHART),
      dailyOutflow(db, sessionId),
    ]);
    return Response.json({
      accounts,
      recent_transactions: recent,
      net_worth: netWorth,
      daily_outflow: outflow,
    });
  });
}
