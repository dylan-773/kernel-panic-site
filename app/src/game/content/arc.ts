import { AbilityId, AbilityVerb, DuelConfig } from "../duel-types";
import { Rng } from "../rng";
import { ABILITIES, BASE_ABILITIES } from "./abilities";

/**
 * The fixed escalation curve. Every run walks the same ten days, ending in
 * the finale; per-day numbers live here so balance is one table, not code.
 * Day 10 is the finale duel alone — reaching it is the day.
 */

export interface DayConfig {
  grid: [number, number];
  oppRam: number;
  greed: number;
  abilityFreq: number;
  placesPerTurn: number;
  /** Target winding-route length produced by the slag scatter. */
  minPath: number;
  /** Pre-placed intrusion nodes at dive start. */
  headStart: number;
  /** Opponent difficulty tier of the day's three jobs. */
  jobTiers: [number, number, number];
  kitSize: number;
}

export const DAY_CONFIGS: Record<number, DayConfig> = {
  1: { grid: [7, 7], oppRam: 3, greed: 0.45, abilityFreq: 0.1, placesPerTurn: 1, minPath: 6, headStart: 0, jobTiers: [1, 1, 1], kitSize: 1 },
  2: { grid: [9, 7], oppRam: 3, greed: 0.55, abilityFreq: 0.15, placesPerTurn: 1, minPath: 7, headStart: 0, jobTiers: [1, 1, 2], kitSize: 2 },
  3: { grid: [9, 7], oppRam: 4, greed: 0.6, abilityFreq: 0.2, placesPerTurn: 2, minPath: 7, headStart: 0, jobTiers: [1, 2, 2], kitSize: 2 },
  4: { grid: [9, 9], oppRam: 4, greed: 0.65, abilityFreq: 0.25, placesPerTurn: 2, minPath: 8, headStart: 1, jobTiers: [2, 2, 3], kitSize: 2 },
  5: { grid: [9, 9], oppRam: 5, greed: 0.7, abilityFreq: 0.3, placesPerTurn: 2, minPath: 8, headStart: 1, jobTiers: [2, 3, 3], kitSize: 3 },
  6: { grid: [9, 9], oppRam: 5, greed: 0.78, abilityFreq: 0.35, placesPerTurn: 3, minPath: 9, headStart: 2, jobTiers: [3, 3, 3], kitSize: 3 },
  7: { grid: [11, 9], oppRam: 6, greed: 0.82, abilityFreq: 0.4, placesPerTurn: 3, minPath: 9, headStart: 2, jobTiers: [3, 3, 4], kitSize: 3 },
  8: { grid: [11, 9], oppRam: 7, greed: 0.88, abilityFreq: 0.45, placesPerTurn: 3, minPath: 10, headStart: 3, jobTiers: [4, 4, 4], kitSize: 4 },
  9: { grid: [11, 11], oppRam: 8, greed: 0.92, abilityFreq: 0.5, placesPerTurn: 4, minPath: 11, headStart: 3, jobTiers: [4, 4, 5], kitSize: 4 },
};

export const FINAL_DAY = 10;

/** Deterministic opponent kit: the dominant verb's base ability plus fill. */
export function buildOppKit(size: number, dominant: AbilityVerb, seed: number): AbilityId[] {
  const rng = new Rng(seed);
  const kit: AbilityId[] = [];
  const domBase = BASE_ABILITIES.find((a) => a.verb === dominant);
  if (domBase) kit.push(domBase.id);
  const rest = rng.shuffle(BASE_ABILITIES.filter((a) => a.verb !== dominant).map((a) => a.id));
  while (kit.length < size && rest.length > 0) kit.push(rest.pop() as AbilityId);
  return kit;
}

export function dayDuelConfig(day: number, dominant: AbilityVerb, kitSeed: number): DuelConfig {
  const d = DAY_CONFIGS[day];
  return {
    w: d.grid[0],
    h: d.grid[1],
    oppRam: d.oppRam,
    greed: d.greed,
    abilityFreq: d.abilityFreq,
    placesPerTurn: d.placesPerTurn,
    minPath: d.minPath,
    headStart: d.headStart,
    oppKit: buildOppKit(d.kitSize, dominant, kitSeed),
    dominant,
  };
}

/**
 * The father's machine. Top of every curve, full mirrored kit (every base
 * verb), the biggest grid. Mechanically an ordinary duel — that is the point.
 */
export function finaleConfig(): DuelConfig {
  return {
    w: 13,
    h: 11,
    oppRam: 9,
    greed: 0.97,
    abilityFreq: 0.55,
    placesPerTurn: 4,
    minPath: 12,
    headStart: 4,
    oppKit: BASE_ABILITIES.map((a) => a.id),
    dominant: "redirect",
  };
}

/**
 * The scripted, unwinnable opening dive. The machine draws only crosses,
 * never misplays, and out-generates the player three to one on a grid too
 * wide to rush: it reaches the core on its first turn cycle no matter what
 * the player does. Losing it is the tutorial's final lesson.
 */
export function tutorialConfig(): DuelConfig {
  return {
    w: 9,
    h: 7,
    oppRam: 8,
    greed: 1,
    abilityFreq: 0,
    placesPerTurn: 3,
    minPath: 0,
    headStart: 0,
    oppKit: [],
    dominant: "redirect",
    tutorial: true,
  };
}

/** Job pay before modifiers. Halved on a turn-cap win at the run layer. */
export function jobPay(tier: number): number {
  return 40 + 25 * tier;
}
