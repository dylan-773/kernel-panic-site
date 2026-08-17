import { ATTACK_WIDTH, DEFEND_WIDTH, OppMode, Program } from "./content/kit";
import {
  applyCast,
  applyPlace,
  applyRotate,
  attackTargetLegal,
  defendTargetLegal,
  emit,
  programCost,
  programUnlocked,
  tierOf,
} from "./duel-actions";
import { cloneState, snapshotBaseline } from "./duel-clone";
import { canPlace, canRotate, reachOf } from "./duel-power";
import { DuelCommand, DuelState, Side, UndoPoint } from "./duel-types";
import { PLACE_COST } from "./patch-cells";

/**
 * The command layer: one gate every move goes through, from either side.
 *
 * Before this existed, the same validation was written out four separate
 * times — in the reducer, in the opponent's `executeCast`, in the sim's kitted
 * bot, and implicitly in `botPlayTurn` — and they had already drifted (the
 * machine checked `ram < 1` with a literal where `programCost` belonged).
 * Now there is exactly one place a move can be refused.
 *
 * Commands are RECORDS, not closures, because undo replays them. A rotation or
 * a placement can be pulled back out of the turn; a cast cannot, but it is a
 * command all the same so the log is one homogeneous list and the replay does
 * not need to special-case what it is re-running.
 */

/**
 * Why a command was refused. The engine returns a reason; the reducer turns it
 * into a sentence. Player-facing prose does not belong down here, and a
 * boolean would have thrown away copy the game already had.
 */
export type DenyReason =
  | "notYourTurn"
  | "noRam"
  | "welded"
  | "clamped"
  | "isGoal"
  | "outOfReach"
  | "pouchEmpty"
  | "alreadyPlaced"
  | "staleClick"
  | "notSlag"
  | "programOffline"
  | "badTargetCount"
  | "illegalTarget";

export type ExecResult = { ok: true } | { ok: false; reason: DenyReason };

const OK: ExecResult = { ok: true };
const no = (reason: DenyReason): ExecResult => ({ ok: false, reason });

/** How wide a cast of this program may be for this side. */
export function castWidth(s: DuelState, side: Side, prog: Program, mode: OppMode | null): number {
  if (prog === "scan") return 0;
  if (prog === "attack") return ATTACK_WIDTH[tierOf(s, side, "attack")];
  // Ward covers a radius rather than a list, so it takes exactly one centre.
  return mode === "ward" ? 1 : DEFEND_WIDTH[tierOf(s, side, "defend")];
}

/** Validate without applying. Pure. */
export function checkCommand(s: DuelState, side: Side, cmd: DuelCommand): ExecResult {
  if (s.phase !== "playing" || s.turn !== side) return no("notYourTurn");
  const econ = s.econ[side];

  switch (cmd.kind) {
    case "rotate": {
      if (econ.ram < 1) return no("noRam");
      if (canRotate(s, side, cmd.idx)) return OK;
      const c = s.boards[side].cells[cmd.idx];
      if (!c) return no("outOfReach");
      if (c.fused) return no("welded");
      if (c.lockedThroughRound >= s.round && c.lockedBy !== null && c.lockedBy !== side) {
        return no("clamped");
      }
      if (c.kind === "goal") return no("isGoal");
      return no("outOfReach");
    }

    case "place": {
      if (s.patchPouch.length < 1) return no("pouchEmpty");
      if (econ.placedThisTurn) return no("alreadyPlaced");
      if (econ.ram < PLACE_COST) return no("noRam");
      // Stale-click guard: the command names the piece it thinks it spends.
      if (s.patchPouch[cmd.pouchIdx] !== cmd.mask) return no("staleClick");
      if (!canPlace(s.boards[side], cmd.idx, reachOf(s, side))) return no("notSlag");
      return OK;
    }

    case "cast": {
      if (!programUnlocked(s, cmd.prog)) return no("programOffline");
      if (econ.ram < programCost(s, side, cmd.prog)) return no("noRam");
      if (cmd.prog === "scan") return OK;
      const want = castWidth(s, side, cmd.prog, cmd.mode);
      if (cmd.targets.length < 1 || cmd.targets.length > want) return no("badTargetCount");
      const legal =
        cmd.prog === "attack"
          ? (i: number) => attackTargetLegal(s, side, cmd.mode as never, i)
          : (i: number) => defendTargetLegal(s, side, cmd.mode as never, i);
      if (!cmd.targets.every(legal)) return no("illegalTarget");
      return OK;
    }
  }
}

/**
 * Validate, then apply. Everything resolves immediately: the board lights, the
 * cascade pays, the trap springs, the dive can end. Touch-move.
 *
 * `arm` decides whether this move becomes the turn's take-back. It defaults on
 * for the player and is passed off by the machine and the sim harnesses, which
 * never undo, so they never pay for a snapshot across 4000 simulated duels.
 */
export function execCommand(
  s: DuelState,
  side: Side,
  cmd: DuelCommand,
  opts?: { arm?: boolean },
): ExecResult {
  const check = checkCommand(s, side, cmd);
  if (!check.ok) return check;

  /*
   * A cast is final, so it clears the take-back rather than arming one:
   * restoring a state from before a twist that happened before a cast would
   * quietly unwind the cast too. Only your own alignment is reversible.
   */
  const arms = opts?.arm !== false && side === "player" && !s.undoSpent && cmd.kind !== "cast";
  const before = arms ? snapshotBaseline(s) : null;
  const trapsBefore = s.econ.player.trapsFired;

  switch (cmd.kind) {
    case "rotate":
      applyRotate(s, side, cmd.idx);
      break;
    case "place":
      applyPlace(s, side, cmd.idx, cmd.pouchIdx);
      break;
    case "cast":
      applyCast(s, side, cmd.prog, cmd.mode, cmd.targets);
      break;
  }

  if (opts?.arm !== false && side === "player") {
    if (cmd.kind === "cast") {
      s.undo = null;
    } else if (before) {
      // What sprang, so the restore can put it straight back. Read off the
      // snapshot rather than the settle: any trap that WAS armed and is now
      // gone went off on this move.
      const sprung: UndoPoint["sprung"] = [];
      if (s.econ.player.trapsFired > trapsBefore) {
        const now = s.boards.player.cells;
        for (let i = 0; i < now.length; i++) {
          const was = before.boards.player.cells[i].trap;
          if (was && !now[i].trap) sprung.push({ idx: i, kind: was.kind, drain: was.drain });
        }
      }
      s.undo = { before, label: describeCommand(cmd), sprung };
    }
  }
  return OK;
}

/**
 * Spend the turn's take-back. Restores the board, the RAM and the par count,
 * then re-applies whatever the move sprang, because an undo that re-armed a
 * trap would be a free minesweeper: twist into a hidden node, watch it fire,
 * take it back, now you know exactly where it is.
 */
export function takeUndo(s: DuelState): DuelState | null {
  const point = s.undo;
  if (!point || s.undoSpent || s.phase !== "playing" || s.turn !== "player") return null;

  const next = cloneState(point.before);
  next.undo = null;
  next.undoSpent = true;

  for (const t of point.sprung) {
    const c = next.boards.player.cells[t.idx];
    if (c.trap) c.trap = null;
    next.econ.player.trapsFired++;
    // The drain stands either way; a siphon also keeps feeding the machine.
    next.econ.player.drainNext += t.drain;
    if (t.kind === "siphon") next.econ.opp.drainNext -= t.drain;
  }

  // The turn keeps its sound and its transcript: an undo is a correction, not
  // a rewind of everything the player has already heard.
  next.fx = [...s.fx];
  next.fxNext = s.fxNext;
  emit(next, "undo");
  return next;
}

const HEX = (idx: number): string => `0x${idx.toString(16).toUpperCase().padStart(2, "0")}`;

/** What the take-back button says it will take back. */
export function describeCommand(cmd: DuelCommand): string {
  switch (cmd.kind) {
    case "rotate":
      return `TWIST ${HEX(cmd.idx)}`;
    case "place":
      return `PATCH ${HEX(cmd.idx)}`;
    case "cast":
      if (cmd.prog === "scan") return "SCAN";
      return `${(cmd.mode ?? cmd.prog).toUpperCase()} ${cmd.targets.map(HEX).join(" ")}`.trim();
  }
}

