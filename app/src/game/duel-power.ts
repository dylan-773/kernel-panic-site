import { BASE_REACH } from "./content/kit";
import { DuelCell, DuelPower, DuelState, Side, TrapKind, otherSide } from "./duel-types";
import { DX, DY, cellIndex, oppositeDir, rotateArms } from "./types";

/**
 * Flood-claim propagation and the rotation-cost route metric. The flood is
 * a mutating operation: every neutral node a side's signal reaches becomes
 * that side's territory. Traps stop the flood at the node they occupy.
 */

export function effectiveDuelArms(c: DuelCell): number {
  return rotateArms(c.base, c.rot);
}

function entryOf(side: Side): "entryP" | "entryO" {
  return side === "player" ? "entryP" : "entryO";
}

/** May this side's signal enter the cell at all (ignoring arms)? */
function passable(c: DuelCell, side: Side): boolean {
  if (c.kind === "block") return false;
  if (c.kind === "core") return true;
  if (c.kind === "entryP") return side === "player";
  if (c.kind === "entryO") return side === "opp";
  return c.owner === "none" || c.owner === side;
}

export interface FloodResult {
  reached: boolean[];
  /** Indexes claimed by this flood, in claim order. */
  claimed: number[];
  /** Traps sprung on the flooding side this settle, in claim order. */
  trapsFired: Array<{ idx: number; kind: TrapKind; drain: number }>;
  reachedCore: boolean;
}

/**
 * Run one side's flood, claiming neutral nodes it touches. A trapped
 * neutral node is claimed and consumes the trap. Traps are tempo hits
 * (a lost turn or a RAM drain), never walls: the cascade keeps
 * expanding past a sprung trap.
 */
export function runFlood(s: DuelState, side: Side): FloodResult {
  const start = side === "player" ? s.entryP : s.entryO;
  const enemy = otherSide(side);
  const reached = new Array<boolean>(s.cells.length).fill(false);
  const claimed: number[] = [];
  const trapsFired: Array<{ idx: number; kind: TrapKind; drain: number }> = [];
  let reachedCore = false;

  reached[start] = true;
  const queue = [start];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    const c = s.cells[i];
    const arms = effectiveDuelArms(c);
    for (let d = 0; d < 4; d++) {
      if ((arms & (1 << d)) === 0) continue;
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const ni = cellIndex(s.w, nx, ny);
      if (reached[ni]) continue;
      const nc = s.cells[ni];
      if (!passable(nc, side)) continue;
      if ((effectiveDuelArms(nc) & (1 << oppositeDir(d))) === 0) continue;
      reached[ni] = true;
      if (nc.kind === "core") {
        reachedCore = true;
        continue;
      }
      if (nc.kind === "node" && nc.owner === "none") {
        // Claim it.
        nc.owner = side;
        nc.claimSeq = ++s.claimCounter;
        nc.claimWave = claimed.length;
        claimed.push(ni);
        if (nc.trap && nc.trap.by === enemy) {
          const trap = nc.trap;
          nc.trap = null;
          trapsFired.push({ idx: ni, kind: trap.kind, drain: trap.drain });
        }
      }
      queue.push(ni);
    }
  }
  return { reached, claimed, trapsFired, reachedCore };
}

export function computeDuelPower(s: DuelState): DuelPower {
  // Non-mutating power readout for rendering: which cells are currently lit.
  // (Claims only change inside settle; here ownership is already fixed, so a
  // plain reachability pass per side is safe.)
  const read = (side: Side): boolean[] => {
    const start = side === "player" ? s.entryP : s.entryO;
    const out = new Array<boolean>(s.cells.length).fill(false);
    out[start] = true;
    const queue = [start];
    while (queue.length > 0) {
      const i = queue.shift() as number;
      const c = s.cells[i];
      const arms = effectiveDuelArms(c);
      for (let d = 0; d < 4; d++) {
        if ((arms & (1 << d)) === 0) continue;
        const nx = c.x + DX[d];
        const ny = c.y + DY[d];
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        const ni = cellIndex(s.w, nx, ny);
        if (out[ni]) continue;
        const nc = s.cells[ni];
        if (nc.kind === "block") continue;
        if (nc.kind === "entryP" && side !== "player") continue;
        if (nc.kind === "entryO" && side !== "opp") continue;
        if (nc.kind === "node" && nc.owner !== side) continue; // only own territory lights
        if ((effectiveDuelArms(nc) & (1 << oppositeDir(d))) === 0) continue;
        out[ni] = true;
        if (nc.kind !== "core") queue.push(ni);
      }
    }
    return out;
  };
  return { player: read("player"), opp: read("opp") };
}

/** Min quarter-turns so the cell's arms cover `needed` (Infinity if never). */
export function rotCostFor(c: DuelCell, needed: number): number {
  if (c.fused) {
    // Welded patch piece: its orientation is the only orientation.
    return (rotateArms(c.base, c.rot) & needed) === needed ? 0 : Infinity;
  }
  for (let k = 0; k < 4; k++) {
    if ((rotateArms(c.base, (c.rot + k) % 4) & needed) === needed) return k;
  }
  return Infinity;
}

export interface RouteStep {
  idx: number;
  /** Rotation the plan wants this node at (absolute rot value 0..3). */
  targetRot: number;
  /** Quarter turns still needed from the current rotation. */
  turns: number;
}

export interface RoutePlan {
  cost: number;
  /** Every node on the route, port side first, aligned nodes included. */
  path: RouteStep[];
  /** Only the nodes still needing rotation. */
  steps: RouteStep[];
  /**
   * The reroute search ran out of attempts and this plan still crosses
   * itself at one junction: the cost is a lower bound and executing the
   * queue verbatim will not conduct. A route DOES exist, which is the part
   * callers testing for "walled off" must not get wrong.
   */
  approx?: boolean;
}

/**
 * Cheapest-rotation route from a side's port to the core: Dijkstra over
 * (cell, entry-direction) states where a node's cost is the quarter-turns
 * needed to give it both the entry arm and the chosen exit arm. Enemy
 * territory is impassable. This is the board generator's fairness metric,
 * the opponent's planner, and the turn-cap tiebreak.
 */
export function routePlan(
  s: DuelState,
  side: Side,
  avoid?: Set<number>,
  depth = 0,
): RoutePlan | null {
  const n = s.cells.length;
  const start = side === "player" ? s.entryP : s.entryO;
  const dist = new Array<number>(n * 4).fill(Infinity);
  const prev = new Array<number>(n * 4).fill(-1);
  const buckets: number[][] = [[]];
  const push = (state: number, d: number) => {
    while (buckets.length <= d) buckets.push([]);
    buckets[d].push(state);
  };

  const startCell = s.cells[start];
  const startArms = effectiveDuelArms(startCell);
  for (let d = 0; d < 4; d++) {
    if ((startArms & (1 << d)) === 0) continue;
    const nx = startCell.x + DX[d];
    const ny = startCell.y + DY[d];
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
    const ni = cellIndex(s.w, nx, ny);
    const nc = s.cells[ni];
    if (!passable(nc, side) || (avoid && avoid.has(ni))) continue;
    if (nc.kind === "core") return { cost: 0, path: [], steps: [] };
    if (nc.kind !== "node") continue;
    const st = ni * 4 + d;
    if (dist[st] > 0) {
      dist[st] = 0;
      push(st, 0);
    }
  }
  void n;

  // Best completed route: cost and the final (cell,dirIn) state.
  let bestGoal = Infinity;
  let bestGoalState = -1;

  for (let d = 0; d < buckets.length; d++) {
    if (d >= bestGoal) break;
    const bucket = buckets[d];
    if (!bucket) continue;
    while (bucket.length > 0) {
      const st = bucket.pop() as number;
      if (dist[st] < d) continue;
      const i = st >> 2;
      const dIn = st & 3;
      const c = s.cells[i];
      for (let dOut = 0; dOut < 4; dOut++) {
        if (dOut === oppositeDir(dIn)) continue;
        const nx = c.x + DX[dOut];
        const ny = c.y + DY[dOut];
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        const ni = cellIndex(s.w, nx, ny);
        const nc = s.cells[ni];
        if (!passable(nc, side) || (avoid && avoid.has(ni))) continue;
        const needed = (1 << oppositeDir(dIn)) | (1 << dOut);
        let k = rotCostFor(c, needed);
        if (!isFinite(k)) continue;
        // Re-rotating an already-claimed chain node rewires the chain that
        // feeds it — legal, but bias routes toward fresh neutral junctions.
        if (k > 0 && c.owner === side) k += 1;
        const nd = d + k;
        if (nc.kind === "core") {
          if (nd < bestGoal) {
            bestGoal = nd;
            bestGoalState = st;
          }
          continue;
        }
        if (nc.kind !== "node") continue;
        const nst = ni * 4 + dOut;
        if (nd < dist[nst]) {
          dist[nst] = nd;
          prev[nst] = st;
          push(nst, nd);
        }
      }
    }
  }

  if (bestGoalState === -1) return null;

  const chain: number[] = [];
  let cur = bestGoalState;
  while (cur !== -1) {
    chain.push(cur);
    cur = prev[cur];
  }
  chain.reverse();

  const path: RouteStep[] = [];
  let total = 0;
  const seenRot = new Map<number, number>();
  let conflict = -1;
  for (let ci = 0; ci < chain.length; ci++) {
    const st = chain[ci];
    const i = st >> 2;
    const dIn = st & 3;
    const c = s.cells[i];
    const nextIdx = ci + 1 < chain.length ? chain[ci + 1] >> 2 : s.coreIdx;
    const dOut = dirBetween(c, s.cells[nextIdx]);
    const needed = (1 << oppositeDir(dIn)) | (1 << dOut);
    const k = rotCostFor(c, needed);
    if (!isFinite(k)) return null;
    const targetRot = (c.rot + k) % 4;
    const prior = seenRot.get(i);
    if (prior !== undefined) {
      if (prior !== targetRot) conflict = i;
      continue; // same requirement twice: count and queue it once
    }
    seenRot.set(i, targetRot);
    total += k;
    path.push({ idx: i, targetRot, turns: k });
  }

  // A route that crosses itself demanding two different orientations of one
  // node is physically impossible: reroute around the conflicted junction.
  if (conflict !== -1) {
    if (depth < 4) {
      const nextAvoid = new Set(avoid ?? []);
      nextAvoid.add(conflict);
      return routePlan(s, side, nextAvoid, depth + 1);
    }
    // Out of reroutes. Reporting null here reads as "no route exists", which
    // is how a still-winnable dive used to end in an instant severed loss.
    return { cost: total, path, steps: path.filter((p) => p.turns > 0), approx: true };
  }
  return { cost: total, path, steps: path.filter((p) => p.turns > 0) };
}

function dirBetween(a: DuelCell, b: DuelCell): number {
  if (b.x - a.x === 1) return 1;
  if (b.x - a.x === -1) return 3;
  if (b.y - a.y === 1) return 2;
  return 0;
}

export function routeCost(s: DuelState, side: Side, avoid?: Set<number>): number {
  const plan = routePlan(s, side, avoid);
  return plan ? plan.cost : Infinity;
}

/** Neutral nodes orthogonally adjacent to a side's territory (its port included). */
export function isFrontier(s: DuelState, side: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (c.kind !== "node" || c.owner !== "none") return false;
  for (let d = 0; d < 4; d++) {
    const nx = c.x + DX[d];
    const ny = c.y + DY[d];
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
    const nc = s.cells[cellIndex(s.w, nx, ny)];
    if (nc.kind === entryOf(side)) return true;
    if (nc.kind === "node" && nc.owner === side) return true;
  }
  return false;
}

/** How many steps out from its territory a side may rotate open junctions. */
export function reachOf(s: DuelState, side: Side): number {
  if (side === "player" && s.kit.augments.includes("longArms")) return BASE_REACH + 2;
  return BASE_REACH;
}

/**
 * Is this neutral node within `reach` steps of the side's territory,
 * walking only through open junctions? Depth 1 is the classic frontier;
 * the default reach of 2 lets a diver line up chains before flooding them.
 */
export function inReach(s: DuelState, side: Side, idx: number, reach: number): boolean {
  const c0 = s.cells[idx];
  if (c0.kind !== "node" || c0.owner !== "none") return false;
  return withinReachWalk(s, side, idx, reach);
}

/** May this side fill this slag block with a patch cell (same reach walk)? */
export function canPlace(s: DuelState, side: Side, idx: number): boolean {
  const c0 = s.cells[idx];
  if (!c0 || c0.kind !== "block") return false;
  return withinReachWalk(s, side, idx, reachOf(s, side));
}

function withinReachWalk(s: DuelState, side: Side, idx: number, reach: number): boolean {
  const seen = new Set<number>([idx]);
  let frontier = [idx];
  for (let step = 1; step <= reach; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      const c = s.cells[i];
      for (let d = 0; d < 4; d++) {
        const nx = c.x + DX[d];
        const ny = c.y + DY[d];
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        const ni = cellIndex(s.w, nx, ny);
        if (seen.has(ni)) continue;
        const nc = s.cells[ni];
        if (nc.kind === entryOf(side)) return true;
        if (nc.kind === "node" && nc.owner === side) return true;
        if (nc.kind === "node" && nc.owner === "none" && step < reach) {
          seen.add(ni);
          next.push(ni);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return false;
}

/** May this side rotate the node right now (reach rule + rotation locks)? */
export function canRotate(s: DuelState, side: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node") return false;
  if (c.fused) return false;
  const enemy = otherSide(side);
  if (c.lockedThroughRound >= s.round && c.lockedBy === enemy) return false;
  if (c.owner === side) return true;
  if (c.owner !== "none") return false;
  return inReach(s, side, idx, reachOf(s, side));
}
