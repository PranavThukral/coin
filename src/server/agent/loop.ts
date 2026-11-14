import { AGENT_LIMITS, ChartRequest, ToolInputs, type AccountId, type ChatEvent, type ToolName } from "../../contracts";
import type { Db } from "../db/types";
import { proposeAction } from "../actions/service";
import { buildChart } from "../tools/charts";
import { runReadTool } from "../tools/read";
import { AppError } from "../errors";
import type { AgentModel, ModelCall, TurnInput } from "./model";

export type HistoryMessage = { role: "user" | "assistant"; content: string };
type Options = {
  db: Db; sessionId: string; userMessageId: string; history: HistoryMessage[];
  viewingAccountId: AccountId | null; model: AgentModel; systemPrompt: string;
  emit: (event: ChatEvent) => void; onUsage?: (input: number, output: number) => Promise<void>;
  beforeCall?: () => Promise<void>;
};

function status(name: string): string {
  if (name === "propose_action") return "Checking your action\u2026";
  if (name === "render_chart") return "Building your chart\u2026";
  if (name === "get_transactions") return "Reading your transactions\u2026";
  return "Reading your accounts\u2026";
}

type Counts = { proposals: number; charts: number };

async function executeTool(options: Options, call: ModelCall, counts: Counts): Promise<unknown> {
  if (!(call.name in ToolInputs)) throw new Error("Unknown tool");
  const name = call.name as ToolName;
  const parsed = JSON.parse(call.arguments);
  const args = name === "propose_action" && parsed.proposal ? parsed.proposal : parsed;
  if (name === "propose_action") {
    if (counts.proposals++ >= AGENT_LIMITS.max_proposals_per_turn) throw new Error("Only one proposal is allowed per turn");
    const card = await proposeAction(options.db, options.sessionId, options.userMessageId, args);
    options.emit({ type: "action_card", card });
    return { status: card.status, primary_message: card.primary_message, max_passing_amount_cents: card.max_passing_amount_cents, max_passing_quantity: card.max_passing_quantity };
  }
  if (name === "render_chart") {
    if (counts.charts >= AGENT_LIMITS.max_charts_per_turn) throw new Error("Chart limit reached");
    const chart = await buildChart(options.db, options.sessionId, ChartRequest.parse(args));
    counts.charts++;
    options.emit({ type: "chart", chart });
    return { summary: `Chart displayed: ${chart.source}; ${chart.data.length} data points.` };
  }
  return runReadTool(options.db, options.sessionId, name, args);
}

/** Text from separate model steps reads as separate paragraphs. */
const PARAGRAPH_BREAK = String.fromCharCode(10, 10);

function paragraphEmitter(emit: Options["emit"]) {
  let wroteEarlierStep = false;
  let wroteThisStep = false;
  return {
    startStep() {
      wroteEarlierStep = wroteEarlierStep || wroteThisStep;
      wroteThisStep = false;
    },
    text(delta: string) {
      if (!wroteThisStep && wroteEarlierStep) emit({ type: "text_delta", text: PARAGRAPH_BREAK });
      wroteThisStep = true;
      emit({ type: "text_delta", text: delta });
    },
  };
}

async function runTools(options: Options, calls: ModelCall[], counts: Counts): Promise<TurnInput[]> {
  const outputs: TurnInput[] = [];
  for (const call of calls) {
    options.emit({ type: "tool_status", label: status(call.name) });
    let result: unknown;
    try {
      result = await executeTool(options, call, counts);
    } catch {
      result = { error: "The tool request could not be completed." };
    }
    outputs.push({ kind: "tool_result", callId: call.id, output: JSON.stringify(result) });
  }
  return outputs;
}

export async function runAgent(options: Options): Promise<void> {
  const counts: Counts = { proposals: 0, charts: 0 };
  const writer = paragraphEmitter(options.emit);
  let input: TurnInput[] = options.history.map((m) => ({ kind: "message", role: m.role, content: m.content }));
  let previousResponseId: string | null = null;

  try {
    for (let step = 0; step < AGENT_LIMITS.max_tool_steps; step += 1) {
      await options.beforeCall?.();
      writer.startStep();
      const result = await options.model.run(
        { instructions: options.systemPrompt, input, previousResponseId },
        (delta) => writer.text(delta),
      );
      await options.onUsage?.(result.inputTokens, result.outputTokens);
      if (result.calls.length === 0) break;
      previousResponseId = result.responseId;
      input = await runTools(options, result.calls, counts);
    }
  } catch (error) {
    if (error instanceof AppError && error.code === "unavailable") {
      options.emit({ type: "error", code: "budget_exhausted", message: error.message });
    } else {
      console.error("Agent run failed", error);
      options.emit({ type: "error", code: "model_error", message: "Coin can't answer right now. Try again in a moment." });
    }
  } finally {
    options.emit({ type: "done" });
  }
}
