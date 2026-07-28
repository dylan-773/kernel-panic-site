import { ATTACK_WIDTH, DEFEND_WIDTH, Program } from "./content/kit";
import {
  applyRotate,
  applyCast,
  applyPlace,
  attackTargetLegal,
  defendTargetLegal,
  emit,
  endPlayerTurn,
  programCost,
  programUnlocked,
  say,
  tierOf,
} from "./duel-actions";
import { canPlace, canRotate } from "./duel-power";
import { PLACE_COST } from "./patch-cells";
import { DuelState } from "./duel-types";
import { oppStep } from "./opponent";

/**
 * Pure reducer for the flood-claim duel: clone, mutate through the shared
 * helpers, queue fx in-state, drain explicitly. Fully turn-based; the only
 * recurring dispatch is oppStep on a short UI interval.
 */

export type DuelAction =
  | { type: "rotate"; idx: number }
  | { type: "place"; idx: number; pouchIdx: number; mask: number }
  | { type: "cast"; prog: Program; targets: number[] }
  | { type: "endTurn" }
  | { type: "oppStep" }
  | { type: "fxDrain"; upTo: number };

function cloneState(s: DuelState): DuelState {
  return {
    ...s,
    cells: s.cells.map((c) => ({ ...c, trap: c.trap ? { ...c.trap } : null })),
    econ: {
      player: { ...s.econ.player, used: { ...s.econ.player.used } },
      opp: { ...s.econ.opp, used: { ...s.econ.opp.used } },
    },
    kit: { ...s.kit, augments: [...s.kit.augments], patchPouch: [...s.kit.patchPouch] },
    patchPouch: [...s.patchPouch],
    tutFlags: { ...s.tutFlags },
    oppTurn: { ...s.oppTurn },
    fx: [...s.fx],
  };
}

function playerCanAct(s: DuelState): boolean {
  return s.phase === "playing" && s.turn === "player";
}

function deny(s: DuelState, msg?: string): DuelState {
  emit(s, "deny");
  if (msg) say(s, msg);
  return s;
}

export function duelReducer(state: DuelState, action: DuelAction): DuelState {
  switch (action.type) {
    case "fxDrain": {
      if (state.fx.length === 0) return state;
      return { ...state, fx: state.fx.filter((e) => e.id > action.upTo) };
    }

    case "rotate": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      if (s.econ.player.ram < 1) return deny(s, "No RAM left. End the turn.");
      if (!canRotate(s, "player", action.idx)) {
        const c = s.cells[action.idx];
        if (c && c.kind === "node" && c.fused) {
          return deny(s, "That junction is welded. A placed piece never turns.");
        }
        if (c && c.lockedThroughRound >= s.round && c.lockedBy === "opp") {
          return deny(s, "That junction is clamped frozen.");
        }
        if (c && c.kind === "node" && c.owner === "opp") {
          return deny(s, "Enemy territory. ATTACK: REDIRECT can reach it.");
        }
        return deny(s, "Out of reach. Work outward from your territory.");
      }
      applyRotate(s, "player", action.idx);
      return s;
    }

    case "place": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      if (s.patchPouch.length < 1) return deny(s, "The pouch is empty.");
      if (s.econ.player.placedThisTurn) return deny(s, "One patch piece per turn.");
      if (s.econ.player.ram < PLACE_COST) return deny(s, "Placing a piece takes 2 RAM.");
      // Stale-click guard: the action names the piece it thinks it spends.
      if (s.patchPouch[action.pouchIdx] !== action.mask) return deny(s);
      if (!canPlace(s, "player", action.idx)) {
        return deny(s, "Patch pieces only fill slag within reach of your territory.");
      }
      applyPlace(s, "player", action.idx, action.pouchIdx);
      return s;
    }

    case "cast": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      const econ = s.econ.player;
      const prog = action.prog;
      if (!programUnlocked(s, prog)) return deny(s, "That program is still offline. Follow the bench notes.");
      if (econ.used[prog]) return deny(s, "Each program runs once per turn.");
      if (econ.ram < programCost(s, "player", prog)) return deny(s, "Not enough RAM.");

      const t = action.targets;
      if (prog === "scan") {
        applyCast(s, "player", "scan", null, []);
        return s;
      }
      if (prog === "attack") {
        const want = ATTACK_WIDTH[tierOf(s, "player", "attack")];
        if (t.length < 1 || t.length > want) return deny(s);
        if (!t.every((i) => attackTargetLegal(s, "player", s.kit.attackMode, i))) return deny(s);
        applyCast(s, "player", "attack", s.kit.attackMode, t);
        return s;
      }
      const want = s.kit.defendMode === "ward" ? 1 : DEFEND_WIDTH[tierOf(s, "player", "defend")];
      if (t.length < 1 || t.length > want) return deny(s);
      if (!t.every((i) => defendTargetLegal(s, "player", s.kit.defendMode, i))) return deny(s);
      applyCast(s, "player", "defend", s.kit.defendMode, t);
      return s;
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
  }
}
