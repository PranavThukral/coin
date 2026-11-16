/**
 * One turn of Coin: call the model, run the tools it asks for, and repeat
 * until it answers in text or a limit is reached.
 *
 * The model only proposes. A propose_action call is handed to proposeAction,
 * where code checks it against the user's stored message and decides.
 */
import { ZodError } from "zod";
import { AGENT_LIMITS, ChartRequest, ToolInputs, type AccountId, type ChatEvent, type ToolName } from "../../contracts";
import { proposeAction } from "../actions/service";
import type { Db } from "../db/types";
import { AppError } from "../errors";
import * as q from "../db/queries";
import { planSale } from "../actions/planner";
import { CARD_BILL_ID, type ActionCard } from "../../contracts";
import { loadCardPayoff } from "../tools/payoff";
import { buildChart } from "../tools/charts";
import { chartSummaryForModel } from "./chart-summary";
import { followUps, type ToolUse } from "./follow-ups";
import { isInsightTool, runInsightTool, type InsightToolName } from "./insight-tools";
import { runReadTool } from "../tools/read";
import type { AgentModel, ModelCall, TurnInput } from "./model";
import { isUnreadableProposal, proposalResultForModel, repairProposalArguments } from "./proposal-tool";

export type HistoryMessage = { role: "user" | "assistant"; content: string };

type Options = {
  db: Db;
  sessionId: string;
  userMessageId: string;
  /** The user's message, so a follow-up suggestion never repeats it. */
  userText?: string;
  history: HistoryMessage[];
  viewingAccountId: AccountId | null;
  model: AgentModel;
  systemPrompt: string;
  emit: (event: ChatEvent) => void;
  onUsage?: (input: number, output: number) => Promise<void>;
  beforeCall?: () => Promise<void>;
  /** True once the visitor has left; no further model calls are started. */
  cancelled?: () => boolean;
  /** Milliseconds clock, replaceable in tests. */
  clock?: () => number;
};

/** Stop starting new model calls after this long, so the reply ends before the host's time limit. */
const TURN_TIME_LIMIT_MS = 45_000;
/** One retry when the model's proposal arguments could not be read. */
const MAX_PROPOSAL_RETRIES = 1;

export const GENERIC_ERROR = "Coin can't answer right now. Try again in a moment.";
const NOTHING_TO_SHOW = "I couldn't put an answer together for that. Try asking it another way.";

const DEFAULT_STATUS = "Reading your accounts\u2026";
const STATUS_LABELS: Partial<Record<ToolName | InsightToolName | "plan_sale", string>> = {
  get_money_snapshot: "Looking at the whole picture\u2026",
  get_cash_flow: "Adding up money in and out\u2026",
  get_category_pace: "Comparing with a typical month\u2026",
  get_subscriptions: "Finding your subscriptions\u2026",
  plan_savings_goal: "Working out your goal\u2026",
  explain_net_worth_change: "Working out what moved your net worth\u2026",
  plan_card_payoff: "Working out how to pay your card\u2026",
  propose_action: "Checking your action\u2026",
  render_chart: "Building your chart\u2026",
  get_transactions: "Reading your transactions\u2026",
  summarize_spending: "Adding up your spending\u2026",
  compare_spending: "Comparing your spending\u2026",
  find_recurring_changes: "Checking your recurring charges\u2026",
  get_holdings: "Looking at your investments\u2026",
  get_portfolio_performance: "Looking at your investments\u2026",
  get_price_history: "Looking up prices\u2026",
  get_upcoming: "Checking what's coming up\u2026",
  get_bills: "Checking your bills\u2026",
  get_contacts: "Checking your contacts\u2026",
  get_contribution_room: "Checking your contribution room\u2026",
  check_affordability: "Projecting your balance\u2026",
};

function statusLabel(toolName: string): string {
  return STATUS_LABELS[toolName as keyof typeof STATUS_LABELS] ?? DEFAULT_STATUS;
}

type Counts = {
  proposals: number;
  proposalAttempts: number;
  charts: number;
  uses: ToolUse[];
  /** Each action proposed in this reply, so the same one is never shown twice. */
  proposed: string[];
};

function notDone(reason: string): Record<string, unknown> {
  return { outcome: "not_done", reason };
}

async function propose(options: Options, args: unknown, counts: Counts): Promise<unknown> {
  const proposalLimitReached = counts.proposals >= AGENT_LIMITS.max_proposals_per_turn;
  if (proposalLimitReached || counts.proposalAttempts >= AGENT_LIMITS.max_proposals_per_turn + MAX_PROPOSAL_RETRIES) {
    return notDone(`Only ${AGENT_LIMITS.max_proposals_per_turn} actions fit in one reply. Ask the user to send the rest separately.`);
  }
  counts.proposalAttempts += 1;

  const contacts = await q.contacts(options.db, options.sessionId);
  const repaired = repairProposalArguments(args, contacts);
  const fingerprint = JSON.stringify(repaired);
  if (counts.proposed.includes(fingerprint)) {
    return notDone("That action is already on screen. Don't propose it again.");
  }
  counts.proposed.push(fingerprint);
  const card = await proposeAction(options.db, options.sessionId, options.userMessageId, repaired);
  if (isUnreadableProposal(card)) {
    // Recorded as blocked, but there is nothing meaningful to show the user.
    return proposalResultForModel(card);
  }
  counts.proposals += 1;
  options.emit({ type: "action_card", card });
  const result = proposalResultForModel(card);
  if (isCardPaymentThatDoesntFit(card, repaired)) {
    // The card offers what chequing can spare; these are the ways to cover the rest.
    const payoff = await loadCardPayoff(options.db, options.sessionId);
    const others = payoff.ways.filter((way) => way.id !== "pay_part_now");
    counts.uses.push({ name: "plan_card_payoff", result: { suggested_requests: others.flatMap((way) => way.request ?? []) } });
    result.ways_to_cover_the_rest = others.map((way) => way.summary);
    result.watch_out = payoff.watch_out;
  }
  return result;
}

/** A payment to the user's own credit card that was held back only because of the amount. */
function isCardPaymentThatDoesntFit(card: ActionCard, proposal: unknown): boolean {
  const billId = (proposal as { bill_id?: unknown } | null)?.bill_id;
  return billId === CARD_BILL_ID && card.status === "blocked" && card.max_passing_amount_cents !== null;
}

async function drawChart(options: Options, args: unknown, counts: Counts): Promise<unknown> {
  if (counts.charts >= AGENT_LIMITS.max_charts_per_turn) {
    return notDone(`Only ${AGENT_LIMITS.max_charts_per_turn} charts fit in one reply.`);
  }
  const chart = await buildChart(options.db, options.sessionId, ChartRequest.parse(args));
  counts.charts += 1;
  options.emit({ type: "chart", chart });
  return chartSummaryForModel(chart);
}

/** An insight tool's numbers go to the model; its chart, if it drew one, goes to the user. */
async function runInsight(options: Options, name: InsightToolName, args: unknown, counts: Counts): Promise<unknown> {
  const { output, chart } = await runInsightTool(options.db, options.sessionId, name, args);
  if (!chart || counts.charts >= AGENT_LIMITS.max_charts_per_turn) return output;
  counts.charts += 1;
  options.emit({ type: "chart", chart });
  return { chart_shown: chart.title, result: output };
}

/** A sale plan is one proposal, however many steps code gives it. Every step is a card. */
async function planSaleSteps(options: Options, args: unknown, counts: Counts): Promise<unknown> {
  if (counts.proposals > 0) {
    return notDone("A plan can't share a reply with another action. Ask the user to send it separately.");
  }
  const plan = await planSale(options.db, options.sessionId, options.userMessageId, args);
  if (plan.cards.length > 0) counts.proposals += 1;
  for (const card of plan.cards) options.emit({ type: "action_card", card });
  return plan.output;
}

async function executeTool(options: Options, call: ModelCall, counts: Counts): Promise<unknown> {
  if (call.name === "plan_sale") {
    return planSaleSteps(options, JSON.parse(call.arguments), counts);
  }
  if (isInsightTool(call.name)) {
    return runInsight(options, call.name, JSON.parse(call.arguments), counts);
  }
  if (!(call.name in ToolInputs)) {
    return notDone(`There is no tool called ${call.name}.`);
  }
  const name = call.name as ToolName;
  const parsed = JSON.parse(call.arguments);
  if (name === "propose_action") {
    // The tool's schema wraps the proposal, since a tool's root must be an object.
    return propose(options, parsed?.proposal ?? parsed, counts);
  }
  if (name === "render_chart") {
    return drawChart(options, parsed, counts);
  }
  return runReadTool(options.db, options.sessionId, name, parsed);
}

/**
 * What the model sees when a tool call throws. Bad arguments are named so it
 * can correct them; anything else is logged here and described as a technical
 * problem, so the model never presents it as a rule or blames the user.
 */
function toolFailure(toolName: string, error: unknown): Record<string, unknown> {
  const fixAndRetry = "Correct the arguments and call the tool again.";
  if (error instanceof ZodError) {
    const problems = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    return { outcome: "invalid_arguments", problems, next_step: fixAndRetry };
  }
  if (error instanceof SyntaxError) {
    return { outcome: "invalid_arguments", problems: ["The arguments were not valid JSON."], next_step: fixAndRetry };
  }
  if (error instanceof AppError && error.code === "invalid") {
    return { outcome: "invalid_arguments", problems: [error.message], next_step: fixAndRetry };
  }
  console.error(`Tool ${toolName} failed`, error);
  return {
    outcome: "tool_unavailable",
    how_to_reply:
      "This is a technical problem on Coin's side, not a rule and not the user's doing. "
      + "Say briefly that you couldn't load that just now and suggest asking again.",
  };
}

async function runTools(options: Options, calls: ModelCall[], counts: Counts): Promise<TurnInput[]> {
  const outputs: TurnInput[] = [];
  for (const call of calls) {
    options.emit({ type: "tool_status", label: statusLabel(call.name) });
    let result: unknown;
    try {
      result = await executeTool(options, call, counts);
    } catch (error) {
      result = toolFailure(call.name, error);
    }
    counts.uses.push({ name: call.name, result });
    outputs.push({ kind: "tool_result", callId: call.id, output: JSON.stringify(result) });
  }
  return outputs;
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

/** Wraps emit to remember whether the user has been shown anything yet. */
function visibleOutputTracker(emit: Options["emit"]) {
  let shown = false;
  const charted = new Set<string>();
  return {
    emit(event: ChatEvent) {
      if (event.type === "chart") {
        if (charted.has(event.chart.source)) return;
        charted.add(event.chart.source);
      }
      if (event.type === "text_delta" || event.type === "chart" || event.type === "action_card") shown = true;
      emit(event);
    },
    nothingShown: () => !shown,
  };
}

function reportFailure(emit: Options["emit"], error: unknown): void {
  if (error instanceof AppError && error.code === "unavailable") {
    emit({ type: "error", code: "budget_exhausted", message: error.message });
    return;
  }
  console.error("Agent run failed", error);
  emit({ type: "error", code: "model_error", message: GENERIC_ERROR });
}

export async function runAgent(options: Options): Promise<void> {
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const output = visibleOutputTracker(options.emit);
  const run: Options = { ...options, emit: output.emit };
  const writer = paragraphEmitter(output.emit);
  const counts: Counts = { proposals: 0, proposalAttempts: 0, charts: 0, uses: [], proposed: [] };
  let input: TurnInput[] = options.history.map((m) => ({ kind: "message", role: m.role, content: m.content }));
  let previousResponseId: string | null = null;

  try {
    for (let step = 0; step < AGENT_LIMITS.max_tool_steps; step += 1) {
      const outOfTime = clock() - startedAt > TURN_TIME_LIMIT_MS;
      if (outOfTime || options.cancelled?.()) break;
      await options.beforeCall?.();
      writer.startStep();
      const result = await options.model.run(
        { instructions: options.systemPrompt, input, previousResponseId },
        (delta) => writer.text(delta),
      );
      await options.onUsage?.(result.inputTokens, result.outputTokens);
      if (result.calls.length === 0) break;
      previousResponseId = result.responseId;
      input = await runTools(run, result.calls, counts);
    }
    if (output.nothingShown()) writer.text(NOTHING_TO_SHOW);
    const suggestions = followUps(counts.uses, options.userText ?? "");
    if (suggestions.length > 0) options.emit({ type: "suggestions", items: suggestions });
  } catch (error) {
    reportFailure(options.emit, error);
  } finally {
    options.emit({ type: "done" });
  }
}
