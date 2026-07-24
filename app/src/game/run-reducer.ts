import { ABILITIES, ABILITY_BY_ID, copyPrice } from "./content/abilities";
import { DAY_CONFIGS, FINAL_DAY } from "./content/arc";
import { CUSTOMERS } from "./content/customers";
import { mixSeed } from "./duel-setup";
import { AbilityId } from "./duel-types";
import { Rng } from "./rng";
import { JobInstance, MetaState, RunState } from "./save";

/**
 * Run-level state machine: meta (cross-run) plus the current run. Pure
 * reducer; the ShopOS provider owns it and persists both layers in an
 * effect. Duels live in their own reducer; this one receives their verdicts.
 */

export interface GameState {
  meta: MetaState;
  run: RunState | null;
}

export type RunAction =
  | { type: "hydrate"; meta: MetaState; run: RunState | null }
  | { type: "startRun"; seed: number }
  | { type: "storyDone" }
  | { type: "tutorialDone" }
  | { type: "pickJob"; index: number }
  | { type: "backToDay" }
  | { type: "toBuild" }
  | { type: "equip"; id: AbilityId }
  | { type: "unequip"; id: AbilityId }
  | { type: "buyCopy"; id: AbilityId }
  | { type: "startDuel" }
  | {
      type: "duelFinished";
      won: boolean;
      chip: number;
      capWin: boolean;
      copiesLeft: Record<AbilityId, number>;
    }
  | { type: "resultNext" }
  | { type: "chooseUpgrade"; pick: "ram" | "cap" }
  | { type: "startFinale" }
  | { type: "endRunAck" }
  | { type: "toggleSound" }
  | { type: "toggleMusic" };

export const BASE_RAM = 5;
export const BASE_CAPACITY = 2;
export const START_STRAIN = 100;

function genDayJobs(runSeed: number, day: number): JobInstance[] {
  const cfg = DAY_CONFIGS[day];
  const rng = new Rng(mixSeed(runSeed, day, 0x77));
  const used = new Set<string>();
  return cfg.jobTiers.map((tier) => {
    let pool = CUSTOMERS.filter((c) => c.tiers.includes(tier) && !used.has(c.id));
    if (pool.length === 0) pool = CUSTOMERS.filter((c) => c.tiers.includes(tier));
    const customer = pool[rng.int(pool.length)];
    used.add(customer.id);
    return {
      customerId: customer.id,
      quoteIndex: rng.int(2) as 0 | 1,
      tier,
      dominant: customer.dominant,
      kitSeed: mixSeed(runSeed, day, tier, rng.int(1 << 30)),
    };
  });
}

function rollUnlock(state: GameState, run: RunState): AbilityId | null {
  const locked = ABILITIES.filter((a) => !state.meta.unlocked.includes(a.id));
  if (locked.length === 0) return null;
  const rng = new Rng(mixSeed(run.runSeed, run.day, run.activeJob ?? 0, 0x991));
  return locked[rng.int(locked.length)].id;
}

export function jobPayFor(run: RunState, capWin: boolean): number {
  const job = run.activeJob !== null ? run.jobs[run.activeJob] : null;
  if (!job) return 0;
  const pay = 40 + 25 * job.tier;
  return capWin ? Math.floor(pay / 2) : pay;
}

export function runReducer(state: GameState, action: RunAction): GameState {
  const { meta, run } = state;
  switch (action.type) {
    case "hydrate":
      return { meta: action.meta, run: action.run };

    case "toggleSound":
      return { ...state, meta: { ...meta, sound: !meta.sound } };

    case "toggleMusic":
      return { ...state, meta: { ...meta, music: !meta.music } };

    case "startRun": {
      const runNumber = meta.runCount + 1;
      const newRun: RunState = {
        runSeed: action.seed,
        runNumber,
        day: 1,
        strain: START_STRAIN,
        ramPerTurn: BASE_RAM,
        capacity: BASE_CAPACITY,
        credits: 0,
        copies: Object.fromEntries(meta.unlocked.map((id) => [id, 1])),
        equipped: meta.unlocked.slice(0, BASE_CAPACITY),
        jobs: genDayJobs(action.seed, 1),
        jobsDone: [false, false, false],
        screen: "opener",
        activeJob: null,
        lastResult: null,
      };
      return { meta: { ...meta, runCount: runNumber }, run: newRun };
    }

    case "storyDone": {
      if (!run) return state;
      if (run.screen === "opener") {
        // Run 1 walks into the machine blind; later runs skip straight to
        // day one (the opener scene covers the ritual attempt).
        const screen = run.runNumber === 1 ? "tutorial" : "day";
        return { ...state, run: { ...run, screen } };
      }
      if (run.screen === "finaleWin" || run.screen === "runEnd") {
        return { ...state, run: null };
      }
      return state;
    }

    case "tutorialDone": {
      if (!run || run.screen !== "tutorial") return state;
      return { ...state, run: { ...run, screen: "day", strain: START_STRAIN } };
    }

    case "pickJob": {
      if (!run || run.screen !== "day") return state;
      if (run.jobsDone[action.index] || !run.jobs[action.index]) return state;
      return { ...state, run: { ...run, activeJob: action.index, screen: "analyze" } };
    }

    case "backToDay": {
      if (!run) return state;
      // Day 10 has no job board; backing out of the finale build returns to
      // the back-room door instead.
      const screen = run.day === FINAL_DAY ? "finalePre" : "day";
      return { ...state, run: { ...run, activeJob: null, screen } };
    }

    case "toBuild": {
      if (!run || (run.screen !== "analyze" && run.screen !== "finalePre")) return state;
      return { ...state, run: { ...run, screen: "build" } };
    }

    case "equip": {
      if (!run || run.screen === "duel" || run.screen === "tutorial") return state;
      if (run.equipped.includes(action.id)) return state;
      if (run.equipped.length >= run.capacity) return state;
      if (!meta.unlocked.includes(action.id)) return state;
      if ((run.copies[action.id] ?? 0) < 1) return state;
      return { ...state, run: { ...run, equipped: [...run.equipped, action.id] } };
    }

    case "unequip": {
      if (!run || run.screen === "duel" || run.screen === "tutorial") return state;
      return {
        ...state,
        run: { ...run, equipped: run.equipped.filter((id) => id !== action.id) },
      };
    }

    case "buyCopy": {
      if (!run || run.screen === "duel" || run.screen === "tutorial") return state;
      const def = ABILITY_BY_ID[action.id];
      if (!def || !meta.unlocked.includes(action.id)) return state;
      const price = copyPrice(def);
      if (run.credits < price) return state;
      return {
        ...state,
        run: {
          ...run,
          credits: run.credits - price,
          copies: { ...run.copies, [action.id]: (run.copies[action.id] ?? 0) + 1 },
        },
      };
    }

    case "startDuel": {
      if (!run || run.screen !== "build") return state;
      return { ...state, run: { ...run, screen: "duel" } };
    }

    case "startFinale": {
      if (!run || run.screen !== "finalePre") return state;
      return { ...state, run: { ...run, screen: "build" } };
    }

    case "duelFinished": {
      if (!run || run.screen !== "duel") return state;
      const isFinale = run.day === FINAL_DAY;
      const copies = { ...run.copies, ...action.copiesLeft };

      if (!action.won) {
        return {
          ...state,
          run: { ...run, copies, strain: 0, screen: "runEnd", lastResult: null },
        };
      }

      if (isFinale) {
        return {
          meta: { ...meta, machineOpened: true },
          run: { ...run, copies, screen: "finaleWin", lastResult: null },
        };
      }

      const strain = Math.max(0, run.strain - action.chip);
      const pay = jobPayFor(run, action.capWin);
      const unlocked = rollUnlock(state, run);
      const jobsDone = run.jobsDone.map((d, i) => (i === run.activeJob ? true : d));
      const newMeta = unlocked
        ? { ...meta, unlocked: [...meta.unlocked, unlocked] }
        : meta;
      const newCopies = unlocked ? { ...copies, [unlocked]: (copies[unlocked] ?? 0) + 1 } : copies;

      // Zero by any means ends the run, a bled-out win included.
      const screen = strain <= 0 ? "runEnd" : "result";
      return {
        meta: newMeta,
        run: {
          ...run,
          copies: newCopies,
          credits: run.credits + pay,
          strain,
          jobsDone,
          screen,
          lastResult: {
            won: true,
            chip: action.chip,
            pay,
            capWin: action.capWin,
            unlocked,
            jobIndex: run.activeJob ?? 0,
          },
        },
      };
    }

    case "resultNext": {
      if (!run || run.screen !== "result") return state;
      const allDone = run.jobsDone.every(Boolean);
      if (!allDone) {
        return { ...state, run: { ...run, activeJob: null, screen: "day" } };
      }
      return { ...state, run: { ...run, activeJob: null, screen: "upgrade" } };
    }

    case "chooseUpgrade": {
      if (!run || run.screen !== "upgrade") return state;
      const ramPerTurn = action.pick === "ram" ? Math.min(9, run.ramPerTurn + 1) : run.ramPerTurn;
      const capacity = action.pick === "cap" ? Math.min(8, run.capacity + 1) : run.capacity;
      const day = run.day + 1;
      if (day === FINAL_DAY) {
        return {
          ...state,
          run: { ...run, ramPerTurn, capacity, day, jobs: [], jobsDone: [], screen: "finalePre" },
        };
      }
      return {
        ...state,
        run: {
          ...run,
          ramPerTurn,
          capacity,
          day,
          jobs: genDayJobs(run.runSeed, day),
          jobsDone: [false, false, false],
          screen: "day",
        },
      };
    }

    case "endRunAck": {
      if (!run) return state;
      return { ...state, run: null };
    }
  }
}
