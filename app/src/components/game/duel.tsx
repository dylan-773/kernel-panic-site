import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ABILITY_BY_ID, VERB_LABEL } from "../../game/content/abilities";
import { FxKind, playFx } from "../../game/audio";
import {
  armTargetLegal,
  placementLegal,
  redirectTargetLegal,
} from "../../game/duel-actions";
import { duelReducer } from "../../game/duel-reducer";
import { createDuel } from "../../game/duel-setup";
import {
  AbilityDef,
  AbilityId,
  DuelConfig,
  DuelState,
  EquippedAbility,
  ROUND_CAP,
} from "../../game/duel-types";
import { DuelBoard, GhostPiece } from "./duel-board";
import { PiecePreview } from "./piece-preview";

/** Map duel fx names onto the synth's existing voices. */
const FX_MAP: Record<string, FxKind> = {
  place: "patch",
  rotate: "rotate",
  discard: "jam",
  deny: "deny",
  power: "power",
  win: "win",
  lose: "lose",
  endTurn: "ping",
  trapSet: "block",
  trapFire: "scramble",
  redirect: "scramble",
  shield: "unjam",
  scan: "ping",
  overload: "freeze",
  overclock: "power",
  firewall: "andOpen",
  backdoor: "loot",
};

interface Targeting {
  def: AbilityDef;
  mode: "arm" | "redirect" | "shield" | "overload";
  picked: number[];
  want: number;
}

export interface DuelFinish {
  won: boolean;
  chip: number;
  capWin: boolean;
  copiesLeft: Record<AbilityId, number>;
}

export interface DuelScreenProps {
  cfg: DuelConfig;
  seed: number;
  equipped: EquippedAbility[];
  ramPerTurn: number;
  jobTitle: string;
  jobSub: string;
  dominantTell: string | null;
  strain: number;
  day: number;
  onFinish: (r: DuelFinish) => void;
  soundOn: boolean;
}

function coachLine(s: DuelState): string | null {
  if (!s.cfg.tutorial) return null;
  if (s.phase !== "playing") return null;
  const placed = s.cells.some((c) => c.kind === "node" && c.owner === "player");
  if (s.turn === "player" && s.round === 1 && !placed) {
    return "Route power from YOUR port toward the CORE. Click a marked sector to place a node. R rotates it first.";
  }
  if (s.turn === "player" && s.round === 1) {
    return "Placing costs 2 RAM, rotating a placed node costs 1, swapping your draw costs 1. Spend what you have, then END TURN.";
  }
  if (s.turn === "opp" && s.round === 1) {
    return "Now it moves. Watch how much it can afford.";
  }
  if (s.round === 2) {
    return "It generates twice your RAM and it does not misplace. This is not a fight you can win today.";
  }
  return "Reach the core first. That is the whole game. It just happens to be faster.";
}

export function DuelScreen(props: DuelScreenProps) {
  const { cfg, seed, equipped, ramPerTurn, onFinish, soundOn } = props;
  const [state, dispatch] = useReducer(
    duelReducer,
    undefined,
    () => createDuel(cfg, seed, equipped, ramPerTurn),
  );
  const [pendingRot, setPendingRot] = useState(0);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [overloadPick, setOverloadPick] = useState<AbilityDef | null>(null);
  const finishedRef = useRef(false);

  const playerTurn = state.phase === "playing" && state.turn === "player";
  const econ = state.econ.player;

  // Opponent moves on a readable cadence.
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== "opp") return;
    const t = setInterval(() => dispatch({ type: "oppStep" }), 460);
    return () => clearInterval(t);
  }, [state.phase, state.turn]);

  // Sound: drain the fx queue.
  useEffect(() => {
    if (state.fx.length === 0) return;
    if (soundOn) {
      for (const e of state.fx) {
        const mapped = FX_MAP[e.kind];
        if (mapped) playFx(mapped);
      }
    }
    dispatch({ type: "fxDrain", upTo: state.fx[state.fx.length - 1].id });
  }, [state.fx, soundOn]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyR") {
        e.preventDefault();
        setPendingRot((r) => (r + 1) % 4);
      } else if (e.code === "Escape") {
        setTargeting(null);
        setOverloadPick(null);
      } else if (e.code === "KeyE" && playerTurn && !targeting) {
        dispatch({ type: "endTurn" });
      } else if (e.code === "KeyD" && playerTurn && !targeting) {
        dispatch({ type: "discard" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerTurn, targeting]);

  // Legal cells for the current interaction.
  const legal = useMemo(() => {
    const out = new Set<number>();
    if (!playerTurn) return out;
    if (targeting) {
      for (let i = 0; i < state.cells.length; i++) {
        if (targeting.picked.includes(i)) continue;
        if (targeting.mode === "arm" && armTargetLegal(state, "player", i)) out.add(i);
        if (targeting.mode === "redirect" && redirectTargetLegal(state, "player", i)) out.add(i);
        if (
          targeting.mode === "shield" &&
          state.cells[i].kind === "node" &&
          state.cells[i].owner === "player"
        ) {
          out.add(i);
        }
      }
      return out;
    }
    for (let i = 0; i < state.cells.length; i++) {
      const c = state.cells[i];
      if (c.kind === "empty" && econ.ram >= 2 && placementLegal(state, "player", i)) out.add(i);
      if (c.kind === "node" && c.owner === "player" && econ.ram >= 1) out.add(i);
    }
    return out;
  }, [state, playerTurn, targeting, econ.ram]);

  const ghost: GhostPiece | null =
    playerTurn && !targeting ? { mask: econ.drawCur, rot: pendingRot } : null;

  const onCell = (idx: number) => {
    if (!playerTurn) return;
    if (targeting) {
      const picked = [...targeting.picked, idx];
      if (picked.length >= targeting.want) {
        castTargeted(targeting.def, picked);
        setTargeting(null);
      } else {
        setTargeting({ ...targeting, picked });
      }
      return;
    }
    const c = state.cells[idx];
    if (c.kind === "empty") {
      dispatch({ type: "place", idx, rot: pendingRot });
    } else if (c.kind === "node" && c.owner === "player") {
      dispatch({ type: "rotateOwn", idx });
    }
  };

  const castTargeted = (def: AbilityDef, targets: number[]) => {
    dispatch({ type: "ability", id: def.id, targets });
  };

  const onAbility = (def: AbilityDef) => {
    if (!playerTurn || econ.abilityUsed) return;
    setOverloadPick(null);
    switch (def.verb) {
      case "arm":
        setTargeting({ def, mode: "arm", picked: [], want: def.p.traps ?? 1 });
        break;
      case "redirect":
        setTargeting({ def, mode: "redirect", picked: [], want: def.p.targets ?? 1 });
        break;
      case "shield":
        setTargeting({ def, mode: "shield", picked: [], want: def.p.targets ?? 1 });
        break;
      case "backdoor":
        if (def.p.shieldRounds) {
          setTargeting({ def, mode: "shield", picked: [], want: 1 });
        } else {
          dispatch({ type: "ability", id: def.id, targets: [] });
        }
        break;
      case "overload":
        if (def.p.lockTurns) setOverloadPick(def);
        else dispatch({ type: "ability", id: def.id, targets: [] });
        break;
      case "scan":
      case "overclock":
      case "firewall":
        dispatch({ type: "ability", id: def.id, targets: [] });
        break;
    }
  };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish({
      won: state.phase === "won",
      chip: state.strainChip,
      capWin: state.winKind === "cap",
      copiesLeft: Object.fromEntries(state.equipped.map((e) => [e.id, e.copies])),
    });
  };

  const coach = coachLine(state);
  const oppRam = state.econ.opp;

  return (
    <div className="kp-duel">
      <header className="kp-duel-head">
        <div className="kp-duel-title">
          <strong>{props.jobTitle}</strong>
          <span>{props.jobSub}</span>
        </div>
        <div className="kp-duel-meters">
          <span className="kp-duel-day">DAY {props.day}</span>
          <span className="kp-duel-round">
            R{Math.min(state.round, ROUND_CAP)}/{ROUND_CAP}
          </span>
          <div className="kp-strain" title="Neural Strain">
            <span>STRAIN</span>
            <div className="kp-strain-bar">
              <div className="kp-strain-fill" style={{ width: `${props.strain}%` }} />
            </div>
            <em>{props.strain}</em>
          </div>
        </div>
      </header>

      <div className="kp-duel-main">
        <div className="kp-duel-boardwrap">
          <DuelBoard
            state={state}
            legal={legal}
            selected={new Set(targeting?.picked ?? [])}
            ghost={ghost}
            onCell={onCell}
          />
          {state.notice && (
            <div key={state.notice.id} className="kp-toast">
              {state.notice.text}
            </div>
          )}
          {coach && <div className="kp-coach">{coach}</div>}
          {targeting && (
            <div className="kp-targetbar">
              <span>
                {targeting.def.name}: pick {targeting.want - targeting.picked.length} target
                {targeting.want - targeting.picked.length === 1 ? "" : "s"}
              </span>
              {targeting.picked.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    castTargeted(targeting.def, targeting.picked);
                    setTargeting(null);
                  }}
                >
                  CAST NOW
                </button>
              )}
              <button type="button" onClick={() => setTargeting(null)}>
                CANCEL
              </button>
            </div>
          )}
        </div>

        <aside className="kp-duel-rail">
          <section className="kp-rail-block kp-rail-opp">
            <h3>INTRUSION</h3>
            <div className="kp-rail-row">
              <span>RAM</span>
              <em>{state.turn === "opp" ? oppRam.ram : oppRam.ramPerTurn}</em>
            </div>
            {props.dominantTell && <p className="kp-rail-tell">{props.dominantTell}</p>}
            {state.intentRevealed && state.oppNextIntent && (
              <p className="kp-rail-intent">INTENT: {state.oppNextIntent}</p>
            )}
            <div className={state.turn === "opp" ? "kp-turnlight kp-turnlight-on" : "kp-turnlight"}>
              {state.turn === "opp" ? "IT IS MOVING" : "HOLDING"}
            </div>
          </section>

          <section className="kp-rail-block">
            <h3>PIPELINE</h3>
            <div className="kp-pieces">
              <div className="kp-piece-slot">
                <span>NOW</span>
                <PiecePreview mask={econ.drawCur} rot={pendingRot} highlight />
              </div>
              <div className="kp-piece-slot">
                <span>NEXT</span>
                <PiecePreview mask={econ.drawNext} rot={0} />
              </div>
              <div className="kp-piece-actions">
                <button
                  type="button"
                  onClick={() => setPendingRot((r) => (r + 1) % 4)}
                  title="Rotate pending piece (R)"
                >
                  ROT (R)
                </button>
                <button
                  type="button"
                  disabled={!playerTurn || econ.ram < 1}
                  onClick={() => dispatch({ type: "discard" })}
                  title="Swap draw for 1 RAM (D)"
                >
                  SWAP (D)
                </button>
              </div>
            </div>
          </section>

          <section className="kp-rail-block">
            <h3>
              RAM <em className="kp-ram-count">{playerTurn ? econ.ram : 0}</em>
            </h3>
            <div className="kp-ram-pips">
              {Array.from({ length: Math.max(econ.ramPerTurn + 2, econ.ram) }).map((_, i) => (
                <span key={i} className={i < econ.ram && playerTurn ? "kp-pip kp-pip-on" : "kp-pip"} />
              ))}
            </div>
          </section>

          <section className="kp-rail-block kp-rail-abilities">
            <h3>LOADOUT</h3>
            {state.equipped.length === 0 && <p className="kp-rail-dim">Nothing equipped.</p>}
            <div className="kp-ability-bar">
              {state.equipped.map((slot) => {
                const def = ABILITY_BY_ID[slot.id];
                if (!def) return null;
                const jammed = slot.id in econ.disabled;
                const disabled =
                  !playerTurn ||
                  slot.copies < 1 ||
                  econ.abilityUsed ||
                  jammed ||
                  econ.ram < def.ramCost;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    className={`kp-ability ${targeting?.def.id === slot.id ? "kp-ability-arming" : ""}`}
                    disabled={disabled}
                    onClick={() => onAbility(def)}
                    title={`${def.name} (${def.ramCost} RAM): ${def.desc}${jammed ? " [JAMMED]" : ""}`}
                  >
                    <span className="kp-ability-name">{def.name}</span>
                    <span className="kp-ability-meta">
                      {def.ramCost}R x{slot.copies}
                      {jammed ? " JAM" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {econ.abilityUsed && <p className="kp-rail-dim">Ability spent this turn.</p>}
          </section>

          <button
            type="button"
            className="kp-endturn"
            disabled={!playerTurn}
            onClick={() => dispatch({ type: "endTurn" })}
          >
            END TURN (E)
          </button>
        </aside>
      </div>

      {overloadPick && (
        <div className="kp-overlay kp-overlay-pick">
          <div className="kp-pickbox">
            <h3>OVERLOAD: jam which routine?</h3>
            {cfg.oppKit.map((id) => {
              const def = ABILITY_BY_ID[id];
              if (!def) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    dispatch({
                      type: "ability",
                      id: overloadPick.id,
                      targets: [],
                      abilityTarget: id,
                    });
                    setOverloadPick(null);
                  }}
                >
                  {def.name} <em>{VERB_LABEL[def.verb]}</em>
                </button>
              );
            })}
            <button type="button" className="kp-pick-cancel" onClick={() => setOverloadPick(null)}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {state.phase !== "playing" && (
        <div className="kp-overlay">
          <div className="kp-result">
            {cfg.tutorial ? (
              <>
                <h2 className="kp-result-lost">THE MACHINE SEALS ITSELF</h2>
                <p>
                  Neural Strain zeroed. It watched you learn the controls, then it shut the door.
                  Day one starts at the front counter.
                </p>
              </>
            ) : state.phase === "won" ? (
              <>
                <h2 className="kp-result-won">SIGNAL SEATED</h2>
                <p>
                  {state.winKind === "cap"
                    ? "The link timed out with your route closer to the core. It counts, barely."
                    : "Your route reached the core first. The intrusion collapses behind it."}
                </p>
                {state.strainChip > 0 && (
                  <p className="kp-result-chip">Messy work. Neural Strain -{state.strainChip}.</p>
                )}
              </>
            ) : (
              <>
                <h2 className="kp-result-lost">CORE LOST</h2>
                <p>It reached the core first. Neural Strain zeroes. The run is over.</p>
              </>
            )}
            <button type="button" className="kp-result-btn" onClick={finish}>
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
