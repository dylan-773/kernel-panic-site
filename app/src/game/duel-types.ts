import { AttackMode, AugmentId, DefendMode, OppMode, Program, Tier } from "./content/kit";
import { RngState } from "./rng";

/**
 * Split-board duel model. Each side gets its OWN grid, pre-dealt with
 * scrambled connector nodes; rotating is the only movement verb. Your signal
 * runs live from your entry on the left edge through aligned arms toward the
 * goal column on the right. Light any goal cell and the dive ends.
 *
 * Two layers, and keeping them apart is the whole design:
 *
 *   BUILT — every node your signal has ever lit. Permanent. Reach walks from
 *           it, so a cut can never strand the frontier you have already made.
 *   LIVE  — every node currently carrying signal from your entry. One twist
 *           upstream and everything behind it goes dark.
 *
 * So progress is reversible in throughput but never in construction. There is
 * no territory and no claiming: the enemy is never on your board, only its
 * traps and its redirects are. You defend against those, not against ground.
 *
 * Every combatant runs the same three programs — SCAN / ATTACK / DEFEND —
 * at 1 RAM each, once per turn each. Tiers widen them, modes reshape them.
 * ATTACK reaches across to the enemy board; DEFEND acts on your own.
 *
 * Arm masks and rotation semantics live in ./types
 * (0 north, 1 east, 2 south, 3 west; bit = 1 << dir).
 *
 * Rotation is UNIDIRECTIONAL — `(rot + 1) % 4` everywhere, and `rotCostFor`
 * only searches forward. Undoing one enemy twist therefore costs 3 RAM on an
 * elbow or T and 1 on a straight. That asymmetry is what makes reaching over
 * to their board worth the RAM, and the reason no hold-the-goal phase exists.
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

/** One board has exactly one entry (its owner's) and a goal column. */
export type CellKind = "node" | "entry" | "goal" | "block";

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
  /**
   * Ever lit by this board's owner. Permanent: a cut takes the power, never
   * the construction. Reach walks from this, so losing throughput never
   * strands the frontier. Cascade pays only on the first light.
   */
  built: boolean;
  /** Order this node was first lit in, for staggered cascade animation. */
  litWave: number;
  /** Enemy trap armed on this node. Hidden from the victim until revealed. */
  trap: { by: Side; revealed: boolean; kind: TrapKind; drain: number } | null;
  /**
   * Lock: round through which the rotation freeze holds, and who cast it.
   * On your own board you lock to armor a node against their REDIRECT
   * (`redirectTargetLegal` refuses a node locked by the other side).
   */
  lockedThroughRound: number;
  lockedBy: Side | null;
  /** Ward: round through which no new trap can land here, and who cast it. */
  wardThroughRound: number;
  wardBy: Side | null;
}

/**
 * One side's grid. The enemy never occupies cells here; it only reaches in
 * with traps and redirects.
 */
export interface Board {
  w: number;
  h: number;
  cells: DuelCell[];
  /** This side's signal source, left edge, mid row. */
  entry: number;
  /** Goal cells on the right edge. Lighting any one ends the dive. */
  goal: number[];
  /** Currently carrying signal from `entry`. Recomputed after every change. */
  power: boolean[];
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
  /**
   * 0..1 chance per ROTATION that the opponent does not fumble. Kept only for
   * movement texture and pinned high: as a difficulty dial it is finished,
   * because it compounds with duel length. `greed^oppRam` means the same 0.94
   * that reads as "occasionally sloppy" over a two-round duel is a 2% chance
   * of a clean turn over a nine-round one. `focus` replaced its real job.
   */
  greed: number;
  /**
   * How deep the machine looks before reaching across, 0-3. The intelligence
   * dial the game never had - every previous lever scaled its RAM, its cast
   * width or its mistake rate, never what it understood.
   *   0  no cut scoring at all; it just races its own board
   *   1  scores a twist by how much it raises your route cost (the old AI)
   *   2  + scores by how much of your LIVE grid it puts in the dark
   *   3  + weights by what the twist costs you to undo, and will abandon its
   *        own race to deny yours when your clock is shorter
   */
  horizon: number;
  /**
   * 0..1 chance per TURN that a cut lands on the best target rather than a
   * random one of the top three. Deliberately per-turn: unlike `greed` this
   * does not compound with duel length, so it reads the same at three rounds
   * and at nine.
   */
  focus: number;
  /** 0..1 chance per turn of a non-forced program cast. */
  abilityFreq: number;
  /** Target route cost (rotation RAM) the board generator aims both sides at. */
  pdTarget: number;
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
 * How the dive ended. "goal" is a live signal reaching the goal column;
 * "cap" is the round-cap tiebreak; "seal" is the tutorial's scripted close.
 *
 * "severed" and "gridlock" are gone with territory: on a board only you
 * occupy, being walled off is not a thing that can happen to you. They were
 * also the source of a real defect (a planner blindspot reporting Infinity
 * ended still-winnable dives in an instant loss), so this deletes a bug class.
 */
export type DuelEndKind = "goal" | "cap" | "seal";

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
  /**
   * Enemy REDIRECTs that landed on this side's board. Each one costs about
   * 3 RAM to undo (unidirectional rotation), so this is the closest thing the
   * duel has to damage taken, and it is what the strain bill prices.
   */
  redirectsTaken: number;
  /** Manual rotations this dive (the par meter). Program twists are free. */
  rotations: number;
  /** A patch cell was placed this turn (one per turn). */
  placedThisTurn: boolean;
}

export interface DuelState {
  cfg: DuelConfig;
  seed: number;
  /**
   * One grid per side. `boards.player` is yours; `boards.opp` is the
   * machine's. ATTACK casts reach across to the other side's board, DEFEND
   * casts act on your own, and rotate/place are always your own.
   */
  boards: Record<Side, Board>;
  /** Which board the viewport is showing. Presentation only; no rule reads it. */
  view: Side;
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
  /**
   * Rounds that ended with the machine within PRESSURE_RANGE of its goal.
   * Winning while it was breathing down your neck should still cost something,
   * which is the term that makes a narrow win read as narrow.
   */
  pressureRounds: number;
  /** Shaped patch pieces still unspent this dive: 4-bit arm masks. */
  patchPouch: number[];
  strainChip: number;
  rngState: RngState;
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
