import { actionRoute } from "../../../../../server/actions/routes";
import { dismiss } from "../../../../../server/actions/service";

export const POST = actionRoute(({ db, sessionId }, id) => dismiss(db, sessionId, id));
