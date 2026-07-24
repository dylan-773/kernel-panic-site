import { AbilityDef, AbilityId, AbilityVerb } from "../duel-types";

/**
 * The full ability pool: 8 base verbs plus two parameter variants each.
 * Variants are config rows, not new mechanics — every field they change is
 * a number the reducer already understands. Tier governs activation cost
 * (T1=2, T2=3, T3=4 RAM; variants +1), never unlock eligibility.
 */

export const ABILITIES: AbilityDef[] = [
  // ---- Arm Node ----
  {
    id: "arm",
    verb: "arm",
    name: "Arm Node",
    tier: 1,
    variant: false,
    ramCost: 2,
    desc: "Trap an unpowered node on the opponent's grid. When their signal routes through it, the trap fires and costs them a turn.",
    p: { traps: 1 },
  },
  {
    id: "arm2",
    verb: "arm",
    name: "Arm Node II",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Trap two unpowered nodes on the opponent's grid in one cast.",
    p: { traps: 2 },
  },
  {
    id: "armMag",
    verb: "arm",
    name: "Mag Trap",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Trap one node; when it fires it also drains 1 RAM from the opponent's next turn.",
    p: { traps: 1, drain: 1 },
  },
  // ---- Scan ----
  {
    id: "scan",
    verb: "scan",
    name: "Scan",
    tier: 1,
    variant: false,
    ramCost: 2,
    desc: "Reveal every armed trap on your own grid. The direct counter to Arm Node.",
    p: {},
  },
  {
    id: "scanDeep",
    verb: "scan",
    name: "Deep Scan",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Reveal traps on your grid and the opponent's next intent.",
    p: { intent: true },
  },
  {
    id: "scanSweep",
    verb: "scan",
    name: "Sweep Scan",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Reveal traps on your grid and disarm one of them outright.",
    p: { disarm: 1 },
  },
  // ---- Redirect ----
  {
    id: "redirect",
    verb: "redirect",
    name: "Redirect",
    tier: 1,
    variant: false,
    ramCost: 2,
    desc: "Rotate one of the opponent's placed nodes a quarter turn, undoing progress.",
    p: { rotSteps: 1, targets: 1 },
  },
  {
    id: "redirectHard",
    verb: "redirect",
    name: "Hard Redirect",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Rotate one opponent node a half turn — twice the work to undo.",
    p: { rotSteps: 2, targets: 1 },
  },
  {
    id: "redirectTwin",
    verb: "redirect",
    name: "Twin Redirect",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Rotate two opponent nodes a quarter turn each.",
    p: { rotSteps: 1, targets: 2 },
  },
  // ---- Shield ----
  {
    id: "shield",
    verb: "shield",
    name: "Shield",
    tier: 1,
    variant: false,
    ramCost: 2,
    desc: "Lock one of your nodes against Arm Node and Redirect for a round.",
    p: { shieldRounds: 1, targets: 1 },
  },
  {
    id: "shieldLong",
    verb: "shield",
    name: "Long Shield",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Lock one of your nodes for two rounds.",
    p: { shieldRounds: 2, targets: 1 },
  },
  {
    id: "shieldTwin",
    verb: "shield",
    name: "Twin Shield",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Lock two of your nodes for a round.",
    p: { shieldRounds: 1, targets: 2 },
  },
  // ---- Overload ----
  {
    id: "overload",
    verb: "overload",
    name: "Overload",
    tier: 2,
    variant: false,
    ramCost: 3,
    desc: "Disable one opponent ability for their next turn.",
    p: { lockTurns: 1 },
  },
  {
    id: "overloadDeep",
    verb: "overload",
    name: "Deep Overload",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "Disable one opponent ability for their next two turns.",
    p: { lockTurns: 2 },
  },
  {
    id: "overloadBrown",
    verb: "overload",
    name: "Brownout",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "The opponent generates 2 less RAM on their next turn.",
    p: { enemyRamDrain: 2 },
  },
  // ---- Overclock ----
  {
    id: "overclock",
    verb: "overclock",
    name: "Overclock",
    tier: 2,
    variant: false,
    ramCost: 3,
    desc: "Generate 2 bonus RAM on your next turn — a tempo play.",
    p: { ramBoost: 2, boostTurns: 1 },
  },
  {
    id: "overclock2",
    verb: "overclock",
    name: "Overclock II",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "Generate 3 bonus RAM on your next turn.",
    p: { ramBoost: 3, boostTurns: 1 },
  },
  {
    id: "overclockCache",
    verb: "overclock",
    name: "Cache Burn",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "Generate 2 bonus RAM on each of your next two turns.",
    p: { ramBoost: 2, boostTurns: 2 },
  },
  // ---- Firewall ----
  {
    id: "firewall",
    verb: "firewall",
    name: "Firewall",
    tier: 3,
    variant: false,
    ramCost: 4,
    desc: "Your whole grid ignores Arm Node and Redirect for a round.",
    p: { wallRounds: 1 },
  },
  {
    id: "firewall2",
    verb: "firewall",
    name: "Firewall II",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Whole-grid immunity for two rounds.",
    p: { wallRounds: 2 },
  },
  {
    id: "firewallSpiked",
    verb: "firewall",
    name: "Spiked Firewall",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Whole-grid immunity for a round; the opponent also loses 1 RAM next turn.",
    p: { wallRounds: 1, enemyRamDrain: 1 },
  },
  // ---- Backdoor ----
  {
    id: "backdoor",
    verb: "backdoor",
    name: "Backdoor",
    tier: 3,
    variant: false,
    ramCost: 4,
    desc: "Instantly purge every trap on your grid — no Scan needed.",
    p: { purge: true },
  },
  {
    id: "backdoorGhost",
    verb: "backdoor",
    name: "Ghost Backdoor",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Purge every trap on your grid and shield one node for a round.",
    p: { purge: true, shieldRounds: 1, targets: 1 },
  },
  {
    id: "backdoorEcho",
    verb: "backdoor",
    name: "Echo Backdoor",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Purge every trap on your grid and glimpse the opponent's next intent.",
    p: { purge: true, intent: true },
  },
];

export const ABILITY_BY_ID: Record<AbilityId, AbilityDef> = Object.fromEntries(
  ABILITIES.map((a) => [a.id, a]),
);

export const BASE_ABILITIES = ABILITIES.filter((a) => !a.variant);

export function abilitiesOfVerb(verb: AbilityVerb): AbilityDef[] {
  return ABILITIES.filter((a) => a.verb === verb);
}

/** Copy price before a dive; unlocking always grants the first copy free. */
export function copyPrice(def: AbilityDef): number {
  const base = def.tier * 40;
  return def.variant ? Math.round(base * 1.5) : base;
}

export const VERB_LABEL: Record<AbilityVerb, string> = {
  arm: "Arm Node",
  scan: "Scan",
  redirect: "Redirect",
  shield: "Shield",
  overload: "Overload",
  overclock: "Overclock",
  firewall: "Firewall",
  backdoor: "Backdoor",
};

/** Analyze-screen line for each dominant verb. */
export const VERB_TELL: Record<AbilityVerb, string> = {
  arm: "Diagnostic flags latent trap routines. Expect armed nodes on your path.",
  scan: "Diagnostic flags sweep routines. It will find what you hide.",
  redirect: "Diagnostic flags rerouting activity. Your placed work will get twisted.",
  shield: "Diagnostic flags hardened sectors. Its nodes will resist interference.",
  overload: "Diagnostic flags suppression spikes. Your tools will cut out mid-dive.",
  overclock: "Diagnostic flags burst cycles. It will surge ahead in tempo.",
  firewall: "Diagnostic flags bulk shielding. Windows to strike will be short.",
  backdoor: "Diagnostic flags self-cleaning routines. Traps will not stick long.",
};
