import { useEffect, useState } from "react";
import { sfx } from "../../game/audio";
import { CUSTOMERS, CustomerProfile } from "../../game/content/customers";
import { Scene } from "../../game/content/story";
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
  const b = scene.beats[beat];
  if (!b) return null;
  const last = beat >= scene.beats.length - 1;
  const advance = () => {
    sfx("story", { bus: "ui", jitter: 0.05 });
    if (last) onDone();
    else setBeat(beat + 1);
  };
  return (
    <div className="kp-story" onClick={advance}>
      {tag && (
        <span className="kp-story-daytag" aria-hidden="true">
          <Chip label={tag.split(" ")[0]} value={tag.split(" ").slice(1).join(" ")} />
        </span>
      )}
      {b.still && (
        <div className="kp-story-still">
          <PhotoCell src={b.still} w={576} h={384} />
        </div>
      )}
      <div className={`kp-story-beat kp-story-${b.speaker}`} key={beat}>
        {b.portrait && <PhotoCell src={b.portrait} w={96} h={96} className="kp-story-portrait-cell" />}
        <div className="kp-story-text">
          <span className="kp-story-name">{b.name ?? SPEAKER_NAME[b.speaker]}</span>
          {b.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          <span className="kp-story-nextglyph" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
      <button type="button" className="kp-btn2 kp-btn2-ghost kp-story-next" onClick={advance}>
        {last ? "CONTINUE" : "NEXT"}
      </button>
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
