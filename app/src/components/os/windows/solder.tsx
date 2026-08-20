import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../../../game/audio";
import { pouchCapFor } from "../../../game/content/repairs";
import { armUnionCraft, shapeClassOf } from "../../../game/patch-cells";
import type { DayAction, GameState } from "../../../game/day-reducer";
import { PatchGlyph } from "../../game/patch-glyph";
import { Chip } from "../kp-ui";

/**
 * SOLDER.BAY as a KP/OS v3 instrument panel (ui-demos/solder-v3, cycle
 * ux-2026-07-31-solder-v3). System: ../RULINGS.md.
 *
 * GLANCE ORDER: 1st THE READ, a single hero glyph that answers the same
 * question in all four interaction states ("what shape is the reading in
 * front of you"), which is what keeps it focal rather than merely big;
 * 2nd the rack, where the hands go; 3rd the bench status line. The
 * schematic is demoted from a full column to an --r-aux satellite plate.
 *
 * RISK is reserved for ACTIVE rejection only. The passive "this piece has
 * no partner anywhere" case is a resting condition, not something you just
 * did, so it stays --r-line; and DEAD slots are colour-ABSENT rather than
 * red, because a held piece can leave four of five slots dead at once and
 * red that common habituates the eye.
 *
 * Every flash and pulse animates OPACITY on a promoted plate (.sv-fx) and
 * the drag ghost rides a transform, so nothing on this interaction-heavy
 * surface animates a paint or layout property.
 */

type Dispatch = (a: DayAction) => void;

const NOUN: Record<"I" | "L" | "T" | "X", string> = {
  I: "Straight",
  L: "Elbow",
  T: "Tee",
  X: "Cross",
};

const NO_JOIN_LINE = "No legal join for that piece. The result must be strictly bigger than both.";
const FOOT_LINE =
  "A piece fills one slag block with exactly the arms it shows, welded where it lands. " +
  "2 RAM, one per turn, single use. Pieces come off the darknet, drop from cleared jobs, " +
  "or bank on clean wins. The weld itself is free: it costs the two pieces.";

const LINE_IDLE = "PICK A PIECE.";
const LINE_HELD = "PICK A PARTNER. THE WELD MUST OUTGROW BOTH.";
const LINE_READY = "READY. HIT CRAFT TO WELD.";
const lineDone = (noun: string) => `WELD DONE. ONE ${noun.toUpperCase()} IN THE POUCH.`;

const GLYPH = 44;

function armCount(mask: number): number {
  let n = 0;
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) n++;
  return n;
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

/** The typed bench line, one character at a time (18ms/char, shipped).
 * Tone is the role: NOMINAL when the weld is ready, RISK only while a
 * rejection is actively happening. */
function StatusBox({ text, tone }: { text: string; tone: "ok" | "reject" | null }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return;
    setN(0);
    const iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), 18);
    return () => clearInterval(iv);
  }, [text, reduced]);
  const shown = reduced ? text : text.slice(0, n);
  const cls = tone === "ok" ? "sv-status is-ready" : tone === "reject" ? "sv-status is-reject" : "sv-status";
  return (
    <div className={cls}>
      <span className="sv-status-label">{"// BENCH _"}</span>
      <span>
        {shown}
        {!reduced && n < text.length && <span className="kp-boot-cursor">_</span>}
      </span>
    </div>
  );
}

/** The satellite schematic plate. Live SVG, not a 1-bit raster, so law 5's
 * crop-never-downscale rule does not govern it: it resizes in its own
 * viewBox space exactly the way the patch glyphs already do. The tag gets a
 * band of its own rather than overlaying the drawing, because on a vertical
 * STRAIGHT it sat on the top arm. */
function Schematic({ base, gain }: { base: number; gain: number }) {
  const grid: Array<[number, number, number, number]> = [];
  for (let x = 0; x <= 304; x += 19) grid.push([x, 0, x, 228]);
  for (let y = 0; y <= 228; y += 19) grid.push([0, y, 304, y]);
  const cx = 152;
  const cy = 114;
  const ends: Array<[number, number]> = [
    [0, -84],
    [84, 0],
    [0, 84],
    [-84, 0],
  ];
  return (
    <div className="sv-schem">
      <span className="sv-schem-tag">SCHEMATIC</span>
      <svg viewBox="0 0 304 228" preserveAspectRatio="none" aria-hidden="true">
        {grid.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="grid" />
        ))}
        {base === 0 && gain === 0 ? (
          <rect x={cx - 17} y={cy - 17} width={34} height={34} className="hole" />
        ) : (
          <>
            {ends.map(([ex, ey], d) => {
              const bit = 1 << d;
              if (base & bit) return <line key={d} x1={cx} y1={cy} x2={cx + ex} y2={cy + ey} className="arm" />;
              // the GAIN arms carve out of r-aux into r-data: they are what
              // the partner ADDS, the thing about to change
              if (gain & bit)
                return <line key={d} x1={cx} y1={cy} x2={cx + ex} y2={cy + ey} className="arm arm-gain" />;
              return null;
            })}
            <circle cx={cx} cy={cy} r={11} className="hub" />
          </>
        )}
      </svg>
    </div>
  );
}

interface DragState {
  index: number;
  hoverIndex: number | null;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

export function SolderContent({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const { shop, day } = state;
  // During an open day the working pouch is the day's; in the evening the
  // banked pouch is what sits on the bench.
  const evening = day?.phase === "evening" || day?.phase === "sunday";
  const pouch = shop && day ? (evening ? shop.patchPouch : day.pouch) : [];
  const cap = shop ? pouchCapFor(shop.repairs) : 5;
  const reduced = useReducedMotion();
  const [sel, setSel] = useState<number | null>(null);
  const [pair, setPair] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [fusing, setFusing] = useState(false);
  const [lastWeld, setLastWeld] = useState<number | null>(null);
  const [status, setStatus] = useState(LINE_IDLE);
  const [tone, setTone] = useState<"ok" | "reject" | null>(null);
  const [deny, setDeny] = useState<number | null>(null);
  const [spark, setSpark] = useState<{ x: number; y: number; key: number } | null>(null);
  const [weldDot, setWeldDot] = useState<{ x: number; y: number; key: number } | null>(null);
  const [shake, setShake] = useState(false);
  const [reveal, setReveal] = useState(0);
  const rackRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);

  /* stale selection guards when the pouch shrinks under us */
  useEffect(() => {
    if (sel !== null && sel >= pouch.length) {
      setSel(null);
      setPair(null);
    }
    if (pair !== null && pair >= pouch.length) setPair(null);
  }, [pouch.length, sel, pair]);

  const legalPartners = useCallback(
    (a: number): Set<number> =>
      new Set(pouch.map((_, i) => i).filter((i) => i !== a && armUnionCraft(pouch[a], pouch[i]) !== null)),
    [pouch],
  );

  const held = drag ? drag.index : sel;

  const candidate = useMemo(() => {
    if (drag) {
      const h = drag.hoverIndex;
      if (h !== null && h < pouch.length && h !== drag.index && armUnionCraft(pouch[drag.index], pouch[h]) !== null) {
        return { a: drag.index, b: h };
      }
      return null;
    }
    if (sel !== null && pair !== null) return { a: sel, b: pair };
    return null;
  }, [drag, sel, pair, pouch]);

  /* status line follows the machine state. NO_JOIN_LINE has two causes and
   * only ONE of them is an alarm: an ACTIVE rejection (you are hovering an
   * illegal target right now) takes --r-warn; the passive "this piece has
   * no partner anywhere" case does not. */
  useEffect(() => {
    if (fusing) return;
    if (held === null) {
      setStatus(LINE_IDLE);
      setTone(null);
      return;
    }
    if (candidate) {
      setStatus(LINE_READY);
      setTone("ok");
      return;
    }
    const partners = legalPartners(held);
    const hoveringIllegal = drag !== null && drag.hoverIndex !== null;
    if (hoveringIllegal) {
      setStatus(NO_JOIN_LINE);
      setTone("reject");
    } else if (partners.size === 0) {
      setStatus(NO_JOIN_LINE);
      setTone(null);
    } else {
      setStatus(LINE_HELD);
      setTone(null);
    }
  }, [held, candidate, fusing, drag, legalPartners]);

  const slotCenter = (i: number): { x: number; y: number } | null => {
    const elm = rackRef.current?.querySelector<HTMLElement>(`[data-slot-index="${i}"]`);
    if (!elm) return null;
    const r = elm.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const commitWeld = useCallback(
    (a: number, b: number, union: number) => {
      sfx("pieceFuse", { bus: "ui" });
      dispatch({ type: "weldPieces", a, b });
      setSel(null);
      setPair(null);
      setFusing(false);
      setLastWeld(union);
      setReveal((r) => r + 1);
      setStatus(lineDone(NOUN[shapeClassOf(union)]));
      setTone(null);
    },
    [dispatch],
  );

  const fuseAt = useCallback(
    (a: number, b: number) => {
      const union = armUnionCraft(pouch[a], pouch[b]);
      if (union === null) return;
      setFusing(true);
      sfx("solderArc", { bus: "ui" });
      if (reduced) {
        commitWeld(a, b, union);
        return;
      }
      const target = slotCenter(b);
      if (target) {
        setSpark({ x: target.x, y: target.y, key: Date.now() });
        setTimeout(() => setSpark(null), 200);
        setTimeout(() => {
          setShake(true);
          setWeldDot({ x: target.x, y: target.y, key: Date.now() });
          setTimeout(() => setWeldDot(null), 1200);
        }, 80);
      }
      setTimeout(() => {
        setShake(false);
        commitWeld(a, b, union);
      }, 260);
    },
    [pouch, reduced, commitWeld],
  );

  const rejectCancel = useCallback(
    (flashIndex: number | null) => {
      const heldNow = drag ? drag.index : sel;
      if (flashIndex !== null && flashIndex !== heldNow) {
        sfx("solderReject", { bus: "ui" });
        setDeny(flashIndex);
        setTimeout(() => setDeny(null), 180);
        setStatus(NO_JOIN_LINE);
        setTone("reject");
      }
      if (drag) setDrag(null);
      setSel(null);
      setPair(null);
    },
    [drag, sel],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (drag || sel !== null) && !fusing) rejectCancel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, sel, fusing, rejectCancel]);

  /* held piece: the whole page reads grabbing (gate-cleared cursor addendum) */
  useEffect(() => {
    document.body.classList.toggle("kp-dragging-piece", drag !== null);
    return () => document.body.classList.remove("kp-dragging-piece");
  }, [drag !== null]);

  const tapActivate = (i: number) => {
    if (fusing) return;
    if (sel === null) {
      sfx("solderPickup", { bus: "ui" });
      setSel(i);
    } else if (i === sel) {
      setSel(null);
      setPair(null);
    } else if (pair === null) {
      if (legalPartners(sel).has(i)) {
        sfx("solderHoverLegal", { bus: "ui" });
        setPair(i);
      } else {
        rejectCancel(i);
      }
    } else if (i === pair) {
      setPair(null);
    }
  };

  /* pointer plumbing: mouse/pen drag past 6px lifts the piece */
  const startRef = useRef<{ x: number; y: number; index: number; dragged: boolean } | null>(null);

  const onSlotPointerDown = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (fusing) return;
    startRef.current = { x: e.clientX, y: e.clientY, index: i, dragged: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onSlotPointerMove = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = startRef.current;
    if (drag) {
      moveDrag(e.clientX, e.clientY);
      return;
    }
    if (!start || fusing) return;
    const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if ((e.pointerType === "mouse" || e.pointerType === "pen") && dist > 6) {
      start.dragged = true;
      const elm = rackRef.current?.querySelector<HTMLElement>(`[data-slot-index="${i}"]`);
      const rect = elm?.getBoundingClientRect();
      sfx("solderPickup", { bus: "ui" });
      setSel(null);
      setPair(null);
      setDrag({
        index: i,
        hoverIndex: null,
        x: rect ? rect.left : e.clientX,
        y: rect ? rect.top : e.clientY,
        offsetX: rect ? e.clientX - rect.left : 0,
        offsetY: rect ? e.clientY - rect.top : 0,
      });
    }
  };

  const moveDrag = (cx: number, cy: number) => {
    setDrag((d) => {
      if (!d) return d;
      const under = document.elementFromPoint(cx, cy);
      const slotEl = under?.closest?.("[data-slot-index]") as HTMLElement | null;
      const idx =
        slotEl && rackRef.current?.contains(slotEl) ? Number(slotEl.dataset.slotIndex) : null;
      if (idx !== d.hoverIndex && idx !== null && idx < pouch.length && idx !== d.index) {
        const legal = armUnionCraft(pouch[d.index], pouch[idx]) !== null;
        sfx(legal ? "solderHoverLegal" : "solderHoverIllegal", { bus: "ui" });
      }
      return { ...d, x: cx - d.offsetX, y: cy - d.offsetY, hoverIndex: idx };
    });
  };

  const onSlotPointerUp = () => (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = startRef.current;
    startRef.current = null;
    if (drag && start?.dragged) {
      const { index, hoverIndex } = drag;
      const legal =
        hoverIndex !== null &&
        hoverIndex !== index &&
        hoverIndex < pouch.length &&
        armUnionCraft(pouch[index], pouch[hoverIndex]) !== null;
      if (legal) {
        setDrag(null);
        fuseAt(index, hoverIndex);
      } else {
        rejectCancel(hoverIndex !== null && hoverIndex < pouch.length ? hoverIndex : null);
      }
      e.preventDefault();
    }
  };

  const onSlotClick = (i: number) => () => {
    const start = startRef.current;
    if (start?.dragged) return;
    tapActivate(i);
  };

  /* Z1, the one focal element. The hero answers the SAME question in all
   * four interaction states, which is what keeps it focal instead of merely
   * big. It is a pure presentation of held/candidate: no new state, ever. */
  const schem = useMemo(() => {
    if (candidate) {
      const a = pouch[candidate.a];
      const b = pouch[candidate.b];
      const u = (a | b) & 0xf;
      return {
        base: a,
        gain: b & ~a & 0xf,
        eyebrow: "// JOIN RESULT _",
        hero: NOUN[shapeClassOf(u)].toUpperCase(),
        arms: `${armCount(u)} ARMS`,
        idle: false,
      };
    }
    if (held !== null && held < pouch.length) {
      return {
        base: pouch[held],
        gain: 0,
        eyebrow: "// WORKPIECE _",
        hero: NOUN[shapeClassOf(pouch[held])].toUpperCase(),
        arms: `${armCount(pouch[held])} ARMS`,
        idle: false,
      };
    }
    /* IDLE: the placeholder sits at the hero's OWN footprint, never a
     * smaller idle treatment (equal footprint, applied at the hero) */
    return { base: 0, gain: 0, eyebrow: "// WORKPIECE _", hero: "----", arms: "", idle: true };
  }, [candidate, held, pouch]);

  const union = candidate ? armUnionCraft(pouch[candidate.a], pouch[candidate.b]) : null;
  const partners = held !== null && held < pouch.length ? legalPartners(held) : null;

  return (
    <div className="sv-panel">
      <div className="sv-grid">
        {/* Z1 THE READ: the surface's focal zone. A full-width band, not a
            left column: the longest noun (STRAIGHT, 8 Silkscreen glyphs)
            cannot render at hero scale in 300px, and the row Z2 vacated
            was a row it was sharing anyway. */}
        <section className="sv-read">
          <span className="sv-bracket" aria-hidden="true">
            <i />
          </span>
          <div className="sv-heroline">
            <span className="sv-eyebrow">{schem.eyebrow}</span>
            <span className={schem.idle ? "sv-hero is-idle" : "sv-hero"}>{schem.hero}</span>
            <span className="sv-armcount">{schem.arms}</span>
          </div>
          <Schematic base={schem.base} gain={schem.gain} />
        </section>

        {/* Z2 STATUS + Z4 FOOT: what the bench IS. Its short box sits beside
            the tall deck for free; the bookkeeping chips anchor the column
            and shorten the deck by a row it was paying for in full. */}
        <div className="sv-side">
          <StatusBox text={status} tone={tone} />
          <div className="sv-footchips">
            <Chip label="POUCH" value={`${pouch.length}/${cap}`} />
            <span className="sv-weldbox">
              <Chip label="LAST WELD" value="" />
              <span className={lastWeld === null ? "sv-weldcell sv-weldcell-empty" : "sv-weldcell"}>
                {lastWeld !== null && <PatchGlyph mask={lastWeld} size={34} />}
              </span>
            </span>
          </div>
        </div>

        {/* Z3 THE RACK: what your hands are doing */}
        <section ref={deckRef} className={shake ? "sv-deck kp-shake-1" : "sv-deck"}>
          <div className="sv-deckhead">
            <strong>PATCH POUCH</strong>
          </div>
          {/* five equal columns, so a 5-piece pouch and an EMPTY pouch
              occupy exactly the same footprint */}
          <div className="sv-rack" ref={rackRef}>
            {Array.from({ length: cap }).map((_, i) => {
              if (i >= pouch.length) {
                return (
                  <span key={`e${i}`} className="sv-slot sv-slot-empty" data-slot-index={i} aria-hidden="true">
                    <span className="kp-piece-hole" />
                  </span>
                );
              }
              const isCarry = !drag && (i === sel || i === pair);
              const isDragSource = drag?.index === i;
              const dead = drag
                ? i !== drag.index && !legalPartners(drag.index).has(i)
                : sel !== null && i !== sel && i !== pair && (pair !== null || !(partners?.has(i) ?? false));
              const hoverLegal = drag && drag.hoverIndex === i && candidate?.b === i;
              const hoverIllegal = drag && drag.hoverIndex === i && i !== drag.index && !hoverLegal;
              const cls = [
                "sv-slot",
                isCarry ? "sv-slot-carry" : "",
                dead && !isDragSource ? "sv-slot-dead" : "",
                hoverLegal ? "sv-slot-legal" : "",
                hoverIllegal ? "sv-slot-illegal" : "",
                deny === i ? "sv-slot-deny" : "",
                reveal > 0 && !reduced ? "kp-slot-anim" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  data-slot-index={i}
                  disabled={!drag && dead}
                  style={reveal > 0 && !reduced ? { animationDelay: `${i * 40}ms` } : undefined}
                  onPointerDown={onSlotPointerDown(i)}
                  onPointerMove={onSlotPointerMove(i)}
                  onPointerUp={onSlotPointerUp()}
                  onClick={onSlotClick(i)}
                >
                  {isDragSource ? (
                    <span className="kp-piece-hole" />
                  ) : (
                    <>
                      <PatchGlyph mask={pouch[i]} size={GLYPH} />
                      <span>{NOUN[shapeClassOf(pouch[i])]}</span>
                    </>
                  )}
                  {/* one promoted plate per slot: every flash and pulse on
                      this surface animates its opacity, never a paint */}
                  <i className="sv-fx" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {/* the join preview, demoted to the two INPUTS and an arrow. The
              result noun is cut: Z1 already states it at 5x this size. */}
          <div className="sv-join">
            {candidate && union !== null && (
              <>
                <PatchGlyph mask={pouch[candidate.a]} size={18} />
                {"+"}
                <PatchGlyph mask={pouch[candidate.b]} size={18} />
                {"->"}
                <PatchGlyph mask={union} size={22} />
              </>
            )}
          </div>
          <div className="sv-actions">
            {candidate && !drag && union !== null && (
              <>
                <button type="button" className="sv-btn sv-btn-craft" onClick={() => fuseAt(candidate.a, candidate.b)}>
                  CRAFT
                </button>
                <button type="button" className="sv-btn" onClick={() => rejectCancel(null)}>
                  CANCEL
                </button>
              </>
            )}
          </div>
        </section>

        {/* Z5 CAPTION: full text, lowest box weight. LOADOUT.CFG was allowed
            to cut its copy of this explanation precisely because SOLDER.BAY
            keeps it in full at first contact; cutting it here would leave
            the explanation nowhere. Only the box weight changes. */}
        <div className="sv-caption">
          <div className="sv-div">
            <span>{"// PLACEMENT"}</span>
            <i />
          </div>
          <p className="sv-foot">{FOOT_LINE}</p>
        </div>
      </div>

      {/* drag ghost + weld overlays */}
      {drag && (
        // positioned by TRANSFORM off a fixed origin, never left/top: a
        // layout property animating at pointer rate is the single most
        // expensive thing this surface could do inside the glass
        <div
          className="sv-slot sv-slot-carry sv-ghost"
          style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
        >
          <PatchGlyph mask={pouch[drag.index]} size={GLYPH} />
          <span>{NOUN[shapeClassOf(pouch[drag.index])]}</span>
        </div>
      )}
      {spark && (
        <div key={spark.key} className="sv-spark" style={{ left: spark.x - 24, top: spark.y - 24 }}>
          <svg width={48} height={48} viewBox="-12 -12 24 24">
            {Array.from({ length: 4 }).map((_, i) => {
              const a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * 3}
                  y1={Math.sin(a) * 3}
                  x2={Math.cos(a) * 10}
                  y2={Math.sin(a) * 10}
                  stroke="var(--ch-hot)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
        </div>
      )}
      {weldDot && (
        <div key={weldDot.key} className="sv-weldwrap" style={{ left: weldDot.x - 8, top: weldDot.y - 8 }}>
          <svg width={16} height={16} viewBox="-8 -8 16 16">
            <circle r={3.5} className="kp-dweld" />
          </svg>
        </div>
      )}
    </div>
  );
}
