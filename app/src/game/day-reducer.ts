import { CUSTOMERS } from "./content/customers";
import { AUGMENTS, AttackMode, AugmentDef, AugmentId, DefendMode } from "./content/kit";
import { REPAIR_BY_ID, RepairId, pouchCapFor } from "./content/repairs";
import { TIER_CONFIGS, jobPay, rollTier, salvageFor, tierBandFor } from "./content/tiers";
import { mixSeed } from "./duel-setup";
import {
  CRAFT_COST,
  PATCH_DROP_TIER_BONUS,
  armUnionCraft,
  rollPatchMask,
} from "./patch-cells";
import { Rng } from "./rng";
import {
  CounterCustomer,
  DayResult,
  DayState,
  EMPTY_HELD,
  LifetimeStats,
  MetaState,
  ShopState,
  baseDeck,
  isSunday,
  ownedAttackModes,
  ownedBoostsNow,
  ownedDefendModes,
} from "./save";

/**
 * The day machine. THE DAY IS THE RUN: one working day, opened at the
 * counter and closed by choice, is the unit that can be lost. The shop
 * layer is permanent and, while a day is open, is written only by the
 * evening (which exists only after a close); everything a working day
 * earns lives on the day layer as HELD until sleep banks it. Strain zero
 * costs exactly two things: the held column, and the evening. Nothing
 * else. There is no run to lose and no reset of any kind.
 *
 * Pure reducer; the shell owns it and persists all three layers in an
 * effect. Duels live in their own reducer; this one receives verdicts.
 */

export interface GameState {
  meta: MetaState;
  shop: ShopState | null;
  day: DayState | null;
}

export type DayAction =
  | { type: "hydrate"; meta: MetaState; shop: ShopState | null; day: DayState | null }
  | { type: "newGame"; seed: number }
  | { type: "storyDone" }
  | { type: "tutorialDone" }
  | { type: "sundaySceneDone" }
  | { type: "customerArrived" }
  | { type: "acceptJob" }
  | { type: "declineJob" }
  | { type: "startDive" }
  | { type: "attemptBackroom" }
  | {
      type: "duelFinished";
      won: boolean;
      chip: number;
      capWin: boolean;
      /** The pouch as the dive left it (spent pieces already gone). */
      pouchLeft: number[];
      overRotations: number;
      trapsFired: number;
      /** Enemy REDIRECTs that landed on your grid; ~3 RAM each to undo. */
      redirectsTaken: number;
      /** Rounds the machine ended within striking distance of its goal. */
      pressureRounds: number;
      scans: number;
      attackCasts: number;
      defendCasts: number;
      /** REPAIR.LOG telemetry, optional so headless dives stay unchanged. */
      rounds?: number;
      trapRounds?: number[];
      parRounds?: number[];
      log?: string[];
    }
  | { type: "pickAugment"; id: AugmentId }
  | { type: "resultNext" }
  | { type: "closeShop" }
  | { type: "sleep" }
  | { type: "buyRepair"; id: RepairId }
  | { type: "buyDeck"; kind: "ram" | "scanTier" | "attackTier" | "defendTier" | "slot" }
  | { type: "buyPatchHeal" }
  | { type: "buyDarkPull" }
  | { type: "weldPieces"; a: number; b: number }
  | { type: "readArtifact"; id: string }
  | { type: "setAttackMode"; mode: AttackMode }
  | { type: "setDefendMode"; mode: DefendMode }
  | { type: "slotBoost"; id: AugmentId }
  | { type: "unslotBoost"; id: AugmentId }
  | { type: "taught"; id: string }
  | { type: "toggleSound" }
  | { type: "toggleMusic" };

export const BASE_RAM = 5;
export const MAX_RAM = 9;
export const START_STRAIN = 100;
/** Strain restored by a night patch, bought in the evening. */
export const PATCH_HEAL = 12;
/** Strain restored for free by sleeping, closed or busted alike. */
export const SLEEP_REGEN = 10;
/** Night patch price. Flat: nothing in the economy is day-indexed anymore. */
export const NIGHT_PATCH_COST = 60;
/** A blind darknet pull. Flat, evening only, onion router required. */
export const DARK_PULL_COST = 35;
/** Salvage prices for the deck: RAM steps 5->9. */
export const DECK_RAM_COSTS = [6, 10, 14, 18];
/** Salvage price to raise a program to tier 2 / tier 3. */
export const DECK_TIER_COSTS = [8, 14];
/** Salvage prices for boost bays 4 and 5. */
export const DECK_SLOT_COSTS = [10, 18];

/** Price of the NEXT deck purchase of this kind, or null at the ceiling. */
export function deckCost(
  shop: ShopState,
  kind: "ram" | "scanTier" | "attackTier" | "defendTier" | "slot",
): number | null {
  const d = shop.deck;
  switch (kind) {
    case "ram":
      return d.ramPerTurn >= MAX_RAM ? null : DECK_RAM_COSTS[d.ramPerTurn - BASE_RAM];
    case "scanTier":
      return d.scanTier >= 3 ? null : DECK_TIER_COSTS[d.scanTier - 1];
    case "attackTier":
      return d.attackTier >= 3 ? null : DECK_TIER_COSTS[d.attackTier - 1];
    case "defendTier":
      return d.defendTier >= 3 ? null : DECK_TIER_COSTS[d.defendTier - 1];
    case "slot":
      return d.slots >= 5 ? null : DECK_SLOT_COSTS[d.slots - 3];
  }
}

/** The darknet's live price: flat rate, minus DARKNET RATE when slotted. */
export function darkPullPrice(shop: ShopState): number {
  return shop.deck.slotted.includes("darkDiscount")
    ? Math.round(DARK_PULL_COST * 0.85)
    : DARK_PULL_COST;
}

/** Which augments are owned right now (configs count via the mode lists). */
export function ownsAugment(shop: ShopState, day: DayState | null, id: AugmentId): boolean {
  const def = AUGMENTS.find((a) => a.id === id);
  if (!def) return true;
  if (def.attackMode) return ownedAttackModes(shop, day).includes(def.attackMode);
  if (def.defendMode) return ownedDefendModes(shop, day).includes(def.defendMode);
  return ownedBoostsNow(shop, day).includes(id);
}

function requireMet(
  req: NonNullable<AugmentDef["requires"]>,
  shop: ShopState,
  day: DayState,
): boolean {
  switch (req.kind) {
    case "augment":
      return ownsAugment(shop, day, req.id);
    case "pouch":
      return day.pouch.length > 0;
  }
}

/** May this augment appear in a draft right now? */
export function draftEligible(shop: ShopState, day: DayState, a: AugmentDef): boolean {
  if (ownsAugment(shop, day, a.id)) return false;
  if (a.requires && !requireMet(a.requires, shop, day)) return false;
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
 * Draft three augments not owned yet, requires-gated and weighted (configs
 * heavy, so drivers land before the boosts that need them). Slot 0 is
 * ALWAYS a config while any is unowned. Deterministic per (shop, day, job).
 */
export function rollDraft(shop: ShopState, day: DayState): AugmentId[] {
  const pool = AUGMENTS.filter((a) => draftEligible(shop, day, a));
  if (pool.length === 0) return [];
  const rng = new Rng(mixSeed(shop.seed, shop.day, day.jobsResolved, 0x991));
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
 * here is read back by a rule.
 */
function tallyDive(
  stats: LifetimeStats,
  shop: ShopState,
  customerId: string | null,
  r: { won: boolean; scans: number; attackCasts: number; defendCasts: number },
): LifetimeStats {
  let modeUse = stats.modeUse;
  if (r.attackCasts > 0) modeUse = bump(modeUse, shop.deck.attackMode, r.attackCasts);
  if (r.defendCasts > 0) modeUse = bump(modeUse, shop.deck.defendMode, r.defendCasts);
  return {
    ...stats,
    divesCleared: stats.divesCleared + (r.won ? 1 : 0),
    divesLost: stats.divesLost + (r.won ? 0 : 1),
    scans: stats.scans + r.scans,
    modeUse,
    lostTo: !r.won && customerId ? bump(stats.lostTo, customerId) : stats.lostTo,
  };
}

export function jobPayFor(shop: ShopState, tier: number, capWin: boolean): number {
  const pay = jobPay(tier);
  // Overtime Clause: the client eats more of a deadline overrun.
  const capRate = shop.deck.slotted.includes("overtimeClause") ? 0.75 : 0.5;
  return capWin ? Math.floor(pay * capRate) : pay;
}

/**
 * The next customer through the door. Deterministic per (shop, day, index):
 * the tier band opens with depth into the day and with the shop's repair
 * count, the profile is drawn from the band, and the intake quote rotates
 * with the profile's lifetime visit count (the twelve are regulars; they
 * come back).
 */
export function genCustomer(shop: ShopState, day: DayState): CounterCustomer {
  const rng = new Rng(mixSeed(shop.seed, shop.day, day.encounterIndex, 0x77));
  const band = tierBandFor(day.jobsResolved, shop.repairs.length);
  const tier = rollTier(rng, band);
  const avoid = new Set<string>();
  if (day.ticket) avoid.add(day.ticket.customerId);
  if (day.lastResult) avoid.add(day.lastResult.customerId);
  let pool = CUSTOMERS.filter((c) => c.tiers.includes(tier) && !avoid.has(c.id));
  if (pool.length === 0) pool = CUSTOMERS.filter((c) => c.tiers.includes(tier));
  if (pool.length === 0) pool = CUSTOMERS;
  const customer = pool[rng.int(pool.length)];
  const visit = (shop.visits[customer.id] ?? 0) + (day.arrivals[customer.id] ?? 0) + 1;
  return {
    customerId: customer.id,
    quoteIndex: ((visit - 1) % 2) as 0 | 1,
    tier,
    dominant: customer.dominant,
    kitSeed: mixSeed(shop.seed, shop.day, tier, day.encounterIndex),
    visit,
  };
}

function freshDay(shop: ShopState): DayState {
  return {
    phase: isSunday(shop.day) ? "sunday" : "morning",
    strain: shop.strain,
    pouch: [...shop.patchPouch],
    held: { ...EMPTY_HELD, boosts: [], attackModes: [], defendModes: [] },
    waiting: null,
    ticket: null,
    encounterIndex: 0,
    arrivals: {},
    jobsResolved: 0,
    jobsWon: 0,
    declined: 0,
    attemptedBackroom: false,
    lastResult: null,
    lastRegen: 0,
  };
}

/** Prune the slotted list to boosts that still exist after a bank or bust. */
function pruneSlotted(deck: ShopState["deck"], owned: AugmentId[]): AugmentId[] {
  return deck.slotted.filter((id) => owned.includes(id));
}

export function dayReducer(state: GameState, action: DayAction): GameState {
  const { meta, shop, day } = state;
  switch (action.type) {
    case "hydrate":
      return { meta: action.meta, shop: action.shop, day: action.day };

    // Teaching is meta, not day state: a mechanic explained once stays
    // explained.
    case "taught": {
      if (meta.taught.includes(action.id)) return state;
      return { ...state, meta: { ...meta, taught: [...meta.taught, action.id] } };
    }

    case "toggleSound":
      return { ...state, meta: { ...meta, sound: !meta.sound } };

    case "toggleMusic":
      return { ...state, meta: { ...meta, music: !meta.music } };

    case "newGame": {
      const newShop: ShopState = {
        seed: action.seed >>> 0,
        day: 1,
        credits: 0,
        salvage: 0,
        strain: START_STRAIN,
        patchPouch: [],
        deck: baseDeck(),
        repairs: [],
        artifactsRead: [],
        sectorsFound: [],
        visits: {},
        darkBuys: 0,
        lastDarkBuy: null,
        attempts: 0,
        sundayScenes: 0,
      };
      const newDay: DayState = { ...freshDay(newShop), phase: "tutIntro" };
      return { meta, shop: newShop, day: newDay };
    }

    case "storyDone": {
      if (!shop || !day) return state;
      if (day.phase === "tutIntro") return { ...state, day: { ...day, phase: "tutorial" } };
      if (day.phase === "tutOutro") return { ...state, day: { ...day, phase: "morning" } };
      if (day.phase === "morning") return { ...state, day: { ...day, phase: "open" } };
      if (day.phase === "finaleWin") return { ...state, day: { ...day, phase: "sunday" } };
      return state;
    }

    case "tutorialDone": {
      if (!shop || !day || day.phase !== "tutorial") return state;
      // The machine graded him and shut the door. No damage, either signal.
      return {
        ...state,
        shop: { ...shop, attempts: 1 },
        day: { ...day, phase: "tutOutro", strain: START_STRAIN },
      };
    }

    case "sundaySceneDone": {
      if (!shop || !day || day.phase !== "sunday") return state;
      return { ...state, shop: { ...shop, sundayScenes: shop.sundayScenes + 1 } };
    }

    case "customerArrived": {
      if (!shop || !day || day.phase !== "open") return state;
      // One person at a time, face to face. The next walks in only after
      // this one has been taken or turned away and the ticket resolved.
      if (day.waiting || day.ticket) return state;
      const waiting = genCustomer(shop, day);
      return {
        ...state,
        day: {
          ...day,
          waiting,
          encounterIndex: day.encounterIndex + 1,
          arrivals: bump(day.arrivals, waiting.customerId),
        },
      };
    }

    case "acceptJob": {
      if (!shop || !day || day.phase !== "open" || !day.waiting) return state;
      return { ...state, day: { ...day, ticket: day.waiting, waiting: null } };
    }

    case "declineJob": {
      if (!shop || !day || day.phase !== "open" || !day.waiting) return state;
      // No penalty. The decision to decline is the counter's whole verb.
      return { ...state, day: { ...day, waiting: null, declined: day.declined + 1 } };
    }

    case "startDive": {
      if (!shop || !day || day.phase !== "open" || !day.ticket) return state;
      return { ...state, day: { ...day, phase: "duel" } };
    }

    case "attemptBackroom": {
      if (!shop || !day || day.phase !== "sunday" || day.attemptedBackroom) return state;
      return {
        ...state,
        shop: { ...shop, attempts: shop.attempts + 1 },
        day: { ...day, phase: "duel", attemptedBackroom: true },
      };
    }

    case "duelFinished": {
      if (!shop || !day) return state;

      // The scripted first dive at the tower. Losing it is the lesson.
      if (day.phase === "tutorial") {
        return {
          ...state,
          shop: { ...shop, attempts: Math.max(1, shop.attempts) },
          day: { ...day, phase: "tutOutro", strain: START_STRAIN },
        };
      }

      if (day.phase !== "duel") return state;

      // A Sunday attempt at the back room (no ticket on the spike).
      if (!day.ticket) {
        const stats = tallyDive(meta.stats, shop, null, action);
        if (action.won && !meta.machineOpened) {
          return {
            meta: {
              ...meta,
              machineOpened: true,
              stats: { ...stats, runsWon: stats.runsWon + 1 },
            },
            shop,
            day: { ...day, phase: "finaleWin" },
          };
        }
        // A loss resolves like any lost dive: the ticket already cost you,
        // and there is no ticket. Post-open spars land here too.
        return { meta: { ...meta, stats }, shop, day: { ...day, phase: "sunday" } };
      }

      // A customer job.
      const ticket = day.ticket;
      const stats = tallyDive(meta.stats, shop, ticket.customerId, action);

      if (!action.won) {
        // A loss bills no strain: the loss already costs the ticket. The
        // customer goes home with the machine still broken.
        return {
          meta: { ...meta, stats },
          shop,
          day: {
            ...day,
            phase: "open",
            ticket: null,
            pouch: [...action.pouchLeft],
            jobsResolved: day.jobsResolved + 1,
            lastResult: null,
          },
        };
      }

      const strain = Math.max(0, day.strain - action.chip);
      const draft = rollDraft(shop, day);
      const ticketPay = jobPayFor(shop, ticket.tier, action.capWin);
      const salvage = salvageFor(ticket.tier);
      // Clean Run's consolation: a trap-free win that only missed the
      // chip-zero payout by running to the cap still pays a little.
      const cleanRunBonus =
        action.capWin &&
        action.trapsFired === 0 &&
        action.chip !== 0 &&
        shop.deck.slotted.includes("cleanRun")
          ? 15
          : 0;
      const pay = ticketPay + cleanRunBonus;

      const cap = pouchCapFor(shop.repairs);
      let pouch = [...action.pouchLeft];
      // Clean Run banks first (it was earned by play), then the job's drop
      // roll; each reports "capped" and discards when the pouch is full.
      const cleanRunFired = action.chip === 0 && shop.deck.slotted.includes("cleanRun");
      let cleanRun: DayResult["cleanRun"] = null;
      if (cleanRunFired) {
        if (pouch.length >= cap) {
          cleanRun = { status: "capped" };
        } else {
          const mask = rollPatchMask(
            new Rng(mixSeed(shop.seed, shop.day, day.jobsResolved, 0xc1ea)),
          );
          pouch = [...pouch, mask];
          cleanRun = { status: "banked", mask };
        }
      }
      const dropRng = new Rng(mixSeed(shop.seed, shop.day, day.jobsResolved, 0x9d0b));
      const dropChance =
        TIER_CONFIGS[Math.max(1, Math.min(5, ticket.tier))].patchDrop +
        PATCH_DROP_TIER_BONUS * (ticket.tier - 1);
      let patchDrop: DayResult["patchDrop"] = null;
      if (dropRng.next() < dropChance) {
        const mask = rollPatchMask(dropRng);
        if (pouch.length >= cap) {
          patchDrop = { status: "capped", mask };
        } else {
          pouch = [...pouch, mask];
          patchDrop = { status: "banked", mask };
        }
      }

      const result: DayResult = {
        won: true,
        chip: action.chip,
        pay,
        basePay: jobPay(ticket.tier),
        salvage,
        cleanRunBonus,
        cleanRun,
        patchDrop,
        capWin: action.capWin,
        overRotations: action.overRotations,
        trapsFired: action.trapsFired,
        redirectsTaken: action.redirectsTaken,
        pressureRounds: action.pressureRounds,
        customerId: ticket.customerId,
        tier: ticket.tier,
        draft,
        picked: null,
        rounds: action.rounds,
        trapRounds: action.trapRounds,
        parRounds: action.parRounds,
        log: action.log,
      };

      // Strain zero by any means loses the day, a bled-out win included.
      // The held column stays visible on the bust screen: the point is
      // seeing exactly what the wager cost.
      if (strain <= 0) {
        return {
          meta: { ...meta, stats: { ...stats, daysBusted: stats.daysBusted + 1 } },
          shop,
          day: {
            ...day,
            phase: "bust",
            strain: 0,
            ticket: null,
            jobsResolved: day.jobsResolved + 1,
            jobsWon: day.jobsWon + 1,
            lastResult: result,
          },
        };
      }

      return {
        meta: { ...meta, stats },
        shop,
        day: {
          ...day,
          phase: "result",
          strain,
          pouch,
          ticket: null,
          jobsResolved: day.jobsResolved + 1,
          jobsWon: day.jobsWon + 1,
          held: {
            ...day.held,
            credits: day.held.credits + pay,
            salvage: day.held.salvage + salvage,
          },
          lastResult: result,
        },
      };
    }

    case "pickAugment": {
      if (!shop || !day || day.phase !== "result" || !day.lastResult) return state;
      if (day.lastResult.picked) return state;
      if (!day.lastResult.draft.includes(action.id)) return state;
      const def = AUGMENTS.find((a) => a.id === action.id);
      if (!def || ownsAugment(shop, day, action.id)) return state;
      const held = { ...day.held };
      let deck = shop.deck;
      if (def.attackMode) {
        held.attackModes = [...held.attackModes, def.attackMode];
      } else if (def.defendMode) {
        held.defendModes = [...held.defendModes, def.defendMode];
      } else {
        held.boosts = [...held.boosts, action.id];
        // Auto-slot into a free bay so the pick works tonight. A full deck
        // leaves it in the pool; slotting is LOADOUT.CFG's decision.
        if (deck.slotted.length < deck.slots) {
          deck = { ...deck, slotted: [...deck.slotted, action.id] };
        }
      }
      return {
        ...state,
        shop: deck === shop.deck ? shop : { ...shop, deck },
        day: { ...day, held, lastResult: { ...day.lastResult, picked: action.id } },
      };
    }

    case "resultNext": {
      if (!shop || !day || day.phase !== "result") return state;
      return { ...state, day: { ...day, phase: "open" } };
    }

    case "closeShop": {
      if (!shop || !day || day.phase !== "open") return state;
      // Going upstairs banks everything held. An unresolved ticket goes
      // home unfinished, no penalty: nothing forces the day to continue.
      const cap = pouchCapFor(shop.repairs);
      const ownedBoosts = [...shop.deck.ownedBoosts, ...day.held.boosts];
      const deck = {
        ...shop.deck,
        ownedBoosts,
        attackModes: [...new Set([...shop.deck.attackModes, ...day.held.attackModes])],
        defendModes: [...new Set([...shop.deck.defendModes, ...day.held.defendModes])],
        slotted: pruneSlotted(shop.deck, ownedBoosts),
      };
      let visits = shop.visits;
      for (const [id, n] of Object.entries(day.arrivals)) visits = bump(visits, id, n);
      return {
        meta: { ...meta, stats: { ...meta.stats, daysClosed: meta.stats.daysClosed + 1 } },
        shop: {
          ...shop,
          credits: shop.credits + day.held.credits,
          salvage: shop.salvage + day.held.salvage,
          patchPouch: day.pouch.slice(0, cap),
          deck,
          visits,
        },
        day: {
          ...day,
          phase: "evening",
          waiting: null,
          ticket: null,
          pouch: [],
          held: { ...EMPTY_HELD, boosts: [], attackModes: [], defendModes: [] },
        },
      };
    }

    case "sleep": {
      if (!shop || !day) return state;
      if (day.phase !== "evening" && day.phase !== "bust" && day.phase !== "sunday")
        return state;
      // On a busted day the held column was never banked and the shop layer
      // was never touched: the discard IS the loss. Sleep restores a little
      // either way; the evening was the half a bust actually forfeits.
      const strain = Math.min(100, day.strain + SLEEP_REGEN);
      const deck = {
        ...shop.deck,
        slotted: pruneSlotted(shop.deck, shop.deck.ownedBoosts),
      };
      const nextShop: ShopState = { ...shop, day: shop.day + 1, strain, deck };
      const nextDay: DayState = { ...freshDay(nextShop), lastRegen: strain - day.strain };
      return { meta, shop: nextShop, day: nextDay };
    }

    case "buyRepair": {
      if (!shop || !day) return state;
      if (day.phase !== "evening" && day.phase !== "sunday") return state;
      const def = REPAIR_BY_ID[action.id];
      if (!def || shop.repairs.includes(action.id)) return state;
      if (def.stageAfter && !shop.repairs.includes(def.stageAfter)) return state;
      if (shop.credits < def.cost) return state;
      return {
        ...state,
        shop: {
          ...shop,
          credits: shop.credits - def.cost,
          repairs: [...shop.repairs, action.id],
          sectorsFound:
            def.sector && !shop.sectorsFound.includes(def.sector)
              ? [...shop.sectorsFound, def.sector]
              : shop.sectorsFound,
        },
      };
    }

    case "buyDeck": {
      if (!shop || !day) return state;
      if (day.phase !== "evening" && day.phase !== "sunday") return state;
      const cost = deckCost(shop, action.kind);
      if (cost === null || shop.salvage < cost) return state;
      const deck = { ...shop.deck };
      if (action.kind === "ram") deck.ramPerTurn += 1;
      else if (action.kind === "slot") deck.slots += 1;
      else if (action.kind === "scanTier") deck.scanTier = (deck.scanTier + 1) as 1 | 2 | 3;
      else if (action.kind === "attackTier") deck.attackTier = (deck.attackTier + 1) as 1 | 2 | 3;
      else deck.defendTier = (deck.defendTier + 1) as 1 | 2 | 3;
      return { ...state, shop: { ...shop, salvage: shop.salvage - cost, deck } };
    }

    case "buyPatchHeal": {
      if (!shop || !day) return state;
      if (day.phase !== "evening" && day.phase !== "sunday") return state;
      if (shop.credits < NIGHT_PATCH_COST || day.strain >= 100) return state;
      return {
        ...state,
        shop: { ...shop, credits: shop.credits - NIGHT_PATCH_COST },
        day: { ...day, strain: Math.min(100, day.strain + PATCH_HEAL) },
      };
    }

    case "buyDarkPull": {
      // Evening only: the dealer answers after the shop closes, and only
      // through Dad's repaired onion router.
      if (!shop || !day || day.phase !== "evening") return state;
      if (!shop.repairs.includes("onionRouter")) return state;
      const cost = darkPullPrice(shop);
      const cap = pouchCapFor(shop.repairs);
      if (shop.credits < cost || shop.patchPouch.length >= cap) return state;
      // Each buy is its own deterministic stream, salted by the lifetime
      // purchase count: reload and reroll land the same piece.
      const mask = rollPatchMask(new Rng(mixSeed(shop.seed, shop.day, shop.darkBuys, 0xd47b)));
      return {
        ...state,
        shop: {
          ...shop,
          credits: shop.credits - cost,
          darkBuys: shop.darkBuys + 1,
          patchPouch: [...shop.patchPouch, mask],
          lastDarkBuy: mask,
        },
      };
    }

    case "weldPieces": {
      // Welding needs the solder bay repaired. During an open day it works
      // the day pouch; in the evening it works the banked pouch. Free: the
      // weld costs the two pieces themselves.
      if (!shop || !day) return state;
      if (!shop.repairs.includes("solderBay")) return state;
      if (day.phase === "duel" || day.phase === "tutorial") return state;
      if (action.a === action.b) return state;
      const evening = day.phase === "evening" || day.phase === "sunday";
      const pool = evening ? shop.patchPouch : day.pouch;
      const ma = pool[action.a];
      const mb = pool[action.b];
      if (ma === undefined || mb === undefined) return state;
      const crafted = armUnionCraft(ma, mb);
      if (crafted === null) return state;
      const next = pool.filter((_, i) => i !== action.a && i !== action.b);
      next.push(crafted);
      if (evening) return { ...state, shop: { ...shop, patchPouch: next } };
      return { ...state, day: { ...day, pouch: next } };
    }

    case "readArtifact": {
      if (!shop) return state;
      if (shop.artifactsRead.includes(action.id)) return state;
      return { ...state, shop: { ...shop, artifactsRead: [...shop.artifactsRead, action.id] } };
    }

    case "setAttackMode": {
      if (!shop || !day || day.phase === "duel" || day.phase === "tutorial") return state;
      if (!ownedAttackModes(shop, day).includes(action.mode)) return state;
      return { ...state, shop: { ...shop, deck: { ...shop.deck, attackMode: action.mode } } };
    }

    case "setDefendMode": {
      if (!shop || !day || day.phase === "duel" || day.phase === "tutorial") return state;
      if (!ownedDefendModes(shop, day).includes(action.mode)) return state;
      return { ...state, shop: { ...shop, deck: { ...shop.deck, defendMode: action.mode } } };
    }

    case "slotBoost": {
      if (!shop || !day || day.phase === "duel" || day.phase === "tutorial") return state;
      const deck = shop.deck;
      if (deck.slotted.includes(action.id)) return state;
      if (deck.slotted.length >= deck.slots) return state;
      if (!ownedBoostsNow(shop, day).includes(action.id)) return state;
      return {
        ...state,
        shop: { ...shop, deck: { ...deck, slotted: [...deck.slotted, action.id] } },
      };
    }

    case "unslotBoost": {
      if (!shop || !day || day.phase === "duel" || day.phase === "tutorial") return state;
      const deck = shop.deck;
      if (!deck.slotted.includes(action.id)) return state;
      return {
        ...state,
        shop: {
          ...shop,
          deck: { ...deck, slotted: deck.slotted.filter((id) => id !== action.id) },
        },
      };
    }
  }
}

// Weld pricing note: CRAFT_COST survives in patch-cells for the solder
// window's copy, but the weld itself is free under the day-as-run economy.
export { CRAFT_COST };
