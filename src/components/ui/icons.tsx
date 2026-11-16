// Small stroke icons for status. Inline SVG so they inherit the text colour.
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-3.5 w-3.5"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Svg>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.25l2 1.5" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5l6 10.5H2z" />
      <path d="M8 6.5v3M8 11.25v.25" />
    </Svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 4.5L2.5 7.5l3 3" />
      <path d="M2.5 7.5h7a4 4 0 010 8h-2" />
    </Svg>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" />
    </Svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </Svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 8H3M6.5 4.5L3 8l3.5 3.5" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

const GLYPH = "h-[18px] w-[18px]";

/** Cash accounts: a banknote. */
export function CashGlyph() {
  return (
    <Svg className={GLYPH}>
      <rect x="1.75" y="4" width="12.5" height="8" rx="1.75" />
      <circle cx="8" cy="8" r="1.75" />
    </Svg>
  );
}

/** Investment accounts: a rising line. */
export function TrendGlyph() {
  return (
    <Svg className={GLYPH}>
      <path d="M2 11.5l3.75-4 2.75 2.5L14 4.5" />
      <path d="M10.5 4.5H14V8" />
    </Svg>
  );
}

/** Credit: a card. */
export function CardGlyph() {
  return (
    <Svg className={GLYPH}>
      <rect x="1.75" y="3.5" width="12.5" height="9" rx="1.75" />
      <path d="M1.75 6.75h12.5" />
    </Svg>
  );
}

/** Navigation: home. */
export function HomeGlyph() {
  return (
    <Svg className={GLYPH}>
      <path d="M2.5 7.25L8 2.75l5.5 4.5v5.5a.75.75 0 01-.75.75H3.25a.75.75 0 01-.75-.75z" />
      <path d="M6.25 13.5v-3.75h3.5v3.75" />
    </Svg>
  );
}

/** Navigation: activity, as two arrows passing. */
export function ActivityGlyph() {
  return (
    <Svg className={GLYPH}>
      <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" />
      <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
    </Svg>
  );
}

/** A bill: a page with lines. */
export function BillGlyph() {
  return (
    <Svg className={GLYPH}>
      <path d="M4 2.25h8v11.5l-2-1.25-2 1.25-2-1.25-2 1.25z" />
      <path d="M6.25 5.75h3.5M6.25 8.25h3.5" />
    </Svg>
  );
}

/** Search. */
export function SearchGlyph() {
  return (
    <Svg className={GLYPH}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.25 10.25L13.5 13.5" />
    </Svg>
  );
}

/** A side panel: a window with one column marked off. */
export function PanelGlyph() {
  return (
    <Svg className={GLYPH}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M6 2.75v10.5" />
    </Svg>
  );
}
