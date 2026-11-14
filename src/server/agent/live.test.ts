/**
 * Live check against the real model (costs a fraction of a cent per prompt).
 * Skipped unless COIN_LIVE=1. Reads keys from .env.local in the main checkout
 * or this directory. Prints each prompt's events so a human can read them.
 *
 *   COIN_LIVE=1 npx vitest run src/server/agent/live.test.ts
 */
import { config } from "dotenv";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { POST as chatPost } from "../../app/api/chat/route";
import type { ChatEvent } from "../../contracts";
import { readEventStream } from "../../lib/chat";
import { seededTestDb } from "../db/test-db";
import { useDbForTests } from "../session/http";

const live = process.env.COIN_LIVE === "1";
for (const path of [".env.local", "../../coin/.env.local"]) {
  if (existsSync(resolve(path))) config({ path: resolve(path), override: false });
}

const PROMPTS = (process.env.COIN_LIVE_PROMPTS ?? "What's my chequing balance?|Move $2,000 from savings to chequing")
  .split("|");

function summarize(event: ChatEvent): string {
  switch (event.type) {
    case "text_delta":
      return event.text;
    case "tool_status":
      return `\n  [${event.label}]\n`;
    case "chart":
      return `\n  [chart: ${event.chart.source}, ${event.chart.data.length} points]\n`;
    case "action_card":
      return `\n  [card: ${event.card.status} "${event.card.title}" ${event.card.amount_cents} ${event.card.primary_message ?? ""}]\n`;
    case "error":
      return `\n  [error: ${event.code} ${event.message}]\n`;
    default:
      return "";
  }
}

describe.skipIf(!live)("live model", () => {
  it("answers each prompt through the real /api/chat path", async () => {
    const f = await seededTestDb();
    useDbForTests(f.db);
    let cookie = "";
    const transcript: string[] = [];

    for (const prompt of PROMPTS) {
      const response = await chatPost(
        new Request("http://coin.test/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ message: prompt, viewing_account_id: null }),
        }),
      );
      cookie = (response.headers.get("set-cookie") ?? cookie).split(";")[0];
      let line = `\n> ${prompt}\n`;
      const events: ChatEvent[] = [];
      for await (const event of readEventStream(response.body!)) {
        events.push(event);
        line += summarize(event);
      }
      transcript.push(line);
      expect(events.at(-1)?.type).toBe("done");
    }

    const [usage] = await f.db.query<{ calls: number; tokens_in: number; tokens_out: number; micro: number }>(
      `select count(*)::int as calls, coalesce(sum(input_tokens),0)::int as tokens_in,
       coalesce(sum(output_tokens),0)::int as tokens_out, coalesce(sum(cost_micro_usd),0)::int as micro from usage_ledger`,
    );
    transcript.push(`\nusage: ${usage.calls} model calls, ${usage.tokens_in} in / ${usage.tokens_out} out, $${(usage.micro / 1e6).toFixed(5)}`);
    writeFileSync(process.env.COIN_LIVE_OUT ?? "live-transcript.txt", transcript.join("\n"));
    useDbForTests(null);
  }, 180_000);
});
