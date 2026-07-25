import { DAY_CONFIGS, FINAL_DAY, jobPay } from "./content/arc";
import { CUSTOMERS } from "./content/customers";
import { AUGMENTS, AttackMode, AugmentId, DefendMode } from "./content/kit";
import { mixSeed } from "./duel-setup";
import { Rng } from "./rng";
import { JobInstance, MetaState, RunKit, RunState, baseRunKit } from "./save";

/**
 * Run-level state machine: meta (cross-run) plus the current run. Pure
 * reducer; the ShopOS provider owns it and persists both layers in an
 * effect. Duels live in their own reducer; this one receives their verdicts.
 *
 * Progression, v5: every cleared job offers an augment draft (configs and
 * boosts); every closed day offers +1 RAM or a program tier of your choice.
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
  | { type: "setAttackMode"; mode: AttackMode }
  | { type: "setDefendMode"; mode: DefendMode }
  | { type: "startDuel" }
  | { type: "duelFinished"; won: boolean; chip: number; capWin: boolean }
  | { type: "pickAugment"; id: AugmentId }
  | { type: "resultNext" }
  | { type: "chooseUpgrade"; pick: "ram" | "scan" | "attack" | "defend" }
  | { type: "buyPatch" }
  | { type: "startFinale" }
  | { type: "endRunAck" }
  | { type: "toggleSound" }
  | { type: "toggleMusic" };

export const BASE_RAM = 5;
export const START_STRAIN = 100;
export const PATCH_COST = 60;
export const PATCH_HEAL = 12;
export const MAX_RAM = 9;

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

/** Which augments the run already owns (configs count via the mode lists). */
export function ownsAugment(kit: RunKit, id: AugmentId): boolean {
  const def = AUGMENTS.find((a) => a.id === id);
  if (!def) return true;
  if (def.attackMode) return kit.attackModes.includes(def.attackMode);
  if (def.defendMode) return kit.defendModes.includes(def.defendMode);
  return kit.augments.includes(id);
}

/**
 * Draft three augments the run does not own yet, configs guaranteed a slot
 * while any remain. Deterministic per (run, day, job).
 */
export function rollDraft(run: RunState): AugmentId[] {
  const remaining = AUGMENTS.filter((a) => !ownsAugment(run.kit, a.id));
  if (remaining.length === 0) return [];
  const rng = new Rng(mixSeed(run.runSeed, run.day, run.activeJob ?? 0, 0x991));
  const picks = rng.shuffle(remaining.map((a) => a.id)).slice(0, 3);
  const configs = remaining.filter((a) => a.kind === "config").map((a) => a.id);
  if (configs.length > 0 && !picks.some((id) => configs.includes(id))) {
    picks[0] = configs[rng.int(configs.length)];
  }
  return picks;
}

export function jobPayFor(run: RunState, capWin: boolean): number {
  const job = run.activeJob !== null ? run.jobs[run.activeJob] : null;
  if (!job) return 0;
  const pay = jobPay(job.tier);
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
        credits: 0,
        kit: baseRunKit(),
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

    case "setAttackMode": {
      if (!run || run.screen === "duel" || run.screen === "tutorial") return state;
      if (!run.kit.attackModes.includes(action.mode)) return state;
      return { ...state, run: { ...run, kit: { ...run.kit, attackMode: action.mode } } };
    }

    case "setDefendMode": {
      if (!run || run.screen === "duel" || run.screen === "tutorial") return state;
      if (!run.kit.defendModes.includes(action.mode)) return state;
      return { ...state, run: { ...run, kit: { ...run.kit, defendMode: action.mode } } };
    }

    case "startDuel": {
      // Kit config is optional: the dive launches straight off the
      // diagnostic. The loadout window is always a click away instead.
      if (!run || run.screen !== "analyze" || run.activeJob === null) return state;
      return { ...state, run: { ...run, screen: "duel" } };
    }

    case "startFinale": {
      if (!run || run.screen !== "finalePre") return state;
      return { ...state, run: { ...run, screen: "duel" } };
    }

    case "duelFinished": {
      if (!run || run.screen !== "duel") return state;
      const isFinale = run.day === FINAL_DAY;

      if (!action.won) {
        return {
          ...state,
          run: { ...run, strain: 0, screen: "runEnd", lastResult: null },
        };
      }

      if (isFinale) {
        return {
          meta: { ...meta, machineOpened: true },
          run: { ...run, screen: "finaleWin", lastResult: null },
        };
      }

      const strain = Math.max(0, run.strain - action.chip);
      const draft = rollDraft(run);
      // A dry augment cache pays out as salvage instead.
      const pay = jobPayFor(run, action.capWin) + (draft.length === 0 ? 25 : 0);
      const jobsDone = run.jobsDone.map((d, i) => (i === run.activeJob ? true : d));

      // Zero by any means ends the run, a bled-out win included.
      const screen = strain <= 0 ? "runEnd" : "result";
      return {
        ...state,
        run: {
          ...run,
          credits: run.credits + pay,
          strain,
          jobsDone,
          screen,
          lastResult: {
            won: true,
            chip: action.chip,
            pay,
            capWin: action.capWin,
            jobIndex: run.activeJob ?? 0,
            draft,
            picked: null,
          },
        },
      };
    }

    case "pickAugment": {
      if (!run || run.screen !== "result" || !run.lastResult) return state;
      if (run.lastResult.picked) return state;
      if (!run.lastResult.draft.includes(action.id)) return state;
      const def = AUGMENTS.find((a) => a.id === action.id);
      if (!def || ownsAugment(run.kit, action.id)) return state;
      const kit = { ...run.kit };
      if (def.attackMode) {
        kit.attackModes = [...kit.attackModes, def.attackMode];
        kit.attackMode = def.attackMode;
      } else if (def.defendMode) {
        kit.defendModes = [...kit.defendModes, def.defendMode];
        kit.defendMode = def.defendMode;
      } else {
        kit.augments = [...kit.augments, action.id];
      }
      return {
        ...state,
        run: { ...run, kit, lastResult: { ...run.lastResult, picked: action.id } },
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
      let ramPerTurn = run.ramPerTurn;
      const kit = { ...run.kit };
      if (action.pick === "ram") ramPerTurn = Math.min(MAX_RAM, ramPerTurn + 1);
      else if (action.pick === "scan") kit.scanTier = Math.min(3, kit.scanTier + 1) as RunKit["scanTier"];
      else if (action.pick === "attack") kit.attackTier = Math.min(3, kit.attackTier + 1) as RunKit["attackTier"];
      else kit.defendTier = Math.min(3, kit.defendTier + 1) as RunKit["defendTier"];
      const day = run.day + 1;
      if (day === FINAL_DAY) {
        return {
          ...state,
          run: { ...run, ramPerTurn, kit, day, jobs: [], jobsDone: [], screen: "finalePre" },
        };
      }
      return {
        ...state,
        run: {
          ...run,
          ramPerTurn,
          kit,
          day,
          jobs: genDayJobs(run.runSeed, day),
          jobsDone: [false, false, false],
          screen: "day",
        },
      };
    }

    case "buyPatch": {
      if (!run || run.screen !== "upgrade") return state;
      if (run.credits < PATCH_COST || run.strain >= 100) return state;
      return {
        ...state,
        run: {
          ...run,
          credits: run.credits - PATCH_COST,
          strain: Math.min(100, run.strain + PATCH_HEAL),
        },
      };
    }

    case "endRunAck": {
      if (!run) return state;
      return { ...state, run: null };
    }
  }
}
