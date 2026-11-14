/**
 * Environment files for the db scripts. Next.js reads .env.local by itself;
 * plain scripts don't, so `npm run db:migrate` would miss the DATABASE_URL
 * kept there. Values already set in the shell win.
 *
 * Called only when a script is run from the command line, never on import:
 * tests and the dev server import the seed code and must not pick up keys.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadScriptEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(file);
    if (existsSync(path)) config({ path, override: false, quiet: true });
  }
}
