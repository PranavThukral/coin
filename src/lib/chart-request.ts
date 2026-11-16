// One way to write a chart request: name the source and title, set only the
// fields that source uses, and everything else is null (the contract's schema
// has no optional fields).
import type { ChartRequest } from "../contracts";

export function chartRequest(
  source: ChartRequest["source"],
  title: string,
  extra: Partial<Omit<ChartRequest, "source" | "title">> = {},
): ChartRequest {
  return {
    source,
    title,
    kind: null,
    from: null,
    to: null,
    compare_from: null,
    compare_to: null,
    account_id: null,
    category: null,
    ticker: null,
    days: null,
    ...extra,
  };
}
