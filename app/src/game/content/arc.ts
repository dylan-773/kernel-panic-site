import { DuelConfig } from "../duel-types";
import { Rng } from "../rng";
import { AttackMode, DefendMode, OppMode, Tier } from "./kit";

/**
 * The fixed escalation curve for the flood-claim duel. Every run walks the
 * same ten days, ending in the finale; per-day numbers live here so balance
 * is one table, not code.
 *
 * `pdTarget` is the route cost in rotation RAM the generator aims each board
 * at, and `sim.ts` ASSERTS the measured mean lands within PD_TOLERANCE of it.
 * It used to be called `minCost` and was pure fiction: under the old shared
 * board the generator missed it by 7-11 on every single day, so the whole
 * difficulty table was tuning a number nothing actually read. The assertion is
 * what keeps that from happening again.
 *
 * `headStart` is how many junctions the intrusion arrives pre-aligned along.
 */

/** How far the measured mean route cost may sit from `pdTarget`. */
export const PD_TOLERANCE = 2.0;

export interface DayConfig {
  grid: [number, number];
  oppRam: number;
  greed: number;
  abilityFreq: number;
  /** Route cost the generator aims both boards at. Verified by sim.ts. */
  pdTarget: number;
  /** Floor on the player's opening route cost (see DuelConfig.minPd). */
  minPd?: number;
  headStart: number;
  /** Flat term of the par margin for this day (tapers late; see kit.ts). */
  parFlat: number;
  /** Cut-scoring depth, 0-3. See DuelConfig.horizon. */
  horizon: number;
  /** Per-turn chance the cut lands on the best target. See DuelConfig.focus. */
  focus: number;
  /** Slag density at board generation. */
  slag: number;
  /** Chance a cleared job drops a random patch piece. */
  patchDrop: number;
  /** Opponent difficulty tier of the day's three jobs. */
  jobTiers: [number, number, number];
}

export const DAY_CONFIGS: Record<number, DayConfig> = {
  1: { grid: [9, 7], oppRam: 6, greed: 0.7, abilityFreq: 0.2, pdTarget: 16, headStart: 0, parFlat: 6, horizon: 0, focus: 0.5, slag: 0.18, patchDrop: 0.35, jobTiers: [1, 1, 1] },
  2: { grid: [9, 7], oppRam: 6, greed: 0.8, abilityFreq: 0.4, pdTarget: 16, headStart: 0, parFlat: 5, horizon: 1, focus: 0.65, slag: 0.18, patchDrop: 0.35, jobTiers: [1, 1, 2] },
  3: { grid: [9, 9], oppRam: 7, greed: 0.88, abilityFreq: 0.45, pdTarget: 18, headStart: 1, parFlat: 5, horizon: 1, focus: 0.7, slag: 0.19, patchDrop: 0.24, jobTiers: [1, 2, 2] },
  4: { grid: [9, 9], oppRam: 7, greed: 0.93, abilityFreq: 0.6, pdTarget: 18, headStart: 2, parFlat: 4, horizon: 2, focus: 0.8, slag: 0.2, patchDrop: 0.22, jobTiers: [2, 2, 3] },
  5: { grid: [11, 9], oppRam: 8, greed: 0.94, abilityFreq: 0.55, pdTarget: 20, minPd: 9, headStart: 2, parFlat: 4, horizon: 2, focus: 0.8, slag: 0.21, patchDrop: 0.18, jobTiers: [2, 3, 3] },
  6: { grid: [11, 9], oppRam: 8, greed: 0.98, abilityFreq: 0.78, pdTarget: 20, minPd: 10, headStart: 3, parFlat: 3, horizon: 2, focus: 0.9, slag: 0.22, patchDrop: 0.16, jobTiers: [3, 3, 3] },
  7: { grid: [11, 11], oppRam: 9, greed: 0.99, abilityFreq: 0.65, pdTarget: 21, minPd: 10, headStart: 3, parFlat: 2, horizon: 2, focus: 0.9, slag: 0.23, patchDrop: 0.13, jobTiers: [3, 3, 4] },
  8: { grid: [13, 11], oppRam: 10, greed: 0.98, abilityFreq: 0.7, pdTarget: 22, minPd: 10, headStart: 3, parFlat: 2, horizon: 3, focus: 0.9, slag: 0.24, patchDrop: 0.12, jobTiers: [4, 4, 4] },
  9: { grid: [13, 11], oppRam: 11, greed: 0.97, abilityFreq: 0.75, pdTarget: 24, minPd: 12, headStart: 4, parFlat: 1, horizon: 3, focus: 0.95, slag: 0.25, patchDrop: 0.11, jobTiers: [4, 4, 5] },
};

export const FINAL_DAY = 10;

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

export function dayDuelConfig(
  day: number,
  dominant: OppMode,
  tier: number,
  kitSeed: number,
): DuelConfig {
  const d = DAY_CONFIGS[day];
  const kit = oppKitFor(tier, dominant, kitSeed);
  return {
    w: d.grid[0],
    h: d.grid[1],
    oppRam: d.oppRam,
    greed: d.greed,
    abilityFreq: d.abilityFreq,
    pdTarget: d.pdTarget,
    minPd: d.minPd,
    headStart: d.headStart,
    oppAttackModes: kit.attackModes,
    oppDefendModes: kit.defendModes,
    oppTier: kit.oppTier,
    dominant,
    parFlat: d.parFlat,
    horizon: d.horizon,
    focus: d.focus,
    slag: d.slag,
  };
}

/**
 * The father's machine. Top of every curve, every mode at full width, the
 * biggest grid, already five nodes deep when you sit down. Mechanically an
 * ordinary duel; that is the point.
 */
export function finaleConfig(): DuelConfig {
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
    // Tight on purpose: the finale pays for every wasted turn. Not zero -
    // at zero a 29-cost route put 100% of finale wins over par.
    parFlat: 2,
    // Full depth. It reads your grid as well as its own and will stop racing
    // to cut you the moment your clock is shorter than its.
    horizon: 3,
    focus: 1,
    slag: 0.27,
    // It was already inside. The machine opens the duel, so no kit, however
    // stacked, ever closes the back room before it has moved.
    oppOpens: true,
  };
}

/**
 * The scripted, unwinnable opening dive. The machine plays at quarter
 * speed while the bench walks the player through all three programs -
 * scan the trap it planted, purge it, twist its line back - then it stops
 * pretending and seals. Losing it is the tutorial's final lesson.
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

/** Job pay before modifiers. Halved on a turn-cap win at the run layer. */
export function jobPay(tier: number): number {
  return 40 + 25 * tier;
}
