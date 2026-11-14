"use client";

import { useEffect, useRef, useState } from "react";
import { AGENT_LIMITS, type AccountId } from "../../contracts";
import type { ChatMessage, ChatState, ChatTransport } from "../../lib/chat";
import { ApprovalCard } from "../actions/approval-card";
import { ChartCard } from "../charts/chart-card";
import { Mascot, type MascotMood } from "./mascot";
import { OverviewPanel } from "./overview-panel";
import { useCoinChat, type CardControls } from "./use-coin-chat";

const SUGGESTIONS = [
  "Where did my money go this month?",
  "How have my investments done, and what am I concentrated in?",
  "What's coming up in the next two weeks?",
  "Move $2,000 from savings to chequing",
];

function moodOf(chat: ChatState): MascotMood {
  if (chat.busy) return "thinking";
  const last = chat.messages.at(-1);
  const lastCard = last?.parts.findLast((part) => part.kind === "card");
  if (lastCard?.kind === "card" && lastCard.card.status === "blocked") return "concerned";
  if (lastCard?.kind === "card" && lastCard.card.status === "executed") return "happy";
  return "idle";
}

function CoinText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm font-medium leading-6">
      {text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
    </div>
  );
}

function Message({ message, controls }: { message: ChatMessage; controls: CardControls }) {
  if (message.role === "user") {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-coin bg-surface-ink px-4 py-2.5 text-sm font-semibold text-on-ink">
        {message.text}
      </p>
    );
  }

  const empty = !message.text && message.parts.length === 0 && !message.error;
  return (
    <div className="flex gap-3">
      <div className="pt-0.5">
        <Mascot size={26} />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {empty && <div className="h-4 w-24 animate-pulse rounded bg-surface-soft" aria-label="Coin is writing" />}
        {message.text && <CoinText text={message.text} />}
        {message.parts.map((part) =>
          part.kind === "chart" ? (
            <ChartCard key={part.chart.id} chart={part.chart} height={180} />
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
        )}
        {message.error && <p className="text-sm font-bold text-loss">{message.error}</p>}
      </div>
    </div>
  );
}

function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (!draft.trim() || disabled) return;
    onSend(draft);
    setDraft("");
  };
  return (
    <form
      className="border-t border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-coin border border-border-strong bg-surface px-3 py-2 focus-within:border-accent">
        <textarea
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
          className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm font-medium outline-none placeholder:text-subtle"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-subtle">
        Made-up data. Every action is simulated. Not financial advice.
      </p>
    </form>
  );
}

export function CoinSidebar({
  transport,
  viewingAccountId,
  onActionSettled,
  onCollapse,
}: {
  transport: ChatTransport;
  viewingAccountId: AccountId | null;
  onActionSettled: () => void;
  onCollapse: () => void;
}) {
  const { chat, send, controls } = useCoinChat(transport, onActionSettled);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  return (
    <aside className="flex h-full flex-col bg-surface" aria-label="Coin">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Mascot size={34} mood={moodOf(chat)} />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">Coin</p>
          <p className="truncate text-xs font-bold text-pending" aria-live="polite">
            {chat.status ?? " "}
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-full border border-border-strong px-3 py-1 text-xs font-bold text-muted hover:text-foreground"
        >
          Hide
        </button>
      </header>

      <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto p-4">
        <OverviewPanel key={viewingAccountId ?? "all"} accountId={viewingAccountId} />
        {chat.messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => send(text, viewingAccountId)}
                className="rounded-full border border-border-strong px-3 py-1.5 text-left text-xs font-bold text-muted hover:border-accent hover:text-foreground"
              >
                {text}
              </button>
            ))}
          </div>
        )}
        {chat.messages.map((message) => (
          <Message key={message.id} message={message} controls={controls} />
        ))}
      </div>

      <Composer disabled={chat.busy} onSend={(text) => send(text, viewingAccountId)} />
    </aside>
  );
}
