import { randomUUID } from "node:crypto";
import { AGENT_LIMITS, ChatRequestBody, PERSONA, type ChatEvent } from "../../contracts";
import type { MessagePart } from "../../lib/chat";
import type { SessionContext } from "../session/http";
import { AppError } from "../errors";
import { buildSystemPrompt } from "./prompt";
import { createAgentModel, type AgentModel } from "./model";
import { runAgent, type HistoryMessage } from "./loop";
import { checkBudget, checkRateLimit, recordUsage, tokenPrices } from "./spend";

let testModel: AgentModel | null = null;
export function setModelForTests(model: AgentModel | null): void { testModel = model; }

function streamResponse(run: (emit: (event: ChatEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await run(emit);
      } catch {
        emit({ type: "error", code: "model_error", message: "Coin can't answer right now. Try again in a moment." });
        emit({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
}

export async function chat(request: Request, context: SessionContext): Promise<Response> {
  const body = ChatRequestBody.parse(await request.json());
  const { db, sessionId, now } = context;
  try {
    await db.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(1129270862)");
      await checkBudget(tx, now);
      await checkRateLimit(tx, sessionId, now);
    });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return streamResponse(async (emit) => {
      emit({ type: "error", code: error.code === "rate_limited" ? "rate_limited" : "budget_exhausted", message: error.message });
      emit({ type: "done" });
    });
  }
  tokenPrices();
  const model = testModel ?? createAgentModel();
  const userMessageId = randomUUID();
  const assistantId = randomUUID();
  await db.query("insert into messages (id, session_id, role, content) values ($1, $2, 'user', $3)", [userMessageId, sessionId, body.message]);
  const history = await db.query<HistoryMessage>(
    `select role, content from (select role, content, created_at, id from messages where session_id = $1 and id <> $3
     order by created_at desc, id desc limit $2) recent order by created_at, id`,
    [sessionId, AGENT_LIMITS.history_messages, userMessageId],
  );
  history.push({ role: "user", content: body.message });
  const [session] = await db.query<{ today_date: string; name: string | null }>(
    `select s.today_date, a.name from sessions s left join accounts a on a.session_id = s.id and a.id = $2 where s.id = $1`,
    [sessionId, body.viewing_account_id],
  );
  const systemPrompt = buildSystemPrompt({ firstName: PERSONA.first_name, today: session.today_date, viewingAccountName: session.name });
  return streamResponse(async (emit) => {
    let text = "";
    const parts: MessagePart[] = [];
    emit({ type: "message_start", message_id: assistantId });
    await runAgent({ db, sessionId, userMessageId, history, viewingAccountId: body.viewing_account_id, model, systemPrompt,
      beforeCall: () => checkBudget(db, new Date()),
      onUsage: (inputTokens, outputTokens) => recordUsage(db, { sessionId, now, model: model.modelId, inputTokens, outputTokens }),
      emit(event) {
        if (event.type === "done") return;
        if (event.type === "text_delta") text += event.text;
        if (event.type === "chart") parts.push({ kind: "chart", chart: event.chart });
        if (event.type === "action_card") parts.push({ kind: "card", card: event.card });
        emit(event);
      },
    });
    await db.query("insert into messages (id, session_id, role, content, parts) values ($1, $2, 'assistant', $3, $4::jsonb)", [assistantId, sessionId, text, JSON.stringify(parts)]);
    emit({ type: "done" });
  });
}
