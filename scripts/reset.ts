import "dotenv/config";
import postgres from "postgres";
import { migrate } from "./migrate";
import { seedDatabase } from "./seed";

async function reset() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const host = new URL(url).hostname.toLowerCase();
  if (!host.includes("localhost") && !process.argv.includes("--yes-really")) throw new Error("Reset requires a localhost host or --yes-really");
  const sql = postgres(url, { max: 1 });
  try { await sql.unsafe("drop schema public cascade; create schema public;"); } finally { await sql.end(); }
  await migrate(url);
  await seedDatabase(url);
}
reset().catch(error => { console.error(error); process.exitCode = 1; });
