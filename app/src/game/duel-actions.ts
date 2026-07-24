import { ABILITY_BY_ID } from "./content/abilities";
import { computeDuelPower, placementsToCore } from "./duel-power";
import { drawPiece } from "./duel-setup";
import {
  AbilityDef,
  DuelState,
  ROUND_CAP,
  Side,
  otherSide,
} from "./duel-types";
import { nextU32 } from "./rng";
import { DX, DY, cellIndex } from "./types";

/**
 * Shared state-mutation helpers for the duel. Every function here mutates a
 * state that the reducer has already cloned; the reducer and the opponent
 * planner both build on these so the two sides play by identical rules.
 */

export function emit(s: DuelState, kind: string): void {
  s.fx.push({ id: s.fxNext++, kind });
}

export function say(s: DuelState, text: string): void {
  s.notice = { id: s.fxNext++, text };
}

export function roll(s: DuelState): number {
  const [v, next] = nextU32(s.rngState);
  s.rngState = next;
  return v;
}

export function settle(s: DuelState): void {
  const prev = s.power;
  s.power = computeDuelPower(s.cells, s.w, s.h, s.entryP, s.entryO);
  let newlyLit = 0;
  for (let i = 0; i < s.cells.length; i++) {
    if (s.power.player[i] && !prev.player[i]) newlyLit++;
  }
  if (newlyLit >= 2) emit(s, "power");
  if (s.phase !== "playing") return;
  if (s.power.player[s.coreIdx]) {
    finishDuel(s, "player", "core");
  } else if (s.power.opp[s.coreIdx]) {
    finishDuel(s, "opp", "core");
  }
}

export function computeStrainChip(s: DuelState, kind: "core" | "cap"): number {
  const oppDist = placementsToCore(s.cells, s.w, s.h, "opp", s.coreIdx);
  const start = Math.max(1, s.oppStartDist);
  const remaining = isFinite(oppDist) ? Math.min(oppDist, start) : start;
  const progress = Math.max(0, Math.min(1, 1 - remaining / start));
  let chip = Math.max(0, Math.round(50 * (progress - 0.5)));
  chip += 4 * s.econ.player.trapsFired;
  if (kind === "cap") chip += 10;
  return Math.min(40, chip);
}

export function finishDuel(s: DuelState, winner: Side, kind: "core" | "cap"): void {
  s.phase = winner === "player" ? "won" : "lost";
  s.winKind = kind;
  s.notice = null;
  s.oppPlan = [];
  s.strainChip = winner === "player" ? computeStrainChip(s, kind) : 0;
  emit(s, winner === "player" ? "win" : "lose");
}

/** A side's network cells for adjacency: its placed nodes plus its port. */
function isOwnNetwork(s: DuelState, side: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (c.kind === "node") return c.owner === side;
  return side === "player" ? c.kind === "entryP" : c.kind === "entryO";
}

/**
 * Placement legality, identical for both sides: an empty cell orthogonally
 * adjacent to your own network, and never adjacent to the enemy's port.
 */
export function placementLegal(s: DuelState, side: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "empty") return false;
  const enemyEntry = side === "player" ? s.entryO : s.entryP;
  let touchesOwn = false;
  for (let d = 0; d < 4; d++) {
    const nx = c.x + DX[d];
    const ny = c.y + DY[d];
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
    const ni = cellIndex(s.w, nx, ny);
    if (ni === enemyEntry) return false;
    if (isOwnNetwork(s, side, ni)) touchesOwn = true;
  }
  return touchesOwn;
}

export function applyPlace(s: DuelState, side: Side, idx: number, rot: number): void {
  const econ = s.econ[side];
  const c = s.cells[idx];
  c.kind = "node";
  c.owner = side;
  c.base = econ.drawCur;
  c.rot = ((rot % 4) + 4) % 4;
  c.spin = c.rot;
  econ.ram -= 2;
  advanceBag(s, side);
  emit(s, "place");
  settle(s);
}

export function advanceBag(s: DuelState, side: Side): void {
  const econ = s.econ[side];
  econ.drawCur = econ.drawNext;
  if (side === "opp" && s.cfg.tutorial) {
    // The tutorial machine cheats: every draw is a cross. It cannot brick.
    econ.drawNext = 0b1111;
    return;
  }
  if (side === "player") {
    const [piece, bag] = drawPiece(s.bagPlayer);
    s.bagPlayer = bag;
    econ.drawNext = piece;
  } else {
    const [piece, bag] = drawPiece(s.bagOpp);
    s.bagOpp = bag;
    econ.drawNext = piece;
  }
}

export function applyRotate(s: DuelState, side: Side, idx: number, steps: number): void {
  const c = s.cells[idx];
  const k = ((steps % 4) + 4) % 4;
  c.rot = (c.rot + k) % 4;
  c.spin += k;
  s.econ[side].ram -= k;
  emit(s, "rotate");
  settle(s);
}

/** Whether an enemy node is protected from Arm Node / Redirect right now. */
export function isProtected(s: DuelState, victim: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (c.shieldedThroughRound >= s.round) return true;
  const wall = victim === "player" ? s.econ.player.wallThrough : s.econ.opp.wallThrough;
  return wall >= s.round;
}

export function armTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const victim = otherSide(caster);
  const c = s.cells[idx];
  if (!c || c.kind !== "node" || c.owner !== victim) return false;
  if (c.trap) return false;
  if (s.power[victim][idx]) return false; // only unpowered nodes: a reaction window
  return !isProtected(s, victim, idx);
}

export function redirectTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const victim = otherSide(caster);
  const c = s.cells[idx];
  if (!c || c.kind !== "node" || c.owner !== victim) return false;
  return !isProtected(s, victim, idx);
}

/**
 * Cast an ability for either side. Targets are validated by the callers
 * (reducer for the player, planner for the opponent) before charging RAM.
 */
export function applyCast(s: DuelState, side: Side, def: AbilityDef, targets: number[]): void {
  const econ = s.econ[side];
  const enemy = otherSide(side);
  const enemyEcon = s.econ[enemy];
  econ.ram -= def.ramCost;
  econ.abilityUsed = true;

  switch (def.verb) {
    case "arm": {
      for (const idx of targets) {
        s.cells[idx].trap = {
          by: side,
          revealed: side === "opp" ? false : true,
          drain: def.p.drain ?? 0,
        };
      }
      if (side === "player") s.lastPlayerHitRound = s.round;
      emit(s, "trapSet");
      say(s, side === "player" ? "Trap armed on their line" : "It planted something on your grid");
      break;
    }
    case "scan": {
      let found = 0;
      for (const c of s.cells) {
        if (c.kind === "node" && c.owner === side && c.trap && c.trap.by === enemy) {
          c.trap.revealed = true;
          found++;
        }
      }
      let disarmLeft = def.p.disarm ?? 0;
      if (disarmLeft > 0) {
        for (const c of s.cells) {
          if (disarmLeft <= 0) break;
          if (c.kind === "node" && c.owner === side && c.trap && c.trap.by === enemy) {
            c.trap = null;
            disarmLeft--;
            found--;
          }
        }
      }
      if (def.p.intent && side === "player") s.intentRevealed = true;
      emit(s, "scan");
      if (side === "player") {
        say(s, found > 0 ? `Scan: ${found} armed node${found === 1 ? "" : "s"} revealed` : "Scan: your grid is clean");
      }
      break;
    }
    case "redirect": {
      const steps = def.p.rotSteps ?? 1;
      for (const idx of targets) {
        const c = s.cells[idx];
        c.rot = (c.rot + steps) % 4;
        c.spin += steps;
      }
      if (side === "player") s.lastPlayerHitRound = s.round;
      emit(s, "redirect");
      say(s, side === "player" ? "Their node twisted off-line" : "It twisted your route");
      settle(s);
      break;
    }
    case "shield": {
      // The player acts first in a round, so a shield they cast must survive
      // the opponent turn of the same round; the opponent's must survive the
      // player turn of the next round.
      const rounds = def.p.shieldRounds ?? 1;
      const through = side === "player" ? s.round + rounds - 1 : s.round + rounds;
      for (const idx of targets) {
        s.cells[idx].shieldedThroughRound = Math.max(
          s.cells[idx].shieldedThroughRound,
          through,
        );
      }
      emit(s, "shield");
      break;
    }
    case "overload": {
      if (def.p.lockTurns) {
        const target = targets[0] as unknown as number;
        // Overload's target is an ability index into the enemy's set, passed
        // through targets[0]; resolve to an id at the call sites.
        void target;
      }
      if (def.p.enemyRamDrain) enemyEcon.drainNext += def.p.enemyRamDrain;
      emit(s, "overload");
      break;
    }
    case "overclock": {
      econ.boostAmount = def.p.ramBoost ?? 2;
      econ.boostTurns = def.p.boostTurns ?? 1;
      emit(s, "overclock");
      if (side === "player") say(s, "Overclock primed: bonus RAM next turn");
      break;
    }
    case "firewall": {
      const rounds = def.p.wallRounds ?? 1;
      econ.wallThrough = side === "player" ? s.round + rounds - 1 : s.round + rounds;
      if (def.p.enemyRamDrain) enemyEcon.drainNext += def.p.enemyRamDrain;
      emit(s, "firewall");
      break;
    }
    case "backdoor": {
      if (def.p.purge) {
        for (const c of s.cells) {
          if (c.kind === "node" && c.owner === side && c.trap && c.trap.by === enemy) {
            c.trap = null;
          }
        }
      }
      if (def.p.shieldRounds && targets.length > 0) {
        const through =
          side === "player" ? s.round + def.p.shieldRounds - 1 : s.round + def.p.shieldRounds;
        s.cells[targets[0]].shieldedThroughRound = Math.max(
          s.cells[targets[0]].shieldedThroughRound,
          through,
        );
      }
      if (def.p.intent && side === "player") s.intentRevealed = true;
      emit(s, "backdoor");
      if (side === "player") say(s, "Backdoor: your grid is purged");
      break;
    }
  }
}

/** Overload needs an ability id, not a cell index; handled apart from cast. */
export function applyOverloadLock(
  s: DuelState,
  side: Side,
  def: AbilityDef,
  abilityId: string,
): void {
  const enemy = otherSide(side);
  const lockTurns = def.p.lockTurns ?? 1;
  s.econ[enemy].disabled[abilityId] = Math.max(
    s.econ[enemy].disabled[abilityId] ?? 0,
    lockTurns,
  );
  if (side === "opp") {
    const name = ABILITY_BY_ID[abilityId]?.name ?? "an ability";
    say(s, `Overload: ${name} is jammed for your next turn`);
  }
}

/**
 * Fire one pending enemy trap on this side's powered nodes, if any.
 * Returns true when a trap fired (the side's turn is consumed).
 */
export function fireTrapIfAny(s: DuelState, side: Side): boolean {
  const enemy = otherSide(side);
  const powered = s.power[side];
  let pick = -1;
  let bestDist = Infinity;
  for (let i = 0; i < s.cells.length; i++) {
    const c = s.cells[i];
    if (c.kind !== "node" || c.owner !== side) continue;
    if (!c.trap || c.trap.by !== enemy) continue;
    if (!powered[i]) continue;
    const core = s.cells[s.coreIdx];
    const dist = Math.abs(c.x - core.x) + Math.abs(c.y - core.y);
    if (dist < bestDist) {
      bestDist = dist;
      pick = i;
    }
  }
  if (pick === -1) return false;
  const trap = s.cells[pick].trap as { by: Side; revealed: boolean; drain: number };
  s.cells[pick].trap = null;
  const econ = s.econ[side];
  econ.trapsFired++;
  if (trap.drain > 0) econ.drainNext += trap.drain;
  emit(s, "trapFire");
  say(
    s,
    side === "player"
      ? "Trap fired on your line: turn lost"
      : "Your trap fired: it loses this turn",
  );
  return true;
}

function beginTurnEconomy(s: DuelState, side: Side): void {
  const econ = s.econ[side];
  for (const id of Object.keys(econ.disabled)) {
    econ.disabled[id]--;
    if (econ.disabled[id] <= 0) delete econ.disabled[id];
  }
  let ram = econ.ramPerTurn + econ.carry;
  if (econ.boostTurns > 0) {
    ram += econ.boostAmount;
    econ.boostTurns--;
    if (econ.boostTurns === 0) econ.boostAmount = 0;
  }
  ram -= econ.drainNext;
  econ.drainNext = 0;
  econ.ram = Math.max(0, ram);
  econ.carry = 0;
  econ.abilityUsed = false;
}

export function startOppTurn(s: DuelState): void {
  s.turn = "opp";
  s.oppTurn = { trapChecked: false, placed: 0, pendingAbility: null };
  beginTurnEconomy(s, "opp");
}

/** End the opponent's turn: advance the round, hand control back or cap out. */
export function endOppTurn(s: DuelState): void {
  if (s.phase !== "playing") return;
  const econ = s.econ.opp;
  econ.carry = Math.min(2, Math.max(0, econ.ram));
  s.round++;
  if (s.round > ROUND_CAP) {
    const pd = placementsToCore(s.cells, s.w, s.h, "player", s.coreIdx);
    const od = placementsToCore(s.cells, s.w, s.h, "opp", s.coreIdx);
    finishDuel(s, pd <= od ? "player" : "opp", "cap");
    return;
  }
  s.turn = "player";
  beginTurnEconomy(s, "player");
  if (fireTrapIfAny(s, "player")) {
    // The whole turn evaporates: no actions, nothing carried.
    s.econ.player.ram = 0;
    startOppTurn(s);
  }
}

export function endPlayerTurn(s: DuelState): void {
  if (s.phase !== "playing") return;
  const econ = s.econ.player;
  econ.carry = Math.min(2, Math.max(0, econ.ram));
  emit(s, "endTurn");
  startOppTurn(s);
}
