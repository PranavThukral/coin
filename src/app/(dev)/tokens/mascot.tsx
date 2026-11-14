// Coin's mascot: four candidate designs, each with four moods.
// Pure SVG + CSS animation classes from tokens.css, so it works anywhere.

export type MascotVariant = "minted" | "stack" | "flip" | "sprout";
export type MascotMood = "idle" | "thinking" | "happy" | "concerned";

type FaceProps = { mood: MascotMood; cx?: number; cy?: number; scaleX?: number };

const INK = "var(--gold-ink)";

/** Shared face, drawn around (cx, cy). scaleX narrows it for the flipped coin. */
function Face({ mood, cx = 32, cy = 32, scaleX = 1 }: FaceProps) {
  const transform = `translate(${cx} ${cy}) scale(${scaleX} 1) translate(-32 -32)`;

  if (mood === "happy") {
    return (
      <g transform={transform} stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M22.5 30 Q25.75 24.5 29 30" />
        <path d="M35 30 Q38.25 24.5 41.5 30" />
        <path d="M24 37.5 Q32 47 40 37.5 Z" fill={INK} strokeLinejoin="round" />
      </g>
    );
  }
  if (mood === "concerned") {
    return (
      <g transform={transform} fill={INK}>
        <rect x="23" y="26" width="5" height="7" rx="2.5" />
        <rect x="36" y="26" width="5" height="7" rx="2.5" />
        <g stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none">
          {/* Worried brows: they rise toward the middle. */}
          <path d="M22 23.5 L28.5 21" />
          <path d="M42 23.5 L35.5 21" />
          <path d="M26.5 42.5 Q32 38 37.5 42.5" />
        </g>
      </g>
    );
  }
  if (mood === "thinking") {
    return (
      <g transform={transform} fill={INK}>
        <rect x="25.5" y="22" width="5" height="7" rx="2.5" />
        <rect x="38.5" y="22" width="5" height="7" rx="2.5" />
        <path d="M28 40.5 h8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g transform={transform} fill={INK}>
      <rect className="coin-blinking" x="23" y="24" width="5" height="9" rx="2.5" />
      <rect className="coin-blinking" x="36" y="24" width="5" height="9" rx="2.5" />
      <path d="M25 39.5 Q32 45 39 39.5" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Reeded edge: the ridges round a real coin's rim. */
function ReededEdge({ cx = 32, cy = 32, inner, outer, count, turning }: {
  cx?: number; cy?: number; inner: number; outer: number; count: number; turning: boolean;
}) {
  const ticks = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * outer;
    const y2 = cy + Math.sin(angle) * outer;
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
  });
  return (
    <g
      className={turning ? "coin-edge-turning" : undefined}
      style={turning ? { transformOrigin: `${cx}px ${cy}px` } : undefined}
      stroke="var(--gold-deep)"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      {ticks}
    </g>
  );
}

function Minted({ mood }: { mood: MascotMood }) {
  return (
    <>
      <circle cx="32" cy="32" r="30" fill="var(--gold)" />
      <ReededEdge inner={26.5} outer={29.2} count={40} turning={mood === "thinking"} />
      <circle cx="32" cy="32" r="24" fill="var(--gold-light)" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="var(--gold-deep)" strokeOpacity="0.35" />
      <Face mood={mood} />
    </>
  );
}

function Stack({ mood }: { mood: MascotMood }) {
  const lyingCoin = (y: number, dx: number) => (
    <g transform={`translate(${dx} 0)`}>
      <path d={`M12 ${y} v5 a20 6 0 0 0 40 0 v-5`} fill="var(--gold-deep)" />
      <ellipse cx="32" cy={y} rx="20" ry="6" fill="var(--gold)" />
      <ellipse cx="32" cy={y} rx="14" ry="3.6" fill="none" stroke="var(--gold-deep)" strokeOpacity="0.4" />
    </g>
  );
  return (
    <>
      {lyingCoin(52, 1)}
      {lyingCoin(44, -1.5)}
      <g transform="translate(0 -9) scale(1)">
        <circle cx="32" cy="27" r="17" fill="var(--gold)" />
        <ReededEdge cy={27} inner={14} outer={16.3} count={28} turning={mood === "thinking"} />
        <circle cx="32" cy="27" r="13" fill="var(--gold-light)" />
        <g transform="translate(32 27) scale(0.62) translate(-32 -32)">
          <Face mood={mood} />
        </g>
      </g>
    </>
  );
}

function Flip({ mood }: { mood: MascotMood }) {
  return (
    <g className={mood === "thinking" ? "coin-flipping" : undefined}>
      <ellipse cx="36" cy="32" rx="17" ry="28" fill="var(--gold-deep)" />
      <rect x="30" y="4" width="6" height="56" fill="var(--gold-deep)" />
      <ellipse cx="30" cy="32" rx="17" ry="28" fill="var(--gold)" />
      <ellipse cx="30" cy="32" rx="13" ry="23" fill="var(--gold-light)" />
      <Face mood={mood} cx={30} scaleX={0.72} />
      <path d="M51 8 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6z" fill="var(--gold)" />
    </g>
  );
}

function Sprout({ mood }: { mood: MascotMood }) {
  return (
    <>
      <path d="M32 14 C32 10 32 8 32 5" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M32 9 C27 9 23.5 6 23 1.5 C28 1.5 31.5 4.5 32 9z" fill="var(--accent)" />
      <path d="M32 7 C36 7 39.5 4.5 40.5 0.8 C36 0.8 32.8 3 32 7z" fill="var(--accent)" opacity="0.8" />
      <circle cx="32" cy="38" r="25" fill="var(--gold)" />
      <ReededEdge cy={38} inner={21.5} outer={24.2} count={34} turning={mood === "thinking"} />
      <circle cx="32" cy="38" r="19.5" fill="var(--gold-light)" />
      <g transform="translate(32 38) scale(0.82) translate(-32 -32)">
        <Face mood={mood} />
      </g>
    </>
  );
}

export function Mascot({
  variant = "minted",
  mood = "idle",
  size = 64,
  label,
}: {
  variant?: MascotVariant;
  mood?: MascotMood;
  size?: number;
  label?: string;
}) {
  const body = {
    minted: <Minted mood={mood} />,
    stack: <Stack mood={mood} />,
    flip: <Flip mood={mood} />,
    sprout: <Sprout mood={mood} />,
  }[variant];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `Coin, ${mood}`}
      style={{ overflow: "visible" }}
    >
      {body}
    </svg>
  );
}

export const MASCOT_OPTIONS: { variant: MascotVariant; name: string; idea: string }[] = [
  {
    variant: "minted",
    name: "Minted",
    idea: "A coin face with a reeded rim. The rim spins while Coin thinks. Reads at 16px.",
  },
  {
    variant: "stack",
    name: "Stack",
    idea: "A coin head on a little stack of savings. Most character, least legible small.",
  },
  {
    variant: "flip",
    name: "Flip",
    idea: "Caught mid-flip, so it always feels in motion. Flips fully while thinking.",
  },
  {
    variant: "sprout",
    name: "Sprout",
    idea: "A coin with a sprout: money that grows. Ties the gold to the emerald.",
  },
];
