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
import { BASE_KIT, DuelState } from "../duel-types";
import { botPlayTurn, oppStep } from "../opponent";

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

function runDay(label: string, mk: (seed: number) => DuelState): void {
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

  for (let day = 1; day <= 9; day++) {
    const ram = 5 + Math.floor((day - 1) / 2);
    const tiers = DAY_CONFIGS[day].jobTiers;
    runDay(`day ${day} r${ram}`, (seed) =>
      createDuel(
        dayDuelConfig(day, MODES[seed % MODES.length], tiers[seed % 3], seed),
        seed,
        BASE_KIT,
        ram,
      ),
    );
  }

  runDay("finale r9", (seed) => createDuel(finaleConfig(), seed, BASE_KIT, 9));
}
