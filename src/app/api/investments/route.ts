import { chartRequest } from "../../../lib/chart-request";
import { withSession } from "../../../server/session/http";
import { buildChart } from "../../../server/tools/charts";
import { holdingViews } from "../../../server/tools/data";
import { runReadTool } from "../../../server/tools/read";

/** Every holding across the investment accounts, with how the whole is split (read-only). */
export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const [accounts, holdings, value, byHolding, byAccount] = await Promise.all([
      runReadTool(db, sessionId, "get_accounts", {}),
      holdingViews(db, sessionId),
      buildChart(db, sessionId, chartRequest("portfolio_value_over_time", "Invested value")),
      buildChart(db, sessionId, chartRequest("allocation_by_holding", "By holding")),
      buildChart(db, sessionId, chartRequest("allocation_by_account", "By account")),
    ]);
    return Response.json({ accounts, holdings, value, by_holding: byHolding, by_account: byAccount });
  });
}
