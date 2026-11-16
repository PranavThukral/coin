"use client";

import { useEffect, useRef, useState } from "react";
import { AGENT_LIMITS, type AccountId, type ActionCard } from "../../contracts";
import type { ChatMessage, ChatState, MessagePart } from "../../lib/chat";
import { ApprovalCard } from "../actions/approval-card";
import { PlanCard } from "../actions/plan-card";
import { ChartCard } from "../charts/chart-card";
import { CheckIcon, CloseIcon, SendIcon } from "../ui/icons";
import { Mascot, type MascotMood } from "./mascot";
import { OverviewPanel } from "./overview-panel";
import type { CardControls, useCoinChat } from "./use-coin-chat";

const SUGGESTIONS = [
  "How am I doing overall?",
  "Where did my money go this month?",
  "Can I cover everything due before payday?",
  "How have my investments done?",
];

export const DISCLAIMER = "Completely synthetic data.";

function moodOf(chat: ChatState): MascotMood {
  if (chat.busy) return "thinking";
  const last = chat.messages.at(-1);
  const lastCard = last?.parts.findLast((part) => part.kind === "card");
  if (lastCard?.kind === "card" && lastCard.card.status === "blocked") return "concerned";
  if (lastCard?.kind === "card" && lastCard.card.status === "executed") return "happy";
  return "idle";
}

const stagger = (index: number) => ({ "--i": index }) as React.CSSProperties;

/** Coin may bold key figures with **double asterisks**; nothing else is formatted. */
function withBold(paragraph: string): React.ReactNode[] {
  return paragraph.split(/(\*\*[^*]+\*\*)/g).map((piece, i) =>
    piece.startsWith("**") && piece.endsWith("**") && piece.length > 4 ? (
      <strong key={i} className="font-extrabold">
        {piece.slice(2, -2)}
      </strong>
    ) : (
      piece
    ),
  );
}

const NUMBERED = /^(\d+)\.\s+(.*)$/;

/** One line of Coin's reply. A numbered line ("1. Wait for payday...") is an option the user can choose. */
function Line({ line }: { line: string }) {
  const numbered = NUMBERED.exec(line);
  if (!numbered) return <p>{withBold(line)}</p>;
  return (
    <p className="flex gap-3 rounded-coin-sm bg-surface-soft px-3 py-2.5">
      <span className="money grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-text">
        {numbered[1]}
      </span>
      <span className="min-w-0">{withBold(numbered[2])}</span>
    </p>
  );
}

function CoinText({ text }: { text: string }) {
  const lines = text.split(/\n+/).filter((line) => line.trim().length > 0);
  return (
    <div className="coin-rise space-y-2 text-[15px] font-medium leading-relaxed">
      {lines.map((line, i) => (
        <Line key={i} line={line.trim()} />
      ))}
    </div>
  );
}

/** What Coin did to answer, one line per step, each ticking off as the next begins. */
function StepTrail({ steps, working }: { steps: string[]; working: boolean }) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-1.5">
      {steps.map((step, index) => {
        const active = working && index === steps.length - 1;
        return (
          <li key={`${index}-${step}`} className="coin-rise flex items-center gap-2 text-xs font-bold text-subtle">
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                active ? "bg-accent-soft text-accent-text" : "bg-surface-soft text-muted"
              }`}
            >
              {active ? <span className="coin-dot h-1.5 w-1.5 rounded-full bg-accent" /> : <CheckIcon className="h-2.5 w-2.5" />}
            </span>
            <span className={active ? "text-accent-text" : ""}>{step.replace(/(\u2026|\.\.\.)$/, "")}</span>
          </li>
        );
      })}
    </ol>
  );
}

function WritingDots() {
  return (
    <div className="flex h-6 items-center gap-1" aria-label="Coin is writing">
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="coin-dot h-1.5 w-1.5 rounded-full bg-subtle" style={stagger(dot)} />
      ))}
    </div>
  );
}

/** A plan's steps, shown and approved as one card. */
function Plan({ cards, controls }: { cards: ActionCard[]; controls: CardControls }) {
  const ids = cards.map((card) => card.action_id);
  const failedId = ids.find((id) => controls.errors[id]);
  return (
    <PlanCard
      cards={cards}
      busy={controls.busyId !== null && ids.includes(controls.busyId)}
      error={failedId ? controls.errors[failedId] : null}
      onApprove={() => controls.each(cards, "approve")}
      onDismiss={() => controls.each(cards, "dismiss")}
      onUndo={() => controls.each(cards, "undo")}
      onExecuteNow={() => controls.each(cards, "executeNow")}
      onWindowElapsed={() => controls.each(cards, "settle")}
    />
  );
}

function MessageParts({ message, controls }: { message: ChatMessage; controls: CardControls }) {
  const planned = message.parts.flatMap((part) => (part.kind === "card" && part.card.origin === "plan" ? [part.card] : []));
  const single = message.parts.filter((part) => part.kind === "chart" || part.card.origin !== "plan");
  // Breakdowns sit side by side when the panel is wide enough for two.
  const breakdowns = single.filter((part) => part.kind === "chart" && part.chart.kind === "donut");
  const others = single.filter((part) => !breakdowns.includes(part));
  return (
    <>
      {others.length > 0 && <SingleParts parts={others} controls={controls} />}
      {breakdowns.length > 0 && (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
          <SingleParts parts={breakdowns} controls={controls} />
        </div>
      )}
      {planned.length > 0 && <Plan cards={planned} controls={controls} />}
    </>
  );
}

function SingleParts({ parts, controls }: { parts: MessagePart[]; controls: CardControls }) {
  return parts.map((part) =>
    part.kind === "chart" ? (
      <ChartCard key={part.chart.id} chart={part.chart} height={190} />
    ) : (
      <ApprovalCard
        key={part.card.action_id}
        card={part.card}
        busy={controls.busyId === part.card.action_id}
        error={controls.errors[part.card.action_id] ?? null}
        onApprove={() => controls.approve(part.card)}
        onDismiss={() => controls.dismiss(part.card)}
        onUndo={() => controls.undo(part.card)}
        onExecuteNow={() => controls.executeNow(part.card)}
        onConfirmRecipient={(email) => controls.confirmRecipient(part.card, email)}
        onUseInstead={() => controls.useInstead(part.card)}
        onWindowElapsed={() => controls.settle(part.card)}
      />
    ),
  );
}

function Message({ message, controls }: { message: ChatMessage; controls: CardControls }) {
  if (message.role === "user") {
    return (
      <p className="coin-rise ml-auto w-fit max-w-[85%] rounded-[22px] rounded-br-md bg-surface-ink px-4 py-2.5 text-[15px] font-semibold text-on-ink">
        {message.text}
      </p>
    );
  }

  const silent = !message.text && message.parts.length === 0 && !message.error;
  return (
    <div className="space-y-3.5">
      <StepTrail steps={message.steps} working={!message.done} />
      {silent && message.steps.length === 0 && <WritingDots />}
      {message.text && <CoinText text={message.text} />}
      <MessageParts message={message} controls={controls} />
      {message.error && <p className="coin-rise text-sm font-bold text-loss">{message.error}</p>}
    </div>
  );
}

/** Questions worth asking next, under Coin's latest reply. The server chooses them; tapping one asks it. */
function FollowUps({ items, onPick }: { items: string[]; onPick: (text: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="coin-rise flex flex-wrap gap-1.5" style={stagger(2)}>
      {items.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-[13px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Composer({ disabled, prefill, onSend }: {
  disabled: boolean;
  /** A request written for the visitor to edit and send (from a quick action). */
  prefill: { text: string; id: number } | null;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!prefill) return;
    const frame = requestAnimationFrame(() => {
      setDraft(prefill.text);
      field.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [prefill]);
  const submit = () => {
    if (!draft.trim() || disabled) return;
    onSend(draft);
    setDraft("");
  };
  return (
    <form
      className="px-4 pb-3 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-[26px] bg-surface-soft py-2 pl-5 pr-2 transition-shadow focus-within:shadow-[0_0_0_2px_var(--accent)]">
        <textarea
          ref={field}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, AGENT_LIMITS.max_input_chars))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Ask Coin about your money"
          aria-label="Message Coin"
          className="coin-quiet-focus max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] font-medium outline-none placeholder:text-subtle"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={disabled || !draft.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-transform active:scale-90 disabled:bg-border-strong disabled:text-surface"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-subtle">{DISCLAIMER}</p>
    </form>
  );
}

function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-subtle">Try asking</p>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((text, index) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            style={stagger(index + 5)}
            className="coin-rise rounded-full border border-border bg-surface px-3 py-1.5 text-left text-[13px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Header({ chat, onCollapse }: { chat: ChatState; onCollapse: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
      <Mascot size={36} mood={moodOf(chat)} />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-extrabold leading-tight tracking-tight">Coin</p>
        <p className="truncate text-xs font-bold text-accent-text empty:hidden" aria-live="polite">
          {chat.status}
        </p>
      </div>
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Hide Coin"
        className="grid h-9 w-9 place-items-center rounded-full bg-surface-soft text-muted transition-colors hover:text-foreground"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </header>
  );
}

/** The conversation state and actions, owned by the app shell (see useCoinChat). */
export type CoinConversation = ReturnType<typeof useCoinChat>;

export function CoinSidebar({
  coin,
  viewingAccountId,
  onCollapse,
  replayOnly = false,
  prefill = null,
}: {
  prefill?: { text: string; id: number } | null;
  coin: CoinConversation;
  viewingAccountId: AccountId | null;
  onCollapse: () => void;
  /** Scripted demo: Coin answers only the demo's own questions. */
  replayOnly?: boolean;
}) {
  const { chat, send, controls } = coin;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-surface lg:rounded-coin-lg lg:shadow-coin-float" aria-label="Coin">
      <Header chat={chat} onCollapse={onCollapse} />

      <div ref={scroller} className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <OverviewPanel key={viewingAccountId ?? "all"} accountId={viewingAccountId} />
        {chat.messages.length === 0 && !replayOnly && <Suggestions onPick={(text) => send(text, viewingAccountId)} />}
        {chat.messages.map((message) => (
          <Message key={message.id} message={message} controls={controls} />
        ))}
        {!chat.busy && !replayOnly && (
          <FollowUps items={chat.messages.at(-1)?.suggestions ?? []} onPick={(text) => send(text, viewingAccountId)} />
        )}
      </div>

      {replayOnly ? (
        <p className="border-t border-border px-5 py-4 text-sm font-semibold text-muted">
          This is a replay with the real rules and your own copy of the data.{" "}
          <a href="/app" className="font-extrabold text-accent-text hover:underline">
            Try it live
          </a>{" "}
          to ask Coin anything.
        </p>
      ) : (
        <Composer disabled={chat.busy} prefill={prefill} onSend={(text) => send(text, viewingAccountId)} />
      )}
    </aside>
  );
}
