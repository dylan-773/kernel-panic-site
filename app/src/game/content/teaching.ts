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

/** Surfaces a moment can attach to. Day phases plus the window surfaces. */
export type TeachSurface =
  | "tutorial"
  | "duel"
  | "floor"
  | "counter"
  | "analyze"
  | "loadout"
  | "solder"
  | "result"
  | "evening"
  | "sunday"
  | "bust"
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
  | "draftOffered"
  /** The pouch holds a pair whose union is strictly bigger than both. */
  | "craftReady"
  /** Owned boosts exceed the bay count: the deck now carries a choice. */
  | "swapOffered"
  /** The evening opens with strain below full: tomorrow starts short. */
  | "strainShort";

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
  { id: "patchCellUse", label: "Spending a patch piece mid dive", firstContact: "duel" },
  { id: "patchShapes", label: "Pieces roll a fixed shape and orientation, never rotating in hand", firstContact: "duel" },
  {
    // The coachmark retired 2026-07-29: SOLDER.BAY's own status line states
    // the outgrow rule on every pickup, and the rack physically disables
    // illegal partners, which outranks a once-ever callout.
    id: "patchCraft",
    label: "Combine two patch pieces into the union of their arms, at the SOLDER.BAY bench",
    firstContact: "solder",
    waiver:
      "SOLDER.BAY's status line states the outgrow rule every time a piece is picked up (PICK A PARTNER. THE WELD MUST OUTGROW BOTH.), the schematic blinks the arms a partner would add, and the rack marks non-outgrowing partners dead and disabled, so an illegal weld cannot be attempted at all.",
  },
  { id: "strainChip", label: "Neural Strain as the day's health", firstContact: "result" },
  { id: "manualRef", label: "MANUAL.TXT as the full reference", firstContact: "desktop" },
  // The kit header carries the basics, so the coachmark went; the locked-mode
  // tip still carries the part a header cannot, at the control it applies to.
  { id: "kitConfig", label: "Swapping program modes", firstContact: "loadout" },
  { id: "analyzeTell", label: "The diagnostic readout and its tell", firstContact: "analyze" },
  { id: "threatTier", label: "Threat tier 1 to 5", firstContact: "analyze" },
  { id: "augmentDraft", label: "The post job augment draft", firstContact: "result" },
  { id: "ram", label: "RAM per turn as the action budget", firstContact: "tutorial" },
  { id: "ramCarry", label: "Unspent RAM carries into the next turn, capped", firstContact: "duel" },
  { id: "nightPatch", label: "Buying strain back with credits in the evening", firstContact: "evening" },
  { id: "darkWebBuy", label: "Buying a random patch piece on the darknet", firstContact: "evening" },
  { id: "strainCarryover", label: "Strain does not reset overnight; sleep restores only a little", firstContact: "evening" },

  // The room.
  { id: "walkInteract", label: "Walking the shop and interacting with its stations", firstContact: "floor" },
  { id: "counterIntake", label: "A customer at the counter: take the job or turn it away", firstContact: "counter" },
  { id: "heldVsBanked", label: "Pay is HELD until the day closes; closing banks it", firstContact: "result" },
  { id: "benchSit", label: "Sitting at the bench enters KP/OS; standing up leaves it", firstContact: "floor" },

  // The day as the run.
  {
    id: "closeBank",
    label: "Going upstairs closes the day and banks the haul",
    firstContact: "floor",
    waiver:
      "The stairs' own interact prompt states the trade on every open-day visit (CLOSE THE SHOP. EVERYTHING HELD BANKS THE MOMENT YOU DO.), and the close confirm itemizes the held credits and salvage before committing. A permanent labelled prompt on the only control that can commit the day outranks a once-ever callout.",
  },
  {
    id: "bustLoss",
    label: "Strain zero loses the day's unbanked haul and the evening",
    firstContact: "bust",
    waiver:
      "The bust scene itself is the teaching: it plays the moment it happens, names the held column it just erased, and states that everything banked is untouched and tomorrow opens normally. It cannot be missed and repeats on every bust.",
  },
  {
    id: "sundayGate",
    label: "The back room can be attempted on Sunday only",
    firstContact: "floor",
    waiver:
      "The tower's interact prompt carries the gate on every weekday visit (it names Sunday as the day it will answer), and the taskbar clock shows the weekday at all times. The prompt is the teaching and it is visible from the first hour of play.",
  },
  {
    id: "repairsUnlock",
    label: "Broken stations are repairs: each unlocks a system and turns up an artifact",
    firstContact: "floor",
    waiver:
      "Tier 0 by construction, and the vault's own example of it: a broken station standing in the room teaches its own unlock. Every repairable's examine panel states its condition, its price, and the one-line unlock it buys, on every visit, at the object itself.",
  },
  {
    id: "salvageCurrency",
    label: "Salvage comes out of cleared machines and buys deck parts",
    firstContact: "evening",
    waiver:
      "Every screen that spends salvage puts the price and the balance in the same row, the credits precedent. The result screen itemizes RECOVERED salvage per job on its own named row, so the currency is met where it is earned and priced where it is spent.",
  },
  {
    id: "deckSlots",
    label: "Owned boosts exceed the bays: the loadout slots a subset before each dive",
    firstContact: "loadout",
  },

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
    firstContact: "counter",
    waiver: "Every screen that spends puts the price and the balance in the same row.",
  },
  {
    id: "programTiers",
    label: "Program tiers widen a cast",
    firstContact: "loadout",
    // Re-cited 2026-07-29: the old kit header is gone; the numbers teach it.
    waiver: "LOADOUT.CFG's program rows show each program's live RANGE or WIDTH number directly beside its TIER meter, every visit: the widening effect is the two numbers sitting next to each other.",
  },
  {
    id: "saveSlots",
    label: "Three save slots",
    firstContact: "desktop",
    waiver: "Standard login affordance. The slot list already states day reached and the shop's condition.",
  },
  {
    id: "diveLoss",
    label: "A lost dive bills no strain; the ticket goes home unpaid",
    firstContact: "duel",
    waiver: "The dive's own CORE LOST overlay states it the instant it happens, and the customer's loss line restates it at the counter in the shop's own voice.",
  },
  {
    id: "backroomOppOpens",
    label: "The back room machine takes the first turn",
    firstContact: "duel",
    waiver: "The player watches it happen: the IT IS MOVING turnlight runs before their first input, at the only dive that opens this way.",
  },
  {
    // Both reward channels land through the same named, glyphed result row,
    // the only screen they can occur on: the turnCap precedent.
    id: "patchDrop",
    label: "Post dive piece rewards, the job drop and the CLEAN RUN bank",
    firstContact: "result",
    waiver: "The drop row names the recovered shape in text with its glyph inline, on the only screen a piece can arrive.",
  },
  {
    id: "diagDepth",
    label: "Intake readout depth grows with the diagnostic bench, tier by tier",
    firstContact: "counter",
    waiver:
      "Equal-footprint empty states carry it: an unread field renders as a dead row naming the bench stage that would read it, in exactly the space the reading will occupy. The locked row is the teaching, at the moment the player wants the number it hides.",
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
    id: "walk-interact",
    teaches: ["walkInteract", "benchSit"],
    surface: "floor",
    when: "firstSight",
    anchor: "screen",
    order: 10,
    notBeforeDay: 1,
    title: "THE SHOP",
    lines: [
      "Walk with WASD or the arrow keys. E or a click works whatever is glowing.",
      "The bench is where the work happens. Sit down at it and the terminal takes over.",
    ],
  },
  {
    id: "counter-intake",
    teaches: ["counterIntake"],
    surface: "counter",
    when: "firstSight",
    anchor: "screen",
    order: 15,
    notBeforeDay: 1,
    title: "THE COUNTER",
    lines: [
      "One customer at a time, face to face. Take the job or turn it away; declining costs nothing.",
      "What they say is their account of it. What the bench reads is the truth.",
    ],
  },
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
      "This reads the intrusion cold, as deep as the bench can see. It never bluffs.",
      "Configure your deck against the named tell before you dive, not after you meet it.",
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
      "Three or more nodes lit off one rotation banks bonus RAM for your very next turn.",
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
      "Strain is shared across every job today and does not recover between them. Zero loses the day.",
      "It bills you for rotations past par, and separately for any of their traps that actually sprung on you.",
    ],
  },
  {
    id: "held-banked",
    teaches: ["heldVsBanked"],
    surface: "result",
    when: "firstSight",
    anchor: "rows",
    order: 62,
    notBeforeDay: 1,
    title: "HELD",
    lines: [
      "CREDITED is held, not banked. Everything the day earns rides with you until you close.",
      "Close by going upstairs to bed and it is yours for good. Hit strain zero first and it is gone.",
    ],
  },
  {
    id: "augment-draft",
    teaches: ["augmentDraft"],
    surface: "result",
    when: "draftOffered",
    anchor: "draft",
    order: 61,
    notBeforeDay: 1,
    title: "AUGMENT DRAFT",
    copyOrder: "copy-augment-draft",
    lines: [
      "Clearing a job offers three augments. The pick is held today and permanent once the day banks.",
      "CONFIG unlocks a mode. BOOST bends the economy. The catalog fills up; the deck stays small.",
    ],
  },
  {
    id: "deck-slots",
    teaches: ["deckSlots"],
    surface: "loadout",
    when: "swapOffered",
    anchor: "bays",
    order: 63,
    notBeforeDay: 1,
    title: "BAYS FULL",
    lines: [
      "You own more boosts than the deck can carry. The bays hold what actually dives.",
      "Slot against what the bench read, not what you like. This is the whole decision now.",
    ],
  },
  {
    id: "night-shop",
    teaches: ["nightPatch", "darkWebBuy"],
    surface: "evening",
    when: "firstSight",
    anchor: "patch",
    order: 71,
    notBeforeDay: 1,
    title: "THE EVENING",
    copyOrder: "copy-night-shop",
    lines: [
      "The shop is closed and the haul is banked. Credits fix the building; salvage builds the deck.",
      "A night patch buys strain back with money that could have been a repair. There is no correct answer.",
    ],
  },
  {
    id: "strain-carryover",
    teaches: ["strainCarryover"],
    surface: "evening",
    when: "strainShort",
    anchor: "patch",
    order: 72,
    notBeforeDay: 1,
    title: "STRAIN CARRIES OVER",
    copyOrder: "strain-carryover-notice",
    lines: [
      "Sleep does not reset Neural Strain. It gives back only a little.",
      "Whatever tonight leaves unspent carries into tomorrow. Spend on a night patch to buy back more before you sleep.",
    ],
  },
  // patch-craft retired 2026-07-29: SOLDER.BAY carries the outgrow rule at
  // tier 0 (see the patchCraft waiver above); the coachmark was also mounted
  // on NIGHT.SYS while the crafting interface lives in SOLDER.BAY.
  {
    id: "patch-cell-use",
    teaches: ["patchCellUse", "patchShapes"],
    surface: "duel",
    when: "holdingCells",
    anchor: "screen",
    order: 80,
    notBeforeDay: 1,
    title: "PATCH PIECE",
    copyOrder: "copy-patch-cell-use",
    lines: [
      "You are carrying a piece. Click a slag block within reach to fuse it in for 2 RAM. One use, then it is gone.",
      "Arms land exactly as held, never rotating once placed. Fit it to the wall you cannot route around, not the first slag you see.",
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
    control: "the STRAIN meter in the room HUD and the dive status bar",
    text: "Neural Strain. Shared across every job today. At zero the day is lost.",
  },
  {
    id: "held",
    teaches: ["heldVsBanked"],
    control: "the HELD readout in the room HUD",
    text: "Today's unbanked haul. Yours for good when you sleep. Gone at strain zero.",
  },
  {
    id: "ram",
    teaches: ["ram", "ramCarry"],
    control: "the RAM readout in the dive dock, and the day board's per turn summary",
    text: "Refills every turn. A rotation or a cast costs 1. Up to 2 unspent carries over. The rest is lost.",
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
    id: "boostSlots",
    teaches: ["deckSlots"],
    control: "the boost bay counter on the LOADOUT.CFG bay card",
    text: "Bays carry 3 slotted boosts, buyable to 5 with salvage. Configs never count against the cap.",
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
