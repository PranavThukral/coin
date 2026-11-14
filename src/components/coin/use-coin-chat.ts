"use client";

import { useCallback, useRef, useState } from "react";
import type { AccountId, ActionCard } from "../../contracts";
import { api, ApiError } from "../../lib/api";
import {
  addRetry,
  addUserMessage,
  applyEvent,
  endTurn,
  initialChat,
  replaceCard,
  type ChatState,
  type ChatTransport,
} from "../../lib/chat";

export interface CardControls {
  busyId: string | null;
  errors: Record<string, string>;
  approve(card: ActionCard): void;
  dismiss(card: ActionCard): void;
  undo(card: ActionCard): void;
  executeNow(card: ActionCard): void;
  confirmRecipient(card: ActionCard, email: string): void;
  useInstead(card: ActionCard): void;
  settle(card: ActionCard): void;
}

const SETTLE_ATTEMPTS = 10;
const SETTLE_RETRY_MS = 1_500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The card as the server has it now, or null if it can't be read. */
async function currentCard(actionId: string): Promise<ActionCard | null> {
  try {
    const cards = await api.actions();
    return cards.find((card) => card.action_id === actionId) ?? null;
  } catch {
    return null;
  }
}

function actionErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return "That didn't go through. Try again.";
  // The session restarts after two idle hours or at midnight; its cards go with it.
  if (error.status === 404) return "This card is from an earlier visit. Ask Coin again.";
  return error.message;
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
      try {
        for await (const event of transport.send(message, viewing, controller.signal)) {
          setChat((state) => applyEvent(state, event));
        }
      } catch {
        // A dropped connection or an unreadable event; endTurn below reports it.
      }
      const stillCurrent = abort.current === controller;
      if (stillCurrent) setChat(endTurn);
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
        setErrors((current) => ({ ...current, [card.action_id]: actionErrorText(error) }));
      } finally {
        setBusyId(null);
      }
    },
    [onActionSettled],
  );

  /**
   * The undo window ended on this device's clock. Any request settles the
   * action server-side, but the server's clock decides when: if this device
   * runs a little fast, the first look comes too early, so keep looking.
   */
  const settle = useCallback(
    async (card: ActionCard) => {
      for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
        const fresh = await currentCard(card.action_id);
        if (fresh && fresh.status !== "pending_undo") {
          setChat((state) => replaceCard(state, fresh));
          onActionSettled();
          return;
        }
        await wait(SETTLE_RETRY_MS);
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
    useInstead: async (card) => {
      setBusyId(card.action_id);
      try {
        const { message, card: next } = await api.retry(card.action_id);
        setChat((state) => addRetry(state, message, next));
      } catch (error) {
        setErrors((current) => ({ ...current, [card.action_id]: actionErrorText(error) }));
      } finally {
        setBusyId(null);
      }
    },
    settle,
  };

  return { chat, send, controls };
}
