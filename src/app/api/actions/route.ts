import { ActionStatus } from "../../../contracts";
import { listActions } from "../../../server/actions/service";
import { withSession } from "../../../server/session/http";

export function GET(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const raw = new URL(request.url).searchParams.get("status");
    const status = raw === null ? null : ActionStatus.parse(raw);
    return Response.json(await listActions(db, sessionId, status));
  });
}
