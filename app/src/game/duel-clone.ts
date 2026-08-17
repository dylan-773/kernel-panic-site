import { Board, DuelState } from "./duel-types";

/**
 * Deep copies of duel state.
 *
 * These used to live in `duel-reducer`, but the command layer and the undo
 * replay both need them and the reducer imports the command layer, so they
 * moved here to break the cycle. Nothing in this file knows any rules.
 *
 * The discipline that matters: every ARRAY and every nested OBJECT has to be
 * copied by hand. A spread gives you a new wrapper around the same arrays, and
 * a snapshot that shares an array with the live state is not a snapshot.
 */

export function cloneBoard(b: Board): Board {
  return {
    ...b,
    cells: b.cells.map((c) => ({ ...c, trap: c.trap ? { ...c.trap } : null })),
    goal: [...b.goal],
    power: [...b.power],
  };
}

export function cloneState(s: DuelState): DuelState {
  return {
    ...s,
    boards: { player: cloneBoard(s.boards.player), opp: cloneBoard(s.boards.opp) },
    econ: {
      player: { ...s.econ.player, used: { ...s.econ.player.used } },
      opp: { ...s.econ.opp, used: { ...s.econ.opp.used } },
    },
    kit: { ...s.kit, augments: [...s.kit.augments], patchPouch: [...s.kit.patchPouch] },
    patchPouch: [...s.patchPouch],
    tutFlags: { ...s.tutFlags },
    /**
     * `opponent.ts` mutates `queue` IN PLACE (shift, truncate, push), so a
     * spread alone hands the old state a live reference to the new state's
     * queue and any snapshot held across a beat is silently rewritten under
     * it. `aim.targets` and `routeTrace.cells` are only ever reassigned today,
     * but they are the same hazard one edit away.
     */
    oppTurn: {
      ...s.oppTurn,
      queue: s.oppTurn.queue.map((q) => ({ ...q })),
      aim:
        s.oppTurn.aim && s.oppTurn.aim.kind === "cast"
          ? { ...s.oppTurn.aim, targets: [...s.oppTurn.aim.targets] }
          : s.oppTurn.aim,
      pendingCast: s.oppTurn.pendingCast ? { ...s.oppTurn.pendingCast } : null,
    },
    routeTrace: s.routeTrace ? { ...s.routeTrace, cells: [...s.routeTrace.cells] } : null,
    fx: [...s.fx],
    /**
     * SHARED ON PURPOSE, and the one exception to the rule above. The undo
     * point is written once and never touched again; taking it clones FROM it
     * rather than into it. Deep-copying it on every dispatch would double the
     * cost of every click to protect something nothing writes to.
     */
    undo: s.undo,
  };
}

/**
 * The state one move restores to. Its own undo point is nulled so the chain
 * cannot nest into a growing tail of snapshots, and fx are emptied because
 * taking the undo carries the live ones forward instead: a correction should
 * not un-hear what the player already heard.
 */
export function snapshotBaseline(s: DuelState): DuelState {
  const snap = cloneState(s);
  snap.undo = null;
  snap.fx = [];
  return snap;
}
