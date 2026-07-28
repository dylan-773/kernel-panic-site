/**
 * The v5 kit: every diver carries exactly three programs - SCAN, ATTACK,
 * DEFEND - each 1 RAM, each castable once per turn. Programs never unlock;
 * they upgrade (tier, at day close) and reconfigure (mode, from augments
 * won after each cleared job). All numbers the reducers use live here.
 */

export type AttackMode = "redirect" | "armHalt" | "armSiphon";
export type DefendMode = "purge" | "lock" | "ward";
export type OppMode = AttackMode | DefendMode;
export type Program = "scan" | "attack" | "defend";
export type Tier = 1 | 2 | 3;

export const PROGRAM_COST = 1;

/** Scan reveal radius from your territory, by tier (3 = whole board). */
export const SCAN_RANGE: Record<Tier, number> = { 1: 3, 2: 6, 3: 99 };

/** Attack targets per cast (nodes redirected, or traps planted). */
export const ATTACK_WIDTH: Record<Tier, number> = { 1: 1, 2: 2, 3: 3 };

/** Defend targets per cast (traps cleared, locks placed). */
export const DEFEND_WIDTH: Record<Tier, number> = { 1: 1, 2: 2, 3: 3 };

/** Ward bubble radius (Manhattan) around its target, by tier. */
export const WARD_RADIUS: Record<Tier, number> = { 1: 1, 2: 2, 3: 3 };

export const LOCK_ROUNDS = 2;
export const WARD_ROUNDS = 2;
/** Siphon steal scales with the caster's ATTACK tier (width buys bite too). */
export const SIPHON_STEAL: Record<Tier, number> = { 1: 2, 2: 3, 3: 4 };

/**
 * Par: the rotation budget for a clean dive, computed at board gen from
 * the player's starting route cost. Rotations past par chip strain on a
 * win; program twists and patch cells never count against it.
 */
export const PAR_RATE = 1.25;
export const PAR_FLAT = 2;
/** Strain lost per rotation past par. */
export const PAR_STRAIN_PER = 2;

/** Neutral junctions within this many steps of your territory can be rotated. */
export const BASE_REACH = 2;

/**
 * Cascade payoff: +1 RAM per 4 nodes claimed in one settle, capped, and
 * BANKED into the next turn. Paying it out immediately compounds into a
 * degenerate snowball (the whole route finishes in a turn); banked, it is
 * pure tempo you feel on the very next cycle.
 */
export function cascadeRam(claimed: number): number {
  return Math.min(2, Math.floor(claimed / 4));
}

export const PROGRAM_LABEL: Record<Program, string> = {
  scan: "SCAN",
  attack: "ATTACK",
  defend: "DEFEND",
};

export const ATTACK_MODE_LABEL: Record<AttackMode, string> = {
  redirect: "REDIRECT",
  armHalt: "ARM: HALT",
  armSiphon: "ARM: SIPHON",
};

export const DEFEND_MODE_LABEL: Record<DefendMode, string> = {
  purge: "PURGE",
  lock: "LOCK",
  ward: "WARD",
};

export const MODE_LABEL: Record<OppMode, string> = {
  ...ATTACK_MODE_LABEL,
  ...DEFEND_MODE_LABEL,
};

export function attackModeDesc(mode: AttackMode, tier: Tier): string {
  const w = ATTACK_WIDTH[tier];
  const n = w === 1 ? "one node" : `${w} nodes`;
  switch (mode) {
    case "redirect":
      return `Twist ${w === 1 ? "any enemy or open junction" : `${w} enemy or open junctions`} anywhere on the board a quarter turn, no reach limit. Cuts power to everything downstream.`;
    case "armHalt":
      return `Plant a halt trap on ${n === "one node" ? "an open junction" : `${w} open junctions`}. When their signal claims it, they lose a full turn.`;
    case "armSiphon":
      return `Plant a siphon trap on ${n === "one node" ? "an open junction" : `${w} open junctions`}. When it fires, ${SIPHON_STEAL[tier]} RAM drains from their next turn into yours.`;
  }
}

export function defendModeDesc(mode: DefendMode, tier: Tier): string {
  const w = DEFEND_WIDTH[tier];
  switch (mode) {
    case "purge":
      return `Disarm ${w === 1 ? "one revealed trap" : `${w} revealed traps`}. Scan first; you cannot defuse what you cannot see.`;
    case "lock":
      return `Freeze ${w === 1 ? "a junction" : `${w} junctions`} for ${LOCK_ROUNDS} rounds: nothing rotates or redirects ${w === 1 ? "it" : "them"}. Bolt down your line, or a junction it needs.`;
    case "ward":
      return `Ward a junction and everything within ${WARD_RADIUS[tier]} of it for ${WARD_ROUNDS} rounds: no new traps land there, and REDIRECT cannot touch it.`;
  }
}

export function scanDesc(tier: Tier): string {
  const r = SCAN_RANGE[tier];
  return r >= 99
    ? "Expose every armed node on the entire board, permanently. Always 1 RAM."
    : `Expose every armed node within ${r} of your territory, permanently. Always 1 RAM.`;
}

/* ------------------------------------------------------------------ */
/* Augments                                                            */
/* ------------------------------------------------------------------ */

export type AugmentId = string;

/** Flat strain chip on a gridlock win: the dead link bites on the way out. */
export const GRIDLOCK_CHIP = 6;

/**
 * Draft gate, declarative so the UI, the MANUAL, and the sims can all
 * render and verify it: "augment" needs another augment owned first,
 * "pouch" needs the patch pouch to hold at least one piece at roll time.
 */
export type AugmentRequire =
  | { kind: "augment"; id: AugmentId }
  | { kind: "pouch" };

export interface AugmentDef {
  id: AugmentId;
  name: string;
  kind: "config" | "boost";
  desc: string;
  /** Config augments unlock a mode on a program. */
  attackMode?: AttackMode;
  defendMode?: DefendMode;
  /** Offered in a draft only when this passes. */
  requires?: AugmentRequire;
  /** Draft weight. Defaults: config 3, boost 1. */
  weight?: number;
}

export const AUGMENTS: AugmentDef[] = [
  {
    id: "cfgArmHalt",
    name: "HALT DRIVER",
    kind: "config",
    attackMode: "armHalt",
    desc: "ATTACK config: plant halt traps. A sprung trap costs the intrusion its whole next turn.",
  },
  {
    id: "cfgArmSiphon",
    name: "SIPHON DRIVER",
    kind: "config",
    attackMode: "armSiphon",
    desc: "ATTACK config: plant siphon traps. A sprung trap drains RAM from its next turn into yours, more at higher ATTACK tiers, and more again when you are the one springing it.",
  },
  {
    id: "cfgLock",
    name: "CLAMP DRIVER",
    kind: "config",
    defendMode: "lock",
    desc: `DEFEND config: freeze junctions for ${LOCK_ROUNDS} rounds against rotation and redirects.`,
  },
  {
    id: "cfgWard",
    name: "WARD DRIVER",
    kind: "config",
    defendMode: "ward",
    desc: "DEFEND config: ward an area so no new traps can land in it, and REDIRECT cannot touch anything inside it either, for the full duration on both sides.",
  },
  {
    id: "longArms",
    name: "LONG ARMS",
    kind: "boost",
    desc: "Rotate open junctions up to 4 steps from your territory instead of 2, and place patch pieces just as far. Bigger setups, bigger cascades.",
  },
  {
    id: "siphonPlus",
    name: "DEEP SIPHON",
    kind: "boost",
    requires: { kind: "augment", id: "cfgArmSiphon" },
    desc: "Your siphon traps steal 1 extra RAM.",
  },
  {
    id: "tripwire",
    name: "TRIPWIRE",
    kind: "boost",
    requires: { kind: "augment", id: "cfgArmHalt" },
    desc: "Your halt traps also burn 3 RAM off the victim's next active turn.",
  },
  {
    id: "cheapShot",
    name: "CHEAP SHOT",
    kind: "boost",
    desc: "Your first ATTACK each dive costs 0 RAM.",
  },
  {
    id: "hotBoot",
    name: "HOT BOOT",
    kind: "boost",
    desc: "Start every dive with +1 RAM on your first turn.",
  },
  {
    id: "tapLine",
    name: "TAP LINE",
    kind: "boost",
    desc: "SCAN also traces the intrusion's planned route to the core, visible for 2 rounds.",
  },
  {
    id: "echoTap",
    name: "ECHO TAP",
    kind: "boost",
    desc: "Whenever one of your traps fires, gain 2 RAM on your next turn.",
  },
  {
    id: "jamAnchor",
    name: "JAM ANCHOR",
    kind: "boost",
    desc: "Your REDIRECT also freezes the junction it twists through the reply and into your next turn. Nothing rotates or redirects it back while it holds.",
  },
  {
    id: "sweepCredit",
    name: "SWEEP CREDIT",
    kind: "boost",
    desc: "PURGE refunds 1 RAM per trap it defuses, up to 3 per cast.",
  },
  {
    id: "cleanRun",
    name: "CLEAN RUN",
    kind: "boost",
    desc: "Win a dive with zero strain billed and bank one random patch piece. A trap-free win that only misses at the round cap pays 15 credits instead.",
  },
  {
    id: "patchRefund",
    name: "SPLICE REFUND",
    kind: "boost",
    requires: { kind: "pouch" },
    desc: "Placing a patch piece refunds its full RAM cost the instant it lands. The pouch still spends the piece itself.",
  },
  {
    id: "firstFault",
    name: "FIRST FAULT",
    kind: "boost",
    desc: "The first trap that fires on you each dive bills zero Neural Strain. Every trap after that costs full.",
  },
  {
    id: "overtimeClause",
    name: "OVERTIME CLAUSE",
    kind: "boost",
    desc: "Cap wins pay 75 percent of the ticket instead of 50. The client eats every hour past the deadline, not half.",
  },
  {
    id: "darkDiscount",
    name: "DARKNET RATE",
    kind: "boost",
    desc: "Dark web patch piece pulls cost 15 percent less. The vendor still only takes credits and the roll stays blind.",
  },
];

export const AUGMENT_BY_ID: Record<AugmentId, AugmentDef> = Object.fromEntries(
  AUGMENTS.map((a) => [a.id, a]),
);

/* ------------------------------------------------------------------ */
/* Analyze tells: what the diagnostic says about the machine's config  */
/* ------------------------------------------------------------------ */

export const MODE_TELL: Record<OppMode, string> = {
  redirect: "Diagnostic flags rerouting activity. Your junctions will get twisted off true.",
  armHalt: "Diagnostic flags halt traps. One wrong claim and you lose a whole turn. Scan early.",
  armSiphon: "Diagnostic flags siphon traps. It wants your RAM more than your route. Scan early.",
  purge: "Diagnostic flags self-cleaning routines. Traps you plant will not stick around.",
  lock: "Diagnostic flags clamp routines. Junctions you need will freeze solid.",
  ward: "Diagnostic flags warding fields. Whole approaches will refuse your traps and shrug off your redirects.",
};
