import { Uuid } from "../../../../../contracts";
import { retryAtMax } from "../../../../../server/actions/retry";
import { AppError } from "../../../../../server/errors";
import { withSession } from "../../../../../server/session/http";

/** "Use $X instead": the server builds the smaller request from trusted pieces only. */
export function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  return withSession(request, async ({ db, sessionId }) => {
    const parsed = Uuid.safeParse((await route.params).id);
    if (!parsed.success) throw new AppError("not_found", "Action not found");
    return Response.json(await retryAtMax(db, sessionId, parsed.data));
  });
}
