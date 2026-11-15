/**
 * Runs one scripted demo turn through the real pipeline, without a model:
 * the user's message is stored (rules 0 and 8 read it), charts are built from
 * the visitor's data, proposals go through all nine rules. Events stream in
 * the same shape as /api/chat, so the sidebar can't tell the difference.
 */
import { randomUUID } from "node:crypto";
import { fillDateTokens, type ChatEvent } from "../../contracts";
import type { MessagePart } from "../../lib/chat";
import type { DemoStep, TurnItem } from "../../demo/script";
import { proposeAction } from "../actions/service";
import * as q from "../db/queries";
import type { Db } from "../db/types";
import { buildChart } from "../tools/charts";

type Emit = (event: ChatEvent) => void;

export interface TurnTiming {
  /** Pause after a status line, as if a tool were running. */
  statusMs: number;
  /** Pause between words, so the text streams like a reply. */
  wordMs: number;
}

export const DEMO_TIMING: TurnTiming = { statusMs: 650, wordMs: 28 };

const pause = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

async function streamText(text: string, emit: Emit, timing: TurnTiming): Promise<void> {
  const words = text.split(/(?<=\s)/);
  for (const word of words) {
    emit({ type: "text_delta", text: word });
    await pause(timing.wordMs);
  }
}

interface TurnContext {
  db: Db;
  sessionId: string;
  today: string;
  userMessageId: string;
  emit: Emit;
  timing: TurnTiming;
  parts: MessagePart[];
}

async function runItem(item: TurnItem, ctx: TurnContext): Promise<string> {
  switch (item.kind) {
    case "status":
      ctx.emit({ type: "tool_status", label: item.label });
      await pause(ctx.timing.statusMs);
      return "";
    case "chart": {
      const chart = await buildChart(ctx.db, ctx.sessionId, item.request);
      ctx.parts.push({ kind: "chart", chart });
      ctx.emit({ type: "chart", chart });
      return "";
    }
    case "propose": {
      const card = await proposeAction(ctx.db, ctx.sessionId, ctx.userMessageId, item.proposal);
      ctx.parts.push({ kind: "card", card });
      ctx.emit({ type: "action_card", card });
      return "";
    }
    case "text": {
      const text = fillDateTokens(item.text, ctx.today);
      await streamText(text, ctx.emit, ctx.timing);
      return text;
    }
  }
}

export async function runScriptedTurn(
  db: Db,
  sessionId: string,
  step: DemoStep,
  emit: Emit,
  timing: TurnTiming = DEMO_TIMING,
): Promise<void> {
  const userMessageId = randomUUID();
  const assistantId = randomUUID();
  await db.query("insert into messages (id, session_id, role, content) values ($1, $2, 'user', $3)", [
    userMessageId,
    sessionId,
    step.prompt ?? "",
  ]);
  const today = (await q.sessionInfo(db, sessionId)).today_date;

  emit({ type: "message_start", message_id: assistantId });
  const ctx: TurnContext = { db, sessionId, today, userMessageId, emit, timing, parts: [] };
  let text = "";
  for (const item of step.turn ?? []) {
    text += await runItem(item, ctx);
  }

  await db.query(
    "insert into messages (id, session_id, role, content, parts) values ($1, $2, 'assistant', $3, $4::jsonb)",
    [assistantId, sessionId, text, JSON.stringify(ctx.parts)],
  );
  emit({ type: "done" });
}
