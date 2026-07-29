import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../../../game/audio";
import { PATCH_POUCH_MAX, armUnionCraft, shapeClassOf } from "../../../game/patch-cells";
import type { RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { PatchGlyph } from "../../game/patch-glyph";
import { Chip, Hero, Ticks } from "../kp-ui";

/**
 * SOLDER.BAY: the patch crafting bench. Left column is the SCHEMATIC
 * magnifier (the held piece drawn large on a blueprint grid; during a join
 * candidate the arms the partner contributes blink hot) over the typed
 * dialogue box. Right column is the deck: JOIN hero while holding, the
 * five-slot rack (tap a piece then a partner, or drag one onto another),
 * join preview with CRAFT / CANCEL, and the boxed POUCH counter plus the
 * inverse-video LAST WELD box. Pieces that cannot join the held one go
 * DEAD; with a pair locked the rest of the rack goes inert. ESC cancels.
 */

type Dispatch = (a: RunAction) => void;

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
  `or bank on clean wins; the pouch holds ${PATCH_POUCH_MAX}.`;

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

/** The typed dialogue box, one line at a time. */
function StatusBox({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return;
    setN(0);
    const iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), 18);
    return () => clearInterval(iv);
  }, [text, reduced]);
  const shown = reduced ? text : text.slice(0, n);
  return (
    <div className="kp-solder-status">
      <span>
        {shown}
        {!reduced && n < text.length && <span className="kp-boot-cursor">_</span>}
      </span>
    </div>
  );
}

/** The machine's magnifier: base mask solid ink, gain arms hot + blinking. */
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
    <div className="kp-schem">
      <span className="kp-schem-tag">SCHEMATIC</span>
      <svg viewBox="0 0 304 228" aria-hidden="true">
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

export function SolderContent({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const pouch = run.patchPouch;
  const reduced = useReducedMotion();
  const [sel, setSel] = useState<number | null>(null);
  const [pair, setPair] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [fusing, setFusing] = useState(false);
  const [lastWeld, setLastWeld] = useState<number | null>(null);
  const [status, setStatus] = useState(LINE_IDLE);
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

  /* status line follows the machine state */
  useEffect(() => {
    if (fusing) return;
    if (held === null) {
      setStatus(LINE_IDLE);
      return;
    }
    if (candidate) {
      setStatus(LINE_READY);
      return;
    }
    const partners = legalPartners(held);
    const hoveringIllegal = drag !== null && drag.hoverIndex !== null;
    setStatus(partners.size === 0 || hoveringIllegal ? NO_JOIN_LINE : LINE_HELD);
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
      dispatch({ type: "craftPatch", a, b });
      setSel(null);
      setPair(null);
      setFusing(false);
      setLastWeld(union);
      setReveal((r) => r + 1);
      setStatus(lineDone(NOUN[shapeClassOf(union)]));
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

  /* schematic contents */
  const schem = useMemo(() => {
    if (candidate) {
      const a = pouch[candidate.a];
      const b = pouch[candidate.b];
      return { base: a, gain: b & ~a & 0xf, read: `${NOUN[shapeClassOf((a | b) & 0xf)]} / ${armCount((a | b) & 0xf)} arms` };
    }
    if (held !== null && held < pouch.length) {
      return { base: pouch[held], gain: 0, read: `${NOUN[shapeClassOf(pouch[held])]} / ${armCount(pouch[held])} arms` };
    }
    return { base: 0, gain: 0, read: "----" };
  }, [candidate, held, pouch]);

  const union = candidate ? armUnionCraft(pouch[candidate.a], pouch[candidate.b]) : null;
  const partners = held !== null && held < pouch.length ? legalPartners(held) : null;

  return (
    <div className="kp-solder2">
      <div className="kp-solder-lay">
        <div className="kp-solder-left">
          <Schematic base={schem.base} gain={schem.gain} />
          <div className="kp-datarow kp-datarow-plain">
            <span>WORKPIECE</span>
            <em style={{ textTransform: "uppercase" }}>{schem.read}</em>
          </div>
          <StatusBox text={status} />
        </div>
        <div ref={deckRef} className={`kp-solder-deck2 kp-frame-ticks ${shake ? "kp-shake-1" : ""}`.trim()}>
          <Ticks />
          <div className="kp-deck-head">
            <strong>PATCH POUCH</strong>
            <em>
              {pouch.length} / {PATCH_POUCH_MAX}
            </em>
          </div>
          <div className="kp-hero-slot">{held !== null && !fusing && <Hero text="JOIN" />}</div>
          <div className="kp-rack" ref={rackRef}>
            {Array.from({ length: PATCH_POUCH_MAX }).map((_, i) => {
              if (i >= pouch.length) {
                return (
                  <span key={`e${i}`} className="kp-slot2 kp-slot-empty" data-slot-index={i} aria-hidden="true">
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
                "kp-slot2",
                isCarry ? "kp-slot-carry2" : "",
                dead && !isDragSource ? "kp-slot-dead" : "",
                hoverLegal ? "kp-slot-legal2" : "",
                hoverIllegal ? "kp-slot-illegal2" : "",
                deny === i ? "kp-slot-deny2" : "",
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
                </button>
              );
            })}
          </div>
          <div className="kp-join-row">
            {candidate && union !== null && (
              <>
                {"JOIN: "}
                <PatchGlyph mask={pouch[candidate.a]} size={16} />
                {" + "}
                <PatchGlyph mask={pouch[candidate.b]} size={16} />
                {" -> "}
                <PatchGlyph mask={union} size={20} />
                <b> {NOUN[shapeClassOf(union)]}</b>
              </>
            )}
          </div>
          <div className="kp-solder-actions">
            {candidate && !drag && union !== null && (
              <>
                <button type="button" className="kp-btn2 kp-btn2-primary" onClick={() => fuseAt(candidate.a, candidate.b)}>
                  CRAFT
                </button>
                <button type="button" className="kp-btn2 kp-btn2-ghost" onClick={() => rejectCancel(null)}>
                  CANCEL
                </button>
              </>
            )}
          </div>
          <div className="kp-deck-foot">
            <Chip label="POUCH" value={`${pouch.length}/${PATCH_POUCH_MAX}`} />
            <span className="kp-weld-box">
              <Chip label="LAST WELD" value="" />
              <span className={lastWeld === null ? "kp-weld-cell kp-weld-cell-empty" : "kp-weld-cell"}>
                {lastWeld !== null && <PatchGlyph mask={lastWeld} size={34} />}
              </span>
            </span>
          </div>
        </div>
      </div>
      <p className="kp-solder-caption">{FOOT_LINE}</p>

      {/* drag ghost + weld overlays */}
      {drag && (
        <div className="kp-slot2 kp-slot-carry2 kp-ghostchip" style={{ left: drag.x, top: drag.y }}>
          <PatchGlyph mask={pouch[drag.index]} size={GLYPH} />
          <span>{NOUN[shapeClassOf(pouch[drag.index])]}</span>
        </div>
      )}
      {spark && (
        <div key={spark.key} className="kp-spark2" style={{ left: spark.x - 24, top: spark.y - 24 }}>
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
        <div key={weldDot.key} className="kp-weldwrap2 kp-weld-fade2" style={{ left: weldDot.x - 8, top: weldDot.y - 8 }}>
          <svg width={16} height={16} viewBox="-8 -8 16 16">
            <circle r={3.5} className="kp-dweld" />
          </svg>
        </div>
      )}
    </div>
  );
}
