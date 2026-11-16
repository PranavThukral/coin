import { PG_TYPE, parseSafeInt } from "./types";

/** Db callers pass JSON as encoded text, just as they do with PGlite. */
function serializeJson(value: unknown): string | undefined {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export const POSTGRES_TYPES = {
  int8: { to: PG_TYPE.int8, from: [PG_TYPE.int8], serialize: String, parse: parseSafeInt },
  date: { to: PG_TYPE.date, from: [PG_TYPE.date], serialize: String, parse: (value: string) => value },
  json: { to: 114, from: [114, 3802], serialize: serializeJson, parse: JSON.parse },
};
