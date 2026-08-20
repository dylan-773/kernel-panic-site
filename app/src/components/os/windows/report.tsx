import { useEffect, useMemo, useState } from "react";
import { sfx } from "../../../game/audio";
import {
  AUGMENT_BY_ID,
  PRESSURE_STRAIN_PER,
  REDIRECT_STRAIN_PER,
} from "../../../game/content/kit";
import { pouchCapFor } from "../../../game/content/repairs";
import { shapeClassOf } from "../../../game/patch-cells";
import type { DayAction, GameState } from "../../../game/day-reducer";
import { WEEKDAYS, weekdayOf } from "../../../game/save";
import { customerById } from "../../game/screens";
import { clientPrintFor } from "../roster-art";
import { Teach } from "../../game/teach";
import { PatchGlyph } from "../../game/patch-glyph";

/**
 * REPAIR.LOG as a KP/OS v3 instrument panel. The dive result read as a
 * TRANSACTION. GLANCE ORDER: 1st the bill (CREDITED, BILLED, RECOVERED);
 * 2nd the verdict slab and the client's own line; 3rd the strain trace.
 *
 * Under the day-as-run everything CREDITED here is HELD, not banked: the
 * pay rides with the player until they close, and the masthead says so.
 * The augment cache pick is held the same way and becomes permanent the
 * moment the day banks.
 */

type Dispatch = (a: DayAction) => void;

const DROP_LINES: Record<"I" | "L" | "T" | "X", string> = {
  I: "A straight run pulled from the wreck. Two arms, dead opposite.",
  L: "An elbow pulled from the wreck. Bent, but sound.",
  T: "A tee pulled from the wreck. Three arms, rare enough to notice.",
  X: "A cross pulled from the wreck. Four arms. Somebody's whole day, salvaged.",
};

const SHAPE_NOUN: Record<"I" | "L" | "T" | "X", string> = {
  I: "Straight",
  L: "Elbow",
  T: "Tee",
  X: "Cross",
};

/** The same risk band LOADOUT.CFG arms at. */
const RISK_BAND = 35;

function seeded(id: string): () => number {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function Typed({
  text,
  delay = 0,
  interval = 24,
  className,
  hot,
}: {
  text: string;
  delay?: number;
  interval?: number;
  className?: string;
  hot?: boolean;
}) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    setN(0);
    setStarted(false);
    const start = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(start);
  }, [text, delay]);
  useEffect(() => {
    if (!started || reduced) return;
    if (n >= text.length) return;
    const iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), interval);
    return () => clearInterval(iv);
  }, [started, reduced, n >= text.length, text, interval]);
  const shown = reduced ? text : text.slice(0, n);
  return (
    <div className={`${className ?? ""} ${hot ? "hot" : ""}`.trim()}>
      {shown}
      {!reduced && started && n < text.length && <span className="kp-boot-cursor">_</span>}
    </div>
  );
}

/** Stepped counter roll, CRT odometer feel. */
function RollUp({ target, delay = 0 }: { target: number; delay?: number }) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reduced) {
      setV(target);
      return;
    }
    setV(0);
    let n = 0;
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      iv = setInterval(() => {
        n++;
        setV(Math.round((target * n) / 9));
        if (n >= 9 && iv) clearInterval(iv);
      }, 55);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, [target, delay, reduced]);
  return <>{v}</>;
}

interface DiveShape {
  key: string;
  rounds: number;
  trapRounds: number[];
  parRounds: number[];
  capWobble: boolean;
}

/** The strain trace: a flat pulse line, a spike per trap, a bump per
 * over-par rotation, a wobble tail on a cap win. */
function Ecg({ shape }: { shape: DiveShape }) {
  const W = 640;
  const H = 54;
  const pts = useMemo(() => {
    const base = 35;
    const next = seeded(`${shape.key}-ecg`);
    const events: Array<{ x: number; amp: number }> = [];
    shape.trapRounds.forEach((r) => events.push({ x: ((r - 0.5) / shape.rounds) * W, amp: 24 }));
    shape.parRounds.forEach((r) => events.push({ x: ((r - 0.5) / shape.rounds) * W, amp: 10 }));
    const out: string[] = [];
    for (let x = 0; x <= W; x += 4) {
      let y = base + ((next() % 100) / 100 - 0.5) * 4;
      for (const e of events) {
        const d = Math.abs(x - e.x);
        if (d < 20) y -= e.amp * (1 - d / 20);
      }
      if (shape.capWobble && x > W * 0.82) y += Math.sin(x / 9) * 6;
      out.push(`${x},${Math.round(y)}`);
    }
    return out.join(" ");
  }, [shape]);
  const vlines: number[] = [];
  for (let x = 0; x <= W; x += 32) vlines.push(x);
  const hlines: number[] = [];
  for (let y = 0; y <= H; y += 18) hlines.push(y);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={H} aria-hidden="true">
      {vlines.map((x) => (
        <line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} className="grid" />
      ))}
      {hlines.map((y) => (
        <line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} className="grid" />
      ))}
      {shape.trapRounds.map((r, i) => {
        const x = Math.round(((r - 0.5) / shape.rounds) * W);
        return <line key={`t${i}`} x1={x} y1={0} x2={x} y2={H} className="trap" />;
      })}
      <polyline points={pts} shapeRendering="crispEdges" />
    </svg>
  );
}

/** The itemized receipt. THREE rows are reserved whatever the branch bills. */
function Receipt({
  rows,
  startDelay,
}: {
  rows: Array<[string, string] | [string, string, "inv"]>;
  startDelay: number;
}) {
  const reduced = useReducedMotion();
  return (
    <ul className="rl-receipt">
      {rows.map((r, i) => (
        <li
          key={i}
          className={`${r[2] === "inv" ? "inv" : ""} ${reduced ? "" : "kp-receipt-pop"}`.trim()}
          style={reduced ? undefined : { animationDelay: `${startDelay + i * 90}ms` }}
        >
          <span>{r[0]}</span>
          <em>{r[1]}</em>
        </li>
      ))}
    </ul>
  );
}

function Bracket() {
  return (
    <i className="rl-bracket" aria-hidden="true">
      <i />
    </i>
  );
}

export function ReportContent({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const { shop, day } = state;
  const r = day?.lastResult ?? null;
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    if (r && r.draft.length > 0) sfx("unlock", { at: 0.3 });
  }, [r]);

  const strainLeft = day?.strain ?? 0;
  const [litStrain, setLitStrain] = useState(0);
  const strainSegs = Math.round((24 * strainLeft) / 100);
  useEffect(() => {
    if (reduced) {
      setLitStrain(strainSegs);
      return;
    }
    setLitStrain(0);
    const timers = Array.from({ length: strainSegs }, (_, i) =>
      setTimeout(() => setLitStrain((v) => Math.max(v, i + 1)), 700 + i * 26),
    );
    return () => timers.forEach(clearTimeout);
  }, [strainSegs, reduced]);

  if (!shop || !day || !r) return null;
  const cap = pouchCapFor(shop.repairs);
  const c = customerById(r.customerId);

  const shape: DiveShape = {
    key: `${shop.seed}-${shop.day}-${day.jobsResolved}`,
    rounds: Math.max(1, r.rounds ?? 10),
    trapRounds: r.trapRounds ?? [],
    parRounds: r.parRounds ?? [],
    capWobble: r.capWin,
  };
  const log = r.log ?? [];

  const chipRows: Array<[string, string]> = [];
  if (r.overRotations > 0)
    chipRows.push([
      `${r.overRotations} rotation${r.overRotations === 1 ? "" : "s"} over par`,
      `-${r.overRotations * 2}`,
    ]);
  if (r.trapsFired > 0)
    chipRows.push([`${r.trapsFired} trap${r.trapsFired === 1 ? "" : "s"} sprung`, `-${r.trapsFired * 4}`]);
  const redirects = r.redirectsTaken ?? 0;
  const pressure = r.pressureRounds ?? 0;
  if (redirects > 0)
    chipRows.push([
      `${redirects} junction${redirects === 1 ? "" : "s"} twisted out from under you`,
      `-${redirects * REDIRECT_STRAIN_PER}`,
    ]);
  if (pressure > 0)
    chipRows.push([
      `${pressure} round${pressure === 1 ? "" : "s"} with it inside striking range`,
      `-${pressure * PRESSURE_STRAIN_PER}`,
    ]);
  if (r.capWin) chipRows.push(["hit the turn cap", "-10"]);
  const rawChip =
    r.overRotations * 2 +
    r.trapsFired * 4 +
    redirects * REDIRECT_STRAIN_PER +
    pressure * PRESSURE_STRAIN_PER +
    (r.capWin ? 10 : 0);
  const cappedBill = rawChip > 45;

  const payRows: Array<[string, string]> = [];
  if (r.capWin || r.cleanRunBonus > 0) {
    payRows.push(["ticket rate", `${r.basePay} cr`]);
    if (r.capWin)
      payRows.push(["reduced rate, you hit the turn cap", `-${r.basePay - (r.pay - r.cleanRunBonus)} cr`]);
    if (r.cleanRunBonus > 0) payRows.push(["clean run, trap free to the cap", `+${r.cleanRunBonus} cr`]);
  }
  payRows.push(["held until the day closes", "yours at close"]);

  /* the RECOVERED cell: clean-run bank first, else the job drop */
  const piece = r.cleanRun
    ? {
        mask: r.cleanRun.status === "banked" ? r.cleanRun.mask : null,
        noun: r.cleanRun.status === "banked" ? SHAPE_NOUN[shapeClassOf(r.cleanRun.mask)].toUpperCase() : null,
        line:
          r.cleanRun.status === "banked"
            ? `Zero strain billed. Banked a random ${SHAPE_NOUN[shapeClassOf(r.cleanRun.mask)].toLowerCase()}.`
            : `Zero strain billed. Pouch already holds the maximum of ${cap}.`,
        status:
          r.cleanRun.status === "banked" ? `IN THE POUCH. ${day.pouch.length} OF ${cap}` : "POUCH FULL",
        capped: r.cleanRun.status !== "banked",
        none: false,
      }
    : r.patchDrop
      ? {
          mask: r.patchDrop.mask,
          noun: SHAPE_NOUN[shapeClassOf(r.patchDrop.mask)].toUpperCase(),
          line:
            r.patchDrop.status === "banked"
              ? DROP_LINES[shapeClassOf(r.patchDrop.mask)]
              : `${SHAPE_NOUN[shapeClassOf(r.patchDrop.mask)]} piece pulled from the wreck, but the pouch already holds the maximum of ${cap}. Left on the bench.`,
          status:
            r.patchDrop.status === "banked"
              ? `IN THE POUCH. ${day.pouch.length} OF ${cap}`
              : "LEFT ON THE BENCH",
          capped: r.patchDrop.status !== "banked",
          none: false,
        }
      : {
          mask: null as number | null,
          noun: null as string | null,
          line: "Nothing came off this one. The next clean run still banks.",
          status: `POUCH ${day.pouch.length} OF ${cap}`,
          capped: false,
          none: true,
        };

  const freshMask =
    r.cleanRun?.status === "banked" ? r.cleanRun.mask : r.patchDrop?.status === "banked" ? r.patchDrop.mask : null;
  const freshIndex = freshMask !== null ? day.pouch.lastIndexOf(freshMask) : -1;

  const cacheState = r.draft.length === 0 ? "DRY" : r.picked ? "HELD" : "PICK ONE";
  const noChoice = r.draft.length === 0;
  const clientPrint = c ? clientPrintFor(c) : null;

  const billCls =
    strainLeft > 70 ? "rl-cell is-ok" : strainLeft <= RISK_BAND ? "rl-cell is-risk" : "rl-cell";

  return (
    <div className="rl-wrap">
      <div className="rl-grid">
        {/* Z1 MASTHEAD */}
        <div className="rl-mast">
          <div className="rl-mast-top">
            <span className="rl-eyebrow">REPAIR.LOG // TICKET</span>
            <div className="rl-mast-r">
              <span className="kp-chip-pct">
                <span>{WEEKDAYS[weekdayOf(shop.day)]}</span>
                <em>DAY {shop.day}</em>
              </span>
              <span className="kp-chip-pct">
                <span>JOBS TODAY</span>
                <em>
                  {day.jobsWon} OF {day.jobsResolved}
                </em>
              </span>
              <span className="kp-chip-pct">
                <span>HELD</span>
                <em>{day.held.credits} CR</em>
              </span>
            </div>
          </div>
          <div className="rl-mast-mid">
            <span className="rl-slab kp-frame-ticks">
              <i className="kp-tick2" />
              REPAIR LOGGED
            </span>
            <div className="rl-mast-act">
              <span className="kp-chip-pct">
                <span>CLIENT</span>
                <em>{c ? c.name.toUpperCase() : "--"}</em>
              </span>
              <span className="kp-chip-pct">
                <span>DEVICE</span>
                <em>{c ? c.device : "--"}</em>
              </span>
            </div>
          </div>
          {c ? (
            <Typed className="rl-quote" text={`"${c.winLine}"`} delay={160} interval={18} />
          ) : (
            <p className="rl-quote" />
          )}
        </div>

        {/* Z2 THE CLIENT CAM STILL */}
        <div className="rl-cam" data-feed="color">
          {clientPrint ? (
            <img src={clientPrint} alt="" />
          ) : (
            <i className="rl-camnone" aria-hidden="true" />
          )}
          <i className="tint" aria-hidden="true" />
          <span className="rl-camlabel">{"// CLIENT CAM"}</span>
          <span className="rl-camtag">REPAIR LOGGED</span>
        </div>

        <aside className="rl-gutter">
          <div className="rl-ticks">
            <div className="rl-tick">
              <span>SALVAGE PULLED</span>
              <em>+{r.salvage} SV</em>
            </div>
            <div className="rl-tick">
              <span>OVER PAR</span>
              <em>{r.overRotations}</em>
            </div>
            <div className="rl-tick">
              <span>TRAPS SPRUNG</span>
              <em>{r.trapsFired}</em>
            </div>
            <div className="rl-tick">
              <span>LINK NOISE</span>
              <em>{r.chip === 0 ? "LOW" : r.chip <= 12 ? "MID" : "HIGH"}</em>
            </div>
          </div>
          <div className="rl-pouch">
            <div className="rl-tick">
              <span>PATCH POUCH</span>
              <em>
                {day.pouch.length} / {cap}
              </em>
            </div>
            <div className="rl-pouchrow">
              {day.pouch.map((m, i) => (
                <span key={i} className={i === freshIndex ? "rl-pslot fresh" : "rl-pslot"}>
                  <PatchGlyph mask={m} size={18} />
                </span>
              ))}
              {Array.from({ length: Math.max(0, cap - day.pouch.length) }).map((_, i) => (
                <span key={`e${i}`} className="rl-pslot empty" />
              ))}
            </div>
          </div>
        </aside>

        {/* Z3 THE BILL */}
        <div className="rl-bill">
          <div className="rl-cell">
            <span className="rl-cname">{"// CREDITED, HELD"}</span>
            <div className="rl-heroline">
              <span className="rl-num">
                <RollUp target={r.pay} delay={300} />
              </span>
              <span className="rl-unit">CR</span>
            </div>
            <Receipt rows={payRows} startDelay={560} />
            <Bracket />
          </div>

          <div className={billCls}>
            <span className="rl-cname">{"// BILLED"}</span>
            <div className="rl-heroline">
              <span className={r.chip === 0 ? "rl-num is-clean" : "rl-num"}>
                {r.chip === 0 ? "CLEAN" : <RollUp target={-r.chip} delay={360} />}
                <i className="rl-riskflash" aria-hidden="true" />
              </span>
              {r.chip !== 0 && <span className="rl-unit">STRAIN</span>}
            </div>
            <Receipt
              rows={
                cappedBill
                  ? [...chipRows, ["strain bill capped", "-45 max", "inv"] as [string, string, "inv"]]
                  : chipRows
              }
              startDelay={620}
            />
            <span className="rl-strainbar">
              {Array.from({ length: 24 }).map((_, i) => (
                <i key={i} className={i < litStrain ? "on" : undefined} />
              ))}
            </span>
            <div className="rl-cellfoot">
              <span>STRAIN LEFT</span>
              <em>{strainLeft}</em>
              <span>{strainLeft <= RISK_BAND ? "ZERO LOSES THE DAY" : ""}</span>
            </div>
            <Bracket />
          </div>

          <div className="rl-cell">
            <span className="rl-cname">{"// RECOVERED"}</span>
            <div className="rl-piece">
              <div className={piece.capped || piece.none ? "rl-piecestage void" : "rl-piecestage"}>
                {piece.mask !== null && <PatchGlyph mask={piece.mask} size={46} />}
              </div>
              <div className="rl-piecemeta">
                {piece.noun && <span className="rl-noun">{piece.noun}</span>}
                <span
                  className={
                    piece.capped ? "rl-pstatus capped" : piece.none ? "rl-pstatus none" : "rl-pstatus"
                  }
                >
                  {piece.status}
                </span>
              </div>
            </div>
            <Typed className="rl-pline" text={piece.line} delay={760} interval={8} />
            <Bracket />
          </div>
        </div>

        {/* Z4 THE TRACE */}
        <section className="rl-trace">
          <div className="rl-scope">
            <div className="rl-scopetag">
              <span>STRAIN TRACE</span>
              <b>{shape.rounds} ROUNDS</b>
            </div>
            <Ecg shape={shape} />
          </div>
          <div className="rl-log">
            {(log.length > 0 ? log.slice(-4) : ["LINK CLOSED. NO TAP ON FILE."]).map((line, i) => (
              <Typed
                key={`${shape.key}-${i}`}
                className="rl-logline"
                text={line}
                delay={260 + i * 110}
                interval={9}
                hot={/TRAP SPRUNG|TURN CAP/.test(line)}
              />
            ))}
          </div>
        </section>

        {/* Z5 THE CACHE */}
        <section className={noChoice ? "rl-cache no-choice" : "rl-cache"}>
          <div className="rl-div">
            <i />
            <span>{"// AUGMENT CACHE"}</span>
            <em className={r.picked || noChoice ? "done" : undefined}>{cacheState}</em>
            <i />
            <button
              type="button"
              className="kp-btn2 kp-btn2-signal"
              onClick={() => {
                sfx("press", { bus: "ui" });
                dispatch({ type: "resultNext" });
              }}
            >
              FILE IT
            </button>
          </div>

          {!noChoice && (
            <div className="rl-cacherail">
              <button
                type="button"
                className={r.picked === null ? "rl-skipcard" : "rl-skipcard skipped"}
                disabled={r.picked !== null}
                onClick={() => {
                  sfx("press", { bus: "ui" });
                  dispatch({ type: "resultNext" });
                }}
              >
                SKIP THE DRAFT
              </button>
            </div>
          )}

          <div className="rl-cachebody">
            {noChoice ? (
              <p className="rl-dry">Augment cache is dry. The catalog is yours already.</p>
            ) : (
              <div className="rl-draft">
                {r.draft.map((id, i) => {
                  const a = AUGMENT_BY_ID[id];
                  if (!a) return null;
                  const picked = r.picked === id;
                  const dimmed = r.picked !== null && !picked;
                  const open = expanded === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`rl-card ${picked ? "picked" : ""} ${dimmed ? "dimmed" : ""} ${reduced ? "" : "kp-slot-anim"}`.trim()}
                      disabled={r.picked !== null}
                      style={reduced ? undefined : { animationDelay: `${300 + i * 110}ms` }}
                      onClick={() => {
                        sfx("granted", { bus: "ui" });
                        dispatch({ type: "pickAugment", id });
                      }}
                    >
                      <span className="rl-kind">{a.kind === "config" ? "CONFIG" : "BOOST"}</span>
                      <strong>{a.name}</strong>
                      <p className={open ? undefined : "clamped"}>
                        {a.desc}
                        {a.kind === "config" &&
                          " Unlocks the mode. Your active kit does not change; switch to it in LOADOUT.CFG when you want it."}
                        {a.kind === "boost" &&
                          " Held today, yours for good when the day banks. Slot it in LOADOUT.CFG."}
                      </p>
                      <span className="rl-morerow">
                        <span
                          role="button"
                          tabIndex={0}
                          className={a.kind === "config" || a.desc.length > 96 ? "rl-more" : "rl-more hidden"}
                          onClick={(e) => {
                            e.stopPropagation();
                            sfx("tick", { bus: "ui" });
                            setExpanded((p) => (p === id ? null : id));
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.stopPropagation();
                            setExpanded((p) => (p === id ? null : id));
                          }}
                        >
                          {open ? "LESS" : "MORE"}
                        </span>
                      </span>
                      {picked && <em className="rl-stamp">HELD</em>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
      <Teach id="strain-chip" />
      <Teach id="held-banked" />
      <Teach id="augment-draft" signals={{ draftOffered: r.draft.length > 0 }} />
    </div>
  );
}
