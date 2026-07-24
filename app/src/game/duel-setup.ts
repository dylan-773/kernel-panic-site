import { computeDuelPower, placementPath, placementsToCore } from "./duel-power";
import {
  DuelCell,
  DuelConfig,
  DuelState,
  EquippedAbility,
  PIECE_I,
  PIECE_L,
  PIECE_T,
  PIECE_X,
  SideEcon,
} from "./duel-types";
import { Rng, RngState, nextU32, seedRng } from "./rng";
import { cellIndex } from "./types";

/** Weighted piece draw: junction pieces common enough to keep lines alive. */
export function drawPiece(state: RngState): [number, RngState] {
  const [v, next] = nextU32(state);
  if (v < 0.3) return [PIECE_I, next];
  if (v < 0.6) return [PIECE_L, next];
  if (v < 0.85) return [PIECE_T, next];
  return [PIECE_X, next];
}

function emptyCell(x: number, y: number): DuelCell {
  return {
    x,
    y,
    kind: "empty",
    owner: "none",
    base: 0,
    rot: 0,
    spin: 0,
    trap: null,
    shieldedThroughRound: 0,
  };
}

function initialEcon(ramPerTurn: number): SideEcon {
  return {
    ramPerTurn,
    ram: 0,
    carry: 0,
    boostAmount: 0,
    boostTurns: 0,
    drainNext: 0,
    abilityUsed: false,
    disabled: {},
    drawCur: 0,
    drawNext: 0,
    wallThrough: 0,
    trapsFired: 0,
  };
}

/** Deterministic seed mixer for per-duel seeds. */
export function mixSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    let v = p | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  }
  return h >>> 0;
}

/**
 * Scatter dead slag cells until both sides' shortest routes are winding and
 * fair: finite, near the config's target length, and within one placement
 * of each other. Rejection-sampled deterministically from the duel seed.
 */
function scatterBlocks(
  cells: DuelCell[],
  w: number,
  h: number,
  entryP: number,
  entryO: number,
  coreIdx: number,
  minPath: number,
  rng: Rng,
): void {
  const protectedIdx = new Set<number>([entryP, entryO, coreIdx]);
  const near = (i: number, j: number): number => {
    const a = cells[i];
    const b = cells[j];
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  };
  const candidates: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (protectedIdx.has(i)) continue;
    if (near(i, entryP) < 2 || near(i, entryO) < 2 || near(i, coreIdx) < 2) continue;
    candidates.push(i);
  }
  const count = Math.round(w * h * 0.22);
  let best: number[] | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const pick = rng.shuffle([...candidates]).slice(0, count);
    for (const i of pick) cells[i].kind = "block";
    const pd = placementsToCore(cells, w, h, "player", coreIdx);
    const od = placementsToCore(cells, w, h, "opp", coreIdx);
    for (const i of pick) cells[i].kind = "empty";
    if (!isFinite(pd) || !isFinite(od) || Math.abs(pd - od) > 1) continue;
    const shorter = Math.min(pd, od);
    const score = Math.abs(shorter - minPath);
    if (score < bestScore) {
      bestScore = score;
      best = pick;
      if (score === 0) break;
    }
  }
  if (best) {
    for (const i of best) cells[i].kind = "block";
  }
}

export function createDuel(
  cfg: DuelConfig,
  seed: number,
  equipped: EquippedAbility[],
  playerRamPerTurn: number,
): DuelState {
  const { w, h } = cfg;
  const midY = Math.floor(h / 2);
  const cells: DuelCell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) cells.push(emptyCell(x, y));
  }
  const entryP = cellIndex(w, 0, midY);
  const entryO = cellIndex(w, w - 1, midY);
  const coreIdx = cellIndex(w, Math.floor(w / 2), midY);

  // Ports fan out on every side except the board edge behind them, so one
  // badly-oriented first piece can never dead-lock a whole run.
  cells[entryP].kind = "entryP";
  cells[entryP].owner = "player";
  cells[entryP].base = 0b0111; // N+E+S
  cells[entryO].kind = "entryO";
  cells[entryO].owner = "opp";
  cells[entryO].base = 0b1101; // N+S+W
  cells[coreIdx].kind = "core";
  cells[coreIdx].base = 0b1111;

  if (!cfg.tutorial && cfg.minPath > 0) {
    scatterBlocks(cells, w, h, entryP, entryO, coreIdx, cfg.minPath, new Rng(seed ^ 0x2545f491));
  }

  // Escalating-tier intrusions are already inside when the dive begins:
  // the first cells of the machine's route sit pre-placed as hard crosses.
  if (cfg.headStart > 0) {
    const path = placementPath(cells, w, h, "opp", coreIdx);
    if (path) {
      const k = Math.min(cfg.headStart, Math.max(0, path.length - 2));
      for (let i = 0; i < k; i++) {
        const c = cells[path[i]];
        c.kind = "node";
        c.owner = "opp";
        c.base = PIECE_X;
        c.rot = 0;
        c.spin = 0;
      }
    }
  }

  let bagPlayer = seedRng(seed ^ 0x9e3779b9);
  let bagOpp = seedRng(seed ^ 0x517cc1b7);
  let drawCur: number, drawNext: number, oppDrawCur: number, oppDrawNext: number;
  [drawCur, bagPlayer] = drawPiece(bagPlayer);
  [drawNext, bagPlayer] = drawPiece(bagPlayer);
  [oppDrawCur, bagOpp] = drawPiece(bagOpp);
  [oppDrawNext, bagOpp] = drawPiece(bagOpp);

  const econ: Record<"player" | "opp", SideEcon> = {
    player: initialEcon(playerRamPerTurn),
    opp: initialEcon(cfg.oppRam),
  };
  econ.player.drawCur = drawCur;
  econ.player.drawNext = drawNext;
  econ.opp.drawCur = oppDrawCur;
  econ.opp.drawNext = oppDrawNext;
  if (cfg.tutorial) {
    // The machine's whole bag is crosses, first draws included.
    econ.opp.drawCur = PIECE_X;
    econ.opp.drawNext = PIECE_X;
  }
  // The player acts first; their opening turn generates base RAM.
  econ.player.ram = playerRamPerTurn;

  const power = computeDuelPower(cells, w, h, entryP, entryO);
  const oppStartDist = placementsToCore(cells, w, h, "opp", coreIdx);

  return {
    cfg,
    seed,
    w,
    h,
    cells,
    entryP,
    entryO,
    coreIdx,
    power,
    phase: "playing",
    winKind: null,
    round: 1,
    turn: "player",
    econ,
    equipped: equipped.map((e) => ({ ...e })),
    oppPlan: [],
    oppNextIntent: null,
    intentRevealed: false,
    oppStartDist,
    strainChip: 0,
    rngState: seedRng(seed ^ 0x5f3759df),
    bagPlayer,
    bagOpp,
    fx: [],
    fxNext: 1,
    notice: null,
    beat: 0,
    oppTurn: { trapChecked: false, placed: 0, pendingAbility: null },
    oppDominantUsed: false,
    lastPlayerHitRound: 0,
  };
}
