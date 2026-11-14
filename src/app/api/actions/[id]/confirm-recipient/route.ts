import { ConfirmRecipientBody } from "../../../../../contracts";
import { actionRoute } from "../../../../../server/actions/routes";
import { confirmRecipient } from "../../../../../server/actions/service";

export const POST = actionRoute(async ({ db, sessionId }, id, request) => {
  const body = ConfirmRecipientBody.parse(await request.json());
  return confirmRecipient(db, sessionId, id, body.email);
});
