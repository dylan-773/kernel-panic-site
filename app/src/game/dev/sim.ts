/**
 * Balance harness for the split-board duel. Not imported by app code.
 * Run from app/: bun run src/game/dev/sim.ts
 *
 * A proxy player using the same Dijkstra routing bot as the opponent (high
 * greed, no program casts) plays every day config across many seeds — a
 * lower bound on real player strength, since humans also get the kit.
 */

import { DAY_CONFIGS, PD_TOLERANCE, dayDuelConfig, finaleConfig, tutorialConfig } from "../content/arc";
import { OppMode } from "../content/kit";
import { endPlayerTurn } from "../duel-actions";
import { computePower, routeCost, routePlan } from "../duel-power";
import { createDuel, mixSeed } from "../duel-setup";
import { BASE_KIT, Board, DuelEndKind, DuelState, Side } from "../duel-types";
import { botPlayTurn, oppStep } from "../opponent";
import { kittedPlayTurn } from "./kitted-bot";
import { cellsAtDay, kitAtDay, ramAtDay } from "./kitted-profile";

const PROXY_GREED = 0.95;
const SEEDS = 200;
const MODES: OppMode[] = ["redirect", "armHalt", "armSiphon", "purge", "lock", "ward"];

/*
 * AI wall-clock proxy. The cadence is not flat: a rotation lands in 170ms, a
 * telegraphed cast holds 520ms, and any beat that actually did something (a
 * trap firing, a junction twisted, a clamp landing) holds a further 500-1200ms
 * so it can be read. This is the blended per-beat figure. Off by a bit either
 * way; it exists to catch a duel that becomes unwatchable, not to bill.
 */
const BEAT_MS = 255;

function pctl(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Opening route costs, read before a single turn is played. `pd` is what the
 * whole difficulty curve is actually made of: `par` is derived from it, and
 * pd/ramPerTurn is the approach length in turns. Printing it directly rather
 * than inverting par is the only way to see the generator missing `minCost`.
 */
function openingCosts(s: DuelState): { pd: number; od: number } {
  const pd = routeCost(s.boards.player);
  const od = routeCost(s.boards.opp);
  return { pd: isFinite(pd) ? pd : 0, od: isFinite(od) ? od : 0 };
}

/**
 * Days whose measured mean `pd` drifted off `pdTarget`. `arc.ts` has always
 * claimed this file asserts the band; it never did, and under the old shared
 * board the generator missed by 7-11 on every single day while the whole
 * difficulty table tuned a number nothing read. Collected here and fatal at
 * the end, so one miss does not hide the rest.
 */
const pdMisses: string[] = [];

function checkPd(label: string, pd: number, target: number): string {
  const off = pd - target;
  if (Math.abs(off) > PD_TOLERANCE) {
    pdMisses.push(`${label.trim()}: pd ${pd.toFixed(1)} vs target ${target} (off by ${off.toFixed(1)})`);
  }
  return `${pd.toFixed(1)}/${target}`;
}

/**
 * A route plan has to be executable, not just a number. Snap every node on the
 * plan to the rotation it asked for and the goal must light, for exactly the
 * RAM the plan quoted. Nothing has ever checked this, and `plan.cost` is
 * treated as truth by par, the round-cap tiebreak, the machine's whole turn
 * queue and board generation's fairness loop. Plans flagged `approx` are
 * exempt by contract: they promise a route exists, not that the queue conducts.
 */
function checkPlanHonesty(seeds: number): { checked: number; bad: string[] } {
  const bad: string[] = [];
  let checked = 0;
  for (let day = 1; day <= 9; day++) {
    const tiers = DAY_CONFIGS[day].jobTiers;
    for (let seed = 0; seed < seeds; seed++) {
      const s = createDuel(
        dayDuelConfig(day, MODES[seed % MODES.length], tiers[seed % 3], seed),
        seed,
        BASE_KIT,
        5 + Math.floor((day - 1) / 2),
      );
      for (const side of ["player", "opp"] as Side[]) {
        const b = s.boards[side];
        const plan = routePlan(b);
        if (!plan || plan.approx) continue;
        checked++;
        const quoted = plan.steps.reduce((n, st) => n + st.turns, 0);
        if (quoted !== plan.cost) {
          bad.push(`day ${day} seed ${seed} ${side}: steps sum to ${quoted} but cost says ${plan.cost}`);
          continue;
        }
        const probe: Board = { ...b, cells: b.cells.map((c) => ({ ...c })) };
        for (const st of plan.path) probe.cells[st.idx].rot = st.targetRot;
        const power = computePower(probe);
        if (!probe.goal.some((i) => power[i])) {
          bad.push(`day ${day} seed ${seed} ${side}: executed a cost-${plan.cost} plan, goal stayed dark`);
        }
      }
    }
  }
  return { checked, bad };
}

function playPlayerTurn(s: DuelState): void {
  botPlayTurn(s, "player", PROXY_GREED);
  if (s.phase === "playing" && s.turn === "player") endPlayerTurn(s);
}

export function playDuel(s: DuelState): {
  rounds: number;
  won: boolean;
  cap: boolean;
  chip: number;
  rotations: number;
  par: number;
  beats: number;
} {
  let guard = 0;
  let beats = 0;
  while (s.phase === "playing" && guard++ < 4000) {
    if (s.turn === "player") playPlayerTurn(s);
    else {
      oppStep(s);
      beats++;
    }
  }
  if (s.phase === "playing") throw new Error("duel did not terminate");
  return {
    rounds: s.round,
    won: s.phase === "won",
    cap: s.winKind === "cap",
    chip: s.strainChip,
    rotations: s.econ.player.rotations,
    par: s.par,
    beats,
  };
}

function pct(n: number, d: number): string {
  return `${((100 * n) / d).toFixed(1)}%`;
}

function runDay(label: string, pdTarget: number, mk: (seed: number) => DuelState): number {
  let wins = 0;
  let caps = 0;
  let roundsTotal = 0;
  let chipTotal = 0;
  let chipWins = 0;
  let minRounds = Infinity;
  let maxRounds = 0;
  let parTotal = 0;
  let rotTotal = 0;
  let overWins = 0;
  let pdTotal = 0;
  let odTotal = 0;
  let ramTotal = 0;
  let beatsTotal = 0;
  const allRounds: number[] = [];
  for (let i = 0; i < SEEDS; i++) {
    const s = mk(mixSeed(1337, i));
    const par = s.par;
    const { pd, od } = openingCosts(s);
    pdTotal += pd;
    odTotal += od;
    ramTotal += s.econ.player.ramPerTurn;
    const r = playDuel(s);
    roundsTotal += r.rounds;
    beatsTotal += r.beats;
    allRounds.push(r.rounds);
    minRounds = Math.min(minRounds, r.rounds);
    maxRounds = Math.max(maxRounds, r.rounds);
    if (r.won) {
      wins++;
      chipTotal += r.chip;
      chipWins++;
      parTotal += par;
      rotTotal += r.rotations;
      if (r.rotations > par) overWins++;
    }
    if (r.cap) caps++;
  }
  const avgChip = chipWins > 0 ? (chipTotal / chipWins).toFixed(1) : "-";
  const avgPar = chipWins > 0 ? (parTotal / chipWins).toFixed(0) : "-";
  const avgRot = chipWins > 0 ? (rotTotal / chipWins).toFixed(1) : "-";
  const overPct = chipWins > 0 ? pct(overWins, chipWins) : "-";
  console.log(
    `${label.padEnd(10)} win ${pct(wins, SEEDS).padStart(6)}  cap ${pct(caps, SEEDS).padStart(5)}  rounds ${(roundsTotal / SEEDS).toFixed(1)} (${minRounds}-${maxRounds})  chip/win ${avgChip}  par ${avgPar} rot ${avgRot} over ${overPct}`,
  );
  allRounds.sort((a, b) => a - b);
  const pd = pdTotal / SEEDS;
  const ram = ramTotal / SEEDS;
  const shortPct = allRounds.filter((r) => r <= 2).length / SEEDS;
  console.log(
    `           pd ${checkPd(label, pd, pdTarget)} od ${(odTotal / SEEDS).toFixed(1)} ram ${ram.toFixed(0)}  approach ${(pd / ram).toFixed(1)}t  rounds p10 ${pctl(allRounds, 0.1)} med ${pctl(allRounds, 0.5)} p90 ${pctl(allRounds, 0.9)}  <=2r ${(100 * shortPct).toFixed(0)}%  ai ${((beatsTotal / SEEDS) * BEAT_MS * 0.001).toFixed(1)}s`,
  );
  return (100 * wins) / SEEDS;
}

/* ------------------------------------------------------------------ */
/* Kitted profile pass                                                 */
/* ------------------------------------------------------------------ */

interface KittedResult {
  rounds: number;
  won: boolean;
  winKind: DuelEndKind | null;
  chip: number;
  cellsUsed: number;
  scans: number;
  attacks: number;
  defends: number;
  beats: number;
}

function playKittedDuel(s: DuelState): KittedResult {
  let guard = 0;
  let beats = 0;
  while (s.phase === "playing" && guard++ < 4000) {
    if (s.turn === "player") {
      kittedPlayTurn(s);
      if (s.phase === "playing" && s.turn === "player") endPlayerTurn(s);
    } else {
      oppStep(s);
      beats++;
    }
  }
  if (s.phase === "playing") throw new Error("kitted duel did not terminate");
  return {
    rounds: s.round,
    won: s.phase === "won",
    winKind: s.winKind,
    chip: s.strainChip,
    cellsUsed: s.kit.patchPouch.length - s.patchPouch.length,
    scans: s.econ.player.scansCast,
    attacks: s.econ.player.attacksCast,
    defends: s.econ.player.defendsCast,
    beats,
  };
}

const endTally = { wonGoal: 0, wonCap: 0, lostGoal: 0, lostSeal: 0, lostCap: 0 };

function tallyEnd(r: KittedResult): void {
  if (r.won) {
    if (r.winKind === "cap") endTally.wonCap++;
    else endTally.wonGoal++;
  } else {
    if (r.winKind === "cap") endTally.lostCap++;
    else if (r.winKind === "seal") endTally.lostSeal++;
    else endTally.lostGoal++;
  }
}

/** Paired kitted pass: same seeds, same configs, richer columns. */
function runDayKitted(
  label: string,
  baseWin: number,
  mk: (seed: number) => DuelState,
): { win: number; closeRounds: number[] } {
  let wins = 0;
  let caps = 0;
  let roundsTotal = 0;
  let chipTotal = 0;
  let cellsUsed = 0;
  let scans = 0;
  let attacks = 0;
  let defends = 0;
  const closeRounds: number[] = [];
  let pdTotal = 0;
  let ramTotal = 0;
  let beatsTotal = 0;
  const allRounds: number[] = [];
  for (let i = 0; i < SEEDS; i++) {
    const s = mk(mixSeed(1337, i));
    pdTotal += openingCosts(s).pd;
    ramTotal += s.econ.player.ramPerTurn;
    const r = playKittedDuel(s);
    tallyEnd(r);
    roundsTotal += r.rounds;
    beatsTotal += r.beats;
    allRounds.push(r.rounds);
    scans += r.scans;
    attacks += r.attacks;
    defends += r.defends;
    if (r.won) {
      wins++;
      chipTotal += r.chip;
      cellsUsed += r.cellsUsed;
      closeRounds.push(r.rounds);
    }
    if (r.winKind === "cap") caps++;
  }
  const win = (100 * wins) / SEEDS;
  const delta = win - baseWin;
  const avgChip = wins > 0 ? (chipTotal / wins).toFixed(1) : "-";
  const cellsPerWin = wins > 0 ? (cellsUsed / wins).toFixed(2) : "-";
  console.log(
    `${label.padEnd(10)} win ${pct(wins, SEEDS).padStart(6)}  d ${(delta >= 0 ? "+" : "") + delta.toFixed(1)}  cap ${pct(caps, SEEDS).padStart(5)}  rounds ${(roundsTotal / SEEDS).toFixed(1)}  chip/win ${avgChip}  casts s${(scans / SEEDS).toFixed(1)}/a${(attacks / SEEDS).toFixed(1)}/d${(defends / SEEDS).toFixed(1)}  cells/win ${cellsPerWin}`,
  );
  allRounds.sort((a, b) => a - b);
  const pd = pdTotal / SEEDS;
  const ram = ramTotal / SEEDS;
  const shortPct = allRounds.filter((r) => r <= 2).length / SEEDS;
  console.log(
    `           pd ${pd.toFixed(1)} ram ${ram.toFixed(0)}  approach ${(pd / ram).toFixed(1)}t  rounds p10 ${pctl(allRounds, 0.1)} med ${pctl(allRounds, 0.5)} p90 ${pctl(allRounds, 0.9)}  <=2r ${(100 * shortPct).toFixed(0)}%  ai ${((beatsTotal / SEEDS) * BEAT_MS * 0.001).toFixed(1)}s`,
  );
  return { win, closeRounds };
}

if (import.meta.main) {
  {
    const honesty = checkPlanHonesty(20);
    if (honesty.bad.length > 0) {
      console.log(`\nROUTE PLAN IS LYING (${honesty.bad.length} of ${honesty.checked} plans):`);
      for (const line of honesty.bad.slice(0, 12)) console.log(`  ${line}`);
      process.exit(1);
    }
    console.log(`plan honesty: ${honesty.checked} exact plans executed, all light the goal at cost`);
  }

  {
    let playerWins = 0;
    for (let i = 0; i < SEEDS; i++) {
      const s = createDuel(tutorialConfig(), mixSeed(999, i), BASE_KIT, 5);
      const r = playDuel(s);
      if (r.won) playerWins++;
    }
    console.log(`tutorial   player wins: ${playerWins} of ${SEEDS} (must be 0)`);
  }

  const baseWins: number[] = [];
  for (let day = 1; day <= 9; day++) {
    const ram = 5 + Math.floor((day - 1) / 2);
    const tiers = DAY_CONFIGS[day].jobTiers;
    baseWins[day] = runDay(`day ${day} r${ram}`, DAY_CONFIGS[day].pdTarget, (seed) =>
      createDuel(
        dayDuelConfig(day, MODES[seed % MODES.length], tiers[seed % 3], seed),
        seed,
        BASE_KIT,
        ram,
      ),
    );
  }

  const baseFinale = runDay("finale r9", finaleConfig().pdTarget, (seed) =>
    createDuel(finaleConfig(), seed, BASE_KIT, 9),
  );

  // Kitted pass: same seeds and configs as the rows above, so every delta
  // is a paired comparison on identical boards. The kit-less block stays
  // byte-identical by construction; nothing above this line may change.
  console.log(
    `\nkitted: picks ${[...Array(9).keys()].map((d) => `r${ramAtDay(d + 1)}`).join("/")} fin r${ramAtDay(10)}; pairs RP/SP/HL by seed; boosts hotBoot@2 longArms@4 pair@6; cells ${[...Array(9).keys()].map((d) => cellsAtDay(d + 1)).join("/")}`,
  );
  for (let day = 1; day <= 9; day++) {
    const tiers = DAY_CONFIGS[day].jobTiers;
    runDayKitted(`day ${day} r${ramAtDay(day)}`, baseWins[day], (seed) =>
      createDuel(
        dayDuelConfig(day, MODES[seed % MODES.length], tiers[seed % 3], seed),
        seed,
        kitAtDay(day, seed),
        ramAtDay(day),
      ),
    );
  }
  const fin = runDayKitted(`finale r${ramAtDay(10)}`, baseFinale, (seed) =>
    createDuel(finaleConfig(), seed, kitAtDay(10, seed), ramAtDay(10)),
  );
  const hist = [0, 0, 0, 0, 0];
  // With oppOpens the machine's opening turn consumes round 1, so the
  // player's Nth turn ends round N+1; report PLAYER turns.
  const shift = finaleConfig().oppOpens ? 1 : 0;
  for (const r of fin.closeRounds) hist[Math.max(1, Math.min(r - shift, 5)) - 1]++;
  console.log(
    `finale close player-turns: t1 ${hist[0]}  t2 ${hist[1]}  t3 ${hist[2]}  t4 ${hist[3]}  t5+ ${hist[4]}   (t1 must be 0)`,
  );
  console.log(
    `kitted ends: won goal ${endTally.wonGoal} cap ${endTally.wonCap} . lost goal ${endTally.lostGoal} seal ${endTally.lostSeal} cap ${endTally.lostCap}`,
  );

  if (pdMisses.length > 0) {
    console.log(`\nPD TARGET MISSED (tolerance ${PD_TOLERANCE}):`);
    for (const line of pdMisses) console.log(`  ${line}`);
    process.exit(1);
  }
  console.log(`pd targets: every day within ${PD_TOLERANCE} of its pdTarget`);
}
