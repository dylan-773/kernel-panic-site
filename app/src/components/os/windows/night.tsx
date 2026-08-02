import { useEffect, useState } from "react";
import { sfx } from "../../../game/audio";
import { PATCH_POUCH_MAX } from "../../../game/patch-cells";
import {
  BOOST_SLOTS_MAX,
  DAY_REST_REGEN,
  MAX_RAM,
  PATCH_HEAL,
  nightPatchCost,
  slotCost,
  type RunAction,
} from "../../../game/run-reducer";
import type { NightPick, RunState } from "../../../game/save";
import { Teach } from "../../game/teach";
import { PatchGlyph } from "../../game/patch-glyph";

/**
 * NIGHT.SYS as a KP/OS v3 instrument panel (ui-demos/night-v3, cycle
 * ux-2026-07-31-night-v3). System: ../RULINGS.md.
 *
 * The system's LOW-DENSITY proof: seven stacked blocks become four shared
 * rows. GLANCE ORDER: 1st the PICK, held in a focal hero card at 2.27x
 * everything else; 2nd STRAIN; 3rd the shop. The DAY marker is
 * DELIBERATELY DEMOTED: it is pure state with no decision attached, a
 * chapter marker read once per night, so it takes no role token at all and
 * renders in plain ambient ink.
 *
 * STRAIN owns the only alarm, at or below 35. Note the POLARITY: strain
 * counts DOWN as the run wears, so risk is the LOW end of the meter, the
 * inverse of the usual "fuller is worse" read.
 *
 * The pick state machine has three guarantees, and one is STRUCTURAL:
 * there is exactly one hero slot in the DOM and the strip is derived as
 * "every option that is not in it", so the layout cannot represent two
 * selections even by a styling mistake. It is reversible (no confirmation,
 * no cost) and it locks nothing until CLOSE THE NIGHT.
 */

type Dispatch = (a: RunAction) => void;

const NIGHT_PICK_LABEL: Record<Exclude<NightPick, null>, string> = {
  ram: "+1 RAM / TURN",
  scan: "the SCAN.EXE tier",
  attack: "the ATTACK.EXE tier",
  defend: "the DEFEND.EXE tier",
};

interface Tile {
  key: Exclude<NightPick, null>;
  label: string;
  pname: string;
  hero: string;
  detail: string;
  maxed: boolean;
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

export function NightContent({
  run,
  dispatch,
  onOpenDarknet,
}: {
  run: RunState;
  dispatch: Dispatch;
  onOpenDarknet: () => void;
}) {
  const kit = run.kit;
  const reduced = useReducedMotion();

  // Night rest is already applied by the reducer; the meter fills from the
  // pre-rest value once per mount, silently when it was already full.
  const [regenShown, setRegenShown] = useState(false);
  useEffect(() => {
    if (run.lastRegen <= 0) return;
    const t = setTimeout(() => {
      setRegenShown(true);
      sfx("dayCloseRegen", { bus: "ui" });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strainTarget = run.strain;
  const strainFrom = run.lastRegen > 0 ? run.strain - run.lastRegen : run.strain;
  const [shownStrain, setShownStrain] = useState(strainFrom);
  useEffect(() => {
    if (reduced || strainFrom === strainTarget) {
      setShownStrain(strainTarget);
      return;
    }
    setShownStrain(strainFrom);
    // the shipped SegMeter's own parameters: 300ms across steps(8)
    const STEPS = 8;
    let n = 0;
    const lead = setTimeout(() => {
      const iv = setInterval(() => {
        n += 1;
        setShownStrain(Math.round(strainFrom + (strainTarget - strainFrom) * (n / STEPS)));
        if (n >= STEPS) {
          clearInterval(iv);
          setShownStrain(strainTarget);
        }
      }, 300 / STEPS);
    }, 150);
    return () => clearTimeout(lead);
  }, [strainFrom, strainTarget, reduced]);

  const picked = run.nightPick;
  const bayCost = slotCost(run);
  const patchCost = nightPatchCost(run.day);

  const ramMax = run.ramPerTurn >= MAX_RAM;
  const tiles: Tile[] = [
    {
      key: "ram",
      label: ramMax ? "RAM / TURN MAXED" : "+1 RAM / TURN",
      pname: "RAM / TURN",
      hero: "+1",
      detail: ramMax
        ? `Already at the per turn cap of ${MAX_RAM}.`
        : `${run.ramPerTurn} to ${run.ramPerTurn + 1}. More moves, more programs, every single turn.`,
      maxed: ramMax,
    },
    {
      key: "scan",
      label: kit.scanTier >= 3 ? "SCAN.EXE MAXED" : `SCAN.EXE T${kit.scanTier} > T${kit.scanTier + 1}`,
      pname: "SCAN.EXE",
      hero: `T${kit.scanTier} > T${kit.scanTier + 1}`,
      detail: "Wider sweep radius. Still always 1 RAM.",
      maxed: kit.scanTier >= 3,
    },
    {
      key: "attack",
      label:
        kit.attackTier >= 3 ? "ATTACK.EXE MAXED" : `ATTACK.EXE T${kit.attackTier} > T${kit.attackTier + 1}`,
      pname: "ATTACK.EXE",
      hero: `T${kit.attackTier} > T${kit.attackTier + 1}`,
      detail: "One more node per cast: redirect or trap in bulk.",
      maxed: kit.attackTier >= 3,
    },
    {
      key: "defend",
      label:
        kit.defendTier >= 3 ? "DEFEND.EXE MAXED" : `DEFEND.EXE T${kit.defendTier} > T${kit.defendTier + 1}`,
      pname: "DEFEND.EXE",
      hero: `T${kit.defendTier} > T${kit.defendTier + 1}`,
      detail: "One more node per cast: purge, lock, or a wider ward.",
      maxed: kit.defendTier >= 3,
    },
  ];
  const chosen = tiles.find((t) => t.key === picked) ?? null;

  // the band re-evaluates against the CURRENTLY DISPLAYED value, so a fill
  // that crosses a threshold flips the alarm as it crosses, not before
  const strainCls =
    shownStrain > 70
      ? "nt-strainzone nt-strain-ok"
      : shownStrain <= 35
        ? "nt-strainzone nt-strain-low"
        : "nt-strainzone";

  const SEGS = 30;
  const litSegs = Math.round((SEGS * shownStrain) / 100);

  return (
    <div className="nt-eva">
      <div className="nt-grid">
        {/* Z1 TOP STRIP: the demoted day marker beside strain */}
        <div className="nt-top">
          <div className="nt-mast-l">
            <span className="nt-eyebrow">NIGHT.SYS // DAY CLOSE</span>
            <span className="nt-slab">
              DAY <b>{run.day}</b> CLOSED
            </span>
            <span className="nt-line">One upgrade holds for the rest of the run.</span>
          </div>
          <div className={strainCls}>
            <div className="nt-strainhead">
              <span className="nt-strainlabel">STRAIN</span>
              {/* the regen pop keeps its room whether or not it fires, so the
                  silent branch occupies the identical footprint */}
              <em className={regenShown && run.lastRegen > 0 ? "nt-pop on" : "nt-pop"}>
                +{run.lastRegen} STRAIN
              </em>
            </div>
            <div className="nt-strainrow">
              <span className="nt-strainnum">
                <b>{shownStrain}</b>
                <i className="nt-riskflash" aria-hidden="true" />
              </span>
              <span className="nt-strainbar">
                {Array.from({ length: SEGS }).map((_, i) => (
                  <i key={i} className={i < litSegs ? "on" : undefined} />
                ))}
              </span>
            </div>
          </div>
        </div>

        {/* Z2 PICK ROW: the focal hero card beside the option strip */}
        <article
          className={chosen ? "nt-hero is-picked" : "nt-hero is-empty"}
          key={chosen ? chosen.key : "none"}
        >
          <span className="nt-pname">{chosen ? chosen.pname : ""}</span>
          <div className="nt-heroline">
            <span className="nt-num">{chosen ? chosen.hero : "NO PICK"}</span>
            {chosen && <em className="nt-stamp">SELECTED</em>}
          </div>
          <p className="nt-detail">{chosen ? chosen.detail : ""}</p>
          <i className="nt-bracket" aria-hidden="true">
            <i />
          </i>
          <i className="nt-reticle" aria-hidden="true" />
        </article>

        <div className="nt-strip">
          {tiles
            .filter((t) => !chosen || t.key !== chosen.key)
            .map((t, n) => (
              <button
                key={t.key}
                type="button"
                className="nt-opt"
                disabled={t.maxed}
                aria-pressed={false}
                style={reduced ? undefined : { animationDelay: `${300 + n * 90}ms` }}
                onClick={() => {
                  sfx("tick", { bus: "ui" });
                  dispatch({ type: "chooseUpgrade", pick: t.key });
                }}
              >
                {t.label}
              </button>
            ))}
        </div>

        {/* Z3 SHOP ROW: all three purchases, three-up */}
        <section className="nt-shop">
          <div className="nt-div">
            <i />
            <span>{"// NIGHT SHOP"}</span>
            <i />
            {/* the one number every shop decision is judged against rides the
                spend zone's own header, so the balance and the three costs it
                gates share a single glance */}
            <span className="nt-crbal">
              <span className="nt-crlab">CREDITS</span>
              <b>{run.credits}</b>
              <span className="nt-crunit">cr</span>
            </span>
          </div>
          <div className="nt-shopgrid">
            <div className="nt-cell">
              <button
                type="button"
                className="nt-buy"
                disabled={run.credits < patchCost || run.strain >= 100}
                onClick={() => {
                  sfx("granted", { bus: "ui" });
                  dispatch({ type: "buyPatch" });
                }}
              >
                NIGHT PATCH: +{PATCH_HEAL} STRAIN (<span className="amt">{patchCost}</span>
                <span className="cr"> cr</span>)
              </button>
              <p className="nt-status">
                STRAIN {run.strain}/100. Rest restored +{DAY_REST_REGEN}.
              </p>
              <div className="nt-aux" />
            </div>
            <div className="nt-cell">
              <button type="button" className="nt-buy" onClick={onOpenDarknet}>
                BUY BLIND: SEE DARKNET.LNK
              </button>
              <p className="nt-status">
                POUCH {run.patchPouch.length}/{PATCH_POUCH_MAX}. Pay first. Shape is the surprise.
              </p>
              <div className="nt-aux">
                {/* equal-footprint holes, so a 1-piece pouch and a 5-piece
                    pouch occupy the same room */}
                <div className="nt-rack">
                  {run.patchPouch.map((m, i) => (
                    <span key={i}>
                      <PatchGlyph mask={m} size={22} />
                    </span>
                  ))}
                  {Array.from({ length: PATCH_POUCH_MAX - run.patchPouch.length }).map((_, i) => (
                    <span key={`h${i}`}>
                      <span className="nt-hole" />
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="nt-cell">
              <button
                type="button"
                className="nt-buy"
                disabled={bayCost === null || run.credits < (bayCost ?? 0)}
                title={
                  bayCost === null
                    ? `ALL ${BOOST_SLOTS_MAX} BAYS INSTALLED`
                    : run.credits < (bayCost ?? 0)
                      ? `NEED ${bayCost} CR`
                      : undefined
                }
                onClick={() => {
                  sfx("granted", { bus: "ui" });
                  dispatch({ type: "buySlot" });
                }}
              >
                INSTALL BOOST BAY (
                {bayCost === null ? (
                  "MAX"
                ) : (
                  <>
                    <span className="amt">{bayCost}</span>
                    <span className="cr"> cr</span>
                  </>
                )}
                )
              </button>
              <p className="nt-status">
                BAYS {kit.augments.length}/{run.boostSlots}.
              </p>
              <div className="nt-aux">
                <span className="kp-pip-row">
                  {Array.from({ length: BOOST_SLOTS_MAX }).map((_, i) => (
                    <i
                      key={i}
                      className={i < run.boostSlots ? "kp-pip-sq kp-pip-sq-sm kp-pip-on" : "kp-pip-sq kp-pip-sq-sm"}
                    />
                  ))}
                </span>
                <span className="nt-status" style={{ minHeight: 0 }}>
                  A full bay drafts as a swap. More bays, more boosts held.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Z4 FOOTER */}
        <div className="nt-foot">
          <span className="nt-pointer">
            {picked === null
              ? "Pick one upgrade above to close the night."
              : `Closing the night applies ${NIGHT_PICK_LABEL[picked]} and opens day ${run.day + 1}.`}
          </span>
          <button
            type="button"
            className={picked === null ? "nt-close" : "nt-close is-armed"}
            disabled={picked === null}
            onClick={() => {
              sfx("dayClose", { bus: "ui" });
              dispatch({ type: "closeNight" });
            }}
          >
            CLOSE THE NIGHT
          </button>
        </div>
      </div>
      <Teach id="day-upgrade" />
      <Teach id="night-shop" />
    </div>
  );
}
