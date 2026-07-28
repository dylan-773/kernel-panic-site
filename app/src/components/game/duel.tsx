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
import { tip, tutorialLine } from "../../game/content/teaching";
import {
  attackTargetLegal,
  defendTargetLegal,
  programCost,
  programUnlocked,
  tierOf,
} from "../../game/duel-actions";
import { Teach } from "./teach";
import { TapTip, useLongPress } from "./tap-tip";
import { canPlace, canRotate, routeCost } from "../../game/duel-power";
import { duelReducer } from "../../game/duel-reducer";
import { createDuel } from "../../game/duel-setup";
import { DuelConfig, DuelKit, DuelState, ROUND_CAP } from "../../game/duel-types";
import { DuelBoard } from "./duel-board";
import { PatchGlyph } from "./patch-glyph";

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
  /** Neither side could route; the player won the collapse. */
  gridlockWin: boolean;
  /** The pouch as the dive left it (spent pieces already gone). */
  pouchLeft: number[];
  /** The two inputs behind the chip, so the result row can itemize it. */
  overRotations: number;
  trapsFired: number;
  /** Ledger-only tallies for this dive. Nothing in the rules reads these. */
  scans: number;
  attackCasts: number;
  defendCasts: number;
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

/**
 * The bench's running commentary through the opening dive. The ladder itself
 * lives in `content/teaching.ts`; this only reads the duel state into the
 * shape it tests against.
 */
function coachLine(s: DuelState): string | null {
  if (!s.cfg.tutorial || s.phase !== "playing") return null;
  return tutorialLine({
    turn: s.turn,
    round: s.round,
    ownedNodes: s.cells.filter((c) => c.kind === "node" && c.owner === "player").length,
    scanned: s.tutFlags.scanned,
    purged: s.tutFlags.purged,
    attacked: s.tutFlags.attacked,
    trapShown: s.cells.some((c) => c.trap && c.trap.by === "opp" && c.trap.revealed),
  });
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
    case "cascadeOpp":
      shake = 1;
      pulse = mk(`IT CLAIMED x${n ?? 2}`, "kp-pulse-bad");
      if (soundOn) sfx("claimTick", { vol: 0.5, rate: 0.7 });
      break;
    case "claim":
      if (soundOn) playCascade(1);
      break;
    case "claimOpp":
      if (soundOn) sfx("claimTick", { vol: 0.4, rate: 0.7 });
      break;
    case "cascadeRam":
      pulse = mk(`+${n ?? 1} RAM BANKED`, "kp-pulse-good");
      if (soundOn) sfx("overclockCast", { vol: 0.8 });
      break;
    case "cascadeRamOpp":
      // Silent, but never invisible: unexplained banked RAM is why the
      // machine's programs read as free.
      pulse = mk(`IT BANKED +${n ?? 1} RAM`, "kp-pulse-bad");
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
    case "place":
      // Utility placement, not a combat impact: no shake.
      if (soundOn) sfx("patchPlace");
      pulse = mk("PIECE PLACED", "kp-pulse-info");
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
  const [placing, setPlacing] = useState<number | null>(null);
  const [parPopKey, setParPopKey] = useState(0);
  const prevOverRef = useRef(0);
  const [infoProg, setInfoProg] = useState<Program | null>(null);
  const [shake, setShake] = useState<{ mag: number; key: number }>({ mag: 0, key: 0 });
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [virus, setVirus] = useState<VirusMsg | null>(null);
  const [sweep, setSweep] = useState(0);
  // Result panel stood aside so the finished board can be read (and shared).
  const [reviewing, setReviewing] = useState(false);
  // Sticky: the CASCADE lesson is about a claim chain, so it waits for a real
  // one. Banked RAM alone is the wrong tell, since a siphon trap and ECHO TAP
  // bank it too. Sticky because the fx queue drains the frame it arrives.
  const [sawCascade, setSawCascade] = useState(false);
  const finishedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // True only while the ability panel was opened by a hold, so the
  // tap-elsewhere dismiss can never fight the mouse's enter/leave pair.
  const infoByTouch = useRef(false);

  // Three programs, so three fixed hook calls. They cannot live inside the
  // dock's map without breaking the rules of hooks.
  const openInfo = (p: Program) => () => {
    infoByTouch.current = true;
    setInfoProg(p);
  };
  const closeInfo = () => {
    infoByTouch.current = false;
    setInfoProg(null);
  };
  const lpScan = useLongPress({ isOpen: infoProg === "scan", onOpen: openInfo("scan"), onClose: closeInfo });
  const lpAttack = useLongPress({ isOpen: infoProg === "attack", onOpen: openInfo("attack"), onClose: closeInfo });
  const lpDefend = useLongPress({ isOpen: infoProg === "defend", onOpen: openInfo("defend"), onClose: closeInfo });
  const holdInfo: Record<Program, ReturnType<typeof useLongPress>> = {
    scan: lpScan,
    attack: lpAttack,
    defend: lpDefend,
  };

  // A hold-opened panel closes when the next tap lands anywhere else.
  useEffect(() => {
    if (!infoProg || !infoByTouch.current) return;
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      const owner = t && t.closest ? t.closest("[data-prog]") : null;
      if (!owner || owner.getAttribute("data-prog") !== infoProg) {
        infoByTouch.current = false;
        setInfoProg(null);
      }
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [infoProg]);

  const playerTurn = state.phase === "playing" && state.turn === "player";
  /** A program is half placed: targets picked but not yet committed. */
  const arming = targeting !== null || placing !== null;
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

  // How many rotations each port still needs to reach the core. Recomputed
  // every beat, the machine's own steps included: keying this to the round
  // meant a route that closed inside one opponent turn raised no warning at
  // all, and the dive just ended.
  const threat = useMemo(() => {
    if (state.phase !== "playing") return { player: Infinity, opp: Infinity };
    return { player: routeCost(state, "player"), opp: routeCost(state, "opp") };
  }, [state]);

  const oppNear = isFinite(threat.opp) ? threat.opp : 99;
  const playerNear = isFinite(threat.player) ? threat.player : 99;
  const near = Math.min(playerNear, oppNear);
  // Bucketed so the interval restarts on a real change of tension, not on
  // every rotation that shifts the count by one.
  const beatTier = near <= 1 ? 2 : near <= 3 ? 1 : 0;

  // Tension heartbeat when either flood is within reach of the core.
  useEffect(() => {
    if (state.phase !== "playing" || !soundOn || beatTier === 0) return;
    const beat = () => {
      sfx("heartbeat", { vol: beatTier === 2 ? 1 : 0.7, rate: beatTier === 2 ? 1.15 : 1 });
    };
    beat();
    const t = setInterval(beat, beatTier === 2 ? 650 : 950);
    return () => clearInterval(t);
  }, [beatTier, state.phase, soundOn]);

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
      // Emitted only for a player claim chain of four or more, which is the
      // one thing the CASCADE callout describes.
      if (e.kind === "cascadeRam") setSawCascade(true);
      // Over-par rotations click on top of the normal rotate sound.
      if (
        e.kind === "rotate" &&
        soundOn &&
        state.turn === "player" &&
        state.econ.player.rotations > state.par
      ) {
        sfx("overParTick", { jitter: 0.05 });
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
      // Two at a time. Four stacked labels on top of a toast, a virus banner
      // and the coach line is more than a busy turn can be read through.
      setPulses((p) => [...p, ...newPulses].slice(-2));
    }
    dispatch({ type: "fxDrain", upTo: state.fx[state.fx.length - 1].id });
  }, [state.fx, soundOn]);

  /**
   * Replay the shake without remounting. The root used to carry
   * `key={shake.key}`, so every single shake tore down and rebuilt the whole
   * duel tree: the notice toast, the impact pulses, the virus banner and
   * every claim pop restarted their entrance animations from zero. A stale
   * "TRAP SPRUNG" toast therefore reappeared on each later shake, which read
   * as traps firing that never fired.
   */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || shake.mag === 0 || shake.key === 0) return;
    el.style.animation = "none";
    void el.offsetHeight;
    el.style.animation = "";
  }, [shake.key, shake.mag]);

  // Virus banners burn out on their own.
  useEffect(() => {
    if (!virus) return;
    const t = setTimeout(() => setVirus(null), 2400);
    return () => clearTimeout(t);
  }, [virus]);

  // The par readout pops exactly once, at the rotation that crosses it.
  const overPar = state.econ.player.rotations - state.par;
  useEffect(() => {
    if (overPar > 0 && prevOverRef.current <= 0) setParPopKey((k) => k + 1);
    prevOverRef.current = overPar;
  }, [overPar]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setTargeting(null);
        setPlacing(null);
      } else if (e.code === "KeyE" && playerTurn && !targeting && placing === null) {
        dispatch({ type: "endTurn" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerTurn, targeting, placing]);

  // Legal cells for the current interaction.
  const legal = useMemo(() => {
    const out = new Set<number>();
    if (!playerTurn) return out;
    if (placing !== null) {
      if (econ.ram < 1) return out;
      for (let i = 0; i < state.cells.length; i++) {
        if (canPlace(state, "player", i)) out.add(i);
      }
      return out;
    }
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
  }, [state, playerTurn, targeting, placing, econ.ram]);

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
    if (placing !== null) {
      dispatch({ type: "place", idx, pouchIdx: placing, mask: state.patchPouch[placing] });
      setPlacing(null);
      return;
    }
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
    if (infoProg) closeInfo();
    if (soundOn) playUiPress();
    setPlacing(null);
    // Any program press abandons the one being aimed. Leaving it live meant
    // casting SCAN with ATTACK armed kept the board in attack-target
    // highlighting, which under REDIRECT lights nearly every node and buries
    // the traps and the TAP LINE trace the scan just exposed.
    setTargeting(null);
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
      gridlockWin: state.winKind === "gridlock",
      pouchLeft: state.patchPouch,
      // Mirrors finishDuel's own inputs (duel-actions.ts), so the result
      // screen redisplays the bill rather than re-deriving it.
      overRotations: Math.max(0, state.econ.player.rotations - state.par),
      trapsFired: state.econ.player.trapsFired,
      scans: state.econ.player.scansCast,
      attackCasts: state.econ.player.attacksCast,
      defendCasts: state.econ.player.defendsCast,
    });
  };

  const coach = coachLine(state);
  const oppEcon = state.econ.opp;
  const banked = econ.drainNext < 0 ? -econ.drainNext : 0;
  const oppBanked = oppEcon.drainNext < 0 ? -oppEcon.drainNext : 0;

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
      ref={rootRef}
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
          <TapTip text={tip("par")}>
            <span
              key={parPopKey}
              className={`kp-osk-item kp-par ${overPar > 0 ? "kp-par-over" : ""} ${parPopKey > 0 ? "kp-par-warn-pop" : ""}`}
            >
              PAR {econ.rotations}/{state.par}
              {overPar > 0 && <i className="kp-par-over-tag">+{overPar} OVER</i>}
            </span>
          </TapTip>
          <div className="kp-strain">
            <TapTip text={tip("strain")}>
              <span>STRAIN</span>
            </TapTip>
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
            ghostMask={placing !== null ? (state.patchPouch[placing] ?? null) : null}
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
          <div className="kp-topstack">
            {playerNear >= 99 && state.phase === "playing" && (
              <div className="kp-threat kp-threat-max" aria-live="assertive">
                NO ROUTE FROM YOUR PORT TO THE CORE
              </div>
            )}
            {oppNear <= 2 && state.phase === "playing" && (
              <div className={`kp-threat ${oppNear === 0 ? "kp-threat-max" : ""}`} aria-live="assertive">
                {oppNear === 0
                  ? "ITS ROUTE IS OPEN TO THE CORE"
                  : `INTRUSION ${oppNear} ROTATION${oppNear === 1 ? "" : "S"} FROM THE CORE`}
              </div>
            )}
            {state.notice && (
              <div key={state.notice.id} className="kp-toast">
                {state.notice.text}
              </div>
            )}
          </div>
          {coach && <div className="kp-coach">{coach}</div>}
          <Teach id="par-budget" signals={{ overPar: overPar > 0 }} />
          <Teach id="cascade-bank" signals={{ cascadeBanked: sawCascade }} />
          <Teach id="patch-cell-use" signals={{ holdingCells: state.patchPouch.length > 0 }} />
          {placing !== null && state.patchPouch[placing] !== undefined && (
            <div className="kp-targetbar">
              <span className="kp-targetbar-glyph">
                <PatchGlyph mask={state.patchPouch[placing]} size={18} />
              </span>
              <span>
                {legal.size > 0
                  ? "PATCH PIECE: pick a slag block within reach (2 RAM)"
                  : "PATCH PIECE: no slag block in reach"}
              </span>
              <button type="button" onClick={() => setPlacing(null)}>
                CANCEL (ESC)
              </button>
            </div>
          )}
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
          {/* Live RAM, not just the per-turn rate. A cascade banks RAM into
              the machine's next turn, so a turn where it also ran a program
              could still show the same number of moves: with only the rate
              on screen, its programs looked free. */}
          <div className="kp-rail-row">
            <span>RAM</span>
            <em>
              {state.turn === "opp" ? oppEcon.ram : oppEcon.ramPerTurn}
              <i className="kp-rail-sub">/{oppEcon.ramPerTurn} per turn</i>
            </em>
          </div>
          {oppBanked > 0 && (
            <div className="kp-rail-row kp-rail-row-warn">
              <span>BANKED</span>
              <em>+{oppBanked} next turn</em>
            </div>
          )}
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
          <TapTip text={tip("ram")}>
            <span className="kp-dock-label">
              RAM <em>{playerTurn ? econ.ram : 0}</em>
              {banked > 0 && <i className="kp-dock-banked">+{banked} NEXT</i>}
            </span>
          </TapTip>
          <div className="kp-ram-pips">
            {Array.from({ length: Math.max(econ.ramPerTurn + 3, econ.ram) }).map((_, i) => (
              <span key={i} className={i < econ.ram && playerTurn ? "kp-pip kp-pip-on" : "kp-pip"} />
            ))}
          </div>
        </div>

        <div className="kp-dock-abilities">
          {(["scan", "attack", "defend"] as Program[]).map((prog) => {
            const cost = programCost(state, "player", prog);
            const offline = !programUnlocked(state, prog);
            const disabled = !playerTurn || offline || econ.used[prog] || econ.ram < cost;
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
                className={`kp-ability kp-prog-${prog} ${targeting?.prog === prog ? "kp-ability-arming" : ""} ${offline ? "kp-prog-offline" : ""}`}
                data-prog={prog}
                disabled={disabled}
                onClick={() => onProgram(prog)}
                onMouseEnter={() => setInfoProg(prog)}
                onMouseLeave={() => setInfoProg(null)}
                onFocus={() => setInfoProg(prog)}
                onBlur={() => setInfoProg(null)}
                {...holdInfo[prog]}
              >
                <span className="kp-ability-name">
                  {prog.toUpperCase()}
                  <i className="kp-prog-tier">{"▪".repeat(tier)}</i>
                </span>
                <span className="kp-ability-meta">
                  {offline ? "OFFLINE" : `${sub} - ${cost}R${econ.used[prog] ? " USED" : ""}`}
                </span>
              </button>
            );
          })}
        </div>

        {!cfg.tutorial && (
          <div
            className={`kp-ability kp-prog-place kp-pouch-strip ${placing !== null ? "kp-ability-arming" : ""} ${state.patchPouch.length < 1 ? "kp-prog-offline" : ""}`}
          >
            <span className="kp-ability-name">
              PATCH {state.patchPouch.length > 0 && <i className="kp-prog-tier">x{state.patchPouch.length}</i>}
            </span>
            {state.patchPouch.length < 1 ? (
              <span className="kp-ability-meta">NONE HELD</span>
            ) : (
              <span className="kp-pouch-glyphs">
                {state.patchPouch.map((mask, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`kp-pouch-piece ${placing === i ? "kp-pouch-piece-armed" : ""}`}
                    disabled={!playerTurn || econ.placedThisTurn || econ.ram < 2}
                    title={econ.placedThisTurn ? "One piece per turn" : "Place this piece (2 RAM)"}
                    onClick={() => {
                      if (soundOn) playUiPress();
                      setTargeting(null);
                      setPlacing((p) => (p === i ? null : i));
                    }}
                  >
                    <PatchGlyph mask={mask} size={20} dim={econ.placedThisTurn} />
                  </button>
                ))}
              </span>
            )}
          </div>
        )}

        {/* Locked out mid cast: ending the turn with a program armed threw
            the cast away, and the button gave no sign it would. */}
        <button
          type="button"
          className={`kp-endturn ${arming ? "kp-endturn-held" : ""}`}
          disabled={!playerTurn || arming}
          title={arming ? "Finish or cancel the program you are placing first" : undefined}
          onClick={() => {
            if (soundOn) playUiPress();
            dispatch({ type: "endTurn" });
          }}
        >
          {arming ? "PLACING..." : "END TURN (E)"}
        </button>
      </footer>

      {infoProg && (
        <div className="kp-ability-info">
          <strong>{programInfo(infoProg).title}</strong>
          <p>{programInfo(infoProg).desc}</p>
        </div>
      )}

      {/* Board review. The final board is already fully rendered underneath
          with every trap revealed (see DuelBoard's trapVisible); only this
          panel was hiding it, so a loss could never be read back. */}
      {state.phase !== "playing" && reviewing && (
        <div className="kp-reviewbar">
          <span>
            FINAL BOARD.{" "}
            {state.winKind === "severed"
              ? "Your territory has no open corridor left to the core."
              : "Every trap on the grid is exposed."}
          </span>
          <button type="button" onClick={() => setReviewing(false)}>
            BACK TO RESULT
          </button>
        </div>
      )}

      {state.phase !== "playing" && !reviewing && (
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
                <h2 className="kp-result-won">
                  {state.winKind === "gridlock" ? "LINK COLLAPSED" : "CORE SEIZED"}
                </h2>
                <p>{state.endReason ?? "Your flood touched the core first. The intrusion collapses."}</p>
                {state.strainChip > 0 && (
                  <p className="kp-result-chip">Messy work. Neural Strain -{state.strainChip}.</p>
                )}
              </>
            ) : (
              <>
                <h2 className="kp-result-lost">
                  {state.winKind === "severed" ? "ROUTE SEVERED" : "CORE LOST"}
                </h2>
                <p>{state.endReason ?? "Its flood got there first."}</p>
                <p>Neural Strain zeroes. The run is over.</p>
              </>
            )}
            <div className="kp-result-actions">
              <button
                type="button"
                className="kp-result-btn kp-result-btn-ghost"
                onClick={() => setReviewing(true)}
              >
                VIEW BOARD
              </button>
              <button type="button" className="kp-result-btn" onClick={finish}>
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
