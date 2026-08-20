/**
 * End-to-end day-layer harness. Not imported by app code.
 * Run from app/: bun run src/game/dev/run-sim.ts
 *
 * Drives the FULL game loop through the real reducers exactly as the UI
 * would: hydration, the first boot at the tower, open days of face-to-face
 * intake and dives, closing, the evening economy, Sundays and back room
 * attempts. Asserts state-machine invariants at every step, including the
 * one property the day-as-run design invents and cannot ship without:
 *
 *   A BUSTED DAY LEAVES THE SHOP LAYER UNTOUCHED.
 *
 * Strain zero costs the held column and the evening, and nothing else.
 */

import { CUSTOMERS } from "../content/customers";
import { AUGMENTS, MODE_TELL } from "../content/kit";
import { REPAIRS, pouchCapFor } from "../content/repairs";
import { backroomConfig, tierDuelConfig, tutorialConfig, tierBandFor } from "../content/tiers";
import {
  DayAction,
  GameState,
  darkPullPrice,
  dayReducer,
  deckCost,
  genCustomer,
  ownsAugment,
} from "../day-reducer";
import { endPlayerTurn } from "../duel-actions";
import { goalLive } from "../duel-power";
import { createDuel, mixSeed } from "../duel-setup";
import { BASE_KIT, DuelState, isJunction } from "../duel-types";
import { botPlayTurn, oppStep } from "../opponent";
import { armUnionCraft, isPatchMask } from "../patch-cells";
import { EMPTY_META, ShopState, duelKitOf, isSunday, weekdayName } from "../save";
import { kittedPlayTurn } from "./kitted-bot";

let dispatchCount = 0;

function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`INVARIANT: ${msg} (after ${dispatchCount} dispatches)`);
}

function d(state: GameState, action: DayAction): GameState {
  dispatchCount++;
  return dayReducer(state, action);
}

/** The shop-layer fields a working day must never touch. */
function progressionSnapshot(shop: ShopState): string {
  return JSON.stringify({
    day: shop.day,
    credits: shop.credits,
    salvage: shop.salvage,
    patchPouch: shop.patchPouch,
    repairs: shop.repairs,
    darkBuys: shop.darkBuys,
    visits: shop.visits,
    deck: {
      ramPerTurn: shop.deck.ramPerTurn,
      scanTier: shop.deck.scanTier,
      attackTier: shop.deck.attackTier,
      defendTier: shop.deck.defendTier,
      slots: shop.deck.slots,
      ownedBoosts: shop.deck.ownedBoosts,
      attackModes: shop.deck.attackModes,
      defendModes: shop.deck.defendModes,
    },
  });
}

function playDuelToEnd(duel: DuelState, kitted: boolean): {
  won: boolean;
  chip: number;
  capWin: boolean;
  overRotations: number;
  trapsFired: number;
  redirectsTaken: number;
  pressureRounds: number;
} {
  let guard = 0;
  while (duel.phase === "playing" && guard++ < 4000) {
    if (duel.turn === "player") {
      if (kitted) kittedPlayTurn(duel);
      else botPlayTurn(duel, "player", 0.95);
      if (duel.phase === "playing" && duel.turn === "player") endPlayerTurn(duel);
    } else {
      oppStep(duel);
    }
  }
  must(duel.phase !== "playing", "duel terminated");
  must(duel.winKind !== null, "finished duel records how it ended");
  must(
    duel.endReason !== null && duel.endReason.length > 0,
    `finished duel (${duel.winKind}) carries a player-facing reason`,
  );
  if (duel.winKind === "goal") {
    const winner = duel.phase === "won" ? "player" : "opp";
    must(goalLive(duel.boards[winner]), "a goal verdict means the winner's goal is lit");
    must(
      !goalLive(duel.boards[winner === "player" ? "opp" : "player"]),
      "only one side's goal is lit at the end",
    );
  }
  for (const side of ["player", "opp"] as const) {
    const b = duel.boards[side];
    must(
      b.power.every((live, i) => !live || !isJunction(b.cells[i]) || b.cells[i].built),
      `${side}: every live node is built`,
    );
  }
  return {
    won: duel.phase === "won",
    chip: duel.strainChip,
    capWin: duel.winKind === "cap",
    overRotations: Math.max(0, duel.econ.player.rotations - duel.par),
    trapsFired: duel.econ.player.trapsFired,
    redirectsTaken: duel.econ.player.redirectsTaken,
    pressureRounds: duel.pressureRounds,
  };
}

/** Synthetic dive verdict for machine-level tests: fast and exact. */
function syntheticVerdict(s: GameState, won: boolean, chip: number) {
  return {
    type: "duelFinished" as const,
    won,
    chip,
    capWin: false,
    pouchLeft: [...s.day!.pouch],
    overRotations: 0,
    trapsFired: 0,
    redirectsTaken: 0,
    pressureRounds: 0,
    scans: 1,
    attackCasts: 1,
    defendCasts: 0,
  };
}

/** Take one job through a REAL dive; returns whether it was won. */
function realDive(sRef: { s: GameState }): boolean {
  const { s } = sRef;
  const shop = s.shop!;
  const day = s.day!;
  const ticket = day.ticket!;
  must(!!MODE_TELL[ticket.dominant], "analyze tell exists");
  must(CUSTOMERS.some((c) => c.id === ticket.customerId), "customer exists");
  const duel = createDuel(
    tierDuelConfig(ticket.tier, ticket.dominant, ticket.kitSeed),
    mixSeed(shop.seed, shop.day, day.jobsResolved),
    duelKitOf(shop, day),
    shop.deck.ramPerTurn,
  );
  must(duel.par > 0, "par computed for every dive");
  const res = playDuelToEnd(duel, true);
  const pouchLeft = duel.patchPouch;
  {
    // The dive can only SPEND pieces: what is left is a sub-multiset of
    // what went in.
    const before = [...day.pouch];
    for (const m of pouchLeft) {
      const at = before.indexOf(m);
      must(at !== -1, "dive never mints pieces");
      before.splice(at, 1);
    }
  }
  const strainBefore = day.strain;
  const heldBefore = day.held.credits;
  sRef.s = d(s, {
    type: "duelFinished",
    won: res.won,
    chip: res.chip,
    capWin: res.capWin,
    pouchLeft,
    overRotations: res.overRotations,
    trapsFired: res.trapsFired,
    redirectsTaken: res.redirectsTaken,
    pressureRounds: res.pressureRounds,
    scans: duel.econ.player.scansCast,
    attackCasts: duel.econ.player.attacksCast,
    defendCasts: duel.econ.player.defendsCast,
  });
  const after = sRef.s;
  if (res.won && after.day!.phase === "result") {
    const lr = after.day!.lastResult!;
    must(lr.won, "result records the win");
    must(after.day!.strain <= strainBefore, "strain never rises on a win");
    must(after.day!.held.credits === heldBefore + lr.pay, "the pay is HELD, not banked");
    const banked: number[] = [];
    if (lr.cleanRun?.status === "banked") banked.push(lr.cleanRun.mask);
    if (lr.patchDrop?.status === "banked") banked.push(lr.patchDrop.mask);
    must(
      after.day!.pouch.length === pouchLeft.length + banked.length,
      "day pouch is dive leftovers plus banked channels exactly",
    );
    must(after.day!.pouch.every(isPatchMask), "every held piece is a valid mask");
    const draft = lr.draft;
    must(new Set(draft).size === draft.length, "draft never repeats a card");
    for (const id of draft) {
      const def = AUGMENTS.find((a) => a.id === id);
      must(!!def, "draft ids exist");
      must(!ownsAugment(after.shop!, after.day!, id), "draft never offers owned augments");
    }
  }
  if (!res.won) {
    must(
      after.day!.phase === "open" || after.day!.phase === "bust",
      "a loss returns to the floor",
    );
    if (after.day!.phase === "open") {
      must(after.day!.strain === strainBefore, "a loss bills no strain");
      must(after.day!.ticket === null, "the failed ticket goes home");
    }
  }
  return res.won;
}

/** Play one full working day; returns true if it busted. */
function playWorkingDay(
  sRef: { s: GameState },
  opts: { jobs: number; forceBust: boolean; real: boolean; buyEverything: boolean },
): boolean {
  let s = sRef.s;
  must(s.day!.phase === "morning", "working day opens on the morning line");
  s = d(s, { type: "storyDone" });
  must(s.day!.phase === "open", "the shop opens");
  sRef.s = s;

  let busted = false;
  for (let j = 0; j < opts.jobs && !busted; j++) {
    s = sRef.s;
    const shop = s.shop!;
    const day = s.day!;
    // Determinism: the same state generates the same customer.
    const a = genCustomer(shop, day);
    const b = genCustomer(shop, day);
    must(JSON.stringify(a) === JSON.stringify(b), "customer generation is deterministic");
    const band = tierBandFor(day.jobsResolved, shop.repairs.length);
    s = d(s, { type: "customerArrived" });
    must(s.day!.waiting !== null, "a customer walked in");
    const w = s.day!.waiting!;
    must(w.tier >= band[0] && w.tier <= band[1], "arrival tier inside the band");
    must(w.tier >= 1 && w.tier <= 5, "tier in range");
    // Decline path exercised on every third arrival.
    if (j % 3 === 2) {
      const declined = s.day!.declined;
      s = d(s, { type: "declineJob" });
      must(s.day!.waiting === null, "declined customer leaves");
      must(s.day!.declined === declined + 1, "decline counted");
      must(s.day!.ticket === null, "no ticket from a decline");
      s = d(s, { type: "customerArrived" });
      must(s.day!.waiting !== null, "the next customer arrives after a decline");
    }
    s = d(s, { type: "acceptJob" });
    must(s.day!.ticket !== null, "accepted job is on the spike");
    must(s.day!.waiting === null, "the counter clears on accept");
    s = d(s, { type: "startDive" });
    must(s.day!.phase === "duel", "the dive takes the screen");
    sRef.s = s;

    if (opts.forceBust && j === opts.jobs - 1) {
      sRef.s = d(sRef.s, syntheticVerdict(sRef.s, true, 999));
      must(sRef.s.day!.phase === "bust", "strain zero loses the day");
      must(sRef.s.day!.strain === 0, "bust zeroes strain");
      busted = true;
    } else if (opts.real) {
      const won = realDive(sRef);
      if (sRef.s.day!.phase === "bust") {
        busted = true;
      } else if (won && sRef.s.day!.phase === "result") {
        const draft = sRef.s.day!.lastResult!.draft;
        if (draft.length > 0) {
          const pick = draft[j % draft.length];
          const before = sRef.s;
          sRef.s = d(sRef.s, { type: "pickAugment", id: pick });
          must(ownsAugment(sRef.s.shop!, sRef.s.day!, pick), "picked augment owned (held)");
          must(
            progressionSnapshot(before.shop!) === progressionSnapshot(sRef.s.shop!),
            "picking an augment never touches shop progression",
          );
        }
        sRef.s = d(sRef.s, { type: "resultNext" });
        must((sRef.s.day!.phase as string) === "open", "back to the floor after the result");
      }
    } else {
      const won = j % 2 === 0;
      sRef.s = d(sRef.s, syntheticVerdict(sRef.s, won, won ? 6 : 0));
      if (sRef.s.day!.phase === "bust") {
        // Chips accumulate across days; a thin morning can genuinely bust.
        busted = true;
      } else if (won) {
        must(sRef.s.day!.phase === "result", "result after a synthetic win");
        sRef.s = d(sRef.s, { type: "resultNext" });
      } else {
        must(sRef.s.day!.phase === "open", "floor after a synthetic loss");
      }
    }
  }

  if (busted) {
    // The evening is forfeit: nothing in it may execute.
    let sb = sRef.s;
    const snap = progressionSnapshot(sb.shop!);
    sb = d(sb, { type: "buyRepair", id: REPAIRS[0].id });
    sb = d(sb, { type: "buyPatchHeal" });
    sb = d(sb, { type: "buyDarkPull" });
    sb = d(sb, { type: "buyDeck", kind: "ram" });
    must(progressionSnapshot(sb.shop!) === snap, "a busted evening sells nothing");
    must(sb.day!.phase === "bust", "bust holds until sleep");
    sRef.s = sb;
    return true;
  }

  // Close: everything held banks, exactly.
  let sc = sRef.s;
  const held = sc.day!.held;
  const shopBefore = sc.shop!;
  const dayPouch = sc.day!.pouch;
  sc = d(sc, { type: "closeShop" });
  must(sc.day!.phase === "evening", "closing opens the evening");
  must(sc.shop!.credits === shopBefore.credits + held.credits, "held credits banked exactly");
  must(sc.shop!.salvage === shopBefore.salvage + held.salvage, "held salvage banked exactly");
  must(
    sc.shop!.patchPouch.length ===
      Math.min(dayPouch.length, pouchCapFor(shopBefore.repairs)),
    "day pouch banked to cap",
  );
  for (const id of held.boosts) {
    must(sc.shop!.deck.ownedBoosts.includes(id), "held boosts banked into the deck pool");
  }
  must(sc.day!.held.credits === 0, "the held column empties into the bank");

  if (opts.buyEverything) {
    // The evening economy: repairs, deck parts, patches, the darknet.
    for (const r of REPAIRS) {
      const before = sc.shop!;
      sc = d(sc, { type: "buyRepair", id: r.id });
      const bought = sc.shop!.repairs.includes(r.id) && !before.repairs.includes(r.id);
      if (bought) {
        must(sc.shop!.credits === before.credits - r.cost, "repair paid for exactly");
        must(
          !r.stageAfter || sc.shop!.repairs.includes(r.stageAfter),
          "staged repairs in order",
        );
      }
    }
    for (const kind of ["ram", "scanTier", "attackTier", "defendTier", "slot"] as const) {
      const before = sc.shop!;
      const cost = deckCost(before, kind);
      sc = d(sc, { type: "buyDeck", kind });
      if (cost !== null && before.salvage >= cost) {
        must(sc.shop!.salvage === before.salvage - cost, "deck part paid in salvage");
      } else {
        must(sc.shop!.salvage === before.salvage, "no deck part past the ceiling");
      }
    }
    must(sc.shop!.deck.ramPerTurn <= 9, "RAM capped");
    must(sc.shop!.deck.slots <= 5, "bays capped");
    {
      const before = sc.shop!;
      const strainBefore = sc.day!.strain;
      sc = d(sc, { type: "buyPatchHeal" });
      if (before.credits >= 60 && strainBefore < 100) {
        must(sc.day!.strain === Math.min(100, strainBefore + 12), "night patch heals 12");
        must(sc.shop!.credits === before.credits - 60, "night patch paid for");
      }
    }
    {
      const before = sc.shop!;
      const cost = darkPullPrice(before);
      sc = d(sc, { type: "buyDarkPull" });
      if (
        before.repairs.includes("onionRouter") &&
        before.credits >= cost &&
        before.patchPouch.length < pouchCapFor(before.repairs)
      ) {
        must(sc.shop!.patchPouch.length === before.patchPouch.length + 1, "dark pull banked");
        must(isPatchMask(sc.shop!.patchPouch[before.patchPouch.length]), "dark pull is a valid piece");
        must(sc.shop!.credits === before.credits - cost, "dark pull paid for");
      } else {
        must(sc.shop!.patchPouch.length === before.patchPouch.length, "no pull without the router");
      }
    }
    {
      // Weld the first legal pair in the banked pouch, if any.
      const pouch = sc.shop!.patchPouch;
      outer: for (let i = 0; i < pouch.length; i++) {
        for (let j = i + 1; j < pouch.length; j++) {
          const union = armUnionCraft(pouch[i], pouch[j]);
          if (union === null) continue;
          const before = sc.shop!;
          sc = d(sc, { type: "weldPieces", a: i, b: j });
          if (before.repairs.includes("solderBay")) {
            must(sc.shop!.patchPouch.length === before.patchPouch.length - 1, "weld joins two into one");
            must(sc.shop!.patchPouch.includes(union), "weld is the union of its inputs");
            must(sc.shop!.credits === before.credits, "the weld is free");
          } else {
            must(sc.shop!.patchPouch.length === before.patchPouch.length, "no weld without the bay");
          }
          break outer;
        }
      }
    }
  }

  sRef.s = sc;
  return false;
}

function playSunday(sRef: { s: GameState }, attempt: boolean, winIt: boolean): void {
  let s = sRef.s;
  must(s.day!.phase === "sunday", "Sunday phase on the seventh day");
  must(isSunday(s.shop!.day), "the calendar agrees it is Sunday");
  // No customers on Sunday: the arrival machine refuses structurally.
  const before = s.day!;
  s = d(s, { type: "customerArrived" });
  must(s.day!.encounterIndex === before.encounterIndex, "no customers arrive on Sunday");
  if (attempt) {
    const attemptsBefore = s.shop!.attempts;
    s = d(s, { type: "attemptBackroom" });
    must(s.day!.phase === "duel", "the tower accepts the attempt");
    must(s.shop!.attempts === attemptsBefore + 1, "the attempt is counted");
    if (winIt) {
      s = d(s, syntheticVerdict(s, true, 0));
      must(s.day!.phase === "finaleWin" || s.day!.phase === "sunday", "win or spar resolves");
      if (s.day!.phase === "finaleWin") {
        must(s.meta.machineOpened, "the machine opens on a fair win");
        s = d(s, { type: "storyDone" });
        must((s.day!.phase as string) === "sunday", "the game continues after the win");
      }
    } else {
      // Play the real backroom config so the hardest board is exercised.
      const duel = createDuel(
        backroomConfig(),
        mixSeed(s.shop!.seed, s.shop!.day, 99),
        duelKitOf(s.shop!, s.day!),
        s.shop!.deck.ramPerTurn,
      );
      const res = playDuelToEnd(duel, true);
      s = d(s, {
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        pouchLeft: duel.patchPouch,
        overRotations: res.overRotations,
        trapsFired: res.trapsFired,
        redirectsTaken: res.redirectsTaken,
        pressureRounds: res.pressureRounds,
        scans: duel.econ.player.scansCast,
        attackCasts: duel.econ.player.attacksCast,
        defendCasts: duel.econ.player.defendsCast,
      });
      if (s.day!.phase === "finaleWin") {
        must(s.meta.machineOpened, "machine opened");
        s = d(s, { type: "storyDone" });
      }
      must(s.day!.phase === "sunday", "a lost attempt returns to the quiet shop");
      const again = d(s, { type: "attemptBackroom" });
      must(again.day!.phase === "sunday", "one attempt per Sunday");
      s = again;
    }
  }
  sRef.s = s;
}

function sleepAndAdvance(sRef: { s: GameState }): void {
  const before = sRef.s;
  const dayBefore = before.shop!.day;
  const strainBefore = before.day!.strain;
  sRef.s = d(before, { type: "sleep" });
  const s = sRef.s;
  must(s.shop!.day === dayBefore + 1, "sleep advances the calendar");
  must(s.shop!.strain === Math.min(100, strainBefore + 10), "sleep restores 10 strain");
  must(s.day!.strain === s.shop!.strain, "the new day wakes at the carried strain");
  must(
    s.day!.phase === (isSunday(s.shop!.day) ? "sunday" : "morning"),
    "the week has a shape: six working days, then Sunday",
  );
  must(
    JSON.stringify(s.day!.pouch) === JSON.stringify(s.shop!.patchPouch),
    "the day pouch opens as a copy of the bank",
  );
  must(s.day!.held.credits === 0 && s.day!.held.salvage === 0, "nothing is held at dawn");
  must(s.day!.ticket === null && s.day!.waiting === null, "the counter opens clear");
  for (const id of s.shop!.deck.slotted) {
    must(s.shop!.deck.ownedBoosts.includes(id), "slotted boosts all owned after sleep");
  }
}

/* ------------------------------------------------------------------ */

if (import.meta.main) {
  // --- First boot: the tower, the grade, the shut door. -------------
  let state: GameState = { meta: { ...EMPTY_META }, shop: null, day: null };
  state = d(state, { type: "hydrate", meta: { ...EMPTY_META }, shop: null, day: null });
  state = d(state, { type: "newGame", seed: 0xbeef });
  must(state.shop !== null && state.day !== null, "a new game builds both layers");
  must(state.day!.phase === "tutIntro", "first boot opens at the tower");
  state = d(state, { type: "storyDone" });
  must(state.day!.phase === "tutorial", "the scripted dive follows the intro");
  {
    const t = createDuel(tutorialConfig(), mixSeed(state.shop!.seed, 0, 0), BASE_KIT, 5);
    const res = playDuelToEnd(t, false);
    must(!res.won, "the tutorial is unwinnable");
  }
  state = d(state, { type: "tutorialDone" });
  must(state.day!.phase === "tutOutro", "the door shuts");
  must(state.shop!.attempts === 1, "the first boot counts as attempt one");
  must(state.day!.strain === 100, "the grade bills nothing");
  state = d(state, { type: "storyDone" });
  must(state.day!.phase === "morning", "the shop opens anyway");
  must(weekdayName(state.shop!.day) === "MON", "the calendar starts on a Monday");

  const sRef = { s: state };

  // --- Week one: real dives, close every day, buy the shop back. ----
  let busts = 0;
  let realWins = 0;
  for (let dayN = 1; dayN <= 6; dayN++) {
    const bust = playWorkingDay(sRef, {
      jobs: 2 + (dayN % 2),
      forceBust: false,
      real: true,
      buyEverything: true,
    });
    if (bust) busts++;
    else realWins += sRef.s.shop ? 1 : 0;
    sleepAndAdvance(sRef);
  }
  playSunday(sRef, true, false);
  sleepAndAdvance(sRef);

  // --- The bust property, exercised on a fresh Monday. --------------
  {
    const snap = progressionSnapshot(sRef.s.shop!);
    const bust = playWorkingDay(sRef, {
      jobs: 3,
      forceBust: true,
      real: false,
      buyEverything: false,
    });
    must(bust, "the forced bust busts");
    must(
      progressionSnapshot(sRef.s.shop!) === snap,
      "A BUSTED DAY LEAVES THE SHOP LAYER UNTOUCHED",
    );
    const dayBefore = sRef.s.shop!.day;
    sleepAndAdvance(sRef);
    must(sRef.s.shop!.day === dayBefore + 1, "tomorrow opens normally");
    const after = JSON.parse(progressionSnapshot(sRef.s.shop!));
    const before = JSON.parse(snap);
    before.day = after.day; // the calendar is the one thing that moved
    must(JSON.stringify(before) === JSON.stringify(after), "banked survives the bust, exactly");
    must(sRef.s.meta.stats.daysBusted >= 1, "the bust is tallied");
  }

  // --- Grind to a full catalog and a rich shop (synthetic, fast). ---
  for (let week = 0; week < 6; week++) {
    for (let wd = 0; wd < 6; wd++) {
      if (sRef.s.day!.phase !== "morning") break;
      playWorkingDay(sRef, { jobs: 3, forceBust: false, real: false, buyEverything: true });
      sleepAndAdvance(sRef);
    }
    if (sRef.s.day!.phase === "sunday") {
      playSunday(sRef, week === 5, week === 5);
      sleepAndAdvance(sRef);
    }
  }
  must(sRef.s.meta.machineOpened, "the machine opened on the scripted win");
  must(sRef.s.shop!.repairs.length === REPAIRS.length, "every repair is eventually buyable");
  must(sRef.s.shop!.deck.ramPerTurn === 9, "the deck reaches full RAM");
  must(sRef.s.shop!.deck.slots === 5, "the deck reaches full bays");

  // --- Post-win: the game keeps going. -------------------------------
  playWorkingDay(sRef, { jobs: 2, forceBust: false, real: true, buyEverything: false });
  sleepAndAdvance(sRef);

  console.log(
    `OK: ${dispatchCount} dispatches, day ${sRef.s.shop!.day}, ` +
      `credits ${sRef.s.shop!.credits}, salvage ${sRef.s.shop!.salvage}, ` +
      `repairs ${sRef.s.shop!.repairs.length}/${REPAIRS.length}, ` +
      `boosts ${sRef.s.shop!.deck.ownedBoosts.length}, ` +
      `busted ${sRef.s.meta.stats.daysBusted}, closed ${sRef.s.meta.stats.daysClosed}, ` +
      `machineOpened ${sRef.s.meta.machineOpened}`,
  );
}
