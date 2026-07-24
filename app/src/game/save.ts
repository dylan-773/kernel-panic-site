import { AbilityId, AbilityVerb } from "./duel-types";

/**
 * Two-layer persistence, both browser-local. Meta survives everything and
 * holds the only cross-run progression the design allows: unlocked ability
 * OPTIONS (never copies or stats). Run state exists so a refresh resumes
 * mid-run; it is wiped whenever a run ends.
 */

export interface MetaState {
  /** Ability ids ever unlocked. Options accumulate; power does not. */
  unlocked: AbilityId[];
  /** Runs started, 1-based key for every story beat. */
  runCount: number;
  machineOpened: boolean;
  sound: boolean;
  music: boolean;
}

export type RunScreen =
  | "opener"
  | "tutorial"
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
  dominant: AbilityVerb;
  kitSeed: number;
}

export interface RunState {
  runSeed: number;
  runNumber: number;
  day: number;
  strain: number;
  ramPerTurn: number;
  capacity: number;
  credits: number;
  copies: Record<AbilityId, number>;
  equipped: AbilityId[];
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
    unlocked: AbilityId | null;
    jobIndex: number;
  } | null;
}

export const META_KEY = "kernel-panic-meta-v2";
export const RUN_KEY = "kernel-panic-run-v2";

export const EMPTY_META: MetaState = {
  unlocked: [],
  runCount: 0,
  machineOpened: false,
  sound: true,
  music: true,
};

export function loadMeta(): MetaState {
  if (typeof window === "undefined") return EMPTY_META;
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return EMPTY_META;
    const p = JSON.parse(raw) as Partial<MetaState>;
    return {
      unlocked: Array.isArray(p.unlocked) ? p.unlocked.filter((x) => typeof x === "string") : [],
      runCount: typeof p.runCount === "number" ? p.runCount : 0,
      machineOpened: p.machineOpened === true,
      sound: p.sound !== false,
      music: p.music !== false,
    };
  } catch {
    return EMPTY_META;
  }
}

export function saveMeta(m: MetaState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    // Storage unavailable (private mode); the run still plays.
  }
}

export function loadRun(): RunState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as RunState;
    // Light shape check; anything off means the run is not resumable.
    if (
      typeof p.runSeed !== "number" ||
      typeof p.day !== "number" ||
      typeof p.strain !== "number" ||
      !Array.isArray(p.jobs) ||
      typeof p.screen !== "string"
    ) {
      return null;
    }
    // Never resume into a transient screen; land on the day board.
    if (p.screen === "duel" || p.screen === "analyze" || p.screen === "build") {
      p.screen = "day";
      p.activeJob = null;
    }
    if (p.screen === "tutorial" || p.screen === "opener") p.screen = "opener";
    return p;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (r === null) window.localStorage.removeItem(RUN_KEY);
    else window.localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    // Storage unavailable; play continues unpersisted.
  }
}

/* ------------------------------------------------------------------ */
/* Save slots                                                          */
/* ------------------------------------------------------------------ */

export const SLOT_COUNT = 3;

function slotMetaKey(slot: number): string {
  return `kernel-panic-s${slot}-meta-v2`;
}

function slotRunKey(slot: number): string {
  return `kernel-panic-s${slot}-run-v2`;
}

/** Pre-slot saves become USER 01 so nobody loses a run to the update. */
export function migrateLegacySave(): void {
  if (typeof window === "undefined") return;
  try {
    const legacyMeta = window.localStorage.getItem(META_KEY);
    if (!legacyMeta) return;
    if (!window.localStorage.getItem(slotMetaKey(1))) {
      window.localStorage.setItem(slotMetaKey(1), legacyMeta);
      const legacyRun = window.localStorage.getItem(RUN_KEY);
      if (legacyRun) window.localStorage.setItem(slotRunKey(1), legacyRun);
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
    const p = JSON.parse(raw) as Partial<MetaState>;
    return {
      unlocked: Array.isArray(p.unlocked) ? p.unlocked.filter((x) => typeof x === "string") : [],
      runCount: typeof p.runCount === "number" ? p.runCount : 0,
      machineOpened: p.machineOpened === true,
      sound: p.sound !== false,
      music: p.music !== false,
    };
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
    const p = JSON.parse(raw) as RunState;
    if (
      typeof p.runSeed !== "number" ||
      typeof p.day !== "number" ||
      typeof p.strain !== "number" ||
      !Array.isArray(p.jobs) ||
      typeof p.screen !== "string"
    ) {
      return null;
    }
    if (p.screen === "duel" || p.screen === "analyze" || p.screen === "build") {
      p.screen = "day";
      p.activeJob = null;
    }
    if (p.screen === "tutorial" || p.screen === "opener") p.screen = "opener";
    return p;
  } catch {
    return null;
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
  unlocked: number;
  machineOpened: boolean;
  /** Mid-run snapshot, when one is waiting. */
  day: number | null;
  strain: number | null;
}

export function slotSummaries(): SlotSummary[] {
  const out: SlotSummary[] = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    if (typeof window === "undefined" || !window.localStorage.getItem(slotMetaKey(slot))) {
      out.push({ slot, empty: true, runCount: 0, unlocked: 0, machineOpened: false, day: null, strain: null });
      continue;
    }
    const meta = loadSlotMeta(slot);
    const run = loadSlotRun(slot);
    out.push({
      slot,
      empty: false,
      runCount: meta.runCount,
      unlocked: meta.unlocked.length,
      machineOpened: meta.machineOpened,
      day: run ? run.day : null,
      strain: run ? run.strain : null,
    });
  }
  return out;
}
