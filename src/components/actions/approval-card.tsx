"use client";

// The approval card. Each state has its own frame so it reads at a glance:
//   proposed   plain card            blocked    red edge bar
//   pending    violet ring + timer   executed   green ring, check draws in, one settle pulse
//   cancelled  light red border, amount struck through, "Nothing moved."
// Without handlers it renders as a static preview (the design page).
import { useState } from "react";
import type { ActionCard, CheckResult } from "../../contracts";
import { money } from "../../lib/format";
import { AlertIcon, ArrowIcon, CheckIcon, ClockIcon, CrossIcon, UndoIcon } from "../ui/icons";
import { UndoRing } from "../ui/live-bits";

export interface CardHandlers {
  onApprove?: () => void;
  onDismiss?: () => void;
  onUndo?: () => void;
  onExecuteNow?: () => void;
  onConfirmRecipient?: (email: string) => void;
  onUseInstead?: (amountCents: number) => void;
  /** The undo window ended on the client clock; the app asks the server to settle. */
  onWindowElapsed?: () => void;
}

const FRAME: Record<string, string> = {
  proposed: "border border-border",
  confirm: "border border-border",
  blocked: "border border-border border-l-[5px] border-l-blocked",
  pending_undo: "border-2 border-pending",
  executed: "border-2 border-gain coin-executed",
  cancelled: "border-2 border-loss-border bg-loss-soft",
};

type CardState = keyof typeof FRAME;

function stateOf(card: ActionCard): CardState {
  if (card.status === "proposed" && card.requires_second_confirmation && !card.second_confirmed) {
    return "confirm";
  }
  return card.status;
}

const STATUS: Record<CardState, { tone: string; icon: React.ReactNode; text: string }> = {
  proposed: { tone: "text-muted", icon: null, text: "Ready for your approval" },
  confirm: { tone: "text-warning", icon: <AlertIcon />, text: "New recipient: confirm first" },
  blocked: { tone: "text-blocked", icon: <CrossIcon />, text: "Blocked by a check" },
  pending_undo: { tone: "text-pending", icon: <ClockIcon />, text: "Approved. You can still undo" },
  executed: { tone: "text-gain", icon: null, text: "Done" },
  cancelled: { tone: "text-loss", icon: <UndoIcon />, text: "Cancelled" },
};

function StatusLine({ state }: { state: CardState }) {
  const { tone, icon, text } = STATUS[state];
  return (
    <p className={`flex items-center gap-1.5 text-sm font-bold ${tone}`}>
      {icon}
      {text}
    </p>
  );
}

function ExecutedBadge() {
  return (
    <div className="coin-check-badge grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gain" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="var(--accent-ink)" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round">
        <path className="coin-check-path" d="M5.5 12.5l4 4 9-9" />
      </svg>
    </div>
  );
}

/** "... I can do up to $X." / "Up to $X.": dropped when the card offers that amount as a button. */
const OFFER_SENTENCE = /\s*(I can do up|Up) to \$[\d,]+(\.\d{2})?\.?\s*$/;

/** Only what broke or needs attention. When nothing did, one quiet line. */
function CheckList({ checks, offersAmount }: { checks: CheckResult[]; offersAmount: boolean }) {
  const problems = checks.filter((c) => c.outcome === "fail" || c.outcome === "flag");

  if (problems.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-sm font-semibold text-subtle">
        <CheckIcon className="h-3.5 w-3.5 text-gain" />
        Checks passed
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
      {problems.map((check) => (
        <p
          key={check.rule}
          className={`flex items-start gap-2 font-semibold ${check.outcome === "fail" ? "text-blocked" : "text-warning"}`}
        >
          <span className="mt-0.5">{check.outcome === "fail" ? <CrossIcon /> : <AlertIcon />}</span>
          <span>{offersAmount && check.outcome === "fail" ? check.message?.replace(OFFER_SENTENCE, "") : check.message}</span>
        </p>
      ))}
    </div>
  );
}

function RecipientConfirmation({ name, onEmail }: { name: string; onEmail: (email: string) => void }) {
  return (
    <div className="mt-4 rounded-coin-sm bg-warning-soft p-3">
      <label className="text-sm font-bold text-foreground">
        {name}&rsquo;s email
        <input
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          onChange={(event) => onEmail(event.target.value)}
          className="mt-1.5 block w-full rounded-coin-sm border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-foreground placeholder:text-subtle"
        />
      </label>
    </div>
  );
}

const PRIMARY = "rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-ink disabled:opacity-50";
const SECONDARY = "rounded-full border border-border-strong px-5 py-2.5 text-sm font-bold text-foreground disabled:opacity-50";

function Actions(props: { card: ActionCard; state: CardState; email: string; busy: boolean } & CardHandlers) {
  const { card, state, email, busy } = props;

  if (state === "proposed" || state === "confirm") {
    const confirming = state === "confirm";
    const primaryClick = confirming ? () => props.onConfirmRecipient?.(email) : props.onApprove;
    return (
      <>
        <button type="button" className={PRIMARY} disabled={busy || (confirming && !email)} onClick={primaryClick}>
          {confirming ? "Confirm new recipient" : "Approve"}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={props.onDismiss}>
          Dismiss
        </button>
      </>
    );
  }
  if (state === "blocked" && card.max_passing_amount_cents !== null) {
    const amount = card.max_passing_amount_cents;
    return (
      <button type="button" className={`money ${PRIMARY}`} disabled={busy} onClick={() => props.onUseInstead?.(amount)}>
        Use {money(amount)} instead
      </button>
    );
  }
  if (state === "pending_undo") {
    return (
      <>
        <button type="button" className={`${SECONDARY} border-pending text-pending`} disabled={busy} onClick={props.onUndo}>
          Undo
        </button>
        <button type="button" className={PRIMARY} disabled={busy} onClick={props.onExecuteNow}>
          Execute now
        </button>
      </>
    );
  }
  return null;
}

function Amount({ card, state }: { card: ActionCard; state: CardState }) {
  const value = card.amount_cents !== null ? money(card.amount_cents) : "—";
  if (state === "cancelled") {
    return <p className="money mt-3 inline-block text-3xl font-extrabold tracking-tight text-subtle coin-struck">{value}</p>;
  }
  return <p className="money mt-3 text-3xl font-extrabold tracking-tight">{value}</p>;
}

function Outcome({ card, state }: { card: ActionCard; state: CardState }) {
  if (state === "executed" && card.balance_after_cents !== null) {
    return (
      <p className="money mt-2 text-sm font-semibold text-gain">
        {card.from_label} is now {money(card.balance_after_cents)}.
      </p>
    );
  }
  if (state === "cancelled") {
    return <p className="mt-2 text-sm font-bold text-loss">Nothing moved. Your balances are unchanged.</p>;
  }
  if (card.balance_after_cents !== null) {
    return (
      <p className="money mt-1 text-sm font-semibold text-muted">
        {card.from_label} after: {money(card.balance_after_cents)}
      </p>
    );
  }
  return null;
}

export function ApprovalCard({
  card,
  busy = false,
  error = null,
  ...handlers
}: { card: ActionCard; busy?: boolean; error?: string | null } & CardHandlers) {
  const [email, setEmail] = useState("");
  const state = stateOf(card);
  const showChecks = state === "proposed" || state === "confirm" || state === "blocked";
  const recipientName = (card.to_label ?? "this person").replace(/\s*\(new recipient\)$/, "");

  return (
    <article className={`rounded-coin bg-surface p-5 shadow-coin ${FRAME[state]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusLine state={state} />
          <h4 className="mt-1.5 text-lg font-extrabold leading-snug">{card.title}</h4>
        </div>
        {state === "pending_undo" && <UndoRing executeAt={card.execute_at} onElapsed={handlers.onWindowElapsed} />}
        {state === "executed" && <ExecutedBadge />}
      </div>

      <Amount card={card} state={state} />
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
        {card.from_label}
        <ArrowIcon />
        {card.to_label}
      </p>
      <Outcome card={card} state={state} />

      {state === "confirm" && <RecipientConfirmation name={recipientName} onEmail={setEmail} />}
      {showChecks && (
        <CheckList checks={card.checks} offersAmount={state === "blocked" && card.max_passing_amount_cents !== null} />
      )}
      {error && <p className="mt-3 text-sm font-bold text-loss">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2 empty:hidden">
        <Actions card={card} state={state} email={email} busy={busy} {...handlers} />
      </div>
    </article>
  );
}

/** Static preview for the design page. */
export function ApprovalCardPreview({ card }: { card: ActionCard }) {
  return <ApprovalCard card={card} />;
}
