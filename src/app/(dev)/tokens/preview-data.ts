// Static sample data for the token preview. Messages come from the contract,
// so the preview shows exactly the words users will see.
import {
  RULE_MESSAGES,
  RuleId,
  type ActionCard,
  type CheckOutcome,
  type CheckResult,
  type DailyOutflow,
} from "../../../contracts";

type Override = { outcome: CheckOutcome; message?: string; max?: number };

/** All nine checks: pass unless overridden. */
function checks(overrides: Partial<Record<RuleId, Override>> = {}): CheckResult[] {
  return RuleId.options.map((rule) => {
    const override = overrides[rule];
    return {
      rule,
      outcome: override?.outcome ?? "pass",
      message: override?.message ?? null,
      max_passing_amount_cents: override?.max ?? null,
      max_passing_quantity: null,
    };
  });
}

const r4Message = RULE_MESSAGES.R4_enough_money
  .replace("[account]", "chequing")
  .replace("[max]", "2,340.12");

const r3Message = RULE_MESSAGES.R3_new_recipient.replace("[name]", "Alex");

export const outflow: DailyOutflow = {
  date: "2026-11-15",
  used_cents: 125_000,
  pending_cents: 125_000,
  remaining_cents: 375_000,
  limit_cents: 500_000,
  items: [],
};

const base: ActionCard = {
  action_id: "preview",
  type: "bill_payment",
  status: "proposed",
  title: "Pay your credit card",
  amount_cents: 125_000,
  from_label: "Everyday Chequing",
  to_label: "Rewards Credit Card",
  balance_after_cents: 159_012,
  checks: checks({ R3_new_recipient: { outcome: "skip" }, R6_contribution_room: { outcome: "skip" }, R7_trade_limits: { outcome: "skip" } }),
  requires_second_confirmation: false,
  second_confirmed: false,
  max_passing_amount_cents: null,
  max_passing_quantity: null,
  primary_message: null,
  created_at: "2026-11-15T12:00:00Z",
  execute_at: null,
  executed_at: null,
  daily_outflow: outflow,
  origin: "message",
  destination: null,
};

export const exampleCards: { label: string; card: ActionCard }[] = [
  {
    label: "Proposed",
    card: {
      ...base,
      type: "transfer",
      title: "Move to Everyday Chequing",
      amount_cents: 200_000,
      from_label: "High-Interest Savings",
      to_label: "Everyday Chequing",
      balance_after_cents: 2_250_000,
      checks: checks({
        R2_saved_payee: { outcome: "skip" },
        R3_new_recipient: { outcome: "skip" },
        R5_daily_limit: { outcome: "skip" },
        R6_contribution_room: { outcome: "skip" },
        R7_trade_limits: { outcome: "skip" },
      }),
    },
  },
  {
    label: "Second confirmation",
    card: {
      ...base,
      type: "etransfer",
      title: "Send to Alex",
      amount_cents: 20_000,
      to_label: "Alex (new recipient)",
      balance_after_cents: 264_012,
      requires_second_confirmation: true,
      checks: checks({
        R2_saved_payee: { outcome: "skip" },
        R3_new_recipient: { outcome: "flag", message: r3Message },
        R6_contribution_room: { outcome: "skip" },
        R7_trade_limits: { outcome: "skip" },
      }),
    },
  },
  {
    label: "A smaller amount offered",
    card: {
      ...base,
      status: "blocked",
      title: "Pay your credit card",
      amount_cents: 491_238,
      balance_after_cents: -207_226,
      primary_message: r4Message,
      max_passing_amount_cents: 234_012,
      destination: { label: "Rewards Credit Card", before_cents: 491_238, after_cents: 0 },
      checks: checks({
        R3_new_recipient: { outcome: "skip" },
        R4_enough_money: { outcome: "fail", message: r4Message, max: 234_012 },
        R6_contribution_room: { outcome: "skip" },
        R7_trade_limits: { outcome: "skip" },
      }),
    },
  },
  {
    label: "Pending undo",
    card: { ...base, status: "pending_undo", title: "Pay your credit card", execute_at: null },
  },
  {
    label: "Executed",
    card: { ...base, status: "executed", title: "Paid your credit card", executed_at: "2026-11-15T12:01:00Z" },
  },
  { label: "Cancelled", card: { ...base, status: "cancelled", title: "Pay your credit card" } },
  {
    label: "Blocked",
    card: {
      ...base,
      type: "etransfer",
      status: "blocked",
      title: "Send to New contact",
      amount_cents: 50_000,
      to_label: "New contact",
      primary_message: "You didn’t ask me to move money.",
      checks: checks({ R0_intent: { outcome: "fail", message: "You didn’t ask me to move money." } }),
    },
  },
];

const step = (id: string, title: string, amount: number, type: ActionCard["type"] = "trade"): ActionCard => ({
  ...base,
  action_id: id,
  type,
  title,
  amount_cents: amount,
  origin: "plan",
});

/** A sale plan: four sales, then the proceeds move to chequing. */
export const examplePlan: ActionCard[] = [
  step("plan-1", "Sell 16 shares of FERN.CX", 115_360),
  step("plan-2", "Sell 26 shares of LUMA.CX", 123_890),
  step("plan-3", "Sell 7 shares of NRTH.CX", 127_680),
  step("plan-4", "Sell 37 shares of ORCA.CX", 125_430),
  { ...step("plan-5", "Move to Everyday Chequing", 492_360, "transfer"), to_label: "Everyday Chequing" },
];

export const chartSeries = [
  { name: "Housing", value: 76 },
  { name: "Groceries", value: 110 },
  { name: "Dining", value: 62 },
  { name: "Shopping", value: 96 },
  { name: "Transport", value: 85 },
  { name: "Other", value: 50 },
];

export { money } from "../../../lib/format";
