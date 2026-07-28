import { PIECE_I, PIECE_L, PIECE_T, PIECE_X } from "./duel-types";
import { Rng } from "./rng";
import { rotateArms } from "./types";

/**
 * Patch pieces: single-use slag fills with a SHAPE. A piece is exactly its
 * effective 4-bit arm mask, orientation baked in when it was rolled; the
 * player can never rotate a held piece. Placing it burns a slag block into
 * a live junction with those arms. Crafting is the geometric union of two
 * held pieces, legal only when the union is strictly bigger than both
 * inputs, so two opposite elbows or crossed straights make a cross, and
 * adjacent elbows or a straight plus an elbow make a tee.
 */

/** A piece is its arm mask: 4 bits, 2 to 4 arms set. */
export type PatchMask = number;

/** Pouch cap. Shaped scraps are weaker than the old crosses and crafting
 * needs two in hand, so the pouch is roomier than the old cap of 3. */
export const PATCH_POUCH_MAX = 5;

/** Crafting fee in credits. The inputs were already paid for. Balance knob. */
export const CRAFT_COST = 0;

/** RAM to place a piece mid dive. Was 1; the shortcut has to cost tempo. */
export const PLACE_COST = 2;

/** Extra drop chance per job threat tier above 1. Balance knob. */
export const PATCH_DROP_TIER_BONUS = 0.05;

/**
 * Shape weights for every random roll, mirroring the board generator's own
 * drawMask: the dark web sells the parts the grid is made of. Crosses stay
 * a 3 percent jackpot; crafting is the reliable path to one. Balance knob.
 */
export const PATCH_ROLL_WEIGHTS: Array<{ base: number; w: number }> = [
  { base: PIECE_I, w: 40 },
  { base: PIECE_L, w: 45 },
  { base: PIECE_T, w: 12 },
  { base: PIECE_X, w: 3 },
];

/** Dark web sticker price for the day. Balance knob. */
export function darkPatchCost(day: number): number {
  return 25 + 5 * (day - 1);
}

export function armCount(mask: number): number {
  let n = 0;
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) n++;
  return n;
}

/** A well-formed held piece: integer mask, at least two arms. */
export function isPatchMask(v: unknown): v is PatchMask {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v < 16 && armCount(v) >= 2;
}

export function shapeClassOf(mask: PatchMask): "I" | "L" | "T" | "X" {
  const n = armCount(mask);
  if (n >= 4) return "X";
  if (n === 3) return "T";
  return mask === PIECE_I || mask === rotateArms(PIECE_I, 1) ? "I" : "L";
}

/** Weighted shape, uniform orientation, one rng draw each. */
export function rollPatchMask(rng: Rng): PatchMask {
  const total = PATCH_ROLL_WEIGHTS.reduce((n, e) => n + e.w, 0);
  let roll = rng.int(total);
  let base = PATCH_ROLL_WEIGHTS[PATCH_ROLL_WEIGHTS.length - 1].base;
  for (const e of PATCH_ROLL_WEIGHTS) {
    roll -= e.w;
    if (roll < 0) {
      base = e.base;
      break;
    }
  }
  return rotateArms(base, rng.int(4));
}

/**
 * Union craft: combine two held pieces into one whose arms are the union.
 * Legal only when the union is strictly bigger than BOTH inputs, in other
 * words when neither input is a subset of the other. Returns null when the
 * combine is illegal.
 */
export function armUnionCraft(a: PatchMask, b: PatchMask): PatchMask | null {
  const union = (a | b) & 0xf;
  if (armCount(union) <= Math.max(armCount(a), armCount(b))) return null;
  return union;
}
