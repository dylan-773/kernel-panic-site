import { AbilityId, AbilityVerb, DuelConfig } from "../duel-types";
import { Rng } from "../rng";
import { BASE_ABILITIES } from "./abilities";

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
  headStart: number;
  /** Opponent difficulty tier of the day's three jobs. */
  jobTiers: [number, number, number];
  kitSize: number;
}

export const DAY_CONFIGS: Record<number, DayConfig> = {
  1: { grid: [9, 7], oppRam: 6, greed: 0.75, abilityFreq: 0.35, minCost: 16, headStart: 0, jobTiers: [1, 1, 1], kitSize: 1 },
  2: { grid: [9, 7], oppRam: 6, greed: 0.78, abilityFreq: 0.4, minCost: 16, headStart: 1, jobTiers: [1, 1, 2], kitSize: 2 },
  3: { grid: [9, 9], oppRam: 6, greed: 0.82, abilityFreq: 0.45, minCost: 18, headStart: 1, jobTiers: [1, 2, 2], kitSize: 2 },
  4: { grid: [9, 9], oppRam: 7, greed: 0.85, abilityFreq: 0.5, minCost: 18, headStart: 2, jobTiers: [2, 2, 3], kitSize: 2 },
  5: { grid: [11, 9], oppRam: 7, greed: 0.88, abilityFreq: 0.55, minCost: 20, headStart: 2, jobTiers: [2, 3, 3], kitSize: 3 },
  6: { grid: [11, 9], oppRam: 7, greed: 0.9, abilityFreq: 0.6, minCost: 20, headStart: 2, jobTiers: [3, 3, 3], kitSize: 3 },
  7: { grid: [11, 9], oppRam: 8, greed: 0.93, abilityFreq: 0.65, minCost: 21, headStart: 3, jobTiers: [3, 3, 4], kitSize: 3 },
  8: { grid: [11, 11], oppRam: 8, greed: 0.95, abilityFreq: 0.7, minCost: 22, headStart: 3, jobTiers: [4, 4, 4], kitSize: 4 },
  9: { grid: [11, 11], oppRam: 9, greed: 0.97, abilityFreq: 0.75, minCost: 22, headStart: 4, jobTiers: [4, 4, 5], kitSize: 4 },
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
    minCost: d.minCost,
    headStart: d.headStart,
    oppKit: buildOppKit(d.kitSize, dominant, kitSeed),
    dominant,
  };
}

/**
 * The father's machine. Top of every curve, the full kit, the biggest grid,
 * already four nodes deep when you sit down. Mechanically an ordinary duel;
 * that is the point.
 */
export function finaleConfig(): DuelConfig {
  return {
    w: 13,
    h: 11,
    oppRam: 10,
    greed: 1,
    abilityFreq: 0.8,
    minCost: 24,
    headStart: 5,
    oppKit: BASE_ABILITIES.map((a) => a.id),
    dominant: "redirect",
  };
}

/**
 * The scripted, unwinnable opening dive: the machine generates nearly
 * triple the player's RAM against a route it can finish in one turn cycle.
 * Losing it is the tutorial's final lesson.
 */
export function tutorialConfig(): DuelConfig {
  return {
    w: 9,
    h: 7,
    oppRam: 22,
    greed: 1,
    abilityFreq: 0,
    minCost: 14,
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
