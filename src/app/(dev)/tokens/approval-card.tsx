// Static approval card in every state. W7 builds the live version from this.
// Each state has its own frame so you can tell them apart at a glance:
//   proposed   plain card            blocked    red edge bar
//   pending    violet ring + timer   executed   green ring, check draws in, one settle pulse
//   cancelled  light red border, amount struck through, "Nothing moved."
import type { ActionCard, CheckResult } from "../../../contracts";
import { AlertIcon, ArrowIcon, CheckIcon, ClockIcon, CrossIcon, UndoIcon } from "./icons";
import { UndoRing } from "./live-bits";
import { money } from "./preview-data";

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

function StatusLine({ state }: { state: CardState }) {
  const content: Record<CardState, { tone: string; icon: React.ReactNode; text: string }> = {
    proposed: { tone: "text-muted", icon: null, text: "Ready for your approval" },
    confirm: { tone: "text-warning", icon: <AlertIcon />, text: "New recipient: confirm first" },
    blocked: { tone: "text-blocked", icon: <CrossIcon />, text: "Blocked by a check" },
    pending_undo: { tone: "text-pending", icon: <ClockIcon />, text: "Approved. Sending in 60 seconds" },
    executed: { tone: "text-gain", icon: null, text: "Done" },
    cancelled: { tone: "text-loss", icon: <UndoIcon />, text: "Cancelled" },
  };
  const { tone, icon, text } = content[state];
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

function CheckList({ checks }: { checks: CheckResult[] }) {
  const problems = checks.filter((c) => c.outcome === "fail" || c.outcome === "flag");
  const okCount = checks.length - problems.length;

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
      {problems.map((check) => (
        <p
          key={check.rule}
          className={`flex items-start gap-2 font-semibold ${check.outcome === "fail" ? "text-blocked" : "text-warning"}`}
        >
          <span className="mt-0.5">{check.outcome === "fail" ? <CrossIcon /> : <AlertIcon />}</span>
          <span>{check.message}</span>
        </p>
      ))}
      <p className="flex items-center gap-2 font-semibold text-subtle">
        <CheckIcon className="h-3.5 w-3.5 text-gain" />
        {problems.length === 0 ? `All ${okCount} checks passed` : `${okCount} other checks passed`}
      </p>
    </div>
  );
}

function RecipientConfirmation() {
  return (
    <div className="mt-4 rounded-coin-sm bg-warning-soft p-3">
      <label className="text-sm font-bold text-foreground" htmlFor="preview-email">
        Alex&rsquo;s email
      </label>
      <input
        id="preview-email"
        type="email"
        placeholder="name@example.com"
        className="mt-1.5 w-full rounded-coin-sm border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle"
        disabled
      />
    </div>
  );
}

function Actions({ card, state }: { card: ActionCard; state: CardState }) {
  const primary = "rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-ink";
  const secondary = "rounded-full border border-border-strong px-5 py-2.5 text-sm font-bold text-foreground";

  if (state === "proposed" || state === "confirm") {
    return (
      <>
        <span className={primary}>{state === "confirm" ? "Confirm new recipient" : "Approve"}</span>
        <span className={secondary}>Dismiss</span>
      </>
    );
  }
  if (state === "blocked" && card.max_passing_amount_cents !== null) {
    return <span className={`money ${primary}`}>Use {money(card.max_passing_amount_cents)} instead</span>;
  }
  if (state === "pending_undo") {
    return (
      <>
        <span className={`${secondary} border-pending text-pending`}>Undo</span>
        <span className={primary}>Execute now</span>
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

export function ApprovalCardPreview({ card }: { card: ActionCard }) {
  const state = stateOf(card);
  const showChecks = state === "proposed" || state === "confirm" || state === "blocked";

  return (
    <article className={`rounded-coin bg-surface p-5 shadow-coin ${FRAME[state]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusLine state={state} />
          <h4 className="mt-1.5 text-lg font-extrabold leading-snug">{card.title}</h4>
        </div>
        {state === "pending_undo" && <UndoRing />}
        {state === "executed" && <ExecutedBadge />}
      </div>

      <Amount card={card} state={state} />
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
        {card.from_label}
        <ArrowIcon />
        {card.to_label}
      </p>
      <Outcome card={card} state={state} />

      {state === "confirm" && <RecipientConfirmation />}
      {showChecks && <CheckList checks={card.checks} />}

      <div className="mt-5 flex flex-wrap gap-2 empty:hidden">
        <Actions card={card} state={state} />
      </div>
    </article>
  );
}
