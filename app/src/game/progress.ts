import { DiveType } from "./types";

/**
 * Local shop ledger: credits and per-type XP, persisted in the browser only.
 * This is prototype-scoped player progress (a save file), read and written
 * inside effects and event handlers so it stays SSR-safe.
 */

export interface Progress {
  credits: number;
  xp: Record<DiveType, number>;
  clears: Record<DiveType, number>;
  sound: boolean;
}

const KEY = "kernel-panic-progress-v1";

export const EMPTY_PROGRESS: Progress = {
  credits: 0,
  xp: { hardware: 0, network: 0, data: 0, software: 0 },
  clears: { hardware: 0, network: 0, data: 0, software: 0 },
  sound: true,
};

export function loadProgress(): Progress {
  if (typeof window === "undefined") return EMPTY_PROGRESS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      credits: typeof parsed.credits === "number" ? parsed.credits : 0,
      xp: { ...EMPTY_PROGRESS.xp, ...(parsed.xp ?? {}) },
      clears: { ...EMPTY_PROGRESS.clears, ...(parsed.clears ?? {}) },
      sound: parsed.sound !== false,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(p: Progress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage may be unavailable (private mode); the dive still plays.
  }
}

export function levelFromXp(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  let span = 100;
  let rest = xp;
  while (rest >= span && level < 9) {
    rest -= span;
    level++;
    span = Math.floor(span * 1.4);
  }
  return { level, into: rest, span };
}
