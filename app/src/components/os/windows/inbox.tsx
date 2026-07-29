import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sfx } from "../../../game/audio";
import { DAY_CONFIGS, FINAL_DAY, jobPay } from "../../../game/content/arc";
import { CustomerProfile } from "../../../game/content/customers";
import { MODE_LABEL, MODE_TELL } from "../../../game/content/kit";
import type { RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { tip } from "../../../game/content/teaching";
import { customerById } from "../../game/screens";
import { cardPortraitFor, deviceArtFor } from "../roster-art";
import { Teach } from "../../game/teach";
import { TapTip } from "../../game/tap-tip";
import { PatchGlyph } from "../../game/patch-glyph";
import { Btn, Chip, Hero, Nodes, Ticks } from "../kp-ui";

/**
 * INBOX: the day loop's front door. Collapsed (`run.screen === "day"`): the
 * day strip and one boxed subject line per ticket, from Rhea. Opening a
 * ticket dispatches pickJob; the reducer's `analyze` screen renders as the
 * expanded CUSTOMER.REC card (same teaching surface, new presentation).
 *
 * Open/close choreography ports inbox.html's staged machine: one axis at a
 * time so the frame never tears diagonally. Open: grow tall (measured off a
 * hidden clone with its full text), then wide, then the card genies out of
 * its list row. File away: the card shrinks into its row, the window pulls
 * back in, then settles down. Instant under reduced motion.
 */

type Dispatch = (a: RunAction) => void;

/** Rhea's subject lines, one per customer order (gate-cleared,
 * ui-integration-2026-07-29). A customer without a routed line falls back
 * to their own complaint, truncated to one line, never blank. */
const SUBJECTS: Record<string, string> = {
  "juno-vex": "RE: Hexlight handheld. Juno swears a ghost is beating her high score.",
  "sable-okonkwo": "RE: Kestrel courier drone. Her routes keep rewriting themselves mid flight.",
  "aldous-wick": "RE: Meridian ledger terminal. Aldous again. The books are biting back.",
  "wren-tallis": "RE: the studio masters. Something is hiding her tracks. She can hear it breathing.",
  "bram-hollander": "RE: Copperline register. His own till locked him out after eleven years.",
  "dex-marlowe": "RE: Nocta cram deck. His homework keeps rerouting to the arcade. Convenient.",
  "june-aksoy": "RE: Halcyon clinic gateway. Wards keep locking at shift change. Keep it quiet.",
  "ines-calloway": "RE: Ferrox lifter suit. Servos keep cutting mid lift. Before somebody gets hurt.",
  "emeric-snow": "RE: Ivora chess cabinet. Fifty years in, and now it plays him instead of chess.",
  "vera-stanek": "RE: Apothek dosage safe. It rations her power like pills now. Cold storage too.",
  "casimir-bell": "RE: Ledgerstone pawn vault. It grew a lock nobody bought. He wants it gone.",
  "noor-behzadi": "RE: Polyverb synth brain. It is playing sets she never wrote. In her sleep.",
};

export function subjectFor(c: CustomerProfile): string {
  const routed = SUBJECTS[c.id];
  if (routed) return routed;
  const quote = c.quotes[0] ?? c.device;
  return quote.length > 64 ? `${quote.slice(0, 61)}...` : quote;
}

/** The open window's card-pane width: the wide window (clamped to the
 * viewport the way the wm clamps it) minus borders, body padding, the
 * fixed list column and the grid gap. Must track the CSS; computed at
 * measure time because 96vw is the live clamp. */
const OPEN_W = 1210;
function paneWidth(): number {
  return Math.min(OPEN_W, window.innerWidth * 0.96) - 6 - 36 - 470 - 18;
}

/** Deterministic pseudo-random stream (the studies' seeded() pattern). */
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

/** Async typewriter with blinking caret; instant under reduced motion or
 * when the host is a hidden measurement clone. */
function Typed({
  text,
  delay = 0,
  interval = 24,
  className,
  instant = false,
}: {
  text: string;
  delay?: number;
  interval?: number;
  className?: string;
  instant?: boolean;
}) {
  const reduced = useReducedMotion();
  const still = reduced || instant;
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (still) return;
    setN(0);
    setStarted(false);
    const start = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(start);
  }, [text, delay, still]);
  useEffect(() => {
    if (!started || still) return;
    if (n >= text.length) return;
    const iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), interval);
    return () => clearInterval(iv);
  }, [started, still, n >= text.length, text, interval]);
  const shown = still ? text : text.slice(0, n);
  const typing = !still && started && n < text.length;
  return (
    <span className={className}>
      {shown}
      {typing && <span className="kp-boot-cursor">_</span>}
    </span>
  );
}

/* ---------- the CUSTOMER.REC card ---------- */

function PrintMark({ id }: { id: string }) {
  const cells = useMemo(() => {
    const next = seeded(id);
    return Array.from({ length: 81 }, () => next() % 5 < 2);
  }, [id]);
  return (
    <span className="kp-printmark" aria-hidden="true">
      {cells.map((on, i) => (
        <i key={i} className={on ? "on" : undefined} />
      ))}
    </span>
  );
}

function CardScope({ id }: { id: string }) {
  const pts = useMemo(() => {
    const next = seeded(id);
    const out: string[] = [];
    for (let px = 0; px <= 700; px += 7) {
      const base = 45 + Math.sin(px / 34) * 24;
      const jit = ((next() % 100) / 100 - 0.5) * 10;
      out.push(`${px},${Math.round(base + jit)}`);
    }
    return out.join(" ");
  }, [id]);
  const vlines: number[] = [];
  for (let x = 0; x <= 700; x += 28) vlines.push(x);
  const hlines: number[] = [];
  for (let y = 0; y <= 90; y += 18) hlines.push(y);
  return (
    <div className="kp-card-scope" aria-hidden="true">
      <svg viewBox="0 0 700 90" preserveAspectRatio="none" height={90}>
        {vlines.map((x) => (
          <line key={`v${x}`} x1={x} x2={x} y1={0} y2={90} className="grid" />
        ))}
        {hlines.map((y) => (
          <line key={`h${y}`} x1={0} x2={700} y1={y} y2={y} className="grid" />
        ))}
        <polyline points={pts} shapeRendering="crispEdges" />
      </svg>
    </div>
  );
}

function HexRows({ id, instant }: { id: string; instant?: boolean }) {
  const rows = useMemo(() => {
    const next = seeded(`${id}-hex`);
    return Array.from({ length: 12 }, () =>
      Array.from({ length: 3 }, () => (next() % 0xffff).toString(16).toUpperCase().padStart(4, "0")).join(" "),
    );
  }, [id]);
  return (
    <div className="kp-hexrows">
      {rows.map((row, i) => (
        <Typed key={`${id}-${i}`} text={row} delay={600 + i * 40} interval={7} instant={instant} />
      ))}
    </div>
  );
}

function CardRow({
  label,
  value,
  typed,
  delay,
  instant,
}: {
  label: string;
  value: ReactNode;
  typed?: string;
  delay?: number;
  instant?: boolean;
}) {
  return (
    <div className="kp-datarow kp-datarow-plain">
      <span>{label}</span>
      <em>{typed !== undefined ? <Typed text={typed} delay={delay ?? 0} instant={instant} /> : value}</em>
    </div>
  );
}

export function CustomerCard({
  run,
  jobIndex,
  instant = false,
}: {
  run: RunState;
  jobIndex: number;
  /** Render with full text immediately (measurement clones). */
  instant?: boolean;
}) {
  const job = run.jobs[jobIndex];
  const c = customerById(job.customerId);
  const day = DAY_CONFIGS[run.day];
  return (
    <div className="kp-pane">
      <div className="kp-pane-subject">
        <Typed className="kp-pane-from" text="From: Rhea" delay={0} instant={instant} />
        <Typed className="kp-pane-subj" text={subjectFor(c)} delay={120} instant={instant} />
      </div>
      <div className="kp-card kp-frame-nodes">
        <Nodes />
        <header className="kp-card-head">
          <h2>CUSTOMER.REC</h2>
          <span className="kp-card-batt" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </header>
        <div className="kp-card-inner">
          <div className="kp-card-photos">
            <div className="kp-cell">
              <span className="kp-cell-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <img src={cardPortraitFor(c)} alt="" width={880} height={880} />
              <i className="tint" aria-hidden="true" />
            </div>
            <div className="kp-cell">
              <img src={deviceArtFor(c)} alt="" width={880} height={880} />
              <i className="tint" aria-hidden="true" />
            </div>
          </div>
          <div className="kp-card-mid">
            <div className="kp-card-mid-left">
              <div className="kp-cell-open kp-frame-ticks">
                <Ticks />
                <PrintMark id={c.id} />
              </div>
              <div className="kp-cell-open kp-frame-ticks">
                <Ticks />
                <span className="kp-eyecrop-wrap">
                  <span className="kp-eyecrop" style={{ backgroundImage: `url(${cardPortraitFor(c)})` }} />
                  <i className="tint" aria-hidden="true" />
                </span>
              </div>
            </div>
            <div className="kp-card-rows">
              <CardRow label="NAME" value={null} typed={c.name.toUpperCase()} delay={100} instant={instant} />
              <CardRow label="DEVICE" value={null} typed={c.device} delay={170} instant={instant} />
              <CardRow label="DOMINANT ROUTINE" value={null} typed={MODE_LABEL[job.dominant]} delay={240} instant={instant} />
              <div className="kp-datarow kp-datarow-plain">
                <span>THREAT TIERS</span>
                <em>
                  <TapTip text={tip("threatTier")}>
                    <span className="kp-pip-row">
                      {Array.from({ length: 5 }).map((_, t) => (
                        <i key={t} className={t < job.tier ? "kp-pip-diamond kp-pip-on" : "kp-pip-diamond"} />
                      ))}
                    </span>
                  </TapTip>
                </em>
              </div>
              <CardRow label="TICKET RATE" value={null} typed={`${jobPay(job.tier)} cr`} delay={310} instant={instant} />
              <CardRow label="GRID" value={null} typed={`${day.grid[0]}x${day.grid[1]}`} delay={380} instant={instant} />
              <CardRow label="INTRUSION RAM" value={null} typed={`${day.oppRam}/turn`} delay={450} instant={instant} />
              {day.headStart > 0 && (
                <div className="kp-datarow kp-datarow-plain kp-datarow-warn">
                  <span>WARNING</span>
                  <em>
                    <Typed text={`Intrusion already ${day.headStart} nodes deep`} delay={520} instant={instant} />
                  </em>
                </div>
              )}
            </div>
          </div>
          <div className="kp-intake">
            <span className="kp-intake-label">INTAKE</span>
            <div>
              <Typed text={`"${c.quotes[job.quoteIndex]}"`} delay={320} instant={instant} />
            </div>
          </div>
          <div className="kp-readout">
            <span className="kp-intake-label">READOUT</span>
            <p className="kp-readout-tell">
              <Typed text={MODE_TELL[job.dominant]} delay={420} instant={instant} />
            </p>
          </div>
          <CardScope id={c.id} />
          <HexRows id={c.id} instant={instant} />
        </div>
      </div>
      <Teach id="analyze-readout" />
    </div>
  );
}

/* ---------- the inbox proper ---------- */

export function InboxContent({
  run,
  dispatch,
  onConfigureKit,
  onWide,
}: {
  run: RunState;
  dispatch: Dispatch;
  onConfigureKit: () => void;
  /** The window steps wide/narrow on this signal (the width axis). */
  onWide: (wide: boolean) => void;
}) {
  // Filing a ticket away is pure presentation: the reducer stays on
  // `analyze` while the card is merely collapsed; only BACK dispatches
  // backToDay.
  const [filed, setFiled] = useState(false);
  useEffect(() => {
    setFiled(false);
  }, [run.activeJob, run.screen]);
  const open = run.screen === "analyze" && !filed ? run.activeJob : null;
  const allDone = run.jobsDone.length > 0 && run.jobsDone.every(Boolean);
  const reduced = useReducedMotion();

  /* staged open/close machine: which pane is MOUNTED lags `open`. The
   * vertical axis is driven by direct style writes on the sizing wrapper
   * (never rAF: an occluded window would stall the sequence). */
  const [paneFor, setPaneFor] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [measuring, setMeasuring] = useState<number | null>(null);
  const [wide, setWide] = useState(false);
  const sizeRef = useRef<HTMLDivElement | null>(null);
  const sideRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const prevOpenRef = useRef<number | null>(null);

  const stage = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);
  const clearStages = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  /* the window narrows again if this content ever unmounts mid-flight */
  useEffect(() => () => onWide(false), [onWide]);
  useEffect(() => () => clearStages(), [clearStages]);

  useEffect(() => {
    const prev = prevOpenRef.current;
    if (prev === open) return;
    prevOpenRef.current = open;
    clearStages();

    if (reduced) {
      setMeasuring(null);
      setClosing(false);
      setPaneFor(open);
      setWide(open !== null);
      onWide(open !== null);
      if (sizeRef.current) sizeRef.current.style.height = "";
      return;
    }

    if (prev === null && open !== null) {
      /* OPEN, one axis at a time: measure the destination first */
      setMeasuring(open);
      return; // the layout effect below runs the vertical phase
    }

    if (prev !== null && open === null) {
      /* FILE AWAY, in reverse: card shrinks into its row, the window pulls
       * back in with the grid still two-column (the fixed list column
       * holds its width; folding to 1fr early would snap the rows out to
       * the still-wide frame), then the grid folds where both layouts
       * agree on the column width, and the height settles */
      sfx("inboxFile", { bus: "ui" });
      setClosing(true);
      stage(() => {
        setClosing(false);
        setPaneFor(null);
        const el = sizeRef.current;
        if (el) {
          el.style.height = `${el.offsetHeight}px`;
          void el.offsetHeight;
        }
        onWide(false);
        stage(() => {
          setWide(false);
          const el2 = sizeRef.current;
          const sideH = sideRef.current?.offsetHeight;
          if (el2 && sideH) el2.style.height = `${sideH}px`;
          stage(() => {
            if (sizeRef.current) sizeRef.current.style.height = "";
          }, 240);
        }, 200);
      }, 180);
      return;
    }

    if (prev !== null && open !== null) {
      /* SWITCH: shrink into the old row, grow from the new; the window
       * itself stays put */
      setClosing(true);
      stage(() => {
        setClosing(false);
        setPaneFor(open);
      }, 180);
    }
  }, [open, reduced, onWide, stage, clearStages]);

  /* vertical phase: the measurement clone is in the DOM; read it, commit
   * the start height with a forced reflow, then run the timeline */
  useLayoutEffect(() => {
    if (measuring === null || reduced) return;
    const el = sizeRef.current;
    if (!el) return;
    const paneH = measureRef.current?.offsetHeight ?? 0;
    const sideH = sideRef.current?.offsetHeight ?? 0;
    const target = Math.max(paneH, sideH);
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.style.height = `${target}px`;
    sfx("inboxGrow", { bus: "ui" });
    stage(() => {
      sfx("inboxWide", { bus: "ui" });
      setWide(true);
      onWide(true);
    }, 200);
    stage(() => {
      setPaneFor(measuring);
      setMeasuring(null);
    }, 400);
    /* settle to auto only after the typewriters have finished, so the
     * pinned height never dips on partial text and never grows after */
    stage(() => {
      if (sizeRef.current) sizeRef.current.style.height = "";
    }, 2400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring, reduced]);

  /* genie: the card grows from its list item; origin = item center */
  useEffect(() => {
    if (paneFor === null || reduced || closing) return;
    const wrap = paneRef.current;
    const item = listRef.current?.children[paneFor] as HTMLElement | undefined;
    if (!wrap || !item) return;
    const ir = item.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    wrap.style.transformOrigin = `0px ${Math.round(ir.top + ir.height / 2 - wr.top)}px`;
    wrap.classList.remove("grow");
    void wrap.offsetWidth;
    sfx("inboxGenie", { bus: "ui" });
    wrap.classList.add("grow");
    const t = setTimeout(() => wrap.classList.remove("grow"), 210);
    return () => clearTimeout(t);
  }, [paneFor, reduced, closing]);

  /* UP/DOWN ticket selection while the inbox is the live surface */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const n = run.jobs.length;
      if (n === 0) return;
      e.preventDefault();
      const next =
        open === null
          ? e.key === "ArrowDown"
            ? 0
            : n - 1
          : e.key === "ArrowDown"
            ? (open + 1) % n
            : (open - 1 + n) % n;
      if (next !== open && !run.jobsDone[next]) {
        if (open !== null) dispatch({ type: "backToDay" });
        dispatch({ type: "pickJob", index: next });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, run.jobs.length, run.jobsDone, dispatch]);

  const toggle = (i: number) => {
    if (run.jobsDone[i]) return;
    sfx("press", { bus: "ui" });
    if (run.screen === "analyze" && run.activeJob === i) {
      setFiled((f) => !f);
      return;
    }
    if (run.screen === "analyze") dispatch({ type: "backToDay" });
    dispatch({ type: "pickJob", index: i });
  };

  const paneJob = paneFor !== null && run.jobs[paneFor] ? paneFor : null;

  return (
    <div ref={sizeRef} className="kp-inbox-size">
      <div className={wide ? "kp-inbox kp-inbox-open" : "kp-inbox"}>
        <div className="kp-inbox-side" ref={sideRef}>
          <div className="kp-screen-head">
            <div className="kp-hero-day">
              <b>DAY</b>
              <Hero text={String(Math.min(run.day, FINAL_DAY))} />
              <b>OF {FINAL_DAY}</b>
            </div>
            <p>Three tickets. Strain is shared across all of them. Pick your order.</p>
          </div>
          <span className="kp-inbox-label">INBOX</span>
          <div className="kp-inbox-list-zone">
            <div className="kp-inbox-list" ref={listRef}>
              {allDone && <div className="kp-inbox-item kp-inbox-done kp-inbox-alldone">ALL TICKETS FILED</div>}
              {!allDone &&
                run.jobs.map((job, i) => {
                const c = customerById(job.customerId);
                const done = run.jobsDone[i];
                return (
                  <button
                    key={i}
                    type="button"
                    className={`kp-inbox-item ${open === i ? "sel" : ""} ${done ? "kp-inbox-done" : ""}`.trim()}
                    disabled={done}
                    onClick={() => toggle(i)}
                  >
                    <span className="kp-inbox-subj">{done ? <s>{subjectFor(c)}</s> : subjectFor(c)}</span>
                    <span className="kp-inbox-meta">
                      <TapTip text={tip("threatTier")}>
                        <span className="kp-pip-row" aria-label={`Threat tier ${job.tier} of 5`}>
                          {Array.from({ length: 5 }).map((_, t) => (
                            <i key={t} className={t < job.tier ? "kp-pip-diamond kp-pip-on" : "kp-pip-diamond"} />
                          ))}
                        </span>
                      </TapTip>
                      {done ? (
                        <span className="kp-inbox-cleared">CLEARED</span>
                      ) : (
                        <span className="kp-inbox-pay">{jobPay(job.tier)} cr</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {open !== null && (
            <div className="kp-inbox-actions">
              <Btn
                label="DIVE"
                variant="signal"
                onClick={() => {
                  sfx("claimTick", { bus: "ui" });
                  dispatch({ type: "startDuel" });
                }}
              />
              <Btn label="CONFIGURE KIT" variant="ghost" onClick={onConfigureKit} />
              <Btn label="BACK" variant="ghost" onClick={() => dispatch({ type: "backToDay" })} />
            </div>
          )}
          <p className="kp-inbox-hint">UP, DOWN: select ticket | CLICK AGAIN: file it away</p>
          <footer className="kp-screen-foot">
            <TapTip text={tip("strain")}>
              <Chip label="STRAIN" value={String(run.strain)} crimson={run.strain > 70} />
            </TapTip>
            <Chip label="CR" value={String(run.credits)} />
            <TapTip text={tip("ram")}>
              <Chip label="RAM" value={`${run.ramPerTurn}/turn`} />
            </TapTip>
            {run.patchPouch.length > 0 && (
              <span className="kp-foot-pouch">
                <span className="kp-rail-dim">POUCH</span>
                {run.patchPouch.map((m, i) => (
                  <PatchGlyph key={i} mask={m} size={14} />
                ))}
              </span>
            )}
            <Chip label="KIT" value={`S${run.kit.scanTier}/A${run.kit.attackTier}/D${run.kit.defendTier}`} />
          </footer>
        </div>
        {paneJob !== null && (
          <div className={closing ? "kp-pane-wrap shrink" : "kp-pane-wrap"} ref={paneRef}>
            <CustomerCard run={run} jobIndex={paneJob} />
          </div>
        )}
      </div>
      {measuring !== null && run.jobs[measuring] && (
        <div className="kp-inbox-measure" aria-hidden="true">
          {/* kp-inbox-open on the clone so the short-desk compact rules
              measure the same card the live pane will render */}
          <div ref={measureRef} className="kp-inbox-open" style={{ width: paneWidth() }}>
            <CustomerCard run={run} jobIndex={measuring} instant />
          </div>
        </div>
      )}
    </div>
  );
}
