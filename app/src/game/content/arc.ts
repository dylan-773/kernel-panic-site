import { DuelConfig } from "../duel-types";
import { Rng } from "../rng";
import { AttackMode, DefendMode, OppMode, Tier } from "./kit";

/**
 * The fixed escalation curve for the flood-claim duel. Every run walks the
 * same ten days, ending in the finale; per-day numbers live here so balance
 * is one table, not code. minCost is the target route cost in rotation RAM;
 * headStart is how many nodes deep the intrusion already sits at dive start.
 */

export interface DayConfig {
  grid: [number, number];
  oppRam: number;
  greed: number;
  abilityFreq: number;
  minCost: number;
  /** Floor on the player's opening route cost (see DuelConfig.minPd). */
  minPd?: number;
  headStart: number;
  /** Flat term of the par margin for this day (tapers late; see kit.ts). */
  parFlat: number;
  /** Slag density at board generation. */
  slag: number;
  /** Chance a cleared job drops a random patch piece. */
  patchDrop: number;
  /** Opponent difficulty tier of the day's three jobs. */
  jobTiers: [number, number, number];
}

export const DAY_CONFIGS: Record<number, DayConfig> = {
  1: { grid: [9, 7], oppRam: 6, greed: 0.7, abilityFreq: 0.2, minCost: 16, headStart: 0, parFlat: 6, slag: 0.18, patchDrop: 0.35, jobTiers: [1, 1, 1] },
  2: { grid: [9, 7], oppRam: 6, greed: 0.76, abilityFreq: 0.32, minCost: 16, headStart: 0, parFlat: 5, slag: 0.18, patchDrop: 0.35, jobTiers: [1, 1, 2] },
  3: { grid: [9, 9], oppRam: 6, greed: 0.88, abilityFreq: 0.45, minCost: 18, headStart: 1, parFlat: 5, slag: 0.19, patchDrop: 0.24, jobTiers: [1, 2, 2] },
  4: { grid: [9, 9], oppRam: 6, greed: 0.91, abilityFreq: 0.45, minCost: 18, headStart: 2, parFlat: 4, slag: 0.2, patchDrop: 0.22, jobTiers: [2, 2, 3] },
  5: { grid: [11, 9], oppRam: 7, greed: 0.94, abilityFreq: 0.55, minCost: 20, minPd: 9, headStart: 2, parFlat: 4, slag: 0.21, patchDrop: 0.18, jobTiers: [2, 3, 3] },
  6: { grid: [11, 9], oppRam: 7, greed: 0.98, abilityFreq: 0.6, minCost: 20, minPd: 10, headStart: 2, parFlat: 3, slag: 0.22, patchDrop: 0.16, jobTiers: [3, 3, 3] },
  7: { grid: [11, 11], oppRam: 7, greed: 0.99, abilityFreq: 0.65, minCost: 21, minPd: 10, headStart: 3, parFlat: 2, slag: 0.23, patchDrop: 0.13, jobTiers: [3, 3, 4] },
  8: { grid: [13, 11], oppRam: 8, greed: 0.98, abilityFreq: 0.7, minCost: 22, minPd: 10, headStart: 3, parFlat: 2, slag: 0.24, patchDrop: 0.12, jobTiers: [4, 4, 4] },
  9: { grid: [13, 11], oppRam: 10, greed: 0.97, abilityFreq: 0.75, minCost: 24, minPd: 12, headStart: 4, parFlat: 1, slag: 0.25, patchDrop: 0.11, jobTiers: [4, 4, 5] },
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
    minCost: d.minCost,
    minPd: d.minPd,
    headStart: d.headStart,
    oppAttackModes: kit.attackModes,
    oppDefendModes: kit.defendModes,
    oppTier: kit.oppTier,
    dominant,
    parFlat: d.parFlat,
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
    w: 17,
    h: 13,
    oppRam: 11,
    greed: 1,
    abilityFreq: 0.9,
    minCost: 34,
    minPd: 18,
    headStart: 1,
    oppAttackModes: [...ATTACK_ALL],
    oppDefendModes: [...DEFEND_ALL],
    oppTier: 3,
    dominant: "redirect",
    // Tighter than day 9 on purpose: the finale pays for every wasted turn.
    parFlat: 0,
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
    minCost: 14,
    headStart: 0,
    oppAttackModes: ["armHalt"],
    oppDefendModes: [],
    oppTier: 1,
    dominant: "armHalt",
    tutorial: true,
  };
}

/** Job pay before modifiers. Halved on a turn-cap win at the run layer. */
export function jobPay(tier: number): number {
  return 40 + 25 * tier;
}
