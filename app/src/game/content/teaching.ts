/**
 * The teaching layer: every player-facing mechanic, where the player first
 * meets it, and how the game explains it there.
 *
 * Two rules make this hold together as the game grows:
 *
 * 1. Every entry in MECHANIC_INVENTORY resolves to a teaching moment or
 *    carries a written waiver. `dev/teach-sim.ts` fails the build otherwise.
 *    A new mechanic with no line here is a red build, not a thing somebody
 *    notices six patches later.
 * 2. Teaching happens at first contact, not up front. A coachmark fires the
 *    first time its surface is actually reached, once per save slot, ever.
 *    The opening dive teaches the four verbs and nothing else.
 *
 * The Tutorial Agent owns the moments (what is taught, where, on what
 * trigger). The Narrative Director owns the words. See tutorial/ledger.md.
 */

/** Surfaces a moment can attach to. Run screens plus two window surfaces. */
export type TeachSurface =
  | "tutorial"
  | "duel"
  | "day"
  | "analyze"
  | "loadout"
  | "result"
  | "upgrade"
  | "finalePre"
  | "runEnd"
  | "desktop";

/**
 * Declarative trigger. The proposal names one; the engine owns the predicate
 * and the call site supplies the signal. "firstSight" means the surface
 * being reached at all is the trigger.
 */
export type TeachWhen =
  | "firstSight"
  | "overPar"
  | "holdingCells"
  | "cascadeBanked"
  | "draftOffered";

export type TeachSignals = Partial<Record<TeachWhen, boolean>>;

export interface TeachingMoment {
  id: string;
  /** Mechanic ids from MECHANIC_INVENTORY that this moment covers. */
  teaches: string[];
  surface: TeachSurface;
  when: TeachWhen;
  /** Drives the callout's position class: `kp-teach-<anchor>`. */
  anchor: string;
  /** Lower shows first when two are eligible at once. Only one ever renders. */
  order: number;
  /** Earliest day this may fire. Keeps day one from becoming a lecture. */
  notBeforeDay: number;
  title: string;
  lines: string[];
  /** Copy order id when the wording is out with the Narrative Director. */
  copyOrder?: string;
}

/**
 * A persistent, re-readable explainer hanging off the control it describes.
 * The distinction that decides tip vs coachmark: a tip is REFERENCE the
 * player will want again later, a coachmark is a RULE they need once, at a
 * moment. A recurring number wants a tip. "Here is how this system works"
 * wants a coachmark.
 */
export interface TeachTip {
  id: string;
  teaches: string[];
  /** The control it hangs on, for the ledger. */
  control: string;
  text: string;
}

/**
 * Premises a blanket waiver can rest on. Each one is a claim about the
 * codebase that `dev/teach-sim.ts` verifies, so a waiver covering a whole
 * content type cannot quietly rot when that type grows.
 */
export type WaiverPremise = "augmentDescs" | "modeDescs";

export interface MechanicEntry {
  id: string;
  /** Human name, for the ledger and the harness report. */
  label: string;
  /** Where the player first meets it. */
  firstContact: TeachSurface;
  /**
   * Why no teaching moment is needed. Present means the mechanic is
   * deliberately self-evident; absent means a moment must cover it.
   */
  waiver?: string;
  /** Machine-checkable backing for a blanket waiver over a content type. */
  waiverPremise?: WaiverPremise;
}

/* ------------------------------------------------------------------ */
/* The inventory: everything the player has to understand              */
/* ------------------------------------------------------------------ */

export const MECHANIC_INVENTORY: MechanicEntry[] = [
  { id: "rotate", label: "Rotate a junction", firstContact: "tutorial" },
  { id: "flood", label: "Signal floods and claims", firstContact: "tutorial" },
  { id: "scan", label: "SCAN.EXE", firstContact: "tutorial" },
  { id: "defend", label: "DEFEND.EXE and purge", firstContact: "tutorial" },
  { id: "attack", label: "ATTACK.EXE and redirect", firstContact: "tutorial" },
  { id: "telegraph", label: "The machine aims a beat before it strikes", firstContact: "tutorial" },
  { id: "cascade", label: "Cascade banking", firstContact: "duel" },
  { id: "par", label: "Par, the rotation budget", firstContact: "duel" },
  { id: "patchCellUse", label: "Spending a patch cell mid dive", firstContact: "duel" },
  { id: "strainChip", label: "Neural Strain as run health", firstContact: "result" },
  { id: "manualRef", label: "MANUAL.TXT as the full reference", firstContact: "desktop" },
  // The kit header carries the basics, so the coachmark went; the locked-mode
  // tip still carries the part a header cannot, at the control it applies to.
  { id: "kitConfig", label: "Swapping program modes", firstContact: "loadout" },
  { id: "analyzeTell", label: "The diagnostic readout and its tell", firstContact: "analyze" },
  { id: "threatTier", label: "Threat tier 1 to 5", firstContact: "analyze" },
  { id: "augmentDraft", label: "The post job augment draft", firstContact: "result" },
  { id: "augmentCadence", label: "One augment per cleared ticket, three tickets a day", firstContact: "result" },
  { id: "ram", label: "RAM per turn as the action budget", firstContact: "tutorial" },
  { id: "ramCarry", label: "Unspent RAM carries into the next turn, capped", firstContact: "duel" },
  { id: "dayUpgrade", label: "One upgrade per closed day", firstContact: "upgrade" },
  { id: "nightPatch", label: "Buying strain back with credits", firstContact: "upgrade" },
  { id: "patchCellBuy", label: "Buying a patch cell", firstContact: "upgrade" },

  // Deliberately untaught. Each waiver is a claim that the interface
  // already carries the mechanic; if that stops being true, delete the
  // waiver and the harness will demand a moment.
  {
    id: "reach2",
    label: "Rotating within two steps of your territory",
    firstContact: "tutorial",
    waiver: "The legal set is drawn as glowing junctions. The affordance is the teaching.",
  },
  {
    id: "turnCap",
    label: "Turn cap wins pay half",
    firstContact: "result",
    waiver: "The payout row names the halved rate inline on the only screen it can occur.",
  },
  {
    id: "credits",
    label: "Credits",
    firstContact: "day",
    waiver: "Every screen that spends puts the price and the balance in the same row.",
  },
  // These three were coachmarks until the 2026-07-26 sweep found each one
  // restating a header the screen already shows on every visit, forever. A
  // permanent label outranks a callout that fires once, so the callouts went
  // and the headers became the teaching.
  {
    id: "jobBoard",
    label: "Three tickets, shared strain",
    firstContact: "day",
    waiver: "The job board header states it every visit: three tickets, strain shared across all of them, order is yours.",
  },
  {
    id: "programTiers",
    label: "Program tiers widen a cast",
    firstContact: "loadout",
    waiver: "The same kit header names where tiers and configs come from, and each card draws its own tier.",
  },
  {
    id: "saveSlots",
    label: "Three save slots",
    firstContact: "desktop",
    waiver: "Standard login affordance. The slot list already states attempts and day reached.",
  },
  {
    // firstContact was "result" until the 2026-07-26 sweep: a loss never
    // routes through the result screen at all, so the reachability check was
    // confirming an unrelated surface. The loss overlay is on the dive.
    id: "runReset",
    label: "The run resets on a loss",
    firstContact: "duel",
    waiver: "The dive's own CORE LOST overlay states it the instant it happens, and the run end scene restates it in story voice.",
  },
  {
    id: "finaleGate",
    label: "Day 10 is the back room",
    firstContact: "finalePre",
    waiver: "Day 10 replaces the job board with the door, and the morning scene frames it.",
  },
  {
    id: "augmentPoolDry",
    label: "The augment cache empties late in a run",
    firstContact: "result",
    waiver: "The result screen says so in place of the draft, at the exact moment it happens, and pays salvage visibly.",
  },
  // Blanket waivers over whole content types. Individual entries explain
  // themselves through their own copy, so teaching each one would be noise.
  // The premise is machine-checked: if an entry ever ships without that
  // copy, the waiver's claim is false and the build fails.
  {
    id: "augmentEffects",
    label: "What each individual augment does",
    firstContact: "result",
    waiver: "Every augment carries its own desc on the draft card, in the loadout, and in MANUAL.TXT.",
    waiverPremise: "augmentDescs",
  },
  {
    id: "modeEffects",
    label: "What each individual attack and defend mode does",
    firstContact: "loadout",
    waiver: "Modes are variations on the three programs the opening dive teaches, and each carries its own desc on hover and in the kit card.",
    waiverPremise: "modeDescs",
  },
];

export const MECHANIC_BY_ID: Record<string, MechanicEntry> = Object.fromEntries(
  MECHANIC_INVENTORY.map((m) => [m.id, m]),
);

/* ------------------------------------------------------------------ */
/* Coachmarks: first sight teaching, one at a time                     */
/* ------------------------------------------------------------------ */

export const TEACHING: TeachingMoment[] = [
  {
    id: "analyze-readout",
    teaches: ["analyzeTell", "threatTier"],
    surface: "analyze",
    when: "firstSight",
    anchor: "readout",
    order: 20,
    notBeforeDay: 1,
    title: "DIAGNOSTIC",
    copyOrder: "copy-analyze-readout",
    lines: [
      "This reads the intrusion cold: its dominant routine, its threat tier. It never bluffs.",
      "Configure your kit against the named tell before you dive, not after you meet it.",
    ],
  },
  {
    id: "par-budget",
    teaches: ["par"],
    surface: "duel",
    when: "overPar",
    anchor: "par",
    order: 40,
    notBeforeDay: 1,
    title: "OVER PAR",
    copyOrder: "copy-par-budget",
    lines: [
      "PAR is the clean route, measured in rotations. You just spent past it.",
      "A win still lands, but now it costs Neural Strain. Sloppy is survivable. It is not free.",
    ],
  },
  {
    id: "cascade-bank",
    teaches: ["cascade"],
    surface: "duel",
    when: "cascadeBanked",
    anchor: "screen",
    order: 50,
    notBeforeDay: 1,
    title: "CASCADE",
    copyOrder: "copy-cascade-bank",
    lines: [
      "Four or more nodes claimed off one rotation banks bonus RAM for your very next turn.",
      "That is what just happened. Line a chain up first, then trip it, instead of one node at a time.",
    ],
  },
  {
    id: "strain-chip",
    teaches: ["strainChip"],
    surface: "result",
    when: "firstSight",
    anchor: "rows",
    order: 60,
    notBeforeDay: 1,
    title: "NEURAL STRAIN",
    copyOrder: "copy-strain-chip",
    lines: [
      "Strain is shared across every ticket today and will not recover between them. Zero ends the run.",
      "It bills you for rotations past par, and separately for any of their traps that actually sprung on you.",
    ],
  },
  {
    id: "augment-draft",
    teaches: ["augmentDraft", "augmentCadence"],
    surface: "result",
    when: "draftOffered",
    anchor: "draft",
    order: 61,
    notBeforeDay: 1,
    title: "AUGMENT DRAFT",
    copyOrder: "copy-augment-draft",
    // Cadence is per TICKET, not per day. Three tickets a day means a clean
    // day banks three, and the 18-augment pool empties around day 6.
    lines: [
      "Clearing a ticket offers three augments. Pick one and it holds for the rest of the run.",
      "Three tickets a day, so a clean day banks three picks. CONFIG unlocks a mode. BOOST bends the economy.",
    ],
  },
  {
    id: "day-upgrade",
    teaches: ["dayUpgrade"],
    surface: "upgrade",
    when: "firstSight",
    anchor: "grid",
    order: 70,
    notBeforeDay: 1,
    title: "DAY CLOSED",
    copyOrder: "copy-day-upgrade",
    // One line, not two. The screen's own header already says "One upgrade
    // holds for the rest of the run" on every visit, so the callout carries
    // only the part a header cannot: the weight of the choice being made.
    lines: [
      "There is no second pick later. Choose the one that fixes what tonight's dive actually needed.",
    ],
  },
  {
    id: "night-shop",
    teaches: ["nightPatch", "patchCellBuy"],
    surface: "upgrade",
    when: "firstSight",
    anchor: "patch",
    order: 71,
    notBeforeDay: 1,
    title: "NIGHT SHOP",
    copyOrder: "copy-night-shop",
    lines: [
      "Credits buy two things here tonight. A night patch puts strain back on the meter.",
      "A patch cell rides along into tomorrow's dive and turns one dead slag block into a live junction.",
    ],
  },
  {
    id: "patch-cell-use",
    teaches: ["patchCellUse"],
    surface: "duel",
    when: "holdingCells",
    anchor: "screen",
    order: 80,
    notBeforeDay: 1,
    title: "PATCH CELL",
    copyOrder: "copy-patch-cell-use",
    lines: [
      "You are carrying a cell. Click a slag block within reach to burn it into a live junction for 1 RAM.",
      "One use, then it is gone. Save it for the wall you cannot route around, not the first slag you see.",
    ],
  },
];

export const TEACH_BY_ID: Record<string, TeachingMoment> = Object.fromEntries(
  TEACHING.map((m) => [m.id, m]),
);

/* ------------------------------------------------------------------ */
/* Tips: persistent reference, hanging off the control                 */
/* ------------------------------------------------------------------ */

/**
 * Reach for a tip over a coachmark whenever the player will want the
 * information AGAIN. Tips cost nothing, never interrupt, and are the right
 * home for recurring numbers. Anything the player must be told once, at a
 * moment, to change a decision belongs in TEACHING instead.
 */
export const TEACH_TIPS: TeachTip[] = [
  {
    id: "par",
    teaches: ["par"],
    control: "the PAR readout in the dive status bar",
    text: "Rotation budget for a clean route. Every rotation past par costs Neural Strain when you win.",
  },
  {
    id: "strain",
    teaches: ["strainChip"],
    control: "the STRAIN meter in the dive status bar and the day footer",
    text: "Neural Strain. Shared across every ticket in the run. At zero the run ends.",
  },
  {
    id: "ram",
    teaches: ["ram", "ramCarry"],
    control: "the RAM readout in the dive dock, and the day board's per turn summary",
    text: "Refills every turn. A rotation or a cast costs 1. Up to 2 unspent carries over, 4 with CARRY CACHE. The rest is lost.",
  },
  {
    id: "manualRef",
    teaches: ["manualRef"],
    control: "the MANUAL.TXT desktop icon",
    text: "Full reference for the loop, the kit, and every augment. Open it any time.",
  },
  {
    id: "threatTier",
    teaches: ["threatTier"],
    control: "the THREAT pips on a ticket",
    text: "Threat tier, 1 to 5. Higher tiers field a wider kit and push harder from the first round.",
  },
  {
    id: "modeLocked",
    teaches: ["kitConfig"],
    control: "a locked mode button in the kit",
    text: "Config not installed. Clear jobs and take a CONFIG augment from the draft to unlock it.",
  },
];

export const TIP_BY_ID: Record<string, TeachTip> = Object.fromEntries(
  TEACH_TIPS.map((t) => [t.id, t]),
);

/** Tip text for a control. Returns undefined so `title` simply goes absent. */
export function tip(id: string): string | undefined {
  return TIP_BY_ID[id] ? TIP_BY_ID[id].text : undefined;
}

/** Does this moment's trigger fire, given the signals the call site has? */
export function teachFires(m: TeachingMoment, sig: TeachSignals): boolean {
  return m.when === "firstSight" ? true : sig[m.when] === true;
}

/* ------------------------------------------------------------------ */
/* The opening dive: a scripted ladder, not a first sight callout      */
/* ------------------------------------------------------------------ */

export interface TutorialCtx {
  turn: "player" | "opp";
  round: number;
  ownedNodes: number;
  scanned: boolean;
  purged: boolean;
  attacked: boolean;
  trapShown: boolean;
}

export interface TutorialBeat {
  id: string;
  teaches: string[];
  /** First beat whose test passes is the line on screen. Order matters. */
  test: (c: TutorialCtx) => boolean;
  line: string;
}

/**
 * The bench talking the player through the opening dive. Ordered: the first
 * passing test wins. Everything here is a verb the player must perform, which
 * is the only thing that earns an interactive beat instead of a coachmark.
 */
export const TUTORIAL_BEATS: TutorialBeat[] = [
  {
    id: "watch-it-move",
    teaches: ["telegraph"],
    test: (c) => c.turn === "opp" && c.round === 1,
    line: "Now watch it move. Watch what it plants.",
  },
  {
    id: "holding-back",
    teaches: ["telegraph"],
    test: (c) => c.turn === "opp" && !c.attacked,
    line: "It is holding back. It wants to see what you learned.",
  },
  {
    id: "no-longer-holding",
    teaches: ["telegraph"],
    test: (c) => c.turn === "opp",
    line: "It has stopped holding back.",
  },
  {
    id: "first-rotation",
    teaches: ["rotate"],
    // <= 3, not <= 2: board generation lets the opening flood hand the player
    // up to 3 nodes for free, and at exactly 3 this beat used to fall through
    // to `chain-toward-core`. Measured at 23.9% of seeds, so roughly one dive
    // in four never told the player how to rotate at all. The bound has to
    // match the generator's own cap (duel-setup.ts, the fairness filter).
    test: (c) => c.round === 1 && c.ownedNodes <= 3,
    line: "The grid is live. Your programs are still indexing; for now, click a glowing junction to rotate it (1 RAM). Line the pipes up and your signal floods forward on its own.",
  },
  {
    id: "chain-toward-core",
    teaches: ["flood"],
    test: (c) => c.round === 1,
    line: "Chain rotations toward the CORE. When a junction clicks into line, everything connected claims at once. Spend your RAM, then END TURN.",
  },
  {
    id: "scan-it",
    teaches: ["scan"],
    test: (c) => !c.scanned,
    line: "It armed something on your lane last cycle. SCAN.EXE just came online: cast it (1 RAM) and it sweeps everything near your line. Always scan before you walk.",
  },
  {
    id: "purge-it",
    teaches: ["defend"],
    test: (c) => !c.purged && c.trapShown,
    line: "There it is. DEFEND.EXE is online, set to PURGE: cast it, click the exposed trap, and defuse the thing before your flood walks in.",
  },
  {
    id: "purge-waiting",
    teaches: ["defend"],
    test: (c) => !c.purged,
    line: "The trap is gone but it WILL plant another. When one shows, DEFEND purges it. Keep pushing meanwhile.",
  },
  {
    id: "attack-it",
    teaches: ["attack"],
    test: (c) => !c.attacked,
    line: "Last program: ATTACK.EXE, set to REDIRECT. Cast it and click one of ITS junctions to twist its line off true. Make it hurt.",
  },
  {
    id: "whole-toolbox",
    teaches: ["rotate", "scan", "defend", "attack"],
    test: () => true,
    line: "That is the whole toolbox: scan, defend, attack, rotate. Push for the core with everything you have.",
  },
];

/** The line the bench is saying right now, or null outside the opening dive. */
export function tutorialLine(c: TutorialCtx): string | null {
  return TUTORIAL_BEATS.find((b) => b.test(c))?.line ?? null;
}

/** Every mechanic id any moment, beat, or tip claims to cover. */
export function taughtMechanics(): Set<string> {
  const out = new Set<string>();
  for (const m of TEACHING) for (const id of m.teaches) out.add(id);
  for (const b of TUTORIAL_BEATS) for (const id of b.teaches) out.add(id);
  for (const t of TEACH_TIPS) for (const id of t.teaches) out.add(id);
  return out;
}
