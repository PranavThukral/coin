/**
 * The one wrapper every API route uses. It resolves (or creates) the
 * visitor's session from the coin_sid cookie, which also settles any approved
 * action whose undo window has ended, then runs the route. Errors become
 * safe JSON: AppError keeps its message, anything else is a generic 500.
 */
import "server-only";
import { ZodError } from "zod";
import { SESSION } from "../../contracts";
import { db as appDb } from "../db/client";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import { hashIp, resolveSession } from "./session";

export interface SessionContext {
  db: Db;
  sessionId: string;
  now: Date;
}

let testDb: Db | null = null;

/** Tests inject an in-memory database; the app always uses DATABASE_URL. */
export function useDbForTests(db: Db | null): void {
  testDb = db;
}

function database(): Db {
  return testDb ?? appDb();
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** HTTPS directly, or behind a proxy that says so (Vercel sets x-forwarded-proto). */
function isHttps(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto") === "https") return true;
  return new URL(request.url).protocol === "https:";
}

function sessionCookie(sessionId: string, secure: boolean): string {
  const parts = [
    `${SESSION.cookie_name}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION.idle_minutes * 60}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json({ error: "That request was not valid." }, { status: 422 });
  }
  console.error("Unhandled route error", error);
  return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

export async function withSession(
  request: Request,
  handler: (context: SessionContext) => Promise<Response>,
): Promise<Response> {
  // Request data is read first, outside the try block. That tells Next.js this
  // route can only run per request, so a build never prerenders (and caches)
  // an API response, whatever the environment looks like at build time.
  const cookieValue = readCookie(request, SESSION.cookie_name);
  const ip = clientIp(request);
  const now = new Date();
  let cookie: string | null = null;
  let response: Response;

  try {
    const db = database();
    const ipHash = hashIp(ip, process.env.IP_HASH_SALT ?? "");
    const session = await resolveSession(db, cookieValue, now, ipHash);
    // Refresh on every response: the browser's expiry slides with activity,
    // matching the server's idle window.
    cookie = sessionCookie(session.sessionId, isHttps(request));
    response = await handler({ db, sessionId: session.sessionId, now });
  } catch (error) {
    response = errorResponse(error);
  }

  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

/** The session id carried by an already-resolved request, for tests and logs. */
export function sessionIdFrom(request: Request): string | null {
  return readCookie(request, SESSION.cookie_name);
}
