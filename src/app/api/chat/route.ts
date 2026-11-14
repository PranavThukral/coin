import { chat } from "../../../server/agent/chat";
import { withSession } from "../../../server/session/http";

export async function POST(request: Request): Promise<Response> {
  return withSession(request, (context) => chat(request, context));
}
