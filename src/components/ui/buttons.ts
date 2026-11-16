// The buttons on action and plan cards. They share a row evenly and wrap onto
// their own lines when the panel is narrow.
const BASE =
  "min-w-[7.5rem] flex-1 whitespace-nowrap rounded-full px-5 py-2.5 text-center text-sm font-extrabold transition-transform active:scale-[0.97] disabled:opacity-50";

export const PRIMARY_BUTTON = `${BASE} bg-accent text-accent-ink shadow-coin-accent hover:bg-accent-strong`;
export const SECONDARY_BUTTON = `${BASE} bg-border/70 text-foreground hover:bg-border`;
