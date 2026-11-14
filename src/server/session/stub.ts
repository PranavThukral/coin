import { Uuid } from "../../contracts";

/** Temporary cookie reader; W4 owns session creation, expiry, and settlement. */
export function requireSessionId(request: Request): string {
  const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith("coin_sid="));
  return Uuid.parse(cookie?.slice("coin_sid=".length));
}
