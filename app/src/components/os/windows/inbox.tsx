import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "../../../game/audio";
import { DAY_CONFIGS, FINAL_DAY, jobPay } from "../../../game/content/arc";
import { CustomerProfile } from "../../../game/content/customers";
import { MODE_LABEL, MODE_TELL } from "../../../game/content/kit";
import type { RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { tip } from "../../../game/content/teaching";
import { customerById } from "../../game/screens";
import { recDeviceFor, recPortraitFor } from "../roster-art";
import { Teach } from "../../game/teach";
import { TapTip } from "../../game/tap-tip";
import { PatchGlyph } from "../../game/patch-glyph";
import { Btn, Chip } from "../kp-ui";

/**
 * INBOX + CUSTOMER.REC as a KP/OS v3 instrument panel
 * (ui-demos/inbox-v3, cycle ux-2026-07-31-inbox-v3). System: ../RULINGS.md.
 *
 * GLANCE ORDER, resolved by STATE rather than by two focal elements
 * fighting: with no ticket open the DAY numeral is the hero; the moment a
 * ticket opens it demotes to an ordinary chip and DOMINANT ROUTINE plus
 * THREAT TIER take the focal slot. This is a decision surface, and the
 * decision is "what am I walking into", not "who is this".
 *
 * RISK is the head-start WARNING and nothing else on this surface. It
 * floods inverse video permanently and blinks a three-cycle BURST on
 * reveal: seven of the ten days carry headStart >= 1, so a continuous
 * strobe here would be ambient motion, which is the habituation motion
 * law 7 exists to prevent.
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

/** The day line is true in both states: an empty masthead in CARD state
 * read as unfinished rather than as ambient. */
const DAY_LINE = "Three tickets. Strain is shared across all of them. Pick your order.";

/** The two window widths the frame steps between. 460 was the spec's idle
 * number and wrapped every subject line to three lines, which cost more
 * desk than the width saved; 560 lands every subject on two. */
export const INBOX_W_LIST = 560;
export const INBOX_W_CARD = 940;
/** kp-fw border (3px a side) plus kp-fw-body padding (18px a side). */
const FRAME_CHROME = 42;

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

/** Typewriter scoped per element, so interacting with one field does not
 * restart the others (law 7's load choreography). */
function Typed({
  text,
  delay = 0,
  interval = 8,
  className,
}: {
  text: string;
  delay?: number;
  interval?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (reduced) return;
    setN(0);
    setStarted(false);
    const start = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(start);
  }, [text, delay, reduced]);
  useEffect(() => {
    if (!started || reduced) return;
    if (n >= text.length) return;
    const iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), interval);
    return () => clearInterval(iv);
  }, [started, reduced, n >= text.length, text, interval]);
  return <span className={className}>{reduced ? text : text.slice(0, n)}</span>;
}

/** Count-up on a LOAD SWEEP only. Ambient chrome that re-counts from zero
 * on every open and close is motion spent on nothing (law 7). */
function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      setN(value);
      return;
    }
    setN(0);
    const step = Math.max(1, Math.round(value / 22));
    const start = setTimeout(() => {
      let v = 0;
      const iv = setInterval(() => {
        v = Math.min(value, v + step);
        setN(v);
        if (v >= value) clearInterval(iv);
      }, 26);
    }, delay);
    return () => clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);
  return <>{n}</>;
}

function TierPips({ tier }: { tier: number }) {
  return (
    <span className="kp-pip-row" aria-label={`Threat tier ${tier} of 5`}>
      {Array.from({ length: 5 }).map((_, t) => (
        <i key={t} className={t < tier ? "kp-pip-diamond kp-pip-on" : "kp-pip-diamond"} />
      ))}
    </span>
  );
}

/** A print cell. 1:1, never downscaled: the PNG is cut at exactly 160x160
 * by the colourise pass, so the cell needs no CSS scaling at all. A roster
 * gap renders a plate of the identical footprint, so the row never
 * reflows on art coverage. */
function PrintCell({ src, tag }: { src: string | null; tag: string }) {
  if (!src) {
    return (
      <div className="ib-cell ib-nofile">
        <b>
          NO {tag}
          <br />
          ON FILE
        </b>
      </div>
    );
  }
  return (
    <div className="ib-cell">
      <img src={src} alt="" width={160} height={160} />
      <span className="ib-celltag">{tag}</span>
    </div>
  );
}

/* ---------- Z3: the record pane ---------- */

function RecordPane({
  run,
  jobIndex,
  dispatch,
  onConfigureKit,
  onFile,
}: {
  run: RunState;
  jobIndex: number;
  dispatch: Dispatch;
  onConfigureKit: () => void;
  onFile: () => void;
}) {
  const job = run.jobs[jobIndex];
  const c = customerById(job.customerId);
  const day = DAY_CONFIGS[run.day];
  const label = MODE_LABEL[job.dominant];
  // the reveal burst arms once per record, never on a re-render
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), 20);
    // layered under the genie, and only when this ticket's intrusion is
    // already partway in: a plain early-run card gets the genie alone
    if (day.headStart > 0) sfx("ibWarnReveal", { bus: "ui" });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIndex]);

  return (
    <>
      <div className="ib-focal">
        <i className="ib-bracket" aria-hidden="true">
          <i />
        </i>
        <span className="ib-eyebrow">
          {`// CUSTOMER.REC // TICKET ${jobIndex + 1} OF ${run.jobs.length}`}
        </span>
        {/* THE FOCAL ELEMENT. --len caps the ramp by character count, so
            "ARM: SIPHON" cannot overflow the pane at any tile width. */}
        <span className="ib-dominant" style={{ ["--len" as string]: String(label.length) }}>
          {label}
        </span>
        <span className="ib-domlabel">DOMINANT ROUTINE</span>
        <div className="ib-tierrow">
          <span className="ib-tierlabel">THREAT TIER</span>
          <TapTip text={tip("threatTier")}>
            <TierPips tier={job.tier} />
          </TapTip>
          <span className="ib-tierval">T{job.tier} OF 5</span>
        </div>
        <p className="ib-tell">
          <Typed text={MODE_TELL[job.dominant]} delay={120} />
        </p>
      </div>

      <div className="ib-support">
        <div className="ib-ticks">
          <div className="ib-tick">
            <span>NAME</span>
            <em>{c.name.toUpperCase()}</em>
          </div>
          <div className="ib-tick">
            <span>DEVICE</span>
            <em>{c.device}</em>
          </div>
          <div className="ib-tick">
            <span>GRID</span>
            <em>
              {day.grid[0]}x{day.grid[1]}
            </em>
          </div>
          <div className="ib-tick">
            <span>INTRUSION RAM</span>
            <em>{day.oppRam} PER TURN</em>
          </div>
        </div>

        {day.headStart > 0 && (
          <div className={revealed ? "ib-warn reveal" : "ib-warn"}>
            <span>WARNING</span>
            <em>Intrusion already {day.headStart} nodes deep</em>
            <i className="ib-riskflash" aria-hidden="true" />
          </div>
        )}

        <div className="ib-bottom">
          <div className="ib-cells">
            <PrintCell src={recPortraitFor(c)} tag="SUBJECT" />
            <PrintCell src={recDeviceFor(c)} tag="DEVICE" />
          </div>
          <div className="ib-verdict">
            <Btn
              label="DIVE"
              variant="signal"
              onClick={() => {
                sfx("claimTick", { bus: "ui" });
                dispatch({ type: "startDuel" });
              }}
            />
            <Btn label="CONFIGURE KIT" variant="ghost" onClick={onConfigureKit} />
            <Btn label="BACK" variant="ghost" onClick={onFile} />
            <span className="ib-rate">
              <span>TICKET RATE</span>
              <em>{jobPay(job.tier)} CR</em>
            </span>
          </div>
        </div>
      </div>
      <Teach id="analyze-readout" />
    </>
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

  /* The open/close machine, one axis at a time. `paneFor` lags `open`: the
   * width axis steps first (a steps(4) transition on the frame), then the
   * record genies out of the clicked row's midpoint. The record is built
   * ONCE, at the moment the pane becomes visible; building it twice per
   * open is what made the choreography look like it played twice. */
  const [paneFor, setPaneFor] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "hiding" | "shrink">("idle");
  const paneRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const prevOpenRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const stage = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);
  const clearStages = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => () => onWide(false), [onWide]);
  useEffect(() => () => clearStages(), [clearStages]);

  // The content takes its FINAL width the moment the state flips, so the
  // frame's 200ms width animation simply clips over already-settled
  // content. Letting the container query see the in-between widths is what
  // broke the rows' vertical scale mid-flight.
  const wide = paneFor !== null || open !== null;
  const evaWidth = (wide ? INBOX_W_CARD : INBOX_W_LIST) - FRAME_CHROME;

  useEffect(() => {
    const prev = prevOpenRef.current;
    if (prev === open) return;
    prevOpenRef.current = open;
    clearStages();
    busyRef.current = true;

    if (reduced) {
      setPhase("idle");
      setPaneFor(open);
      onWide(open !== null);
      busyRef.current = false;
      return;
    }

    if (open === null) {
      /* FILE AWAY: the card shrinks into its row, then the frame narrows */
      sfx("inboxFile", { bus: "ui" });
      setPhase("shrink");
      stage(() => {
        setPhase("idle");
        setPaneFor(null);
        onWide(false);
        busyRef.current = false;
      }, 190);
      return;
    }

    if (prev === null) {
      /* OPEN FROM LIST: the width axis steps first, the pane stays hidden
       * so the outgoing state never shows through */
      sfx("inboxGrow", { bus: "ui" });
      setPhase("hiding");
      onWide(true);
      stage(() => sfx("inboxWide", { bus: "ui" }), 200);
      stage(() => {
        setPaneFor(open);
        setPhase("idle");
        busyRef.current = false;
      }, 210);
      return;
    }

    /* SWITCH: the open record shrinks away, the new one grows out of the
     * row that was just clicked. One movement, not two. */
    sfx("inboxFile", { bus: "ui" });
    setPhase("shrink");
    stage(() => {
      setPaneFor(open);
      setPhase("idle");
      busyRef.current = false;
    }, 190);
  }, [open, reduced, onWide, stage, clearStages]);

  /* the genie: the card grows from its list row's midpoint. offset math,
   * never getBoundingClientRect: transform-origin is unscaled local px and
   * both nodes share the same offsetParent. */
  useEffect(() => {
    if (paneFor === null || reduced || phase !== "idle") return;
    const wrap = paneRef.current;
    const item = listRef.current?.children[paneFor] as HTMLElement | undefined;
    if (!wrap) return;
    if (item) {
      const oy = item.offsetTop + item.offsetHeight / 2 - wrap.offsetTop;
      wrap.style.transformOrigin = `0px ${Math.round(oy)}px`;
    }
    wrap.classList.remove("grow");
    void wrap.offsetWidth;
    sfx("inboxGenie", { bus: "ui" });
    wrap.classList.add("grow");
    const t = setTimeout(() => wrap.classList.remove("grow"), 220);
    return () => clearTimeout(t);
  }, [paneFor, reduced, phase]);

  /* UP/DOWN ticket selection while the inbox is the live surface */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const n = run.jobs.length;
      if (n === 0) return;
      e.preventDefault();
      let next =
        open === null
          ? e.key === "ArrowDown"
            ? 0
            : n - 1
          : e.key === "ArrowDown"
            ? (open + 1) % n
            : (open - 1 + n) % n;
      let guard = 0;
      while (run.jobsDone[next] && guard < n) {
        next = (next + 1) % n;
        guard += 1;
      }
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
    if (busyRef.current) return;
    sfx("press", { bus: "ui" });
    if (run.screen === "analyze" && run.activeJob === i) {
      setFiled((f) => !f);
      return;
    }
    if (run.screen === "analyze") dispatch({ type: "backToDay" });
    dispatch({ type: "pickJob", index: i });
  };

  const paneJob = paneFor !== null && run.jobs[paneFor] ? paneFor : null;
  const state = paneJob !== null || open !== null ? "card" : "list";
  const day = Math.min(run.day, FINAL_DAY);
  const quoteJob = paneJob !== null ? run.jobs[paneJob] : null;
  const quoteCustomer = quoteJob ? customerById(quoteJob.customerId) : null;

  return (
    <div className="ib-eva" style={{ width: evaWidth }}>
      <div className="ib-grid" data-state={state}>
        {/* Z1 MASTHEAD */}
        <div className="ib-mast">
          <div className="ib-mast-l">
            <span className="ib-eyebrow">
              {state === "list" ? "INBOX.SYS // DAY LOOP" : "INBOX.SYS // RECORD PULLED"}
            </span>
            <div className="ib-dayline">
              <span className="ib-dayunit">DAY</span>
              <span className="ib-daywrap">
                <span className="ib-day">{day}</span>
              </span>
              <span className="ib-dayunit">OF {FINAL_DAY}</span>
              <span className="ib-line">{DAY_LINE}</span>
            </div>
          </div>
        </div>

        {/* Z2 THE TICKET LIST */}
        <aside className="ib-tickets">
          <div className="ib-div">
            <span>{"// INBOX"}</span>
            <i />
          </div>
          <div className="ib-list" ref={listRef}>
            {allDone && <div className="ib-item ib-alldone">ALL TICKETS FILED</div>}
            {!allDone &&
              run.jobs.map((job, i) => {
                const c = customerById(job.customerId);
                const done = run.jobsDone[i];
                return (
                  <button
                    key={i}
                    type="button"
                    className={paneJob === i && !done ? "ib-item sel" : "ib-item"}
                    disabled={done}
                    onClick={() => toggle(i)}
                  >
                    <span className="ib-subj">{subjectFor(c)}</span>
                    <span className="ib-meta">
                      <span className="ib-tierlabel">TIER</span>
                      <TapTip text={tip("threatTier")}>
                        <TierPips tier={job.tier} />
                      </TapTip>
                      {done ? (
                        <span className="ib-cleared">CLEARED</span>
                      ) : (
                        <span className="ib-pay">{jobPay(job.tier)} CR</span>
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
          {quoteCustomer && quoteJob && (
            <div className="ib-quote">
              <b>INTAKE</b>
              <Typed text={`"${quoteCustomer.quotes[quoteJob.quoteIndex]}"`} delay={220} />
            </div>
          )}
        </aside>

        {/* Z3 THE RECORD PANE */}
        <section
          className={phase === "shrink" ? "ib-pane shrink" : "ib-pane"}
          ref={paneRef}
          style={phase === "hiding" ? { opacity: 0 } : undefined}
        >
          {paneJob !== null && (
            <RecordPane
              key={paneJob}
              run={run}
              jobIndex={paneJob}
              dispatch={dispatch}
              onConfigureKit={onConfigureKit}
              onFile={() => dispatch({ type: "backToDay" })}
            />
          )}
        </section>

        {/* Z5 FOOTLINE: the run's ambient state */}
        <div className="ib-foot">
          <TapTip text={tip("strain")}>
            <span className="kp-chip-pct">
              <span>STRAIN</span>
              <em>
                <CountUp value={run.strain} delay={650} />
              </em>
            </span>
          </TapTip>
          <span className="kp-chip-pct">
            <span>CR</span>
            <em>
              <CountUp value={run.credits} delay={690} />
            </em>
          </span>
          <TapTip text={tip("ram")}>
            <Chip label="RAM" value={`${run.ramPerTurn}/TURN`} />
          </TapTip>
          <Chip
            label="KIT"
            value={`S${run.kit.scanTier}/A${run.kit.attackTier}/D${run.kit.defendTier}`}
          />
          {run.patchPouch.length > 0 && (
            <span className="ib-pouch">
              <span>POUCH</span>
              {run.patchPouch.map((m, i) => (
                <PatchGlyph key={i} mask={m} size={13} />
              ))}
            </span>
          )}
          <span className="ib-hint">UP, DOWN: SELECT | CLICK AGAIN: FILE AWAY</span>
        </div>
      </div>
    </div>
  );
}
