import { ABILITY_BY_ID } from "./content/abilities";
import {
  advanceBag,
  applyCast,
  applyOverloadLock,
  applyPlace,
  applyRotate,
  armTargetLegal,
  emit,
  endPlayerTurn,
  placementLegal,
  redirectTargetLegal,
  say,
} from "./duel-actions";
import { AbilityId, DuelState } from "./duel-types";
import { oppStep } from "./opponent";

/**
 * Pure reducer for the duel, same architecture as the old dive reducer:
 * clone, mutate through shared helpers, queue fx in-state, drain explicitly.
 * Fully turn-based — there is no clock; the only recurring dispatch is
 * oppStep, which the UI fires on a short interval while it is the
 * opponent's turn so its moves read as a sequence.
 */

export type DuelAction =
  | { type: "place"; idx: number; rot: number }
  | { type: "rotateOwn"; idx: number }
  | { type: "discard" }
  | { type: "ability"; id: AbilityId; targets: number[]; abilityTarget?: AbilityId }
  | { type: "endTurn" }
  | { type: "oppStep" }
  | { type: "tutorialNext" }
  | { type: "fxDrain"; upTo: number };

function cloneState(s: DuelState): DuelState {
  return {
    ...s,
    cells: s.cells.map((c) => ({ ...c, trap: c.trap ? { ...c.trap } : null })),
    econ: {
      player: { ...s.econ.player, disabled: { ...s.econ.player.disabled } },
      opp: { ...s.econ.opp, disabled: { ...s.econ.opp.disabled } },
    },
    equipped: s.equipped.map((e) => ({ ...e })),
    oppPlan: [...s.oppPlan],
    oppTurn: { ...s.oppTurn },
    fx: [...s.fx],
  };
}

function playerCanAct(s: DuelState): boolean {
  return s.phase === "playing" && s.turn === "player";
}

export function duelReducer(state: DuelState, action: DuelAction): DuelState {
  switch (action.type) {
    case "fxDrain": {
      if (state.fx.length === 0) return state;
      return { ...state, fx: state.fx.filter((e) => e.id > action.upTo) };
    }

    case "tutorialNext": {
      return { ...state, beat: state.beat + 1 };
    }

    case "place": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      if (s.econ.player.ram < 2 || !placementLegal(s, "player", action.idx)) {
        emit(s, "deny");
        return s;
      }
      applyPlace(s, "player", action.idx, action.rot);
      return s;
    }

    case "rotateOwn": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      const c = s.cells[action.idx];
      if (!c || c.kind !== "node" || c.owner !== "player" || s.econ.player.ram < 1) {
        emit(s, "deny");
        return s;
      }
      applyRotate(s, "player", action.idx, 1);
      return s;
    }

    case "discard": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      if (s.econ.player.ram < 1) {
        emit(s, "deny");
        return s;
      }
      s.econ.player.ram -= 1;
      advanceBag(s, "player");
      emit(s, "discard");
      return s;
    }

    case "ability": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      const econ = s.econ.player;
      const def = ABILITY_BY_ID[action.id];
      const slot = s.equipped.find((e) => e.id === action.id);
      if (!def || !slot || slot.copies < 1) {
        emit(s, "deny");
        return s;
      }
      if (econ.abilityUsed) {
        emit(s, "deny");
        say(s, "One ability per turn");
        return s;
      }
      if (action.id in econ.disabled) {
        emit(s, "deny");
        say(s, `${def.name} is jammed by Overload`);
        return s;
      }
      if (econ.ram < def.ramCost) {
        emit(s, "deny");
        say(s, "Not enough RAM");
        return s;
      }

      // Target validation per verb.
      const t = action.targets;
      switch (def.verb) {
        case "arm": {
          const want = def.p.traps ?? 1;
          if (t.length < 1 || t.length > want) return deny(s);
          if (!t.every((i) => armTargetLegal(s, "player", i))) return deny(s);
          break;
        }
        case "redirect": {
          const want = def.p.targets ?? 1;
          if (t.length < 1 || t.length > want) return deny(s);
          if (!t.every((i) => redirectTargetLegal(s, "player", i))) return deny(s);
          break;
        }
        case "shield": {
          const want = def.p.targets ?? 1;
          if (t.length < 1 || t.length > want) return deny(s);
          if (!t.every((i) => s.cells[i]?.kind === "node" && s.cells[i].owner === "player")) {
            return deny(s);
          }
          break;
        }
        case "backdoor": {
          if (def.p.shieldRounds) {
            if (t.length > 1) return deny(s);
            if (t.length === 1 && !(s.cells[t[0]]?.kind === "node" && s.cells[t[0]].owner === "player")) {
              return deny(s);
            }
          }
          break;
        }
        case "overload": {
          if (def.p.lockTurns && !action.abilityTarget) return deny(s);
          break;
        }
        case "scan":
        case "overclock":
        case "firewall":
          break;
      }

      applyCast(s, "player", def, t);
      if (def.verb === "overload" && def.p.lockTurns && action.abilityTarget) {
        applyOverloadLock(s, "player", def, action.abilityTarget);
        say(s, `Overload: their ${ABILITY_BY_ID[action.abilityTarget]?.name ?? "routine"} is jammed`);
      }
      slot.copies -= 1;
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

function deny(s: DuelState): DuelState {
  emit(s, "deny");
  return s;
}
