/**
 * Teaching coverage harness. Not imported by app code.
 * Run from app/: bun run src/game/dev/teach-sim.ts
 *
 * The tutorial used to go stale because nothing could fail for being
 * untaught. This is that failure. It asserts that every mechanic in the
 * inventory is either explained at a real moment or carries a written
 * waiver, that the moments land on surfaces a run actually reaches, and
 * that no single surface turns into a lecture.
 */

import { dayDuelConfig, finaleConfig, tutorialConfig, FINAL_DAY } from "../content/arc";
import {
  AUGMENTS,
  ATTACK_MODE_LABEL,
  DEFEND_MODE_LABEL,
  AttackMode,
  DefendMode,
  attackModeDesc,
  defendModeDesc,
} from "../content/kit";
import {
  MECHANIC_INVENTORY,
  TEACHING,
  TEACH_TIPS,
  TUTORIAL_BEATS,
  TeachSurface,
  TeachingMoment,
  WaiverPremise,
  taughtMechanics,
  tutorialLine,
} from "../content/teaching";
import { endPlayerTurn } from "../duel-actions";
import { createDuel, mixSeed, MAX_OPENING_BUILT } from "../duel-setup";
import { BASE_KIT, DuelState } from "../duel-types";
import { botPlayTurn, oppStep } from "../opponent";
import { GameState, RunAction, runReducer } from "../run-reducer";
import { PATCH_POUCH_MAX } from "../patch-cells";
import { duelKitOf, EMPTY_META } from "../save";

const failures: string[] = [];

function check(cond: boolean, msg: string): void {
  if (!cond) failures.push(msg);
}

/** Verbs the player must be able to perform before the opening dive ends. */
const CORE_VERBS = ["rotate", "scan", "defend", "attack"];

/**
 * Surfaces that are windows or shells rather than run screens. The run walk
 * cannot visit them, so they are reachable by construction.
 */
const WINDOW_SURFACES: TeachSurface[] = ["loadout", "solder", "desktop", "tutorial"];

/** An unconditional callout is the intrusive kind; conditional ones self-limit. */
const MAX_FIRST_SIGHT_PER_SURFACE = 2;
const MAX_MOMENTS_PER_SURFACE = 4;
const MAX_COACH_LINE = 160;
const MAX_BEAT_LINE = 260;
const MAX_TIP_LEN = 130;
const MAX_LINES = 2;

/* ------------------------------------------------------------------ */
/* 1. Coverage: every mechanic is taught or waived, never neither      */
/* ------------------------------------------------------------------ */

const taught = taughtMechanics();
const inventoryIds = new Set(MECHANIC_INVENTORY.map((m) => m.id));
let waived = 0;

/**
 * A blanket waiver over a whole content type rests on a claim about the
 * code. Verify the claim, so the waiver cannot rot as that type grows: a
 * new augment shipped with an empty desc breaks the premise and the build.
 */
const PREMISE_CHECKS: Record<WaiverPremise, () => string[]> = {
  augmentDescs: () => {
    const bad: string[] = [];
    for (const a of AUGMENTS) {
      if (!a.desc || a.desc.trim().length < 20) bad.push(`augment "${a.id}" has no usable desc`);
      if (!a.name || a.name.trim().length === 0) bad.push(`augment "${a.id}" has no name`);
    }
    return bad;
  },
  modeDescs: () => {
    const bad: string[] = [];
    for (const m of Object.keys(ATTACK_MODE_LABEL) as AttackMode[]) {
      for (const t of [1, 2, 3] as const) {
        if (attackModeDesc(m, t).trim().length < 10) bad.push(`attack mode "${m}" T${t} has no desc`);
      }
    }
    for (const m of Object.keys(DEFEND_MODE_LABEL) as DefendMode[]) {
      for (const t of [1, 2, 3] as const) {
        if (defendModeDesc(m, t).trim().length < 10) bad.push(`defend mode "${m}" T${t} has no desc`);
      }
    }
    return bad;
  },
};

for (const m of MECHANIC_INVENTORY) {
  const isTaught = taught.has(m.id);
  if (m.waiver) {
    waived++;
    check(
      m.waiver.trim().length >= 20,
      `mechanic "${m.id}" has a waiver too short to be a real justification`,
    );
    check(
      !isTaught,
      `mechanic "${m.id}" is both waived and taught. Delete one; a waiver is a claim that no moment is needed.`,
    );
    if (m.waiverPremise) {
      for (const problem of PREMISE_CHECKS[m.waiverPremise]()) {
        check(false, `waiver "${m.id}" rests on ${m.waiverPremise}, which no longer holds: ${problem}`);
      }
    }
    continue;
  }
  check(
    !m.waiverPremise,
    `mechanic "${m.id}" declares a waiverPremise but no waiver; the premise backs a waiver, it is not one`,
  );
  check(
    isTaught,
    `mechanic "${m.id}" (${m.label}) has no teaching moment and no waiver. First contact: ${m.firstContact}.`,
  );
}

for (const id of taught) {
  check(inventoryIds.has(id), `teaching references unknown mechanic "${id}"; add it to MECHANIC_INVENTORY`);
}

/* ------------------------------------------------------------------ */
/* 2. Moment hygiene: unique ids, deterministic precedence, copy law   */
/* ------------------------------------------------------------------ */

const seenIds = new Set<string>();
const seenOrders = new Set<number>();
const perSurface = new Map<TeachSurface, TeachingMoment[]>();

for (const m of TEACHING) {
  check(!seenIds.has(m.id), `duplicate teaching moment id "${m.id}"`);
  seenIds.add(m.id);
  check(!seenOrders.has(m.order), `teaching moment "${m.id}" reuses order ${m.order}; precedence must be total`);
  seenOrders.add(m.order);
  check(m.teaches.length > 0, `teaching moment "${m.id}" teaches nothing`);
  check(
    m.notBeforeDay >= 0 && m.notBeforeDay <= FINAL_DAY,
    `teaching moment "${m.id}" has notBeforeDay ${m.notBeforeDay} outside 0..${FINAL_DAY}`,
  );
  check(m.title.trim().length > 0, `teaching moment "${m.id}" has no title`);
  check(
    !m.title.includes("—") && !m.title.includes("–"),
    `teaching moment "${m.id}" has an em or en dash in its title; game copy never does`,
  );
  check(
    m.title === m.title.toUpperCase(),
    `teaching moment "${m.id}" title is not ALL CAPS; system text always is`,
  );
  check(
    m.lines.length > 0 && m.lines.length <= MAX_LINES,
    `teaching moment "${m.id}" has ${m.lines.length} lines; the cap is ${MAX_LINES}. Teach one thing.`,
  );
  for (const line of m.lines) {
    check(
      line.length <= MAX_COACH_LINE,
      `teaching moment "${m.id}" has a ${line.length} char line; the cap is ${MAX_COACH_LINE}`,
    );
    check(
      !line.includes("—") && !line.includes("–"),
      `teaching moment "${m.id}" contains an em or en dash; game copy never does`,
    );
  }
  const bucket = perSurface.get(m.surface) ?? [];
  bucket.push(m);
  perSurface.set(m.surface, bucket);
}

for (const [surface, moments] of perSurface) {
  const firstSight = moments.filter((m) => m.when === "firstSight").length;
  check(
    firstSight <= MAX_FIRST_SIGHT_PER_SURFACE,
    `surface "${surface}" fires ${firstSight} unconditional callouts; the cap is ${MAX_FIRST_SIGHT_PER_SURFACE}. Make one conditional or fold them together.`,
  );
  check(
    moments.length <= MAX_MOMENTS_PER_SURFACE,
    `surface "${surface}" carries ${moments.length} moments; the cap is ${MAX_MOMENTS_PER_SURFACE}`,
  );
}

/* ------------------------------------------------------------------ */
/* 2b. Tips: reference, not interruption                               */
/* ------------------------------------------------------------------ */

const tipIds = new Set<string>();
for (const t of TEACH_TIPS) {
  check(!tipIds.has(t.id), `duplicate tip id "${t.id}"`);
  tipIds.add(t.id);
  check(t.teaches.length > 0, `tip "${t.id}" teaches nothing`);
  check(t.control.trim().length > 0, `tip "${t.id}" does not name the control it hangs on`);
  check(
    t.text.length > 0 && t.text.length <= MAX_TIP_LEN,
    `tip "${t.id}" is ${t.text.length} chars; the cap is ${MAX_TIP_LEN}`,
  );
  check(
    !t.text.includes("—") && !t.text.includes("–"),
    `tip "${t.id}" contains an em or en dash; game copy never does`,
  );
}

/* ------------------------------------------------------------------ */
/* 3. The opening dive still covers every verb, and never runs dry     */
/* ------------------------------------------------------------------ */

const beatIds = new Set<string>();
const beatMechanics = new Set<string>();
for (const b of TUTORIAL_BEATS) {
  check(!beatIds.has(b.id), `duplicate tutorial beat id "${b.id}"`);
  beatIds.add(b.id);
  check(b.teaches.length > 0, `tutorial beat "${b.id}" teaches nothing`);
  for (const id of b.teaches) beatMechanics.add(id);
  check(
    b.line.length <= MAX_BEAT_LINE,
    `tutorial beat "${b.id}" has a ${b.line.length} char line; the cap is ${MAX_BEAT_LINE}`,
  );
  check(
    !b.line.includes("—") && !b.line.includes("–"),
    `tutorial beat "${b.id}" contains an em or en dash; game copy never does`,
  );
}

for (const verb of CORE_VERBS) {
  check(beatMechanics.has(verb), `the opening dive never teaches "${verb}"`);
}

// The ladder must answer for every state the dive can be in, or the bench
// goes silent mid lesson.
let ladderHoles = 0;
for (const turn of ["player", "opp"] as const) {
  for (const round of [1, 2, 3, 9]) {
    for (const owned of [0, 3, 12]) {
      for (const scanned of [false, true]) {
        for (const purged of [false, true]) {
          for (const attacked of [false, true]) {
            for (const trapShown of [false, true]) {
              const line = tutorialLine({
                turn,
                round,
                ownedNodes: owned,
                scanned,
                purged,
                attacked,
                trapShown,
              });
              if (!line) ladderHoles++;
            }
          }
        }
      }
    }
  }
}
check(ladderHoles === 0, `the tutorial ladder goes silent in ${ladderHoles} reachable states`);

/**
 * The check above only asks that SOME line answers. That is too weak for the
 * opening state, where the specific line matters: rotate is the first verb
 * the player has to perform, and if the ladder opens on anything else they
 * are never told how to play. This regressed once already, silently, because
 * the beat's bound (owned <= 2) was tighter than the number of nodes board
 * generation can hand out for free (3), so 23.9% of dives skipped the lesson.
 * Assert the opening line for every claim count the generator can produce.
 */
for (let owned = 0; owned <= MAX_OPENING_BUILT; owned++) {
  const line = tutorialLine({
    turn: "player",
    round: 1,
    ownedNodes: owned,
    scanned: false,
    purged: false,
    attacked: false,
    trapShown: false,
  });
  const rotateBeat = TUTORIAL_BEATS.find((b) => b.id === "first-rotation");
  check(
    !!rotateBeat && line === rotateBeat.line,
    `the opening dive does not teach rotation when the opening flood claims ${owned} node(s); ` +
      `the bench opens with "${(line ?? "nothing").slice(0, 60)}..." instead`,
  );
}

/* ------------------------------------------------------------------ */
/* 4. Reachability: every surface a moment targets is really visited   */
/* ------------------------------------------------------------------ */

function playDuelToEnd(duel: DuelState): {
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
      botPlayTurn(duel, "player", 0.95);
      if (duel.phase === "playing" && duel.turn === "player") endPlayerTurn(duel);
    } else {
      oppStep(duel);
    }
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

const visited = new Set<string>();
let s: GameState = { meta: { ...EMPTY_META }, run: null };
const d = (a: RunAction) => {
  s = runReducer(s, a);
  if (s.run) visited.add(s.run.screen);
};

for (let runIndex = 0; runIndex < 4; runIndex++) {
  d({ type: "startRun", seed: mixSeed(0x7ea, runIndex) });
  d({ type: "storyDone" });
  if (s.run && s.run.screen === "tutIntro") {
    d({ type: "storyDone" });
    const t = createDuel(tutorialConfig(), mixSeed(s.run.runSeed, 0, 0), BASE_KIT, s.run.ramPerTurn);
    playDuelToEnd(t);
    d({ type: "tutorialDone" });
    d({ type: "storyDone" });
  }
  d({ type: "storyDone" });

  let guard = 0;
  while (s.run && guard++ < 200) {
    const run = s.run;
    if (run.screen === "day") {
      const idx = run.jobsDone.findIndex((x) => !x);
      d({ type: "pickJob", index: idx });
      const job = run.jobs[idx];
      d({ type: "startDuel" });
      const duel = createDuel(
        dayDuelConfig(run.day, job.dominant, job.tier, job.kitSeed),
        mixSeed(run.runSeed, run.day, idx),
        duelKitOf(run.kit, run.patchPouch),
        run.ramPerTurn,
      );
      const res = playDuelToEnd(duel);
      d({
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        gridlockWin: false,
        pouchLeft: duel.patchPouch,
        overRotations: res.overRotations,
        trapsFired: res.trapsFired,
        redirectsTaken: res.redirectsTaken,
        pressureRounds: res.pressureRounds,
        scans: duel.econ.player.scansCast,
        attackCasts: duel.econ.player.attacksCast,
        defendCasts: duel.econ.player.defendsCast,
      });
      if (s.run && s.run.screen === "result") {
        const draft = s.run.lastResult ? s.run.lastResult.draft : [];
        if (draft.length > 0) {
          const id = draft[0];
          const full = s.run.kit.augments.length >= s.run.boostSlots;
          d({ type: "pickAugment", id, replace: full ? s.run.kit.augments[0] : undefined });
        }
      }
    } else if (run.screen === "result") {
      d({ type: "resultNext" });
    } else if (run.screen === "dayOpen") {
      d({ type: "storyDone" });
    } else if (run.screen === "upgrade") {
      if (run.patchPouch.length < PATCH_POUCH_MAX) d({ type: "buyDarkPatch" });
      d({ type: "buyPatch" });
      d({ type: "chooseUpgrade", pick: "ram" });
      d({ type: "closeNight" });
    } else if (run.screen === "finalePre") {
      d({ type: "startFinale" });
      const duel = createDuel(
        finaleConfig(),
        mixSeed(run.runSeed, FINAL_DAY, 9),
        duelKitOf(run.kit, run.patchPouch),
        run.ramPerTurn,
      );
      const res = playDuelToEnd(duel);
      d({
        type: "duelFinished",
        won: res.won,
        chip: res.chip,
        capWin: res.capWin,
        gridlockWin: false,
        pouchLeft: duel.patchPouch,
        overRotations: res.overRotations,
        trapsFired: res.trapsFired,
        redirectsTaken: res.redirectsTaken,
        pressureRounds: res.pressureRounds,
        scans: duel.econ.player.scansCast,
        attackCasts: duel.econ.player.attacksCast,
        defendCasts: duel.econ.player.defendsCast,
      });
    } else if (run.screen === "runEnd" || run.screen === "finaleWin") {
      d({ type: "storyDone" });
    } else {
      failures.push(`run walk hit an unexpected screen "${run.screen}"`);
      break;
    }
  }
}

/**
 * The walk above plays honestly, and an honest run dies long before day 10:
 * reaching the finale means winning all 27 dives, so `finalePre` and
 * `finaleWin` were never once visited and nothing could claim first contact
 * there. That is a blind spot in the harness, not a fact about the game.
 *
 * This second pass exists only to record late-run surface reachability. It
 * forfeits nothing: it asserts no outcome, plays no duel, and reports no
 * numbers. It force-wins every dive so the screens past day 9 are seen at
 * all. Balance lives in `sim.ts`; this is a map of where a run can go.
 */
{
  d({ type: "startRun", seed: mixSeed(0x5f1, 1) });
  let guard = 0;
  while (s.run && s.run.screen !== "finaleWin" && guard++ < 400) {
    const run = s.run;
    if (run.screen === "day") {
      d({ type: "pickJob", index: run.jobsDone.findIndex((x) => !x) });
      d({ type: "startDuel" });
      d({ type: "duelFinished", won: true, chip: 0, capWin: false, gridlockWin: false, pouchLeft: run.patchPouch, overRotations: 0, trapsFired: 0, redirectsTaken: 0, pressureRounds: 0, scans: 0, attackCasts: 0, defendCasts: 0 });
    } else if (run.screen === "finalePre") {
      d({ type: "startFinale" });
      d({ type: "duelFinished", won: true, chip: 0, capWin: false, gridlockWin: false, pouchLeft: run.patchPouch, overRotations: 0, trapsFired: 0, redirectsTaken: 0, pressureRounds: 0, scans: 0, attackCasts: 0, defendCasts: 0 });
    } else if (run.screen === "result") {
      d({ type: "resultNext" });
    } else if (run.screen === "upgrade") {
      d({ type: "chooseUpgrade", pick: "ram" });
      d({ type: "closeNight" });
    } else {
      d({ type: "storyDone" });
    }
  }
  check(
    s.run !== null && guard < 400,
    "the survivor walk never reached the finale; late-run surfaces cannot be verified",
  );
}

// "duel" is the screen every dive runs under; the walk records it directly.
for (const m of TEACHING) {
  if (WINDOW_SURFACES.includes(m.surface)) continue;
  check(
    visited.has(m.surface),
    `teaching moment "${m.id}" targets surface "${m.surface}", which no run ever reaches`,
  );
}

for (const m of MECHANIC_INVENTORY) {
  if (WINDOW_SURFACES.includes(m.firstContact)) continue;
  check(
    visited.has(m.firstContact),
    `mechanic "${m.id}" claims first contact on "${m.firstContact}", which no run ever reaches`,
  );
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const covered = MECHANIC_INVENTORY.length - waived;
if (failures.length > 0) {
  console.error(`TEACH FAIL: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `OK: ${MECHANIC_INVENTORY.length} mechanics, ${covered} taught, ${waived} waived, ` +
    `${TEACHING.length} coachmarks, ${TEACH_TIPS.length} tips, ${TUTORIAL_BEATS.length} tutorial beats`,
);
console.log(`OK: surfaces reached by the run walk: ${[...visited].sort().join(", ")}`);
console.log("OK: teaching coverage complete");
