/**
 * Balance harness for the flood-claim duel. Not imported by app code.
 * Run from app/: bun run src/game/dev/sim.ts
 *
 * A proxy player using the same Dijkstra routing bot as the opponent (high
 * greed, no abilities) plays every day config across many seeds — a lower
 * bound on real player strength, since humans also get the ability kit.
 */

import { dayDuelConfig, finaleConfig, tutorialConfig } from "../content/arc";
import { endPlayerTurn } from "../duel-actions";
import { createDuel, mixSeed } from "../duel-setup";
import { AbilityVerb, DuelState } from "../duel-types";
import { botPlayTurn, oppStep } from "../opponent";

const PROXY_GREED = 0.95;
const SEEDS = 200;
const VERBS: AbilityVerb[] = [
  "arm",
  "scan",
  "redirect",
  "shield",
  "overload",
  "overclock",
  "firewall",
  "backdoor",
];

function playPlayerTurn(s: DuelState): void {
  botPlayTurn(s, "player", PROXY_GREED);
  if (s.phase === "playing" && s.turn === "player") endPlayerTurn(s);
}

export function playDuel(s: DuelState): { rounds: number; won: boolean; cap: boolean; chip: number } {
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
  for (let i = 0; i < SEEDS; i++) {
    const s = mk(mixSeed(1337, i));
    const r = playDuel(s);
    roundsTotal += r.rounds;
    minRounds = Math.min(minRounds, r.rounds);
    maxRounds = Math.max(maxRounds, r.rounds);
    if (r.won) {
      wins++;
      chipTotal += r.chip;
      chipWins++;
    }
    if (r.cap) caps++;
  }
  const avgChip = chipWins > 0 ? (chipTotal / chipWins).toFixed(1) : "-";
  console.log(
    `${label.padEnd(10)} win ${pct(wins, SEEDS).padStart(6)}  cap ${pct(caps, SEEDS).padStart(5)}  rounds ${(roundsTotal / SEEDS).toFixed(1)} (${minRounds}-${maxRounds})  chip/win ${avgChip}`,
  );
}

if (import.meta.main) {
  {
    let playerWins = 0;
    for (let i = 0; i < SEEDS; i++) {
      const s = createDuel(tutorialConfig(), mixSeed(999, i), [], 5);
      const r = playDuel(s);
      if (r.won) playerWins++;
    }
    console.log(`tutorial   player wins: ${playerWins} of ${SEEDS} (must be 0)`);
  }

  for (let day = 1; day <= 9; day++) {
    const ram = 5 + Math.floor((day - 1) / 2);
    runDay(`day ${day} r${ram}`, (seed) =>
      createDuel(dayDuelConfig(day, VERBS[seed % VERBS.length], seed), seed, [], ram),
    );
  }

  runDay("finale r9", (seed) => createDuel(finaleConfig(), seed, [], 9));
}
