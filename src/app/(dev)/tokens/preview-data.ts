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
    label: "Blocked",
    card: {
      ...base,
      status: "blocked",
      title: "Pay your credit card",
      amount_cents: 491_238,
      balance_after_cents: -207_226,
      primary_message: r4Message,
      max_passing_amount_cents: 234_012,
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
];

export const colourRoles = [
  ["background", "Canvas"],
  ["surface", "Cards"],
  ["surface-soft", "Inset surfaces"],
  ["foreground", "Primary text"],
  ["muted", "Secondary text"],
  ["border", "Dividers"],
  ["accent", "Coin / primary action"],
  ["gain", "Gain"],
  ["loss", "Loss + label"],
  ["warning", "Caution"],
  ["blocked", "Blocked + label"],
  ["pending", "Pending"],
] as const;

export const chartSeries = [
  { name: "Evergreen", value: 76 },
  { name: "Clay", value: 110 },
  { name: "Iris", value: 62 },
  { name: "River", value: 96 },
  { name: "Ochre", value: 85 },
  { name: "Berry", value: 50 },
];

export { money } from "../../../lib/format";
