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
import { canPlace, routeCost } from "../duel-power";
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
  for (let i = 0; i < s.cells.length; i++) {
    if (!canPlace(s, "player", i)) continue;
    const c = s.cells[i];
    const prev = { kind: c.kind, base: c.base, rot: c.rot, fused: c.fused };
    for (const pick of picks) {
      c.kind = "node";
      c.base = pick.mask;
      c.rot = 0;
      c.fused = true;
      const cost = routeCost(s, "player");
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
  const cur = routeCost(s, "player");
  if (!isFinite(cur)) {
    // Severed on the board as it stands: any reconnecting piece is worth it.
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

function tryDefend(s: DuelState): void {
  const econ = s.econ.player;
  const mode = s.kit.defendMode;
  if (econ.used.defend || econ.ram < programCost(s, "player", "defend")) return;
  if (mode === "lock") {
    const oppCost = routeCost(s, "opp");
    if (!(isFinite(oppCost) && oppCost <= 4)) return;
  }
  if (mode === "ward") {
    if (!oppTraps(s) || s.round % 2 !== 1) return;
  }
  const aim = prepareCastFor(s, "player", "defend", mode);
  if (!aim) return;
  applyCast(s, "player", "defend", mode, aim.targets);
}

function tryAttack(s: DuelState): void {
  const econ = s.econ.player;
  const mode = s.kit.attackMode;
  const cost = programCost(s, "player", "attack");
  if (econ.used.attack || econ.ram < cost) return;
  const own = routeCost(s, "player");
  // Keep rotation RAM: no cast that strands us mid-route.
  if (econ.ram - cost < 2 && (!isFinite(own) || own > 2)) return;
  if (mode === "redirect") {
    const opp = routeCost(s, "opp");
    const racing = isFinite(opp) && opp <= (isFinite(own) ? own : 99) + 2;
    if (!racing && s.round < 3) return;
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
