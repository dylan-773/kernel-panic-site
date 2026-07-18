import { FxKind } from "./audio";
import { pickOutcome } from "./copy";
import { generateBoard } from "./generator";
import { computePower } from "./power";
import { RngState, nextU32, seedRng } from "./rng";
import { Board, DiveType, PowerResult } from "./types";

export type DivePhase = "brief" | "run" | "won" | "lost";

export interface FxEvent {
  id: number;
  kind: FxKind;
}

export interface DiveResult {
  won: boolean;
  credits: number;
  xp: number;
  flavor: string;
  rows: Array<{ label: string; value: string }>;
  grade: string | null;
}

export interface DiveState {
  type: DiveType;
  seed: number;
  board: Board;
  phase: DivePhase;
  /** Dive clock in ms, running only during the "run" phase. */
  t: number;
  moves: number;
  power: PowerResult;
  lootGot: number;
  integrity: number;
  fragsGot: number;
  fragsLost: number;
  deadline: number;
  nextPing: number;
  pingUntil: number;
  patchedCount: number;
  orderHits: number;
  nextExpectedBug: number;
  advClaimed: number;
  nextAdvance: number;
  nextAttack: number;
  frozenUntil: number;
  notice: { id: number; text: string } | null;
  rngState: RngState;
  fx: FxEvent[];
  fxNext: number;
  result: DiveResult | null;
}

export type DiveAction =
  | { type: "begin" }
  | { type: "click"; idx: number }
  | { type: "tick"; dt: number }
  | { type: "regen"; seed: number }
  | { type: "fxDrain"; upTo: number };

export function initDive(type: DiveType, seed: number): DiveState {
  const board = generateBoard(type, seed);
  return {
    type,
    seed,
    board,
    phase: "brief",
    t: 0,
    moves: 0,
    power: computePower(board),
    lootGot: 0,
    integrity: 100,
    fragsGot: 0,
    fragsLost: 0,
    deadline: board.crashBaseMs,
    nextPing: 700,
    pingUntil: 0,
    patchedCount: 0,
    orderHits: 0,
    nextExpectedBug: 1,
    advClaimed: 1,
    nextAdvance: board.advIntervalMs,
    nextAttack: 9000,
    frozenUntil: 0,
    notice: null,
    rngState: seedRng(seed ^ 0x5f3759df),
    fx: [],
    fxNext: 1,
    result: null,
  };
}

function cloneState(s: DiveState): DiveState {
  return {
    ...s,
    board: { ...s.board, cells: s.board.cells.map((c) => ({ ...c })) },
    fx: [...s.fx],
  };
}

function emit(s: DiveState, kind: FxKind): void {
  s.fx.push({ id: s.fxNext++, kind });
}

function say(s: DiveState, text: string): void {
  s.notice = { id: s.fxNext++, text };
}

function roll(s: DiveState): number {
  const [v, next] = nextU32(s.rngState);
  s.rngState = next;
  return v;
}

/** Recompute power and apply every consequence of the new flow. */
function settle(s: DiveState): void {
  const prev = s.power;
  const power = computePower(s.board);
  s.power = power;
  const cells = s.board.cells;

  let newlyLit = 0;
  for (let i = 0; i < cells.length; i++) {
    if (power.powered[i] && !prev.powered[i]) newlyLit++;
  }
  if (newlyLit >= 2) emit(s, "power");

  for (const i of power.satisfiedAnds) {
    if (!prev.satisfiedAnds.has(i)) emit(s, "andOpen");
  }

  // Loot and fragments latch on first light.
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!power.powered[i]) continue;
    if (c.kind === "loot" && !c.looted) {
      c.looted = true;
      s.lootGot++;
      emit(s, "loot");
      say(s, "Salvage cache recovered");
    }
    if (c.kind === "frag" && !c.recovered && !c.lost) {
      c.recovered = true;
      s.fragsGot++;
      emit(s, "frag");
      say(s, "Data fragment secured");
    }
  }

  // Corruption contact: detonate, burn the neighborhood, never spread onto
  // the route itself (loss is data and integrity, not solvability).
  for (const ci of power.contacts) {
    const c = cells[ci];
    if (c.spent) continue;
    c.spent = true;
    s.integrity = Math.max(10, s.integrity - 25);
    for (const [nx, ny] of [
      [c.x, c.y - 1],
      [c.x + 1, c.y],
      [c.x, c.y + 1],
      [c.x - 1, c.y],
    ]) {
      if (nx < 0 || ny < 0 || nx >= s.board.w || ny >= s.board.h) continue;
      const nb = cells[ny * s.board.w + nx];
      nb.seared = true;
      if (nb.kind === "frag" && !nb.recovered && !nb.lost) {
        nb.lost = true;
        s.fragsLost++;
      }
    }
    emit(s, "corrupt");
    say(s, "Corruption bloom: integrity falling");
  }

  // Bug patches, in numbered order for the bonus check.
  const hit: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.bug > 0 && !c.patched && power.powered[i]) hit.push(i);
  }
  hit.sort((a, b) => cells[a].bug - cells[b].bug);
  for (const i of hit) {
    const c = cells[i];
    c.patched = true;
    s.patchedCount++;
    if (c.bug === s.nextExpectedBug) {
      s.orderHits++;
      s.deadline += 16000;
      emit(s, "patchOrder");
      say(s, `Bug ${c.bug} patched in sequence: timer extended`);
    } else {
      s.deadline += 8000;
      emit(s, "patch");
      say(s, `Bug ${c.bug} patched out of sequence`);
    }
    while (
      s.nextExpectedBug <= s.board.bugCount &&
      cells.some((x) => x.bug === s.nextExpectedBug && x.patched)
    ) {
      s.nextExpectedBug++;
    }
    s.deadline = Math.min(s.deadline, s.t + 60000);
  }

  if (s.type === "software" && s.patchedCount >= s.board.bugCount) {
    finish(s, true);
    return;
  }
  if (s.board.coreIdx !== -1 && power.powered[s.board.coreIdx]) {
    finish(s, true);
  }
}

function finish(s: DiveState, won: boolean): void {
  s.phase = won ? "won" : "lost";
  emit(s, won ? "win" : "lose");
  s.notice = null;
  s.result = computeResult(s, won);
}

function computeResult(s: DiveState, won: boolean): DiveResult {
  const flavor = pickOutcome(s.type, s.seed + s.moves, won);
  if (!won) {
    return {
      won,
      flavor,
      credits: 0,
      xp: 12,
      grade: null,
      rows: [
        { label: "Payout", value: "0 cr" },
        { label: "Salvaged XP", value: "+12" },
      ],
    };
  }
  switch (s.type) {
    case "hardware": {
      const credits = 120 + s.lootGot * 45;
      const clean = s.moves <= s.board.parMoves + 4;
      return {
        won,
        flavor,
        credits,
        xp: 40 + s.lootGot * 10,
        grade: clean ? "CLEAN ROUTE" : null,
        rows: [
          { label: "Moves", value: String(s.moves) },
          { label: "Salvage", value: `${s.lootGot} of ${s.board.lootCount}` },
          { label: "Payout", value: `${credits} cr` },
          { label: "Resilience XP", value: `+${40 + s.lootGot * 10}` },
        ],
      };
    }
    case "network": {
      const lead = Math.max(0, s.board.advPath.length - s.advClaimed);
      const credits = 150 + lead * 12;
      return {
        won,
        flavor,
        credits,
        xp: 45,
        grade: lead >= 4 ? "CLEAN SWEEP" : null,
        rows: [
          { label: "Intruder distance", value: `${lead} nodes` },
          { label: "Moves", value: String(s.moves) },
          { label: "Payout", value: `${credits} cr` },
          { label: "Speed XP", value: "+45" },
        ],
      };
    }
    case "data": {
      const fragPart = s.board.fragCount > 0 ? s.fragsGot / s.board.fragCount : 1;
      const recovery = Math.round(60 * fragPart + 0.4 * s.integrity);
      const credits = Math.round((190 * recovery) / 100);
      const grade =
        recovery >= 95 ? "FULL RECOVERY" : recovery >= 70 ? "PARTIAL RECOVERY" : "FRAGMENTS ONLY";
      return {
        won,
        flavor,
        credits,
        xp: 40,
        grade,
        rows: [
          { label: "Fragments", value: `${s.fragsGot} of ${s.board.fragCount}` },
          { label: "Integrity", value: `${s.integrity}%` },
          { label: "Moves vs reference", value: `${s.moves} / ${s.board.parMoves}` },
          { label: "Payout", value: `${credits} cr` },
          { label: "Capacity XP", value: "+40" },
        ],
      };
    }
    case "software": {
      const credits = 130 + s.orderHits * 30;
      return {
        won,
        flavor,
        credits,
        xp: 40 + s.orderHits * 8,
        grade: s.orderHits >= s.board.bugCount ? "PERFECT SEQUENCE" : null,
        rows: [
          { label: "Bugs patched", value: `${s.patchedCount} of ${s.board.bugCount}` },
          { label: "In sequence", value: String(s.orderHits) },
          { label: "Payout", value: `${credits} cr` },
          { label: "Perception XP", value: `+${40 + s.orderHits * 8}` },
        ],
      };
    }
  }
}

export function diveReducer(state: DiveState, action: DiveAction): DiveState {
  switch (action.type) {
    case "regen":
      return initDive(state.type, action.seed);

    case "fxDrain": {
      if (state.fx.length === 0) return state;
      return { ...state, fx: state.fx.filter((e) => e.id > action.upTo) };
    }

    case "begin": {
      if (state.phase !== "brief") return state;
      const s = cloneState(state);
      s.phase = "run";
      s.t = 0;
      emit(s, "start");
      if (s.type === "software") {
        s.deadline = s.board.crashBaseMs;
        s.nextPing = 600;
        s.pingUntil = 0;
      }
      if (s.type === "network") {
        s.nextAdvance = s.board.advIntervalMs;
        s.nextAttack = 8000;
      }
      return s;
    }

    case "click": {
      if (state.phase !== "run") return state;
      const s = cloneState(state);
      const c = s.board.cells[action.idx];
      if (!c) return state;
      if (s.type === "network" && s.t < s.frozenUntil) {
        emit(s, "deny");
        return s;
      }
      if (c.fixed || c.kind === "source" || c.kind === "advsource") {
        emit(s, "deny");
        return s;
      }
      if (c.lockedUntil > s.t) {
        emit(s, "deny");
        say(s, "Junction is locked down");
        return s;
      }
      if (c.jam > 0) {
        c.jam--;
        s.moves++;
        emit(s, c.jam === 0 ? "unjam" : "jam");
        if (c.jam === 0) say(s, "Connector forced open");
        return s;
      }
      c.rot = (c.rot + 1) % 4;
      c.spin++;
      s.moves++;
      emit(s, "rotate");
      settle(s);
      return s;
    }

    case "tick": {
      if (state.phase !== "run") return state;
      const s = cloneState(state);
      s.t += action.dt;

      if (s.type === "network") {
        while (s.phase === "run" && s.t >= s.nextAdvance) {
          s.advClaimed++;
          s.nextAdvance += s.board.advIntervalMs;
          emit(s, "adv");
          const remaining = s.board.advPath.length - s.advClaimed;
          if (remaining === 3) {
            emit(s, "alarm");
            say(s, "Intruder closing on the core");
          }
          if (s.advClaimed >= s.board.advPath.length) {
            finish(s, false);
          }
        }
        if (s.phase === "run" && s.t >= s.nextAttack) {
          const r = roll(s);
          if (r < 0.34) {
            s.frozenUntil = s.t + 2400;
            emit(s, "freeze");
            say(s, "Intruder froze your controls");
          } else if (r < 0.67) {
            const pool = s.board.cells
              .map((cell, i) => ({ cell, i }))
              .filter(
                ({ cell, i }) =>
                  !cell.fixed &&
                  cell.kind !== "core" &&
                  s.power.powered[i] &&
                  cell.jam === 0,
              );
            if (pool.length > 0) {
              const pick = pool[Math.floor(roll(s) * pool.length)];
              pick.cell.lockedUntil = s.t + 6000;
              emit(s, "block");
              say(s, "Intruder locked a junction");
            }
          } else {
            const pool = s.board.cells
              .map((cell, i) => ({ cell, i }))
              .filter(({ cell, i }) => !cell.fixed && cell.kind !== "core" && s.power.powered[i]);
            let hit = 0;
            while (hit < 2 && pool.length > 0) {
              const k = Math.floor(roll(s) * pool.length);
              const pick = pool.splice(k, 1)[0];
              const delta = 1 + Math.floor(roll(s) * 2);
              pick.cell.rot = (pick.cell.rot + delta) % 4;
              pick.cell.spin += delta;
              hit++;
            }
            if (hit > 0) {
              emit(s, "scramble");
              say(s, "Intruder scrambled your route");
              settle(s);
            }
          }
          s.nextAttack = s.t + 6200 + roll(s) * 2200;
        }
      }

      if (s.type === "software" && s.phase === "run") {
        if (s.t >= s.nextPing) {
          s.pingUntil = s.t + 2100;
          s.nextPing = s.t + 7800;
          emit(s, "ping");
        }
        const before = s.deadline - (s.t - action.dt);
        const after = s.deadline - s.t;
        if (after < 10000 && before >= 10000) emit(s, "alarm");
        if (after <= 0) finish(s, false);
      }

      return s;
    }
  }
}
