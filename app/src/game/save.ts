import { AttackMode, AUGMENT_BY_ID, AugmentId, DefendMode, OppMode, Tier } from "./content/kit";
import { isRepairId, pouchCapFor, RepairId } from "./content/repairs";
import { DuelKit } from "./duel-types";
import { isPatchMask } from "./patch-cells";

/**
 * Three-layer persistence, all browser-local, per save slot. The three
 * lifetimes are the design (see day-close-and-banking): META survives
 * everything and holds identity plus settings; SHOP is the permanent layer
 * (everything ever banked: the building, the deck, the money, the story);
 * DAY is the discardable layer (everything held since the shop opened).
 * A failed day is a DELETE of the day object, never a diff of the shop,
 * which is what makes "strain zero cannot touch banked state" a structural
 * property instead of a promise.
 */

export interface MetaState {
  machineOpened: boolean;
  sound: boolean;
  music: boolean;
  /**
   * Teaching moment ids this player has already been shown. A mechanic is
   * explained once, ever, at the moment it first matters.
   */
  taught: string[];
  /** Lifetime tallies, kept purely for the ledger. Nothing here feeds a rule. */
  stats: LifetimeStats;
}

export interface LifetimeStats {
  /** Back room wins. */
  runsWon: number;
  /** Jobs cleared, tutorial excluded. */
  divesCleared: number;
  divesLost: number;
  scans: number;
  /** Casts per ATTACK and DEFEND mode id, for "most used". */
  modeUse: Record<string, number>;
  /** Losses per customer id, for "most lethal". */
  lostTo: Record<string, number>;
  /** Days closed with the haul banked. */
  daysClosed: number;
  /** Days lost to strain zero. */
  daysBusted: number;
}

export const EMPTY_STATS: LifetimeStats = {
  runsWon: 0,
  divesCleared: 0,
  divesLost: 0,
  scans: 0,
  modeUse: {},
  lostTo: {},
  daysClosed: 0,
  daysBusted: 0,
};

/* ------------------------------------------------------------------ */
/* The permanent layer: the shop                                       */
/* ------------------------------------------------------------------ */

/** The neural deck: everything the player IS in a duel. It was Dad's. */
export interface DeckState {
  ramPerTurn: number;
  scanTier: Tier;
  attackTier: Tier;
  defendTier: Tier;
  /** Modes owned (configs unlocked from drafts). */
  attackModes: AttackMode[];
  defendModes: DefendMode[];
  /** Modes live for the next dive. */
  attackMode: AttackMode;
  defendMode: DefendMode;
  /** Boost bays: how many boosts the deck carries into a dive. */
  slots: number;
  /** Every boost ever banked. Permanent; the catalog fills and stays full. */
  ownedBoosts: AugmentId[];
  /** The subset actually slotted, chosen in LOADOUT.CFG. */
  slotted: AugmentId[];
}

export function baseDeck(): DeckState {
  return {
    ramPerTurn: 5,
    scanTier: 1,
    attackTier: 1,
    defendTier: 1,
    attackModes: ["redirect"],
    defendModes: ["purge"],
    attackMode: "redirect",
    defendMode: "purge",
    slots: 3,
    ownedBoosts: [],
    slotted: [],
  };
}

export interface ShopState {
  /** Save-long seed; every deterministic stream salts off it. */
  seed: number;
  /** 1-based calendar day. Weekday = (day - 1) % 7, 0 = Monday, 6 = Sunday. */
  day: number;
  credits: number;
  salvage: number;
  /** Strain carried into the day (written back at sleep). 0..100. */
  strain: number;
  /** Banked patch pieces. */
  patchPouch: number[];
  deck: DeckState;
  repairs: RepairId[];
  /** Journal entries whose first read (at the object) has happened. */
  artifactsRead: string[];
  /** Recovered sector playbacks seen (1..7). */
  sectorsFound: number[];
  /** Lifetime visits per customer id, for intake quote rotation. */
  visits: Record<string, number>;
  /** Lifetime darknet purchases; salts each buy's rng stream. */
  darkBuys: number;
  /** The piece the last darknet buy rolled, for the reveal beat. */
  lastDarkBuy: number | null;
  /** Back room attempts, the first boot included. */
  attempts: number;
  /** Sunday scenes already played (scene index count). */
  sundayScenes: number;
}

/* ------------------------------------------------------------------ */
/* The discardable layer: the day                                      */
/* ------------------------------------------------------------------ */

export type DayPhase =
  | "tutIntro"
  | "tutorial"
  | "tutOutro"
  | "morning"
  | "open"
  | "duel"
  | "result"
  | "bust"
  | "evening"
  | "sunday"
  | "finaleWin";

/** Everything earned since the day opened. Lost whole at strain zero. */
export interface HeldState {
  credits: number;
  salvage: number;
  boosts: AugmentId[];
  attackModes: AttackMode[];
  defendModes: DefendMode[];
}

export const EMPTY_HELD: HeldState = {
  credits: 0,
  salvage: 0,
  boosts: [],
  attackModes: [],
  defendModes: [],
};

export interface CounterCustomer {
  customerId: string;
  quoteIndex: 0 | 1;
  tier: number;
  dominant: OppMode;
  kitSeed: number;
  /** This profile's lifetime visit number, 1-based. */
  visit: number;
}

export interface DayResult {
  won: boolean;
  chip: number;
  /** Total credited. Itemized by the fields below, never bare. */
  pay: number;
  /** Ticket rate for the job's tier, before the cap-win halving. */
  basePay: number;
  /** Deck parts pulled out of the cleared machine. */
  salvage: number;
  /** CLEAN RUN's consolation on a trap-free cap win, itemized. */
  cleanRunBonus: number;
  cleanRun: { status: "banked"; mask: number } | { status: "capped" } | null;
  patchDrop: { status: "banked" | "capped"; mask: number } | null;
  capWin: boolean;
  overRotations: number;
  trapsFired: number;
  redirectsTaken?: number;
  pressureRounds?: number;
  customerId: string;
  tier: number;
  /** Augment draft offered for this win; empty when the pool ran dry. */
  draft: AugmentId[];
  picked: AugmentId | null;
  /** REPAIR.LOG telemetry. */
  rounds?: number;
  trapRounds?: number[];
  parRounds?: number[];
  log?: string[];
}

export interface DayState {
  phase: DayPhase;
  /** Live strain, 0..100. Written back to the shop at sleep. */
  strain: number;
  /**
   * Pieces available to dive with today: the banked pouch copied at open,
   * plus today's drops, minus spends. Banked whole at close; discarded
   * whole at bust (the banked pouch is untouched by construction).
   */
  pouch: number[];
  held: HeldState;
  /** The customer at the counter, not yet taken or turned away. */
  waiting: CounterCustomer | null;
  /** The accepted job on the spike. One at a time; intake is face to face. */
  ticket: CounterCustomer | null;
  /** Customers that have walked in today (determinism index). */
  encounterIndex: number;
  /**
   * Today's arrivals per customer id. Folded into the shop's lifetime visit
   * counts at close; discarded whole at bust, so the shop layer stays
   * untouched by an open day.
   */
  arrivals: Record<string, number>;
  /** Dives finished today, win or lose. Depth escalates the tier band. */
  jobsResolved: number;
  jobsWon: number;
  declined: number;
  /** Sunday latch: one attempt at the tower per Sunday. */
  attemptedBackroom: boolean;
  lastResult: DayResult | null;
  /** Strain restored by the most recent sleep (for the meter fill). */
  lastRegen: number;
}

/* ------------------------------------------------------------------ */
/* Kit assembly                                                        */
/* ------------------------------------------------------------------ */

/** Boosts the player owns right now: banked pool plus today's held picks. */
export function ownedBoostsNow(shop: ShopState, day: DayState | null): AugmentId[] {
  return [...shop.deck.ownedBoosts, ...(day ? day.held.boosts : [])];
}

export function ownedAttackModes(shop: ShopState, day: DayState | null): AttackMode[] {
  return [...shop.deck.attackModes, ...(day ? day.held.attackModes : [])];
}

export function ownedDefendModes(shop: ShopState, day: DayState | null): DefendMode[] {
  return [...shop.deck.defendModes, ...(day ? day.held.defendModes : [])];
}

/** The one deck-to-DuelKit mapping. Every dive, real or simulated, uses this. */
export function duelKitOf(shop: ShopState, day: DayState): DuelKit {
  const deck = shop.deck;
  return {
    scanTier: deck.scanTier,
    attackTier: deck.attackTier,
    defendTier: deck.defendTier,
    attackMode: deck.attackMode,
    defendMode: deck.defendMode,
    augments: [...deck.slotted],
    patchPouch: [...day.pouch],
  };
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export const EMPTY_META: MetaState = {
  machineOpened: false,
  sound: true,
  music: true,
  taught: [],
  stats: EMPTY_STATS,
};

function parseCounts(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === "number" && isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

function num(x: unknown, fallback = 0): number {
  return typeof x === "number" && isFinite(x) ? x : fallback;
}

function posInt(x: unknown): number {
  const n = num(x);
  return n > 0 ? Math.floor(n) : 0;
}

/** Saves written before a tally existed start it at zero. */
function parseStats(v: unknown): LifetimeStats {
  const p = (v ?? {}) as Partial<LifetimeStats>;
  return {
    runsWon: posInt(p.runsWon),
    divesCleared: posInt(p.divesCleared),
    divesLost: posInt(p.divesLost),
    scans: posInt(p.scans),
    modeUse: parseCounts(p.modeUse),
    lostTo: parseCounts(p.lostTo),
    daysClosed: posInt(p.daysClosed),
    daysBusted: posInt(p.daysBusted),
  };
}

function parseMeta(raw: string): MetaState {
  const p = JSON.parse(raw) as Partial<MetaState>;
  return {
    machineOpened: p.machineOpened === true,
    sound: p.sound !== false,
    music: p.music !== false,
    taught: Array.isArray(p.taught) ? p.taught.filter((t) => typeof t === "string") : [],
    stats: parseStats(p.stats),
  };
}

const TIERS: Tier[] = [1, 2, 3];
const ATTACKS: AttackMode[] = ["redirect", "armHalt", "armSiphon"];
const DEFENDS: DefendMode[] = ["purge", "lock", "ward"];

function parseTier(v: unknown): Tier {
  return TIERS.includes(v as Tier) ? (v as Tier) : 1;
}

function parseDeck(v: unknown): DeckState {
  const p = (v ?? {}) as Partial<DeckState>;
  const attackModes = Array.isArray(p.attackModes)
    ? p.attackModes.filter((m): m is AttackMode => ATTACKS.includes(m as AttackMode))
    : [];
  const defendModes = Array.isArray(p.defendModes)
    ? p.defendModes.filter((m): m is DefendMode => DEFENDS.includes(m as DefendMode))
    : [];
  if (!attackModes.includes("redirect")) attackModes.unshift("redirect");
  if (!defendModes.includes("purge")) defendModes.unshift("purge");
  // Catalog surgery: boost ids the catalog no longer knows are dropped so a
  // removed augment never bricks a save.
  const owned = Array.isArray(p.ownedBoosts)
    ? p.ownedBoosts.filter((id): id is AugmentId => typeof id === "string" && !!AUGMENT_BY_ID[id])
    : [];
  const slots = Math.max(3, Math.min(5, Math.floor(num(p.slots, 3))));
  const slotted = (Array.isArray(p.slotted) ? p.slotted : [])
    .filter((id): id is AugmentId => typeof id === "string" && owned.includes(id))
    .slice(0, slots);
  return {
    /*
     * RAM per turn is the one field the duel layer does arithmetic with
     * before anything validates it: a save that lost it resumed with NaN
     * budgets whose spend guards all passed. Clamp it here like the rest.
     */
    ramPerTurn: Math.max(5, Math.min(9, Math.floor(num(p.ramPerTurn, 5)))),
    scanTier: parseTier(p.scanTier),
    attackTier: parseTier(p.attackTier),
    defendTier: parseTier(p.defendTier),
    attackModes,
    defendModes,
    attackMode: attackModes.includes(p.attackMode as AttackMode) ? (p.attackMode as AttackMode) : "redirect",
    defendMode: defendModes.includes(p.defendMode as DefendMode) ? (p.defendMode as DefendMode) : "purge",
    slots,
    ownedBoosts: owned,
    slotted,
  };
}

function parseShop(raw: string): ShopState | null {
  const p = JSON.parse(raw) as Partial<ShopState>;
  if (typeof p.seed !== "number" || typeof p.day !== "number") return null;
  const repairs = Array.isArray(p.repairs) ? p.repairs.filter(isRepairId) : [];
  return {
    seed: p.seed >>> 0,
    day: Math.max(1, Math.floor(p.day)),
    credits: Math.max(0, num(p.credits)),
    salvage: Math.max(0, num(p.salvage)),
    strain: Math.max(0, Math.min(100, num(p.strain, 100))),
    patchPouch: (Array.isArray(p.patchPouch) ? p.patchPouch : [])
      .filter(isPatchMask)
      .slice(0, pouchCapFor(repairs)),
    deck: parseDeck(p.deck),
    repairs,
    artifactsRead: Array.isArray(p.artifactsRead)
      ? p.artifactsRead.filter((s): s is string => typeof s === "string")
      : [],
    sectorsFound: Array.isArray(p.sectorsFound)
      ? p.sectorsFound.filter((n): n is number => typeof n === "number" && n >= 1 && n <= 7)
      : [],
    visits: parseCounts(p.visits),
    darkBuys: posInt(p.darkBuys),
    lastDarkBuy: isPatchMask(p.lastDarkBuy) ? (p.lastDarkBuy as number) : null,
    attempts: posInt(p.attempts),
    sundayScenes: posInt(p.sundayScenes),
  };
}

const DAY_PHASES: DayPhase[] = [
  "tutIntro",
  "tutorial",
  "tutOutro",
  "morning",
  "open",
  "duel",
  "result",
  "bust",
  "evening",
  "sunday",
  "finaleWin",
];

function parseHeld(v: unknown): HeldState {
  const p = (v ?? {}) as Partial<HeldState>;
  return {
    credits: Math.max(0, num(p.credits)),
    salvage: Math.max(0, num(p.salvage)),
    boosts: Array.isArray(p.boosts)
      ? p.boosts.filter((id): id is AugmentId => typeof id === "string" && !!AUGMENT_BY_ID[id])
      : [],
    attackModes: Array.isArray(p.attackModes)
      ? p.attackModes.filter((m): m is AttackMode => ATTACKS.includes(m as AttackMode))
      : [],
    defendModes: Array.isArray(p.defendModes)
      ? p.defendModes.filter((m): m is DefendMode => DEFENDS.includes(m as DefendMode))
      : [],
  };
}

function parseCustomer(v: unknown): CounterCustomer | null {
  const p = (v ?? null) as Partial<CounterCustomer> | null;
  if (!p || typeof p.customerId !== "string" || typeof p.kitSeed !== "number") return null;
  return {
    customerId: p.customerId,
    quoteIndex: p.quoteIndex === 1 ? 1 : 0,
    tier: Math.max(1, Math.min(5, Math.floor(num(p.tier, 1)))),
    dominant: (p.dominant ?? "redirect") as OppMode,
    kitSeed: p.kitSeed,
    visit: Math.max(1, Math.floor(num(p.visit, 1))),
  };
}

function parseDay(raw: string): DayState | null {
  const p = JSON.parse(raw) as Partial<DayState>;
  if (typeof p.phase !== "string" || !DAY_PHASES.includes(p.phase as DayPhase)) return null;
  let phase = p.phase as DayPhase;
  // Never resume into a transient screen. A refresh mid-dive lands back on
  // the floor with the ticket still on the spike: a safe abort, never a loss.
  if (phase === "duel") phase = "open";
  if (phase === "tutorial" || phase === "tutOutro") phase = "tutIntro";
  return {
    phase,
    strain: Math.max(0, Math.min(100, num(p.strain, 100))),
    pouch: (Array.isArray(p.pouch) ? p.pouch : []).filter(isPatchMask),
    held: parseHeld(p.held),
    waiting: parseCustomer(p.waiting),
    ticket: parseCustomer(p.ticket),
    encounterIndex: posInt(p.encounterIndex),
    arrivals: parseCounts(p.arrivals),
    jobsResolved: posInt(p.jobsResolved),
    jobsWon: posInt(p.jobsWon),
    declined: posInt(p.declined),
    attemptedBackroom: p.attemptedBackroom === true,
    lastResult: (p.lastResult ?? null) as DayResult | null,
    lastRegen: num(p.lastRegen),
  };
}

/* ------------------------------------------------------------------ */
/* Save slots                                                          */
/* ------------------------------------------------------------------ */

export const SLOT_COUNT = 3;

function slotMetaKey(slot: number): string {
  return `kernel-panic-s${slot}-meta-v2`;
}

function slotShopKey(slot: number): string {
  return `kernel-panic-s${slot}-shop-v1`;
}

function slotDayKey(slot: number): string {
  return `kernel-panic-s${slot}-day-v1`;
}

/** The run-era key, deleted on sight: the run model has no migration path. */
function slotRunKey(slot: number): string {
  return `kernel-panic-s${slot}-run-v3`;
}

/**
 * Clear the run-era layer. Meta (attempts, stats, taught flags, settings)
 * survives; the mid-run snapshot does not, because the day-as-run schema
 * has no honest way to resume a ten-day run that no longer exists.
 */
export function migrateLegacySave(): void {
  if (typeof window === "undefined") return;
  try {
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      window.localStorage.removeItem(slotRunKey(slot));
    }
    window.localStorage.removeItem("kernel-panic-meta-v2");
    window.localStorage.removeItem("kernel-panic-run-v2");
  } catch {
    // Nothing to migrate.
  }
}

export function loadSlotMeta(slot: number): MetaState {
  if (typeof window === "undefined") return EMPTY_META;
  try {
    const raw = window.localStorage.getItem(slotMetaKey(slot));
    if (!raw) return EMPTY_META;
    return parseMeta(raw);
  } catch {
    return EMPTY_META;
  }
}

export function saveSlotMeta(slot: number, m: MetaState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(slotMetaKey(slot), JSON.stringify(m));
  } catch {
    // Storage unavailable; play continues unpersisted.
  }
}

export function loadSlotShop(slot: number): ShopState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(slotShopKey(slot));
    if (!raw) return null;
    return parseShop(raw);
  } catch {
    return null;
  }
}

export function saveSlotShop(slot: number, s: ShopState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (s === null) window.localStorage.removeItem(slotShopKey(slot));
    else window.localStorage.setItem(slotShopKey(slot), JSON.stringify(s));
  } catch {
    // Storage unavailable; play continues unpersisted.
  }
}

export function loadSlotDay(slot: number): DayState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(slotDayKey(slot));
    if (!raw) return null;
    return parseDay(raw);
  } catch {
    return null;
  }
}

export function saveSlotDay(slot: number, d: DayState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (d === null) window.localStorage.removeItem(slotDayKey(slot));
    else window.localStorage.setItem(slotDayKey(slot), JSON.stringify(d));
  } catch {
    // Storage unavailable; play continues unpersisted.
  }
}

/** Wipe a slot completely: meta, shop, day, everything. There is no undo. */
export function deleteSlot(slot: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(slotMetaKey(slot));
    window.localStorage.removeItem(slotShopKey(slot));
    window.localStorage.removeItem(slotDayKey(slot));
    window.localStorage.removeItem(slotRunKey(slot));
  } catch {
    // Storage unavailable; nothing to delete.
  }
}

const SOUND_RESET_KEY = "kernel-panic-sound-reset-v4";

/**
 * Pre-v4 builds were effectively silent, so a stale muted flag would make
 * the first audible build seem broken. Reset the flags once, ever.
 */
export function applyOneTimeSoundReset(meta: MetaState): MetaState {
  if (typeof window === "undefined") return meta;
  try {
    if (window.localStorage.getItem(SOUND_RESET_KEY)) return meta;
    window.localStorage.setItem(SOUND_RESET_KEY, "1");
    return { ...meta, sound: true, music: true };
  } catch {
    return meta;
  }
}

export interface SlotSummary {
  slot: number;
  empty: boolean;
  /** Calendar day reached, 1-based. */
  day: number | null;
  strain: number | null;
  credits: number | null;
  repairs: number;
  machineOpened: boolean;
}

export function slotSummaries(): SlotSummary[] {
  const out: SlotSummary[] = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    const hasMeta =
      typeof window !== "undefined" && !!window.localStorage.getItem(slotMetaKey(slot));
    const shop = loadSlotShop(slot);
    if (!hasMeta && !shop) {
      out.push({
        slot,
        empty: true,
        day: null,
        strain: null,
        credits: null,
        repairs: 0,
        machineOpened: false,
      });
      continue;
    }
    const meta = loadSlotMeta(slot);
    const day = loadSlotDay(slot);
    out.push({
      slot,
      empty: false,
      day: shop ? shop.day : null,
      strain: day ? day.strain : shop ? shop.strain : null,
      credits: shop ? shop.credits : null,
      repairs: shop ? shop.repairs.length : 0,
      machineOpened: meta.machineOpened,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Weekday helpers                                                     */
/* ------------------------------------------------------------------ */

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/** 0 = Monday .. 6 = Sunday. */
export function weekdayOf(day: number): number {
  return (day - 1) % 7;
}

export function isSunday(day: number): boolean {
  return weekdayOf(day) === 6;
}

export function weekdayName(day: number): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[weekdayOf(day)];
}
