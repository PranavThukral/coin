import { SEED_SECURITIES } from "../../../../contracts";
import { chartRequest } from "../../../../lib/chart-request";
import { AppError } from "../../../../server/errors";
import { withSession } from "../../../../server/session/http";
import { buildChart } from "../../../../server/tools/charts";
import { holdingViews } from "../../../../server/tools/data";

/** One security: what it is, its price over the past year, and what the visitor holds of it (read-only). */
export function GET(request: Request, route: { params: Promise<{ ticker: string }> }) {
  return withSession(request, async ({ db, sessionId }) => {
    const ticker = decodeURIComponent((await route.params).ticker).toUpperCase();
    const security = SEED_SECURITIES.find((item) => item.ticker === ticker);
    if (!security) throw new AppError("not_found", "Security not found");

    const [chart, holdings] = await Promise.all([
      buildChart(db, sessionId, chartRequest("price_history", "Price", { ticker, kind: "line" })),
      holdingViews(db, sessionId),
    ]);
    const { name, kind, sector, dividend_yield_bps } = security;
    return Response.json({
      security: { ticker, name, kind, sector, dividend_yield_bps },
      chart,
      positions: holdings.filter((holding) => holding.ticker === ticker),
    });
  });
}
