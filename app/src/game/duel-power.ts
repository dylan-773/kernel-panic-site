import { DuelCell, DuelPower, Side } from "./duel-types";
import { DX, DY, cellIndex, oppositeDir, rotateArms } from "./types";

/**
 * Two independent signal floods over one shared board. A side's signal
 * enters at its port and travels only through its own placed nodes; the
 * neutral core conducts for both sides. An edge conducts when both cells'
 * current orientations have arms facing each other.
 */

function conducts(cells: DuelCell[], side: Side, i: number): boolean {
  const c = cells[i];
  if (c.kind === "core") return true;
  if (c.kind === "entryP") return side === "player";
  if (c.kind === "entryO") return side === "opp";
  return c.kind === "node" && c.owner === side;
}

export function effectiveDuelArms(c: DuelCell): number {
  return rotateArms(c.base, c.rot);
}

function flood(cells: DuelCell[], w: number, h: number, side: Side, start: number): boolean[] {
  const out = new Array<boolean>(cells.length).fill(false);
  if (start < 0) return out;
  out[start] = true;
  const queue = [start];
  while (queue.length > 0) {
    const i = queue.pop() as number;
    const arms = effectiveDuelArms(cells[i]);
    const x = i % w;
    const y = Math.floor(i / w);
    for (let d = 0; d < 4; d++) {
      if ((arms & (1 << d)) === 0) continue;
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = cellIndex(w, nx, ny);
      if (out[ni]) continue;
      if (!conducts(cells, side, ni)) continue;
      const narms = effectiveDuelArms(cells[ni]);
      if ((narms & (1 << oppositeDir(d))) === 0) continue;
      out[ni] = true;
      queue.push(ni);
    }
  }
  return out;
}

export function computeDuelPower(
  cells: DuelCell[],
  w: number,
  h: number,
  entryP: number,
  entryO: number,
): DuelPower {
  return {
    player: flood(cells, w, h, "player", entryP),
    opp: flood(cells, w, h, "opp", entryO),
  };
}

/**
 * Minimum placements a side still needs to reach the core: 0/1 BFS from the
 * side's network (own nodes + own port) where stepping into an empty cell
 * costs 1 and moving through own cells costs 0; enemy cells block. Ignores
 * arm geometry — it is a potential, not a guarantee — which is what the
 * turn-cap tiebreak and the strain formula want. Infinity = walled off.
 */
export function placementsToCore(
  cells: DuelCell[],
  w: number,
  h: number,
  side: Side,
  coreIdx: number,
): number {
  const dist = new Array<number>(cells.length).fill(Infinity);
  const deque: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].kind !== "core" && conducts(cells, side, i)) {
      dist[i] = 0;
      deque.push(i);
    }
  }
  while (deque.length > 0) {
    // 0/1 BFS: pull lowest-distance entry (deque stays near-sorted because
    // 0-cost relaxations unshift and 1-cost relaxations push).
    const i = deque.shift() as number;
    const d = dist[i];
    if (i === coreIdx) return d;
    const x = i % w;
    const y = Math.floor(i / w);
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = cellIndex(w, nx, ny);
      const nc = cells[ni];
      let cost: number;
      if (nc.kind === "core") cost = 0;
      else if (nc.kind === "empty") cost = 1;
      else if (conducts(cells, side, ni)) cost = 0;
      else continue;
      const nd = d + cost;
      if (nd >= dist[ni]) continue;
      dist[ni] = nd;
      if (cost === 0) deque.unshift(ni);
      else deque.push(ni);
    }
  }
  return dist[coreIdx];
}

/**
 * Shortest placement path for the opponent AI: parent-tracked variant of
 * placementsToCore that returns the ordered list of EMPTY cell indexes to
 * fill, ending at the cell adjacent to the core. Null when walled off.
 */
export function placementPath(
  cells: DuelCell[],
  w: number,
  h: number,
  side: Side,
  coreIdx: number,
): number[] | null {
  const dist = new Array<number>(cells.length).fill(Infinity);
  const parent = new Array<number>(cells.length).fill(-1);
  const deque: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].kind !== "core" && conducts(cells, side, i)) {
      dist[i] = 0;
      deque.push(i);
    }
  }
  while (deque.length > 0) {
    const i = deque.shift() as number;
    const d = dist[i];
    if (i === coreIdx) break;
    const x = i % w;
    const y = Math.floor(i / w);
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = cellIndex(w, nx, ny);
      const nc = cells[ni];
      let cost: number;
      if (nc.kind === "core") cost = 0;
      else if (nc.kind === "empty") cost = 1;
      else if (conducts(cells, side, ni)) cost = 0;
      else continue;
      const nd = d + cost;
      if (nd >= dist[ni]) continue;
      dist[ni] = nd;
      parent[ni] = i;
      if (cost === 0) deque.unshift(ni);
      else deque.push(ni);
    }
  }
  if (!isFinite(dist[coreIdx])) return null;
  const path: number[] = [];
  let cur = coreIdx;
  while (cur !== -1) {
    if (cells[cur].kind === "empty") path.push(cur);
    cur = parent[cur];
  }
  return path.reverse();
}
