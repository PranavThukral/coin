import { addDays, daysBetween, PERSONA, RULE_LIMITS, type AffordabilityResult } from "../../contracts";
import type { Tx } from "../db/types";
import * as q from "../db/queries";
import { cashflow } from "./data";

export async function checkAffordability(
  db: Tx, sid: string, amount: number, onDate: string, fromAccount = "acc_chequing",
): Promise<AffordabilityResult> {
  const [accounts, session] = await Promise.all([q.accounts(db, sid), q.sessionInfo(db, sid)]);
  const source = accounts.find(a => a.id === fromAccount);
  if (!source) throw new Error("Account not found");
  const chequing = accounts.find(a => a.id === "acc_chequing");
  if (!chequing) throw new Error("Chequing not found");
  const anchor = addDays(PERSONA.pay.anchor_payday, session.date_offset_days);
  const daysToPay = (14 - ((daysBetween(anchor, onDate) % 14 + 14) % 14)) % 14 || 14;
  const nextPay = addDays(onDate, daysToPay);
  const cardDue = accounts.find(a => a.id === "acc_card")?.statement_due_date;
  const end = cardDue && cardDue > nextPay ? cardDue : nextPay;
  const events = await cashflow(db, sid, onDate, end);
  let balance = chequing.balance_cents - (fromAccount === "acc_chequing" ? amount : 0);
  let lowest = balance;
  let lowestDate = onDate;
  for (const event of events) {
    balance += event.amount_cents;
    if (balance < lowest) {
      lowest = balance;
      lowestDate = event.date;
    }
  }
  const available = fromAccount === "acc_chequing"
    ? lowest + amount - RULE_LIMITS.min_buffer_cents : source.balance_cents;
  let verdict: AffordabilityResult["verdict"] = "comfortable";
  if (lowest < 0 || (fromAccount !== "acc_chequing" && source.balance_cents < amount)) {
    verdict = "not_now";
  } else if (lowest < RULE_LIMITS.min_buffer_cents) {
    verdict = "tight";
  }
  return {
    verdict, lowest_balance_cents: lowest, lowest_balance_date: lowestDate,
    max_comfortable_cents: Math.max(0, available), upcoming_considered: events,
  };
}
