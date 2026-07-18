import { Rng } from "./rng";
import {
  Board,
  Cell,
  DiveType,
  DX,
  DY,
  cellIndex,
  clicksToAlign,
  effectiveArms,
  oppositeDir,
  rotateArms,
} from "./types";
import { computePower } from "./power";

/**
 * Every dive is generated the same way: carve a random spanning tree over the
 * whole grid (so the solved orientation of every node is exactly its tree
 * edges), place the mode's special nodes under constraints that keep the dive
 * solvable, then scramble rotations. Because only rotations are scrambled,
 * every board can always be returned to its solved orientation, so the
 * generator can never emit an unsolvable dive.
 */
export function generateBoard(type: DiveType, seed: number): Board {
  for (let attempt = 0; attempt < 24; attempt++) {
    const board = tryGenerate(type, seed + attempt * 7919);
    if (board) return board;
  }
  // The constraints are loose enough that 24 tree carves never all fail, but
  // keep a hard fallback: a plain routing board with no special layer.
  for (let attempt = 0; attempt < 64; attempt++) {
    const board = tryGenerate("hardware", seed + 104729 + attempt * 7919, true);
    if (board) return board;
  }
  throw new Error("dive generator could not produce a board");
}

interface Carve {
  w: number;
  h: number;
  treeArms: number[];
  parent: number[];
  dist: number[];
}

function carveTree(w: number, h: number, root: number, rng: Rng): Carve {
  const n = w * h;
  const treeArms = new Array<number>(n).fill(0);
  const parent = new Array<number>(n).fill(-1);
  const dist = new Array<number>(n).fill(-1);
  const visited = new Array<boolean>(n).fill(false);
  const stack = [root];
  visited[root] = true;
  dist[root] = 0;

  while (stack.length > 0) {
    const i = stack[stack.length - 1];
    const x = i % w;
    const y = Math.floor(i / w);
    const dirs = rng.shuffle([0, 1, 2, 3]);
    let advanced = false;
    for (const d of dirs) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = cellIndex(w, nx, ny);
      if (visited[ni]) continue;
      visited[ni] = true;
      parent[ni] = i;
      dist[ni] = dist[i] + 1;
      treeArms[i] |= 1 << d;
      treeArms[ni] |= 1 << oppositeDir(d);
      stack.push(ni);
      advanced = true;
      break;
    }
    if (!advanced) stack.pop();
  }
  return { w, h, treeArms, parent, dist };
}

function pathToRoot(carve: Carve, from: number): number[] {
  const path: number[] = [];
  let cur = from;
  while (cur !== -1) {
    path.push(cur);
    cur = carve.parent[cur];
  }
  return path.reverse(); // root ... from
}

function treeDegree(mask: number): number {
  let c = 0;
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) c++;
  return c;
}

function gridDist(w: number, a: number, b: number): number {
  return Math.abs((a % w) - (b % w)) + Math.abs(Math.floor(a / w) - Math.floor(b / w));
}

function dirBetween(w: number, from: number, to: number): number {
  const dx = (to % w) - (from % w);
  const dy = Math.floor(to / w) - Math.floor(from / w);
  if (dx === 1) return 1;
  if (dx === -1) return 3;
  if (dy === 1) return 2;
  return 0;
}

function gridNeighbors(w: number, h: number, i: number): number[] {
  const out: number[] = [];
  const x = i % w;
  const y = Math.floor(i / w);
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(cellIndex(w, nx, ny));
  }
  return out;
}

function makeCells(carve: Carve): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < carve.w * carve.h; i++) {
    cells.push({
      x: i % carve.w,
      y: Math.floor(i / carve.w),
      base: carve.treeArms[i],
      rot: 0,
      spin: 0,
      fixed: false,
      kind: "normal",
      jam: 0,
      bug: 0,
      patched: false,
      spent: false,
      looted: false,
      recovered: false,
      lost: false,
      seared: false,
      lockedUntil: 0,
    });
  }
  return cells;
}

/** Needed arm mask per protected cell: tree edges to other protected cells. */
function neededMasks(carve: Carve, protectedSet: Set<number>): Map<number, number> {
  const map = new Map<number, number>();
  for (const i of protectedSet) {
    let mask = 0;
    const arms = carve.treeArms[i];
    for (let d = 0; d < 4; d++) {
      if ((arms & (1 << d)) === 0) continue;
      const ni = cellIndex(
        carve.w,
        (i % carve.w) + DX[d],
        Math.floor(i / carve.w) + DY[d],
      );
      if (protectedSet.has(ni)) mask |= 1 << d;
    }
    map.set(i, mask);
  }
  return map;
}

function tryGenerate(type: DiveType, seed: number, bare = false): Board | null {
  const rng = new Rng(seed);
  const w = type === "network" ? 9 : 7;
  const h = 6;
  const n = w * h;
  const midY = Math.floor(h / 2);
  const sourceIdx = cellIndex(w, 0, midY);

  const carve = carveTree(w, h, sourceIdx, rng);
  const cells = makeCells(carve);
  cells[sourceIdx].kind = "source";
  cells[sourceIdx].fixed = true;

  let coreIdx = -1;
  let advSourceIdx = -1;
  let advPath: number[] = [];
  const protectedSet = new Set<number>([sourceIdx]);
  let bugCount = 0;
  let fragCount = 0;
  let lootCount = 0;

  const farthestCore = (minX: number, minDist: number): number => {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (i === sourceIdx || i % w < minX) continue;
      if (best === -1 || carve.dist[i] > carve.dist[best]) best = i;
    }
    if (best === -1 || carve.dist[best] < minDist) return -1;
    return best;
  };

  if (type === "hardware" || type === "data" || bare) {
    coreIdx = farthestCore(w - 2, 7);
    if (coreIdx === -1) return null;
    for (const p of pathToRoot(carve, coreIdx)) protectedSet.add(p);
    cells[coreIdx].kind = "core";
  }

  if (type === "hardware" && !bare) {
    // AND node: a path cell that can take one extra non-tree edge fed from the
    // source side, so it only opens when routed from two directions.
    const path = pathToRoot(carve, coreIdx);
    const candidates: Array<{ a: number; b: number; d: number }> = [];
    for (let pi = 3; pi < path.length - 1; pi++) {
      const a = path[pi];
      if (treeDegree(cells[a].base) >= 4) continue;
      for (const b of gridNeighbors(w, h, a)) {
        const d = dirBetween(w, a, b);
        if ((cells[a].base & (1 << d)) !== 0) continue; // already a tree edge
        if (treeDegree(cells[b].base) >= 4) continue;
        if (b === coreIdx) continue;
        // b must reach the source without passing through a.
        let cur = b;
        let ok = false;
        while (cur !== -1) {
          if (cur === a) break;
          if (cur === sourceIdx) {
            ok = true;
            break;
          }
          cur = carve.parent[cur];
        }
        if (ok) candidates.push({ a, b, d });
      }
    }
    if (candidates.length === 0) return null;
    const mid = candidates[rng.int(candidates.length)];
    cells[mid.a].base |= 1 << mid.d;
    cells[mid.b].base |= 1 << oppositeDir(mid.d);
    cells[mid.a].kind = "and";
    for (const p of pathToRoot(carve, mid.b)) protectedSet.add(p);

    // Jammed connectors on the route.
    const jamPool = path.filter(
      (i) => i !== sourceIdx && i !== coreIdx && cells[i].kind === "normal",
    );
    rng.shuffle(jamPool);
    for (const j of jamPool.slice(0, 2)) cells[j].jam = 2 + rng.int(2);

    // Loot caches on side branches.
    const leaves = [];
    for (let i = 0; i < n; i++) {
      if (
        treeDegree(carve.treeArms[i]) === 1 &&
        !protectedSet.has(i) &&
        carve.dist[i] >= 3 &&
        cells[i].kind === "normal"
      ) {
        leaves.push(i);
      }
    }
    rng.shuffle(leaves);
    const loot: number[] = [];
    for (const l of leaves) {
      if (loot.every((o) => gridDist(w, o, l) >= 3)) loot.push(l);
      if (loot.length === 2) break;
    }
    if (loot.length === 0) return null;
    for (const l of loot) cells[l].kind = "loot";
    lootCount = loot.length;
  }

  if (type === "data" && !bare) {
    const corePath = new Set(pathToRoot(carve, coreIdx));
    const leaves = [];
    for (let i = 0; i < n; i++) {
      if (
        treeDegree(carve.treeArms[i]) === 1 &&
        !corePath.has(i) &&
        carve.dist[i] >= 3 &&
        cells[i].kind === "normal"
      ) {
        leaves.push(i);
      }
    }
    rng.shuffle(leaves);
    const frags: number[] = [];
    for (const f of leaves) {
      if (frags.every((o) => gridDist(w, o, f) >= 2)) frags.push(f);
      if (frags.length === 3) break;
    }
    if (frags.length < 2) return null;
    for (const f of frags) {
      cells[f].kind = "frag";
      for (const p of pathToRoot(carve, f)) protectedSet.add(p);
    }
    fragCount = frags.length;

    // Corrupt nodes: never on a needed path, never tree-linked to one, but
    // pressed right up against the route so careless power flow touches them.
    const candidates: Array<{ i: number; score: number; r: number }> = [];
    for (let i = 0; i < n; i++) {
      if (protectedSet.has(i) || cells[i].kind !== "normal") continue;
      if (carve.dist[i] < 2) continue;
      let treeLinked = false;
      const arms = carve.treeArms[i];
      for (let d = 0; d < 4; d++) {
        if ((arms & (1 << d)) === 0) continue;
        const ni = cellIndex(w, (i % w) + DX[d], Math.floor(i / w) + DY[d]);
        if (protectedSet.has(ni)) treeLinked = true;
      }
      if (treeLinked) continue;
      const nearSource = gridNeighbors(w, h, i).some(
        (ni) => ni === sourceIdx || ni === coreIdx,
      );
      if (nearSource) continue;
      const score = gridNeighbors(w, h, i).filter((ni) => protectedSet.has(ni)).length;
      if (score >= 1) candidates.push({ i, score, r: rng.next() });
    }
    candidates.sort((a, b) => b.score - a.score || a.r - b.r);
    const corrupt: number[] = [];
    for (const c of candidates) {
      if (corrupt.every((o) => gridDist(w, o, c.i) >= 2)) corrupt.push(c.i);
      if (corrupt.length === 4) break;
    }
    if (corrupt.length < 2) return null;
    for (const ci of corrupt) {
      const cell = cells[ci];
      cell.kind = "corrupt";
      cell.fixed = true;
      // Menace orientation: face as many route cells as possible.
      let bestRot = 0;
      let bestFacing = -1;
      for (let r = 0; r < 4; r++) {
        const arms = rotateArms(cell.base, r);
        let facing = 0;
        for (let d = 0; d < 4; d++) {
          if ((arms & (1 << d)) === 0) continue;
          const nx = cell.x + DX[d];
          const ny = cell.y + DY[d];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (protectedSet.has(cellIndex(w, nx, ny))) facing++;
        }
        if (facing > bestFacing) {
          bestFacing = facing;
          bestRot = r;
        }
      }
      cell.rot = bestRot;
    }
  }

  if (type === "software" && !bare) {
    const candidates = [];
    for (let i = 0; i < n; i++) {
      if (cells[i].kind !== "normal" || carve.dist[i] < 2) continue;
      if (gridNeighbors(w, h, i).includes(sourceIdx)) continue;
      candidates.push(i);
    }
    rng.shuffle(candidates);
    const bugs: number[] = [];
    for (const b of candidates) {
      if (bugs.every((o) => gridDist(w, o, b) >= 2)) bugs.push(b);
      if (bugs.length === 5) break;
    }
    if (bugs.length < 4) return null;
    bugs.sort((a, b) => carve.dist[a] - carve.dist[b]);
    if (rng.next() < 0.35 && bugs.length >= 3) {
      const k = 1 + rng.int(bugs.length - 2);
      [bugs[k], bugs[k + 1]] = [bugs[k + 1], bugs[k]];
    }
    bugs.forEach((b, i) => {
      cells[b].bug = i + 1;
      for (const p of pathToRoot(carve, b)) protectedSet.add(p);
    });
    bugCount = bugs.length;
  }

  if (type === "network" && !bare) {
    advSourceIdx = cellIndex(w, w - 1, midY);
    // Core near the center, far from both ports.
    let best = -1;
    let bestScore = -1;
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    for (let i = 0; i < n; i++) {
      if (Math.abs((i % w) - cx) > 1.6 || Math.abs(Math.floor(i / w) - cy) > 1.6) continue;
      const dPlayer = carve.dist[i];
      const advTrail = treePathBetween(carve, advSourceIdx, i);
      const score = Math.min(dPlayer, advTrail.length - 1);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1 || bestScore < 6) return null;
    coreIdx = best;
    cells[coreIdx].kind = "core";
    cells[advSourceIdx].kind = "advsource";
    cells[advSourceIdx].fixed = true;
    advPath = treePathBetween(carve, advSourceIdx, coreIdx);
    for (const p of pathToRoot(carve, coreIdx)) protectedSet.add(p);
  }

  // Scramble.
  for (const cell of cells) {
    if (cell.fixed) continue;
    cell.rot = rng.int(4);
  }

  const needed = neededMasks(carve, protectedSet);
  if (type === "hardware" && !bare) {
    // The AND node's extra edge is part of the requirement on both sides.
    for (const cell of cells) {
      if (cell.kind === "and") {
        needed.set(cellIndex(w, cell.x, cell.y), cell.base);
      }
    }
    for (const [i, mask] of needed) {
      const cell = cells[i];
      if (cell.kind === "and") continue;
      for (let d = 0; d < 4; d++) {
        const ni = cellIndex(w, cell.x + DX[d], cell.y + DY[d]);
        const nx = cell.x + DX[d];
        const ny = cell.y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (cells[ni]?.kind === "and" && (cells[ni].base & (1 << oppositeDir(d))) !== 0) {
          if ((cell.base & (1 << d)) !== 0) needed.set(i, mask | (1 << d));
        }
      }
    }
  }

  // Guarantee a real puzzle: most route cells must start misaligned.
  const routeCells = [...needed.keys()].filter((i) => !cells[i].fixed);
  let aligned = routeCells.filter(
    (i) => (effectiveArms(cells[i]) & (needed.get(i) as number)) === needed.get(i),
  );
  const maxAligned = Math.max(2, Math.floor(routeCells.length * 0.35));
  rng.shuffle(aligned);
  for (const i of aligned.slice(maxAligned)) {
    cells[i].rot = (cells[i].rot + 1 + rng.int(3)) % 4;
  }

  const board: Board = {
    type: bare ? "hardware" : type,
    w,
    h,
    cells,
    sourceIdx,
    coreIdx,
    advSourceIdx,
    advPath,
    parMoves: 0,
    bugCount,
    fragCount,
    lootCount,
    advIntervalMs: 0,
    crashBaseMs: 0,
  };

  // No freebies at dive start: nothing on the objective list may begin lit,
  // and no corruption may begin in contact.
  for (let guard = 0; guard < 16; guard++) {
    const power = computePower(board);
    let offender = -1;
    if (coreIdx !== -1 && power.powered[coreIdx]) offender = coreIdx;
    for (let i = 0; i < n && offender === -1; i++) {
      const c = cells[i];
      if ((c.bug > 0 || c.kind === "frag") && power.powered[i]) offender = i;
    }
    for (const ci of power.contacts) {
      if (offender !== -1) break;
      for (const nb of gridNeighbors(w, h, ci)) {
        if (power.powered[nb] && !cells[nb].fixed) {
          offender = nb;
          break;
        }
      }
    }
    if (offender === -1) break;
    if (cells[offender].fixed) {
      // Fall back to twisting a lit route neighbor.
      const alt = gridNeighbors(w, h, offender).find((i) => power.powered[i] && !cells[i].fixed);
      if (alt === undefined) return null;
      offender = alt;
    }
    cells[offender].rot = (cells[offender].rot + 1 + rng.int(3)) % 4;
  }
  {
    const power = computePower(board);
    if (coreIdx !== -1 && power.powered[coreIdx]) return null;
    if (power.contacts.length > 0) return null;
  }

  // Pace the mode timers from how tangled this particular scramble is.
  let clicks = 0;
  for (const [i, mask] of needed) {
    if (cells[i].fixed) continue;
    clicks += clicksToAlign(cells[i], mask);
  }
  board.parMoves = clicks + 3;
  if (type === "network") {
    const total = Math.min(60000, Math.max(34000, clicks * 2400 + 10000));
    board.advIntervalMs = Math.max(1900, Math.floor(total / Math.max(advPath.length, 1)));
  }
  if (type === "software") {
    board.crashBaseMs = Math.min(70000, Math.max(40000, clicks * 1800 + 14000));
  }

  for (const cell of cells) cell.spin = cell.rot;

  return board;
}

/** Unique tree path between two nodes via their root paths. */
function treePathBetween(carve: Carve, from: number, to: number): number[] {
  const a = pathToRoot(carve, from); // root..from
  const b = pathToRoot(carve, to); // root..to
  let lca = 0;
  while (lca < a.length && lca < b.length && a[lca] === b[lca]) lca++;
  // from .. LCA .. to
  const down = a.slice(lca - 1).reverse(); // from..lca
  const up = b.slice(lca); // lca+1..to
  return [...down, ...up];
}
