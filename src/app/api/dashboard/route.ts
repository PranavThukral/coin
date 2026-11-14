import { db } from "../../../server/db/client";
import { dailyOutflow } from "../../../server/db/daily-outflow";
import { requireSessionId } from "../../../server/session/stub";
import { runReadTool } from "../../../server/tools/read";
import { buildChart } from "../../../server/tools/charts";

export async function GET(request: Request) {
  const sid = requireSessionId(request);
  const database = db();
  const [accounts, recent, netWorth, outflow] = await Promise.all([
    runReadTool(database, sid, "get_accounts", {}),
    runReadTool(database, sid, "get_transactions", { account_id: null, from: null, to: null, category: null, merchant_query: null, limit: 10 }),
    buildChart(database, sid, { source: "net_worth_over_time", title: "Net worth", kind: null, from: null, to: null, compare_from: null, compare_to: null, account_id: null, category: null, ticker: null, days: null }),
    dailyOutflow(database, sid),
  ]);
  return Response.json({ accounts, recent_transactions: recent, net_worth: netWorth, daily_outflow: outflow });
}
