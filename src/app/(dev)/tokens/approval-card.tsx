// Static approval card in every state. W7 builds the live version from this.
import { RULE_LIMITS, type ActionCard, type ActionStatus, type CheckResult } from "../../../contracts";
import { AlertIcon, ArrowIcon, CheckIcon, ClockIcon, CrossIcon } from "./icons";
import { money } from "./preview-data";

const STATUS_LABEL: Record<ActionStatus, string> = {
  proposed: "Ready to review",
  blocked: "Blocked",
  pending_undo: "Pending",
  executed: "Executed",
  cancelled: "Cancelled",
};

function StatusLine({ card }: { card: ActionCard }) {
  const needsConfirmation = card.requires_second_confirmation && !card.second_confirmed;
  const label = needsConfirmation ? "Confirmation needed" : STATUS_LABEL[card.status];

  let tone = "text-muted";
  let icon: React.ReactNode = null;
  if (card.status === "blocked") {
    tone = "text-blocked";
    icon = <CrossIcon />;
  } else if (card.status === "pending_undo") {
    tone = "text-pending";
    icon = <ClockIcon />;
  } else if (card.status === "executed") {
    tone = "text-gain";
    icon = <CheckIcon />;
  } else if (needsConfirmation) {
    tone = "text-warning";
    icon = <AlertIcon />;
  }

  return (
    <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${tone}`}>
      {icon}
      {label}
    </p>
  );
}

function UndoRing({ secondsLeft }: { secondsLeft: number }) {
  const circumference = 2 * Math.PI * 24;
  const used = 1 - secondsLeft / RULE_LIMITS.undo_window_seconds;
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center" aria-label={`${secondsLeft} seconds to undo`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle
          cx="28"
          cy="28"
          r="24"
          fill="none"
          stroke="var(--pending)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * used}
        />
      </svg>
      <span className="money text-xs font-bold">{secondsLeft}s</span>
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
          className={`flex items-start gap-2 ${check.outcome === "fail" ? "text-blocked" : "text-warning"}`}
        >
          <span className="mt-0.5">{check.outcome === "fail" ? <CrossIcon /> : <AlertIcon />}</span>
          <span>{check.message}</span>
        </p>
      ))}
      <p className="flex items-center gap-2 text-muted">
        <CheckIcon className="h-3.5 w-3.5 text-gain" />
        {problems.length === 0 ? `All ${okCount} checks passed` : `${okCount} other checks passed`}
      </p>
    </div>
  );
}

function RecipientConfirmation() {
  return (
    <div className="mt-4 rounded-coin-sm bg-surface-soft p-3">
      <label className="text-xs font-bold text-muted" htmlFor="preview-email">
        Alex&rsquo;s email
      </label>
      <input
        id="preview-email"
        type="email"
        placeholder="name@example.com"
        className="mt-1.5 w-full rounded-coin-sm border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
        disabled
      />
    </div>
  );
}

function Actions({ card }: { card: ActionCard }) {
  const primary = "rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-ink";
  const secondary = "rounded-full border border-border px-4 py-2 text-sm";

  if (card.status === "proposed") {
    const label = card.requires_second_confirmation ? "Confirm new recipient" : "Approve";
    return (
      <>
        <span className={primary}>{label}</span>
        <span className={secondary}>Dismiss</span>
      </>
    );
  }
  if (card.status === "blocked" && card.max_passing_amount_cents !== null) {
    return <span className={`money font-bold ${secondary}`}>Use {money(card.max_passing_amount_cents)} instead</span>;
  }
  if (card.status === "pending_undo") {
    return (
      <>
        <span className={primary}>Undo</span>
        <span className={secondary}>Execute now</span>
      </>
    );
  }
  return null;
}

export function ApprovalCardPreview({ card }: { card: ActionCard }) {
  const showChecks = card.status === "proposed" || card.status === "blocked";

  return (
    <article className="rounded-coin border border-border bg-surface p-5 shadow-coin">
      <div className="flex items-start justify-between gap-3">
        <div>
          <StatusLine card={card} />
          <h4 className="mt-2 text-lg font-bold">{card.title}</h4>
        </div>
        {card.status === "pending_undo" && <UndoRing secondsLeft={42} />}
      </div>

      <p className="money mt-4 text-2xl font-bold tracking-tight">
        {card.amount_cents !== null ? money(card.amount_cents) : "—"}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
        {card.from_label}
        <ArrowIcon />
        {card.to_label}
      </p>
      {card.balance_after_cents !== null && card.status !== "cancelled" && (
        <p className="money mt-1 text-sm text-muted">
          {card.from_label} after: {money(card.balance_after_cents)}
        </p>
      )}

      {card.requires_second_confirmation && card.status === "proposed" && <RecipientConfirmation />}
      {showChecks && <CheckList checks={card.checks} />}

      <div className="mt-5 flex flex-wrap gap-2">
        <Actions card={card} />
      </div>
    </article>
  );
}
