import {
  Board,
  Cell,
  DX,
  DY,
  PowerResult,
  cellIndex,
  effectiveArms,
  oppositeDir,
} from "./types";

/**
 * Propagate signal from the player source across the grid.
 *
 * Rules:
 * - Power crosses an edge only when both cells have arms facing each other.
 * - Corrupt nodes never conduct. A live connection into an unspent corrupt
 *   node is reported as a contact (the caller applies the spread).
 * - AND nodes absorb power without forwarding until at least two distinct
 *   arms receive a feed, resolved with a fixed-point loop so a feed can never
 *   depend on the AND node's own output. A fed but unsatisfied AND is marked
 *   powered (it glows as "fed") but never emits.
 */
export function computePower(board: Board): PowerResult {
  const { cells, w, h } = board;
  const satisfied = new Set<number>();

  let powered: boolean[] = [];
  const andFeeds = new Map<number, number>();

  const emits = (i: number): boolean => {
    const c = cells[i];
    if (c.kind === "corrupt") return false;
    if (c.kind === "and") return satisfied.has(i);
    return true;
  };

  for (let pass = 0; pass < 8; pass++) {
    powered = new Array(cells.length).fill(false);
    const queue: number[] = [];

    for (let i = 0; i < cells.length; i++) {
      if (cells[i].kind === "source") {
        powered[i] = true;
        queue.push(i);
      }
    }

    while (queue.length > 0) {
      const i = queue.pop() as number;
      if (!emits(i)) continue;
      const c = cells[i];
      const arms = effectiveArms(c);
      for (let d = 0; d < 4; d++) {
        if ((arms & (1 << d)) === 0) continue;
        const nx = c.x + DX[d];
        const ny = c.y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = cellIndex(w, nx, ny);
        const n = cells[ni];
        if ((effectiveArms(n) & (1 << oppositeDir(d))) === 0) continue;
        if (n.kind === "corrupt") continue;
        if (!powered[ni]) {
          powered[ni] = true;
          queue.push(ni);
        }
      }
    }

    andFeeds.clear();
    let changed = false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].kind !== "and") continue;
      const feeds = countFeeds(cells, w, h, i, powered, emits);
      andFeeds.set(i, feeds);
      if (feeds >= 2 && !satisfied.has(i)) {
        satisfied.add(i);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const emitsFinal = (i: number): boolean => {
    const c = cells[i];
    if (c.kind === "corrupt") return false;
    if (c.kind === "and") return satisfied.has(i);
    return true;
  };

  const contacts: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.kind !== "corrupt" || c.spent) continue;
    if (countFeeds(cells, w, h, i, powered, emitsFinal) > 0) contacts.push(i);
  }

  return { powered, andFeeds, satisfiedAnds: satisfied, contacts };
}

/**
 * Distinct arm directions of cell `i` receiving power from a neighbor that is
 * both lit and actually emitting.
 */
function countFeeds(
  cells: Cell[],
  w: number,
  h: number,
  i: number,
  powered: boolean[],
  emits: (idx: number) => boolean,
): number {
  const c = cells[i];
  const arms = effectiveArms(c);
  let feeds = 0;
  for (let d = 0; d < 4; d++) {
    if ((arms & (1 << d)) === 0) continue;
    const nx = c.x + DX[d];
    const ny = c.y + DY[d];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const ni = cellIndex(w, nx, ny);
    if (!powered[ni] || !emits(ni)) continue;
    if ((effectiveArms(cells[ni]) & (1 << oppositeDir(d))) !== 0) feeds++;
  }
  return feeds;
}
