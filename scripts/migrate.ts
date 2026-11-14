import { loadScriptEnv } from "./env";
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function migrate(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    await sql`create table if not exists _migrations (filename text primary key, applied_at timestamptz not null default now())`;
    const files = (await readdir("db/migrations")).filter(file => file.endsWith(".sql")).sort();
    for (const file of files) {
      const applied = await sql`select filename from _migrations where filename = ${file}`;
      if (applied.length) continue;
      // Run the migration and its record atomically, including files with their own transaction wrapper.
      const body = (await readFile(resolve("db/migrations", file), "utf8"))
        .replace(/^\s*begin\s*;/im, "")
        .replace(/\bcommit\s*;\s*$/i, "");
      await sql.begin(async tx => {
        await tx.unsafe(body);
        await tx`insert into _migrations (filename) values (${file})`;
      });
    }
  } finally { await sql.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/migrate.ts")) {
  loadScriptEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  migrate(process.env.DATABASE_URL).catch(error => { console.error(error); process.exitCode = 1; });
}


