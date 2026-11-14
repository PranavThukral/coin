import { chat } from "../../../server/agent/chat";
import { withSession } from "../../../server/session/http";

// A turn can make several model calls. Without this, hosts fall back to a
// short default and cut the stream off mid-reply. 60s fits every Vercel plan.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return withSession(request, (context) => chat(request, context));
}
