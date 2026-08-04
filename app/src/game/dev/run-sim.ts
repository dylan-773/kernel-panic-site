/**
 * End-to-end run-layer harness. Not imported by app code.
 * Run from app/: bun run src/game/dev/run-sim.ts
 *
 * Drives the FULL game loop through the real reducers exactly as the UI
 * would: meta hydration, run start, opener scene, tutorial, ten days of
 * pick-analyze-build-dive, augment drafts, upgrades, finale, story scenes
 * on run end. Asserts state-machine invariants at every step.
 */

import { dayDuelConfig, finaleConfig, tutorialConfig, FINAL_DAY } from "../content/arc";
import { CUSTOMERS } from "../content/customers";
import { AUGMENTS, MODE_TELL } from "../content/kit";
import {
  dayOpenScene,
  finaleWinScene,
  runEndScene,
  runOpenerScene,
  tutorialIntroScene,
  tutorialOutroScene,
  DAY_LINES,
} from "../content/story";
import { endPlayerTurn } from "../duel-actions";
import { createDuel, mixSeed } from "../duel-setup";
import { BASE_KIT, DuelState } from "../duel-types";
import { goalLive } from "../duel-power";
import { botPlayTurn, oppStep } from "../opponent";
import {
  DAY_REST_REGEN,
  GameState,
  darkPullPrice,
  ownsAugment,
  runReducer,
  RunAction,
  slotCost,
} from "../run-reducer";
import { PATCH_POUCH_MAX, armUnionCraft, isPatchMask } from "../patch-cells";
import { duelKitOf, EMPTY_META } from "../save";

let dispatchCount = 0;

function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`INVARIANT: ${msg} (after ${dispatchCount} dispatches)`);
}

function d(state: GameState, action: RunAction): GameState {
  dispatchCount++;
  return runReducer(state, action);
}

function playDuelToEnd(duel: DuelState): {
  won: boolean;
  chip: number;
  capWin: boolean;
  gridlockWin: boolean;
  overRotations: number;
  trapsFired: number;
  redirectsTaken: number;
  pressureRounds: number;
} {
  let guard = 0;
  while (duel.phase === "playing" && guard++ < 4000) {
    if (duel.turn === "player") {
      botPlayTurn(duel, "player", 0.95);
      if (duel.phase === "playing" && duel.turn === "player") endPlayerTurn(duel);
    } else {
      oppStep(duel);
    }
  }
  must(duel.phase !== "playing", "duel terminated");
  // Every ending has to be nameable.
  must(duel.winKind !== null, "finished duel records how it ended");
  must(
    duel.endReason !== null && duel.endReason.length > 0,
    `finished duel (${duel.winKind}) carries a player-facing reason`,
  );
  // Split-board invariants: a "goal" verdict means the winner's own signal is
  // actually reaching their own goal column, and the loser's is not. This is
  // the check that would catch a settle crediting the wrong board.
  if (duel.winKind === "goal") {
    const winner = duel.phase === "won" ? "player" : "opp";
    must(goalLive(duel.boards[winner]), "a goal verdict means the winner's goal is lit");
    must(
      !goalLive(duel.boards[winner === "player" ? "opp" : "player"]),
      "only one side's goal is lit at the end",
    );
  }
  // BUILT is permanent: nothing in a dive may un-build a node.
  for (const side of ["player", "opp"] as const) {
    const b = duel.boards[side];
    must(
      b.power.every((live, i) => !live || b.cells[i].kind !== "node" || b.cells[i].built),
      `${side}: every live node is built`,
    );
  }
  return {
    won: duel.phase === "won",
    chip: duel.strainChip,
    capWin: duel.winKind === "cap",
    gridlockWin: false,
    overRotations: Math.max(0, duel.econ.player.rotations - duel.par),
    trapsFired: duel.econ.player.trapsFired,
    redirectsTaken: duel.econ.player.redirectsTaken,
    pressureRounds: duel.pressureRounds,
  };
}

function playRun(runIndex: number, startMeta: GameState["meta"]): GameState {
  let s: GameState = { meta: startMeta, run: null };
  s = d(s, { type: "startRun", seed: mixSeed(0xabc, runIndex) });
  must(s.run !== null, "run started");
  must(s.run!.screen === "opener", "opener first");
  must(runOpenerScene(s.run!.runNumber).beats.length > 0, "opener scene has beats");

  s = d(s, { type: "storyDone" });
  if (s.run!.runNumber === 1) {
    must(s.run!.screen === "tutIntro", "run 1 goes to the tutorial intro");
    must(tutorialIntroScene().beats.length >= 2, "tutorial intro has beats");
    s = d(s, { type: "storyDone" });
    must(s.run!.screen === "tutorial", "tutorial after its intro");
    const t = createDuel(tutorialConfig(), mixSeed(s.run!.runSeed, 0, 0), BASE_KIT, s.run!.ramPerTurn);
    const res = playDuelToEnd(t);
    must(!res.won, "tutorial is unwinnable");
    s = d(s, { type: "tutorialDone" });
    must(s.run!.screen === "tutOutro", "tutorial outro after the seal");
    must(tutorialOutroScene().beats.length >= 2, "tutorial outro has beats");
    s = d(s, { type: "storyDone" });
  }
  must(s.run!.screen === "dayOpen", "morning scene before the board");
  must(dayOpenScene(s.run!.day).beats.length >= 2, "day-open scene has beats");
  s = d(s, { type: "storyDone" });
  must(s.run!.screen === "day", "day board reached");

  let guard = 0;
  let picks = 0;
  while (s.run && guard++ < 200) {
    const run = s.run;
    if (run.screen === "day") {
      const idx = run.jobsDone.findIndex((x) => !x);
      must(idx !== -1, "day board always has an open job");
      must(DAY_LINES.length >= 9, "day lines exist");
      s = d(s, { type: "pickJob", index: idx });
      must(s.run!.screen === "analyze", "analyze after pick");
      const job = s.run!.jobs[idx];
      must(!!MODE_TELL[job.dominant], "analyze tell exists");
      must(CUSTOMERS.some((c) => c.id === job.customerId), "customer exists");
      s = d(s, { type: "startDuel" });
      must(s.run!.screen === "duel", "dive launches straight from analyze");
      const duel = createDuel(
        dayDuelConfig(run.day, job.dominant, job.tier, job.kitSeed),
        mixSeed(run.runSeed, run.day, idx),
        duelKitOf(s.run!.kit, s.run!.patchPouch),
        s.run!.ramPerTurn,
      );
      must(duel.par > 0, "par computed for every dive");
      const res = playDuelToEnd(duel);
      const pouchLeft = duel.patchPouch;
      const strainBefore = s.run!.strain;
      const pouchBefore = s.run!.patchPouch;
      // The dive can only SPEND pieces: what is left is a sub-multiset of
      // what went in.
      {
        const before = [...pouchBefore];
        for (const m of pouchLeft) {
          const at = before.indexOf(m);
          must(at !== -1, "dive never mints pieces");
          before.splice(at, 1);
        }
      }
      s = d(s, {
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        gridlockWin: res.gridlockWin,
        pouchLeft,
        overRotations: res.overRotations,
        trapsFired: res.trapsFired,
        redirectsTaken: res.redirectsTaken,
        pressureRounds: res.pressureRounds,
        scans: duel.econ.player.scansCast,
        attackCasts: duel.econ.player.attacksCast,
        defendCasts: duel.econ.player.defendsCast,
      });
      if (res.won && s.run) {
        // Conservation at the run layer: end pouch = pouchLeft + banked
        // channels reported on the result, cap respected, all masks valid.
        const lr = s.run.lastResult!;
        const banked: number[] = [];
        if (lr.cleanRun?.status === "banked") banked.push(lr.cleanRun.mask);
        if (lr.patchDrop?.status === "banked") banked.push(lr.patchDrop.mask);
        must(
          s.run.patchPouch.length === pouchLeft.length + banked.length,
          "pouch is dive leftovers plus banked channels exactly",
        );
        must(s.run.patchPouch.length <= PATCH_POUCH_MAX, "pouch capped after banking");
        must(s.run.patchPouch.every(isPatchMask), "every held piece is a valid mask");
        if (lr.cleanRun?.status === "capped" || lr.patchDrop?.status === "capped") {
          must(pouchLeft.length + banked.length === PATCH_POUCH_MAX, "capped means the pouch was full");
        }
        must(
          !(res.chip === 0 && s.run.kit.augments.includes("cleanRun")) || lr.cleanRun !== null,
          "clean run always reports on a chip-zero win",
        );
      }
      if (!res.won) {
        must(s.run!.screen === "runEnd", "loss ends run");
        must(s.run!.strain === 0, "loss zeroes strain");
      } else {
        must(s.run!.strain <= strainBefore, "strain never rises on win");
        must(
          s.run!.screen === "result" || s.run!.screen === "runEnd",
          "result or bled-out end after win",
        );
        if (s.run!.screen === "result") {
          const draft = s.run!.lastResult!.draft;
          must(new Set(draft).size === draft.length, "draft never repeats a card");
          for (const id of draft) {
            const def = AUGMENTS.find((a) => a.id === id);
            must(!!def, "draft ids exist");
            must(!ownsAugment(s.run!.kit, id), "draft never offers owned augments");
            if (def?.requires?.kind === "augment") {
              must(ownsAugment(s.run!.kit, def.requires.id), "requires-gated cards only appear once their driver is owned");
            }
            if (def?.requires?.kind === "pouch") {
              must(s.run!.patchPouch.length > 0, "pouch-gated cards only appear while holding a piece");
            }
          }
          if (draft.length > 0) {
            const pick = draft[picks++ % draft.length];
            const def = AUGMENTS.find((a) => a.id === pick)!;
            const boosts = s.run!.kit.augments;
            const full = def.kind === "boost" && boosts.length >= s.run!.boostSlots;
            if (full) {
              const eject = boosts[0];
              s = d(s, { type: "pickAugment", id: pick, replace: eject });
              must(!s.run!.kit.augments.includes(eject), "swap ejects the named boost");
              must(s.run!.lastResult!.replaced === eject, "swap records the ejected boost");
            } else {
              s = d(s, { type: "pickAugment", id: pick });
            }
            must(ownsAugment(s.run!.kit, pick), "picked augment owned");
            must(s.run!.lastResult!.picked === pick, "pick recorded");
            must(
              s.run!.kit.augments.length <= s.run!.boostSlots || s.run!.boostSlots === 0,
              "boosts never exceed the bays",
            );
          }
        }
      }
    } else if (run.screen === "result") {
      const strainBefore = run.strain;
      s = d(s, { type: "resultNext" });
      if (s.run!.screen === "upgrade") {
        must(
          s.run!.strain === Math.min(100, strainBefore + DAY_REST_REGEN),
          "night rest restores strain",
        );
        must(s.run!.lastRegen === s.run!.strain - strainBefore, "lastRegen recorded");
      }
    } else if (run.screen === "dayOpen") {
      must(dayOpenScene(run.day).beats.length >= 2, "day-open scene has beats");
      s = d(s, { type: "storyDone" });
      must(
        s.run!.screen === (run.day === FINAL_DAY ? "finalePre" : "day"),
        "morning scene lands on the board",
      );
    } else if (run.screen === "upgrade") {
      // Exercise the shop: a blind darknet pull when affordable, then a
      // craft when a legal pair sits in the pouch, then close.
      const creditsBefore = run.credits;
      const pouchBefore = run.patchPouch.length;
      const pullCost = darkPullPrice(run);
      s = d(s, { type: "buyDarkPatch" });
      if (creditsBefore >= pullCost && pouchBefore < PATCH_POUCH_MAX) {
        must(s.run!.patchPouch.length === pouchBefore + 1, "dark patch bought");
        must(isPatchMask(s.run!.patchPouch[pouchBefore]), "dark patch is a valid piece");
        must(s.run!.credits === creditsBefore - pullCost, "dark patch paid for");
        must(s.run!.lastDarkBuy === s.run!.patchPouch[pouchBefore], "reveal shows the rolled piece");
      }
      must(s.run!.patchPouch.length <= PATCH_POUCH_MAX, "pouch capped");
      {
        // A bay when affordable: credits debit, cap respected.
        const slots = s.run!.boostSlots;
        const credits = s.run!.credits;
        const bayCost = slotCost(s.run!);
        s = d(s, { type: "buySlot" });
        if (bayCost !== null && credits >= bayCost) {
          must(s.run!.boostSlots === slots + 1, "bay installed");
          must(s.run!.credits === credits - bayCost, "bay paid for");
        } else {
          must(s.run!.boostSlots === slots, "no bay past the cap or without credits");
        }
        must(s.run!.boostSlots >= 3 && s.run!.boostSlots <= 5, "bays stay in range");
      }
      {
        // Craft the first legal pair, if any: two pieces become their union.
        const pouch = s.run!.patchPouch;
        outer: for (let i = 0; i < pouch.length; i++) {
          for (let j = i + 1; j < pouch.length; j++) {
            const union = armUnionCraft(pouch[i], pouch[j]);
            if (union === null) continue;
            const lenBefore = pouch.length;
            s = d(s, { type: "craftPatch", a: i, b: j });
            must(s.run!.patchPouch.length === lenBefore - 1, "craft turns two pieces into one");
            must(s.run!.patchPouch.includes(union), "crafted piece is the union of its inputs");
            break outer;
          }
        }
      }
      const strainBeforeClose = s.run!.strain;
      const cycle = ["ram", "scan", "attack", "defend"] as const;
      // The night is two steps now: picking must NOT end the day, so the
      // shop rows stay spendable after the upgrade is chosen.
      must(s.run!.nightPick === null, "night opens undecided");
      s = d(s, { type: "closeNight" });
      must(s.run!.day === run.day, "night cannot close without a pick");
      s = d(s, { type: "chooseUpgrade", pick: cycle[guard % 4] });
      must(s.run!.day === run.day, "choosing an upgrade does not end the night");
      must(s.run!.nightPick === cycle[guard % 4], "night pick recorded");
      s = d(s, { type: "buyPatch" });
      s = d(s, { type: "closeNight" });
      must(s.run!.nightPick === null, "night pick cleared on close");
      must(s.run!.day > run.day, "day advanced after closing the night");
      must(s.run!.kit.scanTier <= 3 && s.run!.kit.attackTier <= 3, "tiers capped");
      must(s.run!.strain >= strainBeforeClose, "day close never drains strain");
      must(s.run!.strain <= 100, "strain capped at 100");
    } else if (run.screen === "finalePre") {
      s = d(s, { type: "startFinale" });
      must(s.run!.screen === "duel", "finale dives directly");
      const duel = createDuel(
        finaleConfig(),
        mixSeed(run.runSeed, FINAL_DAY, 9),
        duelKitOf(s.run!.kit, s.run!.patchPouch),
        s.run!.ramPerTurn,
      );
      const res = playDuelToEnd(duel);
      s = d(s, {
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        gridlockWin: res.gridlockWin,
        pouchLeft: duel.patchPouch,
        overRotations: res.overRotations,
        trapsFired: res.trapsFired,
        redirectsTaken: res.redirectsTaken,
        pressureRounds: res.pressureRounds,
        scans: duel.econ.player.scansCast,
        attackCasts: duel.econ.player.attacksCast,
        defendCasts: duel.econ.player.defendsCast,
      });
      if (res.won) {
        must(s.run!.screen === "finaleWin", "finale win screen");
        must(s.meta.machineOpened, "machine opened");
        must(finaleWinScene().beats.length >= 5, "finale scene has beats");
      } else {
        must(s.run!.screen === "runEnd", "finale loss ends run");
      }
    } else if (run.screen === "runEnd" || run.screen === "finaleWin") {
      must(runEndScene(run.runNumber).beats.length > 0, "run end scene has beats");
      s = d(s, { type: "storyDone" });
      must(s.run === null, "run cleared after final story");
    } else {
      throw new Error(`unexpected screen ${run.screen}`);
    }
  }
  must(s.run === null, "run completed");
  return s;
}

let meta = { ...EMPTY_META };
let finaleWins = 0;
const RUNS = 40;
for (let i = 0; i < RUNS; i++) {
  const before = meta.machineOpened;
  const endState = playRun(i, meta);
  meta = endState.meta;
  if (meta.machineOpened && !before) finaleWins++;
}
must(meta.runCount === RUNS, "run count tracked");
console.log(
  `OK: ${RUNS} full runs, ${dispatchCount} dispatches, machineOpened=${meta.machineOpened}, finaleWins=${finaleWins}`,
);
// Story scenes render for every run number we can reach.
for (let n = 1; n <= 12; n++) {
  must(runOpenerScene(n).beats.length > 0, `opener ${n}`);
  must(runEndScene(n).beats.length > 0, `ender ${n}`);
}
console.log("OK: story scenes cover run numbers 1-12");
