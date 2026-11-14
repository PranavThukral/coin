// Browser-side API client. The browser only talks to our own /api routes;
// action calls only ever send an action id (and a confirmation email).
import type {
  AccountView,
  ActionCard,
  ChartPayload,
  DailyOutflow,
  HoldingView,
  OverviewPayload,
  Transaction,
} from "../contracts";

/** Read tools wrap free text from the ledger; the UI shows it as plain text. */
export type Wrapped<T> = { untrusted_data_note: string; data: T };

export function unwrap<T>(value: Wrapped<T> | T): T {
  if (value && typeof value === "object" && "untrusted_data_note" in value) {
    return (value as Wrapped<T>).data;
  }
  return value as T;
}

export interface UpcomingEvent {
  label: string;
  date: string;
  amount_cents: number;
  projected_balance_cents: number;
}

export interface DashboardPayload {
  today: string;
  accounts: AccountView[];
  recent_transactions: Wrapped<Transaction[]>;
  upcoming: Wrapped<UpcomingEvent[]>;
  net_worth: ChartPayload;
  daily_outflow: DailyOutflow;
}

export interface AccountDetailPayload {
  account: AccountView;
  transactions: Wrapped<Transaction[]>;
  holdings: HoldingView[] | null;
  chart: ChartPayload;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body.error ?? "Something went wrong. Try again.");
  }
  return body as T;
}

export const api = {
  dashboard: () => request<DashboardPayload>("/api/dashboard"),
  account: (id: string) => request<AccountDetailPayload>(`/api/accounts/${id}`),
  overview: (accountId: string | null) =>
    request<OverviewPayload>(accountId ? `/api/overview?account_id=${accountId}` : "/api/overview"),
  actions: () => request<ActionCard[]>("/api/actions"),
  approve: (id: string) => request<ActionCard>(`/api/actions/${id}/approve`, { method: "POST" }),
  dismiss: (id: string) => request<ActionCard>(`/api/actions/${id}/dismiss`, { method: "POST" }),
  undo: (id: string) => request<ActionCard>(`/api/actions/${id}/undo`, { method: "POST" }),
  executeNow: (id: string) => request<ActionCard>(`/api/actions/${id}/execute-now`, { method: "POST" }),
  confirmRecipient: (id: string, email: string) =>
    request<ActionCard>(`/api/actions/${id}/confirm-recipient`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
};
