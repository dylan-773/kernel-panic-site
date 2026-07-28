import { AttackMode, AugmentId, DefendMode, OppMode, Program, Tier } from "./content/kit";
import { RngState } from "./rng";

/**
 * Flood-claim duel model. The whole grid is pre-dealt with scrambled
 * connector nodes; rotating is the only movement verb. Each side's signal
 * floods live from its port through aligned arms, auto-claiming every
 * neutral node it touches — one rotation can cascade-claim a chain. Claimed
 * territory persists (the enemy flood can never pass through it) even when
 * a later twist cuts its power. First flood to touch the core wins.
 *
 * Every combatant runs the same three programs — SCAN / ATTACK / DEFEND —
 * at 1 RAM each, once per turn each. Tiers widen them, modes reshape them.
 *
 * Arm masks and rotation semantics live in ./types
 * (0 north, 1 east, 2 south, 3 west; bit = 1 << dir).
 */

export type Side = "player" | "opp";

export function otherSide(s: Side): Side {
  return s === "player" ? "opp" : "player";
}

/** Connector distribution drawn at board generation. */
export const PIECE_I = 0b0101;
export const PIECE_L = 0b0011;
export const PIECE_T = 0b0111;
export const PIECE_X = 0b1111;

export type CellKind = "node" | "entryP" | "entryO" | "core" | "block";

export type TrapKind = "halt" | "siphon";

export interface DuelCell {
  x: number;
  y: number;
  kind: CellKind;
  /** Arm mask at rotation 0. Slag blocks have 0. */
  base: number;
  rot: number;
  /** Cumulative quarter turns for monotonic spin animation. */
  spin: number;
  /** Welded: a placed patch piece. Its orientation is final; nothing
   * rotates or redirects it, ever. */
  fused: boolean;
  /** Claimed territory. Ports are owned by their side; core stays "none". */
  owner: "none" | Side;
  /** Global claim sequence number (0 = never claimed), for ordering. */
  claimSeq: number;
  /** Position within the cascade that claimed it, for staggered animation. */
  claimWave: number;
  /** Enemy trap armed on this node. Hidden from the victim until revealed. */
  trap: { by: Side; revealed: boolean; kind: TrapKind; drain: number } | null;
  /** Lock: round through which the rotation freeze holds, and who cast it. */
  lockedThroughRound: number;
  lockedBy: Side | null;
  /** Ward: round through which no new trap can land here, and who cast it. */
  wardThroughRound: number;
  wardBy: Side | null;
}

export interface DuelPower {
  player: boolean[];
  opp: boolean[];
}

/** The player's resolved kit for one dive. */
export interface DuelKit {
  scanTier: Tier;
  attackTier: Tier;
  defendTier: Tier;
  attackMode: AttackMode;
  defendMode: DefendMode;
  augments: AugmentId[];
  /** Single-use shaped slag fills carried into the dive: 4-bit arm masks. */
  patchPouch: number[];
}

export const BASE_KIT: DuelKit = {
  scanTier: 1,
  attackTier: 1,
  defendTier: 1,
  attackMode: "redirect",
  defendMode: "purge",
  augments: [],
  patchPouch: [],
};

export interface DuelConfig {
  w: number;
  h: number;
  oppRam: number;
  /** 0..1 chance per rotation that the opponent plays optimally. */
  greed: number;
  /** 0..1 chance per turn of a non-forced program cast. */
  abilityFreq: number;
  /** Target route cost (rotation RAM) the board generator aims both sides at. */
  minCost: number;
  /**
   * Hard floor on the player's opening route cost. The old guarantee was
   * only "more than one turn of RAM"; boosts, cascade banking, and a patch
   * piece shortcut can beat that. Raise it where opening bursts must not
   * close a board. Defaults to playerRamPerTurn.
   */
  minPd?: number;
  /** Neutral nodes pre-claimed along the intrusion's route at dive start. */
  headStart: number;
  /** Attack/defend modes the machine may run, and how wide it casts. */
  oppAttackModes: AttackMode[];
  oppDefendModes: DefendMode[];
  oppTier: Tier;
  /** The mode Analyze reports; prioritized and guaranteed early. */
  dominant: OppMode;
  /** Per-day override of the par margin's flat term (defaults to PAR_FLAT). */
  parFlat?: number;
  /** Slag density at board generation (defaults to 0.18, tutorial 0.12). */
  slag?: number;
  /** The machine takes the first turn. Finale only: it was already inside. */
  oppOpens?: boolean;
  tutorial?: boolean;
}

export type DuelPhase = "playing" | "won" | "lost";

/**
 * How the dive ended. "core" is a flood touching the core; "cap" is the
 * round-cap tiebreak; "severed" and "gridlock" are route verdicts, decided
 * without either flood arriving. The last two exist because calling them
 * "core" made a walled-off loss read as a bug.
 */
export type DuelEndKind = "core" | "cap" | "severed" | "gridlock";

export interface DuelFx {
  id: number;
  kind: string;
  /** Magnitude for scalable effects (cascade length, chip size). */
  n?: number;
}

/** One side's turn economy and status effects. */
export interface SideEcon {
  ramPerTurn: number;
  ram: number;
  carry: number;
  /** Max RAM carried between turns. */
  carryCap: number;
  /** RAM subtracted from the next turn's generation. Negative = a gain. */
  drainNext: number;
  /** This side's NEXT turn is skipped outright (a halt trap fired). */
  loseNextTurn: boolean;
  /** Programs already cast this turn. */
  used: Record<Program, boolean>;
  /** ATTACK casts this dive (for first-cast discounts). */
  attacksCast: number;
  /** SCAN and DEFEND casts this dive. Ledger only; no rule reads these. */
  scansCast: number;
  defendsCast: number;
  /** Enemy traps that have fired on this side (feeds the strain formula). */
  trapsFired: number;
  /** Manual rotations this dive (the par meter). Program twists are free. */
  rotations: number;
  /** A patch cell was placed this turn (one per turn). */
  placedThisTurn: boolean;
}

export interface DuelState {
  cfg: DuelConfig;
  seed: number;
  w: number;
  h: number;
  cells: DuelCell[];
  entryP: number;
  entryO: number;
  coreIdx: number;
  power: DuelPower;
  phase: DuelPhase;
  winKind: DuelEndKind | null;
  /**
   * Why the dive ended, in the player's language. Set at finish and never
   * cleared, so the result overlay can explain a loss the machine won
   * without ever touching the core.
   */
  endReason: string | null;
  /** 1-based; one round = one player turn then one opponent turn. */
  round: number;
  turn: Side;
  econ: Record<Side, SideEcon>;
  /** The player's programs for this dive. */
  kit: DuelKit;
  /** Human-readable line describing the opponent's likely next move. */
  oppNextIntent: string | null;
  /** TAP LINE augment: the intrusion's traced route, cleared each round. */
  routeTrace: { round: number; cells: number[] } | null;
  /** Opponent route cost measured at duel start (progress readouts). */
  oppStartCost: number;
  /** Rotation budget for a clean win; going over chips strain. */
  par: number;
  /** Shaped patch pieces still unspent this dive: 4-bit arm masks. */
  patchPouch: number[];
  /**
   * Consecutive round-ends where the player had no route to the core. The
   * severed verdict needs two, so a one-round planner blindspot cannot end
   * a dive that is still winnable.
   */
  severedStreak: number;
  strainChip: number;
  rngState: RngState;
  claimCounter: number;
  fx: DuelFx[];
  fxNext: number;
  notice: { id: number; text: string } | null;
  /** Opponent turn bookkeeping, reset each opponent turn. */
  oppTurn: {
    started: boolean;
    pendingCast: { prog: "attack" | "defend"; mode: OppMode } | null;
    /** Committed rotation queue for this turn, absolute target rotations. */
    queue: Array<{ idx: number; targetRot: number }>;
    replans: number;
    /** Route cost at the last replan; the next needs strict progress. */
    lastReplanCost: number;
    /** RAM at the start of this turn (tutorial throttle bookkeeping). */
    ramAtStart: number;
    /**
     * Telegraph beat: the move the machine has locked in but not yet made.
     * The UI highlights it for one tick before it lands.
     */
    aim:
      | { kind: "rotate"; idx: number }
      | { kind: "cast"; prog: "attack" | "defend"; mode: OppMode; targets: number[] }
      | null;
  };
  oppDominantUsed: boolean;
  /** Round when the player last hit the opponent (arm/redirect/lock). */
  lastPlayerHitRound: number;
  /**
   * Tutorial script state: which programs the player has demonstrated.
   * Programs stay offline until the script flags them; the machine holds
   * back until all three are shown, then stops pretending.
   */
  tutFlags: { scanned: boolean; purged: boolean; attacked: boolean };
  /** Round the tutorial lesson completed on (0 = not yet). */
  tutorialLessonRound: number;
}

export const ROUND_CAP = 25;
