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
