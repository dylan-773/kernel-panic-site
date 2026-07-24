import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  playBoom,
  playCascade,
  playFx,
  playStinger,
  playUiPress,
  sfx,
  startDrone,
  stopDrone,
} from "../../game/audio";
import { ABILITY_BY_ID, VERB_LABEL } from "../../game/content/abilities";
import {
  armTargetLegal,
  redirectTargetLegal,
  shieldTargetLegal,
} from "../../game/duel-actions";
import { canRotate, routeCost } from "../../game/duel-power";
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
import { DuelBoard } from "./duel-board";

interface Targeting {
  def: AbilityDef;
  mode: "arm" | "redirect" | "shield";
  picked: number[];
  want: number;
}

interface Pulse {
  id: number;
  text: string;
  cls: string;
}

/** Center-screen virus-speak when the machine charges a routine. */
const VIRUS_LINES: Record<string, string[]> = {
  arm: ["DA3M0N R3L3AS3D. H4PPY HUNT1NG >:)", "M1N3S 1N TH3 W1R3S. ST3P L1GHTLY", "S0M3TH1NG SL33PS WH3R3 Y0U W4LK"],
  redirect: ["R3R0UT1NG Y0UR L1F3 >:)", "Y0UR W0RK. MY RUL3S", "TW1ST. SN4P. S0RRY N0T S0RRY"],
  shield: ["TH1S 0N3 1S M1N3 N0W", "FR0Z3N S0L1D. TRY 4G41N L4T3R"],
  overload: ["T00LS D0WN, K1DD0 >:)", "N0 T0YS F0R Y0U TH1S TURN"],
  overclock: ["F33D1NG CYCL3S. GR0W1NG STR0NG", "MMM. R4M"],
  firewall: ["W4LLS UP. KN0CK 4LL Y0U W4NT", "N0 3NTRY. N0 3XC3PT10NS"],
  backdoor: ["SW3PT CL34N. N1C3 TRY", "F0UND Y0UR L1TTL3 G1FTS >:)"],
  scan: ["1 S33 3V3RYTH1NG Y0U H1D", "P33K4B00"],
};

interface VirusMsg {
  key: number;
  text: string;
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
  soundOn: boolean;
  onFinish: (r: DuelFinish) => void;
  onToggleSound: () => void;
}

function coachLine(s: DuelState): string | null {
  if (!s.cfg.tutorial || s.phase !== "playing") return null;
  const owned = s.cells.filter((c) => c.kind === "node" && c.owner === "player").length;
  if (s.turn === "player" && s.round === 1 && owned <= 2) {
    return "The grid is live. Click a glowing junction to rotate it (1 RAM). Line the pipes up and your signal floods forward on its own.";
  }
  if (s.turn === "player" && s.round === 1) {
    return "Chain rotations toward the CORE. When a junction clicks into line, everything connected claims at once. Spend your RAM, then END TURN.";
  }
  if (s.turn === "opp" && s.round === 1) {
    return "Now watch how much it can afford per turn.";
  }
  return "Reach the core first. That is the whole game. It is just faster than you, today.";
}

/** fx → screen shake magnitude, impact label, and sound. */
function fxJuice(kind: string, n: number | undefined, soundOn: boolean): { shake: number; pulse: Pulse | null } {
  let shake = 0;
  let pulse: Pulse | null = null;
  const mk = (text: string, cls: string): Pulse => ({ id: 0, text, cls });
  switch (kind) {
    case "cascade":
      shake = n && n >= 5 ? 2 : 1;
      pulse = mk(`CASCADE x${n ?? 2}`, "kp-pulse-good");
      if (soundOn) playCascade(n ?? 2);
      break;
    case "claim":
      if (soundOn) playCascade(1);
      break;
    case "trapFire":
      shake = 3;
      pulse = mk("TRAP SPRUNG", "kp-pulse-bad");
      if (soundOn) playBoom();
      break;
    case "turnLost":
      shake = 2;
      pulse = mk("TURN LOST", "kp-pulse-bad");
      if (soundOn) playBoom();
      break;
    case "win":
      shake = 3;
      if (soundOn) playStinger(true);
      break;
    case "lose":
      shake = 3;
      if (soundOn) playStinger(false);
      break;
    case "redirect":
      shake = 1;
      if (soundOn) sfx("redirect", { jitter: 0.03 });
      break;
    case "rotate":
      if (soundOn) sfx("rotate", { jitter: 0.06 });
      break;
    case "deny":
      if (soundOn) sfx("deny");
      break;
    case "endTurn":
      if (soundOn) sfx("endTurn");
      break;
    case "trapSet":
      if (soundOn) sfx("trapSet");
      break;
    case "scan":
      if (soundOn) sfx("scanCast");
      pulse = mk("SCANNED", "kp-pulse-info");
      break;
    case "shield":
      if (soundOn) sfx("shieldCast");
      break;
    case "overload":
      if (soundOn) sfx("overloadCast");
      pulse = mk("JAMMED", "kp-pulse-info");
      break;
    case "overclock":
      if (soundOn) sfx("overclockCast");
      break;
    case "firewall":
      if (soundOn) sfx("firewallCast");
      pulse = mk("FIREWALL UP", "kp-pulse-info");
      break;
    case "backdoor":
      if (soundOn) sfx("backdoorCast");
      break;
    default:
      break;
  }
  return { shake, pulse };
}

export function DuelScreen(props: DuelScreenProps) {
  const { cfg, seed, equipped, ramPerTurn, onFinish, soundOn } = props;
  const [state, dispatch] = useReducer(
    duelReducer,
    undefined,
    () => createDuel(cfg, seed, equipped, ramPerTurn),
  );
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [overloadPick, setOverloadPick] = useState<AbilityDef | null>(null);
  const [infoDef, setInfoDef] = useState<AbilityDef | null>(null);
  const [shake, setShake] = useState<{ mag: number; key: number }>({ mag: 0, key: 0 });
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [virus, setVirus] = useState<VirusMsg | null>(null);
  const [sweep, setSweep] = useState(0);
  const finishedRef = useRef(false);

  const playerTurn = state.phase === "playing" && state.turn === "player";
  const econ = state.econ.player;

  // Opponent moves on a readable cadence, with a low presence drone.
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== "opp") return;
    if (soundOn) startDrone();
    const t = setInterval(() => dispatch({ type: "oppStep" }), 420);
    return () => {
      clearInterval(t);
      stopDrone();
    };
  }, [state.phase, state.turn, soundOn]);

  // Tension heartbeat when either flood is within reach of the core.
  useEffect(() => {
    if (state.phase !== "playing" || !soundOn) return;
    const pc = routeCost(state, "player");
    const oc = routeCost(state, "opp");
    const near = Math.min(isFinite(pc) ? pc : 99, isFinite(oc) ? oc : 99);
    if (near > 3) return;
    const beat = () => {
      sfx("heartbeat", { vol: near <= 1 ? 1 : 0.7, rate: near <= 1 ? 1.15 : 1 });
    };
    beat();
    const t = setInterval(beat, near <= 1 ? 650 : 950);
    return () => clearInterval(t);
  }, [state.round, state.turn, state.phase, soundOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Juice: drain the fx queue into sound, shake, and impact labels.
  useEffect(() => {
    if (state.fx.length === 0) return;
    let maxShake = 0;
    const newPulses: Pulse[] = [];
    for (const e of state.fx) {
      if (e.kind === "oppAim") {
        if (soundOn) sfx("aim", { jitter: 0.04 });
        continue;
      }
      if (e.kind.startsWith("oppCast:")) {
        const verb = e.kind.slice(8);
        const lines = VIRUS_LINES[verb] ?? VIRUS_LINES.arm;
        setVirus({ key: e.id, text: lines[Math.floor(Math.random() * lines.length)] });
        if (verb === "arm") setSweep((n) => n + 1);
        if (soundOn) sfx("virusSting");
        maxShake = Math.max(maxShake, 1);
        continue;
      }
      const j = fxJuice(e.kind, e.n, soundOn);
      maxShake = Math.max(maxShake, j.shake);
      if (j.pulse) newPulses.push({ ...j.pulse, id: e.id });
    }
    if (maxShake > 0) setShake((sh) => ({ mag: maxShake, key: sh.key + 1 }));
    if (newPulses.length > 0) {
      setPulses((p) => [...p.slice(-3), ...newPulses]);
    }
    dispatch({ type: "fxDrain", upTo: state.fx[state.fx.length - 1].id });
  }, [state.fx, soundOn]);

  // Virus banners burn out on their own.
  useEffect(() => {
    if (!virus) return;
    const t = setTimeout(() => setVirus(null), 2400);
    return () => clearTimeout(t);
  }, [virus]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setTargeting(null);
        setOverloadPick(null);
      } else if (e.code === "KeyE" && playerTurn && !targeting) {
        dispatch({ type: "endTurn" });
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
        if (targeting.mode === "shield" && shieldTargetLegal(state, "player", i)) out.add(i);
      }
      return out;
    }
    if (econ.ram < 1) return out;
    for (let i = 0; i < state.cells.length; i++) {
      if (canRotate(state, "player", i)) out.add(i);
    }
    return out;
  }, [state, playerTurn, targeting, econ.ram]);

  const aimed = useMemo(() => {
    const a = state.oppTurn.aim;
    if (!a || state.phase !== "playing") return new Set<number>();
    return new Set(a.kind === "rotate" ? [a.idx] : a.targets);
  }, [state.oppTurn.aim, state.phase]);

  const armedCount = useMemo(
    () => state.cells.filter((c) => c.trap && c.trap.by === "opp").length,
    [state.cells],
  );
  const revealedCount = useMemo(
    () => state.cells.filter((c) => c.trap && c.trap.by === "opp" && c.trap.revealed).length,
    [state.cells],
  );

  const onCell = (idx: number) => {
    if (!playerTurn) return;
    if (targeting) {
      const picked = [...targeting.picked, idx];
      if (picked.length >= targeting.want) {
        dispatch({ type: "ability", id: targeting.def.id, targets: picked });
        setTargeting(null);
      } else {
        setTargeting({ ...targeting, picked });
      }
      return;
    }
    dispatch({ type: "rotate", idx });
  };

  const onAbility = (def: AbilityDef) => {
    if (!playerTurn || econ.abilityUsed) return;
    if (soundOn) playUiPress();
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
        if (def.p.shieldRounds) setTargeting({ def, mode: "shield", picked: [], want: 1 });
        else dispatch({ type: "ability", id: def.id, targets: [] });
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
  const oppEcon = state.econ.opp;

  return (
    <div
      key={shake.key}
      className={`kp-dive2 ${shake.mag > 0 ? `kp-shake-${shake.mag}` : ""}`}
    >
      <header className="kp-dive2-top">
        <div className="kp-dive2-job">
          <strong>{props.jobTitle}</strong>
          <span>{props.jobSub}</span>
        </div>
        <div className="kp-dive2-osk">
          <span className="kp-osk-item">DAY {props.day === 0 ? "--" : props.day}</span>
          <span className="kp-osk-item">
            R{Math.min(state.round, ROUND_CAP)}/{ROUND_CAP}
          </span>
          <div className="kp-strain" title="Neural Strain">
            <span>STRAIN</span>
            <div className="kp-strain-bar">
              <div className="kp-strain-fill" style={{ width: `${props.strain}%` }} />
            </div>
          </div>
          <button type="button" className="kp-osk-btn" onClick={props.onToggleSound}>
            SND {soundOn ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      <div className="kp-dive2-stage">
        <div className="kp-dive2-boardwrap">
          <DuelBoard
            state={state}
            legal={legal}
            selected={new Set(targeting?.picked ?? [])}
            aimed={aimed}
            onCell={onCell}
          />
          {sweep > 0 && <div key={`sw-${sweep}`} className="kp-sweep" aria-hidden="true" />}
          {virus && (
            <div key={virus.key} className="kp-virus" aria-live="polite">
              {virus.text}
            </div>
          )}
          <div className="kp-pulses" aria-hidden="true">
            {pulses.map((p) => (
              <div key={p.id} className={`kp-pulse ${p.cls}`}>
                {p.text}
              </div>
            ))}
          </div>
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
                    dispatch({ type: "ability", id: targeting.def.id, targets: targeting.picked });
                    setTargeting(null);
                  }}
                >
                  CAST NOW
                </button>
              )}
              <button type="button" onClick={() => setTargeting(null)}>
                CANCEL (ESC)
              </button>
            </div>
          )}
        </div>

        <aside className="kp-dive2-opp">
          <h3>INTRUSION</h3>
          <div className="kp-rail-row">
            <span>RAM/TURN</span>
            <em>{oppEcon.ramPerTurn}</em>
          </div>
          <div className="kp-rail-row">
            <span>ARMED NODES</span>
            <em>{armedCount > 0 ? `${armedCount}${revealedCount < armedCount ? " (hidden)" : ""}` : "0"}</em>
          </div>
          {props.dominantTell && <p className="kp-rail-tell">{props.dominantTell}</p>}
          {state.intentRevealed && state.oppNextIntent && (
            <p className="kp-rail-intent">INTENT: {state.oppNextIntent}</p>
          )}
          <div className={state.turn === "opp" ? "kp-turnlight kp-turnlight-on" : "kp-turnlight"}>
            {state.turn === "opp" ? "IT IS MOVING" : "HOLDING"}
          </div>
        </aside>
      </div>

      <footer className="kp-dive2-dock">
        <div className="kp-dock-ram">
          <span className="kp-dock-label">
            RAM <em>{playerTurn ? econ.ram : 0}</em>
          </span>
          <div className="kp-ram-pips">
            {Array.from({ length: Math.max(econ.ramPerTurn + 3, econ.ram) }).map((_, i) => (
              <span key={i} className={i < econ.ram && playerTurn ? "kp-pip kp-pip-on" : "kp-pip"} />
            ))}
          </div>
        </div>

        <div className="kp-dock-abilities">
          {state.equipped.length === 0 && <span className="kp-rail-dim">No loadout</span>}
          {state.equipped.map((slot) => {
            const def = ABILITY_BY_ID[slot.id];
            if (!def) return null;
            const jammed = slot.id in econ.disabled;
            const disabled =
              !playerTurn || slot.copies < 1 || econ.abilityUsed || jammed || econ.ram < def.ramCost;
            return (
              <button
                key={slot.id}
                type="button"
                className={`kp-ability ${targeting?.def.id === slot.id ? "kp-ability-arming" : ""}`}
                disabled={disabled}
                onClick={() => onAbility(def)}
                onMouseEnter={() => setInfoDef(def)}
                onMouseLeave={() => setInfoDef(null)}
                onFocus={() => setInfoDef(def)}
                onBlur={() => setInfoDef(null)}
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

        <button
          type="button"
          className="kp-endturn"
          disabled={!playerTurn}
          onClick={() => {
            if (soundOn) playUiPress();
            dispatch({ type: "endTurn" });
          }}
        >
          END TURN (E)
        </button>
      </footer>

      {infoDef && (
        <div className="kp-ability-info">
          <strong>
            {infoDef.name} <em>T{infoDef.tier} {VERB_LABEL[infoDef.verb]} - {infoDef.ramCost} RAM</em>
          </strong>
          <p>{infoDef.desc}</p>
        </div>
      )}

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
                    dispatch({ type: "ability", id: overloadPick.id, targets: [], abilityTarget: id });
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
          <div className={`kp-result ${state.phase === "won" ? "kp-result-w" : "kp-result-l"}`}>
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
                <h2 className="kp-result-won">CORE SEIZED</h2>
                <p>
                  {state.winKind === "cap"
                    ? "The link timed out with your route closer. It counts, barely."
                    : "Your flood touched the core first. The intrusion collapses."}
                </p>
                {state.strainChip > 0 && (
                  <p className="kp-result-chip">Messy work. Neural Strain -{state.strainChip}.</p>
                )}
              </>
            ) : (
              <>
                <h2 className="kp-result-lost">CORE LOST</h2>
                <p>Its flood got there first. Neural Strain zeroes. The run is over.</p>
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
