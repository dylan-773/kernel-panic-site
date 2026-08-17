import {
  DefendMode,
  LOCK_ROUNDS,
  PRESSURE_RANGE,
  PRESSURE_STRAIN_PER,
  REDIRECT_STRAIN_PER,
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
  surgeTierOf,
} from "./content/kit";
import { routeCost, routePlan, settlePower } from "./duel-power";
import {
  Board,
  DuelEndKind,
  DuelState,
  ROUND_CAP,
  Side,
  TrapKind,
  isJunction,
  otherSide,
} from "./duel-types";
import { PLACE_COST } from "./patch-cells";
import { nextU32 } from "./rng";

/**
 * Shared state-mutation helpers for the split-board duel. Both sides play
 * by exactly these rules; the reducer validates player input and the
 * opponent planner picks moves, but resolution lives here.
 *
 * Which board a verb acts on is fixed by the verb, never by the payload:
 *
 *   rotate / place  -> your own board
 *   ATTACK modes    -> the enemy's board (redirect, halt, siphon)
 *   DEFEND modes    -> your own board   (purge, lock, ward)
 *
 * Deriving it rather than tagging it is deliberate: a mistagged index would
 * mutate the wrong grid, and there is no way for the reducer and the planner
 * to disagree about a rule neither of them stores.
 */

/** The board a cast of this program and mode lands on, from the caster's view. */
export function targetBoardOf(s: DuelState, caster: Side, prog: Program): Board {
  return prog === "attack" ? s.boards[otherSide(caster)] : s.boards[caster];
}

export function targetSideOf(caster: Side, prog: Program): Side {
  return prog === "attack" ? otherSide(caster) : caster;
}

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
    return s.tutFlags.scanned || s.boards.player.cells.some((c) => c.trap);
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

/**
 * End the dive. `reason` is the player-facing sentence for the result
 * overlay; it survives on state because the toast is cleared here (a
 * 2.4 second toast cannot carry the one line that explains the loss).
 */
export function finishDuel(
  s: DuelState,
  winner: Side,
  kind: DuelEndKind,
  reason?: string,
): void {
  s.phase = winner === "player" ? "won" : "lost";
  s.winKind = kind;
  if (reason) s.endReason = reason;
  s.notice = null;
  if (winner === "player") {
    /*
     * Strain is the bill for every round the machine was winning and every
     * rotation you did not need. A perfect dive still bills exactly zero -
     * every term is avoidable in principle, which is what keeps this an
     * efficiency bill rather than attrition you cannot play out of.
     */
    const over = Math.max(0, s.econ.player.rotations - s.par);
    let chip = PAR_STRAIN_PER * over;
    // First Fault forgives the strain of one sprung trap, never the tempo.
    chip += 4 * Math.max(0, s.econ.player.trapsFired - (kitHas(s, "firstFault") ? 1 : 0));
    // Every twist it landed on your grid cost you ~3 RAM to undo.
    chip += REDIRECT_STRAIN_PER * s.econ.player.redirectsTaken;
    // Rounds it spent close enough to its own goal to be about to win.
    chip += PRESSURE_STRAIN_PER * s.pressureRounds;
    if (kind === "cap") chip += 10;
    s.strainChip = Math.min(45, chip);
  } else {
    s.strainChip = 0;
  }
  emit(s, winner === "player" ? "win" : "lose", s.strainChip);
}

/**
 * Re-settle ONE board after a change to it. `owner` is whose grid it is —
 * cascades pay them, traps fire on them, and lighting the goal wins for them.
 * `acting` is whose turn it is, which only matters for deciding whether a
 * halt trap forfeits the current turn or the next one.
 *
 * Touch-move: this runs the instant a junction turns, so every twist has to be
 * thought out before you make it. The turn's single undo softens a misread,
 * never a mine.
 *
 * Note the case worth knowing about: a REDIRECT settles the ENEMY's board, so
 * a badly chosen twist can complete their route and hand them the dive.
 * Returns true when the acting side must forfeit their turn right now.
 */
export function settleBoard(s: DuelState, owner: Side, acting: Side): boolean {
  if (s.phase !== "playing") return false;
  const b = s.boards[owner];
  const f = settlePower(b);
  const mine = owner === "player";

  // Side-tagged: an untagged "cascade" rendered the machine lighting half
  // its board as a green win banner on the player's screen.
  if (f.built.length >= 3) {
    emit(s, mine ? "cascade" : "cascadeOpp", f.built.length);
  } else if (f.built.length > 0) {
    emit(s, mine ? "claim" : "claimOpp", f.built.length);
  }

  // Cascades bank RAM for the next turn: the chain you set up buys the
  // tempo to keep pushing, without compounding inside one turn. Only first
  // lights count, so cutting and re-lighting your own chain pays nothing.
  const bonus = cascadeRam(f.built.length);
  if (bonus > 0) {
    s.econ[owner].drainNext -= bonus;
    emit(s, mine ? "cascadeRam" : "cascadeRamOpp", bonus);
  }

  /*
   * Surge: what a big light does that a small one cannot. A cascade is a
   * power surge, so it blows the clamps on the board it happened on, and a
   * big enough one arcs across and cooks one of their armed traps. This is
   * the fast-win route the design is supposed to reward - engineered, not
   * ground out - and it is the counter to a lock-heavy opponent.
   */
  const surge = surgeTierOf(f.built.length);
  if (surge === "surge" || surge === "break") {
    let broke = 0;
    for (const c of b.cells) {
      if (c.lockedThroughRound >= s.round && c.lockedBy !== null && c.lockedBy !== owner) {
        c.lockedThroughRound = 0;
        c.lockedBy = null;
        broke++;
      }
    }
    if (broke > 0) {
      emit(s, mine ? "surgeBreak" : "surgeBreakOpp", broke);
      if (mine) say(s, `SURGE. The overload shears ${broke} clamp${broke === 1 ? "" : "s"} off your grid.`);
    }
  }
  if (surge === "break") {
    // The overload burns out one of the mines they left on your grid before
    // you ever walk into it. Their cast, wasted.
    const armed = b.cells.find((c) => c.trap);
    if (armed) {
      armed.trap = null;
      emit(s, mine ? "surgeArc" : "surgeArcOpp", 1);
      if (mine) say(s, "The overload cooks one of its armed nodes dead before you reach it.");
    }
  }

  let actingTrapped = false;
  for (const trap of f.trapsFired) {
    const econ = s.econ[owner];
    const enemyEcon = s.econ[otherSide(owner)];
    econ.trapsFired++;
    if (trap.kind === "halt") {
      econ.drainNext += trap.drain;
      if (owner === acting) {
        actingTrapped = true;
      } else {
        econ.loseNextTurn = true;
      }
      emit(s, "trapFire", 1);
      say(
        s,
        mine
          ? "HALT TRAP. Your signal hit an armed node. The cascade lands, then your turn is forfeit."
          : "Your halt trap fired. The intrusion stalls a full cycle.",
      );
    } else {
      econ.drainNext += trap.drain;
      enemyEcon.drainNext -= trap.drain;
      emit(s, "siphonFire", trap.drain);
      say(
        s,
        mine
          ? `SIPHON TRAP. It bleeds ${trap.drain} RAM out of your next turn.`
          : `Your siphon fired. ${trap.drain} RAM drains out of its next turn, into yours.`,
      );
    }
    if (!mine && kitHas(s, "echoTap")) {
      s.econ.player.drainNext -= 2;
    }
  }

  if (f.reachedGoal) {
    // The tutorial is unwinnable by definition: the moment the player's
    // signal actually reaches the goal, the machine stops pretending.
    if (s.cfg.tutorial && owner === "player") {
      finishDuel(
        s,
        "opp",
        "seal",
        "Your signal reached the goal, and every port on the machine slammed shut at once.",
      );
    } else {
      finishDuel(
        s,
        owner,
        "goal",
        mine
          ? "Your signal reached the goal first. The intrusion collapses."
          : "It lit its goal before you lit yours.",
      );
    }
  }
  return actingTrapped;
}

/** Rotate a node on your own board one quarter turn; false when denied. */
export function applyRotate(s: DuelState, side: Side, idx: number): boolean {
  const econ = s.econ[side];
  if (econ.ram < 1) return false;
  const c = s.boards[side].cells[idx];
  c.rot = (c.rot + 1) % 4;
  c.spin += 1;
  econ.ram -= 1;
  econ.rotations += 1;
  emit(s, "rotate");
  const trapped = settleBoard(s, side, side);
  if (trapped && s.phase === "playing") {
    if (side === "player") forceEndPlayerTurn(s);
    else endOppTurn(s);
  }
  return true;
}

/**
 * Spend a patch piece: the slag block becomes a live junction with exactly
 * the piece's arms, at its fixed orientation. PLACE_COST RAM, once per turn,
 * consumes the piece. Does not count against par. The placed node is an
 * ordinary neutral junction afterward: it rotates, floods claim it, and
 * routePlan prices it like anything else.
 */
export function applyPlace(s: DuelState, side: Side, idx: number, pouchIdx: number): boolean {
  const econ = s.econ[side];
  if (econ.ram < PLACE_COST || econ.placedThisTurn) return false;
  const mask = s.patchPouch[pouchIdx];
  if (mask === undefined) return false;
  const c = s.boards[side].cells[idx];
  c.kind = "node";
  c.base = mask;
  c.rot = 0;
  c.fused = true;
  econ.ram -= PLACE_COST;
  // Splice Refund rider: the placement cast is free, the piece is not.
  if (side === "player" && kitHas(s, "patchRefund")) econ.ram += PLACE_COST;
  econ.placedThisTurn = true;
  s.patchPouch = s.patchPouch.filter((_, i) => i !== pouchIdx);
  emit(s, "place");
  say(s, "PATCH PIECE. The slag melts into a live junction, arms exactly as held.");
  const trapped = settleBoard(s, side, side);
  if (trapped && s.phase === "playing") {
    if (side === "player") forceEndPlayerTurn(s);
    else endOppTurn(s);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Target legality                                                     */
/* ------------------------------------------------------------------ */
/*
 * Every predicate below reads the board the cast actually lands on, so an
 * index always means "cell on the target board". ATTACK indexes the enemy's
 * grid, DEFEND the caster's own.
 */

/** Traps land on ground the victim has not lit yet: you mine ahead of them. */
export function armTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.boards[otherSide(caster)].cells[idx];
  if (!c || !isJunction(c) || c.built) return false;
  if (c.trap) return false;
  // A ward the victim raised refuses new traps.
  if (c.wardThroughRound >= s.round && c.wardBy !== caster) return false;
  return true;
}

export function redirectTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.boards[otherSide(caster)].cells[idx];
  if (!c || !isJunction(c)) return false;
  if (c.fused) return false; // welded patch pieces never twist, for anyone
  // A node its owner locked is armored against exactly this.
  if (c.lockedThroughRound >= s.round && c.lockedBy !== caster) return false;
  // A ward refuses redirects the same way it refuses traps.
  if (c.wardThroughRound >= s.round && c.wardBy !== caster) return false;
  return true;
}

export function purgeTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.boards[caster].cells[idx];
  if (!c || !isJunction(c) || !c.trap) return false;
  // The player defuses only what Scan exposed; the machine sees everything.
  if (caster === "player" && !c.trap.revealed) return false;
  return true;
}

/**
 * Lock armors one of your own junctions against their REDIRECT for a couple
 * of rounds. Named nodes, where WARD is area: that is the whole distinction
 * between the two defend modes.
 */
export function lockTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.boards[caster].cells[idx];
  if (!c || !isJunction(c)) return false;
  if (c.lockedThroughRound >= s.round) return false;
  return true;
}

export function wardTargetLegal(s: DuelState, caster: Side, idx: number): boolean {
  const c = s.boards[caster].cells[idx];
  return !!c && isJunction(c);
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

/**
 * Resolve one program cast. `mode` is ignored for scan. Targets must be
 * validated by the caller (reducer or planner) before this runs, and are
 * always indexes into the board `targetBoardOf` names.
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
  if (prog === "scan") econ.scansCast++;
  if (prog === "defend") econ.defendsCast++;
  if (s.cfg.tutorial && side === "player") {
    if (prog === "scan") s.tutFlags.scanned = true;
    if (prog === "defend") s.tutFlags.purged = true;
    if (prog === "attack") s.tutFlags.attacked = true;
    if (s.tutorialLessonRound === 0 && tutorialLessonDone(s)) {
      s.tutorialLessonRound = s.round;
    }
  }
  const enemy = otherSide(side);
  const own = s.boards[side];
  const foe = s.boards[enemy];

  if (prog === "scan") {
    // Their traps are on YOUR board, so scan sweeps your own grid outward
    // from the ground you have built.
    const range = SCAN_RANGE[tierOf(s, side, "scan")];
    const anchors = own.cells.filter((c) => c.kind === "entry" || (isJunction(c) && c.built));
    let found = 0;
    for (const c of own.cells) {
      if (!c.trap || c.trap.revealed) continue;
      if (anchors.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) <= range)) {
        c.trap.revealed = true;
        found++;
      }
    }
    if (side === "player" && kitHas(s, "tapLine")) {
      const plan = routePlan(foe);
      if (plan) {
        // Visible through the next full round, not just the cast round.
        s.routeTrace = { round: s.round + 1, cells: plan.path.map((p) => p.idx) };
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
      s.econ[enemy].redirectsTaken += targets.length;
      for (const idx of targets) {
        const c = foe.cells[idx];
        c.rot = (c.rot + 1) % 4;
        c.spin += 1;
        // Jam Anchor rider: the twist holds through the reply and into
        // the caster's own next turn, so they cannot simply turn it back.
        if (side === "player" && kitHas(s, "jamAnchor")) {
          c.lockedThroughRound = Math.max(c.lockedThroughRound, s.round + 1);
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
      // Settling THEIR board: a badly chosen twist can complete their route.
      settleBoard(s, enemy, side);
    } else {
      const kind: TrapKind = mode === "armSiphon" ? "siphon" : "halt";
      let drain = 0;
      if (kind === "siphon") {
        // Player-side baseline bonus lives here, never in the shared
        // SIPHON_STEAL table (which tier 3+ opponents also read).
        drain =
          SIPHON_STEAL[tierOf(s, side, "attack")] +
          (side === "player" ? 1 : 0) +
          (side === "player" && kitHas(s, "siphonPlus") ? 1 : 0);
      } else if (side === "player" && kitHas(s, "tripwire")) {
        drain = 3;
      }
      for (const idx of targets) {
        foe.cells[idx].trap = { by: side, revealed: side === "player", kind, drain };
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

  // DEFEND: always your own board.
  if (mode === "purge") {
    let n = 0;
    for (const idx of targets) {
      if (own.cells[idx].trap) {
        own.cells[idx].trap = null;
        n++;
      }
    }
    // Sweep Credit: a purge that lands pays out per defused trap.
    if (n > 0 && side === "player" && kitHas(s, "sweepCredit")) {
      econ.ram += Math.min(n, 3) * PROGRAM_COST;
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
      const c = own.cells[idx];
      c.lockedThroughRound = Math.max(c.lockedThroughRound, through);
      c.lockedBy = side;
    }
    emit(s, "lock");
    say(
      s,
      side === "player"
        ? "LOCK. Those junctions are bolted down. Nothing of theirs twists them."
        : "It bolted down a junction of its own. Your redirect will not move that one.",
    );
  } else if (mode === "ward") {
    const radius = WARD_RADIUS[tierOf(s, side, "defend")];
    const through = s.round + WARD_ROUNDS;
    const center = own.cells[targets[0]];
    for (const c of own.cells) {
      if (!isJunction(c)) continue;
      if (Math.abs(c.x - center.x) + Math.abs(c.y - center.y) > radius) continue;
      c.wardThroughRound = Math.max(c.wardThroughRound, through);
      c.wardBy = side;
    }
    emit(s, "ward");
    say(
      s,
      side === "player"
        ? "WARD up. Nothing of theirs lands in that patch."
        : "It warded a whole approach of its own. Your traps will not land there.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Turn transitions                                                    */
/* ------------------------------------------------------------------ */

function beginTurnEconomy(s: DuelState, side: Side): boolean {
  const econ = s.econ[side];
  econ.used = { scan: false, attack: false, defend: false };
  econ.placedThisTurn = false;
  // One undo per turn, and a fresh one every turn.
  if (side === "player") {
    s.undo = null;
    s.undoSpent = false;
  }
  /**
   * Settle the drain FIRST, whether or not this turn happens. A siphon that
   * also cost the turn used to bill twice: the burned turn skipped the reset,
   * so the same drain came off the next turn as well. A skipped turn already
   * costs everything it had; it should not also owe.
   */
  const ram = econ.ramPerTurn + econ.carry - econ.drainNext;
  econ.drainNext = 0;
  if (econ.loseNextTurn) {
    econ.loseNextTurn = false;
    econ.ram = 0;
    econ.carry = 0;
    emit(s, "turnLost");
    say(s, side === "player" ? "Your turn burns away in the trap's wake." : "The intrusion stalls a full cycle.");
    return false;
  }
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
  // Was it about to win as this round closed? Counted once per round, and
  // billed at the end even on a win.
  if (!s.cfg.tutorial && routeCost(s.boards.opp) <= PRESSURE_RANGE) s.pressureRounds++;
  s.round++;
  if (s.routeTrace && s.routeTrace.round < s.round) s.routeTrace = null;
  // The tutorial ends on the machine's terms: one victory-lap round after
  // the lesson completes, or round 7 if the player dawdles, it stops
  // playing fair and seals itself.
  if (s.cfg.tutorial) {
    const lessonOver = tutorialLessonDone(s) && s.round > s.tutorialLessonRound + 1;
    if (lessonOver || s.round >= 7) {
      finishDuel(
        s,
        "opp",
        "seal",
        "The machine stopped pretending and sealed itself. The door was never really open.",
      );
      return;
    }
  }
  if (s.round > ROUND_CAP) {
    const pd = routeCost(s.boards.player);
    const od = routeCost(s.boards.opp);
    const playerCloser = pd <= od;
    finishDuel(
      s,
      playerCloser ? "player" : "opp",
      "cap",
      playerCloser
        ? "The link timed out with your route shorter than its. It counts, barely."
        : "The link timed out with its route shorter than yours.",
    );
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
  econ.carry = Math.min(econ.carryCap, Math.max(0, econ.ram));
  emit(s, "endTurn");
  startOppTurn(s);
}

/*
 * `playerHasRoute` and the patch-piece rescue search are gone with the
 * SEVERED verdict. Being walled off was only ever possible because enemy
 * territory was impassable; on a board nobody else occupies, a route to the
 * goal always exists unless slag cuts the grid in half, which board
 * generation already rejects. That also retires the defect where a planner
 * blindspot reported Infinity and ended a still-winnable dive in a loss.
 */

/** A trap consumed the player's turn mid-action: nothing carries over. */
export function forceEndPlayerTurn(s: DuelState): void {
  if (s.phase !== "playing") return;
  s.econ.player.ram = 0;
  s.econ.player.carry = 0;
  startOppTurn(s);
}
