/**
 * Shared model for the Kernel Panic dive engine.
 *
 * Every dive is a grid of rotatable junction nodes. Arms are a 4-bit mask in
 * the node's SOLVED orientation; `rot` is the current clockwise quarter-turn
 * offset. A connection exists between two adjacent nodes when both current
 * orientations have arms facing each other.
 */

export type DiveType = "hardware" | "network" | "data" | "software";

export const DIVE_TYPES: DiveType[] = ["hardware", "network", "data", "software"];

/** Direction indexes: 0 north, 1 east, 2 south, 3 west. Bit = 1 << dir. */
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export function oppositeDir(d: number): number {
  return (d + 2) % 4;
}

/** Rotate an arm bitmask clockwise by `rot` quarter turns. */
export function rotateArms(mask: number, rot: number): number {
  const r = ((rot % 4) + 4) % 4;
  return ((mask << r) | (mask >> (4 - r))) & 0xf;
}

export type CellKind =
  | "normal"
  | "source"
  | "core"
  | "and"
  | "loot"
  | "frag"
  | "corrupt"
  | "advsource";

export interface Cell {
  x: number;
  y: number;
  /** Arm bitmask in the solved orientation. */
  base: number;
  /** Current rotation, 0..3 clockwise quarter turns. */
  rot: number;
  /** Cumulative clockwise quarter turns, for monotonic spin animation. */
  spin: number;
  fixed: boolean;
  kind: CellKind;
  /** Hardware: remaining force clicks while the connector is jammed. */
  jam: number;
  /** Software: bug order index, 1..K. 0 means not a bug. */
  bug: number;
  patched: boolean;
  /** Data: corrupt node that has already triggered. */
  spent: boolean;
  looted: boolean;
  recovered: boolean;
  lost: boolean;
  /** Data: scarred by a nearby corruption bloom (visual only). */
  seared: boolean;
  /** Network: dive-clock ms until which this node is attack-locked. */
  lockedUntil: number;
}

export interface Board {
  type: DiveType;
  w: number;
  h: number;
  cells: Cell[];
  sourceIdx: number;
  /** -1 for software dives (the objective is the bug list, not a core). */
  coreIdx: number;
  advSourceIdx: number;
  /** Network: node indexes from the adversary port to the core, inclusive. */
  advPath: number[];
  /** Data: reference move count for a clean recovery. */
  parMoves: number;
  bugCount: number;
  fragCount: number;
  lootCount: number;
  /** Network: ms per adversary advance, tuned to the scramble at gen time. */
  advIntervalMs: number;
  /** Software: starting crash timer in ms, tuned to the scramble. */
  crashBaseMs: number;
}

export interface PowerResult {
  powered: boolean[];
  /** Feeds currently arriving at each AND node (by cell index). */
  andFeeds: Map<number, number>;
  satisfiedAnds: Set<number>;
  /** Corrupt cell indexes with a live connection from a powered neighbor. */
  contacts: number[];
}

export function cellIndex(w: number, x: number, y: number): number {
  return y * w + x;
}

export function effectiveArms(c: Cell): number {
  return rotateArms(c.base, c.rot);
}

/**
 * Minimum clicks to give a cell every arm direction in `neededMask`.
 * Returns 0..3, or 0 when the requirement is already met.
 */
export function clicksToAlign(c: Cell, neededMask: number): number {
  for (let k = 0; k < 4; k++) {
    if ((rotateArms(c.base, (c.rot + k) % 4) & neededMask) === neededMask) return k;
  }
  return 0;
}
