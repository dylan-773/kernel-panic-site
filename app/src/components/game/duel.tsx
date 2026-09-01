import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  MODE_LABEL,
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
import { canPlace, canRotate, goalLive, reachOf, routeCost } from "../../game/duel-power";
import { duelReducer } from "../../game/duel-reducer";
import { createDuel } from "../../game/duel-setup";
import { DuelConfig, DuelKit, DuelState, ROUND_CAP, Side, isJunction } from "../../game/duel-types";
import { PLACE_COST } from "../../game/patch-cells";
import { customerById } from "./screens";
import { deviceMacroFor } from "../os/roster-art";
import { DuelBoard } from "./duel-board";
import { PatchGlyph } from "./patch-glyph";

/**
 * DIVE.EXE: the split-board duel as a full-screen instrument panel. The
 * board is a circuit schematic framed by the ship-diagnostic OS anatomy:
 * solid-ink title strip, breadcrumb with the 25-segment round meter,
 * program keys and BUS.LOG on the left rail, telemetry on the right, and
 * a full-width console strip that typewriters engine notices and hosts
 * CAST NOW / CANCEL. The machine is monochrome support-tone glitch, never
 * a second hue; danger is inverse video; no surface prints either side's
 * rotation distance to the core.
 */

/** The machine's port tag: a diagnostic classification, not a name
 * (lore ledger ruling 11 cleared the SIG-0 rename). */
/** Full telegraph beat: the machine is showing you something. */
const OPP_BEAT_MS = 520;
/** Executing an already-telegraphed rotation. Twists are the cheap beat. */
const OPP_ROTATE_MS = 170;

/**
 * Extra time to hold after a beat that actually did something, keyed on the
 * fx it emitted. A rotation is legible at a glance; a trap going off, a
 * junction being twisted out from under you, or a clamp landing is a state
 * change you have to read and then decide about, and at a flat cadence those
 * got the same 170ms as a twist. Held here rather than by slowing everything
 * down, so an ordinary turn still moves.
 */
const FX_HOLD_MS: Record<string, number> = {
  // Something fired at you. The longest holds in the game.
  trapFire: 1100,
  siphonFire: 1100,
  turnLost: 1200,
  // Something landed on a board.
  redirect: 800,
  trapSet: 750,
  purge: 700,
  lock: 700,
  ward: 700,
  // Payoffs worth watching.
  surgeBreak: 900,
  surgeBreakOpp: 900,
  surgeArc: 900,
  surgeArcOpp: 900,
  cascade: 600,
  cascadeOpp: 600,
  place: 500,
};

function holdFor(fx: ReadonlyArray<{ kind: string }>): number {
  let hold = 0;
  for (const e of fx) {
    const h = FX_HOLD_MS[e.kind] ?? (e.kind.startsWith("oppCast:") ? 900 : 0);
    if (h > hold) hold = h;
  }
  return hold;
}

const MACHINE_TAG = "INTRUSION";

/** Per-device connect flavor for the BUS.LOG boot (gate-cleared set). */
const CONNECT_LINES: Record<string, string> = {
  "juno-vex": "hexlight boots to attract mode",
  "sable-okonkwo": "kestrel accepts the handshake",
  "aldous-wick": "meridian ledger answers slow",
  "wren-tallis": "studio masters answer on the third ping",
  "bram-hollander": "copperline hub checks its own id first",
  "dex-marlowe": "nocta deck wakes mid lesson",
  "june-aksoy": "halcyon gateway logs you in quiet",
  "ines-calloway": "ferrox suit stirs under load",
  "emeric-snow": "ivora cabinet resets the board",
  "vera-stanek": "apothek safe hums on backup power",
  "casimir-bell": "ledgerstone vault clicks twice then waits",
  "noor-behzadi": "polyverb brain loops a set not hers",
};

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

interface LogEntry {
  key: number;
  actor: "you" | "int" | "sys";
  text: string;
  divider?: boolean;
}

export interface DuelFinish {
  won: boolean;
  chip: number;
  capWin: boolean;
  /** Neither side could route; the player won the collapse. */
  gridlockWin: boolean;
  /** The pouch as the dive left it (spent pieces already gone). */
  pouchLeft: number[];
  /** The inputs behind the chip, so the result row can itemize it. */
  overRotations: number;
  trapsFired: number;
  redirectsTaken: number;
  pressureRounds: number;
  /** Ledger-only tallies for this dive. Nothing in the rules reads these. */
  scans: number;
  attackCasts: number;
  defendCasts: number;
  /** REPAIR.LOG telemetry: how the dive actually went. */
  rounds: number;
  trapRounds: number[];
  parRounds: number[];
  log: string[];
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
  customerId?: string | null;
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
    ownedNodes: s.boards.player.cells.filter((c) => isJunction(c) && c.built).length,
    scanned: s.tutFlags.scanned,
    purged: s.tutFlags.purged,
    attacked: s.tutFlags.attacked,
    trapShown: s.boards.player.cells.some((c) => c.trap && c.trap.revealed),
  });
}

function addr(idx: number): string {
  return `0x${idx.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** fx → screen shake magnitude, impact label, and sound. */
function fxJuice(kind: string, n: number | undefined, soundOn: boolean): { shake: number; pulse: Pulse | null } {
  let shake = 0;
  let pulse: Pulse | null = null;
  const mk = (text: string, cls: string): Pulse => ({ id: 0, text, cls });
  switch (kind) {
    case "cascade":
      shake = n && n >= 5 ? 2 : 1;
      pulse = mk(`CASCADE x${n ?? 2}`, "");
      if (soundOn) playCascade(n ?? 2);
      break;
    case "cascadeOpp":
      shake = 1;
      pulse = mk(`IT CLAIMED x${n ?? 2}`, "dv-pulse-bad");
      if (soundOn) sfx("claimTick", { vol: 0.5, rate: 0.7 });
      break;
    case "claim":
      if (soundOn) playCascade(1);
      break;
    case "claimOpp":
      if (soundOn) sfx("claimTick", { vol: 0.4, rate: 0.7 });
      break;
    case "cascadeRam":
      pulse = mk(`+${n ?? 1} RAM BANKED`, "");
      if (soundOn) sfx("overclockCast", { vol: 0.8 });
      break;
    case "cascadeRamOpp":
      // Silent, but never invisible: unexplained banked RAM is why the
      // machine's programs read as free.
      pulse = mk(`IT BANKED +${n ?? 1} RAM`, "dv-pulse-bad");
      break;
    case "trapFire":
      shake = 3;
      pulse = mk("TRAP SPRUNG", "dv-pulse-bad");
      if (soundOn) playBoom();
      break;
    case "siphonFire":
      shake = 2;
      pulse = mk(`SIPHONED ${n ?? 2} RAM`, "dv-pulse-bad");
      if (soundOn) sfx("overloadCast");
      break;
    case "turnLost":
      shake = 2;
      pulse = mk("TURN LOST", "dv-pulse-bad");
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
      pulse = mk("SCANNED", "");
      break;
    case "trace":
      pulse = mk("ROUTE TRACED", "");
      break;
    case "purge":
      if (soundOn) sfx("backdoorCast");
      pulse = mk("DEFUSED", "");
      break;
    case "place":
      // Utility placement, not a combat impact: no shake.
      if (soundOn) sfx("patchPlace");
      pulse = mk("PIECE PLACED", "");
      break;
    case "lock":
      if (soundOn) sfx("shieldCast");
      break;
    case "ward":
      if (soundOn) sfx("firewallCast");
      pulse = mk("WARDED", "");
      break;
    default:
      break;
  }
  return { shake, pulse };
}

/** The console strip's typed line. */
function ConsoleLine({ text }: { text: string }) {
  const [n, setN] = useState(0);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  useEffect(() => {
    if (reduced.current) return;
    setN(0);
    const iv = setInterval(() => setN((v) => Math.min(text.length, v + 2)), 14);
    return () => clearInterval(iv);
  }, [text]);
  const shown = reduced.current ? text : text.slice(0, n);
  return (
    <span className="dv-console-line">
      {shown}
      {!reduced.current && n < text.length && <span className="kp-boot-cursor">_</span>}
    </span>
  );
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
  /** Extra ms owed to the current beat because something happened on it. */
  const holdRef = useRef(0);
  /**
   * Viewport slide. The two grids run opposite ways and share a screen
   * position, so switching is a pan across one continuous board, not a cut:
   * going to the machine's grid pans right, coming back pans left.
   */
  const [slide, setSlide] = useState<{ key: number; dir: "l" | "r" }>({ key: 0, dir: "l" });
  const prevViewRef = useRef<Side>("player");
  /** Whose turn the last render saw, so the hand-back only fires on the edge. */
  const prevTurnRef = useRef<Side>("player");
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

  /* ---- BUS.LOG: realtime tap of the board, ring-buffered at 40 ---- */
  const [log, setLog] = useState<LogEntry[]>([]);
  const logKeyRef = useRef(0);
  const logLine = useCallback((actor: "you" | "int" | "sys", text: string, divider = false) => {
    setLog((prev) => {
      const next = [...prev, { key: ++logKeyRef.current, actor, text, divider }];
      return next.length > 40 ? next.slice(next.length - 40) : next;
    });
  }, []);
  /** The last player action, stashed at the dispatch site so the fx drain
   * can log it with addresses; denied actions never make it to the log. */
  const pendingRef = useRef<
    | { type: "rotate"; idx: number }
    | { type: "place"; idx: number }
    | { type: "cast"; prog: Program; targets: number[] }
    | { type: "endTurn" }
    | null
  >(null);
  // REPAIR.LOG telemetry, collected as the fx queue drains.
  const trapRoundsRef = useRef<number[]>([]);
  const parRoundsRef = useRef<number[]>([]);

  const customer = props.customerId ? customerById(props.customerId) : null;
  const macro = customer ? deviceMacroFor(customer) : null;

  // Boot lines: the tap comes alive, staggered so each arrival lands as
  // its own beat (display cadence only; the board is live from t=0, and
  // reduced-motion is untouched, matching BUS.LOG's gameplay arrivals).
  useEffect(() => {
    logLine("sys", `tap spliced. ${props.jobTitle.toLowerCase()}`);
    sfx("busLogArrival", { bus: "ui" });
    const connect = props.customerId ? CONNECT_LINES[props.customerId] : undefined;
    const timers = [
      setTimeout(() => {
        if (connect) {
          logLine("sys", connect);
          sfx("busLogArrival", { bus: "ui", rate: 1.15 });
        }
      }, 160),
      setTimeout(() => {
        logLine("sys", "== round 01 ==", true);
        sfx("busLogArrival", { bus: "ui", rate: 0.85 });
      }, 340),
      setTimeout(() => {
        logLine("sys", "bus live. your move.");
        sfx("busLogArrival", { bus: "ui", rate: 1.05 });
      }, 520),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round dividers land as the round advances.
  const lastRoundRef = useRef(1);
  useEffect(() => {
    if (state.round !== lastRoundRef.current) {
      lastRoundRef.current = state.round;
      logLine("sys", `== round ${String(Math.min(state.round, ROUND_CAP)).padStart(2, "0")} ==`, true);
    }
  }, [state.round, logLine]);

  // Three programs, so three fixed hook calls. They cannot live inside the
  // rail's map without breaking the rules of hooks.
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
  /** The board on screen. Every index in `legal`, `aimed` and `onCell` is relative to it. */
  const view: Side = state.view;
  /** A program is half placed: targets picked but not yet committed. */
  const arming = targeting !== null || placing !== null;
  const econ = state.econ.player;

  // Low presence drone for the length of the machine's turn.
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== "opp") return;
    if (soundOn) startDrone();
    return stopDrone;
  }, [state.phase, state.turn, soundOn]);

  /*
   * The machine's cadence, rescheduled after every beat rather than run on a
   * flat interval. A telegraphed CAST keeps the full beat - that pause is the
   * whole point of the telegraph - but a queued rotation does not need one,
   * because the queue was already shown when the turn opened.
   *
   * At a flat 420ms every rotation cost two beats, which was fine at the two
   * rounds dives used to run and is not at the seven the finale now reaches:
   * measured 6.7s a round, so a seven-round finale sat at ~47s of watching.
   */
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== "opp") return;
    const aim = state.oppTurn.aim;
    const base =
      aim === null
        ? state.oppTurn.started
          ? OPP_ROTATE_MS
          : OPP_BEAT_MS
        : aim.kind === "cast"
          ? OPP_BEAT_MS
          : OPP_ROTATE_MS;
    // The hold survives the fx drain: the drain is itself a state change, so
    // reading state.fx alone would lose it on the very next render.
    if (state.fx.length > 0) {
      holdRef.current = Math.max(holdRef.current, holdFor(state.fx));
    }
    const t = setTimeout(() => {
      holdRef.current = 0;
      dispatch({ type: "oppStep" });
    }, base + holdRef.current);
    return () => clearTimeout(t);
  }, [state]);

  // How many rotations each side still needs on its OWN board. Recomputed
  // every beat, the machine's own steps included. The numbers drive the
  // heartbeat tiers and the warn inversions; NO SURFACE PRINTS THEM.
  const threat = useMemo(() => {
    if (state.phase !== "playing") return { player: Infinity, opp: Infinity };
    return { player: routeCost(state.boards.player), opp: routeCost(state.boards.opp) };
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

  // Juice: drain the fx queue into sound, shake, impact labels, and the
  // BUS.LOG transcript (player lines composed from the stashed action so
  // denies never log; machine and world lines from the fx themselves).
  useEffect(() => {
    if (state.fx.length === 0) return;
    let maxShake = 0;
    const newPulses: Pulse[] = [];
    const kinds = new Set(state.fx.map((e) => e.kind));
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      if (pending.type === "rotate" && kinds.has("rotate")) {
        logLine("you", `twist ${addr(pending.idx)}`);
      } else if (pending.type === "place" && kinds.has("place")) {
        logLine("you", `patch weld ${addr(pending.idx)}`);
      } else if (pending.type === "endTurn" && kinds.has("endTurn")) {
        logLine("you", "end of turn");
      } else if (pending.type === "cast") {
        const at = pending.targets.map(addr).join(" ");
        if (pending.prog === "scan" && kinds.has("scan")) {
          logLine("you", "scan.exe sweep");
        } else if (pending.prog === "attack" && (kinds.has("redirect") || kinds.has("trapSet"))) {
          logLine("you", `${ATTACK_MODE_LABEL[state.kit.attackMode].toLowerCase()} ${at}`);
        } else if (pending.prog === "defend" && (kinds.has("purge") || kinds.has("lock") || kinds.has("ward"))) {
          logLine("you", `${DEFEND_MODE_LABEL[state.kit.defendMode].toLowerCase()} ${at}`);
        }
      }
    }
    for (const e of state.fx) {
      if (e.kind === "oppAim") {
        if (soundOn) sfx("aim", { jitter: 0.04 });
        continue;
      }
      // Emitted only for a player claim chain of four or more, which is the
      // one thing the CASCADE callout describes.
      if (e.kind === "cascadeRam") {
        setSawCascade(true);
        logLine("you", `+${e.n ?? 1} ram banked`);
      }
      if (e.kind === "cascadeRamOpp") logLine("int", `+${e.n ?? 1} ram banked`);
      if (e.kind === "cascade") logLine("you", `cascade x${e.n ?? 2}`);
      if (e.kind === "cascadeOpp") logLine("int", `cascade x${e.n ?? 2}`);
      if (e.kind === "trapFire") {
        trapRoundsRef.current.push(state.round);
        logLine("sys", "trap sprung");
      }
      if (e.kind === "siphonFire") logLine("sys", `${e.n ?? 2} ram siphoned`);
      if (e.kind === "turnLost") logLine("sys", "turn lost");
      if (e.kind === "trace") logLine("sys", "route traced");
      if (e.kind === "win") logLine("sys", "core seized. link closed.");
      if (e.kind === "lose") logLine("sys", "core lost. link closed.");
      if (state.turn === "opp") {
        if (e.kind === "rotate") logLine("int", "twist");
        if (e.kind === "redirect") logLine("int", "redirect hit");
        if (e.kind === "trapSet") logLine("int", "something armed");
        if (e.kind === "purge") logLine("int", "traps swept");
        if (e.kind === "lock") logLine("int", "clamp locked");
        if (e.kind === "ward") logLine("int", "ward raised");
      }
      // Over-par rotations click on top of the normal rotate sound.
      if (
        e.kind === "rotate" &&
        state.turn === "player" &&
        state.econ.player.rotations > state.par
      ) {
        parRoundsRef.current.push(state.round);
        if (soundOn) sfx("overParTick", { jitter: 0.05 });
      }
      if (e.kind.startsWith("oppCast:")) {
        const mode = e.kind.slice(8);
        const lines = VIRUS_LINES[mode] ?? VIRUS_LINES.armHalt;
        setVirus({ key: e.id, text: lines[Math.floor(Math.random() * lines.length)] });
        logLine("int", `charging ${(MODE_LABEL[mode as OppMode] ?? mode).toLowerCase()}`);
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
      // Two at a time. Four stacked labels on top of a virus banner and the
      // coach line is more than a busy turn can be read through.
      setPulses((p) => [...p, ...newPulses].slice(-2));
    }
    dispatch({ type: "fxDrain", upTo: state.fx[state.fx.length - 1].id });
  }, [state.fx, soundOn, logLine]);

  /**
   * Replay the shake without remounting: tearing the root down restarted
   * every overlay's entrance animation and stale toasts reappeared.
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
    // Outlasts the cast beat plus its hold, so the banner naming what it is
    // charging is still up when the cast actually lands.
    const t = setTimeout(() => setVirus(null), 3200);
    return () => clearTimeout(t);
  }, [virus]);

  // The par readout pops exactly once, at the rotation that crosses it.
  const overPar = state.econ.player.rotations - state.par;
  useEffect(() => {
    if (overPar > 0 && prevOverRef.current <= 0) setParPopKey((k) => k + 1);
    prevOverRef.current = overPar;
  }, [overPar]);

  // The console shows the latest engine notice for a beat, then falls back.
  const [noticeShown, setNoticeShown] = useState<string | null>(null);
  useEffect(() => {
    if (!state.notice) return;
    setNoticeShown(state.notice.text);
    const t = setTimeout(() => setNoticeShown(null), 4000);
    return () => clearTimeout(t);
  }, [state.notice?.id]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Held keys must not shred the staged turn one entry per repeat.
      if (e.repeat) return;
      if (e.code === "Escape") {
        setTargeting(null);
        setPlacing(null);
      } else if (
        (e.code === "KeyZ" || e.code === "Backspace") &&
        playerTurn &&
        !targeting &&
        placing === null
      ) {
        e.preventDefault();
        dispatch({ type: "undo" });
      } else if (e.code === "KeyE" && playerTurn && !targeting && placing === null) {
        pendingRef.current = { type: "endTurn" };
        dispatch({ type: "endTurn" });
      } else if (e.code === "Tab") {
        e.preventDefault();
        dispatch({ type: "view", side: view === "player" ? "opp" : "player" });
      } else if (e.code === "Digit1") {
        onProgram("scan");
      } else if (e.code === "Digit2") {
        onProgram("attack");
      } else if (e.code === "Digit3") {
        onProgram("defend");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Legal cells for the current interaction, always relative to the board on
  // screen. Nothing is actionable on a board you are not looking at, which is
  // why picking a program moves the viewport with it.
  const legal = useMemo(() => {
    const out = new Set<number>();
    if (!playerTurn) return out;
    const board = state.boards[view];
    if (targeting) {
      const wantsFoe = targeting.prog === "attack";
      if (wantsFoe !== (view === "opp")) return out;
      for (let i = 0; i < board.cells.length; i++) {
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
    // Rotating and patching are things you only do to your own grid.
    if (view !== "player") return out;
    if (placing !== null) {
      if (econ.ram < PLACE_COST) return out;
      for (let i = 0; i < board.cells.length; i++) {
        if (canPlace(board, i, reachOf(state, "player"))) out.add(i);
      }
      return out;
    }
    if (econ.ram < 1) return out;
    for (let i = 0; i < board.cells.length; i++) {
      if (canRotate(state, "player", i)) out.add(i);
    }
    return out;
  }, [state, view, playerTurn, targeting, placing, econ.ram]);

  /** Which board the machine's telegraphed move lands on. */
  const aimBoard: Side | null = useMemo(() => {
    const a = state.oppTurn.aim;
    if (!a) return null;
    if (a.kind === "rotate") return "opp";
    return a.prog === "attack" ? "player" : "opp";
  }, [state.oppTurn.aim]);

  const aimed = useMemo(() => {
    const a = state.oppTurn.aim;
    if (!a || state.phase !== "playing" || aimBoard !== view) return new Set<number>();
    return new Set(a.kind === "rotate" ? [a.idx] : a.targets);
  }, [state.oppTurn.aim, state.phase, aimBoard, view]);

  /**
   * Follow the machine to whichever grid it is working on. Its whole turn is
   * a telegraph, and a telegraph nobody is looking at is not a telegraph.
   * Only during its turn: yanking the camera on the player's own turn would
   * fight whatever they are lining up.
   */
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== "opp") return;
    if (!aimBoard || aimBoard === state.view) return;
    dispatch({ type: "view", side: aimBoard });
  }, [aimBoard, state.turn, state.phase, state.view]);

  /**
   * The machine is done: come home. Its turn leaves the camera on whatever
   * grid it last worked, so a turn that ended on its own board used to hand
   * you yours while you were looking at the wrong one. Fires only on the
   * opp -> player edge, never on a manual TAB during your own turn, and holds
   * one beat so its last move is seen landing before the pan.
   */
  useEffect(() => {
    const was = prevTurnRef.current;
    prevTurnRef.current = state.turn;
    if (was !== "opp" || state.turn !== "player" || state.phase !== "playing") return;
    const t = setTimeout(() => dispatch({ type: "view", side: "player" }), OPP_BEAT_MS);
    return () => clearTimeout(t);
  }, [state.turn, state.phase]);

  /** The turn's take-back, if it is still there to spend. */
  const undoLabel = playerTurn && !state.undoSpent && state.undo ? state.undo.label : null;

  /** The machine is about to act on the grid you are not looking at. */
  const offBoardAlert: Side | null = aimBoard && aimBoard !== view ? aimBoard : null;


  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    setSlide((s) => ({ key: s.key + 1, dir: view === "opp" ? "l" : "r" }));
  }, [view]);

  // TAP LINE traces the machine's route, so it only draws on its board.
  const traced = useMemo(
    () => (view === "opp" ? new Set(state.routeTrace?.cells ?? []) : new Set<number>()),
    [state.routeTrace, view],
  );

  // Their traps sit on YOUR board.
  const armedCount = useMemo(
    () => state.boards.player.cells.filter((c) => c.trap).length,
    [state.boards.player],
  );
  const revealedCount = useMemo(
    () => state.boards.player.cells.filter((c) => c.trap && c.trap.revealed).length,
    [state.boards.player],
  );

  const onCell = (idx: number) => {
    if (!playerTurn) return;
    if (placing !== null) {
      const mask = state.patchPouch[placing];
      if (mask === undefined) {
        setPlacing(null);
        return;
      }
      pendingRef.current = { type: "place", idx };
      dispatch({ type: "place", idx, pouchIdx: placing, mask });
      setPlacing(null);
      return;
    }
    if (targeting) {
      if (!legal.has(idx)) return;
      const picked = [...targeting.picked, idx];
      if (soundOn) sfx("tick", { bus: "ui", jitter: 0.04 });
      if (picked.length >= targeting.want) {
        pendingRef.current = { type: "cast", prog: targeting.prog, targets: picked };
        dispatch({ type: "cast", prog: targeting.prog, targets: picked });
        setTargeting(null);
      } else {
        setTargeting({ ...targeting, picked });
      }
      return;
    }
    // Rotation is a thing you do to your own grid. Clicking the machine's
    // grid with nothing armed switches back rather than silently doing nothing.
    if (view !== "player") {
      dispatch({ type: "view", side: "player" });
      return;
    }
    pendingRef.current = { type: "rotate", idx };
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
      pendingRef.current = { type: "cast", prog: "scan", targets: [] };
      dispatch({ type: "cast", prog: "scan", targets: [] });
      return;
    }
    if (prog === "attack") {
      const mode = state.kit.attackMode;
      dispatch({ type: "view", side: "opp" });
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
    dispatch({ type: "view", side: "player" });
    setTargeting({
      prog: "defend",
      mode,
      picked: [],
      want: mode === "ward" ? 1 : DEFEND_WIDTH[tierOf(state, "player", "defend")],
      label: DEFEND_MODE_LABEL[mode],
    });
  };

  const castNow = () => {
    if (!targeting || targeting.picked.length === 0) return;
    pendingRef.current = { type: "cast", prog: targeting.prog, targets: targeting.picked };
    dispatch({ type: "cast", prog: targeting.prog, targets: targeting.picked });
    setTargeting(null);
  };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish({
      won: state.phase === "won",
      chip: state.strainChip,
      capWin: state.winKind === "cap",
      gridlockWin: false,
      pouchLeft: state.patchPouch,
      // Mirrors finishDuel's own inputs (duel-actions.ts), so the result
      // screen redisplays the bill rather than re-deriving it.
      overRotations: Math.max(0, state.econ.player.rotations - state.par),
      trapsFired: state.econ.player.trapsFired,
      redirectsTaken: state.econ.player.redirectsTaken,
      pressureRounds: state.pressureRounds,
      scans: state.econ.player.scansCast,
      attackCasts: state.econ.player.attacksCast,
      defendCasts: state.econ.player.defendsCast,
      rounds: Math.min(state.round, ROUND_CAP),
      trapRounds: [...trapRoundsRef.current],
      parRounds: [...parRoundsRef.current],
      log: log.map((l) => (l.divider ? l.text : `${l.actor.toUpperCase()}> ${l.text}`)),
    });
  };

  const coach = coachLine(state);
  const oppEcon = state.econ.opp;
  const banked = econ.drainNext < 0 ? -econ.drainNext : 0;
  const oppBanked = oppEcon.drainNext < 0 ? -oppEcon.drainNext : 0;

  const programInfo = (prog: Program): { title: string; desc: string } => {
    if (prog === "scan") {
      const t = tierOf(state, "player", "scan");
      return {
        title: `SCAN.EXE T${t} // RANGE ${SCAN_RANGE[t] >= 99 ? "FULL" : SCAN_RANGE[t]}`,
        desc: scanDesc(t),
      };
    }
    if (prog === "attack") {
      const t = tierOf(state, "player", "attack");
      return {
        title: `ATTACK.EXE T${t} // ${ATTACK_MODE_LABEL[state.kit.attackMode]}`,
        desc: attackModeDesc(state.kit.attackMode, t),
      };
    }
    const t = tierOf(state, "player", "defend");
    return {
      title: `DEFEND.EXE T${t} // ${DEFEND_MODE_LABEL[state.kit.defendMode]}`,
      desc: defendModeDesc(state.kit.defendMode, t),
    };
  };

  /* console line, in priority order */
  const consoleText = (() => {
    if (state.phase !== "playing" && reviewing) {
      return "FINAL BOARD. Every trap on the grid is exposed.";
    }
    if (placing !== null) {
      return legal.size > 0
        ? `PATCH PIECE: pick a slag block within reach. ${PLACE_COST} RAM. ESC cancels.`
        : "PATCH PIECE: no slag block in reach. ESC cancels.";
    }
    if (targeting) {
      const left = targeting.want - targeting.picked.length;
      return `${targeting.label}: pick ${left} target${left === 1 ? "" : "s"}. ESC cancels.`;
    }
    if (noticeShown) return noticeShown;
    if (state.phase !== "playing") return "LINK CLOSED.";
    if (state.turn === "opp") return "The intrusion is moving. Watch the line.";
    if (econ.ram < 1) return "No RAM left. E ends the turn.";
    if (undoLabel) return `Your move. Z takes back the ${undoLabel.toLowerCase()}, once this turn.`;
    return "Your move. Twist a junction in reach, run a program, or end the turn.";
  })();

  const round = Math.min(state.round, ROUND_CAP);
  const crumbSlug = (customer ? customer.id : cfg.tutorial ? "the.machine" : props.jobTitle)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ".");

  /* seeded hex block for the board's margin furniture */
  const hexCorner = useMemo(() => {
    let hs = seed >>> 0;
    const hnext = () => {
      hs = (Math.imul(hs, 1664525) + 1013904223) >>> 0;
      return hs;
    };
    return Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, () => (hnext() % 0xffff).toString(16).toUpperCase().padStart(4, "0")).join(" "),
    ).join("\n");
  }, [seed]);

  return (
    <div
      ref={rootRef}
      className={`dv-shell ${shake.mag > 0 ? `dv-shake-${shake.mag}` : ""}`.trim()}
    >
      <header className="dv-bar">
        <h1>DIVE.EXE</h1>
        <div className="dv-bar-right">
          <span className="dv-bar-dev">{props.jobTitle.toUpperCase()}</span>
          <span className="dv-bar-glyphs" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </header>

      <div className="dv-crumb">
        <span className="dv-crumb-path">KP_OS//SIGNAL.BUS//DIVE//{crumbSlug}</span>
        <div className="dv-crumb-right">
          <span className="dv-viewtabs" role="group" aria-label="Which grid to show">
            {(["player", "opp"] as Side[]).map((sd) => (
              <button
                key={sd}
                type="button"
                className={`dv-viewtab${view === sd ? " dv-viewtab-on" : ""}${
                  sd === "opp" ? " dv-viewtab-o" : ""
                }`}
                aria-pressed={view === sd}
                onClick={() => {
                  if (soundOn) playUiPress();
                  dispatch({ type: "view", side: sd });
                }}
              >
                {sd === "player" ? "YOUR GRID" : "ITS GRID"}
                {offBoardAlert === sd && <i className="dv-viewtab-dot" aria-hidden="true" />}
              </button>
            ))}
            <span className="dv-viewtab-key" aria-hidden="true">
              TAB
            </span>
          </span>
          <span className="dv-round">
            <span>ROUND</span>
            <em>
              {String(round).padStart(2, "0")}/{ROUND_CAP}
            </em>
            <span className="dv-roundsegs" aria-hidden="true">
              {Array.from({ length: ROUND_CAP }).map((_, i) => (
                <i
                  key={i}
                  className={[
                    i >= ROUND_CAP - 5 ? "dv-seg-late" : "",
                    i < round - 1 ? "dv-seg-on" : "",
                    i === round - 1 && state.phase === "playing" ? "dv-seg-now" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </span>
          </span>
          <span className="dv-day">DAY {props.day === 0 ? "--" : String(props.day).padStart(2, "0")}</span>
          <button type="button" className="dv-snd" onClick={props.onToggleSound}>
            SND {soundOn ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="dv-stage">
        {/* ---- left rail ---- */}
        <div className={`dv-rail dv-rail-l ${!playerTurn && state.phase === "playing" ? "dv-rail-idle" : ""}`.trim()}>
          <div className="dv-rambox kp-frame-ticks">
            <i className="kp-tick2" aria-hidden="true" />
            <div className="dv-ram-top">
              <TapTip text={tip("ram")}>
                <span className="dv-ram-label">RAM</span>
              </TapTip>
              <em className="dv-ram-num">{playerTurn ? econ.ram : 0}</em>
              {banked > 0 && <i className="dv-ram-banked">+{banked} NEXT</i>}
            </div>
            <div className="dv-ram-pips" aria-hidden="true">
              {Array.from({ length: Math.max(econ.ramPerTurn + 3, econ.ram) }).map((_, i) => (
                <i key={i} className={i < econ.ram && playerTurn ? "dv-pip-on" : undefined} />
              ))}
            </div>
          </div>

          {(["scan", "attack", "defend"] as Program[]).map((prog) => {
            const cost = programCost(state, "player", prog);
            const offline = !programUnlocked(state, prog);
            const used = econ.used[prog];
            const tier = tierOf(state, "player", prog);
            const sub =
              prog === "scan"
                ? `R${SCAN_RANGE[tier] >= 99 ? "∞" : SCAN_RANGE[tier]}`
                : prog === "attack"
                  ? ATTACK_MODE_LABEL[state.kit.attackMode]
                  : DEFEND_MODE_LABEL[state.kit.defendMode];
            const armingThis = targeting?.prog === prog;
            return (
              <button
                key={prog}
                type="button"
                className={`dv-key dv-key-${prog} ${armingThis ? "dv-key-arming" : ""}`.trim()}
                data-prog={prog}
                disabled={!playerTurn || offline || used || econ.ram < cost}
                onClick={() => onProgram(prog)}
                onMouseEnter={() => setInfoProg(prog)}
                onMouseLeave={() => setInfoProg(null)}
                onFocus={() => setInfoProg(prog)}
                onBlur={() => setInfoProg(null)}
                {...holdInfo[prog]}
              >
                <span className="dv-key-name">
                  <b>{prog.toUpperCase()}</b>
                  <span className="dv-key-pips" aria-hidden="true">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <i key={i} className={i < tier ? "dv-on" : undefined} />
                    ))}
                  </span>
                  <i className={`dv-key-chip ${used ? "dv-chip-used" : ""} ${armingThis ? "dv-chip-arm" : ""}`.trim()}>
                    {armingThis ? `PICK ${targeting!.want - targeting!.picked.length}` : used ? "USED" : "RDY"}
                  </i>
                </span>
                <span className="dv-key-meta">{offline ? "OFFLINE" : `${sub} // ${cost} RAM`}</span>
              </button>
            );
          })}

          {!cfg.tutorial && (
            <div className={`dv-patch ${state.patchPouch.length === 0 ? "dv-patch-empty" : ""}`.trim()}>
              <div className="dv-patch-head">
                <span>PATCH</span>
                <i>{state.patchPouch.length > 0 ? `x${state.patchPouch.length}` : "NONE HELD"}</i>
              </div>
              <div className="dv-patch-slots">
                {state.patchPouch.map((mask, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`dv-piece ${placing === i ? "dv-piece-armed" : ""}`.trim()}
                    disabled={!playerTurn || econ.placedThisTurn || econ.ram < PLACE_COST}
                    title={econ.placedThisTurn ? "One piece per turn" : `Place this piece (${PLACE_COST} RAM)`}
                    onClick={() => {
                      if (soundOn) playUiPress();
                      setTargeting(null);
                      setPlacing((p) => (p === i ? null : i));
                    }}
                  >
                    <PatchGlyph mask={mask} size={22} dim={econ.placedThisTurn} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="dv-logbox">
            <span className="dv-log-head">BUS.LOG</span>
            <div className="dv-log-lines">
              {log.map((l) => (
                <span key={l.key} className={l.divider ? "dv-log-div" : `dv-log-${l.actor}`}>
                  {!l.divider && <b>{l.actor === "you" ? "YOU>" : l.actor === "int" ? "INT>" : "SYS>"}</b>}
                  {l.text}
                </span>
              ))}
            </div>
          </div>

          {/* One take-back a turn. Touch-move is the texture of the game, so
              this is here to fix a misread, not to let anyone shop around. */}
          <button
            type="button"
            className="kp-btn2 dv-undo"
            disabled={undoLabel === null}
            title={
              undoLabel === null
                ? state.undoSpent
                  ? "You have already taken one back this turn"
                  : "Nothing to take back"
                : "Puts your junction back. A trap you sprang stays sprung."
            }
            onClick={() => {
              if (soundOn) playUiPress();
              dispatch({ type: "undo" });
            }}
          >
            {undoLabel === null ? "UNDO (Z)" : `UNDO ${undoLabel} (Z)`}
          </button>

          <button
            type="button"
            className={`kp-btn2 dv-end ${playerTurn && !arming && econ.ram === 0 ? "kp-btn2-signal" : ""}`.trim()}
            disabled={!playerTurn || arming}
            title={arming ? "Finish or cancel the program you are placing first" : undefined}
            onClick={() => {
              if (soundOn) playUiPress();
              pendingRef.current = { type: "endTurn" };
              dispatch({ type: "endTurn" });
            }}
          >
            {arming ? "PLACING..." : "END TURN (E)"}
          </button>
        </div>

        {/* ---- center: the dressed instrument surface ---- */}
        <div className="dv-boardwrap kp-frame-ticks">
          <i className="kp-tick2" aria-hidden="true" />
          <i className="dv-boardtex" aria-hidden="true" />
          <span className="dv-wm" aria-hidden="true">
            DIVE.EXE
          </span>
          <span className="dv-hexcorner" aria-hidden="true">
            {hexCorner}
          </span>
          <i className="dv-ruler-b" aria-hidden="true" />
          <i className="dv-ruler-r" aria-hidden="true" />
          <div key={slide.key} className={`dv-slidein dv-slidein-${slide.dir}`}>
          <DuelBoard
            board={state.boards[view]}
            side={view}
            round={state.round}
            ended={state.phase !== "playing"}
            legal={legal}
            selected={new Set(targeting?.picked ?? [])}
            aimed={aimed}
            traced={traced}
            ghostMask={placing !== null ? (state.patchPouch[placing] ?? null) : null}
            onCell={onCell}
            machineTag={MACHINE_TAG}
          />
          </div>
          {/* The two grids run opposite ways and share one screen position, so
              the way across is an edge you walk off: your goal is right, so
              its grid is further right still. Lives outside `.dv-slidein`,
              which is remounted on every view change. */}
          <button
            type="button"
            className={`dv-viewarrow dv-viewarrow-${view === "player" ? "r" : "l"} ${
              offBoardAlert ? "dv-viewarrow-alert" : ""
            }`.trim()}
            aria-label={view === "player" ? "Show the intrusion's grid" : "Show your grid"}
            onClick={() => {
              if (soundOn) playUiPress();
              dispatch({ type: "view", side: view === "player" ? "opp" : "player" });
            }}
          >
            <span aria-hidden="true">{view === "player" ? ">" : "<"}</span>
          </button>
          {sweep > 0 && <div key={`sw-${sweep}`} className="dv-sweep" aria-hidden="true" />}
          {virus && (
            <div key={virus.key} className="dv-virus" aria-live="polite">
              {virus.text}
            </div>
          )}
          <div className="dv-pulses" aria-hidden="true">
            {pulses.map((p) => (
              <div key={p.id} className={`dv-pulse ${p.cls}`.trim()}>
                {p.text}
              </div>
            ))}
          </div>
          <div className="dv-threats">
            {playerNear >= 99 && state.phase === "playing" && (
              <div className="dv-threat dv-threat-max" aria-live="assertive">
                NO ROUTE FROM YOUR ENTRY TO THE GOAL
              </div>
            )}
            {oppNear <= 2 && state.phase === "playing" && (
              <div className={`dv-threat ${oppNear === 0 ? "dv-threat-max" : ""}`.trim()} aria-live="assertive">
                {oppNear === 0 ? "ITS SIGNAL IS ON ITS GOAL" : "THE INTRUSION IS CLOSING ON ITS GOAL"}
              </div>
            )}
          </div>
          {coach && <div className="kp-coach">{coach}</div>}
          <Teach id="cascade-bank" signals={{ cascadeBanked: sawCascade }} />
          <Teach id="patch-cell-use" signals={{ holdingCells: state.patchPouch.length > 0 }} />
        </div>

        {/* ---- right rail: telemetry ---- */}
        <div className="dv-rail dv-rail-r">
          {/* the TURN readout: same unboxed annotation furniture as ROUND.
              The value rides the acting side's tone and blinks only while
              the intrusion is actually moving (event-tied, opacity only). */}
          <span className="dv-round dv-turnread">
            <span>TURN</span>
            <em
              className={
                state.turn === "opp" && state.phase === "playing"
                  ? "dv-turnval-opp dv-turnval-live"
                  : state.turn === "player" && state.phase === "playing"
                    ? "dv-turnval-you"
                    : undefined
              }
            >
              {state.turn === "opp" ? "INTRUSION" : "YOU"}
            </em>
          </span>

          <div className="kp-datarow-list">
            <div className={`kp-datarow kp-datarow-plain dv-warnrow ${playerNear >= 99 ? "kp-datarow-warn dv-warn-max" : ""}`.trim()}>
              <span>YOUR ROUTE</span>
              <em>{playerNear >= 99 ? "SEVERED" : "OPEN"}</em>
            </div>
            <div className={`kp-datarow kp-datarow-plain dv-warnrow ${oppNear <= 2 ? "kp-datarow-warn" : ""} ${oppNear === 0 ? "dv-warn-max" : ""}`.trim()}>
              <span>ITS ROUTE</span>
              <em>{oppNear >= 99 ? "CUT" : oppNear === 0 ? "AT ITS GOAL" : oppNear <= 2 ? "CLOSING" : "OPEN"}</em>
            </div>
          </div>

          <div className="dv-oppbox">
            <h3>
              INTRUSION
              <em className="dv-opp-banked">{oppBanked > 0 ? `+${oppBanked} BANKED` : ""}</em>
            </h3>
            <div className="kp-datarow-list">
              {/* Live RAM, not just the per-turn rate: a cascade banks RAM
                  into the machine's next turn, and with only the rate on
                  screen its programs looked free. */}
              <div className="kp-datarow kp-datarow-plain">
                <span>RAM</span>
                <em>
                  {state.turn === "opp" ? oppEcon.ram : oppEcon.ramPerTurn} / {oppEcon.ramPerTurn} PER TURN
                </em>
              </div>
              <div className={`kp-datarow kp-datarow-plain dv-hazrow ${armedCount > revealedCount ? "kp-datarow-warn" : ""}`.trim()}>
                <span>ARMED NODES</span>
                <em>{armedCount > 0 ? `${armedCount}${revealedCount < armedCount ? " (HIDDEN)" : ""}` : "0"}</em>
              </div>
            </div>
            {props.dominantTell && <p className="dv-tell">{props.dominantTell}</p>}
            {state.oppNextIntent && state.turn === "opp" && (
              <p className="dv-intent">INTENT: {state.oppNextIntent}</p>
            )}
          </div>

          <div className="kp-datarow-list">
            <TapTip text={tip("par")}>
              <div
                key={parPopKey}
                className={`kp-datarow kp-datarow-plain dv-hazrow ${overPar > 0 ? "kp-datarow-warn" : ""} ${parPopKey > 0 ? "dv-par-pop" : ""}`.trim()}
              >
                <span>PAR</span>
                <em>
                  {econ.rotations}/{state.par}
                  {overPar > 0 ? ` +${overPar} OVER` : ""}
                </em>
              </div>
            </TapTip>
            <TapTip text={tip("strain")}>
              <div className="kp-datarow kp-datarow-plain">
                <span>STRAIN</span>
                <em>
                  <span className="dv-strainbar" aria-hidden="true">
                    <i style={{ width: `${props.strain}%` }} />
                  </span>
                  <b>{props.strain}%</b>
                </em>
              </div>
            </TapTip>
            <Teach id="par-budget" signals={{ overPar: overPar > 0 }} />
          </div>

          {customer && macro && (
            <div className="dv-device">
              <span className="dv-mon" data-feed={macro.feed}>
                <img
                  src={macro.src}
                  alt=""
                  width={macro.w}
                  height={macro.h}
                  style={{ top: macro.top, left: macro.left }}
                />
                <i className="tint" aria-hidden="true" />
              </span>
              <span className="dv-device-tag">ON THE BENCH // {customer.device.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ---- console strip ---- */}
      <footer className="dv-console">
        <span className="dv-console-label">{"// CONSOLE _"}</span>
        <ConsoleLine text={consoleText} />
        <span className="dv-console-actions">
          {state.phase !== "playing" && reviewing && (
            <button type="button" className="dv-cbtn" onClick={() => setReviewing(false)}>
              BACK TO RESULT
            </button>
          )}
          {targeting && targeting.picked.length > 0 && (
            <button type="button" className="dv-cbtn dv-cbtn-hot" onClick={castNow}>
              CAST NOW
            </button>
          )}
          {arming && (
            <button
              type="button"
              className="dv-cbtn"
              onClick={() => {
                setTargeting(null);
                setPlacing(null);
              }}
            >
              CANCEL (ESC)
            </button>
          )}
        </span>
      </footer>

      {infoProg && (
        <div className="dv-info dv-info-on">
          <strong>{programInfo(infoProg).title}</strong>
          <p>{programInfo(infoProg).desc}</p>
        </div>
      )}

      {/* Board review: the final board is fully rendered underneath with
          every trap revealed; only the result panel was hiding it. */}
      {state.phase !== "playing" && !reviewing && (
        <div className="dv-overlay dv-overlay-on">
          <div className={`dv-result ${state.phase === "won" ? "dv-result-w" : "dv-result-l"}`}>
            {cfg.tutorial ? (
              <>
                <h2>THE MACHINE SEALS ITSELF</h2>
                <div className="kp-frame-stripe" />
                <p className="dv-result-reason">
                  Neural Strain zeroed. It watched you learn the controls, then it shut the door.
                  Day one starts at the front counter.
                </p>
              </>
            ) : state.phase === "won" ? (
              <>
                <h2>{state.winKind === "cap" ? "LINK TIMED OUT" : "GOAL LIT"}</h2>
                <div className="kp-frame-stripe" />
                <p className="dv-result-reason">
                  {state.endReason ?? "Your signal reached the goal first. The intrusion collapses."}
                </p>
              </>
            ) : (
              <>
                <h2>{state.winKind === "cap" ? "LINK TIMED OUT" : "GOAL LOST"}</h2>
                <div className="kp-frame-stripe" />
                <p className="dv-result-reason">{state.endReason ?? "It lit its goal first."}</p>
              </>
            )}
            {!cfg.tutorial && (
              <div className="kp-datarow-list dv-result-bill">
                <div className="kp-datarow kp-datarow-plain">
                  <span>ROUNDS</span>
                  <em>
                    {round}/{ROUND_CAP}
                  </em>
                </div>
                <div className={`kp-datarow kp-datarow-plain dv-hazrow ${overPar > 0 ? "kp-datarow-warn" : ""}`.trim()}>
                  <span>ROTATIONS</span>
                  <em>
                    {econ.rotations} / PAR {state.par}
                  </em>
                </div>
                <div className={`kp-datarow kp-datarow-plain dv-hazrow ${econ.trapsFired > 0 ? "kp-datarow-warn" : ""}`.trim()}>
                  <span>TRAPS FIRED ON YOU</span>
                  <em>{econ.trapsFired}</em>
                </div>
                {state.phase === "won" && state.strainChip > 0 && (
                  <div className="kp-datarow kp-datarow-plain dv-hazrow kp-datarow-warn">
                    <span>STRAIN CHIP</span>
                    <em>-{state.strainChip}</em>
                  </div>
                )}
                {state.phase !== "won" && (
                  <div className="kp-datarow kp-datarow-plain dv-hazrow kp-datarow-warn">
                    <span>NEURAL STRAIN</span>
                    <em>ZEROED. THE RUN IS OVER.</em>
                  </div>
                )}
              </div>
            )}
            <div className="dv-result-actions">
              <button type="button" className="kp-btn2 kp-btn2-ghost" onClick={() => setReviewing(true)}>
                VIEW BOARD
              </button>
              {/* Every outcome routes through the repair report first, so the
                  label never promises a dive it does not start. */}
              <button type="button" className="kp-btn2 kp-btn2-primary" onClick={finish}>
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
