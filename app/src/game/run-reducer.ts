import { DAY_CONFIGS, FINAL_DAY, jobPay } from "./content/arc";
import { CUSTOMERS } from "./content/customers";
import { AUGMENTS, AttackMode, AugmentDef, AugmentId, DefendMode } from "./content/kit";
import { mixSeed } from "./duel-setup";
import {
  CRAFT_COST,
  PATCH_DROP_TIER_BONUS,
  PATCH_POUCH_MAX,
  armUnionCraft,
  darkPatchCost,
  rollPatchMask,
} from "./patch-cells";
import { Rng } from "./rng";
import {
  JobInstance,
  LifetimeStats,
  MetaState,
  NightPick,
  RunKit,
  RunState,
  baseRunKit,
} from "./save";

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
  | {
      type: "duelFinished";
      won: boolean;
      chip: number;
      capWin: boolean;
      /** Neither side could route; the player won the collapse. */
      gridlockWin: boolean;
      /** The pouch as the dive left it (spent pieces already gone). */
      pouchLeft: number[];
      overRotations: number;
      trapsFired: number;
      scans: number;
      attackCasts: number;
      defendCasts: number;
      /** REPAIR.LOG telemetry, optional so headless dives stay unchanged. */
      rounds?: number;
      trapRounds?: number[];
      parRounds?: number[];
      log?: string[];
    }
  | { type: "pickAugment"; id: AugmentId; replace?: AugmentId }
  | { type: "resultNext" }
  | { type: "chooseUpgrade"; pick: Exclude<NightPick, null> }
  | { type: "closeNight" }
  | { type: "buyPatch" }
  | { type: "buySlot" }
  | { type: "buyDarkPatch" }
  | { type: "craftPatch"; a: number; b: number }
  | { type: "startFinale" }
  | { type: "endRunAck" }
  | { type: "taught"; id: string }
  | { type: "toggleSound" }
  | { type: "toggleMusic" };

export const BASE_RAM = 5;
export const START_STRAIN = 100;
export const PATCH_HEAL = 12;
export const MAX_RAM = 9;
/** Strain restored for free when a day closes. */
export const DAY_REST_REGEN = 10;
/** Paid in place of an augment once the draft pool is exhausted. */
export const SALVAGE_PAY = 25;
/** Boost bays: base capacity, ceiling, and the price of each expansion. */
export const BOOST_SLOTS_BASE = 3;
export const BOOST_SLOTS_MAX = 5;
export const BOOST_SLOT_COSTS = [150, 300];

/** Price of the NEXT bay, or null at the ceiling. */
export function slotCost(run: RunState): number | null {
  if (run.boostSlots >= BOOST_SLOTS_MAX) return null;
  return BOOST_SLOT_COSTS[Math.min(run.boostSlots - BOOST_SLOTS_BASE, BOOST_SLOT_COSTS.length - 1)];
}

/** Night patch price scales with the day so the heal stays a decision. */
export function nightPatchCost(day: number): number {
  return 45 + 5 * day;
}

/** The darknet's live price for this run: day rate, minus DARKNET RATE. */
export function darkPullPrice(run: RunState): number {
  const base = darkPatchCost(run.day);
  return run.kit.augments.includes("darkDiscount") ? Math.round(base * 0.85) : base;
}

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

function requireMet(req: NonNullable<AugmentDef["requires"]>, run: RunState): boolean {
  switch (req.kind) {
    case "augment":
      return ownsAugment(run.kit, req.id);
    case "pouch":
      return run.patchPouch.length > 0;
  }
}

/** May this augment appear in a draft for this run right now? Full bays do
 * NOT exclude boosts: a full-bay pick is a swap, decided at pick time. */
export function draftEligible(run: RunState, a: AugmentDef): boolean {
  if (ownsAugment(run.kit, a.id)) return false;
  if (a.requires && !requireMet(a.requires, run)) return false;
  return true;
}

const draftWeight = (a: AugmentDef): number => a.weight ?? (a.kind === "config" ? 3 : 1);

function weightedTake(rng: Rng, pool: AugmentDef[]): AugmentDef {
  const total = pool.reduce((n, a) => n + draftWeight(a), 0);
  let roll = rng.int(total);
  for (const a of pool) {
    roll -= draftWeight(a);
    if (roll < 0) return a;
  }
  return pool[pool.length - 1];
}

/**
 * Draft three augments the run does not own yet, requires-gated and
 * weighted (configs heavy, so drivers land before the boosts that need
 * them). Slot 0 is ALWAYS a config while any is unowned. Deterministic
 * per (run, day, job).
 */
export function rollDraft(run: RunState): AugmentId[] {
  const pool = AUGMENTS.filter((a) => draftEligible(run, a));
  if (pool.length === 0) return [];
  const rng = new Rng(mixSeed(run.runSeed, run.day, run.activeJob ?? 0, 0x991));
  const picks: AugmentDef[] = [];
  const configs = pool.filter((a) => a.kind === "config");
  if (configs.length > 0) picks.push(weightedTake(rng, configs));
  while (picks.length < 3) {
    const rest = pool.filter((a) => !picks.includes(a));
    if (rest.length === 0) break;
    picks.push(weightedTake(rng, rest));
  }
  return picks.map((a) => a.id);
}

function bump(counts: Record<string, number>, key: string, by = 1): Record<string, number> {
  return { ...counts, [key]: (counts[key] ?? 0) + by };
}

/**
 * Fold one finished dive into the lifetime ledger. Display only: nothing
 * here is read back by a rule, so a stat that drifts costs a number on a
 * screen and nothing else.
 */
function tallyDive(
  stats: LifetimeStats,
  run: RunState,
  r: { won: boolean; scans: number; attackCasts: number; defendCasts: number },
): LifetimeStats {
  const job = run.activeJob !== null ? run.jobs[run.activeJob] : null;
  let modeUse = stats.modeUse;
  if (r.attackCasts > 0) modeUse = bump(modeUse, run.kit.attackMode, r.attackCasts);
  if (r.defendCasts > 0) modeUse = bump(modeUse, run.kit.defendMode, r.defendCasts);
  return {
    ...stats,
    divesCleared: stats.divesCleared + (r.won ? 1 : 0),
    divesLost: stats.divesLost + (r.won ? 0 : 1),
    scans: stats.scans + r.scans,
    modeUse,
    lostTo: !r.won && job ? bump(stats.lostTo, job.customerId) : stats.lostTo,
  };
}

export function jobPayFor(run: RunState, capWin: boolean): number {
  const job = run.activeJob !== null ? run.jobs[run.activeJob] : null;
  if (!job) return 0;
  const pay = jobPay(job.tier);
  // Overtime Clause: the client eats more of a deadline overrun.
  const capRate = run.kit.augments.includes("overtimeClause") ? 0.75 : 0.5;
  return capWin ? Math.floor(pay * capRate) : pay;
}

export function runReducer(state: GameState, action: RunAction): GameState {
  const { meta, run } = state;
  switch (action.type) {
    case "hydrate":
      return { meta: action.meta, run: action.run };

    // Teaching is meta, not run state: a mechanic explained in attempt 3
    // stays explained in attempt 4.
    case "taught": {
      if (meta.taught.includes(action.id)) return state;
      return { ...state, meta: { ...meta, taught: [...meta.taught, action.id] } };
    }

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
        patchPouch: [],
        darkBuys: 0,
        lastDarkBuy: null,
        lastRegen: 0,
        nightPick: null,
        kit: baseRunKit(),
        boostSlots: BOOST_SLOTS_BASE,
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
        // Run 1 walks into the machine blind; later runs open on day
        // one's morning scene (the opener covers the ritual attempt).
        const screen = run.runNumber === 1 ? "tutIntro" : "dayOpen";
        return { ...state, run: { ...run, screen } };
      }
      if (run.screen === "tutIntro") {
        return { ...state, run: { ...run, screen: "tutorial" } };
      }
      if (run.screen === "tutOutro") {
        return { ...state, run: { ...run, screen: "dayOpen" } };
      }
      if (run.screen === "dayOpen") {
        const screen = run.day === FINAL_DAY ? "finalePre" : "day";
        return { ...state, run: { ...run, screen } };
      }
      if (run.screen === "finaleWin" || run.screen === "runEnd") {
        return { ...state, run: null };
      }
      return state;
    }

    case "tutorialDone": {
      if (!run || run.screen !== "tutorial") return state;
      return { ...state, run: { ...run, screen: "tutOutro", strain: START_STRAIN } };
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
      const stats = tallyDive(meta.stats, run, action);

      if (!action.won) {
        return {
          meta: { ...meta, stats },
          run: { ...run, strain: 0, screen: "runEnd", lastResult: null },
        };
      }

      if (isFinale) {
        return {
          meta: { ...meta, machineOpened: true, stats: { ...stats, runsWon: stats.runsWon + 1 } },
          run: { ...run, screen: "finaleWin", lastResult: null },
        };
      }

      const strain = Math.max(0, run.strain - action.chip);
      const draft = rollDraft(run);
      // A dry augment cache pays out as salvage instead. Kept as its own
      // term so the result screen can show why the credited amount does not
      // match the rate printed on the ticket.
      const salvage = draft.length === 0 ? SALVAGE_PAY : 0;
      const ticketPay = jobPayFor(run, action.capWin);
      // Clean Run's consolation: a trap-free win that only missed the
      // chip-zero payout by running to the cap still pays a little.
      const cleanRunBonus =
        action.capWin && action.trapsFired === 0 && action.chip !== 0 && run.kit.augments.includes("cleanRun")
          ? 15
          : 0;
      const pay = ticketPay + salvage + cleanRunBonus;
      const jobsDone = run.jobsDone.map((d, i) => (i === run.activeJob ? true : d));
      let pouch = [...action.pouchLeft];

      // Clean Run banks first (it was earned by play), then the job's drop
      // roll; each reports "capped" and discards when the pouch is full.
      // Separate salts so owning the augment never shifts the drop stream.
      const cleanRunFired = action.chip === 0 && run.kit.augments.includes("cleanRun");
      let cleanRun: { status: "banked"; mask: number } | { status: "capped" } | null = null;
      if (cleanRunFired) {
        if (pouch.length >= PATCH_POUCH_MAX) {
          cleanRun = { status: "capped" };
        } else {
          const mask = rollPatchMask(new Rng(mixSeed(run.runSeed, run.day, run.activeJob ?? 0, 0xc1ea)));
          pouch = [...pouch, mask];
          cleanRun = { status: "banked", mask };
        }
      }
      const job = run.jobs[run.activeJob ?? 0];
      const dropRng = new Rng(mixSeed(run.runSeed, run.day, run.activeJob ?? 0, 0x9d0b));
      const dropChance =
        DAY_CONFIGS[run.day].patchDrop + PATCH_DROP_TIER_BONUS * ((job?.tier ?? 1) - 1);
      let patchDrop: { status: "banked" | "capped"; mask: number } | null = null;
      if (dropRng.next() < dropChance) {
        // Roll the shape either way: a capped drop still shows what was
        // left on the bench.
        const mask = rollPatchMask(dropRng);
        if (pouch.length >= PATCH_POUCH_MAX) {
          patchDrop = { status: "capped", mask };
        } else {
          pouch = [...pouch, mask];
          patchDrop = { status: "banked", mask };
        }
      }

      // Zero by any means ends the run, a bled-out win included.
      const screen = strain <= 0 ? "runEnd" : "result";
      return {
        meta: { ...meta, stats },
        run: {
          ...run,
          credits: run.credits + pay,
          strain,
          patchPouch: pouch,
          jobsDone,
          screen,
          lastResult: {
            won: true,
            chip: action.chip,
            pay,
            basePay: jobPay(run.jobs[run.activeJob ?? 0]?.tier ?? 1),
            salvage,
            cleanRun,
            cleanRunBonus,
            patchDrop,
            capWin: action.capWin,
            gridlockWin: action.gridlockWin,
            overRotations: action.overRotations,
            trapsFired: action.trapsFired,
            jobIndex: run.activeJob ?? 0,
            draft,
            picked: null,
            replaced: null,
            rounds: action.rounds,
            trapRounds: action.trapRounds,
            parRounds: action.parRounds,
            log: action.log,
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
      let replaced: AugmentId | null = null;
      // A drafted config is unlocked, never equipped. Swapping the live mode
      // on pickup meant walking into the next dive with WARD instead of the
      // PURGE that was deliberately set, and no sign it had changed.
      if (def.attackMode) {
        kit.attackModes = [...kit.attackModes, def.attackMode];
      } else if (def.defendMode) {
        kit.defendModes = [...kit.defendModes, def.defendMode];
      } else if (kit.augments.length >= run.boostSlots) {
        // Full bays: the pick must name an installed boost to eject. Keeps
        // length constant, which also lets an over-cap grandfathered run
        // swap one for one without ever growing.
        if (!action.replace || !kit.augments.includes(action.replace)) return state;
        replaced = action.replace;
        kit.augments = [...kit.augments.filter((a) => a !== replaced), action.id];
      } else {
        kit.augments = [...kit.augments, action.id];
      }
      return {
        ...state,
        run: { ...run, kit, lastResult: { ...run.lastResult, picked: action.id, replaced } },
      };
    }

    case "resultNext": {
      if (!run || run.screen !== "result") return state;
      const allDone = run.jobsDone.every(Boolean);
      if (!allDone) {
        return { ...state, run: { ...run, activeJob: null, screen: "day" } };
      }
      // The shop closes for the night: rest restores strain as the
      // upgrade screen opens, so the meter visibly fills there.
      const strain = Math.min(100, run.strain + DAY_REST_REGEN);
      return {
        ...state,
        run: {
          ...run,
          activeJob: null,
          strain,
          lastRegen: strain - run.strain,
          nightPick: null,
          screen: "upgrade",
        },
      };
    }

    // Picking is now reversible and does NOT end the night: the shop rows
    // live on the same screen, and committing on click meant a player who
    // upgraded first silently lost the chance to spend their credits.
    case "chooseUpgrade": {
      if (!run || run.screen !== "upgrade") return state;
      return { ...state, run: { ...run, nightPick: action.pick } };
    }

    case "closeNight": {
      if (!run || run.screen !== "upgrade" || run.nightPick === null) return state;
      let ramPerTurn = run.ramPerTurn;
      const kit = { ...run.kit };
      if (run.nightPick === "ram") ramPerTurn = Math.min(MAX_RAM, ramPerTurn + 1);
      else if (run.nightPick === "scan") kit.scanTier = Math.min(3, kit.scanTier + 1) as RunKit["scanTier"];
      else if (run.nightPick === "attack") kit.attackTier = Math.min(3, kit.attackTier + 1) as RunKit["attackTier"];
      else kit.defendTier = Math.min(3, kit.defendTier + 1) as RunKit["defendTier"];
      const day = run.day + 1;
      // Every morning opens on its cutscene; day 10's frames the finale.
      if (day === FINAL_DAY) {
        return {
          ...state,
          run: { ...run, ramPerTurn, kit, day, nightPick: null, jobs: [], jobsDone: [], screen: "dayOpen" },
        };
      }
      return {
        ...state,
        run: {
          ...run,
          ramPerTurn,
          kit,
          day,
          nightPick: null,
          jobs: genDayJobs(run.runSeed, day),
          jobsDone: [false, false, false],
          screen: "dayOpen",
        },
      };
    }

    case "buyPatch": {
      if (!run || run.screen !== "upgrade") return state;
      const patchCost = nightPatchCost(run.day);
      if (run.credits < patchCost || run.strain >= 100) return state;
      return {
        ...state,
        run: {
          ...run,
          credits: run.credits - patchCost,
          strain: Math.min(100, run.strain + PATCH_HEAL),
        },
      };
    }

    case "buySlot": {
      if (!run || run.screen !== "upgrade") return state;
      const cost = slotCost(run);
      if (cost === null || run.credits < cost) return state;
      return {
        ...state,
        run: { ...run, credits: run.credits - cost, boostSlots: run.boostSlots + 1 },
      };
    }

    case "buyDarkPatch": {
      if (!run || run.screen !== "upgrade") return state;
      const cost = darkPullPrice(run);
      if (run.credits < cost || run.patchPouch.length >= PATCH_POUCH_MAX) return state;
      // Each buy is its own deterministic stream, salted by the lifetime
      // purchase count: reload and reroll land the same piece.
      const mask = rollPatchMask(new Rng(mixSeed(run.runSeed, run.day, run.darkBuys, 0xd47b)));
      return {
        ...state,
        run: {
          ...run,
          credits: run.credits - cost,
          darkBuys: run.darkBuys + 1,
          patchPouch: [...run.patchPouch, mask],
          lastDarkBuy: mask,
        },
      };
    }

    case "craftPatch": {
      // Crafting happens at the bench, never mid-dive: the severed verdict
      // enumerates held pieces and must stay the whole truth during a dive.
      if (!run || run.screen === "duel" || run.screen === "tutorial") return state;
      if (action.a === action.b) return state;
      const ma = run.patchPouch[action.a];
      const mb = run.patchPouch[action.b];
      if (ma === undefined || mb === undefined) return state;
      const crafted = armUnionCraft(ma, mb);
      if (crafted === null || run.credits < CRAFT_COST) return state;
      const patchPouch = run.patchPouch.filter((_, i) => i !== action.a && i !== action.b);
      patchPouch.push(crafted);
      return {
        ...state,
        run: { ...run, credits: run.credits - CRAFT_COST, patchPouch },
      };
    }

    case "endRunAck": {
      if (!run) return state;
      return { ...state, run: null };
    }
  }
}
