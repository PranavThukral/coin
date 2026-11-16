"use client";

// The app's navigation: the views down the left, then every account with its
// balance. On a phone it becomes a row of tabs across the top.
import Link from "next/link";
import type { AccountId, AccountView } from "../../contracts";
import type { DashboardPayload } from "../../lib/api";
import { money } from "../../lib/format";
import { Mascot } from "../coin/mascot";
import { ActivityGlyph, HomeGlyph, PanelGlyph, TrendGlyph } from "../ui/icons";
import { ResizeGrip, useResizable, useStoredFlag } from "../ui/resizable";
import { useFetched } from "../ui/use-fetched";

export type View = "home" | "activity" | "investments";

const VIEWS: { id: View; label: string; glyph: React.ReactNode }[] = [
  { id: "home", label: "Home", glyph: <HomeGlyph /> },
  { id: "activity", label: "Activity", glyph: <ActivityGlyph /> },
  { id: "investments", label: "Investments", glyph: <TrendGlyph /> },
];

interface Props {
  view: View;
  accountId: AccountId | null;
  mode: "live" | "demo";
  refreshKey: number;
  onView: (view: View) => void;
  onAccount: (id: AccountId) => void;
}

const ORDER = ["chequing", "hisa", "tfsa", "rrsp", "non_registered", "credit_card"];
const byKind = (a: AccountView, b: AccountView) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type);

const ITEM = "flex h-9 w-full items-center gap-2.5 rounded-coin-sm px-2.5 text-sm transition-colors";
const ACTIVE = "bg-surface-soft font-bold text-foreground";
const IDLE = "font-medium text-muted hover:bg-surface-soft/70 hover:text-foreground";

function ModeSwitch({ mode }: { mode: "live" | "demo" }) {
  const tab = "flex-1 rounded-[7px] py-1.5 text-center text-xs font-bold transition-colors";
  const on = "bg-surface text-foreground shadow-coin";
  const off = "text-subtle hover:text-foreground";
  return (
    <nav className="flex gap-1 rounded-coin-sm bg-surface-soft p-1" aria-label="Mode">
      <Link href="/app" aria-current={mode === "live" ? "page" : undefined} className={`${tab} ${mode === "live" ? on : off}`}>
        Live
      </Link>
      <Link href="/demo" aria-current={mode === "demo" ? "page" : undefined} className={`${tab} ${mode === "demo" ? on : off}`}>
        Scripted demo
      </Link>
    </nav>
  );
}

function AccountLinks({ accounts, accountId, onAccount }: {
  accounts: AccountView[];
  accountId: AccountId | null;
  onAccount: (id: AccountId) => void;
}) {
  return (
    <div className="mt-6">
      <p className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">Accounts</p>
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          data-demo={`account-${account.id}`}
          onClick={() => onAccount(account.id)}
          className={`${ITEM} justify-between ${accountId === account.id ? ACTIVE : IDLE}`}
        >
          <span className="truncate">{account.name}</span>
          <span className="money shrink-0 text-xs text-subtle">{money(Math.abs(account.total_value_cents))}</span>
        </button>
      ))}
    </div>
  );
}

const RAIL = {
  storageKey: "coin.navWidth",
  initial: 256,
  min: 208,
  max: () => 360,
  edge: "right",
  // Dragged this narrow, the navigation folds down to its icons.
  collapseBelow: 150,
} as const;

const ICON_BUTTON = "grid h-9 w-9 place-items-center rounded-coin-sm text-subtle transition-colors hover:bg-surface-soft hover:text-foreground";

function ViewLinks({ view, accountId, iconsOnly, onView }: Pick<Props, "view" | "accountId" | "onView"> & { iconsOnly: boolean }) {
  return (
    <nav className="space-y-0.5">
      {VIEWS.map((item) => {
        const active = accountId === null && view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-demo={`view-${item.id}`}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            title={iconsOnly ? item.label : undefined}
            onClick={() => onView(item.id)}
            className={`${ITEM} ${active ? ACTIVE : IDLE} ${iconsOnly ? "justify-center px-0" : ""}`}
          >
            <span className={active ? "text-accent-text" : "text-subtle"}>{item.glyph}</span>
            {!iconsOnly && item.label}
          </button>
        );
      })}
    </nav>
  );
}

/** The navigation folded down to its icons, with a button to open it again. */
function IconRail(props: Pick<Props, "view" | "accountId" | "onView"> & { onExpand: () => void }) {
  return (
    <aside className="hidden w-16 shrink-0 flex-col items-center border-r border-border bg-surface/50 px-2 py-4 lg:flex" aria-label="Navigation">
      <Link href="/" aria-label="Coin" className="pb-3">
        <Mascot size={26} />
      </Link>
      <button type="button" aria-label="Show the navigation" title="Show the navigation" onClick={props.onExpand} className={`mb-3 ${ICON_BUTTON}`}>
        <PanelGlyph />
      </button>
      <div className="w-full">
        <ViewLinks {...props} iconsOnly />
      </div>
    </aside>
  );
}

/** Desktop: the rail. Drag its right edge to resize it; narrow enough, it folds down to icons. */
export function NavRail({ view, accountId, mode, refreshKey, onView, onAccount }: Props) {
  const dashboard = useFetched<DashboardPayload>("/api/dashboard", refreshKey);
  const accounts = [...(dashboard?.accounts ?? [])].sort(byKind);
  const [folded, setFolded] = useStoredFlag("coin.navFolded");
  const rail = useResizable({ ...RAIL, onCollapse: () => setFolded(true) });

  if (folded) return <IconRail view={view} accountId={accountId} onView={onView} onExpand={() => setFolded(false)} />;
  return (
    <aside
      className="relative hidden shrink-0 flex-col border-r border-border bg-surface/50 px-3 py-4 lg:flex"
      style={{ width: rail.width }}
      aria-label="Navigation"
    >
      <div className="flex items-center justify-between pb-5 pl-2.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Mascot size={26} />
          <span className="text-lg font-extrabold tracking-tight">Coin</span>
        </Link>
        <button type="button" aria-label="Hide the navigation" title="Hide the navigation" onClick={() => setFolded(true)} className={ICON_BUTTON}>
          <PanelGlyph />
        </button>
      </div>
      <ViewLinks view={view} accountId={accountId} onView={onView} iconsOnly={false} />
      <AccountLinks accounts={accounts} accountId={accountId} onAccount={onAccount} />
      <div className="mt-auto space-y-3 pt-6">
        <ModeSwitch mode={mode} />
        <p className="px-1 text-[11px] font-medium leading-snug text-subtle">Completely synthetic data.</p>
      </div>
      <ResizeGrip
        grip={rail.grip}
        label="Resize the navigation"
        hint="Drag to resize. Drag all the way left to fold it down to icons."
        className="inset-y-3 -right-2.5"
      />
    </aside>
  );
}

/** Phone and tablet: the brand, the mode switch and the views as tabs. */
export function NavBar({ view, accountId, mode, onView }: Omit<Props, "refreshKey" | "onAccount">) {
  return (
    <header className="border-b border-border bg-surface/70 px-4 pt-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Mascot size={26} />
          <span className="text-lg font-extrabold tracking-tight">Coin</span>
        </Link>
        <div className="w-48">
          <ModeSwitch mode={mode} />
        </div>
      </div>
      <nav className="mt-2 flex gap-5" aria-label="Views">
        {VIEWS.map((item) => {
          const active = accountId === null && view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onView(item.id)}
              className={`border-b-2 pb-2.5 pt-1.5 text-sm transition-colors ${
                active ? "border-accent font-bold text-foreground" : "border-transparent font-medium text-subtle"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
