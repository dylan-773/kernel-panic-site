import { useEffect, useMemo, useState } from "react";
import { sfx } from "../../../game/audio";
import { FINAL_DAY } from "../../../game/content/arc";
import {
  ATTACK_MODE_LABEL,
  ATTACK_WIDTH,
  AUGMENT_BY_ID,
  AttackMode,
  DEFEND_MODE_LABEL,
  DEFEND_WIDTH,
  DefendMode,
  SCAN_RANGE,
  attackModeDesc,
  defendModeDesc,
  scanDesc,
} from "../../../game/content/kit";
import { PATCH_POUCH_MAX, shapeClassOf } from "../../../game/patch-cells";
import type { GameState, RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { tip } from "../../../game/content/teaching";
import { Teach } from "../../game/teach";
import { TapTip } from "../../game/tap-tip";
import { PatchGlyph } from "../../game/patch-glyph";
import { Btn, Chip, PipRow, Ruler } from "../kp-ui";

/**
 * LOADOUT.CFG: the dive-kit dashboard. Left column is the operator's rig
 * as 1-bit dithered photo cells (the service-manual plate and the live
 * BENCH FEED), right column is the three programs as boxed stat rows with
 * tick-textured tier meters and mode chips, boost bays, and the read-only
 * patch pouch (the bench's signpost: it opens SOLDER.BAY). Bottom is the
 * NEURAL STRAIN counter strip. On open everything loads concurrently.
 */

type Dispatch = (a: RunAction) => void;

const SHAPE_NOUN: Record<"I" | "L" | "T" | "X", string> = {
  I: "Straight",
  L: "Elbow",
  T: "Tee",
  X: "Cross",
};

const ATTACK_MODES_ALL: AttackMode[] = ["redirect", "armHalt", "armSiphon"];
const DEFEND_MODES_ALL: DefendMode[] = ["purge", "lock", "ward"];

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

/** Count-up number that climbs to `target` after `delay` ms. */
function CountUp({ target, delay = 0, interval = 26 }: { target: number; delay?: number; interval?: number }) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reduced) {
      setV(target);
      return;
    }
    setV(0);
    const step = Math.max(1, Math.round(target / 26));
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      iv = setInterval(() => {
        setV((cur) => {
          const next = Math.min(target, cur + step);
          if (next >= target && iv) clearInterval(iv);
          return next;
        });
      }, interval);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, [target, delay, interval, reduced]);
  return <>{v}</>;
}

/** Program desc line that re-types when the text changes (scoped per program). */
function TypedDesc({ text, delay = 0 }: { text: string; delay?: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return;
    setN(0);
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), 6);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, [text, delay, reduced]);
  const shown = reduced ? text : text.slice(0, n);
  const typing = !reduced && n < text.length;
  return (
    <p className="kp-prog-desc">
      {shown}
      {typing && <span className="kp-boot-cursor">_</span>}
    </p>
  );
}

function TierMeter({ tier, sweepBase }: { tier: number; sweepBase: number }) {
  const reduced = useReducedMotion();
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (reduced) {
      setLit(tier);
      return;
    }
    setLit(0);
    const timers = Array.from({ length: tier }, (_, s) =>
      setTimeout(() => setLit((v) => Math.max(v, s + 1)), sweepBase + s * 120),
    );
    return () => timers.forEach(clearTimeout);
  }, [tier, sweepBase, reduced]);
  return (
    <span className="kp-tseg">
      {Array.from({ length: 3 }).map((_, s) => (
        <i key={s} className={s < lit ? "on" : undefined} />
      ))}
    </span>
  );
}

function ProgRow({
  name,
  tier,
  valLabel,
  valTarget,
  sweepBase,
  modes,
  desc,
  descDelay,
}: {
  name: string;
  tier: number;
  valLabel: string;
  valTarget: number;
  sweepBase: number;
  modes?: {
    all: string[];
    owned: string[];
    labels: Record<string, string>;
    active: string;
    set: (m: string) => void;
    tipFor: (m: string, owned: boolean) => string | undefined;
  };
  desc: string;
  descDelay: number;
}) {
  return (
    <div className="kp-prog">
      <header>
        <strong>{name}</strong>
        <span className="kp-prog-val">
          {valLabel} <em><CountUp target={valTarget} delay={sweepBase + 60} interval={60} /></em>
        </span>
      </header>
      <div className="kp-prog-meter">
        <span className="tlabel">TIER</span>
        <TierMeter tier={tier} sweepBase={sweepBase} />
        <span className="tval">T{tier}</span>
      </div>
      {modes && (
        <div className="kp-prog-modes">
          {modes.all.map((m) => {
            const owned = modes.owned.includes(m);
            const active = modes.active === m;
            return (
              <TapTip key={m} text={modes.tipFor(m, owned)}>
                <button
                  type="button"
                  className={active ? "kp-mode2 mode-on" : "kp-mode2"}
                  disabled={!owned}
                  onClick={() => {
                    sfx("tick", { bus: "ui" });
                    modes.set(m);
                  }}
                >
                  {modes.labels[m]}
                  {!owned && " ?"}
                </button>
              </TapTip>
            );
          })}
        </div>
      )}
      <TypedDesc text={desc} delay={descDelay} />
    </div>
  );
}

/** The live BENCH FEED clock (the same shop clock as the desk widget). */
function FeedClock({ day }: { day: number }) {
  const [tsec, setTsec] = useState(22 * 3600 + 41 * 60 + 7);
  useEffect(() => {
    const t = setInterval(() => setTsec((s) => (s + 1) % 86400), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(Math.floor(tsec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((tsec % 3600) / 60)).padStart(2, "0");
  const ss = String(tsec % 60).padStart(2, "0");
  return (
    <span className="kp-feed-clock">
      DAY 0{day} {hh}:{mm}:{ss}
    </span>
  );
}

export function LoadoutContent({
  state,
  dispatch,
  onOpenSolder,
  slot,
}: {
  state: GameState;
  dispatch: Dispatch;
  onOpenSolder: () => void;
  slot: number;
}) {
  const run = state.run as RunState;
  const meta = state.meta;
  const kit = run.kit;
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [photosOn, setPhotosOn] = useState(reduced);

  useEffect(() => {
    const a = setTimeout(() => setPhotosOn(true), 120);
    const b = setTimeout(() => {
      setReady(true);
      sfx("loadoutReady", { bus: "ui" });
    }, 1800);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const strain = run.strain;
  const strainSegs = useMemo(() => Math.round((30 * strain) / 100), [strain]);
  const [litStrain, setLitStrain] = useState(0);
  useEffect(() => {
    if (reduced) {
      setLitStrain(strainSegs);
      return;
    }
    setLitStrain(0);
    const timers = Array.from({ length: strainSegs }, (_, i) =>
      setTimeout(() => setLitStrain((v) => Math.max(v, i + 1)), 900 + i * 34),
    );
    return () => timers.forEach(clearTimeout);
  }, [strainSegs, reduced]);

  return (
    <div className="kp-loadout">
      <div className="kp-load-head">
        <div className="kp-load-head-main">
          <span className="kp-load-head-label">DIVE KIT</span>
          <div className="kp-load-status">
            {ready ? "DIVE KIT READY." : "DIVE KIT IS LOADING..."}
            {!ready && <span className="kp-boot-cursor">_</span>}
          </div>
        </div>
        <div className="kp-load-chips">
          <Chip label="RUN" value={String(run.runNumber).padStart(2, "0")} />
          <Chip label="DAY" value={String(Math.min(run.day, FINAL_DAY)).padStart(2, "0")} />
          <Chip label="CREDITS" value={String(run.credits)} />
        </div>
      </div>

      <div className="kp-load-grid">
        <div className="kp-load-left">
          <div className={photosOn ? "kp-photo on" : "kp-photo"}>
            <span className="kp-photo-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <img src="/assets/px/window/loadout-plate.png" alt="" width={304} height={407} />
            <i className="tint" aria-hidden="true" />
            <i className="sweep" aria-hidden="true" />
            <span className="kp-photo-tag">FIG. 01 // BENCH RIG</span>
          </div>
          <div className={photosOn ? "kp-photo kp-photo-feed on" : "kp-photo kp-photo-feed"} style={{ animationDelay: "260ms" }}>
            <img src="/assets/px/window/loadout-feed.png" alt="" width={304} height={227} />
            <i className="tint" aria-hidden="true" />
            <i className="sweep" aria-hidden="true" />
            <i className="kp-feed-roll" aria-hidden="true" />
            <span className="kp-feed-rec">
              <i />
              REC
            </span>
            <FeedClock day={Math.min(run.day, FINAL_DAY)} />
            <span className="kp-photo-tag">BENCH FEED</span>
          </div>
          <div className="kp-datarow-list kp-op-rows">
            <div className="kp-datarow kp-datarow-plain">
              <span>DIVES CLEARED</span>
              <em>
                <CountUp target={meta.stats.divesCleared} delay={500} />
              </em>
            </div>
            <div className="kp-datarow kp-datarow-plain">
              <span>DIVES LOST</span>
              <em>
                <CountUp target={meta.stats.divesLost} delay={620} />
              </em>
            </div>
            <div className="kp-datarow kp-datarow-plain">
              <span>RAM PER TURN</span>
              <em>
                <CountUp target={run.ramPerTurn} delay={740} />
              </em>
            </div>
          </div>
        </div>

        <div className="kp-load-right">
          <ProgRow
            name="SCAN.EXE"
            tier={kit.scanTier}
            valLabel="RANGE"
            valTarget={Math.min(SCAN_RANGE[kit.scanTier], 99)}
            sweepBase={260}
            desc={scanDesc(kit.scanTier)}
            descDelay={480}
          />
          <ProgRow
            name="ATTACK.EXE"
            tier={kit.attackTier}
            valLabel="WIDTH"
            valTarget={ATTACK_WIDTH[kit.attackTier]}
            sweepBase={460}
            modes={{
              all: ATTACK_MODES_ALL,
              owned: kit.attackModes,
              labels: ATTACK_MODE_LABEL,
              active: kit.attackMode,
              set: (m) => dispatch({ type: "setAttackMode", mode: m as AttackMode }),
              tipFor: (m, owned) => (owned ? attackModeDesc(m as AttackMode, kit.attackTier) : tip("modeLocked")),
            }}
            desc={attackModeDesc(kit.attackMode, kit.attackTier)}
            descDelay={640}
          />
          <ProgRow
            name="DEFEND.EXE"
            tier={kit.defendTier}
            valLabel="WIDTH"
            valTarget={DEFEND_WIDTH[kit.defendTier]}
            sweepBase={660}
            modes={{
              all: DEFEND_MODES_ALL,
              owned: kit.defendModes,
              labels: DEFEND_MODE_LABEL,
              active: kit.defendMode,
              set: (m) => dispatch({ type: "setDefendMode", mode: m as DefendMode }),
              tipFor: (m, owned) => (owned ? defendModeDesc(m as DefendMode, kit.defendTier) : tip("modeLocked")),
            }}
            desc={defendModeDesc(kit.defendMode, kit.defendTier)}
            descDelay={800}
          />

          <div className="kp-sect-head">
            <TapTip text={tip("boostSlots")}>
              <strong>BOOST BAYS</strong>
            </TapTip>
            <PipRow filled={kit.augments.length} total={run.boostSlots} size="sm" />
            <em>
              {kit.augments.length} / {run.boostSlots}
            </em>
          </div>
          <div className="kp-bays">
            {Array.from({ length: 5 }).map((_, i) => {
              const aug = i < kit.augments.length ? AUGMENT_BY_ID[kit.augments[i]] : null;
              const future = i >= run.boostSlots;
              const cls = aug ? "kp-bay" : future ? "kp-bay kp-bay-empty kp-bay-future" : "kp-bay kp-bay-empty";
              return (
                <div
                  key={i}
                  className={reduced ? cls : `${cls} kp-slot-anim`}
                  style={reduced ? undefined : { animationDelay: `${760 + i * 90}ms` }}
                >
                  <strong>{aug ? aug.name : "EMPTY BAY"}</strong>
                  {aug && <span>{aug.desc}</span>}
                </div>
              );
            })}
          </div>

          <div className="kp-sect-head">
            <strong>PATCH POUCH</strong>
            <em>
              {run.patchPouch.length} / {PATCH_POUCH_MAX}
            </em>
          </div>
          <button type="button" className="kp-pouch-panel" onClick={onOpenSolder} title="Open SOLDER.BAY">
            <div className="kp-pouch-rack">
              {run.patchPouch.map((m, i) => (
                <span
                  key={i}
                  className={reduced ? undefined : "kp-slot-anim"}
                  style={reduced ? undefined : { animationDelay: `${1120 + i * 80}ms` }}
                >
                  <PatchGlyph mask={m} size={34} />
                  <span>{SHAPE_NOUN[shapeClassOf(m)]}</span>
                </span>
              ))}
              {Array.from({ length: PATCH_POUCH_MAX - run.patchPouch.length }).map((_, i) => (
                <span key={`h${i}`} aria-hidden="true">
                  <span className="kp-piece-hole" />
                </span>
              ))}
            </div>
            <p className="kp-pouch-foot">
              A piece fills one slag block with exactly the arms it shows, welded where it lands. 2
              RAM, one per turn, single use. Pieces come off the darknet, drop from cleared jobs, or
              bank on clean wins; the pouch holds {PATCH_POUCH_MAX}. CRAFT AT THE BENCH: SOLDER.BAY.
            </p>
          </button>
        </div>
      </div>

      <Ruler left={`USER 0${slot}`} right={`RUN ${run.runNumber}`} />

      <div className="kp-strainstrip">
        <span className="kp-strainstrip-label">NEURAL STRAIN</span>
        <span className="kp-strainstrip-num">
          <CountUp target={strain} delay={900} interval={30} />
        </span>
        <span className="kp-strainstrip-bar">
          {Array.from({ length: 30 }).map((_, i) => (
            <i key={i} className={i < litStrain ? "on" : undefined} />
          ))}
        </span>
        <span className="kp-strainstrip-note">SEVERS AT ZERO.</span>
      </div>

      <div className="kp-footline">{">> TUNE IT WHENEVER. IT HOLDS UNTIL YOU CHANGE IT."}</div>

      {run.screen === "analyze" && (
        <div className="kp-screen-actions">
          <Btn
            label="DIVE"
            variant="signal"
            onClick={() => {
              sfx("claimTick", { bus: "ui" });
              dispatch({ type: "startDuel" });
            }}
          />
        </div>
      )}
      {run.screen === "finalePre" && (
        <div className="kp-screen-actions">
          <Btn
            label="DIVE INTO THE MACHINE"
            variant="signal"
            onClick={() => {
              sfx("claimTick", { bus: "ui" });
              dispatch({ type: "startFinale" });
            }}
          />
        </div>
      )}
    </div>
  );
}
