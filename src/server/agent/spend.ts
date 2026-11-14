import { SPEND, torontoToday } from "../../contracts";
import type { Db, Tx } from "../db/types";
import { AppError } from "../errors";

export async function checkBudget(db: Tx, now: Date): Promise<void> {
  if (process.env.COIN_KILL_SWITCH === "1") throw new AppError("unavailable", "Live mode is unavailable right now.");
  const [row] = await db.query<{ daily: number; total: number }>(
    `select coalesce(sum(cost_micro_usd) filter (where day_toronto = $1), 0) as daily,
      coalesce(sum(cost_micro_usd), 0) as total from usage_ledger`, [torontoToday(now)],
  );
  if (row.daily >= SPEND.daily_allowance_usd * 1_000_000 || row.total >= SPEND.total_cap_usd * 1_000_000) {
    throw new AppError("unavailable", "Live mode is unavailable right now.");
  }
}

export async function checkRateLimit(db: Tx, sessionId: string, now: Date): Promise<void> {
  const day = torontoToday(now);
  const [row] = await db.query<{ session_count: number; ip_count: number; global_count: number }>(
    `select
      count(*) filter (where r.session_id = $1 and r.at > $2::timestamptz - interval '1 hour')::int as session_count,
      count(*) filter (where r.ip_hash = s.ip_hash and r.ip_hash is not null
        and (r.at at time zone 'America/Toronto')::date = $3::date)::int as ip_count,
      count(*) filter (where (r.at at time zone 'America/Toronto')::date = $3::date)::int as global_count
     from sessions s left join rate_events r on r.kind = 'chat' where s.id = $1 group by s.ip_hash`,
    [sessionId, now.toISOString(), day],
  );
  if (!row || row.session_count >= SPEND.per_session_messages_per_hour ||
      row.ip_count >= SPEND.per_ip_messages_per_day || row.global_count >= SPEND.global_messages_per_day) {
    throw new AppError("rate_limited", "Too many messages. Please try again later.");
  }
  await db.query("insert into rate_events (at, session_id, ip_hash, kind) select $2, id, ip_hash, 'chat' from sessions where id = $1", [sessionId, now.toISOString()]);
}

export function tokenPrices(): { input: number; output: number } {
  const input = Number(process.env.PRICE_INPUT_USD_PER_MTOK);
  const output = Number(process.env.PRICE_OUTPUT_USD_PER_MTOK);
  if (!process.env.PRICE_INPUT_USD_PER_MTOK || !process.env.PRICE_OUTPUT_USD_PER_MTOK ||
      !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
    throw new Error("Token prices are not configured");
  }
  return { input, output };
}

export async function recordUsage(db: Db, usage: {
  sessionId: string; now: Date; model: string; inputTokens: number; outputTokens: number;
}): Promise<void> {
  const { input, output } = tokenPrices();
  const cost = Math.ceil(usage.inputTokens * input + usage.outputTokens * output);
  await db.query(
    `insert into usage_ledger (at, day_toronto, session_id, ip_hash, model, input_tokens, output_tokens, cost_micro_usd)
     select $2, $3, id, ip_hash, $4, $5, $6, $7 from sessions where id = $1`,
    [usage.sessionId, usage.now.toISOString(), torontoToday(usage.now), usage.model, usage.inputTokens, usage.outputTokens, cost],
  );
}
