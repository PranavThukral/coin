/**
 * The 40-request evaluation, against the real model through /api/chat.
 *
 *   COIN_EVAL=1 [COIN_EVAL_RUNS=3] npx vitest run eval/run.test.ts
 *
 * Uses EVAL_OPENAI_API_KEY (a separate key, so evals never spend the public
 * demo's budget). Refuses to run on the public key unless
 * COIN_EVAL_ALLOW_MAIN_KEY=1. Each case gets a fresh visitor session; an
 * auto-approver confirms, approves and executes every approvable card, so
 * "nothing unsafe executed" is measured. Writes eval/results/latest.md and a
 * timestamped JSON with every failure.
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { POST as chatPost } from "../src/app/api/chat/route";
import { Proposal, type ActionCard, type ChatEvent } from "../src/contracts";
import { readEventStream } from "../src/lib/chat";
import { approve, confirmRecipient, executeNow } from "../src/server/actions/service";
import { seededTestDb } from "../src/server/db/test-db";
import type { Db } from "../src/server/db/types";
import { useDbForTests as setTestDatabase } from "../src/server/session/http";
import { CASES, type EvalCase } from "./cases";
import { score, summarise, type Observed, type Verdict } from "./score";

const enabled = process.env.COIN_EVAL === "1";
config({ path: resolve(".env.local"), override: false });

function useEvalKey(): void {
  if (process.env.EVAL_OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.EVAL_OPENAI_API_KEY;
  } else if (process.env.COIN_EVAL_ALLOW_MAIN_KEY !== "1") {
    throw new Error("Set EVAL_OPENAI_API_KEY in .env.local (or COIN_EVAL_ALLOW_MAIN_KEY=1 to use the main key).");
  }
}

async function ask(prompt: string, index: number) {
  const response = await chatPost(
    new Request("http://coin.test/api/chat", {
      method: "POST",
      // A distinct address per case keeps per-visitor limits from skewing the run.
      headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(index / 250)}.${index % 250}` },
      body: JSON.stringify({ message: prompt, viewing_account_id: null }),
    }),
  );
  const sessionId = (response.headers.get("set-cookie") ?? "").split(";")[0].split("=")[1];
  const events: ChatEvent[] = [];
  for await (const event of readEventStream(response.body!)) events.push(event);
  return { sessionId, events };
}

/** The auto-approver: confirm new recipients, approve, execute now. */
async function approveEverything(db: Db, sessionId: string, cards: ActionCard[], payloads: Observed["payloads"]) {
  const now = new Date();
  for (const card of cards.filter((c) => c.status === "proposed")) {
    try {
      const p = payloads[card.action_id];
      if (card.requires_second_confirmation && p?.type === "etransfer" && p.recipient.kind === "new") {
        await confirmRecipient(db, sessionId, card.action_id, p.recipient.email ?? "auto.approver@example.com");
      }
      await approve(db, sessionId, card.action_id, now);
      await executeNow(db, sessionId, card.action_id, now);
    } catch {
      // A refusal here is the system working; the final status records it.
    }
  }
}

async function runCase(db: Db, c: EvalCase, index: number): Promise<{ verdict: Verdict; observed: Observed }> {
  const { sessionId, events } = await ask(c.prompt, index);
  const cards = events.flatMap((e) => (e.type === "action_card" ? [e.card] : []));
  const text = events.flatMap((e) => (e.type === "text_delta" ? [e.text] : [])).join("");
  const error = events.find((e) => e.type === "error");

  const rows = await db.query<{ id: string; payload: unknown }>(
    "select id, payload from actions where session_id = $1",
    [sessionId],
  );
  const payloads = Object.fromEntries(rows.map((r) => [r.id, Proposal.safeParse(r.payload).data ?? null]));
  await approveEverything(db, sessionId, cards, payloads);

  const final = await db.query<{ id: string; status: string }>("select id, status from actions where session_id = $1", [sessionId]);
  const [session] = await db.query<{ today_date: string }>("select today_date from sessions where id = $1", [sessionId]);
  const observed: Observed = {
    today: session?.today_date ?? "",
    text,
    charts: events.filter((e) => e.type === "chart").length,
    cards,
    payloads,
    finalStatus: Object.fromEntries(final.map((r) => [r.id, r.status])),
    error: error?.type === "error" ? `${error.code}: ${error.message}` : null,
  };
  return { verdict: score(c, observed), observed };
}

function markdown(summary: ReturnType<typeof summarise>, verdicts: Verdict[], cost: number): string {
  const lines = [
    `## Evaluation: ${summary.runs} run(s) x 40 requests, auto-approver on`,
    "",
    "| Measure | Count |",
    "| --- | --- |",
    `| Correct answers and proposals | ${summary.correct} / ${summary.total} |`,
    `| Unsafe proposals Coin made | ${summary.unsafeProposalsMade} |`,
    `| Unsafe proposals that reached an approval card | ${summary.unsafeReachedCard} |`,
    `| Unsafe actions executed | ${summary.unsafeExecuted} |`,
    "",
    "| Group | Correct |",
    "| --- | --- |",
    ...Object.entries(summary.byGroup).map(([group, g]) => `| ${group} | ${g.correct} / ${g.total} |`),
    "",
    `Model cost for the run: $${cost.toFixed(4)}`,
    "",
    "### Failures",
    "",
    ...verdicts.filter((v) => !v.correct).map((v) => `- **${v.id}** (${v.group}): ${v.reasons.join("; ")}`),
  ];
  return lines.join("\n");
}

describe.skipIf(!enabled)("evaluation", () => {
  it("runs the 40 cases with the auto-approver", async () => {
    useEvalKey();
    const runs = Number(process.env.COIN_EVAL_RUNS ?? 1);
    const verdicts: Verdict[] = [];
    const details: unknown[] = [];
    let cost = 0;

    for (let run = 0; run < runs; run += 1) {
      const { db } = await seededTestDb();
      setTestDatabase(db);
      for (const [index, c] of CASES.entries()) {
        const { verdict, observed } = await runCase(db, c, index);
        verdicts.push(verdict);
        details.push({ run, ...verdict, text: observed.text, cards: observed.cards.map((k) => k.title), finalStatus: observed.finalStatus });
      }
      const [usage] = await db.query<{ micro: number }>("select coalesce(sum(cost_micro_usd),0)::int as micro from usage_ledger");
      cost += usage.micro / 1e6;
      setTestDatabase(null);
    }

    const summary = summarise(verdicts, runs);
    mkdirSync(resolve("eval/results"), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(resolve(`eval/results/${stamp}.json`), JSON.stringify({ summary, cost, details }, null, 2));
    writeFileSync(resolve("eval/results/latest.md"), markdown(summary, verdicts, cost));
    expect(summary.total).toBe(40 * runs);
  }, 3_600_000);
});
