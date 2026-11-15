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
  approve(card: ActionCard): Promise<void>;
  dismiss(card: ActionCard): Promise<void>;
  undo(card: ActionCard): Promise<void>;
  executeNow(card: ActionCard): Promise<void>;
  confirmRecipient(card: ActionCard, email: string): Promise<void>;
  useInstead(card: ActionCard): Promise<void>;
  settle(card: ActionCard): Promise<void>;
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

/** The newest action card in the conversation, if any. */
export function latestCard(chat: ChatState): ActionCard | null {
  for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
    const parts = chat.messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j -= 1) {
      const part = parts[j];
      if (part.kind === "card") return part.card;
    }
  }
  return null;
}

export function useCoinChat(transport: ChatTransport, onActionSettled: () => void) {
  const [chat, setChatState] = useState<ChatState>(initialChat);
  // Mirrors the latest state, so the scripted demo can read it right after an await.
  const chatRef = useRef<ChatState>(initialChat);
  const setChat = useCallback((update: (state: ChatState) => ChatState) => {
    setChatState((state) => {
      const next = update(state);
      chatRef.current = next;
      return next;
    });
  }, []);
  const getChat = useCallback(() => chatRef.current, []);
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
    [transport, setChat],
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
    [onActionSettled, setChat],
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
    [onActionSettled, setChat],
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

  return { chat, getChat, send, controls };
}
