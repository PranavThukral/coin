"use client";

// The approval card. A three-step trail across the top shows what has
// happened so far (checked, approved, done) and fills in as the action moves;
// each state also has its own tint so it reads at a glance:
//   proposed   neutral               blocked    red trail, the check that broke
//   pending    accent ring + timer   executed   green, check draws in, one settle pulse
//   cancelled  amount struck through, "Nothing moved."
// When the state changes, the card's content settles in again.
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

type CardState = "proposed" | "confirm" | "offer" | "blocked" | "pending_undo" | "executed" | "cancelled";

/** The largest amount that passes, when a smaller amount is all that stands in the way. */
function offeredAmount(card: ActionCard): number | null {
  const offer = card.max_passing_amount_cents;
  return card.status === "blocked" && offer !== null && offer > 0 ? offer : null;
}

function stateOf(card: ActionCard): CardState {
  if (card.status === "proposed" && card.requires_second_confirmation && !card.second_confirmed) {
    return "confirm";
  }
  // Not a refusal: the full amount doesn't fit, a smaller one does.
  if (offeredAmount(card) !== null) return "offer";
  return card.status;
}

const FRAME: Record<CardState, string> = {
  proposed: "border-transparent",
  confirm: "border-transparent",
  offer: "border-transparent",
  blocked: "border-transparent",
  pending_undo: "border-pending",
  executed: "border-gain coin-executed",
  cancelled: "border-transparent",
};

interface Look {
  /** Chip colours. */
  chip: string;
  icon: React.ReactNode;
  text: string;
  /** How many of the three trail steps are finished, and in which colour. */
  steps: number;
  bar: string;
}

const LOOK: Record<CardState, Look> = {
  proposed: { chip: "bg-border/70 text-muted", icon: <CheckIcon />, text: "Checked. Ready for you", steps: 1, bar: "bg-accent" },
  confirm: { chip: "bg-warning-soft text-warning", icon: <AlertIcon />, text: "New recipient: confirm first", steps: 1, bar: "bg-warning" },
  offer: { chip: "bg-accent-soft text-accent-text", icon: <AlertIcon />, text: "The full amount doesn’t fit. This does", steps: 1, bar: "bg-accent" },
  blocked: { chip: "bg-loss-soft text-blocked", icon: <CrossIcon />, text: "Blocked by a check", steps: 1, bar: "bg-blocked" },
  pending_undo: { chip: "bg-pending-soft text-pending", icon: <ClockIcon />, text: "Approved. You can still undo", steps: 2, bar: "bg-pending" },
  executed: { chip: "bg-gain-soft text-gain", icon: <CheckIcon />, text: "Done", steps: 3, bar: "bg-gain" },
  cancelled: { chip: "bg-loss-soft text-loss", icon: <UndoIcon />, text: "Cancelled", steps: 2, bar: "bg-border-strong" },
};

const TRAIL = ["Checked", "Approved", "Done"];

/** Checked, approved, done: finished steps fill in one after another. */
function Trail({ state }: { state: CardState }) {
  const look = LOOK[state];
  return (
    <ol className="flex gap-1.5" aria-label={`Step ${look.steps} of ${TRAIL.length}: ${look.text}`}>
      {TRAIL.map((name, index) => (
        <li key={name} className="h-1 flex-1 overflow-hidden rounded-full bg-border">
          {index < look.steps && (
            <span className={`coin-fill block h-full rounded-full transition-colors duration-500 ${look.bar}`} style={{ "--i": index } as React.CSSProperties} />
          )}
        </li>
      ))}
    </ol>
  );
}

function StatusChip({ state }: { state: CardState }) {
  const look = LOOK[state];
  return (
    <p className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${look.chip}`}>
      {look.icon}
      {look.text}
    </p>
  );
}

function ExecutedBadge() {
  return (
    <div className="coin-check-badge grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gain" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="var(--surface)" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round">
        <path className="coin-check-path" d="M5.5 12.5l4 4 9-9" />
      </svg>
    </div>
  );
}

/** "... I can do up to $X." / "Up to $X.": dropped when the card offers that amount as a button. */
const OFFER_SENTENCE = /\s*(I can do up|Up) to \$[\d,]+(\.\d{2})?\.?\s*$/;

const UNREADABLE_REQUEST = "Coin's request was incomplete, so there is nothing to approve. Ask again.";

/** Why a card is blocked when no single check failed: Coin's request couldn't be read, or settling it went wrong. */
function blockedReasonOf(card: ActionCard): string {
  if (card.amount_cents === null) return UNREADABLE_REQUEST;
  return card.primary_message ?? "Blocked when it was checked again. Nothing moved.";
}

function Problem({ tone, icon, index, children }: {
  tone: string;
  icon: React.ReactNode;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`coin-rise flex items-start gap-2 rounded-coin-sm px-3 py-2.5 text-sm font-semibold ${tone}`}
      style={{ "--i": index + 2 } as React.CSSProperties}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

/** Only what broke or needs attention. When nothing did, the chip already says so. */
function CheckList({
  checks,
  offersAmount,
  blockedReason,
}: {
  checks: CheckResult[];
  offersAmount: boolean;
  blockedReason: string | null;
}) {
  const problems = checks.filter((c) => c.outcome === "fail" || c.outcome === "flag");

  if (problems.length === 0 && blockedReason) {
    return (
      <div className="mt-4">
        <Problem tone="bg-loss-soft text-blocked" icon={<CrossIcon />} index={0}>
          {blockedReason}
        </Problem>
      </div>
    );
  }
  if (problems.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {problems.map((check, index) => {
        const failed = check.outcome === "fail";
        const message = offersAmount && failed ? check.message?.replace(OFFER_SENTENCE, "") : check.message;
        return (
          <Problem
            key={check.rule}
            tone={failed && !offersAmount ? "bg-loss-soft text-blocked" : "bg-warning-soft text-warning"}
            icon={failed && !offersAmount ? <CrossIcon /> : <AlertIcon />}
            index={index}
          >
            {message}
          </Problem>
        );
      })}
    </div>
  );
}

function RecipientConfirmation({ name, onEmail }: { name: string; onEmail: (email: string) => void }) {
  return (
    <div className="mt-4 rounded-coin-sm bg-surface-soft p-3">
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

// Buttons share the row evenly and wrap onto their own lines when the panel is narrow.
const BUTTON = "min-w-[7.5rem] flex-1 whitespace-nowrap rounded-full px-5 py-2.5 text-center text-sm font-extrabold transition-transform active:scale-[0.97] disabled:opacity-50";
const PRIMARY = `${BUTTON} bg-accent text-accent-ink shadow-coin-accent hover:bg-accent-strong`;
const SECONDARY = `${BUTTON} bg-border/70 text-foreground hover:bg-border`;

function Actions(props: { card: ActionCard; state: CardState; email: string; busy: boolean } & CardHandlers) {
  const { card, state, email, busy } = props;

  if (state === "proposed" || state === "confirm") {
    const confirming = state === "confirm";
    const primaryClick = confirming ? () => props.onConfirmRecipient?.(email) : props.onApprove;
    return (
      <>
        <button type="button" className={PRIMARY} disabled={busy || (confirming && !email)} onClick={primaryClick}>
          {confirming ? "Confirm recipient" : "Approve"}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={props.onDismiss}>
          Dismiss
        </button>
      </>
    );
  }
  const offer = offeredAmount(card);
  if (state === "offer" && offer !== null) {
    return (
      <button type="button" className={PRIMARY} disabled={busy} onClick={() => props.onUseInstead?.(offer)}>
        {card.type === "bill_payment" ? "Pay this amount" : "Use this amount"}
      </button>
    );
  }
  if (state === "pending_undo") {
    return (
      <>
        <button type="button" className={SECONDARY} disabled={busy} onClick={props.onUndo}>
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
  const shown = state === "offer" ? offeredAmount(card) : card.amount_cents;
  const value = shown !== null ? money(shown) :"\u2014";
  const size = "money mt-4 text-4xl font-extrabold leading-none tracking-[-0.03em]";
  if (state === "cancelled") {
    return <p className={`${size} inline-block text-subtle coin-struck`}>{value}</p>;
  }
  return <p className={size}>{value}</p>;
}

function Route({ card }: { card: ActionCard }) {
  if (!card.from_label && !card.to_label) return null;
  // The balance change below already names where the money lands.
  if (card.destination) {
    return <p className="mt-3 text-sm font-bold text-muted">From {card.from_label}</p>;
  }
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-muted">
      <span>{card.from_label}</span>
      <ArrowIcon className="h-3.5 w-3.5 text-subtle" />
      <span>{card.to_label}</span>
    </p>
  );
}

/** "Rewards Credit Card  $4,912.38 -> $2,572.26": what the receiving balance becomes. */
function DestinationChange({ card, state }: { card: ActionCard; state: CardState }) {
  const destination = card.destination;
  if (!destination || state === "cancelled" || state === "blocked") return null;
  const offer = state === "offer" ? offeredAmount(card) : null;
  const direction = destination.after_cents < destination.before_cents ? -1 : 1;
  const after = offer === null ? destination.after_cents : destination.before_cents + direction * offer;
  return (
    <div className="mt-3 rounded-coin-sm bg-surface-soft px-3 py-2.5">
      <p className="text-xs font-bold text-subtle">{destination.label}</p>
      <p className="money mt-0.5 flex items-center gap-2 whitespace-nowrap text-sm font-bold">
        <span className="text-subtle line-through decoration-1">{money(destination.before_cents)}</span>
        <ArrowIcon className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="text-base text-foreground">{money(after)}</span>
      </p>
    </div>
  );
}

function Outcome({ card, state }: { card: ActionCard; state: CardState }) {
  if (state === "offer" && card.amount_cents !== null) {
    return <p className="money mt-1 text-sm font-semibold text-subtle">You asked for {money(card.amount_cents)}.</p>;
  }
  if (state === "executed" && card.balance_after_cents !== null) {
    return (
      <p className="money mt-2 text-sm font-bold text-gain">
        {card.from_label} is now {money(card.balance_after_cents)}.
      </p>
    );
  }
  if (state === "cancelled") {
    return <p className="mt-2 text-sm font-bold text-loss">Nothing moved. Your balances are unchanged.</p>;
  }
  if (card.balance_after_cents !== null) {
    return (
      <p className="money mt-1 text-sm font-semibold text-subtle">
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
  const showChecks = state === "proposed" || state === "confirm" || state === "offer" || state === "blocked";
  const recipientName = (card.to_label ?? "this person").replace(/\s*\(new recipient\)$/, "");

  return (
    <article className={`coin-rise rounded-coin border-2 bg-surface-raised p-5 shadow-coin-float transition-colors duration-500 ${FRAME[state]}`}>
      <Trail state={state} />
      {/* Keyed by state, so each change of state settles in afresh. */}
      <div key={state} className="coin-swap">
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusChip state={state} />
            <h4 className="mt-3 text-lg font-extrabold leading-snug tracking-tight">{card.title}</h4>
          </div>
          {state === "pending_undo" && <UndoRing executeAt={card.execute_at} onElapsed={handlers.onWindowElapsed} />}
          {state === "executed" && <ExecutedBadge />}
        </div>

        <Amount card={card} state={state} />
        <Route card={card} />
        <Outcome card={card} state={state} />
        <DestinationChange card={card} state={state} />

        {state === "confirm" && <RecipientConfirmation name={recipientName} onEmail={setEmail} />}
        {showChecks && (
          <CheckList
            checks={card.checks}
            offersAmount={state === "offer"}
            blockedReason={state === "blocked" ? blockedReasonOf(card) : null}
          />
        )}
        {error && <p className="mt-3 text-sm font-bold text-loss">{error}</p>}

        <div className="mt-5 flex flex-wrap gap-2 empty:hidden">
          <Actions card={card} state={state} email={email} busy={busy} {...handlers} />
        </div>
      </div>
    </article>
  );
}

/** Static preview for the design page. */
export function ApprovalCardPreview({ card }: { card: ActionCard }) {
  return <ApprovalCard card={card} />;
}
