"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccountId as AccountIdSchema, type AccountView } from "../contracts";
import type { AccountId } from "../contracts";
import { api } from "../lib/api";
import { demoTransport, liveTransport, type ChatTransport } from "../lib/chat";
import { Mascot } from "./coin/mascot";
import { CoinSidebar } from "./coin/sidebar";
import { useCoinChat } from "./coin/use-coin-chat";
import { DemoPlayer } from "./demo/demo-player";
import { Dashboard } from "./dashboard/dashboard";
import { NavBar, NavRail, type View } from "./shell/nav";

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

/** Dragging the panel this far past its narrowest hides it; the Coin button brings it back. */
const HIDE_BELOW = MIN_WIDTH - 110;

function useSidebarWidth(onHide: () => void) {
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
    if (!dragging.current) return;
    const wanted = window.innerWidth - event.clientX;
    if (wanted < HIDE_BELOW) {
      dragging.current = false;
      onHide();
      return;
    }
    setWidth(clampWidth(wanted));
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

/**
 * One /api/session call before anything else, so the dashboard and Coin don't
 * race to create two different sessions on a first visit.
 */
function useSessionReady(): { ready: boolean; failed: string | null } {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .session()
      .then(() => !cancelled && setReady(true))
      .catch((error: Error) => !cancelled && setFailed(error.message));
    return () => {
      cancelled = true;
    };
  }, []);
  return { ready, failed };
}

export function AppShell({ transport, mode }: { transport: ChatTransport; mode: "live" | "demo" }) {
  const session = useSessionReady();
  if (session.failed) {
    return (
      <div className="coin-canvas grid min-h-dvh place-items-center p-6 text-center text-foreground">
        <div>
          <Mascot size={56} mood="concerned" />
          <p className="mt-4 text-lg font-extrabold">{session.failed}</p>
        </div>
      </div>
    );
  }
  if (!session.ready) {
    return (
      <div className="coin-canvas grid min-h-dvh place-items-center" aria-label="Opening your accounts">
        <Mascot size={56} mood="thinking" />
      </div>
    );
  }
  return <ReadyShell transport={transport} mode={mode} />;
}

const DESKTOP = "(min-width: 1024px)";

/**
 * Whether Coin is open. Until the visitor chooses, it follows the screen:
 * open beside the dashboard on a wide screen, tucked behind its button on a
 * phone. In the scripted demo it opens on a phone as soon as Coin has something to say.
 */
function useCoinOpen(hasMessages: boolean, mode: "live" | "demo") {
  const [choice, setChoice] = useState<boolean | null>(null);
  useEffect(() => {
    if (mode !== "demo" || !hasMessages || choice !== null) return;
    if (window.matchMedia(DESKTOP).matches) return;
    const frame = requestAnimationFrame(() => setChoice(true));
    return () => cancelAnimationFrame(frame);
  }, [mode, hasMessages, choice]);
  return { choice, open: () => setChoice(true), close: () => setChoice(false) };
}

/** Where the Coin panel sits for each choice (null = follow the screen size). */
function panelClass(choice: boolean | null): string {
  const placed = "fixed inset-0 z-40 lg:relative lg:inset-auto lg:z-auto lg:shrink-0 lg:py-3 lg:pr-3";
  if (choice === null) return `hidden lg:flex ${placed}`;
  return choice ? `flex ${placed}` : "hidden";
}

function OpenCoinButton({ choice, lifted, onOpen }: { choice: boolean | null; lifted: boolean; onOpen: () => void }) {
  if (choice === true) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open Coin"
      className={`coin-rise fixed right-5 z-30 grid h-16 w-16 place-items-center rounded-full bg-surface shadow-coin-float transition-transform hover:scale-105 ${
        lifted ? "bottom-56 lg:bottom-40" : "bottom-5"
      } ${choice === null ? "lg:hidden" : ""}`}
    >
      <Mascot size={44} />
    </button>
  );
}

function ResizeHandle({ sidebar }: { sidebar: ReturnType<typeof useSidebarWidth> }) {
  return (
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
      title="Drag to resize. Drag all the way right to hide Coin."
      className="group absolute inset-y-6 -left-3 z-10 hidden w-3 cursor-col-resize place-items-center lg:grid"
    >
      <span className="h-12 w-1 rounded-full bg-border-strong opacity-40 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </div>
  );
}

function ReadyShell({ transport, mode }: { transport: ChatTransport; mode: "live" | "demo" }) {
  const [viewing, setViewing] = useDeepLinkedAccount();
  const [view, setView] = useState<View>("home");
  const [prefill, setPrefill] = useState<{ text: string; id: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const setOpenAccount = (account: AccountView | null) => setViewing(account?.id ?? null);
  const coin = useCoinChat(transport, refresh);
  const panel = useCoinOpen(coin.chat.messages.length > 0, mode);
  const sidebar = useSidebarWidth(panel.close);
  const type = useCallback((text: string) => setPrefill({ text, id: Math.random() }), []);
  const demo = mode === "demo";
  const openView = (next: View) => {
    setViewing(null);
    setView(next);
  };
  /** A quick action: open Coin with the request written and ready to edit. */
  const compose = (text: string) => {
    panel.open();
    setPrefill({ text, id: Date.now() });
  };

  return (
    <div className="coin-canvas flex h-dvh overflow-hidden text-foreground">
      <NavRail view={view} accountId={viewing} mode={mode} refreshKey={refreshKey} onView={openView} onAccount={setViewing} />
      {/* The dashboard scrolls; in the demo, the player is docked under it and never covers it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <NavBar view={view} accountId={viewing} mode={mode} onView={openView} />
        <main className={`min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 lg:px-10 ${demo ? "pb-60 lg:pb-10" : "pb-24"}`}>
          <div className="@container mx-auto max-w-5xl">
            <Dashboard
              view={view}
              openAccountId={viewing}
              onOpenAccount={setOpenAccount}
              refreshKey={refreshKey}
              onAsk={demo ? undefined : (question) => coin.send(question, viewing)}
              onCompose={demo ? undefined : compose}
            />
          </div>
        </main>
        {demo && <DemoPlayer coin={coin} viewing={viewing} setViewing={setViewing} onType={type} />}
      </div>

      <div
        className={`${panelClass(panel.choice)} ${demo ? "max-lg:bottom-52" : ""}`}
        style={{ "--coin-width": `${sidebar.width}px` } as React.CSSProperties}
      >
        <ResizeHandle sidebar={sidebar} />
        <div className="h-full w-full lg:w-(--coin-width)">
          <CoinSidebar coin={coin} viewingAccountId={viewing} onCollapse={panel.close} replayOnly={demo} prefill={prefill} />
        </div>
      </div>

      <OpenCoinButton choice={panel.choice} lifted={demo} onOpen={panel.open} />
    </div>
  );
}

export function LiveApp() {
  return <AppShell transport={liveTransport} mode="live" />;
}

export function DemoApp() {
  return <AppShell transport={demoTransport} mode="demo" />;
}
