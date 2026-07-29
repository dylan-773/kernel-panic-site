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
import { Btn, Hero, PipRow, SegMeter } from "../kp-ui";

/**
 * NIGHT.SYS: the day-close screen. Hero day numeral, the strain regen
 * meter, one upgrade held until CLOSE THE NIGHT, and the three shop rows
 * (night patch, the darknet signpost, boost bays).
 */

type Dispatch = (a: RunAction) => void;

const NIGHT_PICK_LABEL: Record<Exclude<NightPick, null>, string> = {
  ram: "+1 RAM / TURN",
  scan: "the SCAN.EXE tier",
  attack: "the ATTACK.EXE tier",
  defend: "the DEFEND.EXE tier",
};

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
  // Night rest already applied by the reducer; animate the fill from the
  // pre-rest value once per mount, silent when the meter was already full.
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
  const strainShown = regenShown || run.lastRegen <= 0 ? run.strain : run.strain - run.lastRegen;
  const picked = run.nightPick;

  const tile = (
    pick: Exclude<NightPick, null>,
    label: string,
    detail: string,
    disabled: boolean,
  ) => (
    <button
      type="button"
      className={`kp-upg ${picked === pick ? "kp-upg-picked" : ""}`.trim()}
      disabled={disabled}
      aria-pressed={picked === pick}
      onClick={() => {
        sfx("tick", { bus: "ui" });
        dispatch({ type: "chooseUpgrade", pick });
      }}
    >
      <strong>{label}</strong>
      <span>{detail}</span>
      {picked === pick && <em className="kp-upg-stamp">SELECTED</em>}
    </button>
  );

  const bayCost = slotCost(run);
  const patchCost = nightPatchCost(run.day);

  return (
    <div className="kp-upgrade">
      <header className="kp-screen-head">
        <div className="kp-hero-day">
          <b>DAY</b>
          <Hero text={String(run.day)} />
          <b>CLOSED</b>
        </div>
        <p>
          One upgrade holds for the rest of the run. Pick it, spend your credits, then close the
          night. Nothing is locked in until you do.
        </p>
      </header>

      <div className="kp-regen">
        <span>STRAIN</span>
        <SegMeter pct={strainShown} segs={30} dur={300} steps={8} />
        {regenShown && run.lastRegen > 0 && <em className="kp-regen-pop">+{run.lastRegen} STRAIN</em>}
      </div>

      <div className="kp-upgrade-grid">
        {tile(
          "ram",
          run.ramPerTurn >= MAX_RAM ? "RAM / TURN MAXED" : "+1 RAM / TURN",
          run.ramPerTurn >= MAX_RAM
            ? `Already at the per turn cap of ${MAX_RAM}.`
            : `${run.ramPerTurn} to ${run.ramPerTurn + 1}. More moves, more programs, every single turn.`,
          run.ramPerTurn >= MAX_RAM,
        )}
        {tile(
          "scan",
          kit.scanTier >= 3 ? "SCAN.EXE MAXED" : `SCAN.EXE T${kit.scanTier} > T${kit.scanTier + 1}`,
          "Wider sweep radius. Still always 1 RAM.",
          kit.scanTier >= 3,
        )}
        {tile(
          "attack",
          kit.attackTier >= 3 ? "ATTACK.EXE MAXED" : `ATTACK.EXE T${kit.attackTier} > T${kit.attackTier + 1}`,
          "One more node per cast: redirect or trap in bulk.",
          kit.attackTier >= 3,
        )}
        {tile(
          "defend",
          kit.defendTier >= 3 ? "DEFEND.EXE MAXED" : `DEFEND.EXE T${kit.defendTier} > T${kit.defendTier + 1}`,
          "One more node per cast: purge, lock, or a wider ward.",
          kit.defendTier >= 3,
        )}
      </div>

      <div className="kp-patchrow">
        <Btn
          label={`NIGHT PATCH: +${PATCH_HEAL} STRAIN (${patchCost} cr)`}
          variant="ghost"
          disabled={run.credits < patchCost || run.strain >= 100}
          onClick={() => {
            sfx("granted", { bus: "ui" });
            dispatch({ type: "buyPatch" });
          }}
        />
        <span className="kp-rail-dim">
          STRAIN {run.strain}/100 - {run.credits} cr - rest restored +{DAY_REST_REGEN}
        </span>
      </div>

      <div className="kp-patchrow">
        <Btn label="BUY BLIND: SEE DARKNET.LNK" variant="ghost" onClick={onOpenDarknet} />
        <span className="kp-rail-dim">
          POUCH {run.patchPouch.length}/{PATCH_POUCH_MAX} - {run.credits} cr - Pay first. Shape is the surprise.
        </span>
        <span className="kp-pip-row">
          {run.patchPouch.map((m, i) => (
            <PatchGlyph key={i} mask={m} size={18} />
          ))}
        </span>
      </div>

      <div className="kp-patchrow">
        <Btn
          label={`INSTALL BOOST BAY (${bayCost ?? "MAX"}${bayCost !== null ? " cr" : ""})`}
          variant="ghost"
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
        />
        <span className="kp-rail-dim">
          BAYS {kit.augments.length}/{run.boostSlots} - {run.credits} cr
        </span>
        <PipRow filled={run.boostSlots} total={BOOST_SLOTS_MAX} size="sm" />
        <span className="kp-rail-dim">A full bay drafts as a swap. More bays, more boosts held.</span>
      </div>

      <div className="kp-screen-actions kp-nightclose">
        <span className="kp-rail-dim">
          {picked === null
            ? "Pick one upgrade above to close the night."
            : `Closing the night applies ${NIGHT_PICK_LABEL[picked]} and opens day ${run.day + 1}.`}
        </span>
        <Btn
          label="CLOSE THE NIGHT"
          variant="signal"
          disabled={picked === null}
          onClick={() => {
            sfx("dayClose", { bus: "ui" });
            dispatch({ type: "closeNight" });
          }}
        />
      </div>
      <Teach id="day-upgrade" />
      <Teach id="night-shop" />
    </div>
  );
}
