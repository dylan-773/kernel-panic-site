import { ABILITY_BY_ID } from "./content/abilities";
import {
  applyCast,
  applyOverloadLock,
  applyRotate,
  armTargetLegal,
  emit,
  endOppTurn,
  finishDuel,
  redirectTargetLegal,
  roll,
  say,
  shieldTargetLegal,
} from "./duel-actions";
import { canRotate, isFrontier, routeCost, routePlan } from "./duel-power";
import { AbilityDef, DuelState, Side } from "./duel-types";

/**
 * The scripted opponent, v2: it plans with the same rotation-cost Dijkstra
 * the board generator uses, aligns junctions frontier-outward along the
 * cheapest route, and spends its one ability per turn where it hurts —
 * blocking the player's route when they close on the core, hardening its
 * own chokepoints, purging interference. Tier scales RAM, mistake rate and
 * cast frequency, never the rules. One visible move per oppStep.
 */

function coreDist(s: DuelState, idx: number): number {
  const c = s.cells[idx];
  const core = s.cells[s.coreIdx];
  return Math.abs(c.x - core.x) + Math.abs(c.y - core.y);
}

function kitDefs(s: DuelState): AbilityDef[] {
  return s.cfg.oppKit
    .filter((id) => !(id in s.econ.opp.disabled))
    .map((id) => ABILITY_BY_ID[id])
    .filter(Boolean);
}

/** Decide this turn's cast by priority; targets resolve at cast time. */
function decideAbility(s: DuelState): void {
  const econ = s.econ.opp;
  if (econ.abilityUsed) return;
  const kit = kitDefs(s).filter((d) => d.ramCost <= econ.ram);
  if (kit.length === 0) return;

  const playerCost = routeCost(s, "player");
  const ownCost = routeCost(s, "opp");

  // 1. The player is closing on the core: block their route.
  if (isFinite(playerCost) && playerCost <= 4 && playerCost <= ownCost) {
    const blocker =
      kit.find((d) => d.verb === "arm") ??
      kit.find((d) => d.verb === "redirect") ??
      kit.find((d) => d.verb === "shield");
    if (blocker) {
      s.oppTurn.pendingAbility = blocker.id;
      return;
    }
  }

  // 2. The player interfered recently: clean up or harden.
  if (s.lastPlayerHitRound >= s.round - 1 && s.lastPlayerHitRound > 0 && roll(s) < 0.6) {
    const guard =
      kit.find((d) => d.verb === "backdoor") ??
      kit.find((d) => d.verb === "firewall") ??
      kit.find((d) => d.verb === "shield");
    if (guard) {
      s.oppTurn.pendingAbility = guard.id;
      return;
    }
  }

  // 3. The Analyze readout must come true early.
  if (!s.oppDominantUsed && s.round >= 2) {
    const dom = kit.find((d) => d.verb === s.cfg.dominant);
    if (dom) {
      s.oppTurn.pendingAbility = dom.id;
      return;
    }
  }

  // 4. Proactive: tempo when the route is long, dominant double-weighted.
  if (roll(s) < s.cfg.abilityFreq) {
    if (isFinite(ownCost) && ownCost > econ.ramPerTurn * 2) {
      const clock = kit.find((d) => d.verb === "overclock");
      if (clock && roll(s) < 0.5) {
        s.oppTurn.pendingAbility = clock.id;
        return;
      }
    }
    const weighted: AbilityDef[] = [];
    for (const d of kit) {
      weighted.push(d);
      if (d.verb === s.cfg.dominant) weighted.push(d);
    }
    s.oppTurn.pendingAbility = weighted[Math.floor(roll(s) * weighted.length)].id;
  }
}

function computeIntent(s: DuelState): void {
  if (s.oppTurn.pendingAbility) {
    const def = ABILITY_BY_ID[s.oppTurn.pendingAbility];
    s.oppNextIntent = def ? `Charging ${def.name}` : "Charging a routine";
    return;
  }
  const cost = routeCost(s, "opp");
  if (!isFinite(cost)) s.oppNextIntent = "Probing for a route";
  else if (cost <= 3) s.oppNextIntent = "FINAL APPROACH to the core";
  else s.oppNextIntent = "Aligning junctions toward the core";
}

type CastAim = { kind: "cast"; id: string; targets: number[]; abilityTarget?: string };

/**
 * Resolve the pending ability into a telegraphed cast: targets chosen now,
 * shown to the player for one beat, applied on the next step.
 */
function prepareCast(s: DuelState): CastAim | null {
  const id = s.oppTurn.pendingAbility;
  if (!id) return null;
  const def = ABILITY_BY_ID[id];
  const econ = s.econ.opp;
  s.oppTurn.pendingAbility = null;
  if (!def || econ.abilityUsed || def.ramCost > econ.ram) return null;

  const targets: number[] = [];
  switch (def.verb) {
    case "arm": {
      // Trap the player's predicted route, deep enough that they commit.
      const plan = routePlan(s, "player");
      const pool = (plan ? plan.path.map((p) => p.idx) : [])
        .filter((i) => armTargetLegal(s, "opp", i))
        .reverse();
      if (pool.length === 0) {
        const any = s.cells
          .map((_, i) => i)
          .filter((i) => armTargetLegal(s, "opp", i) && isFrontier(s, "player", i));
        pool.push(...any);
      }
      targets.push(...pool.slice(0, def.p.traps ?? 1));
      if (targets.length === 0) return null;
      break;
    }
    case "redirect": {
      // Pick the twist that raises the player's route cost the most.
      const candidates = s.cells
        .map((_, i) => i)
        .filter((i) => redirectTargetLegal(s, "opp", i) && s.cells[i].owner === "player")
        .sort((a, b) => coreDist(s, a) - coreDist(s, b))
        .slice(0, 6);
      const steps = def.p.rotSteps ?? 1;
      let best = -1;
      let bestGain = -1;
      const before = routeCost(s, "player");
      for (const i of candidates) {
        const c = s.cells[i];
        c.rot = (c.rot + steps) % 4;
        const after = routeCost(s, "player");
        c.rot = (c.rot - steps + 4) % 4;
        const gain = (isFinite(after) ? after : 99) - (isFinite(before) ? before : 99);
        if (gain > bestGain) {
          bestGain = gain;
          best = i;
        }
      }
      if (best === -1) return null;
      targets.push(best);
      const want = def.p.targets ?? 1;
      if (want > 1) {
        const extra = candidates.filter((i) => i !== best).slice(0, want - 1);
        targets.push(...extra);
      }
      break;
    }
    case "shield": {
      const playerCost = routeCost(s, "player");
      if (isFinite(playerCost) && playerCost <= 4) {
        // Freeze the player's next junction: they cannot rotate it while locked.
        const plan = routePlan(s, "player");
        const choke = plan?.path.find(
          (p) => s.cells[p.idx].owner === "none" && shieldTargetLegal(s, "opp", p.idx),
        );
        if (choke) {
          targets.push(choke.idx);
          break;
        }
      }
      const own = s.cells
        .map((_, i) => i)
        .filter((i) => s.cells[i].owner === "opp" && shieldTargetLegal(s, "opp", i))
        .sort((a, b) => coreDist(s, a) - coreDist(s, b));
      targets.push(...own.slice(0, def.p.targets ?? 1));
      if (targets.length === 0) return null;
      break;
    }
    case "backdoor": {
      if (def.p.shieldRounds) {
        const tip = s.cells
          .map((_, i) => i)
          .filter((i) => s.cells[i].owner === "opp" && s.cells[i].kind === "node")
          .sort((a, b) => coreDist(s, a) - coreDist(s, b))[0];
        if (tip !== undefined) targets.push(tip);
      }
      break;
    }
    case "overload":
    case "overclock":
    case "firewall":
      break;
  }

  let abilityTarget: string | undefined;
  if (def.verb === "overload" && def.p.lockTurns) {
    const options = s.equipped.filter((e) => e.copies > 0);
    if (options.length > 0) {
      options.sort((a, b) => (ABILITY_BY_ID[b.id]?.tier ?? 0) - (ABILITY_BY_ID[a.id]?.tier ?? 0));
      abilityTarget = options[0].id;
    }
  }
  return { kind: "cast", id: def.id, targets, abilityTarget };
}

/** Land a telegraphed cast. Conditions cannot change between the beats. */
function executeCast(s: DuelState, aim: CastAim): void {
  const def = ABILITY_BY_ID[aim.id];
  const econ = s.econ.opp;
  if (!def || econ.abilityUsed || def.ramCost > econ.ram) return;
  applyCast(s, "opp", def, aim.targets);
  if (def.verb === "overload" && def.p.lockTurns && aim.abilityTarget) {
    applyOverloadLock(s, "opp", def, aim.abilityTarget);
  }
  if (def.verb === s.cfg.dominant) s.oppDominantUsed = true;
}

type QueueEntry = { idx: number; targetRot: number };

/**
 * Build a committed rotation queue from the current cheapest route: one
 * entry per misaligned junction, in path order, with ABSOLUTE target
 * rotations. Executing the whole queue in order produces a conducting
 * chain from port to core; the queue never oscillates the way per-step
 * replanning does. Returns [] when no route exists.
 */
function buildQueue(s: DuelState, side: Side): QueueEntry[] {
  let plan = routePlan(s, side);
  if (
    plan &&
    plan.steps.some(
      (p) => s.cells[p.idx].lockedThroughRound >= s.round && s.cells[p.idx].lockedBy !== side,
    )
  ) {
    // A shield sits on the route: try to route around every locked junction.
    const avoid = new Set(
      plan.steps
        .filter((p) => s.cells[p.idx].lockedThroughRound >= s.round && s.cells[p.idx].lockedBy !== side)
        .map((p) => p.idx),
    );
    plan = routePlan(s, side, avoid) ?? plan;
  }
  if (!plan) return [];
  return plan.steps.map((p) => ({ idx: p.idx, targetRot: p.targetRot }));
}

/**
 * Choose the next rotation from a committed queue WITHOUT applying it.
 * Returns the cell index, or -1 when the turn has nothing left. `replan`
 * must implement a cost-improvement guard, or a blindspot route would
 * burn RAM in cycles. Fumble rolls happen here, at pick time.
 */
function pickFromQueue(
  s: DuelState,
  side: Side,
  queue: QueueEntry[],
  greed: number,
  replan: () => void,
): number {
  const econ = s.econ[side];
  if (econ.ram < 1) return -1;

  while (queue.length > 0 && s.cells[queue[0].idx].rot === queue[0].targetRot) queue.shift();
  let head = queue[0];
  if (!head) {
    replan();
    while (queue.length > 0 && s.cells[queue[0].idx].rot === queue[0].targetRot) queue.shift();
    head = queue[0];
    if (!head) return -1;
  }
  if (!canRotate(s, side, head.idx)) {
    // Claimed out from under us or shield-locked: rebuild from scratch.
    queue.length = 0;
    replan();
    while (queue.length > 0 && s.cells[queue[0].idx].rot === queue[0].targetRot) queue.shift();
    head = queue[0];
    if (!head || !canRotate(s, side, head.idx)) return -1;
  }

  if (roll(s) >= greed) {
    // Fumble: twist a random frontier node instead; the queue stands.
    const pool = s.cells
      .map((_, i) => i)
      .filter((i) => i !== head.idx && canRotate(s, side, i) && s.cells[i].owner === "none");
    if (pool.length > 0) {
      return pool[Math.floor(roll(s) * pool.length)];
    }
  }
  return head.idx;
}

/** Pick and apply in one beat: the balance harness's proxy-player path. */
function queueRotateStep(
  s: DuelState,
  side: Side,
  queue: QueueEntry[],
  greed: number,
  replan: () => void,
): boolean {
  const idx = pickFromQueue(s, side, queue, greed, replan);
  if (idx === -1) return false;
  return applyRotate(s, side, idx);
}

interface ReplanMem {
  n: number;
  lastCost: number;
}

/** Replanner with a strict-progress guard against planner blindspots. */
function makeReplanner(s: DuelState, side: Side, queue: QueueEntry[], mem: ReplanMem) {
  return () => {
    if (mem.n <= 0) return;
    const cost = routeCost(s, side);
    if (!(cost < mem.lastCost)) {
      // No strict progress since the previous replan: stop feeding a cycle.
      return;
    }
    mem.lastCost = cost;
    mem.n--;
    queue.length = 0;
    queue.push(...buildQueue(s, side));
  };
}

/**
 * Play one whole turn for a side with the committed-queue bot. Used by the
 * balance harness as the proxy player. Does not end the turn.
 */
export function botPlayTurn(s: DuelState, side: Side, greed: number): void {
  const queue = buildQueue(s, side);
  const mem: ReplanMem = { n: 3, lastCost: Infinity };
  const replan = makeReplanner(s, side, queue, mem);
  let guard = 0;
  while (s.phase === "playing" && s.turn === side && s.econ[side].ram >= 1 && guard++ < 40) {
    if (!queueRotateStep(s, side, queue, greed, replan)) break;
  }
}

/** Perform one opponent move. Ends the opponent turn when nothing is left. */
export function oppStep(s: DuelState): void {
  if (s.phase !== "playing" || s.turn !== "opp") return;
  const ot = s.oppTurn;

  // The tutorial machine never lets the dive drag: if the player somehow
  // walls it off, it stops playing fair and seals the duel on the spot.
  if (s.cfg.tutorial && !isFinite(routeCost(s, "opp"))) {
    say(s, "The machine stops pretending. The door was never really open.");
    finishDuel(s, "opp", "core");
    return;
  }

  if (!ot.started) {
    ot.started = true;
    decideAbility(s);
    computeIntent(s);
    ot.queue = buildQueue(s, "opp");
    return; // one visible "thinking" beat
  }

  // A telegraphed move lands one beat after it was shown.
  if (ot.aim) {
    const aim = ot.aim;
    ot.aim = null;
    if (aim.kind === "cast") {
      executeCast(s, aim);
      // Abilities can reshape the board; recommit the movement plan.
      ot.queue = buildQueue(s, "opp");
      return;
    }
    if (canRotate(s, "opp", aim.idx) && s.econ.opp.ram >= 1) {
      applyRotate(s, "opp", aim.idx);
      return;
    }
    // The aimed junction was stolen between beats; fall through and replan.
  }

  if (ot.pendingAbility) {
    const prepared = prepareCast(s);
    if (prepared) {
      ot.aim = prepared;
      const def = ABILITY_BY_ID[prepared.id];
      emit(s, `oppCast:${def?.verb ?? "arm"}`);
      return;
    }
  }

  const mem: ReplanMem = { n: ot.replans, lastCost: ot.lastReplanCost };
  const replan = makeReplanner(s, "opp", ot.queue, mem);
  const idx = pickFromQueue(s, "opp", ot.queue, s.cfg.greed, replan);
  ot.replans = mem.n;
  ot.lastReplanCost = mem.lastCost;
  if (idx !== -1) {
    ot.aim = { kind: "rotate", idx };
    emit(s, "oppAim", idx);
    return;
  }

  endOppTurn(s);
}
