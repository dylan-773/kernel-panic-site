import { Program } from "./content/kit";
import { emit, endPlayerTurn, say } from "./duel-actions";
import { cloneState } from "./duel-clone";
import { DenyReason, execCommand, takeUndo } from "./duel-commands";
import { DuelCommand, DuelState, Side } from "./duel-types";
import { oppStep } from "./opponent";

/**
 * Pure reducer for the split-board duel: clone, run the command through the
 * one gate in `duel-commands`, drain fx explicitly. Fully turn-based; the only
 * recurring dispatch is oppStep on a short UI interval.
 *
 * No action carries a board tag. Which grid a verb touches is a property of
 * the verb (see `targetBoardOf` in duel-actions), so the reducer and the
 * opponent planner cannot disagree about it.
 *
 * The reducer no longer validates anything itself. It builds a command, asks
 * the gate, and turns a refusal into a sentence — which is the only part of
 * this that is genuinely the UI's business.
 */

export type DuelAction =
  | { type: "rotate"; idx: number }
  | { type: "place"; idx: number; pouchIdx: number; mask: number }
  | { type: "cast"; prog: Program; targets: number[] }
  | { type: "endTurn" }
  | { type: "oppStep" }
  | { type: "view"; side: Side }
  | { type: "fxDrain"; upTo: number }
  /** Spend the turn's one take-back on the most recent twist or patch. */
  | { type: "undo" };

function playerCanAct(s: DuelState): boolean {
  return s.phase === "playing" && s.turn === "player";
}

function deny(s: DuelState, msg?: string): DuelState {
  emit(s, "deny");
  if (msg) say(s, msg);
  return s;
}

/** A refusal, in the player's language. */
function denyCopy(reason: DenyReason): string | undefined {
  switch (reason) {
    case "noRam":
      return "No RAM left. End the turn.";
    case "welded":
      return "That junction is welded. A placed piece never turns.";
    case "clamped":
      return "That junction is clamped frozen. Wait it out or route around.";
    case "isGoal":
      return "That is the goal. Light it, do not turn it.";
    case "outOfReach":
      return "Out of reach. Work outward from the line you have built.";
    case "pouchEmpty":
      return "The pouch is empty.";
    case "alreadyPlaced":
      return "One patch piece per turn.";
    case "notSlag":
      return "Patch pieces only fill slag within reach of the line you have built.";
    case "programOffline":
      return "That program is still offline. Follow the bench notes.";
    default:
      return undefined;
  }
}

function run(state: DuelState, cmd: DuelCommand): DuelState {
  const s = cloneState(state);
  const r = execCommand(s, "player", cmd);
  return r.ok ? s : deny(s, denyCopy(r.reason));
}

export function duelReducer(state: DuelState, action: DuelAction): DuelState {
  switch (action.type) {
    case "fxDrain": {
      if (state.fx.length === 0) return state;
      return { ...state, fx: state.fx.filter((e) => e.id > action.upTo) };
    }

    case "rotate": {
      if (!playerCanAct(state)) return state;
      return run(state, { kind: "rotate", idx: action.idx });
    }

    case "place": {
      if (!playerCanAct(state)) return state;
      return run(state, {
        kind: "place",
        idx: action.idx,
        pouchIdx: action.pouchIdx,
        mask: action.mask,
      });
    }

    case "cast": {
      if (!playerCanAct(state)) return state;
      const mode =
        action.prog === "scan"
          ? null
          : action.prog === "attack"
            ? state.kit.attackMode
            : state.kit.defendMode;
      return run(state, { kind: "cast", prog: action.prog, mode, targets: action.targets });
    }

    case "undo": {
      const next = takeUndo(state);
      return next ?? state;
    }

    case "endTurn": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      endPlayerTurn(s);
      return s;
    }

    case "oppStep": {
      if (state.phase !== "playing" || state.turn !== "opp") return state;
      const s = cloneState(state);
      oppStep(s);
      return s;
    }

    case "view": {
      if (state.view === action.side) return state;
      return { ...state, view: action.side };
    }
  }
}
