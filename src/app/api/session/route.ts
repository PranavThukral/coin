import { SESSION } from "../../../contracts";
import { dailyOutflow } from "../../../server/actions/context";
import { withSession } from "../../../server/session/http";

export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId, now }) => {
    const [row] = await db.query<{ today_date: string }>(
      "select today_date from sessions where id = $1",
      [sessionId],
    );
    const expiresAt = new Date(now.getTime() + SESSION.idle_minutes * 60 * 1000).toISOString();
    return Response.json({
      today: row.today_date,
      expires_at: expiresAt,
      daily_outflow: await dailyOutflow(db, sessionId),
    });
  });
}
