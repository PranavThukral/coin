import { withSession } from "../../../../server/session/http";

/**
 * Restart the demo from a fresh copy of the bank: this visitor's session (and
 * everything the demo executed in it) is deleted; the next request clones anew.
 */
export function POST(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    await db.query("delete from sessions where id = $1 and not is_template", [sessionId]);
    return Response.json({ reset: true });
  });
}
