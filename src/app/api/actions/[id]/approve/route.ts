import { actionRoute } from "../../../../../server/actions/routes";
import { approve } from "../../../../../server/actions/service";

export const POST = actionRoute(({ db, sessionId, now }, id) => approve(db, sessionId, id, now));
