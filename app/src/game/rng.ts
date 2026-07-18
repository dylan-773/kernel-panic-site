/**
 * Deterministic PRNG (mulberry32) used by the puzzle generator and the dive
 * reducer. Stateless step function so reducers stay pure: every call returns
 * the drawn value plus the next state.
 */

export type RngState = number;

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

export function nextU32(state: RngState): [number, RngState] {
  let a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** Mutable convenience wrapper for generator-side code. */
export class Rng {
  private state: RngState;

  constructor(seed: number) {
    this.state = seedRng(seed);
  }

  next(): number {
    const [v, s] = nextU32(this.state);
    this.state = s;
    return v;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
