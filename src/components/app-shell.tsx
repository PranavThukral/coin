"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountId as AccountIdSchema, type AccountView } from "../contracts";
import type { AccountId } from "../contracts";
import { liveTransport, type ChatTransport } from "../lib/chat";
import { Mascot } from "./coin/mascot";
import { CoinSidebar } from "./coin/sidebar";
import { Dashboard } from "./dashboard/dashboard";

const MIN_WIDTH = 340;
const DEFAULT_WIDTH = 420;
const WIDTH_KEY = "coin.sidebarWidth";

function clampWidth(width: number): number {
  const max = typeof window === "undefined" ? 720 : Math.max(MIN_WIDTH, window.innerWidth * 0.5);
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), max));
}

function readSavedWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    return saved ? clampWidth(saved) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function useSidebarWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  // Restore the saved width after hydration (the server renders the default).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(readSavedWidth()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const startDrag = (event: React.PointerEvent) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: React.PointerEvent) => {
    if (dragging.current) setWidth(clampWidth(window.innerWidth - event.clientX));
  };
  const endDrag = () => {
    dragging.current = false;
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // Storage can be unavailable (private mode); the width just won't persist.
    }
  };
  const nudge = (delta: number) => setWidth((current) => clampWidth(current + delta));

  return { width, startDrag, drag, endDrag, nudge };
}

function TopBar({ mode }: { mode: "live" | "demo" }) {
  return (
    <header className="flex items-center justify-between gap-4 pb-8">
      <Link href="/" className="flex items-center gap-2.5">
        <Mascot size={30} />
        <span className="text-xl font-extrabold tracking-tight">Coin</span>
      </Link>
      <span
        className={`rounded-full px-3 py-1 text-xs font-extrabold ${
          mode === "live" ? "bg-accent-soft text-accent" : "bg-gold-soft text-gold-deep"
        }`}
      >
        {mode === "live" ? "Live mode" : "Scripted demo"}
      </span>
    </header>
  );
}

/** `?account=acc_tfsa` deep-links straight into an account. */
function useDeepLinkedAccount(): [AccountId | null, (id: AccountId | null) => void] {
  const [accountId, setAccountId] = useState<AccountId | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const fromUrl = new URLSearchParams(window.location.search).get("account");
      if (fromUrl && AccountIdSchema.safeParse(fromUrl).success) setAccountId(fromUrl as AccountId);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return [accountId, setAccountId];
}

export function AppShell({ transport, mode }: { transport: ChatTransport; mode: "live" | "demo" }) {
  const [viewing, setViewing] = useDeepLinkedAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const sidebar = useSidebarWidth();

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const setOpenAccount = (account: AccountView | null) => setViewing(account?.id ?? null);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-10">
        <div className="mx-auto max-w-5xl">
          <TopBar mode={mode} />
          <Dashboard openAccountId={viewing} onOpenAccount={setOpenAccount} refreshKey={refreshKey} />
        </div>
      </main>

      <div className={collapsed ? "hidden" : "relative flex shrink-0 border-l border-border"} style={{ width: sidebar.width }}>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Coin"
          tabIndex={0}
          onPointerDown={sidebar.startDrag}
          onPointerMove={sidebar.drag}
          onPointerUp={sidebar.endDrag}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") sidebar.nudge(24);
            if (event.key === "ArrowRight") sidebar.nudge(-24);
          }}
          className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize hover:bg-accent/20 focus-visible:bg-accent/30"
        />
        <div className="h-full w-full">
          <CoinSidebar
            transport={transport}
            viewingAccountId={viewing}
            onActionSettled={refresh}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Open Coin"
          className="fixed bottom-6 right-6 grid h-16 w-16 place-items-center rounded-full bg-surface-ink shadow-coin ring-4 ring-gold/30 transition-transform hover:scale-105"
        >
          <Mascot size={44} />
        </button>
      )}
    </div>
  );
}

export function LiveApp() {
  return <AppShell transport={liveTransport} mode="live" />;
}
