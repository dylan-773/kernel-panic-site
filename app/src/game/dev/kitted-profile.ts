/**
 * The canonical kitted player build for the balance harness. Not imported
 * by app code.
 *
 * Stage-based, not day-based: on the open calendar the question "what deck
 * does a player hold when a tier N device lands on the counter" replaces
 * "what does day N look like". Each tier is paired with the deck a player
 * plausibly owns by the time the band opens that far - tier 1 meets the
 * starter deck, tier 5 meets a late one - so the gated win rates measure
 * the intended matchup, not a fixed-schedule fiction. Mode pairs cycle per
 * seed from tier 2 so all three archetypes get coverage without letting a
 * fully random build double the variance.
 */

import { AttackMode, AUGMENT_BY_ID, DefendMode, Tier } from "../content/kit";
import { BASE_RAM } from "../day-reducer";
import { mixSeed } from "../duel-setup";
import { DuelKit } from "../duel-types";
import { rollPatchMask } from "../patch-cells";
import { Rng } from "../rng";

export interface StageProfile {
  ram: number;
  scanTier: Tier;
  attackTier: Tier;
  defendTier: Tier;
  /** Patch pieces walking into the dive. */
  cells: number;
  /** Engine-passive boosts slotted at this stage ("pair" = the archetype's). */
  boosts: Array<string | "pair">;
}

/**
 * Deck by the tier being met. Stages carry the old measured schedule's
 * shape (the day-3/5/8/9 decks the retired arc validated) forward.
 */
export const STAGE_PROFILES: Record<number, StageProfile> = {
  1: { ram: BASE_RAM, scanTier: 1, attackTier: 1, defendTier: 1, cells: 0, boosts: [] },
  2: { ram: 6, scanTier: 1, attackTier: 2, defendTier: 1, cells: 1, boosts: ["hotBoot"] },
  3: { ram: 7, scanTier: 2, attackTier: 2, defendTier: 1, cells: 2, boosts: ["hotBoot", "longArms"] },
  4: { ram: 8, scanTier: 2, attackTier: 3, defendTier: 2, cells: 3, boosts: ["hotBoot", "longArms", "pair"] },
  5: { ram: 9, scanTier: 2, attackTier: 3, defendTier: 2, cells: 3, boosts: ["hotBoot", "longArms", "pair"] },
  /** The back room: the full late deck. */
  6: { ram: 9, scanTier: 2, attackTier: 3, defendTier: 3, cells: 3, boosts: ["hotBoot", "longArms", "pair"] },
};

/**
 * Build archetypes, cycled per seed from tier 2. Purge appears twice on
 * purpose: it is the defensive workhorse against late trap pressure. Each
 * pair names the mode-matched boost that fills the third slot late. Only
 * engine-passive boosts belong here; the policy bot has no boost-specific
 * code.
 */
export const MODE_PAIRS: Array<{ attack: AttackMode; defend: DefendMode; boost: string }> = [
  { attack: "redirect", defend: "purge", boost: "jamAnchor" },
  { attack: "armSiphon", defend: "purge", boost: "siphonPlus" },
  { attack: "armHalt", defend: "lock", boost: "tripwire" },
];

// Tripwire for the ability agent: a catalog cut that touches this schedule
// must update it, or the harness refuses to run at all.
for (const id of [
  ...Object.values(STAGE_PROFILES).flatMap((s) => s.boosts).filter((id) => id !== "pair"),
  ...MODE_PAIRS.map((p) => p.boost),
]) {
  if (!AUGMENT_BY_ID[id]) {
    throw new Error(`kitted profile schedules unknown augment: ${id}`);
  }
}

export function ramAtStage(stage: number): number {
  return STAGE_PROFILES[Math.max(1, Math.min(6, stage))].ram;
}

export function cellsAtStage(stage: number): number {
  return STAGE_PROFILES[Math.max(1, Math.min(6, stage))].cells;
}

/** Mint the stage's held pieces deterministically per seed. */
export function pouchAtStage(stage: number, seed: number): number[] {
  const rng = new Rng(mixSeed(seed, 0x9ec));
  return Array.from({ length: cellsAtStage(stage) }, () => rollPatchMask(rng));
}

/**
 * The stage deck for one seed. Deterministic; the pair salt keeps the
 * player archetype decorrelated from the opp dominant (seed % 6 in sim.ts,
 * and gcd(3, 6) = 3 would lock them in phase without it).
 */
export function kitAtStage(stage: number, seed: number): DuelKit {
  const p = STAGE_PROFILES[Math.max(1, Math.min(6, stage))];
  const pair = stage <= 1 ? MODE_PAIRS[0] : MODE_PAIRS[mixSeed(seed, 0x77aa) % MODE_PAIRS.length];
  return {
    scanTier: p.scanTier,
    attackTier: p.attackTier,
    defendTier: p.defendTier,
    attackMode: pair.attack,
    defendMode: pair.defend,
    augments: p.boosts.map((b) => (b === "pair" ? pair.boost : b)),
    patchPouch: pouchAtStage(stage, seed),
  };
}
