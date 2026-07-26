import { AttackMode, AugmentId, DefendMode, OppMode, Tier } from "./content/kit";

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
}

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

export interface RunState {
  runSeed: number;
  runNumber: number;
  day: number;
  strain: number;
  ramPerTurn: number;
  credits: number;
  /** Single-use slag fills bought at day close, carried across the run. */
  patchCells: number;
  /** Strain restored by the most recent day-close rest (for the meter fill). */
  lastRegen: number;
  kit: RunKit;
  jobs: JobInstance[];
  jobsDone: boolean[];
  screen: RunScreen;
  activeJob: number | null;
  /** Result of the last finished duel, for the result screen. */
  lastResult: {
    won: boolean;
    chip: number;
    pay: number;
    capWin: boolean;
    jobIndex: number;
    /** Augment draft offered for this win; empty when the pool ran dry. */
    draft: AugmentId[];
    picked: AugmentId | null;
  } | null;
}

export const META_KEY = "kernel-panic-meta-v2";
export const RUN_KEY = "kernel-panic-run-v2";

export const EMPTY_META: MetaState = {
  runCount: 0,
  machineOpened: false,
  sound: true,
  music: true,
};

function parseMeta(raw: string): MetaState {
  const p = JSON.parse(raw) as Partial<MetaState>;
  return {
    runCount: typeof p.runCount === "number" ? p.runCount : 0,
    machineOpened: p.machineOpened === true,
    sound: p.sound !== false,
    music: p.music !== false,
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
  // Pre-patch-cell saves resume with an empty pouch.
  if (typeof p.patchCells !== "number") p.patchCells = 0;
  if (typeof p.lastRegen !== "number") p.lastRegen = 0;
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
