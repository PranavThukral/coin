"use client";

import { useEffect, useState } from "react";

/** The JSON at `url`, or null until it loads. Loads again when the url or `refreshKey` changes. */
export function useFetched<T>(url: string, refreshKey = 0): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => !cancelled && payload && setData(payload))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url, refreshKey]);
  return data;
}
