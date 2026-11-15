import { AccountId, INVESTMENT_ACCOUNT_TYPES, type AccountView } from "../../../../contracts";
import { chartRequest } from "../../../../lib/chart-request";
import { AppError } from "../../../../server/errors";
import { withSession } from "../../../../server/session/http";
import { buildChart } from "../../../../server/tools/charts";
import { runReadTool } from "../../../../server/tools/read";

export function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  return withSession(request, async ({ db, sessionId }) => {
    const parsed = AccountId.safeParse((await route.params).id);
    if (!parsed.success) throw new AppError("not_found", "Account not found");
    const accountId = parsed.data;

    const accounts = (await runReadTool(db, sessionId, "get_accounts", {})) as AccountView[];
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new AppError("not_found", "Account not found");

    const investment = INVESTMENT_ACCOUNT_TYPES.includes(account.type);
    const source = investment ? "portfolio_value_over_time" : "account_balance_over_time";
    const chart = chartRequest(source, investment ? "Value" : "Balance", { account_id: accountId });

    const [transactions, holdings, builtChart] = await Promise.all([
      runReadTool(db, sessionId, "get_transactions", {
        account_id: accountId,
        from: null,
        to: null,
        category: null,
        merchant_query: null,
        limit: 40,
      }),
      investment ? runReadTool(db, sessionId, "get_holdings", { account_id: accountId }) : Promise.resolve(null),
      buildChart(db, sessionId, chart),
    ]);

    return Response.json({ account, transactions, holdings, chart: builtChart });
  });
}
