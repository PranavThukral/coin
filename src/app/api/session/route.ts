import { SESSION } from "../../../contracts";
import { dailyOutflow } from "../../../server/actions/context";
import * as q from "../../../server/db/queries";
import { withSession } from "../../../server/session/http";

export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId, now }) => {
    const today = (await q.sessionInfo(db, sessionId)).today_date;
    const expiresAt = new Date(now.getTime() + SESSION.idle_minutes * 60 * 1000).toISOString();
    return Response.json({
      today,
      expires_at: expiresAt,
      daily_outflow: await dailyOutflow(db, sessionId),
    });
  });
}
