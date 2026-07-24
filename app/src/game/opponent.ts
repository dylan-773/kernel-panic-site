import { ABILITY_BY_ID } from "./content/abilities";
import {
  advanceBag,
  applyCast,
  applyOverloadLock,
  applyPlace,
  applyRotate,
  armTargetLegal,
  endOppTurn,
  fireTrapIfAny,
  placementLegal,
  redirectTargetLegal,
  roll,
  say,
} from "./duel-actions";
import { placementPath, placementsToCore } from "./duel-power";
import { AbilityDef, DuelState, Side } from "./duel-types";
import { DX, DY, cellIndex, oppositeDir, rotateArms } from "./types";

/**
 * The scripted opponent: not a live agent, a legible machine. Each oppStep
 * performs exactly one visible move (trap check, ability, one rotation, one
 * placement) so the turn reads as a sequence in the UI. All randomness runs
 * through the state's threaded RNG — a duel replays identically from its
 * seed. The routing helpers are side-parameterized so the balance harness
 * can drive a proxy player with the exact same movement rules.
 */

function coreDist(s: DuelState, idx: number): number {
  const c = s.cells[idx];
  const core = s.cells[s.coreIdx];
  return Math.abs(c.x - core.x) + Math.abs(c.y - core.y);
}

function nodesOf(s: DuelState, side: Side): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.cells.length; i++) {
    if (s.cells[i].kind === "node" && s.cells[i].owner === side) out.push(i);
  }
  return out;
}

function entryOf(side: Side): "entryP" | "entryO" {
  return side === "player" ? "entryP" : "entryO";
}

function kitDefs(s: DuelState): AbilityDef[] {
  return s.cfg.oppKit
    .filter((id) => !(id in s.econ.opp.disabled))
    .map((id) => ABILITY_BY_ID[id])
    .filter(Boolean);
}

/** Decide this turn's ability cast (id only; targets resolve at cast time). */
function decideAbility(s: DuelState): void {
  const econ = s.econ.opp;
  if (econ.abilityUsed) return;
  const kit = kitDefs(s).filter((d) => d.ramCost <= econ.ram);
  if (kit.length === 0) return;

  const playerDist = placementsToCore(s.cells, s.w, s.h, "player", s.coreIdx);

  // Reactive offense: the player is about to reach the core.
  if (playerDist <= 2) {
    const stopper =
      kit.find((d) => d.verb === "redirect") ?? kit.find((d) => d.verb === "arm");
    if (stopper) {
      s.oppTurn.pendingAbility = stopper.id;
      return;
    }
  }

  // Reactive defense: the player interfered with our grid recently.
  if (s.lastPlayerHitRound >= s.round - 1 && s.lastPlayerHitRound > 0) {
    const guard =
      kit.find((d) => d.verb === "backdoor") ??
      kit.find((d) => d.verb === "shield") ??
      kit.find((d) => d.verb === "firewall");
    if (guard && roll(s) < 0.75) {
      s.oppTurn.pendingAbility = guard.id;
      return;
    }
  }

  // The Analyze readout must come true: guarantee the dominant verb early.
  if (!s.oppDominantUsed && s.round >= 2) {
    const dom = kit.find((d) => d.verb === s.cfg.dominant);
    if (dom) {
      s.oppTurn.pendingAbility = dom.id;
      return;
    }
  }

  // Proactive: frequency roll, dominant verb double-weighted.
  if (roll(s) < s.cfg.abilityFreq) {
    const weighted: AbilityDef[] = [];
    for (const d of kit) {
      weighted.push(d);
      if (d.verb === s.cfg.dominant) weighted.push(d);
    }
    s.oppTurn.pendingAbility = weighted[Math.floor(roll(s) * weighted.length)].id;
  }
}

function computeIntent(s: DuelState): void {
  if (s.oppTurn.pendingAbility) {
    const def = ABILITY_BY_ID[s.oppTurn.pendingAbility];
    s.oppNextIntent = def ? `Charging ${def.name}` : "Charging a routine";
    return;
  }
  const path = placementPath(s.cells, s.w, s.h, "opp", s.coreIdx);
  if (!path) {
    s.oppNextIntent = "Probing for a route";
  } else if (path.length <= 2) {
    s.oppNextIntent = "Final approach to the core";
  } else {
    s.oppNextIntent = "Routing toward the core";
  }
}

/** Resolve targets and cast the pending ability. True if a cast happened. */
function castPending(s: DuelState): boolean {
  const id = s.oppTurn.pendingAbility;
  if (!id) return false;
  const def = ABILITY_BY_ID[id];
  const econ = s.econ.opp;
  s.oppTurn.pendingAbility = null;
  if (!def || econ.abilityUsed || def.ramCost > econ.ram) return false;

  const targets: number[] = [];
  switch (def.verb) {
    case "arm": {
      const pool = nodesOf(s, "player")
        .filter((i) => armTargetLegal(s, "opp", i))
        .sort((a, b) => coreDist(s, a) - coreDist(s, b));
      targets.push(...pool.slice(0, def.p.traps ?? 1));
      if (targets.length === 0) return false;
      break;
    }
    case "redirect": {
      const pool = nodesOf(s, "player")
        .filter((i) => redirectTargetLegal(s, "opp", i))
        .sort((a, b) => {
          const pa = s.power.player[a] ? 0 : 1;
          const pb = s.power.player[b] ? 0 : 1;
          return pa - pb || coreDist(s, a) - coreDist(s, b);
        });
      targets.push(...pool.slice(0, def.p.targets ?? 1));
      if (targets.length === 0) return false;
      break;
    }
    case "shield": {
      const pool = nodesOf(s, "opp")
        .filter((i) => s.cells[i].shieldedThroughRound < s.round)
        .sort((a, b) => {
          const pa = s.power.opp[a] ? 0 : 1;
          const pb = s.power.opp[b] ? 0 : 1;
          return pa - pb || coreDist(s, a) - coreDist(s, b);
        });
      targets.push(...pool.slice(0, def.p.targets ?? 1));
      if (targets.length === 0) return false;
      break;
    }
    case "backdoor": {
      if (def.p.shieldRounds) {
        const tip = nodesOf(s, "opp").sort((a, b) => coreDist(s, a) - coreDist(s, b))[0];
        if (tip !== undefined) targets.push(tip);
      }
      break;
    }
    case "overload":
    case "overclock":
    case "firewall":
      break;
  }

  applyCast(s, "opp", def, targets);
  if (def.verb === "overload" && def.p.lockTurns) {
    const options = s.equipped.filter((e) => e.copies > 0);
    if (options.length > 0) {
      const pick = options[Math.floor(roll(s) * options.length)];
      applyOverloadLock(s, "opp", def, pick.id);
    }
  }
  if (def.verb === s.cfg.dominant) s.oppDominantUsed = true;
  return true;
}

/**
 * One repair rotation for either side: find an unpowered own node adjacent
 * to the powered network that a rotation can rejoin, turn it one step.
 */
export function botRepairStep(s: DuelState, side: Side): boolean {
  const econ = s.econ[side];
  if (econ.ram < 1) return false;
  for (const i of nodesOf(s, side).sort((a, b) => coreDist(s, a) - coreDist(s, b))) {
    if (s.power[side][i]) continue;
    const c = s.cells[i];
    const feeds: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const ni = cellIndex(s.w, nx, ny);
      const nc = s.cells[ni];
      const owned =
        (nc.kind === "node" && nc.owner === side) || nc.kind === entryOf(side) || nc.kind === "core";
      if (!owned || !s.power[side][ni]) continue;
      if ((rotateArms(nc.base, nc.rot) & (1 << oppositeDir(d))) !== 0) feeds.push(d);
    }
    if (feeds.length === 0) continue;
    for (let k = 1; k < 4; k++) {
      const arms = rotateArms(c.base, (c.rot + k) % 4);
      if (feeds.some((d) => (arms & (1 << d)) !== 0)) {
        applyRotate(s, side, i, 1);
        return true;
      }
    }
  }
  return false;
}

/** Best rotation of a piece at a target cell: connect back, then onward. */
export function bestRotation(
  s: DuelState,
  side: Side,
  piece: number,
  idx: number,
  onwardIdx: number | null,
): { rot: number; score: number } {
  const c = s.cells[idx];
  const backDirs: number[] = [];
  for (let d = 0; d < 4; d++) {
    const nx = c.x + DX[d];
    const ny = c.y + DY[d];
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
    const ni = cellIndex(s.w, nx, ny);
    const nc = s.cells[ni];
    const owned = (nc.kind === "node" && nc.owner === side) || nc.kind === entryOf(side);
    if (!owned) continue;
    if ((rotateArms(nc.base, nc.rot) & (1 << oppositeDir(d))) !== 0) backDirs.push(d);
  }
  let onwardDir = -1;
  if (onwardIdx !== null) {
    const oc = s.cells[onwardIdx];
    const dx = oc.x - c.x;
    const dy = oc.y - c.y;
    if (dx === 1) onwardDir = 1;
    else if (dx === -1) onwardDir = 3;
    else if (dy === 1) onwardDir = 2;
    else if (dy === -1) onwardDir = 0;
  }
  let best = { rot: 0, score: -1 };
  for (let r = 0; r < 4; r++) {
    const arms = rotateArms(piece, r);
    let score = 0;
    if (backDirs.some((d) => (arms & (1 << d)) !== 0)) score += 2;
    if (onwardDir !== -1 && (arms & (1 << onwardDir)) !== 0) score += 1;
    if (score > best.score) best = { rot: r, score };
  }
  return best;
}

/**
 * Placements-to-core distance for every empty cell, walking only through
 * empty cells (future placements). Cells the side can never use (adjacent
 * to the enemy port) are excluded.
 */
function emptyDistFromCore(s: DuelState, side: Side): number[] {
  const dist = new Array<number>(s.cells.length).fill(Infinity);
  const enemyEntry = side === "player" ? s.entryO : s.entryP;
  const banned = (i: number): boolean => {
    const c = s.cells[i];
    for (let d = 0; d < 4; d++) {
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      if (cellIndex(s.w, nx, ny) === enemyEntry) return true;
    }
    return false;
  };
  const queue: number[] = [];
  const core = s.cells[s.coreIdx];
  for (let d = 0; d < 4; d++) {
    const nx = core.x + DX[d];
    const ny = core.y + DY[d];
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
    const ni = cellIndex(s.w, nx, ny);
    if (s.cells[ni].kind === "empty" && !banned(ni) && dist[ni] > 1) {
      dist[ni] = 1;
      queue.push(ni);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const c = s.cells[i];
    for (let d = 0; d < 4; d++) {
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const ni = cellIndex(s.w, nx, ny);
      if (s.cells[ni].kind !== "empty" || banned(ni)) continue;
      if (dist[ni] <= dist[i] + 1) continue;
      dist[ni] = dist[i] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

/**
 * One rotation of a POWERED tip node so it keeps its feed and gains an arm
 * toward an empty cell — recovers lines whose free arm points nowhere.
 * Only single-step fixes are attempted, so it can never oscillate.
 */
function retipStep(s: DuelState, side: Side): boolean {
  const econ = s.econ[side];
  if (econ.ram < 1) return false;
  const distCore = emptyDistFromCore(s, side);
  for (const i of nodesOf(s, side)) {
    if (!s.power[side][i]) continue;
    const c = s.cells[i];
    const armsNow = rotateArms(c.base, c.rot);
    const armsNext = rotateArms(c.base, (c.rot + 1) % 4);
    let fedAfter = false;
    let opensEmpty = false;
    let opensEmptyNow = false;
    for (let d = 0; d < 4; d++) {
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const ni = cellIndex(s.w, nx, ny);
      const nc = s.cells[ni];
      const owned =
        (nc.kind === "node" && nc.owner === side) || nc.kind === entryOf(side);
      if (owned && s.power[side][ni]) {
        const feeds = (rotateArms(nc.base, nc.rot) & (1 << oppositeDir(d))) !== 0;
        if (feeds && (armsNext & (1 << d)) !== 0) fedAfter = true;
      }
      if (nc.kind === "empty" && isFinite(distCore[ni])) {
        if ((armsNext & (1 << d)) !== 0) opensEmpty = true;
        if ((armsNow & (1 << d)) !== 0) opensEmptyNow = true;
      }
    }
    if (fedAfter && opensEmpty && !opensEmptyNow) {
      applyRotate(s, side, i, 1);
      return true;
    }
  }
  return false;
}

/**
 * One placement for either side: pick the empty cell reachable from an arm
 * of the powered network that is closest to the core, orient the draw to
 * connect back and point onward. greed < 1 injects legible mistakes.
 */
export function botPlaceStep(s: DuelState, side: Side, greed: number): boolean {
  const econ = s.econ[side];
  if (econ.ram < 2) return false;
  const distCore = emptyDistFromCore(s, side);

  let target = -1;
  let bestScore = Infinity;
  for (let i = 0; i < s.cells.length; i++) {
    const c = s.cells[i];
    const owned =
      (c.kind === "node" && c.owner === side) || c.kind === entryOf(side);
    if (!owned || !s.power[side][i]) continue;
    const arms = rotateArms(c.base, c.rot);
    for (let d = 0; d < 4; d++) {
      if ((arms & (1 << d)) === 0) continue;
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const ni = cellIndex(s.w, nx, ny);
      if (!placementLegal(s, side, ni)) continue;
      const score = ni === s.coreIdx ? 0 : distCore[ni];
      if (score < bestScore) {
        bestScore = score;
        target = ni;
      }
    }
  }

  if (target === -1) {
    if (retipStep(s, side)) return true;
    return false;
  }

  // Onward: the neighbor of the target that shortens the route most.
  let onward: number | null = null;
  let onwardScore = Infinity;
  {
    const c = s.cells[target];
    for (let d = 0; d < 4; d++) {
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
      const ni = cellIndex(s.w, nx, ny);
      if (ni === s.coreIdx) {
        onward = ni;
        onwardScore = 0;
        break;
      }
      if (s.cells[ni].kind === "empty" && distCore[ni] < onwardScore) {
        onwardScore = distCore[ni];
        onward = ni;
      }
    }
  }

  const { rot, score } = bestRotation(s, side, econ.drawCur, target, onward);
  if (score < 2) {
    // Cannot connect back at all (should not happen); cycle the bag.
    if (econ.ram >= 3) {
      econ.ram -= 1;
      advanceBag(s, side);
      return true;
    }
    return false;
  }
  // A straight that cannot bend toward the next step is a wasted cell more
  // often than not: swap it out when the turn can afford the discard.
  if (score === 2 && onward !== null && econ.ram >= 3 && roll(s) < 0.6) {
    econ.ram -= 1;
    advanceBag(s, side);
    return true;
  }

  if (roll(s) < greed) {
    applyPlace(s, side, target, rot);
  } else if (roll(s) < 0.5) {
    applyPlace(s, side, target, (rot + 1) % 4); // misrotation, fixable next turn
  } else {
    const alternates: number[] = [];
    for (let i = 0; i < s.cells.length; i++) {
      if (i !== target && placementLegal(s, side, i)) alternates.push(i);
    }
    if (alternates.length > 0) {
      const alt = alternates[Math.floor(roll(s) * alternates.length)];
      const bestAlt = bestRotation(s, side, econ.drawCur, alt, s.coreIdx);
      applyPlace(s, side, alt, bestAlt.rot);
    } else {
      applyPlace(s, side, target, rot);
    }
  }
  return true;
}

/** Perform one opponent move. Ends the opponent turn when nothing is left. */
export function oppStep(s: DuelState): void {
  if (s.phase !== "playing" || s.turn !== "opp") return;
  const ot = s.oppTurn;

  if (!ot.trapChecked) {
    ot.trapChecked = true;
    if (fireTrapIfAny(s, "opp")) {
      endOppTurn(s);
      return;
    }
    decideAbility(s);
    computeIntent(s);
    if (s.cfg.tutorial && s.round === 1) {
      say(s, "The machine is awake. It is not waiting for you.");
    }
    return;
  }

  if (ot.pendingAbility) {
    if (castPending(s)) return;
  }

  if (botRepairStep(s, "opp")) return;

  if (ot.placed < s.cfg.placesPerTurn && botPlaceStep(s, "opp", s.cfg.greed)) {
    ot.placed++;
    return;
  }

  endOppTurn(s);
}
