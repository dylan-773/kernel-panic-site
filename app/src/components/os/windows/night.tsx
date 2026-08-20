import { useEffect, useState } from "react";
import { sfx } from "../../../game/audio";
import { pouchCapFor } from "../../../game/content/repairs";
import { EVENING_COPY } from "../../../game/content/story";
import {
  DayAction,
  GameState,
  MAX_RAM,
  NIGHT_PATCH_COST,
  PATCH_HEAL,
  SLEEP_REGEN,
  darkPullPrice,
  deckCost,
} from "../../../game/day-reducer";
import { Teach } from "../../game/teach";
import { PatchGlyph } from "../../game/patch-glyph";

/**
 * NIGHT.SYS under the day-as-run: the evening AT THE TERMINAL. The haul is
 * already banked (closing banked it); what happens here is spending. The
 * deck is built from salvage pulled out of customer machines; night
 * patches and dark pulls cost credits that could have been a repair. The
 * repairs themselves are physical: they happen at the objects, downstairs,
 * and this window says so instead of duplicating them.
 *
 * The free night pick is gone: on an open calendar a free upgrade per day
 * is unbounded growth. Progression costs something now, and sleeping
 * upstairs is what ends the night, not a button here.
 */

type Dispatch = (a: DayAction) => void;

const DECK_ROWS: Array<{
  kind: "ram" | "scanTier" | "attackTier" | "defendTier" | "slot";
  label: (s: GameState) => string;
  detail: string;
}> = [
  {
    kind: "ram",
    label: (s) =>
      s.shop!.deck.ramPerTurn >= MAX_RAM
        ? "RAM / TURN MAXED"
        : `+1 RAM / TURN (${s.shop!.deck.ramPerTurn} > ${s.shop!.deck.ramPerTurn + 1})`,
    detail: "More moves, more programs, every single turn.",
  },
  {
    kind: "scanTier",
    label: (s) =>
      s.shop!.deck.scanTier >= 3 ? "SCAN.EXE MAXED" : `SCAN.EXE T${s.shop!.deck.scanTier} > T${s.shop!.deck.scanTier + 1}`,
    detail: "Wider sweep radius. Still always 1 RAM.",
  },
  {
    kind: "attackTier",
    label: (s) =>
      s.shop!.deck.attackTier >= 3
        ? "ATTACK.EXE MAXED"
        : `ATTACK.EXE T${s.shop!.deck.attackTier} > T${s.shop!.deck.attackTier + 1}`,
    detail: "One more node per cast: redirect or trap in bulk.",
  },
  {
    kind: "defendTier",
    label: (s) =>
      s.shop!.deck.defendTier >= 3
        ? "DEFEND.EXE MAXED"
        : `DEFEND.EXE T${s.shop!.deck.defendTier} > T${s.shop!.deck.defendTier + 1}`,
    detail: "One more node per cast: purge, lock, or a wider ward.",
  },
  {
    kind: "slot",
    label: (s) => (s.shop!.deck.slots >= 5 ? "ALL 5 BAYS INSTALLED" : "INSTALL BOOST BAY"),
    detail: "One more boost rides into every dive.",
  },
];

export function NightContent({
  state,
  dispatch,
  onOpenDarknet,
}: {
  state: GameState;
  dispatch: Dispatch;
  onOpenDarknet: () => void;
}) {
  const { shop, day } = state;
  const [regenShown, setRegenShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRegenShown(true), 250);
    return () => clearTimeout(t);
  }, []);
  if (!shop || !day) return null;

  const strain = day.strain;
  const cap = pouchCapFor(shop.repairs);
  const routerUp = shop.repairs.includes("onionRouter");
  const pullCost = darkPullPrice(shop);
  const SEGS = 30;
  const litSegs = Math.round((SEGS * strain) / 100);
  const strainCls =
    strain > 70 ? "nt-strainzone nt-strain-ok" : strain <= 35 ? "nt-strainzone nt-strain-low" : "nt-strainzone";

  return (
    <div className="nt-eva">
      <div className="nt-grid">
        {/* Z1 TOP STRIP */}
        <div className="nt-top">
          <div className="nt-mast-l">
            <span className="nt-eyebrow">NIGHT.SYS // THE EVENING</span>
            <span className="nt-slab">
              DAY <b>{shop.day}</b> BANKED
            </span>
            <span className="nt-line">{EVENING_COPY.openLine}</span>
          </div>
          <div className={strainCls}>
            <div className="nt-strainhead">
              <span className="nt-strainlabel">STRAIN</span>
              <em className={regenShown && day.lastRegen > 0 ? "nt-pop on" : "nt-pop"}>
                SLEEP RESTORES +{SLEEP_REGEN}
              </em>
            </div>
            <div className="nt-strainrow">
              <span className="nt-strainnum">
                <b>{strain}</b>
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

        {/* Z2 THE DECK: salvage in, capability out */}
        <section className="nt-shop">
          <div className="nt-div">
            <i />
            <span>{"// THE NEURAL DECK"}</span>
            <i />
            <span className="nt-crbal">
              <span className="nt-crlab">SALVAGE</span>
              <b>{shop.salvage}</b>
              <span className="nt-crunit">sv</span>
            </span>
          </div>
          <div className="nt-deckgrid">
            {DECK_ROWS.map((row) => {
              const cost = deckCost(shop, row.kind);
              const afford = cost !== null && shop.salvage >= cost;
              return (
                <div className="nt-cell" key={row.kind}>
                  <button
                    type="button"
                    className="nt-buy"
                    disabled={!afford}
                    onClick={() => {
                      sfx("granted", { bus: "ui" });
                      dispatch({ type: "buyDeck", kind: row.kind });
                    }}
                  >
                    {row.label(state)}
                    {cost !== null && (
                      <>
                        {" ("}
                        <span className="amt">{cost}</span>
                        <span className="cr"> sv</span>
                        {")"}
                      </>
                    )}
                  </button>
                  <p className="nt-status">{row.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Z3 CREDITS ROW: tonight against the shop */}
        <section className="nt-shop">
          <div className="nt-div">
            <i />
            <span>{"// TONIGHT, IN CREDITS"}</span>
            <i />
            <span className="nt-crbal">
              <span className="nt-crlab">CREDITS</span>
              <b>{shop.credits}</b>
              <span className="nt-crunit">cr</span>
            </span>
          </div>
          <div className="nt-shopgrid">
            <div className="nt-cell">
              <button
                type="button"
                className="nt-buy"
                disabled={shop.credits < NIGHT_PATCH_COST || strain >= 100}
                onClick={() => {
                  sfx("granted", { bus: "ui" });
                  dispatch({ type: "buyPatchHeal" });
                }}
              >
                NIGHT PATCH: +{PATCH_HEAL} STRAIN (<span className="amt">{NIGHT_PATCH_COST}</span>
                <span className="cr"> cr</span>)
              </button>
              <p className="nt-status">
                A suppressant. It treats the symptom. Money that could have been a repair.
              </p>
              <div className="nt-aux" />
            </div>
            <div className="nt-cell">
              <button type="button" className="nt-buy" disabled={!routerUp} onClick={onOpenDarknet}>
                {routerUp ? (
                  <>
                    BUY BLIND: DARKNET.LNK (<span className="amt">{pullCost}</span>
                    <span className="cr"> cr</span>)
                  </>
                ) : (
                  "DARKNET.LNK: NO LINE OUT"
                )}
              </button>
              <p className="nt-status">
                {routerUp
                  ? `POUCH ${shop.patchPouch.length}/${cap}. Pay first. Shape is the surprise.`
                  : "The onion router downstairs is snapped in half. Repair it and the line comes back."}
              </p>
              <div className="nt-aux">
                <div className="nt-rack">
                  {shop.patchPouch.map((m, i) => (
                    <span key={i}>
                      <PatchGlyph mask={m} size={22} />
                    </span>
                  ))}
                  {Array.from({ length: Math.max(0, cap - shop.patchPouch.length) }).map((_, i) => (
                    <span key={`h${i}`}>
                      <span className="nt-hole" />
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="nt-cell">
              <button type="button" className="nt-buy" disabled>
                REPAIRS HAPPEN AT THE OBJECTS
              </button>
              <p className="nt-status">
                Everything he left broken is standing in the room downstairs, with its price on it.
                Walk to it.
              </p>
              <div className="nt-aux" />
            </div>
          </div>
        </section>

        {/* Z4 FOOTER */}
        <div className="nt-foot">
          <span className="nt-pointer">{EVENING_COPY.sleepCommitLine} THE BED IS UPSTAIRS.</span>
        </div>
      </div>
      <Teach id="night-shop" />
      <Teach id="strain-carryover" signals={{ strainShort: strain < 100 }} />
    </div>
  );
}
