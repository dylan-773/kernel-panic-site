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
    desc: "Trap any open node on the board. When their signal claims it, the trap fires: their flood stops dead and they lose a full turn.",
    p: { traps: 1 },
  },
  {
    id: "arm2",
    verb: "arm",
    name: "Arm Node II",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Trap two open nodes in one cast. Fence off a whole approach.",
    p: { traps: 2 },
  },
  {
    id: "armMag",
    verb: "arm",
    name: "Mag Trap",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Trap one node; when it fires it also drains 2 RAM from their next active turn.",
    p: { traps: 1, drain: 2 },
  },
  // ---- Scan ----
  {
    id: "scan",
    verb: "scan",
    name: "Scan",
    tier: 1,
    variant: false,
    ramCost: 2,
    desc: "Expose every enemy trap on the board, permanently. The counter to Arm Node.",
    p: {},
  },
  {
    id: "scanDeep",
    verb: "scan",
    name: "Deep Scan",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Expose all traps and read the intrusion's next intent for the rest of the dive.",
    p: { intent: true },
  },
  {
    id: "scanSweep",
    verb: "scan",
    name: "Sweep Scan",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Expose all traps and defuse two of them outright.",
    p: { disarm: 2 },
  },
  // ---- Redirect ----
  {
    id: "redirect",
    verb: "redirect",
    name: "Redirect",
    tier: 1,
    variant: false,
    ramCost: 2,
    desc: "Twist any enemy or unclaimed node a quarter turn, anywhere on the board. Cuts power to everything downstream of it.",
    p: { rotSteps: 1, targets: 1 },
  },
  {
    id: "redirectHard",
    verb: "redirect",
    name: "Hard Redirect",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Twist an enemy node a half turn. Two RAM of repair work for them, minimum.",
    p: { rotSteps: 2, targets: 1 },
  },
  {
    id: "redirectTwin",
    verb: "redirect",
    name: "Twin Redirect",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Twist two enemy nodes a quarter turn each.",
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
    desc: "Freeze any friendly or open junction for two rounds: it cannot be rotated, redirected or trapped. Lock your own line, or freeze a junction they need.",
    p: { shieldRounds: 2, targets: 1 },
  },
  {
    id: "shieldLong",
    verb: "shield",
    name: "Long Shield",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Freeze a junction for three rounds.",
    p: { shieldRounds: 3, targets: 1 },
  },
  {
    id: "shieldTwin",
    verb: "shield",
    name: "Twin Shield",
    tier: 1,
    variant: true,
    ramCost: 3,
    desc: "Freeze two junctions for two rounds each.",
    p: { shieldRounds: 2, targets: 2 },
  },
  // ---- Overload ----
  {
    id: "overload",
    verb: "overload",
    name: "Overload",
    tier: 2,
    variant: false,
    ramCost: 3,
    desc: "Jam one enemy routine for their next two turns.",
    p: { lockTurns: 2 },
  },
  {
    id: "overloadDeep",
    verb: "overload",
    name: "Deep Overload",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "Jam one enemy routine for three turns.",
    p: { lockTurns: 3 },
  },
  {
    id: "overloadBrown",
    verb: "overload",
    name: "Brownout",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "Brownout: the intrusion generates 3 less RAM next turn.",
    p: { enemyRamDrain: 3 },
  },
  // ---- Overclock ----
  {
    id: "overclock",
    verb: "overclock",
    name: "Overclock",
    tier: 2,
    variant: false,
    ramCost: 3,
    desc: "Generate 3 bonus RAM on your next turn.",
    p: { ramBoost: 3, boostTurns: 1 },
  },
  {
    id: "overclock2",
    verb: "overclock",
    name: "Overclock II",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "Generate 4 bonus RAM on your next turn.",
    p: { ramBoost: 4, boostTurns: 1 },
  },
  {
    id: "overclockCache",
    verb: "overclock",
    name: "Cache Burn",
    tier: 2,
    variant: true,
    ramCost: 4,
    desc: "Generate 2 bonus RAM on each of your next three turns.",
    p: { ramBoost: 2, boostTurns: 3 },
  },
  // ---- Firewall ----
  {
    id: "firewall",
    verb: "firewall",
    name: "Firewall",
    tier: 3,
    variant: false,
    ramCost: 4,
    desc: "Your territory and frontier ignore Arm, Redirect and enemy Shields for two rounds.",
    p: { wallRounds: 2 },
  },
  {
    id: "firewall2",
    verb: "firewall",
    name: "Firewall II",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Full immunity for three rounds.",
    p: { wallRounds: 3 },
  },
  {
    id: "firewallSpiked",
    verb: "firewall",
    name: "Spiked Firewall",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Immunity for two rounds; the intrusion also loses 2 RAM next turn.",
    p: { wallRounds: 2, enemyRamDrain: 2 },
  },
  // ---- Backdoor ----
  {
    id: "backdoor",
    verb: "backdoor",
    name: "Backdoor",
    tier: 3,
    variant: false,
    ramCost: 4,
    desc: "Wipe every enemy trap off the entire board, revealed or not.",
    p: { purge: true },
  },
  {
    id: "backdoorGhost",
    verb: "backdoor",
    name: "Ghost Backdoor",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Wipe all traps and freeze one of your junctions for two rounds.",
    p: { purge: true, shieldRounds: 2, targets: 1 },
  },
  {
    id: "backdoorEcho",
    verb: "backdoor",
    name: "Echo Backdoor",
    tier: 3,
    variant: true,
    ramCost: 5,
    desc: "Wipe all traps and read the intrusion's next intent.",
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
