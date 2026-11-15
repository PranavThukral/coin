import { AppError } from "../errors";
import {
  CARD_BILL_ID, ConfirmRecipientBody, normalizeProposal, Proposal, RULE_LIMITS,
  type ActionCard, type ActionStatus, type ActionType, type CheckResult, type RuleEvaluation,
  type RuleContext,
} from "../../contracts";
import type { Db, Tx } from "../db/types";
import { evaluateRules } from "../rules";
import { dailyOutflow, loadRuleContext } from "./context";
import { settleOne } from "./executor";
import { actionTitle } from "./titles";

export type ActionRow = {
  id: string;
  session_id: string;
  request_message_id: string;
  type: ActionType;
  payload: unknown;
  status: ActionStatus;
  checks: CheckResult[];
  primary_message: string | null;
  requires_second_confirmation: boolean;
  second_confirmed_at: string | null;
  created_at: string;
  execute_at: string | null;
  executed_at: string | null;
  origin: "message" | "plan";
};

export async function lockSession(db: Tx, sessionId: string): Promise<void> {
  const rows = await db.query(
    "select id from sessions where id = $1 and not is_template for update", [sessionId],
  );
  if (!rows.length) throw new AppError("not_found", "Session not found");
}

export async function getAction(
  db: Tx, sessionId: string, actionId: string, lock = false,
): Promise<ActionRow> {
  const suffix = lock ? " for update" : "";
  const rows = await db.query<ActionRow>(
    `select * from actions where session_id = $1 and id = $2${suffix}`, [sessionId, actionId],
  );
  if (!rows[0]) throw new AppError("not_found", "Action not found");
  return rows[0];
}

export async function audit(
  db: Tx, sessionId: string, actionId: string, actor: string, event: string,
): Promise<void> {
  await db.query(
    "insert into audit_log (session_id, action_id, actor, event) values ($1, $2, $3, $4)",
    [sessionId, actionId, actor, event],
  );
}

function maxima(
  checks: CheckResult[],
): Pick<ActionCard, "max_passing_amount_cents" | "max_passing_quantity"> {
  const failures = checks.filter((check) => check.outcome === "fail");
  const amounts = failures.map((check) => check.max_passing_amount_cents);
  const quantities = failures.map((check) => check.max_passing_quantity)
    .filter((n): n is number => n !== null);
  const maxAmount = amounts.length && amounts.every((n) => n !== null)
    ? Math.min(...amounts as number[]) : null;
  return {
    max_passing_amount_cents: maxAmount,
    max_passing_quantity: quantities.length ? Math.min(...quantities) : null,
  };
}

type ActionProposal = Proposal;

function destinationFor(p: ActionProposal, context: RuleContext): string {
  if (p.type === "transfer") {
    return context.accounts.find((a) => a.id === p.to_account_id)?.name ?? p.to_account_id;
  }
  if (p.type === "bill_payment") return context.bills.find((b) => b.id === p.bill_id)?.payee ?? p.bill_id;
  if (p.type === "trade") return p.ticker;
  if (p.recipient.kind === "new") return p.recipient.name;
  const id = p.recipient.contact_id;
  return context.contacts.find((contact) => contact.id === id)?.name ?? id;
}


function balanceAfter(
  p: ActionProposal | null, amount: number | null, balance: number | undefined, status: ActionStatus,
): number | null {
  if (!p || amount === null || balance === undefined) return null;
  if (status === "executed") return balance;
  if (p.type === "trade" && p.side === "sell") return balance + amount;
  return balance - amount;
}

/** The user's own account the money lands in (the card owed, or the receiving account), before and after. */
function destinationBalance(
  p: ActionProposal | null, amount: number | null, context: RuleContext, status: ActionStatus,
): ActionCard["destination"] {
  if (!p || amount === null || status === "executed") return null;
  const paysCard = p.type === "bill_payment" && p.bill_id === CARD_BILL_ID;
  let accountId: string | null = paysCard ? "acc_card" : null;
  if (p.type === "transfer") accountId = p.to_account_id;
  const account = context.accounts.find((a) => a.id === accountId);
  if (!account) return null;
  // The card's balance is what is owed, so a payment brings it down.
  const after = paysCard ? account.balance_cents - amount : account.balance_cents + amount;
  return { label: account.name, before_cents: account.balance_cents, after_cents: after };
}

export async function toActionCard(db: Tx, sessionId: string, action: ActionRow): Promise<ActionCard> {
  const parsed = Proposal.safeParse(action.payload);
  const waiting = action.status === "proposed" || action.status === "pending_undo";
  const context = await loadRuleContext(db, sessionId, action.request_message_id, {
    actionId: action.id, withPlannedProceeds: waiting,
  });
  const p = parsed.success ? parsed.data : null;
  const fromId = p && (p.type === "trade" ? p.account_id : p.from_account_id);
  const from = context.accounts.find((account) => account.id === fromId);
  const to = p ? destinationFor(p, context) : null;
  let amount: number | null = null;
  if (p) amount = p.type === "trade" ? p.quantity * p.price_cents : p.amount_cents;
  return {
    action_id: action.id, type: action.type, status: action.status,
    title: actionTitle(p, action.status, to), amount_cents: amount,
    from_label: from?.name ?? null, to_label: to,
    balance_after_cents: balanceAfter(p, amount, from?.balance_cents, action.status),
    checks: action.checks, requires_second_confirmation: action.requires_second_confirmation,
    second_confirmed: action.second_confirmed_at !== null, ...maxima(action.checks),
    primary_message: action.primary_message, created_at: action.created_at,
    execute_at: action.execute_at, executed_at: action.executed_at,
    daily_outflow: await dailyOutflow(db, sessionId),
    origin: action.origin,
    destination: destinationBalance(p, amount, context, action.status),
  };
}

async function saveEvaluation(
  db: Tx, sessionId: string, id: string, evaluation: RuleEvaluation,
): Promise<void> {
  await db.query(
    `update actions set checks = $3, primary_message = $4, requires_second_confirmation = $5
     where session_id = $1 and id = $2`,
    [sessionId, id, JSON.stringify(evaluation.checks), evaluation.primary_message,
      evaluation.requires_second_confirmation],
  );
}

export async function proposeAction(
  db: Db, sessionId: string, requestMessageId: string, raw: unknown, origin: "message" | "plan" = "message",
): Promise<ActionCard> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const context = await loadRuleContext(tx, sessionId, requestMessageId, { origin, withPlannedProceeds: true });
    const normalized = normalizeProposal(raw, (ticker) => context.prices[ticker] ?? null);
    const evaluation = normalized.ok ? evaluateRules(normalized.proposal, context) : null;
    const type = normalized.ok ? normalized.proposal.type : "transfer";
    const payload = normalized.ok ? normalized.proposal : {};
    const status = evaluation?.allowed ? "proposed" : "blocked";
    const message = normalized.ok
      ? evaluation?.primary_message : `Malformed proposal: ${normalized.issues.join("; ")}`;
    const [row] = await tx.query<ActionRow>(
      `insert into actions (session_id, request_message_id, type, payload, status, checks,
       primary_message, requires_second_confirmation, origin)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [sessionId, requestMessageId, type, JSON.stringify(payload), status,
        JSON.stringify(evaluation?.checks ?? []), message,
        evaluation?.requires_second_confirmation ?? false, origin],
    );
    await audit(tx, sessionId, row.id, "coin", status);
    return toActionCard(tx, sessionId, row);
  });
}

export async function confirmRecipient(
  db: Db, sessionId: string, actionId: string, email: string,
): Promise<ActionCard> {
  const validated = ConfirmRecipientBody.parse({ email }).email;
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const row = await getAction(tx, sessionId, actionId, true);
    const p = Proposal.parse(row.payload);
    if (row.status !== "proposed" || !row.requires_second_confirmation
      || p.type !== "etransfer" || p.recipient.kind !== "new") {
      throw new AppError("conflict", "This action does not need a recipient confirmation");
    }
    p.recipient.email = validated;
    const context = await loadRuleContext(tx, sessionId, row.request_message_id, { actionId: row.id });
    context.confirmed_recipient_email = validated;
    const evaluation = evaluateRules(p, context);
    await tx.query(
      `update actions set payload = $3, second_confirmed_at = now()
       where session_id = $1 and id = $2 and status = 'proposed'`,
      [sessionId, actionId, JSON.stringify(p)],
    );
    await saveEvaluation(tx, sessionId, actionId, evaluation);
    await audit(tx, sessionId, actionId, "user", "confirmed_recipient");
    return toActionCard(tx, sessionId, await getAction(tx, sessionId, actionId));
  });
}

export async function approve(db: Db, sessionId: string, actionId: string, now: Date): Promise<ActionCard> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const row = await getAction(tx, sessionId, actionId, true);
    if (row.status !== "proposed") throw new AppError("conflict", "This action is no longer waiting for approval");
    const context = await loadRuleContext(tx, sessionId, row.request_message_id, {
      actionId: row.id, withPlannedProceeds: true,
    });
    const evaluation = evaluateRules(Proposal.parse(row.payload), context);
    if (!evaluation.allowed || (evaluation.requires_second_confirmation && !row.second_confirmed_at)) {
      throw new AppError("conflict", evaluation.primary_message ?? "Confirm the new recipient first");
    }
    await saveEvaluation(tx, sessionId, actionId, evaluation);
    const executeAt = new Date(now.getTime() + RULE_LIMITS.undo_window_seconds * 1000);
    const updated = await tx.query<ActionRow>(
      `update actions set status = 'pending_undo', approved_at = $3, execute_at = $4
       where session_id = $1 and id = $2 and status = 'proposed' returning *`,
      [sessionId, actionId, now.toISOString(), executeAt.toISOString()],
    );
    if (!updated.length) throw new AppError("conflict", "This action is no longer waiting for approval");
    await audit(tx, sessionId, actionId, "user", "approved");
    return toActionCard(tx, sessionId, updated[0]);
  });
}

export async function undo(db: Db, sessionId: string, actionId: string): Promise<ActionCard> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    await getAction(tx, sessionId, actionId, true);
    const rows = await tx.query<ActionRow>(
      `update actions set status = 'cancelled', cancelled_at = now()
       where session_id = $1 and id = $2 and status = 'pending_undo' returning *`,
      [sessionId, actionId],
    );
    if (!rows.length) throw new AppError("conflict", "This action is no longer waiting to execute");
    await audit(tx, sessionId, actionId, "user", "undone");
    return toActionCard(tx, sessionId, rows[0]);
  });
}

export async function dismiss(db: Db, sessionId: string, actionId: string): Promise<ActionCard> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    await getAction(tx, sessionId, actionId, true);
    const rows = await tx.query<ActionRow>(
      `update actions set status = 'cancelled', cancelled_at = now()
       where session_id = $1 and id = $2 and status = 'proposed' returning *`,
      [sessionId, actionId],
    );
    if (!rows.length) throw new AppError("conflict", "This action is no longer waiting for approval");
    await audit(tx, sessionId, actionId, "user", "dismissed");
    return toActionCard(tx, sessionId, rows[0]);
  });
}

export async function executeNow(
  db: Db, sessionId: string, actionId: string, now: Date,
): Promise<ActionCard> {
  return settleOne(db, sessionId, actionId, now);
}

export const SETTLEMENT_FAILED_MESSAGE = "Coin couldn't complete this, so nothing moved. Ask again to retry.";

/**
 * Settlement threw, so its transaction rolled back and nothing moved. The
 * action is closed as blocked: settlement runs at the start of every request,
 * and one action that keeps failing would otherwise fail all of them.
 */
async function closeFailedSettlement(db: Db, sessionId: string, actionId: string): Promise<ActionCard | null> {
  return db.transaction(async (tx) => {
    const rows = await tx.query<ActionRow>(
      `update actions set status = 'blocked', blocked_at_execution = true, primary_message = $3
       where session_id = $1 and id = $2 and status = 'pending_undo' returning *`,
      [sessionId, actionId, SETTLEMENT_FAILED_MESSAGE],
    );
    if (!rows.length) return null;
    await audit(tx, sessionId, actionId, "system", "blocked_at_execution");
    return toActionCard(tx, sessionId, rows[0]);
  });
}

export async function settleDueActions(db: Db, sessionId: string, now: Date): Promise<ActionCard[]> {
  const rows = await db.query<{ id: string }>(
    `select id from actions where session_id = $1 and status = 'pending_undo'
     and execute_at <= $2 order by execute_at, id`, [sessionId, now.toISOString()],
  );
  const cards: ActionCard[] = [];
  for (const row of rows) {
    let card: ActionCard | null;
    try {
      card = await settleOne(db, sessionId, row.id, now);
    } catch (error) {
      console.error("Settling an action failed", row.id, error);
      card = await closeFailedSettlement(db, sessionId, row.id);
    }
    if (card) cards.push(card);
  }
  return cards;
}

/** This session's action cards, newest first, optionally filtered by status. */
export async function listActions(
  db: Db, sessionId: string, status: ActionStatus | null,
): Promise<ActionCard[]> {
  const rows = await db.query<ActionRow>(
    `select * from actions where session_id = $1 and ($2::text is null or status = $2)
     order by created_at desc, id desc limit 50`,
    [sessionId, status],
  );
  const cards: ActionCard[] = [];
  for (const row of rows) cards.push(await toActionCard(db, sessionId, row));
  return cards;
}
