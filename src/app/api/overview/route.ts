import { AccountId } from "../../../contracts";
import { db } from "../../../server/db/client";
import { getOverview } from "../../../server/overview";
import { requireSessionId } from "../../../server/session/stub";

export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get("account_id");
  return Response.json(await getOverview(db(), requireSessionId(request), account ? AccountId.parse(account) : null));
}
