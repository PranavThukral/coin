"use client";

// Plays the scripted demo the way a person would use Coin: a pointer moves to
// an account and opens it, types each question into Coin's message box,
// presses send, then presses the buttons on the card that comes back. The
// replies are scripted; everything they trigger runs through the real rules.
// Where the pointer has nothing to press (a phone hides the navigation), the
// step is done directly instead.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountId, ActionCard } from "../../contracts";
import { DEMO_STEPS, type CardStep, type DemoStep } from "../../demo/script";
import { latestCard } from "../coin/use-coin-chat";
import type { CoinConversation } from "../coin/sidebar";
import { useDemoCursor, type DemoCursor } from "./cursor";

const READ_MS = 10_000;
const BEFORE_CLICK_MS = 1_400;
const SHOW_UNDO_MS = 3_000;
const KEY_MS = 32;
const REPLY_TIMEOUT_MS = 60_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Props {
  coin: CoinConversation;
  viewing: AccountId | null;
  setViewing: (account: AccountId | null) => void;
  /** Shows text in Coin's message box, as if typed. */
  onType: (text: string) => void;
}

/** Everything a step needs to act on the page. */
interface Stage extends Omit<Props, "viewing"> {
  cursor: DemoCursor;
  viewing: () => AccountId | null;
}

/** Waits until `ready()` is true, looking a few times a second, and gives up quietly after `ms`. */
async function until(ready: () => boolean, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await pause(150);
}

async function openAccount(stage: Stage, account: AccountId | null): Promise<void> {
  if (stage.viewing() === account) return;
  const clicked = await stage.cursor.click(account ? `account-${account}` : "view-home");
  if (!clicked) stage.setViewing(account);
  await pause(900);
}

async function typeAndSend(stage: Stage, prompt: string): Promise<boolean> {
  if (!(await stage.cursor.click("composer"))) return false;
  for (let end = 1; end <= prompt.length; end += 1) {
    stage.onType(prompt.slice(0, end));
    await pause(KEY_MS);
  }
  await pause(250);
  return stage.cursor.click("send");
}

async function ask(stage: Stage, prompt: string): Promise<void> {
  if (!(await typeAndSend(stage, prompt))) {
    await stage.coin.send(prompt, stage.viewing());
    return;
  }
  const busy = () => stage.coin.getChat().busy;
  await until(busy, 3_000);
  await until(() => !busy(), REPLY_TIMEOUT_MS);
}

const CARD_BUTTON: Record<CardStep, string> = {
  approve: "approve",
  execute_now: "execute-now",
  use_instead: "use-instead",
};

function pressDirectly(stage: Stage, card: ActionCard, action: CardStep): Promise<void> {
  const controls = stage.coin.controls;
  if (action === "approve") return controls.approve(card);
  return action === "execute_now" ? controls.executeNow(card) : controls.useInstead(card);
}

/** Presses a button on the newest card and waits for the card to change. */
async function pressCard(stage: Stage, action: CardStep): Promise<void> {
  const before = latestCard(stage.coin.getChat());
  if (!before) return;
  if (await stage.cursor.click(CARD_BUTTON[action])) {
    await until(() => {
      const now = latestCard(stage.coin.getChat());
      return now?.action_id !== before.action_id || now.status !== before.status;
    });
  } else {
    await pressDirectly(stage, before, action);
  }
  // Let the viewer see the undo ring start before the next press skips the wait.
  if (action === "approve") await pause(SHOW_UNDO_MS);
}

async function play(stage: Stage, step: DemoStep): Promise<void> {
  if (step.openAccount !== undefined) await openAccount(stage, step.openAccount);
  if (step.prompt) await ask(stage, step.prompt);
  for (const action of step.cardSteps ?? []) {
    await pause(BEFORE_CLICK_MS);
    await pressCard(stage, action);
  }
}

function usePlayback({ coin, viewing, setViewing, onType }: Props, cursor: DemoCursor) {
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  // The demo moves on by itself; Pause hands the pace to the viewer.
  const [autoplay, setAutoplay] = useState(true);
  const viewingRef = useRef(viewing);
  useEffect(() => {
    viewingRef.current = viewing;
  }, [viewing]);

  const next = useCallback(async () => {
    if (running || index >= DEMO_STEPS.length - 1) return;
    const target = index + 1;
    setIndex(target);
    setRunning(true);
    await play({ coin, cursor, setViewing, onType, viewing: () => viewingRef.current }, DEMO_STEPS[target]);
    setRunning(false);
  }, [coin, cursor, index, onType, running, setViewing]);

  // After each step, give the viewer time to read, then continue.
  useEffect(() => {
    if (!autoplay || running) return;
    if (index >= DEMO_STEPS.length - 1) {
      const stop = setTimeout(() => setAutoplay(false), 0);
      return () => clearTimeout(stop);
    }
    const timer = setTimeout(next, READ_MS);
    return () => clearTimeout(timer);
  }, [autoplay, running, index, next]);

  return { index, running, autoplay, setAutoplay, next };
}

async function restart(): Promise<void> {
  await fetch("/api/demo/reset", { method: "POST" }).catch(() => undefined);
  window.location.reload();
}

/** One segment per step; finished steps are filled, the running one pulses. */
function Progress({ index, running }: { index: number; running: boolean }) {
  return (
    <ol className="flex gap-1" aria-label={`Step ${index + 1} of ${DEMO_STEPS.length}`}>
      {DEMO_STEPS.map((step, i) => {
        const tone = i <= index ? "bg-accent" : "bg-border";
        const pulsing = running && i === index ? "animate-pulse" : "";
        return <li key={step.id} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${tone} ${pulsing}`} />;
      })}
    </ol>
  );
}

const BUTTON = "rounded-full px-4 py-2 text-sm font-extrabold transition-transform active:scale-[0.97] disabled:opacity-40";
const PRIMARY = `${BUTTON} bg-accent text-accent-ink shadow-coin-accent`;
const SECONDARY = `${BUTTON} bg-border/70 text-foreground hover:bg-border`;

export function DemoPlayer(props: Props) {
  const { cursor, pointer } = useDemoCursor();
  const { index, running, autoplay, setAutoplay, next } = usePlayback(props, cursor);
  const step = DEMO_STEPS[index];
  const finished = index >= DEMO_STEPS.length - 1 && !running;

  return (
    <section
      aria-label="Scripted demo"
      className="coin-rise fixed inset-x-0 bottom-0 z-50 h-52 overflow-y-auto rounded-t-coin-lg bg-surface-raised p-5 shadow-coin-float lg:static lg:z-auto lg:mx-10 lg:mb-3 lg:h-auto lg:shrink-0 lg:overflow-visible lg:rounded-coin-lg lg:px-7"
    >
      {pointer}
      <Progress index={index} running={running} />
      <div className="mt-4 lg:flex lg:items-center lg:justify-between lg:gap-8">
        {/* Keyed by step, so each new caption rises in. */}
        <div key={step.id} className="coin-rise min-w-0">
          <h2 className="text-lg font-extrabold leading-snug tracking-tight">{step.title}</h2>
          <p className="mt-1 text-sm font-medium leading-snug text-muted" aria-live="polite">
            {step.proves}
          </p>
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap gap-2 lg:mt-0">
          {!finished && (
            <button type="button" className={`relative overflow-hidden ${PRIMARY}`} disabled={running} onClick={next}>
              {autoplay && !running && (
                <span
                  key={index}
                  aria-hidden="true"
                  className="coin-countdown absolute inset-0 bg-black/30"
                  style={{ animationDuration: `${READ_MS}ms` }}
                />
              )}
              <span className="relative">Next step</span>
            </button>
          )}
          {!finished && (
            <button type="button" className={SECONDARY} onClick={() => setAutoplay(!autoplay)}>
              {autoplay ? "Pause" : "Auto-play"}
            </button>
          )}
          <button type="button" className={SECONDARY} disabled={running} onClick={restart}>
            Restart
          </button>
          {finished && (
            <a href="/app" className={PRIMARY}>
              Try it live
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
