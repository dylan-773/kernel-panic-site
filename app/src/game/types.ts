/**
 * Shared grid primitives for the Kernel Panic duel engine.
 *
 * Arms are a 4-bit mask; `rot` is a clockwise quarter-turn offset. A
 * connection exists between two adjacent cells when both current
 * orientations have arms facing each other.
 */

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

export function cellIndex(w: number, x: number, y: number): number {
  return y * w + x;
}
