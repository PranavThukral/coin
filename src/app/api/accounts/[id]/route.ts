import { AccountId, INVESTMENT_ACCOUNT_TYPES, type AccountView, type ChartRequest } from "../../../../contracts";
import { AppError } from "../../../../server/errors";
import { withSession } from "../../../../server/session/http";
import { buildChart } from "../../../../server/tools/charts";
import { runReadTool } from "../../../../server/tools/read";

const EMPTY_CHART: Omit<ChartRequest, "source" | "title"> = {
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

export function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  return withSession(request, async ({ db, sessionId }) => {
    const parsed = AccountId.safeParse((await route.params).id);
    if (!parsed.success) throw new AppError("not_found", "Account not found");
    const accountId = parsed.data;

    const accounts = (await runReadTool(db, sessionId, "get_accounts", {})) as AccountView[];
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new AppError("not_found", "Account not found");

    const investment = INVESTMENT_ACCOUNT_TYPES.includes(account.type);
    const chartRequest: ChartRequest = investment
      ? { ...EMPTY_CHART, source: "portfolio_value_over_time", title: "Value", account_id: accountId }
      : { ...EMPTY_CHART, source: "account_balance_over_time", title: "Balance", account_id: accountId };

    const [transactions, holdings, chart] = await Promise.all([
      runReadTool(db, sessionId, "get_transactions", {
        account_id: accountId,
        from: null,
        to: null,
        category: null,
        merchant_query: null,
        limit: 40,
      }),
      investment ? runReadTool(db, sessionId, "get_holdings", { account_id: accountId }) : Promise.resolve(null),
      buildChart(db, sessionId, chartRequest),
    ]);

    return Response.json({ account, transactions, holdings, chart });
  });
}
