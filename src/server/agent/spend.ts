/**
 * Spend control and rate limits (contracts section 12). Our own ledger of
 * token cost is the guard: every model call is priced and recorded, and a new
 * call is refused once today's allowance or the total cap is used up.
 */
import { SPEND, torontoToday } from "../../contracts";
import type { Db, Tx } from "../db/types";
import { AppError } from "../errors";

const MICRO_USD = 1_000_000;
const LIVE_MODE_OFF = "Live mode is unavailable right now.";

export async function checkBudget(db: Tx, now: Date): Promise<void> {
  if (process.env.COIN_KILL_SWITCH === "1") {
    throw new AppError("unavailable", LIVE_MODE_OFF);
  }
  const [spent] = await db.query<{ daily: number; total: number }>(
    `select coalesce(sum(cost_micro_usd) filter (where day_toronto = $1), 0) as daily,
            coalesce(sum(cost_micro_usd), 0) as total
     from usage_ledger`,
    [torontoToday(now)],
  );
  // Postgres returns sum() as text; compare as numbers.
  const dailyUsedUp = Number(spent.daily) >= SPEND.daily_allowance_usd * MICRO_USD;
  const totalUsedUp = Number(spent.total) >= SPEND.total_cap_usd * MICRO_USD;
  if (dailyUsedUp || totalUsedUp) {
    throw new AppError("unavailable", LIVE_MODE_OFF);
  }
}

type MessageCounts = { session_count: number; ip_count: number; global_count: number };

export async function checkRateLimit(db: Tx, sessionId: string, now: Date): Promise<void> {
  const [counts] = await db.query<MessageCounts>(
    `select
       count(*) filter (where r.session_id = $1 and r.at > $2::timestamptz - interval '1 hour')::int as session_count,
       count(*) filter (where r.ip_hash = s.ip_hash and r.ip_hash is not null
         and (r.at at time zone 'America/Toronto')::date = $3::date)::int as ip_count,
       count(*) filter (where (r.at at time zone 'America/Toronto')::date = $3::date)::int as global_count
     from sessions s left join rate_events r on r.kind = 'chat'
     where s.id = $1 group by s.ip_hash`,
    [sessionId, now.toISOString(), torontoToday(now)],
  );
  const overLimit =
    !counts
    || counts.session_count >= SPEND.per_session_messages_per_hour
    || counts.ip_count >= SPEND.per_ip_messages_per_day
    || counts.global_count >= SPEND.global_messages_per_day;
  if (overLimit) {
    throw new AppError("rate_limited", "Too many messages. Please try again later.");
  }
  await db.query(
    `insert into rate_events (at, session_id, ip_hash, kind)
     select $2, id, ip_hash, 'chat' from sessions where id = $1`,
    [sessionId, now.toISOString()],
  );
}

/** USD per million tokens, from env; never hardcoded. Throws when missing so spend is never recorded as free. */
export function tokenPrices(): { input: number; output: number } {
  const rawInput = process.env.PRICE_INPUT_USD_PER_MTOK;
  const rawOutput = process.env.PRICE_OUTPUT_USD_PER_MTOK;
  const input = Number(rawInput);
  const output = Number(rawOutput);
  const valid = (raw: string | undefined, price: number) => Boolean(raw) && Number.isFinite(price) && price >= 0;
  if (!valid(rawInput, input) || !valid(rawOutput, output)) {
    throw new Error("Token prices are not configured");
  }
  return { input, output };
}

export async function recordUsage(
  db: Db,
  usage: { sessionId: string; now: Date; model: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  const { input, output } = tokenPrices();
  // Tokens x (USD per million tokens) is already micro-USD.
  const costMicroUsd = Math.ceil(usage.inputTokens * input + usage.outputTokens * output);
  // The session row may be gone by now (the visitor restarted mid-reply);
  // the call was still paid for, so it is recorded either way.
  await db.query(
    `insert into usage_ledger (at, day_toronto, session_id, ip_hash, model, input_tokens, output_tokens, cost_micro_usd)
     values ($2, $3, $1, (select ip_hash from sessions where id = $1), $4, $5, $6, $7)`,
    [
      usage.sessionId,
      usage.now.toISOString(),
      torontoToday(usage.now),
      usage.model,
      usage.inputTokens,
      usage.outputTokens,
      costMicroUsd,
    ],
  );

}
