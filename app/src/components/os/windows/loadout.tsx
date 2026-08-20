import { useEffect, useMemo, useState } from "react";
import { sfx } from "../../../game/audio";
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
import { pouchCapFor } from "../../../game/content/repairs";
import { shapeClassOf } from "../../../game/patch-cells";
import type { DayAction, GameState } from "../../../game/day-reducer";
import {
  WEEKDAYS,
  ownedAttackModes,
  ownedBoostsNow,
  ownedDefendModes,
  weekdayOf,
} from "../../../game/save";
import { tip } from "../../../game/content/teaching";
import { Teach } from "../../game/teach";
import { TapTip } from "../../game/tap-tip";
import { PatchGlyph } from "../../game/patch-glyph";
import { Btn } from "../kp-ui";

/**
 * LOADOUT.CFG as a KP/OS v3 instrument panel: the system's REFERENCE
 * IMPLEMENTATION. GLANCE ORDER: 1st the trinity's three hero numerals;
 * 2nd the READY slab; 3rd NEURAL STRAIN.
 *
 * Under the day-as-run the deck gained the game's new central decision:
 * unlocks are permanent, BAYS are not. The catalog fills up and stays full;
 * the bays hold the subset that actually dives. A filled bay unslots on
 * click, the pool below slots on click, and diving never waits on any of
 * it.
 */

type Dispatch = (a: DayAction) => void;

const SHAPE_NOUN: Record<"I" | "L" | "T" | "X", string> = {
  I: "Straight",
  L: "Elbow",
  T: "Tee",
  X: "Cross",
};

const ATTACK_MODES_ALL: AttackMode[] = ["redirect", "armHalt", "armSiphon"];
const DEFEND_MODES_ALL: DefendMode[] = ["purge", "lock", "ward"];

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

function CountUp({
  target,
  delay = 0,
  interval = 26,
  lock,
}: {
  target: number;
  delay?: number;
  interval?: number;
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
      <i className="lo-bracket" aria-hidden="true">
        <i />
      </i>
    </div>
  );
}

/** The live BENCH FEED clock (the same shop clock as the desk widget). */
function FeedClock({ day, weekday }: { day: number; weekday: string }) {
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
      {weekday} {day} {hh}:{mm}:{ss}
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
}) {
  const { meta, shop, day } = state;
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

  const strain = day?.strain ?? 0;
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

  if (!shop || !day) return null;
  const deck = shop.deck;
  const ownedA = ownedAttackModes(shop, day);
  const ownedD = ownedDefendModes(shop, day);
  const ownedBoosts = ownedBoostsNow(shop, day);
  const pool = ownedBoosts.filter((id) => !deck.slotted.includes(id));
  const evening = day.phase === "evening" || day.phase === "sunday";
  const pouch = evening ? shop.patchPouch : day.pouch;
  const cap = pouchCapFor(shop.repairs);

  const strainCls =
    strain > 70 ? "lo-sub lo-strain-ok" : strain <= 35 ? "lo-sub lo-strain-low" : "lo-sub";

  return (
    <div className="lo-eva">
      <div className="lo-grid">
        {/* Z1 MASTHEAD */}
        <div className="lo-mast">
          <div className="lo-mast-l">
            <span className="lo-eyebrow">LOADOUT.CFG // THE NEURAL DECK</span>
            <div className="lo-slabwrap">
              <span className={ready ? "lo-slab kp-frame-ticks is-ready" : "lo-slab kp-frame-ticks"}>
                <i className="kp-tick2" />
                {ready ? "READY" : "LOADING"}
              </span>
              <span className="lo-line">
                {ready ? "THE DECK IS READY. IT WAS HIS." : "THE DECK IS LOADING..."}
                {!ready && <span className="kp-boot-cursor">_</span>}
              </span>
            </div>
          </div>
          <div className="lo-mast-r">
            <span className="kp-chip-pct">
              <span>{WEEKDAYS[weekdayOf(shop.day)]}</span>
              <em>DAY {shop.day}</em>
            </span>
            <span className="kp-chip-pct">
              <span>CREDITS</span>
              <em>{shop.credits}</em>
            </span>
            <span className="kp-chip-pct">
              <span>SALVAGE</span>
              <em>{shop.salvage}</em>
            </span>
            {day.phase === "open" && day.ticket && (
              <Btn
                label="DIVE"
                variant="signal"
                onClick={() => {
                  sfx("claimTick", { bus: "ui" });
                  dispatch({ type: "startDive" });
                }}
              />
            )}
          </div>
        </div>

        {/* Z2 GUTTER */}
        <aside className="lo-gutter">
          <div className="lo-gutter-top">
            <span className="lo-spine">OPERATOR RIG</span>
            <div className={feedOn ? "lo-mon on" : "lo-mon"} data-feed="color">
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
              <FeedClock day={shop.day} weekday={WEEKDAYS[weekdayOf(shop.day)]} />
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
                <CountUp target={deck.ramPerTurn} delay={740} />
              </em>
            </div>
          </div>
        </aside>

        {/* Z3 TRINITY */}
        <div className="lo-trinity">
          <ProgPanel
            name="SCAN.EXE"
            unit="RANGE"
            tier={deck.scanTier}
            value={Math.min(SCAN_RANGE[deck.scanTier], 99)}
            sweepBase={260}
            descDelay={480}
            desc={scanDesc(deck.scanTier)}
          />
          <ProgPanel
            name="ATTACK.EXE"
            unit="WIDTH"
            tier={deck.attackTier}
            value={ATTACK_WIDTH[deck.attackTier]}
            sweepBase={460}
            descDelay={640}
            desc={attackModeDesc(deck.attackMode, deck.attackTier)}
            modes={{
              all: ATTACK_MODES_ALL,
              owned: ownedA,
              labels: ATTACK_MODE_LABEL,
              active: deck.attackMode,
              set: (m) => dispatch({ type: "setAttackMode", mode: m as AttackMode }),
              tipFor: (m, owned) =>
                owned ? attackModeDesc(m as AttackMode, deck.attackTier) : tip("modeLocked"),
            }}
          />
          <ProgPanel
            name="DEFEND.EXE"
            unit="WIDTH"
            tier={deck.defendTier}
            value={DEFEND_WIDTH[deck.defendTier]}
            sweepBase={660}
            descDelay={800}
            desc={defendModeDesc(deck.defendMode, deck.defendTier)}
            modes={{
              all: DEFEND_MODES_ALL,
              owned: ownedD,
              labels: DEFEND_MODE_LABEL,
              active: deck.defendMode,
              set: (m) => dispatch({ type: "setDefendMode", mode: m as DefendMode }),
              tipFor: (m, owned) =>
                owned ? defendModeDesc(m as DefendMode, deck.defendTier) : tip("modeLocked"),
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
                  {Array.from({ length: deck.slots }).map((_, p) => (
                    <i
                      key={p}
                      className={
                        p < deck.slotted.length ? "kp-pip-sq kp-pip-sq-sm kp-pip-on" : "kp-pip-sq kp-pip-sq-sm"
                      }
                    />
                  ))}
                </span>
                <em>
                  {deck.slotted.length} / {deck.slots}
                </em>
              </div>
              <div className="lo-baywrap">
                {Array.from({ length: 5 }).map((_, i) => {
                  const aug = i < deck.slotted.length ? AUGMENT_BY_ID[deck.slotted[i]] : null;
                  const future = i >= deck.slots;
                  const cls = aug
                    ? "lo-bay lo-has"
                    : future
                      ? "lo-bay lo-bay-empty lo-bay-future"
                      : "lo-bay lo-bay-empty";
                  const bay = (
                    <button
                      type="button"
                      className={reduced ? cls : `${cls} kp-slot-anim`}
                      style={reduced ? undefined : { animationDelay: `${760 + i * 90}ms` }}
                      disabled={!aug}
                      onClick={() => {
                        if (!aug) return;
                        sfx("tick", { bus: "ui" });
                        dispatch({ type: "unslotBoost", id: aug.id });
                      }}
                    >
                      <span>{aug ? aug.name : future ? "NO BAY" : "EMPTY BAY"}</span>
                      {aug && <em className="lo-bayaction">UNSLOT</em>}
                    </button>
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
              {/* The pool: everything owned and benched. Equal footprint: an
                  empty pool keeps its row. */}
              <div className="lo-pool">
                <span className="lo-poollabel">{"// THE POOL _"}</span>
                {pool.length === 0 ? (
                  <span className="lo-poolempty">
                    {ownedBoosts.length === 0
                      ? "NOTHING OWNED YET. CLEARED JOBS DRAFT AUGMENTS."
                      : "EVERYTHING OWNED IS SLOTTED."}
                  </span>
                ) : (
                  pool.map((id) => {
                    const a = AUGMENT_BY_ID[id];
                    if (!a) return null;
                    const room = deck.slotted.length < deck.slots;
                    return (
                      <TapTip key={id} text={a.desc}>
                        <button
                          type="button"
                          className="lo-poolitem"
                          disabled={!room}
                          onClick={() => {
                            sfx("tick", { bus: "ui" });
                            dispatch({ type: "slotBoost", id });
                          }}
                        >
                          {a.name}
                          <em className="lo-bayaction">{room ? "SLOT" : "BAYS FULL"}</em>
                        </button>
                      </TapTip>
                    );
                  })
                )}
              </div>
              <Teach id="deck-slots" signals={{ swapOffered: ownedBoosts.length > deck.slots }} />
            </div>

            <div className="lo-sub">
              <div className="lo-subhead">
                <strong>PATCH POUCH</strong>
                <em>
                  {pouch.length} / {cap}
                </em>
              </div>
              <button type="button" className="lo-pouchbtn" onClick={onOpenSolder} title="Open SOLDER.BAY">
                <div className="lo-rack">
                  {pouch.map((m, i) => (
                    <span
                      key={i}
                      className={reduced ? undefined : "kp-slot-anim"}
                      style={reduced ? undefined : { animationDelay: `${1120 + i * 80}ms` }}
                    >
                      <PatchGlyph mask={m} size={30} />
                      <span>{SHAPE_NOUN[shapeClassOf(m)]}</span>
                    </span>
                  ))}
                  {Array.from({ length: Math.max(0, cap - pouch.length) }).map((_, i) => (
                    <span key={`h${i}`} aria-hidden="true">
                      <span className="lo-hole" />
                    </span>
                  ))}
                </div>
                <div className="lo-pouchfoot">
                  <span className="kp-chip-pct">
                    <span>PLACE COST</span>
                    <em>2 RAM</em>
                  </span>
                  <span className="lo-pointer">WELD AT THE BENCH: SOLDER.BAY.</span>
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
              <span className="lo-strainnote">ZERO LOSES THE DAY.</span>
            </div>
          </div>
        </section>

        {/* Z5 FOOTLINE */}
        <div className="lo-foot">{">> TUNE IT WHENEVER. IT HOLDS UNTIL YOU CHANGE IT."}</div>
      </div>
    </div>
  );
}
