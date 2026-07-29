import { useEffect, useMemo, useState } from "react";
import { sfx } from "../../../game/audio";
import { FINAL_DAY } from "../../../game/content/arc";
import { CustomerProfile } from "../../../game/content/customers";
import { AUGMENT_BY_ID, GRIDLOCK_CHIP } from "../../../game/content/kit";
import { PATCH_POUCH_MAX, shapeClassOf } from "../../../game/patch-cells";
import type { RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { customerById } from "../../game/screens";
import { figureArtFor } from "../roster-art";
import { Teach } from "../../game/teach";
import { PatchGlyph } from "../../game/patch-glyph";
import { Chip, Nodes, Stripe, Ticks } from "../kp-ui";

/**
 * REPAIR.LOG: the dive result as a dense status dossier. Left rail: the
 * client figure and the DIVE LOG (the actual bus log of the finished
 * dive). Center: hero verdict with the customer's win line typing in, the
 * ECG strain trace drawn from the dive's real trap and over-par rounds,
 * the AUGMENT CACHE draft (with the bays-full swap flow), and four
 * telemetry sparklines. Right: itemized payout, the patch piece poster,
 * and the pouch strip with NEW and left-on-the-bench states.
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
function RollUp({ target, delay = 0, suffix }: { target: number; delay?: number; suffix?: string }) {
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
  return (
    <>
      {v}
      {suffix && <i>{suffix}</i>}
    </>
  );
}

function GridLines({ W, H, stepX, stepY }: { W: number; H: number; stepX: number; stepY: number }) {
  const lines: Array<[number, number, number, number]> = [];
  for (let x = 0; x <= W; x += stepX) lines.push([x, 0, x, H]);
  for (let y = 0; y <= H; y += stepY) lines.push([0, y, W, y]);
  return (
    <>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="grid" />
      ))}
    </>
  );
}

/** Polyline that draws itself in (stroke-dash sweep, steps timing). */
function DrawPoly({ pts, delay }: { pts: string; delay: number }) {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(false);
  const length = useMemo(() => {
    const parsed = pts
      .trim()
      .split(/\s+/)
      .map((p) => p.split(",").map(Number));
    let L = 0;
    for (let i = 1; i < parsed.length; i++) {
      L += Math.hypot(parsed[i][0] - parsed[i - 1][0], parsed[i][1] - parsed[i - 1][1]);
    }
    return Math.ceil(L);
  }, [pts]);
  useEffect(() => {
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), delay);
    return () => clearTimeout(t);
  }, [pts, delay]);
  if (reduced) return <polyline points={pts} shapeRendering="crispEdges" />;
  return (
    <polyline
      points={pts}
      shapeRendering="crispEdges"
      style={{
        strokeDasharray: `${length} ${length}`,
        strokeDashoffset: drawn ? 0 : length,
        transition: drawn ? "stroke-dashoffset 620ms steps(14)" : "none",
      }}
    />
  );
}

interface DiveShape {
  key: string;
  rounds: number;
  trapRounds: number[];
  parRounds: number[];
  capWobble: boolean;
}

/** ECG strain trace: flat pulse line, a spike per trap, a bump per
 * over-par rotation, a wobble tail on a cap win. */
function EcgSvg({ shape }: { shape: DiveShape }) {
  const pts = useMemo(() => {
    const W = 640;
    const base = 60;
    const next = seeded(`${shape.key}-ecg`);
    const events: Array<{ x: number; amp: number }> = [];
    shape.trapRounds.forEach((r) => events.push({ x: ((r - 0.5) / shape.rounds) * W, amp: 40 }));
    shape.parRounds.forEach((r) => events.push({ x: ((r - 0.5) / shape.rounds) * W, amp: 16 }));
    const out: string[] = [];
    for (let x = 0; x <= W; x += 4) {
      let y = base + ((next() % 100) / 100 - 0.5) * 5;
      for (const e of events) {
        const d = Math.abs(x - e.x);
        if (d < 20) y -= e.amp * (1 - d / 20);
      }
      if (shape.capWobble && x > W * 0.82) y += Math.sin(x / 9) * 9;
      out.push(`${x},${Math.round(y)}`);
    }
    return out.join(" ");
  }, [shape]);
  return (
    <svg viewBox="0 0 640 96" preserveAspectRatio="none" height={96}>
      <GridLines W={640} H={96} stepX={32} stepY={24} />
      <DrawPoly pts={pts} delay={140} />
    </svg>
  );
}

/** Small telemetry sparkline; kind shapes the wave from the real dive. */
function QuadSvg({ shape, kind, delay }: { shape: DiveShape; kind: string; delay: number }) {
  const pts = useMemo(() => {
    const W = 300;
    const next = seeded(`${shape.key}-${kind}`);
    const out: string[] = [];
    if (kind === "ram") {
      for (let x = 0; x <= W; x += 6) {
        const phase = (x % 60) / 60;
        out.push(`${x},${Math.round(38 - phase * 26 + ((next() % 100) / 100 - 0.5) * 3)}`);
      }
    } else if (kind === "rot") {
      let lvl = 40;
      for (let x = 0; x <= W; x += 6) {
        if (next() % 5 === 0 && lvl > 10) lvl -= 4;
        out.push(`${x},${lvl}`);
      }
    } else if (kind === "trap") {
      const spikes = shape.trapRounds.map((r) => ((r - 0.5) / shape.rounds) * 300);
      for (let x = 0; x <= W; x += 4) {
        let y = 38;
        for (const s of spikes) {
          const d = Math.abs(x - s);
          if (d < 10) y -= 28 * (1 - d / 10);
        }
        out.push(`${x},${Math.round(y)}`);
      }
    } else {
      const amp = shape.trapRounds.length === 0 ? 3 : shape.trapRounds.length <= 2 ? 8 : 14;
      for (let x = 0; x <= W; x += 4) {
        out.push(`${x},${Math.round(24 + ((next() % 100) / 100 - 0.5) * amp * 2)}`);
      }
    }
    return out.join(" ");
  }, [shape, kind]);
  return (
    <svg viewBox="0 0 300 46" preserveAspectRatio="none" height={46}>
      <GridLines W={300} H={46} stepX={30} stepY={23} />
      <DrawPoly pts={pts} delay={delay} />
    </svg>
  );
}

function Receipt({ rows, startDelay }: { rows: Array<[string, string] | [string, string, "inv"]>; startDelay: number }) {
  const reduced = useReducedMotion();
  return (
    <ul className="kp-receipt">
      {rows.map((r, i) => (
        <li
          key={i}
          className={`${r[2] === "inv" ? "inv" : ""} ${reduced ? "" : "kp-receipt-pop"}`.trim()}
          style={reduced ? undefined : { animationDelay: `${startDelay + i * 90}ms` }}
        >
          {r[0]}
          <em>{r[1]}</em>
        </li>
      ))}
    </ul>
  );
}

export function ReportContent({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const r = run.lastResult;
  const reduced = useReducedMotion();
  const [pendingSwap, setPendingSwap] = useState<string | null>(null);
  useEffect(() => {
    if (r && r.draft.length > 0) sfx("unlock", { at: 0.3 });
  }, [r]);
  useEffect(() => {
    if (r?.picked) setPendingSwap(null);
  }, [r?.picked]);
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
    chipRows.push([`${r.overRotations} rotation${r.overRotations === 1 ? "" : "s"} over par`, `-${r.overRotations * 2}`]);
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
    if (r.capWin) payRows.push(["reduced rate, you hit the turn cap", `-${r.basePay - (r.pay - r.salvage - r.cleanRunBonus)} cr`]);
    if (r.cleanRunBonus > 0) payRows.push(["clean run, trap free to the cap", `+${r.cleanRunBonus} cr`]);
    if (r.salvage > 0) payRows.push(["salvage, augment cache dry", `+${r.salvage} cr`]);
  }

  /* the patch poster: clean run bank first, else the job drop */
  const poster = r.cleanRun
    ? {
        title: "CLEAN RUN",
        mask: r.cleanRun.status === "banked" ? r.cleanRun.mask : null,
        noun: r.cleanRun.status === "banked" ? SHAPE_NOUN[shapeClassOf(r.cleanRun.mask)].toUpperCase() : null,
        line:
          r.cleanRun.status === "banked"
            ? `Zero strain billed. Banked a random ${SHAPE_NOUN[shapeClassOf(r.cleanRun.mask)].toLowerCase()}.`
            : `Zero strain billed. Pouch already holds the maximum of ${PATCH_POUCH_MAX}.`,
        status:
          r.cleanRun.status === "banked"
            ? `BANKED. POUCH ${run.patchPouch.length} OF ${PATCH_POUCH_MAX}`
            : "POUCH FULL",
        capped: r.cleanRun.status !== "banked",
      }
    : r.patchDrop
      ? {
          title: "PATCH PIECE RECOVERED",
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
        }
      : {
          title: "NO PIECE THIS TICKET",
          mask: null as number | null,
          noun: null as string | null,
          line: "Nothing came off this one. The next clean run still banks.",
          status: `POUCH ${run.patchPouch.length} OF ${PATCH_POUCH_MAX}`,
          capped: false,
        };

  /* pouch strip: the freshly banked piece is the last one in */
  const freshMask =
    r.cleanRun?.status === "banked" ? r.cleanRun.mask : r.patchDrop?.status === "banked" ? r.patchDrop.mask : null;
  const freshIndex = freshMask !== null ? run.patchPouch.lastIndexOf(freshMask) : -1;
  const lostMask =
    r.patchDrop?.status === "capped" ? r.patchDrop.mask : r.cleanRun?.status === "capped" ? null : null;

  const footLabel =
    r.picked || r.draft.length === 0
      ? run.jobsDone.every(Boolean)
        ? "CLOSE THE DAY"
        : "NEXT TICKET"
      : "SKIP THE DRAFT";

  return (
    <div className="kp-report">
      <div className="kp-rpt-grid">
        {/* ---------- left rail ---------- */}
        <div className="kp-rpt-col">
          <div className="kp-figure-cell">
            <span className="kp-figure-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <i className="kp-figure-crop" style={{ backgroundImage: `url("${c ? figureArtFor(c) : ""}")` }} />
            <i className="tint" aria-hidden="true" />
            <span className="kp-figure-tag">REPAIR LOGGED</span>
          </div>
          <div className="kp-divelog">
            <span className="kp-rpt-label">DIVE LOG</span>
            <div className="kp-divelog-lines">
              {(log.length > 0 ? log.slice(-14) : ["LINK CLOSED. NO TAP ON FILE."]).map((line, i) => (
                <Typed
                  key={`${shape.key}-${i}`}
                  text={line}
                  delay={260 + i * 110}
                  interval={9}
                  hot={/TRAP SPRUNG|TURN CAP/.test(line)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ---------- center rail ---------- */}
        <div className="kp-rpt-col">
          <div className="kp-hero-block">
            <span className="kp-rpt-label">DIVE RESULT</span>
            <h2 className="kp-hero-verdict">REPAIR LOGGED</h2>
            <Stripe style={{ opacity: 0.5 }} />
            {c && <Typed className="kp-hero-quote" text={`"${c.winLine}"`} delay={160} interval={18} />}
            <div className="kp-hero-chips">
              {c && <Chip label="CLIENT" value={c.name.toUpperCase()} />}
              {c && <Chip label="DEVICE" value={c.device} />}
              <Chip label="TICKET RATE" value={`${r.basePay} cr`} />
            </div>
          </div>

          <div className="kp-strainband kp-frame-ticks">
            <Ticks />
            <div className="kp-scopebox">
              <div className="kp-scope-tag">
                <span className="kp-rpt-label">STRAIN TRACE</span>
                <b>{shape.rounds} ROUNDS</b>
              </div>
              <EcgSvg shape={shape} />
            </div>
            <div className="kp-strain-side">
              <span className="kp-rpt-label">NEURAL STRAIN</span>
              {r.chip === 0 ? (
                <div className="kp-strain-big clean">CLEAN</div>
              ) : (
                <div className="kp-strain-big">
                  <RollUp target={-r.chip} delay={240} />
                </div>
              )}
              <p className="kp-strain-left">
                <em>{run.strain}</em> STRAIN LEFT
              </p>
              {chipRows.length > 0 && (
                <Receipt
                  rows={cappedBill ? [...chipRows, ["strain billed, capped", "-40 max", "inv"] as [string, string, "inv"]] : chipRows}
                  startDelay={420}
                />
              )}
            </div>
          </div>

          <div className="kp-cachebox">
            <div className="kp-cache-head">
              <span className="kp-cache-title">AUGMENT CACHE</span>
              <span className="kp-rpt-label">{r.draft.length === 0 ? "DRY" : r.picked ? "INSTALLED" : "PICK ONE"}</span>
            </div>
            {r.draft.length > 0 ? (
              <>
                <div className="kp-draft-grid2">
                  {r.draft.map((id, i) => {
                    const a = AUGMENT_BY_ID[id];
                    if (!a) return null;
                    const picked = r.picked === id;
                    const dimmed = (r.picked !== null && !picked) || (pendingSwap !== null && pendingSwap !== id);
                    const needsSwap = a.kind === "boost" && baysFull;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`kp-draft-card2 ${picked ? "picked" : ""} ${dimmed ? "dimmed" : ""} ${pendingSwap === id ? "swapping" : ""} ${reduced ? "" : "kp-slot-anim"}`.trim()}
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
                        <span className={a.kind === "config" ? "kp-draft-kind2 cfg" : "kp-draft-kind2"}>
                          {a.kind === "config" ? "CONFIG" : needsSwap && !picked ? "BOOST. BAYS FULL, PICK TO SWAP" : "BOOST"}
                        </span>
                        <strong>{a.name}</strong>
                        <p>{a.desc}</p>
                        {a.kind === "config" && (
                          <p className="note">
                            Unlocks the mode. Your active kit does not change; switch to it in
                            LOADOUT.CFG when you want it.
                          </p>
                        )}
                        {picked && <em className="kp-draft-stamp2">INSTALLED</em>}
                      </button>
                    );
                  })}
                </div>
                {pendingSwap !== null && r.picked === null && (
                  <div className="kp-swap-panel2">
                    <h4>EJECT WHICH BOOST FOR {AUGMENT_BY_ID[pendingSwap]?.name}?</h4>
                    <div className="kp-draft-grid2">
                      {run.kit.augments.map((id) => {
                        const a = AUGMENT_BY_ID[id];
                        return (
                          <button
                            key={id}
                            type="button"
                            className="kp-draft-card2"
                            onClick={() => {
                              sfx("granted", { bus: "ui" });
                              dispatch({ type: "pickAugment", id: pendingSwap, replace: id });
                            }}
                          >
                            <span className="kp-draft-kind2 cfg">EJECT</span>
                            <strong>{a?.name ?? id}</strong>
                            <p>{a?.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" className="kp-btn2 kp-btn2-ghost" onClick={() => setPendingSwap(null)}>
                      CANCEL THE SWAP
                    </button>
                  </div>
                )}
                {r.picked !== null && r.replaced !== null && (
                  <p className="kp-rail-dim">EJECTED: {AUGMENT_BY_ID[r.replaced]?.name ?? r.replaced}</p>
                )}
              </>
            ) : (
              <p className="kp-cache-dry">Augment cache is dry. Salvage credited instead.</p>
            )}
          </div>

          <div className="kp-ruler">
            <i />
            <span>DIVE TELEMETRY</span>
            <i />
          </div>
          <div className="kp-quadstrip">
            {(
              [
                ["ram", "RAM FLOW", `${run.ramPerTurn}/T`],
                ["rot", "ROTATIONS", `OVER PAR ${r.overRotations}`],
                ["trap", "TRAP FEED", String(r.trapsFired)],
                ["noise", "LINK NOISE", r.chip === 0 ? "LOW" : r.chip <= 12 ? "MID" : "HIGH"],
              ] as Array<[string, string, string]>
            ).map(([kind, label, val], i) => (
              <div key={kind} className="kp-quad">
                <div className="kp-quad-tag">
                  <span className="kp-rpt-label">{label}</span>
                  <b>{val}</b>
                </div>
                <QuadSvg shape={shape} kind={kind} delay={260 + i * 120} />
              </div>
            ))}
          </div>
        </div>

        {/* ---------- right rail ---------- */}
        <div className="kp-rpt-col">
          <div className="kp-paycard kp-frame-nodes">
            <Nodes />
            <span className="kp-rpt-label">PAYOUT</span>
            <div className="kp-pay-big">
              <RollUp target={r.pay} delay={300} suffix="cr" />
            </div>
            {payRows.length > 0 && <Receipt rows={payRows} startDelay={520} />}
          </div>

          {poster && (
            <div className="kp-patchcard kp-frame-ticks">
              <Ticks />
              <span className="kp-patch-head">{poster.title}</span>
              <div className={`kp-patch-stage ${poster.capped ? "void" : ""} ${reduced ? "" : "pop"}`.trim()}>
                {poster.mask !== null ? <PatchGlyph mask={poster.mask} size={84} /> : <span className="kp-piece-hole" />}
              </div>
              {poster.noun && <div className="kp-patch-noun">{poster.noun}</div>}
              <p className="kp-patch-line">{poster.line}</p>
              <span className={poster.capped ? "kp-patch-status inv" : "kp-patch-status"}>{poster.status}</span>
            </div>
          )}

          <div className="kp-rpt-pouch">
            <span className="kp-rpt-label">
              PATCH POUCH {run.patchPouch.length} OF {PATCH_POUCH_MAX}
            </span>
            <div className="kp-pouch-row2">
              {run.patchPouch.map((m, i) => (
                <span key={i} className={i === freshIndex ? "kp-pouch-slot fresh" : "kp-pouch-slot"}>
                  <PatchGlyph mask={m} size={26} />
                </span>
              ))}
              {Array.from({ length: PATCH_POUCH_MAX - run.patchPouch.length }).map((_, i) => (
                <span key={`e${i}`} className="kp-pouch-slot empty" />
              ))}
              {lostMask !== null && (
                <>
                  <span className="kp-pouch-plus">+</span>
                  <span className="kp-pouch-slot lost">
                    <PatchGlyph mask={lostMask} size={26} />
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- footer ---------- */}
      <div className="kp-rpt-foot">
        <div className="kp-foot-brand">
          <span className="kp-foot-batt" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>KP/OS REPAIR BENCH v9.2</span>
        </div>
        <div className="kp-foot-chips">
          <Chip label="DAY" value={String(Math.min(run.day, FINAL_DAY)).padStart(2, "0")} />
          <Chip label="TICKET" value={`${run.jobsDone.filter(Boolean).length} OF ${run.jobs.length}`} />
          <Chip label="CREDITS" value={`${run.credits} cr`} />
        </div>
        <button
          type="button"
          className="kp-btn2 kp-btn2-primary"
          onClick={() => {
            sfx("press", { bus: "ui" });
            dispatch({ type: "resultNext" });
          }}
        >
          {footLabel}
        </button>
      </div>
      <Teach id="strain-chip" />
      <Teach id="augment-draft" signals={{ draftOffered: r.draft.length > 0 }} />
      <Teach id="boost-swap" signals={{ swapOffered }} />
    </div>
  );
}
