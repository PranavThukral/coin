"use client";

import { useCallback, useRef, useState } from "react";
import type { AccountId, ActionCard } from "../../contracts";
import { api, ApiError } from "../../lib/api";
import { addUserMessage, applyEvent, initialChat, replaceCard, type ChatState, type ChatTransport } from "../../lib/chat";
import { insteadMessage } from "../../lib/instead";

export interface CardControls {
  busyId: string | null;
  errors: Record<string, string>;
  approve(card: ActionCard): void;
  dismiss(card: ActionCard): void;
  undo(card: ActionCard): void;
  executeNow(card: ActionCard): void;
  confirmRecipient(card: ActionCard, email: string): void;
  useInstead(card: ActionCard, amountCents: number): void;
  settle(card: ActionCard): void;
}

export function useCoinChat(transport: ChatTransport, onActionSettled: () => void) {
  const [chat, setChat] = useState<ChatState>(initialChat);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const abort = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string, viewing: AccountId | null) => {
      const message = text.trim();
      if (!message) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setChat((state) => addUserMessage(state, message));
      for await (const event of transport.send(message, viewing, controller.signal)) {
        setChat((state) => applyEvent(state, event));
      }
    },
    [transport],
  );

  const runAction = useCallback(
    async (card: ActionCard, call: () => Promise<ActionCard>) => {
      setBusyId(card.action_id);
      setErrors((current) => {
        const next = { ...current };
        delete next[card.action_id];
        return next;
      });
      try {
        const updated = await call();
        setChat((state) => replaceCard(state, updated));
        if (updated.status === "executed" || updated.status === "blocked") onActionSettled();
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "That didn't go through. Try again.";
        setErrors((current) => ({ ...current, [card.action_id]: message }));
      } finally {
        setBusyId(null);
      }
    },
    [onActionSettled],
  );

  /** The undo window ended: any request settles it server-side; then refresh the card. */
  const settle = useCallback(
    async (card: ActionCard) => {
      const cards = await api.actions();
      const fresh = cards.find((c) => c.action_id === card.action_id);
      if (fresh) {
        setChat((state) => replaceCard(state, fresh));
        if (fresh.status !== card.status) onActionSettled();
      }
    },
    [onActionSettled],
  );

  const controls: CardControls = {
    busyId,
    errors,
    approve: (card) => runAction(card, () => api.approve(card.action_id)),
    dismiss: (card) => runAction(card, () => api.dismiss(card.action_id)),
    undo: (card) => runAction(card, () => api.undo(card.action_id)),
    executeNow: (card) => runAction(card, () => api.executeNow(card.action_id)),
    confirmRecipient: (card, email) => runAction(card, () => api.confirmRecipient(card.action_id, email)),
    useInstead: (card, amountCents) => send(insteadMessage(card, amountCents), null),
    settle,
  };

  return { chat, send, controls };
}
