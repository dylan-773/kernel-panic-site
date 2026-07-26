import {
  DefendMode,
  LOCK_ROUNDS,
  OppMode,
  PAR_STRAIN_PER,
  PROGRAM_COST,
  Program,
  SCAN_RANGE,
  SIPHON_STEAL,
  Tier,
  WARD_RADIUS,
  WARD_ROUNDS,
  cascadeRam,
} from "./content/kit";
import { computeDuelPower, routeCost, routePlan, runFlood } from "./duel-power";
import { DuelState, PIECE_X, ROUND_CAP, Side, TrapKind, otherSide } from "./duel-types";
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

export function kitHas(s: DuelState, aug: string): boolean {
  return s.kit.augments.includes(aug);
}

export function tierOf(s: DuelState, side: Side, prog: Program): Tier {
  if (side === "opp") return s.cfg.oppTier;
  if (prog === "scan") return s.kit.scanTier;
  if (prog === "attack") return s.kit.attackTier;
  return s.kit.defendTier;
}

/** Has the tutorial player demonstrated all three programs? */
export function tutorialLessonDone(s: DuelState): boolean {
  return s.tutFlags.scanned && s.tutFlags.purged && s.tutFlags.attacked;
}

/**
 * Tutorial gating: programs come online one at a time as the script flags
 * them. Scan wakes when the machine has planted; Defend after the first
 * scan; Attack after the first purge. Outside the tutorial, always on.
 */
export function programUnlocked(s: DuelState, prog: Program): boolean {
  if (!s.cfg.tutorial) return true;
  if (prog === "scan") {
    return s.tutFlags.scanned || s.cells.some((c) => c.trap && c.trap.by === "opp");
  }
  if (prog === "defend") return s.tutFlags.scanned;
  return s.tutFlags.purged;
}

/** ATTACK is 1 RAM, except a Cheap Shot diver's first cast of the dive. */
export function attackCost(s: DuelState, side: Side): number {
  if (side === "player" && s.econ.player.attacksCast === 0 && kitHas(s, "cheapShot")) return 0;
  return PROGRAM_COST;
}

export function programCost(s: DuelState, side: Side, prog: Program): number {
  return prog === "attack" ? attackCost(s, side) : PROGRAM_COST;
}

export function finishDuel(s: DuelState, winner: Side, kind: "core" | "cap"): void {
  s.phase = winner === "player" ? "won" : "lost";
  s.winKind = kind;
  s.notice = null;
  if (winner === "player") {
    // Strain is an efficiency bill: rotations past par, sprung traps,
    // and dragging the link to the cap. At or under par, clean, zero.
    const over = Math.max(0, s.econ.player.rotations - s.par);
    let chip = PAR_STRAIN_PER * over;
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
 * and win take priority). Cascades pay RAM; a halt trap on the acting side
 * forfeits their turn (returns true).
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

    // Cascades bank RAM for the next turn: the chain you set up buys the
    // tempo to keep pushing, without compounding inside one turn.
    let bonus = cascadeRam(f.claimed.length);
    if (bonus > 0 && side === "player" && kitHas(s, "surge")) bonus += 1;
    if (bonus > 0) {
      s.econ[side].drainNext -= bonus;
      emit(s, side === "player" ? "cascadeRam" : "cascadeRamOpp", bonus);
    }

    for (const trap of f.trapsFired) {
      const econ = s.econ[side];
      const enemyEcon = s.econ[otherSide(side)];
      econ.trapsFired++;
      if (trap.kind === "halt") {
        econ.drainNext += trap.drain;
        if (side === acting) {
          actingTrapped = true;
        } else {
          econ.loseNextTurn = true;
        }
        emit(s, "trapFire", 1);
        say(
          s,
          side === "player"
            ? "HALT TRAP. Your signal hit an armed node. The cascade lands, then your turn is forfeit."
            : "Your halt trap fired. The intrusion stalls a full cycle.",
        );
      } else {
        econ.drainNext += trap.drain;
        enemyEcon.drainNext -= trap.drain;
        emit(s, "siphonFire", trap.drain);
        say(
          s,
          side === "player"
            ? `SIPHON TRAP. It bleeds ${trap.drain} RAM out of your next turn.`
            : `Your siphon fired. ${trap.drain} RAM drains out of its next turn, into yours.`,
        );
      }
      if (otherSide(side) === "player" && kitHas(s, "echoTap")) {
        s.econ.player.drainNext -= 2;
      }
    }
    if (f.reachedCore) {
      // The tutorial is unwinnable by definition: the moment the player's
      // flood actually touches the core, every port slams shut at once.
      if (s.cfg.tutorial && side === "player") {
        say(s, "Your flood touches the core... and every port on the machine slams shut at once.");
        finishDuel(s, "opp", "core");
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
  econ.rotations += 1;
  emit(s, "rotate");
  const trapped = settleFloods(s, side);
  if (trapped && s.phase === "playing") {
    if (side === "player") forceEndPlayerTurn(s);
    else endOppTurn(s);
  }
  return true;
}

/**
 * Spend a patch cell: the slag block becomes an open cross junction.
 * 1 RAM, once per turn, consumes a cell. Does not count against par.
 */
export function applyPlace(s: DuelState, side: Side, idx: number): boolean {
  const econ = s.econ[side];
  if (econ.ram < 1 || s.patchCells < 1 || econ.placedThisTurn) return false;
  const c = s.cells[idx];
  c.kind = "node";
  c.base = PIECE_X;
  c.rot = 0;
  // Slag Ward rider: the fresh junction opens under cover.
  if (side === "player" && kitHas(s, "slagWard")) {
    c.wardThroughRound = Math.max(c.wardThroughRound, s.round);
    c.wardBy = "player";
  }
  econ.ram -= 1;
  econ.placedThisTurn = true;
  s.patchCells -= 1;
  emit(s, "place");
  say(s, "PATCH CELL. The slag melts into a live cross junction.");
  const trapped = settleFloods(s, side);
  if (trapped && s.phase === "playing") {
    if (side === "player") forceEndPlayerTurn(s);
    else endOppTurn(s);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Target legality                                                     */
/* ------------------------------------------------------------------ */

export function armTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node" || c.owner !== "none") return false;
  if (c.trap) return false;
  // A ward the victim raised refuses new traps.
  if (c.wardThroughRound >= s.round && c.wardBy === otherSide(caster)) return false;
  return true;
}

export function redirectTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node") return false;
  if (c.owner === caster) return false; // own nodes rotate for 1 RAM instead
  if (c.lockedThroughRound >= s.round && c.lockedBy === otherSide(caster)) return false;
  // An enemy ward refuses redirects the same way it refuses traps.
  if (c.wardThroughRound >= s.round && c.wardBy === otherSide(caster)) return false;
  return true;
}

export function purgeTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node" || !c.trap) return false;
  if (c.trap.by !== otherSide(caster)) return false;
  // The player defuses only what Scan exposed; the machine sees everything.
  if (caster === "player" && !c.trap.revealed) return false;
  return true;
}

export function lockTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node") return false;
  if (c.owner === otherSide(caster)) return false;
  if (c.lockedThroughRound >= s.round) return false;
  return true;
}

export function wardTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.cells[idx];
  if (!c || c.kind !== "node") return false;
  if (c.owner === otherSide(caster)) return false;
  return true;
}

export function attackTargetLegal(s: DuelState, caster: Side, mode: OppMode, idx: number): boolean {
  return mode === "redirect" ? redirectTargetLegal(s, caster, idx) : armTargetLegal(s, caster, idx);
}

export function defendTargetLegal(s: DuelState, caster: Side, mode: DefendMode, idx: number): boolean {
  if (mode === "purge") return purgeTargetLegal(s, caster, idx);
  if (mode === "lock") return lockTargetLegal(s, caster, idx);
  return wardTargetLegal(s, caster, idx);
}

/* ------------------------------------------------------------------ */
/* Program resolution                                                  */
/* ------------------------------------------------------------------ */

function entryKindOf(side: Side): "entryP" | "entryO" {
  return side === "player" ? "entryP" : "entryO";
}

/**
 * Resolve one program cast. `mode` is ignored for scan. Targets must be
 * validated by the caller (reducer or planner) before this runs.
 */
export function applyCast(
  s: DuelState,
  side: Side,
  prog: Program,
  mode: OppMode | null,
  targets: number[],
): void {
  const econ = s.econ[side];
  econ.ram -= programCost(s, side, prog);
  econ.used[prog] = true;
  if (prog === "attack") econ.attacksCast++;
  if (s.cfg.tutorial && side === "player") {
    if (prog === "scan") s.tutFlags.scanned = true;
    if (prog === "defend") s.tutFlags.purged = true;
    if (prog === "attack") s.tutFlags.attacked = true;
    if (s.tutorialLessonRound === 0 && tutorialLessonDone(s)) {
      s.tutorialLessonRound = s.round;
    }
  }
  const enemy = otherSide(side);

  if (prog === "scan") {
    const range = SCAN_RANGE[tierOf(s, side, "scan")];
    const owned = s.cells.filter(
      (c) => (c.kind === "node" && c.owner === side) || c.kind === entryKindOf(side),
    );
    let found = 0;
    for (const c of s.cells) {
      if (!c.trap || c.trap.by !== enemy || c.trap.revealed) continue;
      if (owned.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) <= range)) {
        c.trap.revealed = true;
        found++;
      }
    }
    if (side === "player" && kitHas(s, "tapLine")) {
      const plan = routePlan(s, "opp");
      if (plan) {
        s.routeTrace = { round: s.round, cells: plan.path.map((p) => p.idx) };
        emit(s, "trace");
      }
    }
    emit(s, "scan");
    if (side === "player") {
      say(
        s,
        found > 0
          ? `SCAN: ${found} armed node${found === 1 ? "" : "s"} exposed, permanently.`
          : "SCAN: nothing armed in range.",
      );
    }
    return;
  }

  if (prog === "attack") {
    if (mode === "redirect") {
      for (const idx of targets) {
        const c = s.cells[idx];
        c.rot = (c.rot + 1) % 4;
        c.spin += 1;
        // Jam Anchor rider: the twist holds for a round.
        if (side === "player" && kitHas(s, "jamAnchor")) {
          c.lockedThroughRound = Math.max(c.lockedThroughRound, s.round);
          c.lockedBy = "player";
        }
      }
      if (side === "player") s.lastPlayerHitRound = s.round;
      emit(s, "redirect", targets.length);
      say(
        s,
        side === "player"
          ? "REDIRECT. Their line twists off true."
          : "It twisted one of your junctions off true. Power is down past the break.",
      );
      settleFloods(s, side);
    } else {
      const kind: TrapKind = mode === "armSiphon" ? "siphon" : "halt";
      let drain = 0;
      if (kind === "siphon") {
        drain =
          SIPHON_STEAL[tierOf(s, side, "attack")] +
          (side === "player" && kitHas(s, "siphonPlus") ? 1 : 0);
      } else if (side === "player" && kitHas(s, "tripwire")) {
        drain = 2;
      }
      for (const idx of targets) {
        s.cells[idx].trap = { by: side, revealed: side === "player", kind, drain };
      }
      if (side === "player") s.lastPlayerHitRound = s.round;
      emit(s, "trapSet");
      say(
        s,
        side === "player"
          ? kind === "siphon"
            ? "Siphon armed. Let it walk into your meter."
            : "Halt trap armed. Let it walk into it."
          : "It planted a trap on an open junction nearby. Tread carefully.",
      );
    }
    return;
  }

  // DEFEND.
  if (mode === "purge") {
    let n = 0;
    for (const idx of targets) {
      if (s.cells[idx].trap) {
        s.cells[idx].trap = null;
        n++;
      }
    }
    // Sweep Credit: a purge that actually lands pays for itself.
    if (n > 0 && side === "player" && kitHas(s, "sweepCredit")) {
      econ.ram += PROGRAM_COST;
    }
    emit(s, "purge", n);
    say(
      s,
      side === "player"
        ? `PURGE. ${n} trap${n === 1 ? "" : "s"} defused.`
        : "It swept your traps off its lane.",
    );
  } else if (mode === "lock") {
    const through = side === "player" ? s.round + LOCK_ROUNDS - 1 : s.round + LOCK_ROUNDS;
    for (const idx of targets) {
      const c = s.cells[idx];
      c.lockedThroughRound = Math.max(c.lockedThroughRound, through);
      c.lockedBy = side;
    }
    if (side === "player" && targets.some((i) => s.cells[i].owner === "none")) {
      s.lastPlayerHitRound = s.round;
    }
    emit(s, "lock");
    say(
      s,
      side === "player"
        ? "LOCK. That junction is frozen solid."
        : "It clamped a junction solid. You cannot turn that one for now.",
    );
  } else if (mode === "ward") {
    const radius = WARD_RADIUS[tierOf(s, side, "defend")];
    const through = side === "player" ? s.round + WARD_ROUNDS - 1 : s.round + WARD_ROUNDS;
    const center = s.cells[targets[0]];
    for (const c of s.cells) {
      if (c.kind !== "node" || c.owner === enemy) continue;
      if (Math.abs(c.x - center.x) + Math.abs(c.y - center.y) > radius) continue;
      c.wardThroughRound = Math.max(c.wardThroughRound, through);
      c.wardBy = side;
    }
    emit(s, "ward");
    say(
      s,
      side === "player"
        ? "WARD up. Nothing gets planted in that patch."
        : "It warded a whole approach. Your traps will not land there.",
    );
  }

  // Bulwark rider: any player DEFEND also bolts its targets for one round.
  if (side === "player" && kitHas(s, "bulwark")) {
    for (const idx of targets) {
      const c = s.cells[idx];
      if (c.kind !== "node" || c.owner === "opp") continue;
      if (c.lockedThroughRound >= s.round && c.lockedBy === "opp") continue;
      c.lockedThroughRound = Math.max(c.lockedThroughRound, s.round);
      c.lockedBy = "player";
    }
  }
}

/* ------------------------------------------------------------------ */
/* Turn transitions                                                    */
/* ------------------------------------------------------------------ */

function beginTurnEconomy(s: DuelState, side: Side): boolean {
  const econ = s.econ[side];
  econ.used = { scan: false, attack: false, defend: false };
  econ.placedThisTurn = false;
  if (econ.loseNextTurn) {
    econ.loseNextTurn = false;
    econ.ram = 0;
    econ.carry = 0;
    emit(s, "turnLost");
    say(s, side === "player" ? "Your turn burns away in the trap's wake." : "The intrusion stalls a full cycle.");
    return false;
  }
  const ram = econ.ramPerTurn + econ.carry - econ.drainNext;
  econ.drainNext = 0;
  econ.ram = Math.max(0, ram);
  econ.carry = 0;
  return true;
}

export function startOppTurn(s: DuelState): void {
  s.turn = "opp";
  s.oppTurn = { started: false, pendingCast: null, queue: [], replans: 3, lastReplanCost: Infinity, ramAtStart: 0, aim: null };
  const acts = beginTurnEconomy(s, "opp");
  s.oppTurn.ramAtStart = s.econ.opp.ram;
  if (!acts) {
    endOppTurn(s);
  }
}

export function endOppTurn(s: DuelState): void {
  if (s.phase !== "playing") return;
  const econ = s.econ.opp;
  econ.carry = Math.min(econ.carryCap, Math.max(0, econ.ram));
  s.round++;
  if (s.routeTrace && s.routeTrace.round < s.round) s.routeTrace = null;
  // The tutorial ends on the machine's terms: one victory-lap round after
  // the lesson completes, or round 7 if the player dawdles, it stops
  // playing fair and seals itself.
  if (s.cfg.tutorial) {
    const lessonOver = tutorialLessonDone(s) && s.round > s.tutorialLessonRound + 1;
    if (lessonOver || s.round >= 7) {
      say(s, "The machine stops pretending. The door was never really open.");
      finishDuel(s, "opp", "core");
      return;
    }
  }
  if (s.round > ROUND_CAP) {
    const pd = routeCost(s, "player");
    const od = routeCost(s, "opp");
    finishDuel(s, pd <= od ? "player" : "opp", "cap");
    return;
  }
  // A severed route never heals (enemy territory only grows), so a walled
  // player is already beaten: call it instead of a dead march to the cap.
  {
    const pd = routeCost(s, "player");
    if (!isFinite(pd)) {
      const od = routeCost(s, "opp");
      if (isFinite(od)) {
        say(s, "SEVERED. Its territory walls your port off from the core. No route remains.");
        finishDuel(s, "opp", "core");
      } else {
        say(s, "Total gridlock. Neither signal can reach the core. The link collapses in your favor.");
        finishDuel(s, "player", "cap");
      }
      return;
    }
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
  econ.carry = Math.min(econ.carryCap, Math.max(0, econ.ram));
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
