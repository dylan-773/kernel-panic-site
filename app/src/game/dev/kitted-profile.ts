/**
 * The canonical kitted player build for the balance harness. Not imported
 * by app code.
 *
 * One day-progressive profile rather than disconnected snapshots: a fixed
 * 9-pick night schedule, applied pick by pick, so the day-d sim kit is
 * exactly what a run following that schedule would hold walking into day d.
 * The finale row therefore measures the full kit. Mode pairs cycle per
 * seed from day 3 so all three archetypes get coverage without letting a
 * fully random build double the variance.
 */

import { AttackMode, AUGMENT_BY_ID, DefendMode, Tier } from "../content/kit";
import { mixSeed } from "../duel-setup";
import { DuelKit } from "../duel-types";
import { rollPatchMask } from "../patch-cells";
import { Rng } from "../rng";
import { BASE_RAM } from "../run-reducer";

/** The one upgrade per closed night: 4 RAM + 2 attack + 1 scan + 2 defend. */
export const NIGHT_SCHEDULE = [
  "ram",
  "attack",
  "ram",
  "scan",
  "ram",
  "defend",
  "attack",
  "ram",
  "defend",
] as const;

/**
 * Build archetypes, cycled per seed from day 3. Purge appears twice on
 * purpose: it is the defensive workhorse against late trap pressure. Each
 * pair names the mode-matched boost that fills the third slot at day 6.
 * Only engine-passive boosts belong here; the policy bot has no
 * boost-specific code.
 */
export const MODE_PAIRS: Array<{ attack: AttackMode; defend: DefendMode; boost: string }> = [
  { attack: "redirect", defend: "purge", boost: "jamAnchor" },
  { attack: "armSiphon", defend: "purge", boost: "siphonPlus" },
  { attack: "armHalt", defend: "lock", boost: "tripwire" },
];

/** Slot-capped boost schedule: day it comes online -> augment id. */
export const BOOST_SCHEDULE: Array<{ day: number; id: string | "pair" }> = [
  { day: 2, id: "hotBoot" },
  { day: 4, id: "longArms" },
  { day: 6, id: "pair" },
];

// Tripwire for the ability agent: a catalog cut that touches this schedule
// must update it, or the harness refuses to run at all.
for (const id of [
  ...BOOST_SCHEDULE.map((b) => b.id).filter((id) => id !== "pair"),
  ...MODE_PAIRS.map((p) => p.boost),
]) {
  if (!AUGMENT_BY_ID[id]) {
    throw new Error(`kitted profile schedules unknown augment: ${id}`);
  }
}

function picksAtDay(day: number): readonly string[] {
  return NIGHT_SCHEDULE.slice(0, Math.max(0, Math.min(day - 1, NIGHT_SCHEDULE.length)));
}

export function ramAtDay(day: number): number {
  return BASE_RAM + picksAtDay(day).filter((p) => p === "ram").length;
}

function tierAtDay(day: number, prog: "scan" | "attack" | "defend"): Tier {
  return Math.min(3, 1 + picksAtDay(day).filter((p) => p === prog).length) as Tier;
}

/** Patch pieces walking into the day: none early, a decent pouch late. */
export function cellsAtDay(day: number): number {
  if (day <= 2) return 0;
  if (day <= 4) return 1;
  if (day <= 6) return 2;
  return 3;
}

/** Mint the day's held pieces deterministically per seed. */
export function pouchAtDay(day: number, seed: number): number[] {
  const rng = new Rng(mixSeed(seed, 0x9ec));
  return Array.from({ length: cellsAtDay(day) }, () => rollPatchMask(rng));
}

/**
 * The day-d kit for one seed. Deterministic; the pair salt keeps the
 * player archetype decorrelated from the opp dominant (seed % 6 in sim.ts,
 * and gcd(3, 6) = 3 would lock them in phase without it).
 */
export function kitAtDay(day: number, seed: number): DuelKit {
  const pair = day <= 2 ? MODE_PAIRS[0] : MODE_PAIRS[mixSeed(seed, 0x77aa) % MODE_PAIRS.length];
  const augments: string[] = [];
  for (const b of BOOST_SCHEDULE) {
    if (day >= b.day) augments.push(b.id === "pair" ? pair.boost : b.id);
  }
  return {
    scanTier: tierAtDay(day, "scan"),
    attackTier: tierAtDay(day, "attack"),
    defendTier: tierAtDay(day, "defend"),
    attackMode: pair.attack,
    defendMode: pair.defend,
    augments,
    patchPouch: pouchAtDay(day, seed),
  };
}
