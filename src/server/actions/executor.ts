// Settlement locks the session and action, then locks the accounts involved.
// It reloads the current state and checks the rules again under those locks.
// If the checks pass, it applies the ledger and related balance changes.
// It conditionally changes the action from pending to executed or blocked.
// A lost status update throws, rolling back all changes in the transaction.
import { CARD_BILL_ID, Proposal, type ActionCard, type Proposal as ActionProposal } from "../../contracts";
import type { Db, Tx } from "../db/types";
import { tradeDescription } from "../ledger-format";
import { evaluateRules } from "../rules";
import { loadRuleContext } from "./context";
import { audit, getAction, lockSession, toActionCard, type ActionRow } from "./service";

type LedgerEntry = {
  account: string;
  amount: number;
  kind: string;
  category: string;
  label: string;
  /** Defaults to the label. */
  description?: string;
  group: string | null;
};

async function ledger(
  tx: Tx, sessionId: string, actionId: string, today: string, entries: LedgerEntry[],
): Promise<void> {
  for (const [index, entry] of entries.entries()) {
    await tx.query(
      `insert into transactions (session_id, id, account_id, posted_on, amount_cents, merchant,
       description, category, kind, transfer_group_id, action_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [sessionId, `txn_act_${actionId.slice(0, 8)}_${index + 1}`, entry.account, today,
        entry.amount, entry.label, entry.description ?? entry.label, entry.category, entry.kind,
        entry.group, actionId],
    );
  }
}

async function changeBalance(tx: Tx, sessionId: string, account: string, delta: number): Promise<void> {
  await tx.query(
    "update accounts set balance_cents = balance_cents + $3 where session_id = $1 and id = $2",
    [sessionId, account, delta],
  );
}

async function transfer(
  tx: Tx, sid: string, id: string, today: string, p: Extract<ActionProposal, { type: "transfer" }>,
): Promise<void> {
  await changeBalance(tx, sid, p.from_account_id, -p.amount_cents);
  await changeBalance(tx, sid, p.to_account_id, p.amount_cents);
  await tx.query(`update room set room_remaining_cents = room_remaining_cents - $3 where session_id = $1
    and account_type = (select type from accounts where session_id = $1 and id = $2)
    and year = extract(year from $4::date)`, [sid, p.to_account_id, p.amount_cents, today]);
  await ledger(tx, sid, id, today, [
    { account: p.from_account_id, amount: -p.amount_cents, kind: "transfer_out",
      category: "transfers", label: "Account transfer", group: id },
    { account: p.to_account_id, amount: p.amount_cents, kind: "transfer_in",
      category: "transfers", label: "Account transfer", group: id },
  ]);
}

async function payment(
  tx: Tx, sid: string, id: string, today: string, p: Extract<ActionProposal, { type: "bill_payment" }>,
): Promise<void> {
  const [bill] = await tx.query<{ payee: string; category: string }>(
    "select payee, category from bills where session_id = $1 and id = $2 for update", [sid, p.bill_id],
  );
  await changeBalance(tx, sid, p.from_account_id, -p.amount_cents);
  if (p.bill_id === CARD_BILL_ID) {
    await tx.query(`update accounts set balance_cents = balance_cents - $3,
      statement_balance_cents = greatest(0, statement_balance_cents - $3),
      statement_due_date = case when statement_balance_cents <= $3
        then (statement_due_date + interval '1 month')::date else statement_due_date end
      where session_id = $1 and id = $2`, [sid, "acc_card", p.amount_cents]);
    await tx.query(`update bills set
      amount_cents = (select statement_balance_cents from accounts
        where session_id = $1 and id = 'acc_card'),
      due_date = (select statement_due_date from accounts where session_id = $1 and id = 'acc_card')
      where session_id = $1 and id = $2`, [sid, p.bill_id]);
    await ledger(tx, sid, id, today, [
      { account: p.from_account_id, amount: -p.amount_cents, kind: "card_payment_out",
        category: "transfers", label: bill.payee, group: id },
      { account: "acc_card", amount: p.amount_cents, kind: "card_payment",
        category: "transfers", label: bill.payee, group: id },
    ]);
    return;
  }
  await tx.query(`update bills set due_date = case recurrence
    when 'monthly' then (due_date + interval '1 month')::date
    when 'quarterly' then (due_date + interval '3 months')::date
    when 'annual' then (due_date + interval '1 year')::date else due_date end
    where session_id = $1 and id = $2`, [sid, p.bill_id]);
  await ledger(tx, sid, id, today, [{ account: p.from_account_id, amount: -p.amount_cents,
    kind: "bill_payment", category: bill.category, label: bill.payee, group: null }]);
}

async function trade(
  tx: Tx, sid: string, id: string, today: string, p: Extract<ActionProposal, { type: "trade" }>,
): Promise<void> {
  const amount = p.quantity * p.price_cents;
  const delta = p.side === "buy" ? -amount : amount;
  await changeBalance(tx, sid, p.account_id, delta);
  if (p.side === "buy") {
    await tx.query(`insert into holdings (session_id, account_id, ticker, quantity, avg_cost_cents)
      values ($1, $2, $3, $4, $5)
      on conflict (session_id, account_id, ticker) do update set avg_cost_cents =
      round((holdings.quantity * holdings.avg_cost_cents
        + excluded.quantity * excluded.avg_cost_cents)::numeric
        / (holdings.quantity + excluded.quantity)),
      quantity = holdings.quantity + excluded.quantity`,
    [sid, p.account_id, p.ticker, p.quantity, p.price_cents]);
  } else {
    await tx.query(`update holdings set quantity = quantity - $4
      where session_id = $1 and account_id = $2 and ticker = $3`, [sid, p.account_id, p.ticker, p.quantity]);
  }
  await ledger(tx, sid, id, today, [{
    account: p.account_id,
    amount: delta,
    kind: `trade_${p.side}`,
    category: "investments",
    label: p.ticker,
    description: tradeDescription(p.side, p.quantity, p.ticker),
    group: null,
  }]);
}

async function applyEffects(
  tx: Tx, sid: string, id: string, today: string, p: ActionProposal,
): Promise<void> {
  if (p.type === "transfer") return transfer(tx, sid, id, today, p);
  if (p.type === "bill_payment") return payment(tx, sid, id, today, p);
  if (p.type === "trade") return trade(tx, sid, id, today, p);
  return etransfer(tx, sid, id, today, p);
}

async function etransfer(
  tx: Tx, sid: string, id: string, today: string, p: Extract<ActionProposal, { type: "etransfer" }>,
): Promise<void> {
  await changeBalance(tx, sid, p.from_account_id, -p.amount_cents);
  let name: string;
  if (p.recipient.kind === "new") {
    name = p.recipient.name;
  } else {
    const [contact] = await tx.query<{ name: string }>(
      "select name from contacts where session_id = $1 and id = $2",
      [sid, p.recipient.contact_id],
    );
    if (!contact) throw new Error("Contact not found");
    name = contact.name;
  }
  const label = `Interac e-Transfer to ${name}`;
  await ledger(tx, sid, id, today, [{ account: p.from_account_id, amount: -p.amount_cents,
    kind: "etransfer_out", category: "gifts_social", label, group: null }]);
}

function accountsTouchedBy(proposal: ActionProposal): string[] {
  if (proposal.type === "trade") return [proposal.account_id];
  if (proposal.type === "transfer") return [proposal.from_account_id, proposal.to_account_id];
  if (proposal.type === "bill_payment" && proposal.bill_id === CARD_BILL_ID) {
    return [proposal.from_account_id, "acc_card"];
  }
  return [proposal.from_account_id];
}

async function recordStatus(
  tx: Tx, sessionId: string, actionId: string, evaluation: ReturnType<typeof evaluateRules>,
  allowed: boolean, now: Date,
): Promise<ActionRow> {
  const status = allowed ? "executed" : "blocked";
  const message = evaluation.primary_message ?? (allowed ? null : "Recipient confirmation required");
  const rows = await tx.query<ActionRow>(`update actions set status = $3, checks = $4, primary_message = $5,
    blocked_at_execution = $6, executed_at = case when $3 = 'executed' then $7::timestamptz else null end
    where session_id = $1 and id = $2 and status = 'pending_undo' returning *`,
  [sessionId, actionId, status, JSON.stringify(evaluation.checks), message, !allowed, now.toISOString()]);
  if (!rows.length) throw new Error("Action settlement lost race");
  return rows[0];
}

export async function settleOne(
  db: Db, sessionId: string, actionId: string, now: Date,
): Promise<ActionCard> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const row = await getAction(tx, sessionId, actionId, true);
    if (row.status !== "pending_undo") return toActionCard(tx, sessionId, row);
    const proposal = Proposal.parse(row.payload);
    const ids = accountsTouchedBy(proposal);
    await tx.query(
      "select id from accounts where session_id = $1 and id = any($2::text[]) order by id for update",
      [sessionId, ids],
    );
    const context = await loadRuleContext(tx, sessionId, row.request_message_id, row.id);
    const evaluation = evaluateRules(proposal, context);
    const confirmed = !evaluation.requires_second_confirmation || row.second_confirmed_at !== null;
    const allowed = evaluation.allowed && confirmed;
    if (allowed) await applyEffects(tx, sessionId, actionId, context.today, proposal);
    const updated = await recordStatus(tx, sessionId, actionId, evaluation, allowed, now);
    await audit(tx, sessionId, actionId, "system", allowed ? "executed" : "blocked_at_execution");
    return toActionCard(tx, sessionId, updated);
  });
}
