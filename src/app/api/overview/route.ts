import { AccountId } from "../../../contracts";
import { getOverview } from "../../../server/overview";
import { withSession } from "../../../server/session/http";

export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const raw = new URL(request.url).searchParams.get("account_id");
    const accountId = raw ? AccountId.parse(raw) : null;
    return Response.json(await getOverview(db, sessionId, accountId));
  });
}
