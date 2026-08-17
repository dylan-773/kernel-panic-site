import { BASE_REACH } from "./content/kit";
import { Board, DuelCell, DuelState, Side, TrapKind, isJunction } from "./duel-types";
import { DX, DY, cellIndex, oppositeDir, rotateArms } from "./types";

/**
 * Live-power propagation and the rotation-cost route metric, both scoped to a
 * single board.
 *
 * There is no territory here and nothing to claim. A board belongs to exactly
 * one side, so the only question a cell answers is "is my signal reaching it
 * right now". `computePower` is the pure read; `settlePower` is the same walk
 * with the two side effects that need to happen exactly once per change:
 * marking cells BUILT the first time they light, and springing traps.
 *
 * This is the function the whole design leans on. Under the old flood-claim
 * model it was decoration that drove an arm animation.
 */

export function effectiveDuelArms(c: DuelCell): number {
  return rotateArms(c.base, c.rot);
}

/** Slag is the only thing signal cannot enter. */
function passable(c: DuelCell): boolean {
  return c.kind !== "block";
}

/** Do these two adjacent cells have arms facing each other right now? */
function joined(from: DuelCell, to: DuelCell, d: number): boolean {
  if ((effectiveDuelArms(from) & (1 << d)) === 0) return false;
  return (effectiveDuelArms(to) & (1 << oppositeDir(d))) !== 0;
}

function neighbourIdx(b: Board, c: DuelCell, d: number): number {
  const nx = c.x + DX[d];
  const ny = c.y + DY[d];
  if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) return -1;
  return cellIndex(b.w, nx, ny);
}

/**
 * Which cells are currently carrying signal from the entry. Pure: safe to
 * call from planners and from the renderer.
 */
export function computePower(b: Board): boolean[] {
  const out = new Array<boolean>(b.cells.length).fill(false);
  out[b.entry] = true;
  // Head pointer, not shift(): shift() is O(n) on a JS array, which made this
  // flood O(cells^2), and it runs on every rotation and inside the cut
  // scorer's per-candidate loop.
  const queue = [b.entry];
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const c = b.cells[i];
    for (let d = 0; d < 4; d++) {
      const ni = neighbourIdx(b, c, d);
      if (ni < 0 || out[ni]) continue;
      const nc = b.cells[ni];
      if (!passable(nc) || !joined(c, nc, d)) continue;
      out[ni] = true;
      // The goal is a sink: signal arrives and stops. Letting it conduct
      // would light the whole goal column off one contact.
      if (nc.kind !== "goal") queue.push(ni);
    }
  }
  return out;
}

export interface SettleResult {
  power: boolean[];
  /** Nodes lit for the first time this settle, in light order. Cascade pays
   *  on these only: re-lighting after a cut is a repair, not an achievement. */
  built: number[];
  /** Traps sprung on this board's owner this settle. */
  trapsFired: Array<{ idx: number; kind: TrapKind; drain: number }>;
  reachedGoal: boolean;
}

/**
 * Recompute power and apply the two once-per-change effects. A trap fires the
 * first time signal reaches its node and is consumed; it never blocks, so the
 * cascade keeps running past it exactly as it always did.
 *
 * This runs after EVERY rotation, which is the whole texture of the game: you
 * twist one junction and the board answers immediately. The turn's one undo
 * puts your alignment back, and deliberately does not put a sprung trap back —
 * see `takeUndo` in duel-commands.
 */
export function settlePower(b: Board): SettleResult {
  const power = computePower(b);
  const built: number[] = [];
  const trapsFired: Array<{ idx: number; kind: TrapKind; drain: number }> = [];
  let reachedGoal = false;

  for (let i = 0; i < b.cells.length; i++) {
    if (!power[i]) continue;
    const c = b.cells[i];
    if (c.kind === "goal") {
      reachedGoal = true;
      continue;
    }
    if (!isJunction(c) || c.built) continue;
    c.built = true;
    c.litWave = built.length;
    built.push(i);
    if (c.trap) {
      const trap = c.trap;
      c.trap = null;
      trapsFired.push({ idx: i, kind: trap.kind, drain: trap.drain });
    }
  }

  b.power = power;
  return { power, built, trapsFired, reachedGoal };
}

/** Is this side's signal currently reaching its goal column? */
export function goalLive(b: Board): boolean {
  return b.goal.some((i) => b.power[i]);
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

/**
 * What it costs the board's owner to undo one enemy twist of this cell.
 * Unidirectional rotation makes this 3 on an elbow or T, 1 on a straight and
 * 0 on a cross — the exchange rate that makes reaching across worth the RAM.
 * The cut scorer weights targets by it.
 */
export function repairCostOf(c: DuelCell): number {
  if (c.fused) return 0;
  const arms = effectiveDuelArms(c);
  for (let k = 1; k < 4; k++) {
    if (rotateArms(c.base, (c.rot + k) % 4) === arms) return k;
  }
  return 3;
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
  /** Every node on the route, entry side first, aligned nodes included. */
  path: RouteStep[];
  /** Only the nodes still needing rotation. */
  steps: RouteStep[];
  /**
   * The reroute search ran out of attempts and this plan still crosses
   * itself at one junction: the cost is a lower bound and executing the
   * queue verbatim will not conduct. A route DOES exist, which is the part
   * callers must not get wrong.
   */
  approx?: boolean;
}

/**
 * Cheapest-rotation route from a board's entry to any of its goal cells:
 * Dijkstra over (cell, entry-direction) states where a node's cost is the
 * quarter-turns needed to give it both the entry arm and the chosen exit arm.
 * This is the board generator's fairness metric, both planners, and the
 * round-cap tiebreak.
 */
export function routePlan(b: Board, avoid?: Set<number>, depth = 0): RoutePlan | null {
  const n = b.cells.length;
  const dist = new Array<number>(n * 4).fill(Infinity);
  const prev = new Array<number>(n * 4).fill(-1);
  const buckets: number[][] = [[]];
  const push = (state: number, d: number) => {
    while (buckets.length <= d) buckets.push([]);
    buckets[d].push(state);
  };

  const startCell = b.cells[b.entry];
  const startArms = effectiveDuelArms(startCell);
  for (let d = 0; d < 4; d++) {
    if ((startArms & (1 << d)) === 0) continue;
    const ni = neighbourIdx(b, startCell, d);
    if (ni < 0) continue;
    const nc = b.cells[ni];
    if (!passable(nc) || (avoid && avoid.has(ni))) continue;
    if (nc.kind === "goal") return { cost: 0, path: [], steps: [] };
    if (!isJunction(nc)) continue;
    const st = ni * 4 + d;
    if (dist[st] > 0) {
      dist[st] = 0;
      push(st, 0);
    }
  }

  // Best completed route: cost, the final (cell,dirIn) state, and which goal
  // cell it lands on. Multiple goals means the terminal is not a constant.
  let bestGoal = Infinity;
  let bestGoalState = -1;
  let bestGoalCell = -1;

  for (let d = 0; d < buckets.length; d++) {
    if (d >= bestGoal) break;
    const bucket = buckets[d];
    if (!bucket) continue;
    while (bucket.length > 0) {
      const st = bucket.pop() as number;
      if (dist[st] < d) continue;
      const i = st >> 2;
      const dIn = st & 3;
      const c = b.cells[i];
      for (let dOut = 0; dOut < 4; dOut++) {
        if (dOut === oppositeDir(dIn)) continue;
        const ni = neighbourIdx(b, c, dOut);
        if (ni < 0) continue;
        const nc = b.cells[ni];
        if (!passable(nc) || (avoid && avoid.has(ni))) continue;
        const needed = (1 << oppositeDir(dIn)) | (1 << dOut);
        let k = rotCostFor(c, needed);
        if (!isFinite(k)) continue;
        // Re-rotating a built node rewires the chain that feeds it and drops
        // everything downstream dark — legal, but bias toward fresh junctions.
        if (k > 0 && c.built) k += 1;
        const nd = d + k;
        if (nc.kind === "goal") {
          if (nd < bestGoal) {
            bestGoal = nd;
            bestGoalState = st;
            bestGoalCell = ni;
          }
          continue;
        }
        if (!isJunction(nc)) continue;
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
    const c = b.cells[i];
    const nextIdx = ci + 1 < chain.length ? chain[ci + 1] >> 2 : bestGoalCell;
    const dOut = dirBetween(c, b.cells[nextIdx]);
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
      return routePlan(b, nextAvoid, depth + 1);
    }
    // Out of reroutes. Reporting null here reads as "no route exists".
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

export function routeCost(b: Board, avoid?: Set<number>): number {
  const plan = routePlan(b, avoid);
  return plan ? plan.cost : Infinity;
}

/** Unbuilt nodes orthogonally adjacent to built ground (the entry included). */
export function isFrontier(b: Board, idx: number): boolean {
  const c = b.cells[idx];
  if (!isJunction(c) || c.built) return false;
  for (let d = 0; d < 4; d++) {
    const ni = neighbourIdx(b, c, d);
    if (ni < 0) continue;
    const nc = b.cells[ni];
    if (nc.kind === "entry") return true;
    if (isJunction(nc) && nc.built) return true;
  }
  return false;
}

/** How many steps out from built ground a side may rotate fresh junctions. */
export function reachOf(s: DuelState, side: Side): number {
  if (side === "player" && s.kit.augments.includes("longArms")) return BASE_REACH + 2;
  return BASE_REACH;
}

/**
 * Is this fresh node within `reach` steps of built ground, walking only
 * through unbuilt junctions? Depth 1 is the classic frontier; the default
 * reach of 2 lets a diver line up a chain before lighting it.
 *
 * Walking from BUILT rather than from LIVE is deliberate: an enemy cut takes
 * your power but must never take back your frontier, or a single redirect
 * deep in the chain would strand everything you had set up ahead of it.
 */
export function inReach(b: Board, idx: number, reach: number): boolean {
  const c0 = b.cells[idx];
  if (!isJunction(c0) || c0.built) return false;
  return withinReachWalk(b, idx, reach);
}

/** May this side fill this slag block with a patch cell (same reach walk)? */
export function canPlace(b: Board, idx: number, reach: number): boolean {
  const c0 = b.cells[idx];
  if (!c0 || c0.kind !== "block") return false;
  return withinReachWalk(b, idx, reach);
}

function withinReachWalk(b: Board, idx: number, reach: number): boolean {
  const seen = new Set<number>([idx]);
  let frontier = [idx];
  for (let step = 1; step <= reach; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      const c = b.cells[i];
      for (let d = 0; d < 4; d++) {
        const ni = neighbourIdx(b, c, d);
        if (ni < 0 || seen.has(ni)) continue;
        const nc = b.cells[ni];
        if (nc.kind === "entry") return true;
        if (isJunction(nc) && nc.built) return true;
        if (isJunction(nc) && !nc.built && step < reach) {
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

/**
 * May this side rotate the node on its own board right now? Built ground is
 * always yours to rewire; fresh ground has to be in reach. An enemy LOCK is
 * the only thing that can stop you.
 */
export function canRotate(s: DuelState, side: Side, idx: number): boolean {
  const b = s.boards[side];
  const c = b.cells[idx];
  if (!c || !isJunction(c)) return false;
  if (c.fused) return false;
  if (c.lockedThroughRound >= s.round && c.lockedBy !== null && c.lockedBy !== side) return false;
  if (c.built) return true;
  return inReach(b, idx, reachOf(s, side));
}
