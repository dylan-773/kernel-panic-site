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
import { TapTip } from "../../game/tap-tip";
import { PatchGlyph } from "../../game/patch-glyph";
import { Btn } from "../kp-ui";

/**
 * LOADOUT.CFG as a KP/OS v3 instrument panel. This is the system's
 * REFERENCE IMPLEMENTATION (ui-demos/loadout-eva, cycle
 * ux-2026-07-31-loadout-eva, five review rounds); ../RULINGS.md was
 * written from it, so anything here that looks like a house rule IS the
 * house rule.
 *
 * GLANCE ORDER: 1st the trinity's three hero numerals (RANGE, WIDTH,
 * WIDTH) at ~116px against 19px body; 2nd the READY slab; 3rd NEURAL
 * STRAIN. The operator rig, the ticks and the footline are deliberately
 * ambient and are demoted rather than merely moved.
 *
 * Colour carries state: amber structure, ivory data, GREEN nominal (READY,
 * and the live mode), RED risk (strain in the low band only, which also
 * floods inverse video and MOVES, so the signal is never colour alone),
 * cyan for the camera feed, which is a different signal class from bench
 * data. With no data-scheme every role collapses onto the single v2 accent.
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

/** Never truncate at a fixed character count. The budget sits above the
 * longest shipped description (redirect at tier 3, 122 chars) and only ever
 * cuts on a sentence boundary, so armHalt and armSiphon can never lose
 * their effect clause behind an ellipsis. The MORE affordance is reserved
 * for future content that exceeds it. */
const DESC_BUDGET = 150;
function clampDesc(text: string): { shown: string; rest: string } {
  if (text.length <= DESC_BUDGET) return { shown: text, rest: "" };
  const cut = text.lastIndexOf(". ", DESC_BUDGET);
  if (cut < 0) return { shown: text, rest: "" };
  return { shown: text.slice(0, cut + 1), rest: text.slice(cut + 2) };
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

/** Count-up number that climbs to `target` after `delay` ms. */
function CountUp({
  target,
  delay = 0,
  interval = 26,
  lock,
}: {
  target: number;
  delay?: number;
  interval?: number;
  /** Voice instrumentLock as this numeral settles (hero numerals only). */
  lock?: boolean;
}) {
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
          if (next >= target && iv) {
            clearInterval(iv);
            if (lock && cur < target) sfx("instrumentLock", { bus: "ui" });
          }
          return next;
        });
      }, interval);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, delay, interval, reduced]);
  return <>{v}</>;
}

/** Program desc line, typed and scoped PER PROGRAM: switching one mode must
 * not restart the other two panels' typewriters. */
function ProgDesc({ text, delay = 0 }: { text: string; delay?: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const { shown, rest } = clampDesc(text);
  useEffect(() => {
    setExpanded(false);
    if (reduced) return;
    setN(0);
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      iv = setInterval(() => setN((v) => Math.min(shown.length, v + 1)), 6);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, [text, shown.length, delay, reduced]);
  if (expanded) return <p className="lo-desc">{text}</p>;
  return (
    <p className="lo-desc">
      {reduced ? shown : shown.slice(0, n)}
      {rest && (
        <button
          type="button"
          className="lo-more"
          onClick={() => {
            sfx("tick", { bus: "ui" });
            setExpanded(true);
          }}
        >
          MORE
        </button>
      )}
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
    <span className="lo-tseg">
      {Array.from({ length: 3 }).map((_, s) => (
        <i key={s} className={s < lit ? "on" : undefined} />
      ))}
    </span>
  );
}

/** One instrument bay of the trinity: the focal zone of the surface. */
function ProgPanel({
  name,
  unit,
  tier,
  value,
  sweepBase,
  descDelay,
  desc,
  modes,
}: {
  name: string;
  unit: string;
  tier: number;
  value: number;
  sweepBase: number;
  descDelay: number;
  desc: string;
  modes?: {
    all: string[];
    owned: string[];
    labels: Record<string, string>;
    active: string;
    set: (m: string) => void;
    tipFor: (m: string, owned: boolean) => string | undefined;
  };
}) {
  return (
    <div className="lo-panel">
      <span className="lo-pname">{name}</span>
      <span className="lo-heroline">
        <span className="lo-num">
          <CountUp target={value} delay={sweepBase + 60} interval={60} lock />
        </span>
        <span className="lo-unit">{unit}</span>
      </span>
      <span className="lo-meter">
        <span className="lo-tlabel">TIER</span>
        <TierMeter tier={tier} sweepBase={sweepBase} />
        <span className="lo-tval">T{tier}</span>
      </span>
      {modes && (
        <div className="lo-modes">
          {modes.all.map((m) => {
            const owned = modes.owned.includes(m);
            const active = modes.active === m;
            return (
              <TapTip key={m} text={modes.tipFor(m, owned)}>
                <button
                  type="button"
                  className={active ? "lo-mode mode-on" : "lo-mode"}
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
      <ProgDesc text={desc} delay={descDelay} />
      {/* heavy corner brackets, scoped to the trinity only: applying them
          everywhere destroys the emphasis they exist to create */}
      <i className="lo-bracket" aria-hidden="true">
        <i />
      </i>
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
    <span className="lo-clock">
      DAY 0{day} {hh}:{mm}:{ss}
    </span>
  );
}

export function LoadoutContent({
  state,
  dispatch,
  onOpenSolder,
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
  const [feedOn, setFeedOn] = useState(reduced);

  useEffect(() => {
    const a = setTimeout(() => setFeedOn(true), 120);
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

  // The one readout whose COLOUR carries state: nominal above 70, watch
  // between, risk at or below 35. In the risk band it also floods inverse
  // video and blinks, because colour is never the only channel.
  const strainCls =
    strain > 70 ? "lo-sub lo-strain-ok" : strain <= 35 ? "lo-sub lo-strain-low" : "lo-sub";

  return (
    <div className="lo-eva">
      <div className="lo-grid">
        {/* Z1 MASTHEAD */}
        <div className="lo-mast">
          <div className="lo-mast-l">
            <span className="lo-eyebrow">LOADOUT.CFG // DIVE KIT</span>
            <div className="lo-slabwrap">
              <span className={ready ? "lo-slab kp-frame-ticks is-ready" : "lo-slab kp-frame-ticks"}>
                <i className="kp-tick2" />
                {ready ? "READY" : "LOADING"}
              </span>
              <span className="lo-line">
                {ready ? "DIVE KIT READY." : "DIVE KIT IS LOADING..."}
                {!ready && <span className="kp-boot-cursor">_</span>}
              </span>
            </div>
          </div>
          <div className="lo-mast-r">
            <span className="kp-chip-pct">
              <span>RUN</span>
              <em>{String(run.runNumber).padStart(2, "0")}</em>
            </span>
            <span className="kp-chip-pct">
              <span>DAY</span>
              <em>{String(Math.min(run.day, FINAL_DAY)).padStart(2, "0")}</em>
            </span>
            <span className="kp-chip-pct">
              <span>CREDITS</span>
              <em>{run.credits}</em>
            </span>
            {run.screen === "analyze" && (
              <Btn
                label="DIVE"
                variant="signal"
                onClick={() => {
                  sfx("claimTick", { bus: "ui" });
                  dispatch({ type: "startDuel" });
                }}
              />
            )}
            {run.screen === "finalePre" && (
              <Btn
                label="DIVE INTO THE MACHINE"
                variant="signal"
                onClick={() => {
                  sfx("claimTick", { bus: "ui" });
                  dispatch({ type: "startFinale" });
                }}
              />
            )}
          </div>
        </div>

        {/* Z2 GUTTER: lowest glance priority, deliberately ambient. It sits
            BESIDE the trinity because it is shorter than the instrument
            bays, so its height is free; giving it a row of its own cost the
            reference build 112px. */}
        <aside className="lo-gutter">
          <div className="lo-gutter-top">
            <span className="lo-spine">OPERATOR RIG</span>
            <div className={feedOn ? "lo-mon on" : "lo-mon"} data-feed="color">
              {/* a CROP at 1:1, never a downscale: resampling the dither
                  mushes the dots to grey noise */}
              <img
                src="/assets/px/window/v3/loadout-feed-color.png"
                alt=""
                width={304}
                height={227}
              />
              <i className="tint" aria-hidden="true" />
              <i className="roll" aria-hidden="true" />
              <span className="lo-rec">
                <i />
                REC
              </span>
              <FeedClock day={Math.min(run.day, FINAL_DAY)} />
              <i className="shade" aria-hidden="true" />
            </div>
          </div>
          <div className="lo-ticks">
            <div className="lo-tick">
              <span>DIVES CLEARED</span>
              <em>
                <CountUp target={meta.stats.divesCleared} delay={500} />
              </em>
            </div>
            <div className="lo-tick">
              <span>DIVES LOST</span>
              <em>
                <CountUp target={meta.stats.divesLost} delay={620} />
              </em>
            </div>
            <div className="lo-tick">
              <span>RAM PER TURN</span>
              <em>
                <CountUp target={run.ramPerTurn} delay={740} />
              </em>
            </div>
          </div>
        </aside>

        {/* Z3 TRINITY: the focal zone */}
        <div className="lo-trinity">
          <ProgPanel
            name="SCAN.EXE"
            unit="RANGE"
            tier={kit.scanTier}
            value={Math.min(SCAN_RANGE[kit.scanTier], 99)}
            sweepBase={260}
            descDelay={480}
            desc={scanDesc(kit.scanTier)}
          />
          <ProgPanel
            name="ATTACK.EXE"
            unit="WIDTH"
            tier={kit.attackTier}
            value={ATTACK_WIDTH[kit.attackTier]}
            sweepBase={460}
            descDelay={640}
            desc={attackModeDesc(kit.attackMode, kit.attackTier)}
            modes={{
              all: ATTACK_MODES_ALL,
              owned: kit.attackModes,
              labels: ATTACK_MODE_LABEL,
              active: kit.attackMode,
              set: (m) => dispatch({ type: "setAttackMode", mode: m as AttackMode }),
              tipFor: (m, owned) =>
                owned ? attackModeDesc(m as AttackMode, kit.attackTier) : tip("modeLocked"),
            }}
          />
          <ProgPanel
            name="DEFEND.EXE"
            unit="WIDTH"
            tier={kit.defendTier}
            value={DEFEND_WIDTH[kit.defendTier]}
            sweepBase={660}
            descDelay={800}
            desc={defendModeDesc(kit.defendMode, kit.defendTier)}
            modes={{
              all: DEFEND_MODES_ALL,
              owned: kit.defendModes,
              labels: DEFEND_MODE_LABEL,
              active: kit.defendMode,
              set: (m) => dispatch({ type: "setDefendMode", mode: m as DefendMode }),
              tipFor: (m, owned) =>
                owned ? defendModeDesc(m as DefendMode, kit.defendTier) : tip("modeLocked"),
            }}
          />
        </div>

        {/* Z4 SUPPORT BAND */}
        <section className="lo-support">
          <div className="lo-div">
            <i />
            <span>{"// BENCH SUPPORT"}</span>
            <i />
          </div>
          <div className="lo-supgrid">
            <div className="lo-sub">
              <div className="lo-subhead">
                <TapTip text={tip("boostSlots")}>
                  <strong>BOOST BAYS</strong>
                </TapTip>
                <span className="kp-pip-row">
                  {Array.from({ length: run.boostSlots }).map((_, p) => (
                    <i
                      key={p}
                      className={
                        p < kit.augments.length ? "kp-pip-sq kp-pip-sq-sm kp-pip-on" : "kp-pip-sq kp-pip-sq-sm"
                      }
                    />
                  ))}
                </span>
                <em>
                  {kit.augments.length} / {run.boostSlots}
                </em>
              </div>
              <div className="lo-baywrap">
                {Array.from({ length: 5 }).map((_, i) => {
                  const aug = i < kit.augments.length ? AUGMENT_BY_ID[kit.augments[i]] : null;
                  const future = i >= run.boostSlots;
                  const cls = aug
                    ? "lo-bay lo-has"
                    : future
                      ? "lo-bay lo-bay-empty lo-bay-future"
                      : "lo-bay lo-bay-empty";
                  const bay = (
                    <div
                      className={reduced ? cls : `${cls} kp-slot-anim`}
                      style={reduced ? undefined : { animationDelay: `${760 + i * 90}ms` }}
                    >
                      {/* a FILLED bay says permanently that it holds more
                          than its name; empty and future bays hold nothing,
                          so they carry no marker */}
                      <span>{aug ? aug.name : "EMPTY BAY"}</span>
                    </div>
                  );
                  return aug ? (
                    <TapTip key={i} text={aug.desc}>
                      {bay}
                    </TapTip>
                  ) : (
                    <div key={i}>{bay}</div>
                  );
                })}
              </div>
            </div>

            <div className="lo-sub">
              <div className="lo-subhead">
                <strong>PATCH POUCH</strong>
                <em>
                  {run.patchPouch.length} / {PATCH_POUCH_MAX}
                </em>
              </div>
              <button type="button" className="lo-pouchbtn" onClick={onOpenSolder} title="Open SOLDER.BAY">
                <div className="lo-rack">
                  {run.patchPouch.map((m, i) => (
                    <span
                      key={i}
                      className={reduced ? undefined : "kp-slot-anim"}
                      style={reduced ? undefined : { animationDelay: `${1120 + i * 80}ms` }}
                    >
                      <PatchGlyph mask={m} size={30} />
                      <span>{SHAPE_NOUN[shapeClassOf(m)]}</span>
                    </span>
                  ))}
                  {Array.from({ length: PATCH_POUCH_MAX - run.patchPouch.length }).map((_, i) => (
                    <span key={`h${i}`} aria-hidden="true">
                      <span className="lo-hole" />
                    </span>
                  ))}
                </div>
                {/* the four line paragraph is cut; the pointer sentence is
                    not (law 8: prose that is taught elsewhere reduces to a
                    chip plus its pointer) */}
                <div className="lo-pouchfoot">
                  <span className="kp-chip-pct">
                    <span>PLACE COST</span>
                    <em>2 RAM</em>
                  </span>
                  <span className="lo-pointer">CRAFT AT THE BENCH: SOLDER.BAY.</span>
                </div>
              </button>
            </div>

            <div className={strainCls}>
              <div className="lo-subhead">
                <TapTip text={tip("strain")}>
                  <strong>NEURAL STRAIN</strong>
                </TapTip>
              </div>
              <div className="lo-strainrow">
                <span className="lo-strainnum">
                  <b>
                    <CountUp target={strain} delay={900} interval={30} />
                  </b>
                  <i className="lo-riskflash" aria-hidden="true" />
                </span>
                <span className="lo-strainbar">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <i key={i} className={i < litStrain ? "on" : undefined} />
                  ))}
                </span>
              </div>
              <span className="lo-strainnote">SEVERS AT ZERO.</span>
            </div>
          </div>
        </section>

        {/* Z5 FOOTLINE */}
        <div className="lo-foot">{">> TUNE IT WHENEVER. IT HOLDS UNTIL YOU CHANGE IT."}</div>
      </div>
    </div>
  );
}
