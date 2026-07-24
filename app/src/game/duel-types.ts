import { RngState } from "./rng";

/**
 * Flood-claim duel model. The whole grid is pre-dealt with scrambled
 * connector nodes; rotating is the only movement verb. Each side's signal
 * floods live from its port through aligned arms, auto-claiming every
 * neutral node it touches — one rotation can cascade-claim a chain. Claimed
 * territory persists (the enemy flood can never pass through it) even when
 * a later twist cuts its power. First flood to touch the center core wins.
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

export interface DuelCell {
  x: number;
  y: number;
  kind: CellKind;
  /** Arm mask at rotation 0. Slag blocks have 0. */
  base: number;
  rot: number;
  /** Cumulative quarter turns for monotonic spin animation. */
  spin: number;
  /** Claimed territory. Ports are owned by their side; core stays "none". */
  owner: "none" | Side;
  /** Global claim sequence number (0 = never claimed), for ordering. */
  claimSeq: number;
  /** Position within the cascade that claimed it, for staggered animation. */
  claimWave: number;
  /** Enemy trap armed on this node. Hidden from the victim until revealed. */
  trap: { by: Side; revealed: boolean; drain: number } | null;
  /** Shield: round through which the lock holds, and who cast it. */
  lockedThroughRound: number;
  lockedBy: Side | null;
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
  tier: 1 | 2 | 3;
  variant: boolean;
  ramCost: number;
  desc: string;
  p: {
    /** arm: number of nodes trapped per cast. */
    traps?: number;
    /** arm: RAM the victim loses on the turn after the trap fires. */
    drain?: number;
    /** scan/backdoor: also reveal the opponent's next intent. */
    intent?: boolean;
    /** scan: revealed traps immediately disarmed, up to this many. */
    disarm?: number;
    /** redirect: quarter turns applied to each target. */
    rotSteps?: number;
    /** redirect/shield: number of target nodes. */
    targets?: number;
    /** shield: rounds the rotation lock holds. */
    shieldRounds?: number;
    /** overload: enemy turns the chosen ability stays disabled. */
    lockTurns?: number;
    /** overload/firewall variants: RAM removed from the enemy's next turn. */
    enemyRamDrain?: number;
    /** overclock: bonus RAM per boosted turn. */
    ramBoost?: number;
    /** overclock: number of boosted turns. */
    boostTurns?: number;
    /** firewall: rounds of whole-territory immunity. */
    wallRounds?: number;
    /** backdoor: purge every enemy trap on the board. */
    purge?: boolean;
  };
}

export interface DuelConfig {
  w: number;
  h: number;
  oppRam: number;
  /** 0..1 chance per rotation that the opponent plays optimally. */
  greed: number;
  /** 0..1 chance per turn of a non-forced ability cast. */
  abilityFreq: number;
  /** Target route cost (rotation RAM) the board generator aims both sides at. */
  minCost: number;
  /** Neutral nodes pre-claimed along the intrusion's route at dive start. */
  headStart: number;
  oppKit: AbilityId[];
  /** The verb Analyze reports; prioritized and guaranteed early. */
  dominant: AbilityVerb;
  tutorial?: boolean;
}

export interface EquippedAbility {
  id: AbilityId;
  copies: number;
}

export type DuelPhase = "playing" | "won" | "lost";

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
  boostAmount: number;
  boostTurns: number;
  /** RAM subtracted from the next turn's generation (traps, brownouts). */
  drainNext: number;
  /** This side's NEXT turn is skipped outright (a trap fired). */
  loseNextTurn: boolean;
  abilityUsed: boolean;
  /** Ability id → own turns it remains disabled (enemy Overload). */
  disabled: Record<AbilityId, number>;
  /** Round through which the whole territory ignores Arm/Redirect/Shield. */
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
  winKind: "core" | "cap" | null;
  /** 1-based; one round = one player turn then one opponent turn. */
  round: number;
  turn: Side;
  econ: Record<Side, SideEcon>;
  /** Player loadout with remaining copies; opponent kit casts are free. */
  equipped: EquippedAbility[];
  /** Human-readable line describing the opponent's likely next move. */
  oppNextIntent: string | null;
  intentRevealed: boolean;
  /** True once Scan has run: enemy traps stay revealed for the duel. */
  trapsRevealed: boolean;
  /** Opponent route cost measured at duel start (strain formula baseline). */
  oppStartCost: number;
  strainChip: number;
  rngState: RngState;
  claimCounter: number;
  fx: DuelFx[];
  fxNext: number;
  notice: { id: number; text: string } | null;
  /** Opponent turn bookkeeping, reset each opponent turn. */
  oppTurn: {
    started: boolean;
    pendingAbility: AbilityId | null;
    /** Committed rotation queue for this turn, absolute target rotations. */
    queue: Array<{ idx: number; targetRot: number }>;
    replans: number;
    /** Route cost at the last replan; the next needs strict progress. */
    lastReplanCost: number;
    /**
     * Telegraph beat: the move the machine has locked in but not yet made.
     * The UI highlights it for one tick before it lands.
     */
    aim:
      | { kind: "rotate"; idx: number }
      | { kind: "cast"; id: AbilityId; targets: number[]; abilityTarget?: AbilityId }
      | null;
  };
  oppDominantUsed: boolean;
  /** Round when the player last hit the opponent (Arm/Redirect/Shield-lock). */
  lastPlayerHitRound: number;
  /** Tutorial only: the machine force-seals when this round begins. */
  tutorialSealRound: number;
}

export const ROUND_CAP = 25;
