import { DuelConfig } from "../duel-types";
import { Rng } from "../rng";
import { AttackMode, DefendMode, OppMode, Tier } from "./kit";

/**
 * The tier-indexed difficulty curve. The open calendar killed the ten-row
 * day table: a tier 3 device is a tier 3 device on the first Monday and on
 * the hundredth, so JOB TIER (1..5) carries the configuration and depth
 * into the day escalates which tiers arrive. The rows were carried over
 * from the measured day curve (tier 1 = old day 1, tier 2 = day 3, tier 3
 * = day 5, tier 4 = day 8, tier 5 = day 9) so every finding the old arc
 * paid for survives: horizon steps stay the intelligence ladder, slag
 * rises while patch drops fall, and headStart stays real.
 *
 * `pdTarget` is the route cost the generator aims each board at, and
 * `sim.ts` ASSERTS the measured mean lands within PD_TOLERANCE of it.
 */

/** How far the measured mean route cost may sit from `pdTarget`. */
export const PD_TOLERANCE = 2.0;

export interface TierConfig {
  grid: [number, number];
  oppRam: number;
  greed: number;
  abilityFreq: number;
  /** Route cost the generator aims both boards at. Verified by sim.ts. */
  pdTarget: number;
  /** Floor on the player's opening route cost (see DuelConfig.minPd). */
  minPd?: number;
  headStart: number;
  /** Flat term of the par margin for this tier (tapers late; see kit.ts). */
  parFlat: number;
  /** Cut-scoring depth, 0-3. See DuelConfig.horizon. */
  horizon: number;
  /** Per-turn chance the cut lands on the best target. See DuelConfig.focus. */
  focus: number;
  /** Slag density at board generation. */
  slag: number;
  /** Chance a cleared job drops a random patch piece. */
  patchDrop: number;
}

export const TIER_CONFIGS: Record<number, TierConfig> = {
  1: { grid: [9, 7], oppRam: 6, greed: 0.7, abilityFreq: 0.2, pdTarget: 16, headStart: 0, parFlat: 6, horizon: 0, focus: 0.5, slag: 0.18, patchDrop: 0.35 },
  2: { grid: [9, 7], oppRam: 6, greed: 0.8, abilityFreq: 0.4, pdTarget: 16, headStart: 0, parFlat: 5, horizon: 1, focus: 0.65, slag: 0.18, patchDrop: 0.3 },
  3: { grid: [11, 9], oppRam: 8, greed: 0.94, abilityFreq: 0.55, pdTarget: 20, minPd: 9, headStart: 2, parFlat: 4, horizon: 2, focus: 0.8, slag: 0.21, patchDrop: 0.18 },
  4: { grid: [13, 11], oppRam: 10, greed: 0.98, abilityFreq: 0.7, pdTarget: 22, minPd: 10, headStart: 3, parFlat: 2, horizon: 3, focus: 0.9, slag: 0.24, patchDrop: 0.12 },
  5: { grid: [13, 11], oppRam: 11, greed: 0.97, abilityFreq: 0.75, pdTarget: 24, minPd: 12, headStart: 4, parFlat: 1, horizon: 3, focus: 0.95, slag: 0.25, patchDrop: 0.11 },
};

const ATTACK_ALL: AttackMode[] = ["redirect", "armHalt", "armSiphon"];
const DEFEND_ALL: DefendMode[] = ["purge", "lock", "ward"];

export function isAttackMode(m: OppMode): m is AttackMode {
  return (ATTACK_ALL as OppMode[]).includes(m);
}

/**
 * The machine's programs for one job: the dominant mode Analyze reports,
 * plus a toolbox that broadens with the threat tier. Cast width follows
 * tier too (1-2 narrow, 3-4 double, 5 triple).
 */
export function oppKitFor(
  tier: number,
  dominant: OppMode,
  seed: number,
): { attackModes: AttackMode[]; defendModes: DefendMode[]; oppTier: Tier } {
  const rng = new Rng(seed ^ 0x51ed);
  const atk = new Set<AttackMode>();
  const def = new Set<DefendMode>();
  if (isAttackMode(dominant)) atk.add(dominant);
  else def.add(dominant);
  if (atk.size === 0) atk.add("redirect");
  const addRandom = <T extends string>(set: Set<T>, pool: T[]) => {
    const rest = pool.filter((m) => !set.has(m));
    if (rest.length > 0) set.add(rest[rng.int(rest.length)]);
  };
  if (tier >= 2) addRandom(atk, ATTACK_ALL);
  if (tier >= 3) addRandom(def, DEFEND_ALL);
  if (tier >= 4) {
    addRandom(atk, ATTACK_ALL);
    addRandom(def, DEFEND_ALL);
  }
  if (tier >= 5) {
    for (const m of ATTACK_ALL) atk.add(m);
    for (const m of DEFEND_ALL) def.add(m);
  }
  const oppTier: Tier = tier <= 2 ? 1 : tier <= 4 ? 2 : 3;
  return { attackModes: [...atk], defendModes: [...def], oppTier };
}

export function tierDuelConfig(tier: number, dominant: OppMode, kitSeed: number): DuelConfig {
  const t = TIER_CONFIGS[Math.max(1, Math.min(5, tier))];
  const kit = oppKitFor(tier, dominant, kitSeed);
  return {
    w: t.grid[0],
    h: t.grid[1],
    oppRam: t.oppRam,
    greed: t.greed,
    abilityFreq: t.abilityFreq,
    pdTarget: t.pdTarget,
    minPd: t.minPd,
    headStart: t.headStart,
    oppAttackModes: kit.attackModes,
    oppDefendModes: kit.defendModes,
    oppTier: kit.oppTier,
    dominant,
    parFlat: t.parFlat,
    horizon: t.horizon,
    focus: t.focus,
    slag: t.slag,
  };
}

/**
 * The father's machine, attempted on Sunday. Top of every curve, every mode
 * at full width, the biggest grid, already moving when you sit down.
 * Mechanically an ordinary duel; that is the point.
 */
export function backroomConfig(): DuelConfig {
  return {
    // 15x11, not 17x13. With the goal on the far edge a 15-wide board already
    // carries a 29-cost route, and 17x13 was the game's worst legibility
    // moment (42px per cell on the shortest supported desk) for no depth the
    // width was actually buying.
    w: 15,
    h: 11,
    oppRam: 11,
    greed: 1,
    abilityFreq: 0.9,
    pdTarget: 29,
    minPd: 18,
    headStart: 1,
    oppAttackModes: [...ATTACK_ALL],
    oppDefendModes: [...DEFEND_ALL],
    oppTier: 3,
    dominant: "redirect",
    // Tight on purpose: the back room bills every wasted turn. Not zero -
    // at zero a 29-cost route put 100% of wins over par.
    parFlat: 2,
    // Full depth. It reads your grid as well as its own and will stop racing
    // to cut you the moment your clock is shorter than its.
    horizon: 3,
    focus: 1,
    slag: 0.27,
    // It was already inside. The machine opens the duel, so no deck, however
    // stacked, ever closes the back room before it has moved.
    oppOpens: true,
  };
}

/**
 * The scripted, unwinnable opening dive at the tower, first boot only. The
 * machine plays at quarter speed while the bench walks the player through
 * all three programs - scan the trap it planted, purge it, twist its line
 * back - then it stops pretending and seals. Losing it is the tutorial's
 * final lesson.
 */
export function tutorialConfig(): DuelConfig {
  return {
    w: 13,
    h: 7,
    oppRam: 12,
    greed: 1,
    abilityFreq: 0,
    pdTarget: 14,
    headStart: 0,
    oppAttackModes: ["armHalt"],
    oppDefendModes: [],
    oppTier: 1,
    dominant: "armHalt",
    // The tutorial machine never reaches across with intent; it plants one
    // scripted trap so the scan-purge lesson has a subject.
    horizon: 0,
    focus: 0.5,
    tutorial: true,
  };
}

/** Job pay before modifiers. Halved on a turn-cap win at the day layer. */
export function jobPay(tier: number): number {
  return 40 + 25 * tier;
}

/** Salvage a cleared job yields, in deck parts. Combat funds combat. */
export function salvageFor(tier: number): number {
  return tier;
}

/**
 * The tier band the counter draws from. Depth into the day escalates it (the
 * nth customer arrives from a higher band, pressure the player chose by not
 * closing), and shop progression opens it (the city sends work matching the
 * shop it thinks you are; nobody brings a tier 5 device to a bench that
 * cannot read it). Nothing here reads the player's own strength: difficulty
 * that tracks the build punishes building.
 */
export function tierBandFor(depth: number, repairsDone: number): [number, number] {
  const ceiling = Math.min(5, 2 + Math.floor(repairsDone / 2) + Math.floor(depth / 3));
  const floor = Math.max(1, Math.min(ceiling - 1, 1 + Math.floor(depth / 2)));
  return [floor, ceiling];
}

/** Deterministic tier draw within the band; the top of the band stays rare. */
export function rollTier(rng: Rng, band: [number, number]): number {
  const [lo, hi] = band;
  if (hi <= lo) return lo;
  // Weighted toward the middle of the band: the ceiling appears about half
  // as often as the rest so tier 5 stays an event rather than a diet.
  const pool: number[] = [];
  for (let t = lo; t <= hi; t++) {
    const w = t === hi ? 1 : 2;
    for (let i = 0; i < w; i++) pool.push(t);
  }
  return pool[rng.int(pool.length)];
}
