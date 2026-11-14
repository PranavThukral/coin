/**
 * Errors that are safe to show the user. Anything else that escapes a route
 * becomes a generic 500, so SQL and stack traces never leak.
 */
export type AppErrorCode = "not_found" | "conflict" | "invalid";

const STATUS: Record<AppErrorCode, number> = {
  not_found: 404,
  conflict: 409,
  invalid: 422,
};

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): number {
    return STATUS[this.code];
  }
}
