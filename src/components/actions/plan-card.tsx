"use client";

// A sale plan: several steps the server's planner proposed for one request
// (each sale, then moving the proceeds), shown as one card and approved as
// one. Every step is still its own action underneath: each passes every rule
// when it is approved and again when it executes.
import type { ActionCard } from "../../contracts";
import { money } from "../../lib/format";
import { AlertIcon, CheckIcon, ClockIcon, CrossIcon, UndoIcon } from "../ui/icons";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../ui/buttons";
import { UndoRing } from "../ui/live-bits";

export interface PlanHandlers {
  onApprove: () => void;
  onDismiss: () => void;
  onUndo: () => void;
  onExecuteNow: () => void;
  onWindowElapsed: () => void;
}

type PlanState = "proposed" | "pending_undo" | "executed" | "cancelled" | "blocked" | "mixed";

function planStateOf(cards: ActionCard[]): PlanState {
  const statuses = new Set(cards.map((card) => card.status));
  if (statuses.size === 1) return cards[0].status;
  if (statuses.has("pending_undo")) return "pending_undo";
  if (statuses.has("proposed")) return "proposed";
  return "mixed";
}

const HEADLINE: Record<PlanState, { chip: string; icon: React.ReactNode; text: string; frame: string }> = {
  proposed: { chip: "bg-border/70 text-muted", icon: <CheckIcon />, text: "Checked. Ready for you", frame: "border-transparent" },
  pending_undo: { chip: "bg-pending-soft text-pending", icon: <ClockIcon />, text: "Approved. You can still undo", frame: "border-pending" },
  executed: { chip: "bg-gain-soft text-gain", icon: <CheckIcon />, text: "Done", frame: "border-gain coin-executed" },
  cancelled: { chip: "bg-loss-soft text-loss", icon: <UndoIcon />, text: "Cancelled. Nothing moved", frame: "border-transparent" },
  blocked: { chip: "bg-loss-soft text-blocked", icon: <CrossIcon />, text: "Blocked by a check", frame: "border-transparent" },
  mixed: { chip: "bg-warning-soft text-warning", icon: <AlertIcon />, text: "Finished, with steps that didn’t go through", frame: "border-transparent" },
};

const STEP_DOT: Record<ActionCard["status"], string> = {
  proposed: "bg-border-strong",
  pending_undo: "bg-pending",
  executed: "bg-gain",
  cancelled: "bg-border-strong",
  blocked: "bg-blocked",
};

function Step({ card, index }: { card: ActionCard; index: number }) {
  const struck = card.status === "cancelled" ? "text-subtle line-through" : "";
  return (
    <li className="coin-rise py-2.5" style={{ "--i": index + 2 } as React.CSSProperties}>
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-500 ${STEP_DOT[card.status]}`} />
        <span className={`min-w-0 flex-1 truncate text-sm font-bold ${struck}`}>{card.title}</span>
        <span className={`money shrink-0 text-sm font-extrabold ${struck}`}>
          {card.amount_cents === null ? "" : money(card.amount_cents)}
        </span>
      </div>
      {card.status === "blocked" && card.primary_message && (
        <p className="ml-5 mt-1 text-xs font-semibold text-blocked">{card.primary_message}</p>
      )}
    </li>
  );
}


function PlanActions({ state, busy, handlers }: { state: PlanState; busy: boolean; handlers: PlanHandlers }) {
  if (state === "proposed") {
    return (
      <>
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={handlers.onApprove}>
          Approve plan
        </button>
        <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={handlers.onDismiss}>
          Dismiss
        </button>
      </>
    );
  }
  if (state === "pending_undo") {
    return (
      <>
        <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={handlers.onUndo}>
          Undo
        </button>
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={handlers.onExecuteNow}>
          Execute now
        </button>
      </>
    );
  }
  return null;
}

/** "Sell 4 holdings, then move the money to Everyday Chequing". */
function planTitle(sales: ActionCard[], transfers: ActionCard[]): string {
  const selling = `Sell from ${sales.length} holding${sales.length === 1 ? "" : "s"}`;
  const destination = transfers[0]?.to_label;
  return destination ? `${selling}, then move the money to ${destination}` : selling;
}

export function PlanCard({
  cards,
  busy,
  error,
  ...handlers
}: { cards: ActionCard[]; busy: boolean; error: string | null } & PlanHandlers) {
  const state = planStateOf(cards);
  const look = HEADLINE[state];
  const sales = cards.filter((card) => card.type === "trade");
  const transfers = cards.filter((card) => card.type === "transfer");
  const raised = sales.reduce((sum, card) => sum + (card.amount_cents ?? 0), 0);
  const lastWindow = cards.map((card) => card.execute_at).filter(Boolean).sort().at(-1) ?? null;

  return (
    <article className={`coin-rise rounded-coin border-2 bg-surface-raised p-5 shadow-coin-float transition-colors duration-500 ${look.frame}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${look.chip}`}>
            {look.icon}
            {look.text}
          </p>
          <h4 className="mt-3 text-lg font-extrabold leading-snug tracking-tight">{planTitle(sales, transfers)}</h4>
        </div>
        {state === "pending_undo" && <UndoRing executeAt={lastWindow} onElapsed={handlers.onWindowElapsed} />}
      </div>

      <p className="money mt-4 text-4xl font-extrabold leading-none tracking-[-0.03em]">{money(raised)}</p>
      <p className="mt-1 text-sm font-semibold text-subtle">raised from the sales, at today&rsquo;s prices</p>

      <ol className="mt-4 divide-y divide-border border-y border-border">
        {cards.map((card, index) => (
          <Step key={card.action_id} card={card} index={index} />
        ))}
      </ol>

      {error && <p className="mt-3 text-sm font-bold text-loss">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2 empty:hidden">
        <PlanActions state={state} busy={busy} handlers={handlers} />
      </div>
    </article>
  );
}

const nothing = () => undefined;

/** Static preview for the design page. */
export function PlanCardPreview({ cards }: { cards: ActionCard[] }) {
  return (
    <PlanCard
      cards={cards}
      busy={false}
      error={null}
      onApprove={nothing}
      onDismiss={nothing}
      onUndo={nothing}
      onExecuteNow={nothing}
      onWindowElapsed={nothing}
    />
  );
}
