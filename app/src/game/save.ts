import { AttackMode, AUGMENT_BY_ID, AugmentId, DefendMode, OppMode, Tier } from "./content/kit";
import { DuelKit, PIECE_X } from "./duel-types";
import { PATCH_POUCH_MAX, isPatchMask } from "./patch-cells";

/**
 * Two-layer persistence, both browser-local. Meta survives everything and
 * holds only identity: how many attempts, whether the machine ever opened,
 * and the sound flags. All power - tiers, configs, augments - lives on the
 * run and dies with it. Run state exists so a refresh resumes mid-run.
 */

export interface MetaState {
  /** Runs started, 1-based key for every story beat. */
  runCount: number;
  machineOpened: boolean;
  sound: boolean;
  music: boolean;
  /**
   * Teaching moment ids this player has already been shown. Survives runs:
   * a mechanic is explained once, ever, at the moment it first matters.
   * Saves from before the teaching layer land here empty on purpose, so a
   * returning player still gets the explanations nothing ever gave them.
   */
  taught: string[];
  /**
   * Lifetime tallies, kept across runs purely for the ledger. Nothing here
   * feeds a rule; a corrupt or missing field degrades to zero rather than
   * costing a save.
   */
  stats: LifetimeStats;
}

export interface LifetimeStats {
  /** Runs that beat the machine on day 10. */
  runsWon: number;
  /** Jobs cleared, tutorial excluded. */
  divesCleared: number;
  divesLost: number;
  scans: number;
  /** Casts per ATTACK and DEFEND mode id, for "most used". */
  modeUse: Record<string, number>;
  /** Losses per customer id, for "most lethal". */
  lostTo: Record<string, number>;
}

export const EMPTY_STATS: LifetimeStats = {
  runsWon: 0,
  divesCleared: 0,
  divesLost: 0,
  scans: 0,
  modeUse: {},
  lostTo: {},
};

export type RunScreen =
  | "opener"
  | "tutIntro"
  | "tutorial"
  | "tutOutro"
  | "dayOpen"
  | "day"
  | "analyze"
  | "build"
  | "duel"
  | "result"
  | "upgrade"
  | "finalePre"
  | "runEnd"
  | "finaleWin";

export interface JobInstance {
  customerId: string;
  quoteIndex: 0 | 1;
  tier: number;
  dominant: OppMode;
  kitSeed: number;
}

/** The run's whole build: three programs, their tiers, modes and augments. */
export interface RunKit {
  scanTier: Tier;
  attackTier: Tier;
  defendTier: Tier;
  attackMode: AttackMode;
  defendMode: DefendMode;
  attackModes: AttackMode[];
  defendModes: DefendMode[];
  augments: AugmentId[];
}

export function baseRunKit(): RunKit {
  return {
    scanTier: 1,
    attackTier: 1,
    defendTier: 1,
    attackMode: "redirect",
    defendMode: "purge",
    attackModes: ["redirect"],
    defendModes: ["purge"],
    augments: [],
  };
}

/** The one RunKit-to-DuelKit mapping. Every dive, real or simulated, uses this. */
export function duelKitOf(kit: RunKit, patchPouch: number[]): DuelKit {
  return {
    scanTier: kit.scanTier,
    attackTier: kit.attackTier,
    defendTier: kit.defendTier,
    attackMode: kit.attackMode,
    defendMode: kit.defendMode,
    augments: kit.augments,
    patchPouch: [...patchPouch],
  };
}

/** The one upgrade a closed day buys. Null until the player commits. */
export type NightPick = "ram" | "scan" | "attack" | "defend" | null;

export const NIGHT_PICKS: Array<Exclude<NightPick, null>> = ["ram", "scan", "attack", "defend"];

export interface RunState {
  runSeed: number;
  runNumber: number;
  day: number;
  strain: number;
  ramPerTurn: number;
  credits: number;
  /** Shaped patch pieces held (4-bit arm masks), carried across the run. */
  patchPouch: number[];
  /** Lifetime darknet purchases this run; salts each buy's rng stream. */
  darkBuys: number;
  /** The piece the last darknet buy rolled, for the reveal beat. */
  lastDarkBuy: number | null;
  /** Strain restored by the most recent day-close rest (for the meter fill). */
  lastRegen: number;
  /**
   * Upgrade chosen at the night screen but not yet applied. The pick used
   * to end the night the instant it was made, which quietly forfeited the
   * night patch and patch cell sitting on the same screen.
   */
  nightPick: NightPick;
  kit: RunKit;
  /** Boost bay capacity. Configs never occupy a bay. */
  boostSlots: number;
  jobs: JobInstance[];
  jobsDone: boolean[];
  screen: RunScreen;
  activeJob: number | null;
  /** Result of the last finished duel, for the result screen. */
  lastResult: {
    won: boolean;
    chip: number;
    /** Total credited. Itemized by the two fields below, never bare. */
    pay: number;
    /** Ticket rate for the job's tier, before the cap-win halving. */
    basePay: number;
    /** Salvage paid in place of an augment when the cache ran dry. */
    salvage: number;
    /** CLEAN RUN's consolation on a trap-free cap win, itemized. */
    cleanRunBonus: number;
    /** Did CLEAN RUN fire, and what piece did it bank (pouch permitting)? */
    cleanRun: { status: "banked"; mask: number } | { status: "capped" } | null;
    /** Did the job drop a piece, and which? Capped drops still name the
     * shape that was left on the bench. */
    patchDrop: { status: "banked" | "capped"; mask: number } | null;
    capWin: boolean;
    /** Gridlock collapse win: full pay, flat strain chip. */
    gridlockWin: boolean;
    /** Chip inputs, kept so the result row can show what actually billed. */
    overRotations: number;
    trapsFired: number;
    /** Enemy REDIRECTs taken, and rounds under pressure. Absent on old saves. */
    redirectsTaken?: number;
    pressureRounds?: number;
    jobIndex: number;
    /** Augment draft offered for this win; empty when the pool ran dry. */
    draft: AugmentId[];
    picked: AugmentId | null;
    /** Boost ejected by a full-bay swap, for the result stamp. */
    replaced: AugmentId | null;
    /** REPAIR.LOG telemetry: how the dive actually went, for the strain
     * trace, sparklines, and the dive log rail. Absent on older saves. */
    rounds?: number;
    trapRounds?: number[];
    parRounds?: number[];
    log?: string[];
  } | null;
}

export const META_KEY = "kernel-panic-meta-v2";
export const RUN_KEY = "kernel-panic-run-v2";

export const EMPTY_META: MetaState = {
  runCount: 0,
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

/** Saves written before lifetime stats existed start their tallies at zero. */
function parseStats(v: unknown): LifetimeStats {
  const p = (v ?? {}) as Partial<LifetimeStats>;
  const num = (x: unknown): number => (typeof x === "number" && isFinite(x) && x > 0 ? x : 0);
  return {
    runsWon: num(p.runsWon),
    divesCleared: num(p.divesCleared),
    divesLost: num(p.divesLost),
    scans: num(p.scans),
    modeUse: parseCounts(p.modeUse),
    lostTo: parseCounts(p.lostTo),
  };
}

function parseMeta(raw: string): MetaState {
  const p = JSON.parse(raw) as Partial<MetaState>;
  return {
    runCount: typeof p.runCount === "number" ? p.runCount : 0,
    machineOpened: p.machineOpened === true,
    sound: p.sound !== false,
    music: p.music !== false,
    taught: Array.isArray(p.taught) ? p.taught.filter((t) => typeof t === "string") : [],
    stats: parseStats(p.stats),
  };
}

function parseRun(raw: string): RunState | null {
  const p = JSON.parse(raw) as RunState;
  // Light shape check; anything off (older kit-less saves included) means
  // the run is not resumable. Meta survives regardless.
  if (
    typeof p.runSeed !== "number" ||
    typeof p.day !== "number" ||
    typeof p.strain !== "number" ||
    !Array.isArray(p.jobs) ||
    typeof p.screen !== "string" ||
    !p.kit ||
    typeof p.kit.scanTier !== "number" ||
    !Array.isArray(p.kit.augments)
  ) {
    return null;
  }
  // Migration ladder for the pouch. Saves from the integer era held only
  // crosses (that is literally what 35 cr bought), so N cells become N
  // cross masks: exact value preserved, deterministic, nothing to scum.
  const legacyCells = (p as { patchCells?: unknown }).patchCells;
  if (typeof legacyCells === "number" && isFinite(legacyCells)) {
    p.patchPouch = Array(Math.max(0, Math.min(Math.floor(legacyCells), PATCH_POUCH_MAX))).fill(PIECE_X);
  } else if (Array.isArray(p.patchPouch)) {
    p.patchPouch = p.patchPouch.filter(isPatchMask).slice(0, PATCH_POUCH_MAX);
  } else {
    p.patchPouch = [];
  }
  if (typeof p.darkBuys !== "number" || !isFinite(p.darkBuys)) p.darkBuys = 0;
  if (!isPatchMask(p.lastDarkBuy)) p.lastDarkBuy = null;
  /*
   * RAM per turn is the one run field the duel layer does arithmetic with
   * before anything validates it: createDuel feeds it straight into the
   * opening turn. A save that lost the field resumed with `undefined`, which
   * made every turn's budget NaN - and because `NaN < cost` is false, every
   * spend guard passed instead of denying. The readout showed NaN while RAM
   * was effectively infinite. Repair it here like the rest of the ladder.
   * Bounds mirror BASE_RAM/MAX_RAM in run-reducer (which imports this module,
   * so they cannot be imported back without a cycle).
   */
  if (typeof p.ramPerTurn !== "number" || !isFinite(p.ramPerTurn)) p.ramPerTurn = 5;
  p.ramPerTurn = Math.max(5, Math.min(9, Math.floor(p.ramPerTurn)));
  if (typeof p.credits !== "number" || !isFinite(p.credits)) p.credits = 0;
  // Pre-bay saves start at base capacity; anything odd clamps into range.
  if (typeof p.boostSlots !== "number" || !isFinite(p.boostSlots)) p.boostSlots = 3;
  p.boostSlots = Math.max(3, Math.min(5, Math.floor(p.boostSlots)));
  // Catalog surgery: ids the catalog no longer knows are no-ops that would
  // waste a bay; drop them. Over-cap runs are grandfathered, never trimmed.
  p.kit.augments = p.kit.augments.filter((id) => typeof id === "string" && !!AUGMENT_BY_ID[id]);
  if (typeof p.lastRegen !== "number") p.lastRegen = 0;
  // Pre-night-pick saves resume with the night still undecided.
  if (!NIGHT_PICKS.includes(p.nightPick as Exclude<NightPick, null>)) p.nightPick = null;
  // Never resume into a transient screen; land on the day board.
  if (p.screen === "duel" || p.screen === "analyze" || p.screen === "build") {
    p.screen = "day";
    p.activeJob = null;
  }
  if (p.screen === "tutorial" || p.screen === "tutIntro" || p.screen === "tutOutro" || p.screen === "opener") {
    p.screen = "opener";
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Save slots                                                          */
/* ------------------------------------------------------------------ */

export const SLOT_COUNT = 3;

function slotMetaKey(slot: number): string {
  return `kernel-panic-s${slot}-meta-v2`;
}

function slotRunKey(slot: number): string {
  return `kernel-panic-s${slot}-run-v3`;
}

/** Pre-slot saves become USER 01 so nobody loses their attempts count. */
export function migrateLegacySave(): void {
  if (typeof window === "undefined") return;
  try {
    const legacyMeta = window.localStorage.getItem(META_KEY);
    if (!legacyMeta) return;
    if (!window.localStorage.getItem(slotMetaKey(1))) {
      window.localStorage.setItem(slotMetaKey(1), legacyMeta);
    }
    window.localStorage.removeItem(META_KEY);
    window.localStorage.removeItem(RUN_KEY);
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

export function loadSlotRun(slot: number): RunState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(slotRunKey(slot));
    if (!raw) return null;
    return parseRun(raw);
  } catch {
    return null;
  }
}

/** Wipe a slot completely: meta, run, everything. There is no undo. */
export function deleteSlot(slot: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(slotMetaKey(slot));
    window.localStorage.removeItem(slotRunKey(slot));
  } catch {
    // Storage unavailable; nothing to delete.
  }
}

export function saveSlotRun(slot: number, r: RunState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (r === null) window.localStorage.removeItem(slotRunKey(slot));
    else window.localStorage.setItem(slotRunKey(slot), JSON.stringify(r));
  } catch {
    // Storage unavailable; play continues unpersisted.
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
  runCount: number;
  machineOpened: boolean;
  /** Mid-run snapshot, when one is waiting. */
  day: number | null;
  strain: number | null;
}

export function slotSummaries(): SlotSummary[] {
  const out: SlotSummary[] = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    if (typeof window === "undefined" || !window.localStorage.getItem(slotMetaKey(slot))) {
      out.push({ slot, empty: true, runCount: 0, machineOpened: false, day: null, strain: null });
      continue;
    }
    const meta = loadSlotMeta(slot);
    const run = loadSlotRun(slot);
    out.push({
      slot,
      empty: false,
      runCount: meta.runCount,
      machineOpened: meta.machineOpened,
      day: run ? run.day : null,
      strain: run ? run.strain : null,
    });
  }
  return out;
}
