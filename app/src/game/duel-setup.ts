import { PAR_FLAT, PAR_RATE } from "./content/kit";
import { startOppTurn } from "./duel-actions";
import { canPlace, routeCost, routePlan, settlePower } from "./duel-power";
import {
  Board,
  DuelCell,
  DuelConfig,
  DuelKit,
  DuelState,
  PIECE_I,
  PIECE_L,
  PIECE_T,
  PIECE_X,
  Side,
  SideEcon,
} from "./duel-types";
import { Rng, seedRng } from "./rng";
import { cellIndex } from "./types";

/**
 * Nodes a board may light for free before anyone moves. The opening-dive
 * teaching ladder is bounded by this same number, so it stays exported rather
 * than inline: when the two drifted apart, a quarter of opening dives silently
 * skipped the lesson that teaches rotation.
 */
export const MAX_OPENING_BUILT = 3;

/** Reach used by the generator's shortcut probe, before any kit exists. */
const GEN_REACH = 2;

/**
 * Route cost one head-start step removes, measured. Two-arm pipe dominates the
 * draw, so an average misaligned junction on the route wants ~1.8 quarter
 * turns. Used to size the machine's board so the head start does not also
 * shorten its road.
 */
const HEAD_START_COST = 1.8;

/**
 * How much of that saving to hand back as extra board length. Not all of it:
 * at full compensation the head start stops being an advantage at all and the
 * late-day curve goes flat. At 0.6 the machine keeps a real but bounded edge -
 * roughly three quarter-turns of road on day 9 rather than seven.
 */
const HEAD_START_COMPENSATION = 0.6;

/**
 * Opening-route floor and single-patch shortcut floor, both as fractions of
 * `pdTarget`. They used to be absolute (`minPd`, and `minPd - 6`) and were set
 * when a route cost ~14. With the goal on the far edge a route costs ~24, so a
 * fixed "may not collapse below 6" floor stopped rejecting anything at all and
 * one patch cross could take 24 down to 8. Patch cells got MORE powerful when
 * the board got longer, not less: they buy a fixed number of columns, and the
 * columns got more valuable.
 */
const PD_FLOOR_RATE = 0.8;
const SHORTCUT_FLOOR_RATE = 0.65;

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
 * Mostly two-arm pipe (corners and straights): each junction demands a real
 * orientation choice, random boards stay subcritical (no runaway free
 * chains), and route costs land in the arc table's band. Tees and crosses
 * are rare gifts.
 *
 * The elbow share also sets the cross-board exchange rate, since an elbow
 * costs 3 RAM to un-twist and a straight only 1.
 */
function drawMask(rng: Rng): number {
  const v = rng.next();
  if (v < 0.4) return PIECE_I;
  if (v < 0.85) return PIECE_L;
  if (v < 0.97) return PIECE_T;
  return PIECE_X;
}

/**
 * Opening RAM when a caller hands over a budget the economy cannot use.
 * Mirrors BASE_RAM in run-reducer, which imports this module.
 */
const BASE_RAM_FALLBACK = 5;

/*
 * Deliberately not `isFinite`, which coerces: `isFinite(null)` is true, and a
 * string budget survives to string-concatenate in the per-turn arithmetic
 * ("5" + carry) for a silently wrong number. Only a real number is usable.
 */
function usableRam(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function initialEcon(ramPerTurn: number, carryCap: number): SideEcon {
  return {
    // Both sides, so a malformed config cannot hand the machine unlimited RAM
    // the same way a malformed save could hand it to the player.
    ramPerTurn: usableRam(ramPerTurn) ? ramPerTurn : BASE_RAM_FALLBACK,
    ram: 0,
    carry: 0,
    carryCap,
    drainNext: 0,
    loseNextTurn: false,
    used: { scan: false, attack: false, defend: false },
    attacksCast: 0,
    scansCast: 0,
    defendsCast: 0,
    trapsFired: 0,
    redirectsTaken: 0,
    rotations: 0,
    placedThisTurn: false,
  };
}

/**
 * Which way a board runs. The player's signal travels left to right; the
 * intrusion's travels right to left, so with the two grids on the same
 * viewport they read as one board with the fight meeting in the middle
 * rather than as two copies of the same puzzle.
 *
 * Nothing in the engine cares: `routePlan` starts at `b.entry` and terminates
 * on any `b.goal` cell, and power, reach and frontier are all computed from
 * arms and adjacency. Only the entry's own arm mask has to know, since there
 * is no board past the edge it sits on.
 */
export type Facing = "east" | "west";

/**
 * One side's grid: entry on one edge, a three-cell goal column on the other.
 * Three goal cells rather than one so a single enemy redirect can never
 * hard-block the approach — there is always another lane to reroute into,
 * which is what keeps a cut a tempo cost instead of a wall.
 */
function buildBoard(cfg: DuelConfig, rng: Rng, facing: Facing): Board {
  const { w, h } = cfg;
  const midY = Math.floor(h / 2);
  const entryX = facing === "east" ? 0 : w - 1;
  const goalX = facing === "east" ? w - 1 : 0;
  const entry = cellIndex(w, entryX, midY);
  const goal: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    const y = midY + dy;
    if (y >= 0 && y < h) goal.push(cellIndex(w, goalX, y));
  }
  const dist = (i: number, j: number): number => {
    const ax = i % w;
    const ay = Math.floor(i / w);
    const bx = j % w;
    const by = Math.floor(j / w);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  };

  const cells: DuelCell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = cellIndex(w, x, y);
      const protectedCell =
        i === entry ||
        goal.includes(i) ||
        dist(i, entry) < 2 ||
        goal.some((g) => dist(i, g) < 2);
      const slag = !protectedCell && rng.next() < (cfg.slag ?? (cfg.tutorial ? 0.12 : 0.18));
      cells.push({
        x,
        y,
        kind: slag ? "block" : "node",
        base: slag ? 0 : drawMask(rng),
        rot: slag ? 0 : rng.int(4),
        fused: false,
        spin: 0,
        built: false,
        litWave: 0,
        trap: null,
        lockedThroughRound: 0,
        lockedBy: null,
        wardThroughRound: 0,
        wardBy: null,
      });
    }
  }
  cells[entry].kind = "entry";
  // No arm pointing off the board: N+E+S running east, N+S+W running west.
  cells[entry].base = facing === "east" ? 0b0111 : 0b1101;
  cells[entry].rot = 0;
  for (const g of goal) {
    cells[g].kind = "goal";
    cells[g].base = 0b1111;
    cells[g].rot = 0;
  }
  for (const c of cells) c.spin = c.rot;
  return { w, h, cells, entry, goal, power: [] };
}

interface BoardPick {
  board: Board;
  cost: number;
}

/**
 * Rejection-sample one board toward `target` route cost. Rejects any board
 * whose opening power already reaches the goal or lights more than a toehold,
 * and (when `shortcutFloor` is set) any board where a single patch cross
 * placed from opening reach collapses the route.
 */
function generateBoard(
  cfg: DuelConfig,
  rng: Rng,
  facing: Facing,
  target: number,
  floor: number,
  shortcutFloor: number | null,
  attempts = 160,
): BoardPick | null {
  let best: BoardPick | null = null;
  let bestScore = Infinity;
  let loose: BoardPick | null = null;
  let looseScore = Infinity;
  let anyFair: BoardPick | null = null;
  let anyFairScore = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const board = buildBoard(cfg, rng, facing);
    const opening = settlePower(board);
    if (opening.reachedGoal) continue;
    if (opening.built.length > MAX_OPENING_BUILT) continue;

    const cost = routeCost(board);
    if (!isFinite(cost)) continue;
    const score = Math.abs(cost - target);

    // The floor must survive the pouch too: a single piece bridging a slag
    // wall from opening reach used to collapse pd 19 to 5, the exact
    // trivialization this check exists to end.
    let shortcutOk = true;
    if (shortcutFloor !== null) {
      let shortcut = cost;
      for (let i = 0; i < board.cells.length && shortcut > shortcutFloor; i++) {
        if (!canPlace(board, i, GEN_REACH)) continue;
        const c = board.cells[i];
        const prev = { kind: c.kind, base: c.base, rot: c.rot, fused: c.fused };
        c.kind = "node";
        c.base = PIECE_X;
        c.rot = 0;
        c.fused = true;
        const after = routeCost(board);
        c.kind = prev.kind;
        c.base = prev.base;
        c.rot = prev.rot;
        c.fused = prev.fused;
        if (after < shortcut) shortcut = after;
      }
      shortcutOk = shortcut > shortcutFloor;
    }

    if (score < anyFairScore) {
      anyFairScore = score;
      anyFair = { board, cost };
    }
    if (shortcutOk && cost > floor - 2 && score < looseScore) {
      looseScore = score;
      loose = { board, cost };
    }
    if (!shortcutOk || cost <= floor) continue;
    if (score < bestScore) {
      bestScore = score;
      best = { board, cost };
      if (score <= 1) break;
    }
  }
  return best ?? loose ?? anyFair;
}

/**
 * Generate the duel: two independent boards, each rejection-sampled toward a
 * route cost, then matched against each other. The machine's board targets the
 * player's ACTUAL cost rather than the config's, so `|pd - od| <= 2` falls out
 * by construction instead of being sampled for.
 *
 * Nothing here has to guard against one side walling the other off any more.
 * The boards do not touch.
 */
export function createDuel(
  cfg: DuelConfig,
  seed: number,
  kit: DuelKit,
  playerRamPerTurn: number,
  retry = 0,
): DuelState {
  const rng = new Rng(seed ^ 0x2545f491);
  const carryCap = 2;
  /*
   * Never let a non-finite budget into the economy. NaN does not clamp -
   * Math.max(0, NaN) is NaN - and it poisons every guard downstream, since
   * `ram < cost` is false for NaN, so nothing is ever denied and RAM reads
   * NaN while spending is unlimited. Fail closed at the boundary instead.
   */
  if (!usableRam(playerRamPerTurn)) playerRamPerTurn = BASE_RAM_FALLBACK;

  // Nobody may be able to win on their opening turn. minPd raises the floor
  // where boosts and patch shortcuts widen the opening burst.
  const pFloor = cfg.tutorial
    ? playerRamPerTurn * 2 + 3
    : Math.max(playerRamPerTurn, cfg.minPd ?? Math.round(cfg.pdTarget * PD_FLOOR_RATE));
  const shortcutFloor = cfg.tutorial ? null : cfg.pdTarget * SHORTCUT_FLOOR_RATE;

  const pPick = generateBoard(cfg, rng, "east", cfg.pdTarget, pFloor, shortcutFloor);
  if (!pPick) {
    if (retry < 5) return createDuel(cfg, (seed + 0x9e37) >>> 0, kit, playerRamPerTurn, retry + 1);
    throw new Error("duel generator could not produce a fair player board");
  }
  /*
   * The machine's board is targeted at the player's actual cost PLUS what the
   * head start is about to shave off it, so after the pre-alignment its route
   * lands next to the player's instead of permanently under it. Head start is
   * meant to be a tempo gift - it arrives already moving - not a shorter road.
   * Without this compensation day 9 shipped od 17 against pd 24 and the race
   * was decided by geometry before either side acted.
   */
  // Runs the other way: its entry is on the right edge and its goal on the
  // left, so switching the viewport reads as panning across one board.
  const oPick = generateBoard(
    cfg,
    rng,
    "west",
    pPick.cost + Math.round(cfg.headStart * HEAD_START_COST * HEAD_START_COMPENSATION),
    cfg.oppRam,
    null,
  );
  if (!oPick) {
    if (retry < 5) return createDuel(cfg, (seed + 0x9e37) >>> 0, kit, playerRamPerTurn, retry + 1);
    throw new Error("duel generator could not produce a fair opponent board");
  }

  const boards: Record<Side, Board> = { player: pPick.board, opp: oPick.board };

  const s: DuelState = {
    cfg,
    seed,
    boards,
    view: "player",
    phase: "playing",
    winKind: null,
    endReason: null,
    round: 1,
    turn: "player",
    econ: { player: initialEcon(playerRamPerTurn, carryCap), opp: initialEcon(cfg.oppRam, 2) },
    kit: { ...kit, augments: [...kit.augments] },
    oppNextIntent: null,
    routeTrace: null,
    oppStartCost: 0,
    par: 0,
    pressureRounds: 0,
    patchPouch: [...kit.patchPouch],
    strainChip: 0,
    rngState: seedRng(seed ^ 0x5f3759df),
    fx: [],
    fxNext: 1,
    notice: null,
    oppTurn: {
      started: false,
      pendingCast: null,
      queue: [],
      replans: 3,
      lastReplanCost: Infinity,
      ramAtStart: 0,
      aim: null,
    },
    oppDominantUsed: false,
    lastPlayerHitRound: 0,
    tutFlags: { scanned: false, purged: false, attacked: false },
    tutorialLessonRound: 0,
  };

  // Head start: the intrusion is already inside, pre-aligned along its own
  // route. No claiming and no revert guard needed — its board is its own, so
  // this can never wall the player off. It only has to stop short of a
  // board the machine could close on its opening turn.
  const ob = s.boards.opp;
  for (let k = 0; k < cfg.headStart; k++) {
    const plan = routePlan(ob);
    if (!plan || plan.cost <= cfg.oppRam + 1) break;
    const next = plan.steps[0];
    if (!next) break;
    const c = ob.cells[next.idx];
    c.spin += (next.targetRot - c.rot + 4) % 4;
    c.rot = next.targetRot;
  }
  settlePower(ob);

  s.oppStartCost = Math.max(1, isFinite(routeCost(ob)) ? routeCost(ob) : cfg.pdTarget);
  {
    // Par is set once, from the starting board the player actually faces.
    const pd = routeCost(s.boards.player);
    const base = isFinite(pd) ? pd : cfg.pdTarget;
    s.par = Math.ceil(base * PAR_RATE) + (cfg.parFlat ?? PAR_FLAT);
  }
  s.econ.player.ram = playerRamPerTurn + (kit.augments.includes("hotBoot") ? 1 : 0);

  // The finale machine was already inside: it takes the opening turn, so
  // no opening burst ever closes the board before it has moved.
  if (cfg.oppOpens && !cfg.tutorial) {
    startOppTurn(s);
  }
  return s;
}
