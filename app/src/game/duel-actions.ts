import { ABILITY_BY_ID } from "./content/abilities";
import { computeDuelPower, isFrontier, routeCost, runFlood } from "./duel-power";
import { AbilityDef, DuelState, ROUND_CAP, Side, otherSide } from "./duel-types";
import { nextU32 } from "./rng";

/**
 * Shared state-mutation helpers for the flood-claim duel. Both sides play
 * by exactly these rules; the reducer validates player input and the
 * opponent planner picks moves, but resolution lives here.
 */

export function emit(s: DuelState, kind: string, n?: number): void {
  s.fx.push({ id: s.fxNext++, kind, n });
}

export function say(s: DuelState, text: string): void {
  s.notice = { id: s.fxNext++, text };
}

export function roll(s: DuelState): number {
  const [v, next] = nextU32(s.rngState);
  s.rngState = next;
  return v;
}

export function finishDuel(s: DuelState, winner: Side, kind: "core" | "cap"): void {
  s.phase = winner === "player" ? "won" : "lost";
  s.winKind = kind;
  s.notice = null;
  if (winner === "player") {
    const remaining = routeCost(s, "opp");
    const rem = isFinite(remaining) ? Math.min(remaining, s.oppStartCost) : s.oppStartCost;
    const progress = Math.max(0, Math.min(1, 1 - rem / s.oppStartCost));
    let chip = Math.max(0, Math.round(50 * (progress - 0.5)));
    chip += 4 * s.econ.player.trapsFired;
    if (kind === "cap") chip += 10;
    s.strainChip = Math.min(40, chip);
  } else {
    s.strainChip = 0;
  }
  emit(s, winner === "player" ? "win" : "lose", s.strainChip);
}

/**
 * Re-run both floods after a board change, acting side first (its claims
 * and win take priority). Returns true when a trap fired on the acting
 * side — their turn is forfeit.
 */
export function settleFloods(s: DuelState, acting: Side): boolean {
  let actingTrapped = false;
  for (const side of [acting, otherSide(acting)] as Side[]) {
    if (s.phase !== "playing") break;
    const f = runFlood(s, side);
    if (f.claimed.length >= 3) {
      emit(s, "cascade", f.claimed.length);
    } else if (f.claimed.length > 0) {
      emit(s, "claim", f.claimed.length);
    }
    if (f.trapFired) {
      const econ = s.econ[side];
      econ.trapsFired++;
      econ.drainNext += f.trapFired.drain;
      if (side === acting) {
        actingTrapped = true;
      } else {
        econ.loseNextTurn = true;
      }
      emit(s, "trapFire", 1);
      say(
        s,
        side === "player"
          ? "TRAP. Your signal hit an armed node. Turn lost."
          : "Your trap fired. The intrusion chokes on it.",
      );
    }
    if (f.reachedCore) {
      // The tutorial machine never hands the player an accidental win: a
      // cascade IT caused cannot complete the player's route.
      if (s.cfg.tutorial && side === "player" && acting === "opp") {
        say(s, "Your line surges toward the core. The machine pinches it off.");
      } else {
        finishDuel(s, side, "core");
      }
    }
  }
  s.power = computeDuelPower(s);
  return actingTrapped;
}

/** Rotate a node one quarter turn for `side`; returns false when denied. */
export function applyRotate(s: DuelState, side: Side, idx: number): boolean {
  const econ = s.econ[side];
  if (econ.ram < 1) return false;
  const c = s.cells[idx];
  c.rot = (c.rot + 1) % 4;
  c.spin += 1;
  econ.ram -= 1;
  emit(s, "rotate");
  const trapped = settleFloods(s, side);
  if (trapped && s.phase === "playing") {
    if (side === "player") forceEndPlayerTurn(s);
    else endOppTurn(s);
  }
  return true;
}

/** Firewall / shield protection against enemy Arm, Redirect and Shield-lock. */
export function isProtectedFromCast(s: DuelState, caster: Side, idx: number): boolean {
  const victim = otherSide(caster);
  const c = s.cells[idx];
  if (c.lockedThroughRound >= s.round && c.lockedBy === victim) return true;
  const wall = s.econ[victim].wallThrough >= s.round;
  if (wall && (c.owner === victim || isFrontier(s, victim, idx))) return true;
  return false;
}

export function armTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node" || c.owner !== "none") return false;
  if (c.trap) return false;
  return !isProtectedFromCast(s, caster, idx);
}

export function redirectTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node") return false;
  if (c.owner === caster) return false; // own nodes rotate for 1 RAM instead
  return !isProtectedFromCast(s, caster, idx);
}

export function shieldTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node") return false;
  if (c.owner === otherSide(caster)) return false;
  if (c.lockedThroughRound >= s.round) return false;
  return !(c.owner === "none" && isProtectedFromCast(s, caster, idx));
}

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
          revealed: side === "player" ? true : s.trapsRevealed,
          drain: def.p.drain ?? 0,
        };
      }
      if (side === "player") s.lastPlayerHitRound = s.round;
      emit(s, "trapSet");
      say(s, side === "player" ? "Trap armed. Let it walk into it." : "It planted something out there.");
      break;
    }
    case "scan": {
      s.trapsRevealed = true;
      let found = 0;
      for (const c of s.cells) {
        if (c.trap && c.trap.by === enemy) {
          c.trap.revealed = true;
          found++;
        }
      }
      let disarmLeft = def.p.disarm ?? 0;
      if (disarmLeft > 0) {
        const mine = s.cells
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.trap && c.trap.by === enemy)
          .sort((a, b) => a.c.claimSeq - b.c.claimSeq);
        for (const { c } of mine) {
          if (disarmLeft <= 0) break;
          c.trap = null;
          disarmLeft--;
          found--;
        }
      }
      if (def.p.intent && side === "player") s.intentRevealed = true;
      emit(s, "scan");
      if (side === "player") {
        say(s, found > 0 ? `SCAN: ${found} armed node${found === 1 ? "" : "s"} exposed, permanently` : "SCAN: the board is clean");
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
      emit(s, "redirect", targets.length);
      say(s, side === "player" ? "REDIRECT. Their line twists off true." : "It twisted your line.");
      settleFloods(s, side);
      break;
    }
    case "shield": {
      const rounds = def.p.shieldRounds ?? 1;
      const through = side === "player" ? s.round + rounds - 1 : s.round + rounds;
      for (const idx of targets) {
        const c = s.cells[idx];
        c.lockedThroughRound = Math.max(c.lockedThroughRound, through);
        c.lockedBy = side;
      }
      if (side === "player" && targets.some((i) => s.cells[i].owner === "none")) {
        s.lastPlayerHitRound = s.round;
      }
      emit(s, "shield");
      say(s, side === "player" ? "SHIELD. That junction is frozen solid." : "It hardened a junction.");
      break;
    }
    case "overload": {
      if (def.p.enemyRamDrain) enemyEcon.drainNext += def.p.enemyRamDrain;
      emit(s, "overload");
      break;
    }
    case "overclock": {
      econ.boostAmount = def.p.ramBoost ?? 2;
      econ.boostTurns = def.p.boostTurns ?? 1;
      emit(s, "overclock");
      if (side === "player") say(s, "OVERCLOCK primed. Next turn runs hot.");
      break;
    }
    case "firewall": {
      const rounds = def.p.wallRounds ?? 1;
      econ.wallThrough = Math.max(econ.wallThrough, side === "player" ? s.round + rounds - 1 : s.round + rounds);
      if (def.p.enemyRamDrain) enemyEcon.drainNext += def.p.enemyRamDrain;
      emit(s, "firewall");
      if (side === "player") say(s, "FIREWALL up. Your grid ignores their tricks.");
      break;
    }
    case "backdoor": {
      if (def.p.purge) {
        let purged = 0;
        for (const c of s.cells) {
          if (c.trap && c.trap.by === enemy) {
            c.trap = null;
            purged++;
          }
        }
        if (side === "player") {
          say(s, purged > 0 ? `BACKDOOR. ${purged} trap${purged === 1 ? "" : "s"} wiped off the board.` : "BACKDOOR. Nothing was waiting after all.");
        }
      }
      if (def.p.shieldRounds && targets.length > 0) {
        const through = side === "player" ? s.round + def.p.shieldRounds - 1 : s.round + def.p.shieldRounds;
        const c = s.cells[targets[0]];
        c.lockedThroughRound = Math.max(c.lockedThroughRound, through);
        c.lockedBy = side;
      }
      if (def.p.intent && side === "player") s.intentRevealed = true;
      emit(s, "backdoor");
      break;
    }
  }
}

export function applyOverloadLock(s: DuelState, side: Side, def: AbilityDef, abilityId: string): void {
  const enemy = otherSide(side);
  const lockTurns = def.p.lockTurns ?? 1;
  s.econ[enemy].disabled[abilityId] = Math.max(s.econ[enemy].disabled[abilityId] ?? 0, lockTurns);
  if (side === "opp") {
    const name = ABILITY_BY_ID[abilityId]?.name ?? "an ability";
    say(s, `OVERLOAD. Your ${name} is jammed.`);
  }
}

function beginTurnEconomy(s: DuelState, side: Side): boolean {
  const econ = s.econ[side];
  for (const id of Object.keys(econ.disabled)) {
    econ.disabled[id]--;
    if (econ.disabled[id] <= 0) delete econ.disabled[id];
  }
  if (econ.loseNextTurn) {
    econ.loseNextTurn = false;
    econ.ram = 0;
    econ.carry = 0;
    econ.abilityUsed = true;
    emit(s, "turnLost");
    say(s, side === "player" ? "Your turn burns away in the trap's wake." : "The intrusion stalls a full cycle.");
    return false;
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
  return true;
}

export function startOppTurn(s: DuelState): void {
  s.turn = "opp";
  s.oppTurn = { started: false, pendingAbility: null, queue: [], replans: 3, lastReplanCost: Infinity };
  const acts = beginTurnEconomy(s, "opp");
  if (!acts) {
    endOppTurn(s);
  }
}

export function endOppTurn(s: DuelState): void {
  if (s.phase !== "playing") return;
  const econ = s.econ.opp;
  econ.carry = Math.min(2, Math.max(0, econ.ram));
  s.round++;
  // The tutorial never reaches a third player turn: if the machine has not
  // already won by now, it stops playing fair and seals itself.
  if (s.cfg.tutorial && s.round >= s.tutorialSealRound) {
    say(s, "The machine stops pretending. The door was never really open.");
    finishDuel(s, "opp", "core");
    return;
  }
  if (s.round > ROUND_CAP) {
    const pd = routeCost(s, "player");
    const od = routeCost(s, "opp");
    finishDuel(s, pd <= od ? "player" : "opp", "cap");
    return;
  }
  s.turn = "player";
  const acts = beginTurnEconomy(s, "player");
  if (!acts) {
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

/** A trap consumed the player's turn mid-action: nothing carries over. */
export function forceEndPlayerTurn(s: DuelState): void {
  if (s.phase !== "playing") return;
  s.econ.player.ram = 0;
  s.econ.player.carry = 0;
  startOppTurn(s);
}
