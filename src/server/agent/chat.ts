/**
 * POST /api/chat: store the user's message, then stream Coin's turn back as
 * server-sent events (contracts section 10).
 *
 * The stored copy of the message is what rules 0 and 8 read when the model
 * proposes an action; the model's own account of what the user said is never
 * used for that.
 */
import { randomUUID } from "node:crypto";
import { AGENT_LIMITS, ChatRequestBody, PERSONA, type AccountId, type ChatEvent } from "../../contracts";
import type { MessagePart } from "../../lib/chat";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import type { SessionContext } from "../session/http";
import { runAgent, type HistoryMessage } from "./loop";
import { createAgentModel, type AgentModel } from "./model";
import { buildSystemPrompt } from "./prompt";
import { checkBudget, checkRateLimit, recordUsage, tokenPrices } from "./spend";

let testModel: AgentModel | null = null;

export function setModelForTests(model: AgentModel | null): void {
  testModel = model;
}

type Emit = (event: ChatEvent) => void;
type StreamControls = { emit: Emit; clientGone: () => boolean };

const STREAM_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" };
const GENERIC_ERROR = "Coin can't answer right now. Try again in a moment.";

/**
 * Runs `run` and streams what it emits. If the visitor leaves mid-reply, emit
 * turns into a no-op instead of throwing, so the turn can still finish its
 * bookkeeping (recording what the model call cost, saving the reply).
 */
function streamResponse(run: (controls: StreamControls) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let open = true;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        await run({ emit, clientGone: () => !open });
      } catch (error) {
        console.error("Chat stream failed", error);
        emit({ type: "error", code: "model_error", message: GENERIC_ERROR });
        emit({ type: "done" });
      }
      if (open) controller.close();
    },
    cancel() {
      open = false;
    },
  });
  return new Response(body, { headers: STREAM_HEADERS });
}

function refusalStream(error: AppError): Response {
  const code = error.code === "rate_limited" ? "rate_limited" : "budget_exhausted";
  return streamResponse(async ({ emit }) => {
    emit({ type: "error", code, message: error.message });
    emit({ type: "done" });
  });
}

/** Spend and rate checks run one at a time across all visitors, so two requests can't both take the last slot. */
async function reserveTurn(db: Db, sessionId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(1129270862)");
    await checkBudget(tx, now);
    await checkRateLimit(tx, sessionId, now);
  });
}

/** Earlier messages, oldest first. Replies that were only a card or an error have no text and are left out. */
async function loadHistory(db: Db, sessionId: string, exceptMessageId: string): Promise<HistoryMessage[]> {
  return db.query<HistoryMessage>(
    `select role, content from (
       select role, content, created_at, id from messages
       where session_id = $1 and id <> $3 and btrim(content) <> ''
       order by created_at desc, id desc limit $2
     ) recent order by created_at, id`,
    [sessionId, AGENT_LIMITS.history_messages, exceptMessageId],
  );
}

async function systemPromptFor(db: Db, sessionId: string, viewing: AccountId | null): Promise<string> {
  const [session] = await db.query<{ today_date: string; name: string | null }>(
    `select s.today_date, a.name from sessions s
     left join accounts a on a.session_id = s.id and a.id = $2 where s.id = $1`,
    [sessionId, viewing],
  );
  return buildSystemPrompt({
    firstName: PERSONA.first_name,
    today: session.today_date,
    viewingAccountName: session.name,
  });
}

export async function chat(request: Request, context: SessionContext): Promise<Response> {
  const body = ChatRequestBody.parse(await request.json());
  const { db, sessionId, now } = context;

  try {
    await reserveTurn(db, sessionId, now);
  } catch (error) {
    if (error instanceof AppError) return refusalStream(error);
    throw error;
  }
  // Fail before the model is called if spend can't be priced.
  tokenPrices();
  const model = testModel ?? createAgentModel();

  const userMessageId = randomUUID();
  const assistantId = randomUUID();
  await db.query(
    "insert into messages (id, session_id, role, content) values ($1, $2, 'user', $3)",
    [userMessageId, sessionId, body.message],
  );
  const history = await loadHistory(db, sessionId, userMessageId);
  history.push({ role: "user", content: body.message });
  const systemPrompt = await systemPromptFor(db, sessionId, body.viewing_account_id);

  return streamResponse(async ({ emit, clientGone }) => {
    let text = "";
    const parts: MessagePart[] = [];
    const collect: Emit = (event) => {
      if (event.type === "done") return; // sent below, once the reply is saved
      if (event.type === "text_delta") text += event.text;
      if (event.type === "chart") parts.push({ kind: "chart", chart: event.chart });
      if (event.type === "action_card") parts.push({ kind: "card", card: event.card });
      emit(event);
    };

    emit({ type: "message_start", message_id: assistantId });
    await runAgent({
      db,
      sessionId,
      userMessageId,
      history,
      viewingAccountId: body.viewing_account_id,
      model,
      systemPrompt,
      emit: collect,
      cancelled: clientGone,
      beforeCall: () => checkBudget(db, new Date()),
      onUsage: (inputTokens, outputTokens) =>
        recordUsage(db, { sessionId, now, model: model.modelId, inputTokens, outputTokens }),
    });
    await db.query(
      "insert into messages (id, session_id, role, content, parts) values ($1, $2, 'assistant', $3, $4::jsonb)",
      [assistantId, sessionId, text, JSON.stringify(parts)],
    );
    emit({ type: "done" });
  });
}
