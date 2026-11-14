import { actionRoute } from "../../../../../server/actions/routes";
import { undo } from "../../../../../server/actions/service";

export const POST = actionRoute(({ db, sessionId }, id) => undo(db, sessionId, id));
