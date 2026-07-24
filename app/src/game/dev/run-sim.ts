/**
 * End-to-end run-layer harness. Not imported by app code.
 * Run from app/: bun run src/game/dev/run-sim.ts
 *
 * Drives the FULL game loop through the real reducers exactly as the UI
 * would: meta hydration, run start, opener scene, tutorial, ten days of
 * pick-analyze-build-dive, upgrades, finale, story scenes on run end.
 * Asserts state-machine invariants at every step.
 */

import { VERB_TELL } from "../content/abilities";
import { dayDuelConfig, finaleConfig, tutorialConfig, FINAL_DAY } from "../content/arc";
import { CUSTOMERS } from "../content/customers";
import { finaleWinScene, runEndScene, runOpenerScene, DAY_LINES } from "../content/story";
import { endPlayerTurn } from "../duel-actions";
import { createDuel, mixSeed } from "../duel-setup";
import { DuelState } from "../duel-types";
import { botPlaceStep, botRepairStep, oppStep } from "../opponent";
import { GameState, runReducer, RunAction } from "../run-reducer";
import { EMPTY_META } from "../save";

let dispatchCount = 0;

function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`INVARIANT: ${msg} (after ${dispatchCount} dispatches)`);
}

function d(state: GameState, action: RunAction): GameState {
  dispatchCount++;
  return runReducer(state, action);
}

function playDuelToEnd(duel: DuelState): { won: boolean; chip: number; capWin: boolean } {
  let guard = 0;
  while (duel.phase === "playing" && guard++ < 4000) {
    if (duel.turn === "player") {
      let inner = 0;
      while (duel.phase === "playing" && duel.turn === "player" && inner++ < 40) {
        if (botRepairStep(duel, "player")) continue;
        if (botPlaceStep(duel, "player", 0.93)) continue;
        break;
      }
      if (duel.phase === "playing" && duel.turn === "player") endPlayerTurn(duel);
    } else {
      oppStep(duel);
    }
  }
  must(duel.phase !== "playing", "duel terminated");
  return { won: duel.phase === "won", chip: duel.strainChip, capWin: duel.winKind === "cap" };
}

function playRun(runIndex: number, startMeta: GameState["meta"]): GameState {
  let s: GameState = { meta: startMeta, run: null };
  s = d(s, { type: "startRun", seed: mixSeed(0xabc, runIndex) });
  must(s.run !== null, "run started");
  must(s.run!.screen === "opener", "opener first");
  must(runOpenerScene(s.run!.runNumber).beats.length > 0, "opener scene has beats");

  s = d(s, { type: "storyDone" });
  if (s.run!.runNumber === 1) {
    must(s.run!.screen === "tutorial", "run 1 goes to tutorial");
    const t = createDuel(tutorialConfig(), mixSeed(s.run!.runSeed, 0, 0), [], s.run!.ramPerTurn);
    const res = playDuelToEnd(t);
    must(!res.won, "tutorial is unwinnable");
    s = d(s, { type: "tutorialDone" });
  }
  must(s.run!.screen === "day", "day board reached");

  let guard = 0;
  while (s.run && guard++ < 200) {
    const run = s.run;
    if (run.screen === "day") {
      const idx = run.jobsDone.findIndex((x) => !x);
      must(idx !== -1, "day board always has an open job");
      must(DAY_LINES.length >= 9, "day lines exist");
      s = d(s, { type: "pickJob", index: idx });
      must(s.run!.screen === "analyze", "analyze after pick");
      const job = s.run!.jobs[idx];
      must(!!VERB_TELL[job.dominant], "analyze tell exists");
      must(CUSTOMERS.some((c) => c.id === job.customerId), "customer exists");
      s = d(s, { type: "toBuild" });
      s = d(s, { type: "startDuel" });
      must(s.run!.screen === "duel", "duel screen");
      const duel = createDuel(
        dayDuelConfig(run.day, job.dominant, job.kitSeed),
        mixSeed(run.runSeed, run.day, idx),
        s.run!.equipped.map((id) => ({ id, copies: s.run!.copies[id] ?? 0 })),
        s.run!.ramPerTurn,
      );
      const res = playDuelToEnd(duel);
      const strainBefore = s.run!.strain;
      const unlockedBefore = s.meta.unlocked.length;
      s = d(s, {
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        copiesLeft: Object.fromEntries(duel.equipped.map((e) => [e.id, e.copies])),
      });
      if (!res.won) {
        must(s.run!.screen === "runEnd", "loss ends run");
        must(s.run!.strain === 0, "loss zeroes strain");
      } else {
        must(s.meta.unlocked.length <= unlockedBefore + 1, "at most one unlock per win");
        must(s.run!.strain <= strainBefore, "strain never rises on win");
        must(
          s.run!.screen === "result" || s.run!.screen === "runEnd",
          "result or bled-out end after win",
        );
      }
    } else if (run.screen === "result") {
      s = d(s, { type: "resultNext" });
    } else if (run.screen === "upgrade") {
      s = d(s, { type: "chooseUpgrade", pick: guard % 2 === 0 ? "ram" : "cap" });
      must(s.run!.day > run.day, "day advanced after upgrade");
    } else if (run.screen === "finalePre") {
      s = d(s, { type: "startFinale" });
      must(s.run!.screen === "build", "finale goes through build");
      s = d(s, { type: "startDuel" });
      const duel = createDuel(
        finaleConfig(),
        mixSeed(run.runSeed, FINAL_DAY, 9),
        s.run!.equipped.map((id) => ({ id, copies: s.run!.copies[id] ?? 0 })),
        s.run!.ramPerTurn,
      );
      const res = playDuelToEnd(duel);
      s = d(s, {
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        copiesLeft: {},
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
let dayReached: number[] = [];
const RUNS = 40;
for (let i = 0; i < RUNS; i++) {
  const before = meta.machineOpened;
  const endState = playRun(i, meta);
  meta = endState.meta;
  if (meta.machineOpened && !before) finaleWins++;
}
must(meta.runCount === RUNS, "run count tracked");
console.log(
  `OK: ${RUNS} full runs, ${dispatchCount} dispatches, ${meta.unlocked.length}/24 unlocked, machineOpened=${meta.machineOpened}`,
);
// Story scenes render for every run number we can reach.
for (let n = 1; n <= 12; n++) {
  must(runOpenerScene(n).beats.length > 0, `opener ${n}`);
  must(runEndScene(n).beats.length > 0, `ender ${n}`);
}
console.log("OK: story scenes cover run numbers 1-12");
void dayReached;
