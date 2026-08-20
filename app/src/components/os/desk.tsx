import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { MetaState } from "../../game/save";
import { WEEKDAYS, weekdayOf } from "../../game/save";

/**
 * Desktop furniture: the dossier poster (bottom-left), the live telemetry
 * cluster (bottom-right: SIGNAL BUS scope, ticking bench clock, hex table),
 * print-sheet registration crosses, and the lifetime-stats ticker. All of it
 * is burned into the desk, pointer-transparent, and hue-derived.
 */

/** Deterministic pseudo-random stream (the studies' seeded() pattern). */
function seeded(id: string): () => number {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

const SCOPE_W = 352;
const SCOPE_H = 84;

export function WallScope({ day }: { day: number }) {
  /* trace over two box-widths, periodic in W, so the roll loops clean */
  const pts = useMemo(() => {
    const next = seeded("kp-desk-scope");
    const jitter: number[] = [];
    for (let i = 0; i <= SCOPE_W / 8; i++) jitter.push(((next() % 100) / 100 - 0.5) * 8);
    const out: string[] = [];
    for (let x = 0; x <= 2 * SCOPE_W; x += 8) {
      const base = 42 + Math.sin(((x % SCOPE_W) / SCOPE_W) * Math.PI * 6) * 18;
      out.push(`${x},${Math.round(base + jitter[(x / 8) % (SCOPE_W / 8)])}`);
    }
    return out.join(" ");
  }, []);

  const hexRows = useMemo(() => {
    const next = seeded("kp-desk-hex");
    return Array.from({ length: 6 }, () =>
      Array.from({ length: 3 }, () => (next() % 0xffff).toString(16).toUpperCase().padStart(4, "0")).join(" "),
    );
  }, []);

  /* bench clock, ticking for real (same shop clock as the BENCH FEED) */
  const [tsec, setTsec] = useState(22 * 3600 + 41 * 60 + 7);
  useEffect(() => {
    const t = setInterval(() => setTsec((s) => (s + 1) % 86400), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(Math.floor(tsec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((tsec % 3600) / 60)).padStart(2, "0");
  const ss = String(tsec % 60).padStart(2, "0");

  const gridLines: Array<[number, number, number, number]> = [];
  for (let x = 0; x <= SCOPE_W; x += 22) gridLines.push([x, 0, x, SCOPE_H]);
  for (let y = 0; y <= SCOPE_H; y += 21) gridLines.push([0, y, SCOPE_W, y]);

  return (
    <div className="kp-wallscope kp-slot-anim" style={{ animationDelay: "340ms" }}>
      <div className="kp-wallscope-box">
        <div className="kp-wallscope-tag">
          <span>{"// SIGNAL BUS _"}</span>
          <span>
            OK
            <i className="kp-wallscope-pip" />
          </span>
        </div>
        <svg viewBox={`0 0 ${SCOPE_W} ${SCOPE_H}`} preserveAspectRatio="none" height={SCOPE_H}>
          {gridLines.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="grid" />
          ))}
          <g className="kp-wallscope-roll">
            <polyline points={pts} shapeRendering="crispEdges" />
          </g>
        </svg>
      </div>
      <div className="kp-wallclock">
        <span>BENCH CLOCK</span>
        <em>
          {WEEKDAYS[weekdayOf(day)]} {day} {hh}:{mm}:{ss}
        </em>
      </div>
      <div className="kp-wallhex">
        {hexRows.map((row, i) => (
          <span key={i}>{row}</span>
        ))}
      </div>
    </div>
  );
}

export function WallReg() {
  return (
    <div className="kp-wallreg" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

/** The lifetime-stats ticker strip above the taskbar. Always runs; the old
 * pause-when-a-window-is-near froze it permanently under full-height
 * windows. */
export function Ticker({ meta }: { meta: MetaState }) {
  const st = meta.stats;
  const stats: Array<[string, number]> = [
    ["DAYS CLOSED", st.daysClosed],
    ["DAYS LOST", st.daysBusted],
    ["JOBS CLEARED", st.divesCleared],
    ["DIVES LOST", st.divesLost],
    ["SCANS RUN", st.scans],
  ];
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div className="kp-ticker" ref={ref} aria-hidden="true">
      {/* labels NAME (--r-note), values READ (--r-line, dimmed) */}
      <span>
        {stats.map(([l, v], i) => (
          <Fragment key={l}>
            {i > 0 && " // "}
            {l}{" "}
            <em className="ds-tickval">{v}</em>
          </Fragment>
        ))}
      </span>
    </div>
  );
}
