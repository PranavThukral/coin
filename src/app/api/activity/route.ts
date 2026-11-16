import * as q from "../../../server/db/queries";
import { withSession } from "../../../server/session/http";
import { runReadTool } from "../../../server/tools/read";

const ALL_ACCOUNTS = {
  account_id: null,
  from: null,
  to: null,
  category: null,
  merchant_query: null,
  limit: 200,
};

/** The latest transactions across every account, for the Activity view (read-only). */
export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const [today, accounts, transactions] = await Promise.all([
      q.sessionInfo(db, sessionId).then((session) => session.today_date),
      runReadTool(db, sessionId, "get_accounts", {}),
      runReadTool(db, sessionId, "get_transactions", ALL_ACCOUNTS),
    ]);
    return Response.json({ today, accounts, transactions });
  });
}
