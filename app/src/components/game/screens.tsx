import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sfx } from "../../game/audio";
import { CUSTOMERS, CustomerProfile } from "../../game/content/customers";
import { Scene, StoryBeat } from "../../game/content/story";

/**
 * The story scene player. Scenes play in the room now (the shell floats
 * this panel over the scene layer), so the player is a self-contained
 * instrument panel with no window of its own.
 */

export function customerById(id: string): CustomerProfile {
  return CUSTOMERS.find((c) => c.id === id) ?? CUSTOMERS[0];
}

/* ------------------------------------------------------------------ */
/* Story scene player                                                  */
/* ------------------------------------------------------------------ */

const SPEAKER_NAME: Record<string, string> = {
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
            <span className="ml-eyebrow">{tag ? "MORNING.LOG // DAY START" : "THE SHOP // LOG"}</span>
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
                <span>FEED</span>
                <em>SHOP CAM</em>
              </div>
              <div className="ml-tick">
                <span>ON THE BOOK</span>
                <em>NO LAST DAY</em>
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
