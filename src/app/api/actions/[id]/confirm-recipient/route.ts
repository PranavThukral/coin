import { ConfirmRecipientBody } from "../../../../../contracts";
import { actionRoute } from "../../../../../server/actions/routes";
import { confirmRecipient } from "../../../../../server/actions/service";
import { AppError } from "../../../../../server/errors";

export const POST = actionRoute(async ({ db, sessionId }, id, request) => {
  const body = ConfirmRecipientBody.safeParse(await request.json());
  if (!body.success) throw new AppError("invalid", "That doesn't look like an email address.");
  return confirmRecipient(db, sessionId, id, body.data.email);
});
