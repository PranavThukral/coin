"use client";

import { useEffect, useState } from "react";
import type { AccountId, OverviewPayload } from "../../contracts";
import { api } from "../../lib/api";
import { signedMoney } from "../../lib/format";

type OverviewItem = OverviewPayload["items"][number];

function Item({ item, index }: { item: OverviewItem; index: number }) {
  return (
    <li className="coin-rise px-4 py-3" style={{ "--i": index + 1 } as React.CSSProperties}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold">{item.title}</p>
        {item.amount_cents !== null && (
          <p className={`money shrink-0 text-sm font-bold ${item.amount_cents > 0 ? "text-gain" : ""}`}>
            {signedMoney(item.amount_cents, true)}
          </p>
        )}
      </div>
      <p className="mt-0.5 text-[13px] font-medium leading-snug text-muted">{item.detail}</p>
    </li>
  );
}

/**
 * Coin's opening summary: what happened since the last visit, revealed one
 * item at a time. Follows whichever account is open on the left; the parent
 * remounts it per account (key), so each starts from a clean state.
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
        <div className="h-5 w-2/3 animate-pulse rounded bg-surface-soft" />
        <div className="h-16 animate-pulse rounded-coin-sm bg-surface-soft" />
        <div className="h-16 animate-pulse rounded-coin-sm bg-surface-soft" />
      </div>
    );
  }

  return (
    <div>
      <p className="coin-rise text-xs font-medium text-subtle">{overview.greeting}</p>
      <ul className="mt-2 divide-y divide-border rounded-coin border border-border">
        {overview.items.map((item, index) => (
          <Item key={`${item.kind}-${item.title}`} item={item} index={index} />
        ))}
      </ul>
    </div>
  );
}
