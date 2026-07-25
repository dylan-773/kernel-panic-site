import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  playBoom,
  playCascade,
  playStinger,
  playUiPress,
  sfx,
  startDrone,
  stopDrone,
} from "../../game/audio";
import {
  ATTACK_MODE_LABEL,
  ATTACK_WIDTH,
  DEFEND_MODE_LABEL,
  DEFEND_WIDTH,
  OppMode,
  Program,
  SCAN_RANGE,
  attackModeDesc,
  defendModeDesc,
  scanDesc,
} from "../../game/content/kit";
import {
  attackTargetLegal,
  defendTargetLegal,
  programCost,
  tierOf,
} from "../../game/duel-actions";
import { canRotate, routeCost } from "../../game/duel-power";
import { duelReducer } from "../../game/duel-reducer";
import { createDuel } from "../../game/duel-setup";
import { DuelConfig, DuelKit, DuelState, ROUND_CAP } from "../../game/duel-types";
import { DuelBoard } from "./duel-board";

interface Targeting {
  prog: "attack" | "defend";
  mode: OppMode;
  picked: number[];
  want: number;
  label: string;
}

interface Pulse {
  id: number;
  text: string;
  cls: string;
}

/** Center-screen virus-speak when the machine charges a program. */
const VIRUS_LINES: Record<string, string[]> = {
  armHalt: ["DA3M0N R3L3AS3D. H4PPY HUNT1NG >:)", "M1N3S 1N TH3 W1R3S. ST3P L1GHTLY", "S0M3TH1NG SL33PS WH3R3 Y0U W4LK"],
  armSiphon: ["Y0UR R4M T4ST3S B3TT3R TH4N M1N3", "L1TTL3 L33CH, B1G 4PP3T1T3 >:)", "F33D M3"],
  redirect: ["R3R0UT1NG Y0UR L1F3 >:)", "Y0UR W0RK. MY RUL3S", "TW1ST. SN4P. S0RRY N0T S0RRY"],
  lock: ["TH1S 0N3 1S M1N3 N0W", "FR0Z3N S0L1D. TRY 4G41N L4T3R"],
  ward: ["N0 G1FTS 4LL0W3D 1N MY H0US3", "W4RD3D. K33P Y0UR T0YS"],
  purge: ["SW3PT CL34N. N1C3 TRY", "F0UND Y0UR L1TTL3 G1FTS >:)"],
};

interface VirusMsg {
  key: number;
  text: string;
}

export interface DuelFinish {
  won: boolean;
  chip: number;
  capWin: boolean;
}

export interface DuelScreenProps {
  cfg: DuelConfig;
  seed: number;
  kit: DuelKit;
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
    return "Now watch it move. Watch what it plants.";
  }
  const hiddenTrap = s.cells.some((c) => c.trap && c.trap.by === "opp" && !c.trap.revealed);
  const shownTrap = s.cells.some((c) => c.trap && c.trap.by === "opp" && c.trap.revealed);
  if (s.turn === "player" && hiddenTrap) {
    return "It armed something on your lane last cycle. SCAN (1 RAM) sweeps everything near your line. Always scan before you walk.";
  }
  if (s.turn === "player" && shownTrap) {
    return "There it is. DEFEND runs PURGE: cast it, click the exposed trap, and defuse the thing before your flood walks in.";
  }
  if (s.turn === "player") {
    return "Good hands. Scan, defuse, push. Remember the order. It will not save you today, but it will save you.";
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
    case "cascadeRam":
      pulse = mk(`+${n ?? 1} RAM BANKED`, "kp-pulse-good");
      if (soundOn) sfx("overclockCast", { vol: 0.8 });
      break;
    case "trapFire":
      shake = 3;
      pulse = mk("TRAP SPRUNG", "kp-pulse-bad");
      if (soundOn) playBoom();
      break;
    case "siphonFire":
      shake = 2;
      pulse = mk(`SIPHONED ${n ?? 2} RAM`, "kp-pulse-bad");
      if (soundOn) sfx("overloadCast");
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
    case "trace":
      pulse = mk("ROUTE TRACED", "kp-pulse-info");
      break;
    case "purge":
      if (soundOn) sfx("backdoorCast");
      pulse = mk("DEFUSED", "kp-pulse-info");
      break;
    case "lock":
      if (soundOn) sfx("shieldCast");
      break;
    case "ward":
      if (soundOn) sfx("firewallCast");
      pulse = mk("WARDED", "kp-pulse-info");
      break;
    default:
      break;
  }
  return { shake, pulse };
}

export function DuelScreen(props: DuelScreenProps) {
  const { cfg, seed, kit, ramPerTurn, onFinish, soundOn } = props;
  const [state, dispatch] = useReducer(
    duelReducer,
    undefined,
    () => createDuel(cfg, seed, kit, ramPerTurn),
  );
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [infoProg, setInfoProg] = useState<Program | null>(null);
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
        const mode = e.kind.slice(8);
        const lines = VIRUS_LINES[mode] ?? VIRUS_LINES.armHalt;
        setVirus({ key: e.id, text: lines[Math.floor(Math.random() * lines.length)] });
        if (mode === "armHalt" || mode === "armSiphon") setSweep((n) => n + 1);
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
        if (targeting.prog === "attack" && attackTargetLegal(state, "player", targeting.mode, i)) out.add(i);
        if (
          targeting.prog === "defend" &&
          defendTargetLegal(state, "player", state.kit.defendMode, i)
        )
          out.add(i);
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

  const traced = useMemo(
    () => new Set(state.routeTrace?.cells ?? []),
    [state.routeTrace],
  );

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
        dispatch({ type: "cast", prog: targeting.prog, targets: picked });
        setTargeting(null);
      } else {
        setTargeting({ ...targeting, picked });
      }
      return;
    }
    dispatch({ type: "rotate", idx });
  };

  const onProgram = (prog: Program) => {
    if (!playerTurn || econ.used[prog]) return;
    if (soundOn) playUiPress();
    if (prog === "scan") {
      dispatch({ type: "cast", prog: "scan", targets: [] });
      return;
    }
    if (prog === "attack") {
      const mode = state.kit.attackMode;
      setTargeting({
        prog: "attack",
        mode,
        picked: [],
        want: ATTACK_WIDTH[tierOf(state, "player", "attack")],
        label: ATTACK_MODE_LABEL[mode],
      });
      return;
    }
    const mode = state.kit.defendMode;
    setTargeting({
      prog: "defend",
      mode,
      picked: [],
      want: mode === "ward" ? 1 : DEFEND_WIDTH[tierOf(state, "player", "defend")],
      label: DEFEND_MODE_LABEL[mode],
    });
  };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish({
      won: state.phase === "won",
      chip: state.strainChip,
      capWin: state.winKind === "cap",
    });
  };

  const coach = coachLine(state);
  const oppEcon = state.econ.opp;
  const banked = econ.drainNext < 0 ? -econ.drainNext : 0;

  const programInfo = (prog: Program): { title: string; desc: string } => {
    if (prog === "scan") {
      const t = tierOf(state, "player", "scan");
      return { title: `SCAN.EXE T${t} - range ${SCAN_RANGE[t] >= 99 ? "FULL" : SCAN_RANGE[t]}`, desc: scanDesc(t) };
    }
    if (prog === "attack") {
      const t = tierOf(state, "player", "attack");
      return {
        title: `ATTACK.EXE T${t} - ${ATTACK_MODE_LABEL[state.kit.attackMode]}`,
        desc: attackModeDesc(state.kit.attackMode, t),
      };
    }
    const t = tierOf(state, "player", "defend");
    return {
      title: `DEFEND.EXE T${t} - ${DEFEND_MODE_LABEL[state.kit.defendMode]}`,
      desc: defendModeDesc(state.kit.defendMode, t),
    };
  };

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
            traced={traced}
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
                {targeting.label}: pick {targeting.want - targeting.picked.length} target
                {targeting.want - targeting.picked.length === 1 ? "" : "s"}
              </span>
              {targeting.picked.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: "cast", prog: targeting.prog, targets: targeting.picked });
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
          {state.oppNextIntent && state.turn === "opp" && (
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
            {banked > 0 && <i className="kp-dock-banked">+{banked} NEXT</i>}
          </span>
          <div className="kp-ram-pips">
            {Array.from({ length: Math.max(econ.ramPerTurn + 3, econ.ram) }).map((_, i) => (
              <span key={i} className={i < econ.ram && playerTurn ? "kp-pip kp-pip-on" : "kp-pip"} />
            ))}
          </div>
        </div>

        <div className="kp-dock-abilities">
          {(["scan", "attack", "defend"] as Program[]).map((prog) => {
            const cost = programCost(state, "player", prog);
            const disabled = !playerTurn || econ.used[prog] || econ.ram < cost;
            const sub =
              prog === "scan"
                ? `R${SCAN_RANGE[tierOf(state, "player", "scan")] >= 99 ? "∞" : SCAN_RANGE[tierOf(state, "player", "scan")]}`
                : prog === "attack"
                  ? ATTACK_MODE_LABEL[state.kit.attackMode]
                  : DEFEND_MODE_LABEL[state.kit.defendMode];
            const tier = tierOf(state, "player", prog);
            return (
              <button
                key={prog}
                type="button"
                className={`kp-ability kp-prog-${prog} ${targeting?.prog === prog ? "kp-ability-arming" : ""}`}
                disabled={disabled}
                onClick={() => onProgram(prog)}
                onMouseEnter={() => setInfoProg(prog)}
                onMouseLeave={() => setInfoProg(null)}
                onFocus={() => setInfoProg(prog)}
                onBlur={() => setInfoProg(null)}
              >
                <span className="kp-ability-name">
                  {prog.toUpperCase()}
                  <i className="kp-prog-tier">{"▪".repeat(tier)}</i>
                </span>
                <span className="kp-ability-meta">
                  {sub} - {cost}R{econ.used[prog] ? " USED" : ""}
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

      {infoProg && (
        <div className="kp-ability-info">
          <strong>{programInfo(infoProg).title}</strong>
          <p>{programInfo(infoProg).desc}</p>
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
