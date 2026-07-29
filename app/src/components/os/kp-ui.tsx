import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Shared pieces of the kpos-design-language (ported from the approved
 * ui-demos/kpos-shell demo): frame furniture, data rows, the meter kit,
 * the button system, photo cells, the pixel icon set, and the KP mark.
 */

/* ---------- frame grammar ---------- */

/** Corner L-brackets. Render inside a `.kp-frame-ticks` host. */
export function Ticks() {
  return <i className="kp-tick2" />;
}

/** Six node-dot joins. Render inside a `.kp-frame-nodes` host. */
export function Nodes() {
  return (
    <i className="kp-nodes" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </i>
  );
}

export function Stripe({ style }: { style?: CSSProperties }) {
  return <div className="kp-frame-stripe" style={style} />;
}

export function Ruler({ left, right }: { left: string; right: string }) {
  return (
    <div className="kp-ruler">
      <span>{left}</span>
      <i />
      <span>{right}</span>
    </div>
  );
}

/* ---------- type ---------- */

export function Hero({ text, className }: { text: string; className?: string }) {
  return <div className={className ? `kp-hero ${className}` : "kp-hero"}>{text}</div>;
}

/* ---------- data rows ---------- */

export interface RowDef {
  label: string;
  value: ReactNode;
  warn?: boolean;
}

export function DataRows({ rows, slash }: { rows: RowDef[]; slash?: boolean }) {
  return (
    <div className="kp-datarow-list">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`kp-datarow ${slash ? "kp-datarow-slash" : "kp-datarow-plain"} ${r.warn ? "kp-datarow-warn" : ""}`.trim()}
        >
          <span>{r.label}</span>
          <em>{r.value}</em>
        </div>
      ))}
    </div>
  );
}

/* ---------- meter kit ---------- */

export function PipRow({
  filled,
  total,
  size = "md",
}: {
  filled: number;
  total: number;
  size?: "sm" | "md" | "lg";
}) {
  const cls = size === "sm" ? "kp-pip-sq kp-pip-sq-sm" : size === "lg" ? "kp-pip-sq kp-pip-sq-lg" : "kp-pip-sq";
  return (
    <span className="kp-pip-row">
      {Array.from({ length: total }).map((_, i) => (
        <i key={i} className={i < filled ? `${cls} kp-pip-on` : cls} />
      ))}
    </span>
  );
}

export function DiamondRow({ tier, total = 5, label }: { tier: number; total?: number; label?: string }) {
  return (
    <span className="kp-pip-row kp-job-tier">
      {label && <span>{label}</span>}
      {Array.from({ length: total }).map((_, i) => (
        <i key={i} className={i < tier ? "kp-pip-diamond kp-pip-on" : "kp-pip-diamond"} />
      ))}
    </span>
  );
}

export function Chip({ label, value, crimson }: { label: string; value: string; crimson?: boolean }) {
  return (
    <span className={crimson ? "kp-chip-pct kp-chip-crimson" : "kp-chip-pct"}>
      <span>{label}</span>
      <em>{value}</em>
    </span>
  );
}

/** Segmented meter; fills stepped over `dur` ms in `steps` increments. */
export function SegMeter({
  pct,
  segs = 20,
  dur = 240,
  steps = 6,
}: {
  pct: number;
  segs?: number;
  dur?: number;
  steps?: number;
}) {
  const target = Math.round((Math.min(100, Math.max(0, pct)) / 100) * segs);
  const [lit, setLit] = useState(0);
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || dur <= 0) {
      setLit(targetRef.current);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let s = 1; s <= steps; s++) {
      timers.push(setTimeout(() => setLit(Math.round((targetRef.current * s) / steps)), (dur / steps) * s));
    }
    return () => timers.forEach(clearTimeout);
  }, [dur, steps, target]);
  return (
    <div className="kp-meter-seg">
      {Array.from({ length: segs }).map((_, i) => (
        <i key={i} className={i < lit ? "kp-seg-on" : undefined} />
      ))}
    </div>
  );
}

export function HatchBar({ pct }: { pct: number }) {
  return (
    <div className="kp-bar-hatch">
      <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

/* ---------- buttons ---------- */

export type BtnVariant = "primary" | "signal" | "danger" | "ghost";

const BTN_CLS: Record<BtnVariant, string> = {
  ghost: "kp-btn2 kp-btn2-ghost",
  danger: "kp-btn2 kp-btn2-primary kp-btn2-danger",
  signal: "kp-btn2 kp-btn2-primary kp-btn2-signal",
  primary: "kp-btn2 kp-btn2-primary",
};

export function Btn({
  label,
  variant,
  onClick,
  disabled,
  title,
  className,
}: {
  label: string;
  variant: BtnVariant;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className ? `${BTN_CLS[variant]} ${className}` : BTN_CLS[variant]}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {label}
    </button>
  );
}

/* ---------- photo cell (the ink-tint 1-bit treatment) ---------- */

export function PhotoCell({
  src,
  w,
  h,
  className,
}: {
  src: string;
  w: number;
  h: number;
  className?: string;
}) {
  return (
    <span className={className ? `kp-photo-cell-full ${className}` : "kp-photo-cell-full"}>
      <img src={src} alt="" width={w} height={h} />
    </span>
  );
}

/* ---------- desktop icon bitmaps ----------
 * One matched pictogram family in the mark's own language, free-floating
 * (no cell boxes). 24-wide grids at cell 3 = 72px art, five tones for real
 * shading, light from the top-left:
 *   '*' hot highlight / '#' ink / 'o' mid / '+' dim shadow / '-' faint
 * (every tone derives from the hue vars, so a hue switch recolors them). */
export const PX_ICONS: Record<string, string[]> = {
  /* envelope: lit flap face, shaded body, sheen under the top edge */
  inbox: [
    "########################",
    "##********************##",
    "####oooooooooooooooo####",
    "##-##oooooooooooooo##-##",
    "##--##oooooooooooo##--##",
    "##---##oooooooooo##---##",
    "##----##oooooooo##----##",
    "##-----##oooooo##-----##",
    "##------##oooo##------##",
    "##-------##oo##-------##",
    "##--------####--------##",
    "##--------++++--------##",
    "##--------------------##",
    "##++++++++++++++++++++##",
    "########################",
    "########################",
  ],
  /* socketed chip: beveled package, hot die core */
  loadout: [
    "......##...##...##......",
    "......##...##...##......",
    "..####################..",
    "..##oooooooooooooooo##..",
    "..##o--------------+##..",
    "..##o--------------+##..",
    "####o--------------+####",
    "####o--------------+####",
    "..##o---########---+##..",
    "..##o---#******#---+##..",
    "..##o---#******#---+##..",
    "####o---#******#---+####",
    "####o---#******#---+####",
    "..##o---#******#---+##..",
    "..##o---#******#---+##..",
    "..##o---########---+##..",
    "####o--------------+####",
    "####o--------------+####",
    "..##o--------------+##..",
    "..##++++++++++++++++##..",
    "..####################..",
    "..####################..",
    "......##...##...##......",
    "......##...##...##......",
  ],
  /* iron raised to the work: lit barrel edge, grip grooves, sparks */
  solder: [
    ".....................*..",
    "...................*...*",
    "....................*...",
    "..................*.....",
    ".................##.....",
    "................o##+....",
    "...............o###+....",
    "..............o####+....",
    ".............o####+.....",
    "............o####+......",
    "...........o####+.......",
    "..........o####+........",
    ".........o####+.........",
    "........o####+..........",
    ".......o####+...........",
    "......o####+............",
    ".....o#####+............",
    "....o######+............",
    "...o#######+............",
    "..o++++++++.............",
    ".o#########+............",
    ".o++++++++++............",
    "o##########+............",
    "o##########+............",
  ],
  /* clipboard report: paper in shade lines, hot approval stamp */
  report: [
    "........########........",
    "........##****##........",
    "..####################..",
    "..####################..",
    "..##oooooooooooooooo##..",
    "..##o--------------+##..",
    "..##o-++++++++-----+##..",
    "..##o--------------+##..",
    "..##o-++++++++++---+##..",
    "..##o--------------+##..",
    "..##o-++++++++++---+##..",
    "..##o--------------+##..",
    "..##o-++++++-------+##..",
    "..##o--------------+##..",
    "..##o--------------+##..",
    "..##o--------****--+##..",
    "..##o-------******-+##..",
    "..##o-------******-+##..",
    "..##o--------****--+##..",
    "..##o--------------+##..",
    "..##++++++++++++++++##..",
    "..####################..",
    "..####################..",
    "........................",
  ],
  /* bound journal: lit spine band, strap, hot bookmark, page stack */
  journal: [
    "..####################..",
    "..####################..",
    "..##ooo----------**-##..",
    "..##ooo----------**-##..",
    "..##ooo----------**-##..",
    "..##ooo----------**-##..",
    "..##ooo----------*--##..",
    "..##ooo-------------##..",
    "..##ooo-------------##..",
    "..##ooo-------------##..",
    "..##ooo-------------##..",
    "..##ooo-------------##..",
    "..##++++++++++++++++##..",
    "..##++++++++++++++++##..",
    "..##ooo-------------##..",
    "..##ooo-------------##..",
    "..##ooo-------------##..",
    "..##ooo-------------##..",
    "..####################..",
    "..####################..",
    "...oooooooooooooooooo...",
    "...------------------...",
    "........................",
    "........................",
  ],
  /* dog-eared manual page: folded corner catches the light */
  manual: [
    "...##############.......",
    "...##-----------o#......",
    "...##-----------oo#.....",
    "...##-----------ooo#....",
    "...##-----------oooo#...",
    "...##--------------##...",
    "...##-++++++++-----##...",
    "...##--------------##...",
    "...##-++++++++++---##...",
    "...##--------------##...",
    "...##-++++++++++---##...",
    "...##--------------##...",
    "...##-++++++++++---##...",
    "...##--------------##...",
    "...##-++++++-------##...",
    "...##--------------##...",
    "...##-++++++++-----##...",
    "...##--------------##...",
    "...##--------------##...",
    "...##++++++++++++++##...",
    "...##################...",
    "...##################...",
    "........................",
    "........................",
  ],
  /* credit slabs: offset stack, lit top faces, one glint */
  ledger: [
    "........................",
    "........................",
    "...oooooooooooooooooo...",
    "...##****############...",
    "...##################...",
    "...##################...",
    "...++++++++++++++++++...",
    "........................",
    ".....oooooooooooooooooo.",
    ".....##################.",
    ".....##################.",
    ".....##################.",
    ".....++++++++++++++++++.",
    "........................",
    "..oooooooooooooooooo....",
    "..##################....",
    "..##################....",
    "..##################....",
    "..++++++++++++++++++....",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
  /* the fence: rim-lit hood, void face, hot eyes, robed shoulders */
  darknet: [
    "..........####..........",
    "........########........",
    ".......oo######++.......",
    "......oo########++......",
    ".....oo###....###++.....",
    "....oo##........##++....",
    "....o##..........##+....",
    "....o##..**..**..##+....",
    "....o##..........##+....",
    "....o###........###+....",
    ".....o###......###+.....",
    ".....o############+.....",
    "....oo############++....",
    "...oo##############++...",
    "..oo################++..",
    ".oo##################++.",
    ".o####################+.",
    ".######################.",
    ".++++++++++++++++++++++.",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
};

const PX_FILL: Record<string, string> = {
  "#": "currentColor",
  "*": "var(--ch-hot)",
  o: "color-mix(in srgb, var(--ch) 74%, var(--px-void))",
  "+": "var(--ch-dim)",
  "-": "var(--ch-faint)",
};

export function PxIcon({ rows, cell }: { rows: string[]; cell: number }) {
  const W = rows[0].length * cell;
  const H = rows.length * cell;
  const rects: Array<{ x: number; y: number; w: number; tone: string; key: string }> = [];
  rows.forEach((row, y) => {
    let run = -1;
    let tone = "";
    for (let x = 0; x <= row.length; x++) {
      const c = x < row.length ? row[x] : ".";
      if (run >= 0 && c !== tone) {
        rects.push({ x: run, y, w: x - run, tone, key: `${y}-${run}` });
        run = -1;
      }
      if (c !== "." && run < 0) {
        run = x;
        tone = c;
      }
    }
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {rects.map((r) => (
        <rect
          key={r.key}
          x={r.x * cell}
          y={r.y * cell}
          width={r.w * cell}
          height={cell}
          fill={PX_FILL[r.tone]}
        />
      ))}
    </svg>
  );
}

/* ---------- the KP mark ----------
 * Pixel monogram whose middle scanline has slipped two cells: the mark
 * itself is mid kernel panic. The slipped band renders hot and "heals"
 * for a blink every few seconds (CSS kp-mark-slip); under reduced motion
 * it stays broken, which IS the logo. */
const KP_MARK_ROWS = [
  "##...##..#######.",
  "##..##...##....##",
  "##.##....##....##",
  "####.....##....##",
  "###......#######.",
  "####.....##......",
  "##.##....##......",
  "##..##...##......",
  "##...##..##......",
  "##...##..##......",
];
const KP_SLICE_ROWS = [4, 5];
const KP_SLIP_CELLS = 2;

export function KpMark({ cell, sliceMono = false }: { cell: number; sliceMono?: boolean }) {
  const cols = KP_MARK_ROWS[0].length + KP_SLIP_CELLS;
  const W = cols * cell;
  const H = KP_MARK_ROWS.length * cell;
  const base: Array<{ x: number; y: number; w: number; key: string }> = [];
  const slice: Array<{ x: number; y: number; w: number; key: string }> = [];
  KP_MARK_ROWS.forEach((row, y) => {
    const inSlice = KP_SLICE_ROWS.includes(y);
    let run = -1;
    for (let x = 0; x <= row.length; x++) {
      const on = x < row.length && row[x] === "#";
      if (on && run < 0) run = x;
      if (!on && run >= 0) {
        (inSlice ? slice : base).push({
          x: run + (inSlice ? KP_SLIP_CELLS : 0),
          y,
          w: x - run,
          key: `${y}-${run}`,
        });
        run = -1;
      }
    }
  });
  return (
    <svg
      className="kp-mark"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      style={{ "--slip": `${KP_SLIP_CELLS * cell}px` } as CSSProperties}
    >
      {base.map((r) => (
        <rect key={r.key} x={r.x * cell} y={r.y * cell} width={r.w * cell} height={cell} fill="currentColor" />
      ))}
      <g className="kp-mark-slice">
        {slice.map((r) => (
          <rect
            key={r.key}
            x={r.x * cell}
            y={r.y * cell}
            width={r.w * cell}
            height={cell}
            fill={sliceMono ? "currentColor" : "var(--ch-hot)"}
          />
        ))}
      </g>
    </svg>
  );
}

/** The logo lockup: slipped-scanline KP monogram + two-line wordmark. */
export function KpLockup({ cell, wordPx }: { cell: number; wordPx: number }) {
  return (
    <div className="kp-lockup">
      <KpMark cell={cell} />
      <pre className="kp-lockup-word" style={{ fontSize: wordPx }}>
        {"KERNEL\nPANIC"}
      </pre>
    </div>
  );
}
