import { ABILITY_BY_ID } from "./content/abilities";
import {
  applyCast,
  applyOverloadLock,
  applyRotate,
  armTargetLegal,
  emit,
  endPlayerTurn,
  redirectTargetLegal,
  say,
  shieldTargetLegal,
} from "./duel-actions";
import { canRotate } from "./duel-power";
import { AbilityId, DuelState } from "./duel-types";
import { oppStep } from "./opponent";

/**
 * Pure reducer for the flood-claim duel: clone, mutate through the shared
 * helpers, queue fx in-state, drain explicitly. Fully turn-based; the only
 * recurring dispatch is oppStep on a short UI interval.
 */

export type DuelAction =
  | { type: "rotate"; idx: number }
  | { type: "ability"; id: AbilityId; targets: number[]; abilityTarget?: AbilityId }
  | { type: "endTurn" }
  | { type: "oppStep" }
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
        if (c && c.lockedThroughRound >= s.round && c.lockedBy === "opp") {
          return deny(s, "That junction is shield-locked.");
        }
        if (c && c.kind === "node" && c.owner === "opp") {
          return deny(s, "Enemy territory. Redirect can reach it.");
        }
        return deny(s, "Out of reach. Rotate from your frontier outward.");
      }
      applyRotate(s, "player", action.idx);
      return s;
    }

    case "ability": {
      if (!playerCanAct(state)) return state;
      const s = cloneState(state);
      const econ = s.econ.player;
      const def = ABILITY_BY_ID[action.id];
      const slot = s.equipped.find((e) => e.id === action.id);
      if (!def || !slot || slot.copies < 1) return deny(s);
      if (econ.abilityUsed) return deny(s, "One ability per turn.");
      if (action.id in econ.disabled) return deny(s, `${def.name} is jammed by Overload.`);
      if (econ.ram < def.ramCost) return deny(s, "Not enough RAM.");

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
          if (!t.every((i) => shieldTargetLegal(s, "player", i))) return deny(s);
          break;
        }
        case "backdoor": {
          if (def.p.shieldRounds) {
            if (t.length !== 1 || !shieldTargetLegal(s, "player", t[0])) return deny(s);
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
        say(s, `OVERLOAD. Their ${ABILITY_BY_ID[action.abilityTarget]?.name ?? "routine"} is jammed.`);
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
