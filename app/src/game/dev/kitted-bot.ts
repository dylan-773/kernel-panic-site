/**
 * Threshold-policy player for the kitted balance harness. Not imported by
 * app code, and not an AI showcase: fixed priorities, no randomness of its
 * own (the only rolls left are the greed fumble inside the rotation bot),
 * so day-to-day deltas measure the kit, not the pilot.
 *
 * Priority per turn: PLACE (rescue, else clear improvement) > SCAN (odd
 * rounds against trappers) > DEFEND (mode-gated) > ATTACK (route-race
 * gated, keeping rotation RAM in reserve) > rotate out the rest.
 */

import { applyCast, applyPlace, programCost } from "../duel-actions";
import { canPlace, reachOf, routeCost } from "../duel-power";
import { DuelState } from "../duel-types";
import { botPlayTurn, prepareCastFor } from "../opponent";
import { PLACE_COST, armCount } from "../patch-cells";

const PROXY_GREED = 0.95;
/** Minimum routeCost improvement before a non-rescue placement is worth a cell. */
const PLACE_GAIN = 2;

function playing(s: DuelState): boolean {
  return s.phase === "playing" && s.turn === "player";
}

function oppTraps(s: DuelState): boolean {
  return s.cfg.oppAttackModes.some((m) => m === "armHalt" || m === "armSiphon");
}

/**
 * Best (cell, held piece) placement by resulting route cost, or null.
 * Trial-and-restore with the EXACT held masks (orientation matters to the
 * price, not just the class). Ties prefer the smaller piece, so the bot
 * never burns a cross where an elbow does the job.
 */
function bestPlacement(
  s: DuelState,
): { idx: number; pouchIdx: number; mask: number; cost: number } | null {
  const seen = new Set<number>();
  const picks: Array<{ pouchIdx: number; mask: number }> = [];
  s.patchPouch.forEach((mask, pouchIdx) => {
    if (seen.has(mask)) return;
    seen.add(mask);
    picks.push({ pouchIdx, mask });
  });
  let best: { idx: number; pouchIdx: number; mask: number; cost: number } | null = null;
  const b = s.boards.player;
  for (let i = 0; i < b.cells.length; i++) {
    if (!canPlace(b, i, reachOf(s, "player"))) continue;
    const c = b.cells[i];
    const prev = { kind: c.kind, base: c.base, rot: c.rot, fused: c.fused };
    for (const pick of picks) {
      c.kind = "node";
      c.base = pick.mask;
      c.rot = 0;
      c.fused = true;
      const cost = routeCost(b);
      c.kind = prev.kind;
      c.base = prev.base;
      c.rot = prev.rot;
      c.fused = prev.fused;
      if (!isFinite(cost)) continue;
      if (
        best === null ||
        cost < best.cost ||
        (cost === best.cost && armCount(pick.mask) < armCount(best.mask))
      ) {
        best = { idx: i, pouchIdx: pick.pouchIdx, mask: pick.mask, cost };
      }
    }
  }
  return best;
}

function tryPlace(s: DuelState): void {
  const econ = s.econ.player;
  if (s.patchPouch.length < 1 || econ.placedThisTurn || econ.ram < PLACE_COST) return;
  const cur = routeCost(s.boards.player);
  if (!isFinite(cur)) {
    // Slag cuts the grid as it stands: any reconnecting piece is worth it.
    const best = bestPlacement(s);
    if (best) applyPlace(s, "player", best.idx, best.pouchIdx);
    return;
  }
  // Otherwise spend when the piece buys turns: a real shortcut, or the
  // shortcut that turns this turn into the closing turn. The latter is the
  // degenerate pattern playtesters reported; the bot must model it.
  if (econ.ram < PLACE_COST + 1) return;
  const best = bestPlacement(s);
  if (!best) return;
  const gain = cur - best.cost;
  const closesNow = best.cost <= econ.ram - PLACE_COST && cur > econ.ram;
  if (gain >= PLACE_GAIN || closesNow) applyPlace(s, "player", best.idx, best.pouchIdx);
}

function tryScan(s: DuelState): void {
  const econ = s.econ.player;
  if (econ.used.scan || econ.ram < 2) return;
  if (s.round % 2 !== 1) return;
  if (!oppTraps(s)) return;
  applyCast(s, "player", "scan", null, []);
}

/** Can the machine reach across and twist our grid? */
function oppRedirects(s: DuelState): boolean {
  return s.cfg.oppAttackModes.includes("redirect");
}

function tryDefend(s: DuelState): void {
  const econ = s.econ.player;
  const mode = s.kit.defendMode;
  if (econ.used.defend || econ.ram < programCost(s, "player", "defend")) return;
  /*
   * On split boards LOCK and WARD both exist to stop their REDIRECT landing on
   * a chain you have already paid for, so the trigger is "they can twist me and
   * I have something worth twisting", not "they are near their goal". The old
   * gates fired on ~0.3 casts a dive, which is why both modes read as dead.
   */
  const worthDefending = s.boards.player.cells.filter((c) => c.built).length >= 4;
  if (mode === "lock") {
    if (!oppRedirects(s) || !worthDefending || econ.ram < 3) return;
  }
  if (mode === "ward") {
    if (!(oppRedirects(s) || oppTraps(s)) || !worthDefending || econ.ram < 3) return;
  }
  const aim = prepareCastFor(s, "player", "defend", mode);
  if (!aim) return;
  applyCast(s, "player", "defend", mode, aim.targets);
}

/** Turns this side still needs at its current RAM rate. The race clock. */
function turnsToGoal(s: DuelState, side: "player" | "opp"): number {
  const c = routeCost(s.boards[side]);
  if (!isFinite(c)) return 99;
  return c / Math.max(1, s.econ[side].ramPerTurn);
}

function tryAttack(s: DuelState): void {
  const econ = s.econ.player;
  const mode = s.kit.attackMode;
  const cost = programCost(s, "player", "attack");
  if (econ.used.attack || econ.ram < cost) return;
  const own = routeCost(s.boards.player);
  /*
   * Reaching across costs a turn of road you are not building. On split
   * boards that opportunity cost is real, and the old gate (raw route cost,
   * keep 2 RAM) had the bot casting 4.1 times a dive on day 1 and losing 24
   * points to a bot that never cast at all. Keep enough RAM to actually
   * advance, and only spend when the race clock says they are ahead.
   */
  if (econ.ram - cost < 3 && (!isFinite(own) || own > 3)) return;
  if (mode === "redirect") {
    // A twist only bites once they have a live chain to break; before that it
    // lands on dark ground and costs them nothing. Day 1 was casting twice a
    // dive into empty board and losing 21 points to a bot that never cast.
    if (s.round < 2) return;
    if (s.boards.opp.cells.filter((c) => c.built).length < 5) return;
    // Only worth it when they are genuinely closing faster than you are.
    if (turnsToGoal(s, "opp") > turnsToGoal(s, "player") - 0.4) return;
  } else if (s.round < 2) {
    return; // traps land from round 2, once routes have committed
  }
  const aim = prepareCastFor(s, "player", "attack", mode);
  if (!aim) return;
  applyCast(s, "player", "attack", mode, aim.targets);
}

/** Play one whole kitted player turn. Does not end the turn. */
export function kittedPlayTurn(s: DuelState): void {
  tryPlace(s);
  if (!playing(s)) return;
  tryScan(s);
  if (!playing(s)) return;
  tryDefend(s);
  if (!playing(s)) return;
  tryAttack(s);
  if (!playing(s)) return;
  botPlayTurn(s, "player", PROXY_GREED);
}
