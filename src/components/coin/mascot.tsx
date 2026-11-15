// Coin's mark, v3: geometric, flat, no face. Built from the same tokens and
// the same icon language as the rest of the product, so it belongs.
// Moods are motion and the card icons: a glint sweeps while thinking, a check
// when an action goes through, an alert when a check blocks it.

export type MascotVariant = "ring" | "orbit" | "facet" | "pair";
export type MascotMood = "idle" | "thinking" | "happy" | "concerned";

const INK = "var(--gold-ink)";

/** Center glyph, drawn with the same stroke style as the card icons. */
function MoodGlyph({ mood, cx = 32, cy = 32, scale = 1 }: { mood: MascotMood; cx?: number; cy?: number; scale?: number }) {
  const transform = `translate(${cx} ${cy}) scale(${scale})`;
  if (mood === "happy") {
    return (
      <g transform={transform} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path className="coin-check-path" d="M-8 0.5 L-2.5 6 L8.5 -5.5" />
      </g>
    );
  }
  if (mood === "concerned") {
    return (
      <g transform={transform} fill={INK}>
        <rect x="-2" y="-11" width="4" height="13" rx="2" />
        <circle cx="0" cy="8" r="2.4" />
      </g>
    );
  }
  return null;
}

/** A short glint on the rim: still when idle, sweeping round while thinking. */
function Glint({ thinking, cx = 32, cy = 32, r = 21 }: { thinking: boolean; cx?: number; cy?: number; r?: number }) {
  const start = { x: cx + r * Math.cos((205 * Math.PI) / 180), y: cy + r * Math.sin((205 * Math.PI) / 180) };
  const end = { x: cx + r * Math.cos((250 * Math.PI) / 180), y: cy + r * Math.sin((250 * Math.PI) / 180) };
  return (
    <path
      className={thinking ? "coin-edge-turning" : undefined}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      d={`M${start.x} ${start.y} A${r} ${r} 0 0 1 ${end.x} ${end.y}`}
      fill="none"
      stroke="#ffffff"
      strokeOpacity="0.75"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  );
}

/** A restrained dollar sign: thin strokes in the deep gold, struck into the disc. */
function DollarSign() {
  return (
    <g fill="none" stroke="var(--gold-deep)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M37.2 26.2 C36.3 24 34.4 23 32 23 C29 23 27 24.6 27 27 C27 32.6 37 30.4 37 36.2 C37 38.9 34.9 40.6 32 40.6 C29.3 40.6 27.3 39.5 26.6 37.3" />
      <path d="M32 19.5 V23" />
      <path d="M32 40.6 V44.5" />
    </g>
  );
}

/** Ring: a minted disc with one crisp inner ring, a glint and a dollar sign. */
function Ring({ mood }: { mood: MascotMood }) {
  const resting = mood === "idle" || mood === "thinking";
  return (
    <>
      <circle cx="32" cy="32" r="28" fill="var(--gold)" />
      <circle cx="32" cy="32" r="21.5" fill="none" stroke="var(--gold-deep)" strokeOpacity="0.45" strokeWidth="2" />
      {resting && <Glint thinking={mood === "thinking"} />}
      {resting && <DollarSign />}
      <MoodGlyph mood={mood} />
    </>
  );
}

/** Orbit: the disc with a small accent-coloured companion; Coin as an agent at work. */
function Orbit({ mood }: { mood: MascotMood }) {
  const dotColour = mood === "concerned" ? "var(--loss)" : "var(--accent)";
  return (
    <>
      <circle cx="30" cy="34" r="24" fill="var(--gold)" />
      <circle cx="30" cy="34" r="17.5" fill="none" stroke="var(--gold-deep)" strokeOpacity="0.45" strokeWidth="2" />
      <g className={mood === "thinking" ? "coin-edge-turning" : undefined} style={{ transformOrigin: "30px 34px" }}>
        <circle cx="50.5" cy="13.5" r="6.5" fill={dotColour} stroke="var(--surface)" strokeWidth="2.5" />
      </g>
      <MoodGlyph mood={mood} cx={30} cy={34} scale={0.85} />
    </>
  );
}

/** Facet: a disc cut on the diagonal into a light and a deep half, like a bevel. */
function Facet({ mood }: { mood: MascotMood }) {
  return (
    <g className={mood === "thinking" ? "coin-flipping" : undefined}>
      <defs>
        <clipPath id="coin-facet-clip">
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>
      <g clipPath="url(#coin-facet-clip)">
        <rect x="0" y="0" width="64" height="64" fill="var(--gold)" />
        <path d="M64 4 L64 64 L4 64 Z" fill="var(--gold-deep)" opacity="0.4" />
      </g>
      <MoodGlyph mood={mood} />
    </g>
  );
}

/** Pair: gold in front of the accent. Coin (gold) and what it does for you (the accent). */
function Pair({ mood }: { mood: MascotMood }) {
  return (
    <>
      <circle
        className={mood === "thinking" ? "coin-flipping" : undefined}
        style={{ transformOrigin: "42px 24px" }}
        cx="42"
        cy="24"
        r="17"
        fill={mood === "concerned" ? "var(--loss)" : "var(--accent)"}
      />
      <circle cx="27" cy="37" r="22" fill="var(--gold)" stroke="var(--surface)" strokeWidth="3" />
      <MoodGlyph mood={mood} cx={27} cy={37} scale={0.8} />
    </>
  );
}

export function Mascot({
  variant = "ring",
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
    ring: <Ring mood={mood} />,
    orbit: <Orbit mood={mood} />,
    facet: <Facet mood={mood} />,
    pair: <Pair mood={mood} />,
  }[variant];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `Coin, ${mood}`}
      shapeRendering="geometricPrecision"
    >
      {body}
    </svg>
  );
}

export const MASCOT_OPTIONS: { variant: MascotVariant; name: string; idea: string }[] = [
  {
    variant: "ring",
    name: "Ring",
    idea: "A minted disc with one crisp inner ring. A glint sweeps the rim while Coin thinks.",
  },
  {
    variant: "orbit",
    name: "Orbit",
    idea: "The disc with an accent-coloured companion that circles while Coin works. Most 'agent'.",
  },
  {
    variant: "facet",
    name: "Facet",
    idea: "A bevelled disc, cut on the diagonal. Flips while thinking. Most logo-like.",
  },
  {
    variant: "pair",
    name: "Pair",
    idea: "Gold over the accent: Coin and what it does for you. Ties the two accents together.",
  },
];
