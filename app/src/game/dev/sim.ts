/**
 * Balance harness for the flood-claim duel. Not imported by app code.
 * Run from app/: bun run src/game/dev/sim.ts
 *
 * A proxy player using the same Dijkstra routing bot as the opponent (high
 * greed, no program casts) plays every day config across many seeds — a
 * lower bound on real player strength, since humans also get the kit.
 */

import { DAY_CONFIGS, dayDuelConfig, finaleConfig, tutorialConfig } from "../content/arc";
import { OppMode } from "../content/kit";
import { endPlayerTurn } from "../duel-actions";
import { createDuel, mixSeed } from "../duel-setup";
import { BASE_KIT, DuelEndKind, DuelState } from "../duel-types";
import { botPlayTurn, oppStep } from "../opponent";
import { kittedPlayTurn } from "./kitted-bot";
import { cellsAtDay, kitAtDay, ramAtDay } from "./kitted-profile";

const PROXY_GREED = 0.95;
const SEEDS = 200;
const MODES: OppMode[] = ["redirect", "armHalt", "armSiphon", "purge", "lock", "ward"];

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
} {
  let guard = 0;
  while (s.phase === "playing" && guard++ < 4000) {
    if (s.turn === "player") playPlayerTurn(s);
    else oppStep(s);
  }
  if (s.phase === "playing") throw new Error("duel did not terminate");
  return {
    rounds: s.round,
    won: s.phase === "won",
    cap: s.winKind === "cap",
    chip: s.strainChip,
    rotations: s.econ.player.rotations,
    par: s.par,
  };
}

function pct(n: number, d: number): string {
  return `${((100 * n) / d).toFixed(1)}%`;
}

function runDay(label: string, mk: (seed: number) => DuelState): number {
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
  for (let i = 0; i < SEEDS; i++) {
    const s = mk(mixSeed(1337, i));
    const par = s.par;
    const r = playDuel(s);
    roundsTotal += r.rounds;
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
}

function playKittedDuel(s: DuelState): KittedResult {
  let guard = 0;
  while (s.phase === "playing" && guard++ < 4000) {
    if (s.turn === "player") {
      kittedPlayTurn(s);
      if (s.phase === "playing" && s.turn === "player") endPlayerTurn(s);
    } else {
      oppStep(s);
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
  };
}

const endTally = { wonCore: 0, wonCap: 0, wonGridlock: 0, lostCore: 0, lostSevered: 0, lostCap: 0 };

function tallyEnd(r: KittedResult): void {
  if (r.won) {
    if (r.winKind === "cap") endTally.wonCap++;
    else if (r.winKind === "gridlock") endTally.wonGridlock++;
    else endTally.wonCore++;
  } else {
    if (r.winKind === "cap") endTally.lostCap++;
    else if (r.winKind === "severed") endTally.lostSevered++;
    else endTally.lostCore++;
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
  for (let i = 0; i < SEEDS; i++) {
    const s = mk(mixSeed(1337, i));
    const r = playKittedDuel(s);
    tallyEnd(r);
    roundsTotal += r.rounds;
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
  return { win, closeRounds };
}

if (import.meta.main) {
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
    baseWins[day] = runDay(`day ${day} r${ram}`, (seed) =>
      createDuel(
        dayDuelConfig(day, MODES[seed % MODES.length], tiers[seed % 3], seed),
        seed,
        BASE_KIT,
        ram,
      ),
    );
  }

  const baseFinale = runDay("finale r9", (seed) => createDuel(finaleConfig(), seed, BASE_KIT, 9));

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
    `kitted ends: won core ${endTally.wonCore} cap ${endTally.wonCap} gridlock ${endTally.wonGridlock} . lost core ${endTally.lostCore} severed ${endTally.lostSevered} cap ${endTally.lostCap}`,
  );
}
