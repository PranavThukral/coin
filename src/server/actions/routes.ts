/**
 * Shared shape of the action endpoints (contracts section 9). The browser only
 * ever sends an action id (plus the email for a new-recipient confirmation);
 * the payload stays on the server.
 */
import "server-only";
import { Uuid, type ActionCard } from "../../contracts";
import { AppError } from "../errors";
import { withSession, type SessionContext } from "../session/http";

type ActionHandler = (context: SessionContext, actionId: string, request: Request) => Promise<ActionCard>;
type RouteContext = { params: Promise<{ id: string }> };

export function actionRoute(handler: ActionHandler) {
  return (request: Request, route: RouteContext): Promise<Response> =>
    withSession(request, async (context) => {
      const { id } = await route.params;
      const actionId = Uuid.safeParse(id);
      if (!actionId.success) throw new AppError("not_found", "Action not found");
      const card = await handler(context, actionId.data, request);
      return Response.json(card);
    });
}
