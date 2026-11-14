import { actionRoute } from "../../../../../server/actions/routes";
import { executeNow } from "../../../../../server/actions/service";

export const POST = actionRoute(({ db, sessionId, now }, id) => executeNow(db, sessionId, id, now));
