// Display formatting. Money arrives as integer cents and leaves as text here only.

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const CAD_ROUND = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export function money(cents: number): string {
  return CAD.format(cents / 100);
}

/** "-$4,912.38" with a true minus sign; "+$12.00" when asked for a sign. */
export function signedMoney(cents: number, showPlus = false): string {
  if (cents < 0) return `\u2212${CAD.format(-cents / 100)}`;
  return showPlus ? `+${CAD.format(cents / 100)}` : CAD.format(cents / 100);
}

export function compactMoney(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 10_000) return `$${Math.round(dollars / 1_000)}k`;
  return CAD_ROUND.format(dollars);
}

/** "Nov 18" from "2026-11-18". */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

/** "in 3 days", "today", "tomorrow", "3 days ago". */
export function relativeDay(isoDate: string, today: string): string {
  const days = Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
