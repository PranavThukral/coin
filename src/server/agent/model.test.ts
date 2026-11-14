/**
 * The Responses API adapter against a stubbed SDK: which stream events end a
 * model call, and that token usage is read from every ending that is billed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const stub = vi.hoisted(() => ({
  events: [] as unknown[],
  clientOptions: null as Record<string, unknown> | null,
}));

vi.mock("openai", () => ({
  default: class {
    constructor(options: Record<string, unknown>) {
      stub.clientOptions = options;
    }
    responses = {
      create: async () =>
        (async function* () {
          yield* stub.events;
        })(),
    };
  },
}));

import { createAgentModel } from "./model";

const usage = { input_tokens: 1200, output_tokens: 900 };
let oldEnv: NodeJS.ProcessEnv;

beforeAll(() => {
  oldEnv = { ...process.env };
  process.env.OPENAI_MODEL = "test-model";
  process.env.OPENAI_API_KEY = "test-key";
});

afterAll(() => {
  process.env = oldEnv;
});

async function runWith(events: unknown[]) {
  stub.events = events;
  const texts: string[] = [];
  const turn = { instructions: "", input: [], previousResponseId: null };
  const result = await createAgentModel().run(turn, (text) => texts.push(text));
  return { result, text: texts.join("") };
}

describe("model adapter", () => {
  it("returns text, tool calls and usage from a completed response", async () => {
    const { result, text } = await runWith([
      { type: "response.output_text.delta", delta: "Hello" },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "get_accounts", arguments: "{}" } },
      { type: "response.completed", response: { id: "resp_1", usage } },
    ]);
    expect(text).toBe("Hello");
    expect(result.calls).toEqual([{ id: "c1", name: "get_accounts", arguments: "{}" }]);
    expect(result).toMatchObject({ responseId: "resp_1", inputTokens: 1200, outputTokens: 900 });
  });

  it("counts the tokens of a reply cut off at the output cap", async () => {
    const { result } = await runWith([
      { type: "response.output_text.delta", delta: "Your spending" },
      { type: "response.incomplete", response: { id: "resp_2", usage } },
    ]);
    expect(result).toMatchObject({ responseId: "resp_2", inputTokens: 1200, outputTokens: 900 });
  });

  it("throws when the provider reports a failed response", async () => {
    await expect(runWith([{ type: "response.failed", response: { id: "resp_3" } }])).rejects.toThrow("Model stream failed");
  });

  it("gives each request a timeout that fits inside a serverless function", () => {
    createAgentModel();
    expect(stub.clientOptions?.timeout).toBeLessThanOrEqual(30_000);
    expect(stub.clientOptions?.maxRetries).toBeLessThanOrEqual(1);
  });
});
