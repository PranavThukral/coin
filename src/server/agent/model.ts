/**
 * The model behind Coin, through OpenAI's Responses API.
 *
 * GPT-6 Luna only accepts function tools with reasoning on /v1/responses, so
 * that is the endpoint. A turn's first call sends the system prompt and the
 * conversation; each later tool step sends only the tool results, chained
 * with previous_response_id so the model keeps its own reasoning between steps.
 * The loop depends on the small AgentModel interface; tests pass a fake.
 */
import "server-only";
import OpenAI from "openai";
import type { FunctionTool, ResponseInput } from "openai/resources/responses/responses";
import { z } from "zod";
import { AGENT_LIMITS, TOOL_DESCRIPTIONS, ToolInputs, type ToolName } from "../../contracts";
import { SALE_PLAN_DESCRIPTION, SalePlanInput } from "../actions/planner";
import { INSIGHT_TOOL_DESCRIPTIONS, InsightToolInputs, type InsightToolName } from "./insight-tools";

export type ModelCall = { id: string; name: string; arguments: string };

export type TurnInput =
  | { kind: "message"; role: "user" | "assistant"; content: string }
  | { kind: "tool_result"; callId: string; output: string };

export interface ModelTurn {
  instructions: string;
  input: TurnInput[];
  /** Set on every call after the first in a turn. */
  previousResponseId: string | null;
}

export interface ModelResult {
  responseId: string | null;
  calls: ModelCall[];
  inputTokens: number;
  outputTokens: number;
}

export interface AgentModel {
  modelId: string;
  run(turn: ModelTurn, onText: (text: string) => void): Promise<ModelResult>;
}

/** Strict function schemas: no $schema key, and anyOf instead of oneOf. */
function providerSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerSchema);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value)
    .filter(([key]) => key !== "$schema")
    .map(([key, item]) => [key === "oneOf" ? "anyOf" : key, providerSchema(item)]);
  return Object.fromEntries(entries);
}

function insightToolDefinitions(): FunctionTool[] {
  return (Object.keys(InsightToolInputs) as InsightToolName[]).map((name) => ({
    type: "function",
    name,
    description: INSIGHT_TOOL_DESCRIPTIONS[name],
    parameters: providerSchema(z.toJSONSchema(InsightToolInputs[name])) as Record<string, unknown>,
    strict: true,
  }));
}

/** propose_action's union is wrapped in an object, since a tool's root must be an object. */
export function toolDefinitions(): FunctionTool[] {
  const contractTools = (Object.keys(ToolInputs) as ToolName[]).map((name): FunctionTool => {
    const schema = providerSchema(z.toJSONSchema(ToolInputs[name])) as Record<string, unknown>;
    const parameters =
      name === "propose_action"
        ? { type: "object", properties: { proposal: schema }, required: ["proposal"], additionalProperties: false }
        : schema;
    return { type: "function", name, description: TOOL_DESCRIPTIONS[name], parameters, strict: true };
  });
  const planSale: FunctionTool = {
    type: "function",
    name: "plan_sale",
    description: SALE_PLAN_DESCRIPTION,
    parameters: providerSchema(z.toJSONSchema(SalePlanInput)) as Record<string, unknown>,
    strict: true,
  };
  return [...contractTools, ...insightToolDefinitions(), planSale];
}

function toProviderInput(input: TurnInput[]): ResponseInput {
  return input.map((item) =>
    item.kind === "message"
      ? { role: item.role, content: item.content }
      : { type: "function_call_output" as const, call_id: item.callId, output: item.output },
  );
}

/** The SDK default is ten minutes, far longer than a serverless request may run. */
const REQUEST_TIMEOUT_MS = 30_000;

export function createAgentModel(): AgentModel {
  const modelId = process.env.OPENAI_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!modelId || !apiKey) throw new Error("Model configuration is missing");
  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  const tools = toolDefinitions();

  return {
    modelId,
    async run(turn, onText) {
      const stream = await client.responses.create({
        model: modelId,
        instructions: turn.instructions,
        input: toProviderInput(turn.input),
        previous_response_id: turn.previousResponseId ?? undefined,
        tools,
        parallel_tool_calls: false,
        max_output_tokens: AGENT_LIMITS.max_output_tokens,
        stream: true,
      });

      const result: ModelResult = { responseId: null, calls: [], inputTokens: 0, outputTokens: 0 };
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") onText(event.delta);
        if (event.type === "response.output_item.done" && event.item.type === "function_call") {
          result.calls.push({ id: event.item.call_id, name: event.item.name, arguments: event.item.arguments });
        }
        // "incomplete" is a reply cut off at the output cap: still billed, so still counted.
        if (event.type === "response.completed" || event.type === "response.incomplete") {
          result.responseId = event.response.id;
          result.inputTokens = event.response.usage?.input_tokens ?? 0;
          result.outputTokens = event.response.usage?.output_tokens ?? 0;
        }
        if (event.type === "response.failed" || event.type === "error") {
          throw new Error(`Model stream failed: ${event.type}`);
        }
      }
      return result;
    },
  };
}
