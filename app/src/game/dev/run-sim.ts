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
import { endPlayerTurn, playerHasRoute } from "../duel-actions";
import { createDuel, mixSeed } from "../duel-setup";
import { BASE_KIT, DuelState } from "../duel-types";
import { botPlayTurn, oppStep } from "../opponent";
import {
  DAY_REST_REGEN,
  GameState,
  ownsAugment,
  PATCH_CELL_COST,
  PATCH_CELL_MAX,
  runReducer,
  RunAction,
} from "../run-reducer";
import { EMPTY_META, RunKit } from "../save";

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
  overRotations: number;
  trapsFired: number;
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
  // Every ending has to be nameable. A loss the machine won without ever
  // touching the core used to print "Its flood got there first", which is
  // how a legitimate route verdict read as a broken win check.
  must(duel.winKind !== null, "finished duel records how it ended");
  must(
    duel.endReason !== null && duel.endReason.length > 0,
    `finished duel (${duel.winKind}) carries a player-facing reason`,
  );
  if (duel.winKind === "severed") {
    // The verdict is only allowed when no rotation AND no unspent patch cell
    // can reopen a corridor. Holding a usable cell must never lose the dive.
    must(!playerHasRoute(duel), "severed verdict means no route exists, patch cells included");
    must(duel.phase === "lost", "severed is a loss");
  }
  if (duel.winKind === "gridlock") {
    must(duel.phase === "won", "a deadlocked board resolves in the player's favor");
  }
  return {
    won: duel.phase === "won",
    chip: duel.strainChip,
    capWin: duel.winKind === "cap",
    overRotations: Math.max(0, duel.econ.player.rotations - duel.par),
    trapsFired: duel.econ.player.trapsFired,
  };
}

function duelKitOf(kit: RunKit, patchCells: number) {
  return {
    scanTier: kit.scanTier,
    attackTier: kit.attackTier,
    defendTier: kit.defendTier,
    attackMode: kit.attackMode,
    defendMode: kit.defendMode,
    augments: kit.augments,
    patchCells,
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
        duelKitOf(s.run!.kit, s.run!.patchCells),
        s.run!.ramPerTurn,
      );
      must(duel.par > 0, "par computed for every dive");
      const res = playDuelToEnd(duel);
      const cellsUsed = s.run!.patchCells - duel.patchCells;
      const strainBefore = s.run!.strain;
      const cellsBefore = s.run!.patchCells;
      const ownsCleanRun = s.run!.kit.augments.includes("cleanRun");
      s = d(s, {
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        cellsUsed,
        overRotations: res.overRotations,
        trapsFired: res.trapsFired,
        scans: duel.econ.player.scansCast,
        attackCasts: duel.econ.player.attacksCast,
        defendCasts: duel.econ.player.defendsCast,
      });
      if (res.won && s.run) {
        const spent = cellsBefore - cellsUsed;
        const expected =
          res.chip === 0 && ownsCleanRun ? Math.min(PATCH_CELL_MAX, spent + 1) : spent;
        must(s.run.patchCells === expected, "patch cells consumed on win (clean-run bank included)");
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
          for (const id of draft) {
            must(AUGMENTS.some((a) => a.id === id), "draft ids exist");
            must(!ownsAugment(s.run!.kit, id), "draft never offers owned augments");
          }
          if (draft.length > 0) {
            const pick = draft[picks++ % draft.length];
            s = d(s, { type: "pickAugment", id: pick });
            must(ownsAugment(s.run!.kit, pick), "picked augment owned");
            must(s.run!.lastResult!.picked === pick, "pick recorded");
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
      // Exercise the shop: buy a patch cell when affordable, then close.
      const creditsBefore = run.credits;
      s = d(s, { type: "buyPatchCell" });
      if (creditsBefore >= PATCH_CELL_COST && run.patchCells < PATCH_CELL_MAX) {
        must(s.run!.patchCells === run.patchCells + 1, "patch cell bought");
        must(s.run!.credits === creditsBefore - PATCH_CELL_COST, "patch cell paid for");
      }
      must(s.run!.patchCells <= PATCH_CELL_MAX, "patch cell pouch capped");
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
        duelKitOf(s.run!.kit, s.run!.patchCells),
        s.run!.ramPerTurn,
      );
      const res = playDuelToEnd(duel);
      const cellsUsed = s.run!.patchCells - duel.patchCells;
      s = d(s, {
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        cellsUsed,
        overRotations: res.overRotations,
        trapsFired: res.trapsFired,
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
