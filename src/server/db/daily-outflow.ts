import { RULE_LIMITS, type DailyOutflow, type Proposal } from "../../contracts";
import type { Tx } from "./types";
import { sessionInfo } from "./queries";

export async function dailyOutflow(db: Tx, sid: string): Promise<DailyOutflow> {
  const { today_date: date } = await sessionInfo(db, sid);
  const rows = await db.query<{ id: string; type: "bill_payment" | "etransfer"; status: "pending_undo" | "executed"; payload: Proposal }>(
    "select id, type, status, payload from actions where session_id = $1 and type in ('bill_payment', 'etransfer') and status in ('pending_undo', 'executed') and (created_at at time zone 'America/Toronto')::date = $2::date order by created_at, id",
    [sid, date],
  );
  const items = rows.flatMap(row => {
    const p = row.payload;
    if (p.type !== "bill_payment" && p.type !== "etransfer") return [];
    const label = p.type === "bill_payment" ? p.bill_id : p.recipient.kind === "saved" ? p.recipient.contact_id : p.recipient.name;
    return [{ action_id: row.id, type: p.type, label, amount_cents: p.amount_cents, status: row.status }];
  });
  const used = items.reduce((sum, item) => sum + item.amount_cents, 0);
  const pending = items.filter(item => item.status === "pending_undo").reduce((sum, item) => sum + item.amount_cents, 0);
  return { date, used_cents: used, pending_cents: pending, remaining_cents: Math.max(0, RULE_LIMITS.daily_limit_cents - used), limit_cents: RULE_LIMITS.daily_limit_cents, items };
}
