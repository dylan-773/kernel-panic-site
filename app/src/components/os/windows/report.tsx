import { useEffect, useMemo, useState } from "react";
import { sfx } from "../../../game/audio";
import { FINAL_DAY } from "../../../game/content/arc";
import { AUGMENT_BY_ID, GRIDLOCK_CHIP } from "../../../game/content/kit";
import { PATCH_POUCH_MAX, shapeClassOf } from "../../../game/patch-cells";
import type { RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { customerById } from "../../game/screens";
import { clientPrintFor } from "../roster-art";
import { Teach } from "../../game/teach";
import { PatchGlyph } from "../../game/patch-glyph";

/**
 * REPAIR.LOG as a KP/OS v3 instrument panel (ui-demos/repair-log-v3, cycle
 * ux-2026-07-31-repair-log-v3). System: ../RULINGS.md.
 *
 * The dive result read as a TRANSACTION. GLANCE ORDER: 1st the bill, whose
 * three cells (CREDITED, BILLED, RECOVERED) are one focal row; 2nd the
 * verdict slab and the client's own line; 3rd the strain trace. The client
 * cam still, the telemetry ticks and the dive log are ambient.
 *
 * THE ALARM is the strain the run has LEFT, armed at or below 35 (the same
 * risk band LOADOUT.CFG uses) and owned by the BILLED cell alone. Not "this
 * ticket billed a lot": an expensive ticket you can afford is not an
 * emergency. Strain severs the run at zero, so the alarm is the distance to
 * zero, and it carries four channels: colour, inverse video, motion, and
 * position on the strain-left meter.
 *
 * CUTS (law 8, recorded in the demo's NOTES): the four boxed telemetry
 * sparklines are gone (four boxes of the same idea, none of which survived
 * being shrunk to the ceiling); their VALUES survive as unboxed gutter
 * ticks. The footer row, the brand plate and its battery pips are cut; the
 * chips moved into the masthead and the advance button rides the cache
 * divider. The patch piece's poster card became the bill's third cell.
 */

type Dispatch = (a: RunAction) => void;

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
 * over-par rotation, a wobble tail on a cap win. Trap markers take
 * --r-hazard, so a spike is legible as an EVENT without spending the alarm
 * colour on a readout. */
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

/** The itemized receipt. Values are --r-line: they are live data, not
 * alarms, and nothing in a receipt is ever allowed to reach for red. THREE
 * rows are reserved whatever the branch actually bills, so a clean sweep, a
 * chip breakdown and a capped bill all leave the cell the same height. */
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

export function ReportContent({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const r = run.lastResult;
  const reduced = useReducedMotion();
  const [pendingSwap, setPendingSwap] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    if (r && r.draft.length > 0) sfx("unlock", { at: 0.3 });
  }, [r]);
  useEffect(() => {
    if (r?.picked) setPendingSwap(null);
  }, [r?.picked]);

  const strainLeft = run.strain;
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

  if (!r) return null;

  const job = run.jobs[r.jobIndex];
  const c = job ? customerById(job.customerId) : null;
  const baysFull = run.kit.augments.length >= run.boostSlots;
  const swapOffered =
    r.picked === null && baysFull && r.draft.some((id) => AUGMENT_BY_ID[id]?.kind === "boost");

  const shape: DiveShape = {
    key: `${run.runSeed}-${run.day}-${r.jobIndex}`,
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
  if (r.capWin) chipRows.push(["hit the turn cap", "-10"]);
  if (r.gridlockWin) chipRows.push(["link collapsed in gridlock", `-${GRIDLOCK_CHIP}`]);
  const rawChip =
    r.overRotations * 2 + r.trapsFired * 4 + (r.capWin ? 10 : 0) + (r.gridlockWin ? GRIDLOCK_CHIP : 0);
  const cappedBill = rawChip > 40;

  const payRows: Array<[string, string]> = [];
  if (r.capWin || r.salvage > 0 || r.cleanRunBonus > 0) {
    payRows.push(["ticket rate", `${r.basePay} cr`]);
    if (r.capWin)
      payRows.push([
        "reduced rate, you hit the turn cap",
        `-${r.basePay - (r.pay - r.salvage - r.cleanRunBonus)} cr`,
      ]);
    if (r.cleanRunBonus > 0) payRows.push(["clean run, trap free to the cap", `+${r.cleanRunBonus} cr`]);
    if (r.salvage > 0) payRows.push(["salvage, augment cache dry", `+${r.salvage} cr`]);
  }

  /* the RECOVERED cell: clean-run bank first, else the job drop */
  const piece = r.cleanRun
    ? {
        mask: r.cleanRun.status === "banked" ? r.cleanRun.mask : null,
        noun: r.cleanRun.status === "banked" ? SHAPE_NOUN[shapeClassOf(r.cleanRun.mask)].toUpperCase() : null,
        line:
          r.cleanRun.status === "banked"
            ? `Zero strain billed. Banked a random ${SHAPE_NOUN[shapeClassOf(r.cleanRun.mask)].toLowerCase()}.`
            : `Zero strain billed. Pouch already holds the maximum of ${PATCH_POUCH_MAX}.`,
        status: r.cleanRun.status === "banked" ? `BANKED. POUCH ${run.patchPouch.length} OF ${PATCH_POUCH_MAX}` : "POUCH FULL",
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
              : `${SHAPE_NOUN[shapeClassOf(r.patchDrop.mask)]} piece pulled from the wreck, but the pouch already holds the maximum of ${PATCH_POUCH_MAX}. Left on the bench.`,
          status:
            r.patchDrop.status === "banked"
              ? `BANKED. POUCH ${run.patchPouch.length} OF ${PATCH_POUCH_MAX}`
              : "LEFT ON THE BENCH",
          capped: r.patchDrop.status !== "banked",
          none: false,
        }
      : {
          mask: null as number | null,
          noun: null as string | null,
          line: "Nothing came off this one. The next clean run still banks.",
          status: `POUCH ${run.patchPouch.length} OF ${PATCH_POUCH_MAX}`,
          capped: false,
          none: true,
        };

  const freshMask =
    r.cleanRun?.status === "banked" ? r.cleanRun.mask : r.patchDrop?.status === "banked" ? r.patchDrop.mask : null;
  const freshIndex = freshMask !== null ? run.patchPouch.lastIndexOf(freshMask) : -1;

  const advanceLabel = run.jobsDone.every(Boolean) ? "CLOSE THE DAY" : "NEXT TICKET";
  const cacheState = r.draft.length === 0 ? "DRY" : r.picked ? "INSTALLED" : "PICK ONE";
  const noChoice = r.draft.length === 0;
  const clientPrint = c ? clientPrintFor(c) : null;

  // BILLED owns the alarm, and the flash plate exists ONLY on that cell:
  // putting one on every numeral would mean --r-warn was present, inert and
  // at zero opacity, in cells that have no alarm.
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
                <span>DAY</span>
                <em>{String(Math.min(run.day, FINAL_DAY)).padStart(2, "0")}</em>
              </span>
              <span className="kp-chip-pct">
                <span>TICKET</span>
                <em>
                  {run.jobsDone.filter(Boolean).length} OF {run.jobs.length}
                </em>
              </span>
              <span className="kp-chip-pct">
                <span>CREDITS</span>
                <em>{run.credits}</em>
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
          {/* the one line of human voice on a page of instrumentation. The
              measure is reserved at two lines whatever its length, so a
              short win line and a long one leave the masthead identical. */}
          {c ? (
            <Typed className="rl-quote" text={`"${c.winLine}"`} delay={160} interval={18} />
          ) : (
            <p className="rl-quote" />
          )}
        </div>

        {/* Z2 THE CLIENT CAM STILL. The shop camera on the counter caught the
            handover; what the log files is the CAPTURE, not the feed, so the
            live furniture (REC light, scan roll, boot wipe) is gone. A report
            shows evidence, it does not stream. */}
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
              <span>RAM FLOW</span>
              <em>{run.ramPerTurn}/T</em>
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
                {run.patchPouch.length} / {PATCH_POUCH_MAX}
              </em>
            </div>
            <div className="rl-pouchrow">
              {run.patchPouch.map((m, i) => (
                <span key={i} className={i === freshIndex ? "rl-pslot fresh" : "rl-pslot"}>
                  <PatchGlyph mask={m} size={18} />
                </span>
              ))}
              {Array.from({ length: PATCH_POUCH_MAX - run.patchPouch.length }).map((_, i) => (
                <span key={`e${i}`} className="rl-pslot empty" />
              ))}
            </div>
          </div>
        </aside>

        {/* Z3 THE BILL: the focal zone. Three cells, one line item each. */}
        <div className="rl-bill">
          <div className="rl-cell">
            <span className="rl-cname">{"// CREDITED"}</span>
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
              {/* zero strain billed reads as a VERDICT, not a number, so it
                  takes the nominal role and the word rather than a numeral */}
              <span className={r.chip === 0 ? "rl-num is-clean" : "rl-num"}>
                {r.chip === 0 ? "CLEAN" : <RollUp target={-r.chip} delay={360} />}
                <i className="rl-riskflash" aria-hidden="true" />
              </span>
              {r.chip !== 0 && <span className="rl-unit">STRAIN</span>}
            </div>
            <Receipt
              rows={
                cappedBill
                  ? [...chipRows, ["strain bill capped", "-40 max", "inv"] as [string, string, "inv"]]
                  : chipRows
              }
              startDelay={620}
            />
            {/* the alarm's fourth channel: position on a scale, which
                survives both a colourblind reader and the CRT layer */}
            <span className="rl-strainbar">
              {Array.from({ length: 24 }).map((_, i) => (
                <i key={i} className={i < litStrain ? "on" : undefined} />
              ))}
            </span>
            <div className="rl-cellfoot">
              <span>STRAIN LEFT</span>
              <em>{strainLeft}</em>
              <span>{strainLeft <= RISK_BAND ? "SEVERS AT 0" : ""}</span>
            </div>
            <Bracket />
          </div>

          <div className="rl-cell">
            <span className="rl-cname">{"// RECOVERED"}</span>
            <div className="rl-piece">
              {/* the empty stage keeps the filled stage's exact footprint */}
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
          {/* the dive log, capped at four lines under the trace it annotates */}
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

        {/* Z5 THE CACHE: the only thing on this surface that needs a hand.
            The decline slot is the rail slot OF the draft group, so the
            choice reads "pick one of the drafts, or skip" rather than a
            window-level button carrying a zone-level decision. */}
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
              {advanceLabel}
            </button>
          </div>

          {!noChoice && (
            <div className="rl-cacherail">
              {pendingSwap !== null && r.picked === null ? (
                <button type="button" className="kp-btn2 kp-btn2-ghost" onClick={() => setPendingSwap(null)}>
                  CANCEL THE SWAP
                </button>
              ) : (
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
              )}
            </div>
          )}

          <div className="rl-cachebody">
            {noChoice ? (
              <p className="rl-dry">Augment cache is dry. Salvage credited instead.</p>
            ) : pendingSwap !== null && r.picked === null ? (
              <div className="rl-swap">
                <h4>EJECT WHICH BOOST FOR {AUGMENT_BY_ID[pendingSwap]?.name}?</h4>
                <div className="rl-swaprow">
                  {run.kit.augments.map((id) => {
                    const a = AUGMENT_BY_ID[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        className="rl-card"
                        onClick={() => {
                          sfx("granted", { bus: "ui" });
                          dispatch({ type: "pickAugment", id: pendingSwap, replace: id });
                        }}
                      >
                        <span className="rl-kind">EJECT</span>
                        <strong>{a?.name ?? id}</strong>
                        <p className="clamped">{a?.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rl-draft">
                {r.draft.map((id, i) => {
                  const a = AUGMENT_BY_ID[id];
                  if (!a) return null;
                  const picked = r.picked === id;
                  const dimmed = r.picked !== null && !picked;
                  const needsSwap = a.kind === "boost" && baysFull;
                  const open = expanded === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`rl-card ${picked ? "picked" : ""} ${dimmed ? "dimmed" : ""} ${reduced ? "" : "kp-slot-anim"}`.trim()}
                      disabled={r.picked !== null}
                      style={reduced ? undefined : { animationDelay: `${300 + i * 110}ms` }}
                      onClick={() => {
                        if (needsSwap) {
                          sfx("press", { bus: "ui" });
                          setPendingSwap((p) => (p === id ? null : id));
                          return;
                        }
                        sfx("granted", { bus: "ui" });
                        dispatch({ type: "pickAugment", id });
                      }}
                    >
                      <span className="rl-kind">
                        {a.kind === "config"
                          ? "CONFIG"
                          : needsSwap && !picked
                            ? "BOOST. BAYS FULL, PICK TO SWAP"
                            : "BOOST"}
                      </span>
                      <strong>{a.name}</strong>
                      {/* clamped to THREE RENDERED LINES by CSS, never by a
                          character budget: the cards are different widths at
                          different viewports, and a budget low enough to be
                          safe everywhere starts hiding effect clauses. */}
                      <p className={open ? undefined : "clamped"}>
                        {a.desc}
                        {a.kind === "config" &&
                          " Unlocks the mode. Your active kit does not change; switch to it in LOADOUT.CFG when you want it."}
                      </p>
                      {/* the MORE row is reserved on EVERY card and shown
                          only where there is more, so a long card and a short
                          one are the same height. A hidden remainder always
                          carries a visible control. */}
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
                      {picked && <em className="rl-stamp">INSTALLED</em>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
      <Teach id="strain-chip" />
      <Teach id="augment-draft" signals={{ draftOffered: r.draft.length > 0 }} />
      <Teach id="boost-swap" signals={{ swapOffered }} />
    </div>
  );
}
