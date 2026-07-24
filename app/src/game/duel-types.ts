import { RngState } from "./rng";

/**
 * Model for the Kernel Panic duel: two sides race to connect their entry
 * port to the neutral core at the center of one shared grid. Cells are
 * placed (not pre-carved): a placed cell belongs to its side forever and
 * only conducts that side's signal. Arm masks and rotation semantics are
 * shared with ./types (0 north, 1 east, 2 south, 3 west; bit = 1 << dir).
 */

export type Side = "player" | "opp";

export function otherSide(s: Side): Side {
  return s === "player" ? "opp" : "player";
}

/** Piece shapes drawn from the bag, as arm masks in rotation 0. */
export const PIECE_I = 0b0101; // N+S straight
export const PIECE_L = 0b0011; // N+E corner
export const PIECE_T = 0b0111; // N+E+S tee
export const PIECE_X = 0b1111; // cross

/** "block" cells are dead slag: nothing conducts, nothing can be placed. */
export type CellKind = "empty" | "node" | "entryP" | "entryO" | "core" | "block";

export interface DuelCell {
  x: number;
  y: number;
  kind: CellKind;
  /** "none" for empty and core cells; ports belong to their side. */
  owner: "none" | Side;
  /** Arm mask at rotation 0. Empty cells have 0. */
  base: number;
  rot: number;
  /** Cumulative quarter turns for monotonic spin animation. */
  spin: number;
  /** Enemy trap armed on this node. Hidden from the victim until revealed. */
  trap: { by: Side; revealed: boolean; drain: number } | null;
  /** Round number through which this node ignores Arm Node / Redirect. */
  shieldedThroughRound: number;
}

export interface DuelPower {
  player: boolean[];
  opp: boolean[];
}

export type AbilityVerb =
  | "arm"
  | "scan"
  | "redirect"
  | "shield"
  | "overload"
  | "overclock"
  | "firewall"
  | "backdoor";

export type AbilityId = string;

export interface AbilityDef {
  id: AbilityId;
  verb: AbilityVerb;
  name: string;
  /** Base verb tier 1..3; activation cost carries the variant surcharge. */
  tier: 1 | 2 | 3;
  variant: boolean;
  ramCost: number;
  desc: string;
  p: {
    /** arm: number of nodes trapped per cast. */
    traps?: number;
    /** arm: RAM the victim loses on their turn after the trap fires. */
    drain?: number;
    /** scan/backdoor: also reveal the opponent's next intent. */
    intent?: boolean;
    /** scan: revealed traps immediately disarmed, up to this many. */
    disarm?: number;
    /** redirect: quarter turns applied to each target. */
    rotSteps?: number;
    /** redirect/shield: number of target nodes. */
    targets?: number;
    /** shield/backdoor: rounds of node shield granted. */
    shieldRounds?: number;
    /** overload: enemy turns the chosen ability stays disabled. */
    lockTurns?: number;
    /** overload/firewall variants: RAM removed from the enemy's next turn. */
    enemyRamDrain?: number;
    /** overclock: bonus RAM per boosted turn. */
    ramBoost?: number;
    /** overclock: number of boosted turns. */
    boostTurns?: number;
    /** firewall: rounds of whole-network immunity. */
    wallRounds?: number;
    /** backdoor: purge all traps on own network. */
    purge?: boolean;
  };
}

/** Per-duel configuration: one row of the arc table (or tutorial/finale). */
export interface DuelConfig {
  w: number;
  h: number;
  oppRam: number;
  /** 0..1 chance per placement that the opponent plays optimally. */
  greed: number;
  /** 0..1 chance per turn of a non-forced ability cast. */
  abilityFreq: number;
  /** Max node placements the opponent makes per turn. */
  placesPerTurn: number;
  /** Target route length (placements) the slag generator aims both sides at. */
  minPath: number;
  /** Nodes the intrusion has already placed when the dive begins. */
  headStart: number;
  oppKit: AbilityId[];
  /** The verb Analyze reports; double-weighted and guaranteed early. */
  dominant: AbilityVerb;
  /** Scripted tutorial duel: opponent cheats, UI runs the beat script. */
  tutorial?: boolean;
}

export interface EquippedAbility {
  id: AbilityId;
  copies: number;
}

export type OppEvent =
  | { kind: "trapTriggered"; idx: number; drain: number }
  | { kind: "place"; idx: number; rot: number }
  | { kind: "rotate"; idx: number; steps: number }
  | { kind: "discard" }
  | { kind: "ability"; id: AbilityId; targets: number[] }
  | { kind: "pass" };

export type DuelPhase = "playing" | "won" | "lost";

export interface DuelFx {
  id: number;
  kind: string;
}

/** One side's turn economy and status effects. */
export interface SideEcon {
  ramPerTurn: number;
  /** RAM available right now (only meaningful on this side's turn). */
  ram: number;
  carry: number;
  boostAmount: number;
  boostTurns: number;
  /** RAM subtracted from the next turn's generation (traps, brownouts). */
  drainNext: number;
  abilityUsed: boolean;
  /** Ability id → own turns it remains disabled (enemy Overload). */
  disabled: Record<AbilityId, number>;
  drawCur: number;
  drawNext: number;
  /** Round through which the whole network ignores Arm Node / Redirect. */
  wallThrough: number;
  /** Enemy traps that have fired on this side (feeds the strain formula). */
  trapsFired: number;
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
  /** "core" | "cap" — how the duel ended (null while playing). */
  winKind: "core" | "cap" | null;
  /** 1-based; one round = one player turn then one opponent turn. */
  round: number;
  turn: Side;
  econ: Record<Side, SideEcon>;
  /** Player loadout with remaining copies; opponent kit casts are free. */
  equipped: EquippedAbility[];
  /** Queued opponent moves; applied one per oppStep dispatch. */
  oppPlan: OppEvent[];
  /** Precomputed line describing the opponent's likely next move. */
  oppNextIntent: string | null;
  /** True after a Deep Scan style reveal (UI shows oppNextIntent). */
  intentRevealed: boolean;
  /** Opponent placements-needed-to-core measured at duel start. */
  oppStartDist: number;
  /** Strain chip computed at the moment of a win (0 otherwise). */
  strainChip: number;
  rngState: RngState;
  bagPlayer: RngState;
  bagOpp: RngState;
  fx: DuelFx[];
  fxNext: number;
  notice: { id: number; text: string } | null;
  /** Tutorial beat index (meaningful only when cfg.tutorial). */
  beat: number;
  /** Opponent turn bookkeeping, reset each opponent turn. */
  oppTurn: { trapChecked: boolean; placed: number; pendingAbility: AbilityId | null };
  /** The dominant verb is guaranteed to appear early; set once it has. */
  oppDominantUsed: boolean;
  /** Round when the player last hit the opponent's network (Arm/Redirect). */
  lastPlayerHitRound: number;
}

export const ROUND_CAP = 30;
