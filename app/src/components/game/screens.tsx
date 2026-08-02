import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sfx } from "../../game/audio";
import { CUSTOMERS, CustomerProfile } from "../../game/content/customers";
import { Scene, StoryBeat } from "../../game/content/story";
import { RunAction } from "../../game/run-reducer";
import { MetaState } from "../../game/save";
import { VERSION_LABEL } from "../../game/version";
import { Btn, Chip, Hero, PhotoCell, Ticks } from "../os/kp-ui";

/**
 * Flow-window surfaces that are not full windows of their own: the story
 * scene player (MORNING.LOG and friends), the idle desk (no run), and the
 * finale gate (BACKROOM.LCK).
 */

export function customerById(id: string): CustomerProfile {
  return CUSTOMERS.find((c) => c.id === id) ?? CUSTOMERS[0];
}

type Dispatch = (a: RunAction) => void;

/* ------------------------------------------------------------------ */
/* Story scene player                                                  */
/* ------------------------------------------------------------------ */

const SPEAKER_NAME: Record<string, string> = {
  sister: "RHEA",
  father: "DAD",
  system: "SYSTEM",
  companion: "???",
};

/**
 * The day-start / story scene as a KP/OS v3 instrument panel
 * (ui-demos/morning-log, cycle ux-2026-07-31-morning-log).
 *
 * A surface made of PROSE still gets one focal element: the DAY numeral, at
 * 3.6x to 4.3x the body cap. Everything else here is annotation around it.
 *
 * The body row is a FLAT FIXED HEIGHT, which is the whole point of the
 * panel: every beat shape renders the identical row, so clicking through a
 * scene never moves the window. The shipped surface reflowed by 384px on a
 * still beat. The imagery is a FIXTURE of the panel rather than a property
 * of the beat, and that is diegetic rather than a layout trick: the shop
 * has two mounted cameras and the OS shows one of them.
 *
 * It behaves like a LOG, because that is what it is called: beats already
 * read stay on screen, dimmed, above the beat being read now. The fixed row
 * is no longer mostly empty on a two-line beat, and the player can re-read
 * what Rhea just said, which the one-beat-at-a-time player made impossible.
 */

const CAM_TAG: Record<string, string> = {
  counter: "CAM 1 // COUNTER",
  backroom: "CAM 2 // BACK ROOM",
  standby: "STANDBY",
};
const CAM_SRC: Record<string, string> = {
  counter: "/assets/px/window/v3/morning-cam-counter-color.png",
  backroom: "/assets/px/window/v3/morning-cam-backroom-color.png",
};

/** The camera fill is derived from the BEAT DATA, never from the speaker: a
 * beat carrying a still shows CAM 2 (the thing being talked about), a beat
 * carrying a portrait shows CAM 1, and a bare system beat has no camera
 * framed at all. */
function fillFor(b: StoryBeat): "standby" | "counter" | "backroom" {
  if (b.still) return "backroom";
  if (b.portrait || b.speaker !== "system") return "counter";
  return "standby";
}

export function StoryScene({
  scene,
  onDone,
  tag,
}: {
  scene: Scene;
  onDone: () => void;
  /** Persistent corner chrome, e.g. "DAY 4" on morning scenes. */
  tag?: string;
}) {
  const [beat, setBeat] = useState(0);
  useEffect(() => setBeat(0), [scene.id]);
  const linesRef = useRef<HTMLDivElement | null>(null);
  const b = scene.beats[beat];

  // no internal scrollbar, ever: when the log outgrows its box, whole
  // entries drop off the top the way a terminal does
  const [dropped, setDropped] = useState(0);
  useEffect(() => setDropped(0), [scene.id]);
  useLayoutEffect(() => {
    const el = linesRef.current;
    if (!el) return;
    let guard = 0;
    while (el.scrollHeight > el.clientHeight + 1 && dropped + guard < beat && guard < 8) {
      guard += 1;
      setDropped((d) => d + 1);
      break;
    }
  }, [beat, dropped, scene.id]);

  if (!b) return null;
  const last = beat >= scene.beats.length - 1;
  const fill = fillFor(b);
  const advance = () => {
    sfx("story", { bus: "ui", jitter: 0.05 });
    // the cut is textural, layered under `story` on the same click, and only
    // when the camera actually changes
    const nextBeat = scene.beats[beat + 1];
    if (!last && nextBeat && fillFor(nextBeat) !== fill) sfx("camSwitch", { bus: "ui" });
    if (last) onDone();
    else setBeat(beat + 1);
  };

  const dayNum = tag ? tag.split(" ").slice(1).join(" ").padStart(2, "0") : "";
  const unit = tag ? tag.split(" ")[0] : "";
  const shown = scene.beats.slice(dropped, beat + 1);

  return (
    <div className="ml-eva" onClick={advance}>
      <div className="ml-grid ml-card">
        {/* ROW 1: the masthead. Persistent across every beat, and it sits
            OUTSIDE the per-beat remount boundary on purpose: this is one of
            the highest-frequency surfaces in the game, and chrome that
            re-animates on every click reads as a glitch. */}
        <div className="ml-mast">
          <div className="ml-mast-l">
            <span className="ml-eyebrow">{tag ? "MORNING.LOG // DAY START" : "SHOPFRONT // LOG"}</span>
            {tag && (
              <div className="ml-numwrap">
                <span className="ml-unit">{unit}</span>
                <span className="ml-num">{dayNum}</span>
                {/* the heavy corner brackets, scoped to the FOCAL element */}
                <i className="ml-bracket" aria-hidden="true">
                  <i />
                </i>
              </div>
            )}
          </div>
          <div className="ml-mast-r">
            <span className="kp-chip-pct ml-regchip">
              <span>REGISTER</span>
              <em>OPEN</em>
              <i className="ml-riskflash" aria-hidden="true" />
            </span>
            {/* beat position. Unboxed and tiny, by design rather than after
                hitting the ceiling. */}
            <span className="ml-beatdots" aria-hidden="true">
              {scene.beats.map((_, i) => (
                <i key={i} className={i === beat ? "on" : i < beat ? "done" : undefined} />
              ))}
            </span>
          </div>
        </div>

        {/* ROW 2: the body. FIXED HEIGHT, never reflows between beats. */}
        <div className="ml-body">
          <div className="ml-stagecol">
            <div className="ml-stage" data-fill={fill} data-feed="color">
              <div className="ml-plate" key={fill}>
                {fill !== "standby" && (
                  /* 288x216 at 1:1, never resized: to show less, crop */
                  <img src={CAM_SRC[fill]} alt="" width={288} height={216} />
                )}
                <i className="tint" aria-hidden="true" />
                <i className="ml-nosig" aria-hidden="true" />
              </div>
              {/* a record light is red on every camera ever built, and it
                  does NOT blink: on this surface the alarm and the
                  typewriter are the only two things allowed to move */}
              <span className="ml-rec">
                <i />
                REC
              </span>
              <span className="ml-camtag">{CAM_TAG[fill]}</span>
            </div>
            <div className="ml-ticks">
              <div className="ml-tick">
                <span>SPIKE</span>
                <em>3 TICKETS</em>
              </div>
              <div className="ml-tick">
                <span>ON THE BOOK</span>
                <em>{tag ? `${11 - Number(dayNum || 1)} DAYS` : "10 DAYS"}</em>
              </div>
            </div>
          </div>

          <div className="ml-text">
            {/* bottom-anchored via an auto margin on the FIRST entry, not
                justify-content: flex-end. That distinction is load bearing:
                flex-end overflows in the block-START direction, which
                scrollHeight cannot report, so the "does it fit" test
                silently passed while entries were clipped off the top. */}
            <div className="ml-lines" ref={linesRef}>
              {shown.map((sb, i) => {
                const idx = dropped + i;
                const past = idx < beat;
                const name = sb.name ?? SPEAKER_NAME[sb.speaker];
                return (
                  <div key={idx} className={past ? "ml-entry is-past" : "ml-entry"}>
                    <span className={past ? "ml-past-name" : "ml-name"}>{name}</span>
                    {sb.lines.map((l, j) => (
                      <p key={j} className="ml-line">
                        {l}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="ml-foot">
              <span className="ml-hint">CLICK ANYWHERE</span>
              <button type="button" className="ml-next is-ready" onClick={advance}>
                {last ? "CONTINUE" : "NEXT"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Finale gate: BACKROOM.LCK                                           */
/* ------------------------------------------------------------------ */

export function FinalePre({
  dispatch,
  onConfigureKit,
}: {
  dispatch: Dispatch;
  onConfigureKit: () => void;
}) {
  return (
    <div className="kp-finalepre kp-frame-ticks kp-frame-ticks-heavy">
      <Ticks />
      <i className="kp-tick3" aria-hidden="true" />
      <div className="kp-hero-day">
        <b>DAY</b>
        <Hero text="10" />
      </div>
      <div className="kp-screen-actions">
        <Btn label="CONFIGURE KIT" variant="ghost" onClick={onConfigureKit} />
        <Btn
          label="OPEN THE BACK ROOM"
          variant="danger"
          onClick={() => {
            sfx("claimTick", { bus: "ui" });
            dispatch({ type: "startFinale" });
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop idle (no active run)                                        */
/* ------------------------------------------------------------------ */

export function DesktopIdle({
  meta,
  dispatch,
}: {
  meta: MetaState;
  dispatch: Dispatch;
}) {
  const startSeed = () => {
    dispatch({ type: "startRun", seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 });
  };
  return (
    <div className="kp-idle">
      <div className="kp-idle-art" aria-hidden="true">
        <PhotoCell
          src={meta.machineOpened ? "/assets/px/stills/still-open.png" : "/assets/px/stills/still-locked.png"}
          w={576}
          h={384}
        />
      </div>
      <h2>KERNEL PANIC</h2>
      <p className="kp-idle-version">{VERSION_LABEL}</p>
      {meta.machineOpened ? (
        <p className="kp-idle-sub">
          The back room is open now. The shop still takes tickets, if you want the practice.
        </p>
      ) : meta.runCount === 0 ? (
        <p className="kp-idle-sub">Your father's shop. Your name on the ledger. His lock on the back room.</p>
      ) : (
        <p className="kp-idle-sub">
          Attempt {meta.runCount} ended. The machine is still there. It is always still there.
        </p>
      )}
      <div className="kp-idle-stats">
        <Chip label="ATTEMPTS" value={String(meta.runCount)} />
        <Chip label="BACK ROOM" value={meta.machineOpened ? "OPEN" : "SEALED"} />
      </div>
      <Btn
        label={meta.runCount === 0 ? "OPEN THE SHOP" : `START ATTEMPT ${meta.runCount + 1}`}
        variant="signal"
        onClick={startSeed}
      />
    </div>
  );
}
