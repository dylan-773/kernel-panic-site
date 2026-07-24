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
