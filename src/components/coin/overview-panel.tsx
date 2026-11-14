"use client";

import { useEffect, useState } from "react";
import type { AccountId, OverviewPayload } from "../../contracts";
import { api } from "../../lib/api";
import { signedMoney } from "../../lib/format";

/**
 * Coin's opening summary. Follows whichever account is open on the left; the
 * parent remounts it per account (key), so each starts from a clean state.
 */
export function OverviewPanel({ accountId }: { accountId: AccountId | null }) {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .overview(accountId)
      .then((payload) => !cancelled && setOverview(payload))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (failed) {
    return <p className="text-sm font-semibold text-muted">Coin couldn&rsquo;t load your summary. Refresh to try again.</p>;
  }
  if (!overview) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-soft" />
        <div className="h-12 animate-pulse rounded-coin-sm bg-surface-soft" />
        <div className="h-12 animate-pulse rounded-coin-sm bg-surface-soft" />
      </div>
    );
  }

  return (
    <div>
      <p className="text-base font-extrabold">{overview.greeting}</p>
      <ul className="mt-3 space-y-2">
        {overview.items.map((item) => (
          <li key={`${item.kind}-${item.title}`} className="rounded-coin-sm bg-surface-soft px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-extrabold">{item.title}</p>
              {item.amount_cents !== null && (
                <p className={`money shrink-0 text-sm font-extrabold ${item.amount_cents > 0 ? "text-gain" : ""}`}>
                  {signedMoney(item.amount_cents, true)}
                </p>
              )}
            </div>
            <p className="mt-0.5 text-sm font-medium text-muted">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
