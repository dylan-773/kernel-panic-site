import { ATTACK_WIDTH, DEFEND_WIDTH, OppMode } from "./content/kit";
import {
  applyCast,
  applyRotate,
  armTargetLegal,
  emit,
  endOppTurn,
  finishDuel,
  lockTargetLegal,
  purgeTargetLegal,
  redirectTargetLegal,
  roll,
  say,
  tierOf,
  tutorialLessonDone,
  wardTargetLegal,
} from "./duel-actions";
import { canRotate, isFrontier, routeCost, routePlan } from "./duel-power";
import { DuelState, Side, otherSide } from "./duel-types";

/**
 * The scripted opponent, v3: it plans with the same rotation-cost Dijkstra
 * the board generator uses, aligns junctions reach-outward along the
 * cheapest route, and runs the same three programs the player does - one
 * cast per turn, spent where it hurts: trapping or twisting the player's
 * route when they close on the core, purging their traps off its lane,
 * clamping chokepoints. Tier scales RAM, mistake rate and cast width,
 * never the rules. One visible move per oppStep.
 */

function coreDist(s: DuelState, idx: number): number {
  const c = s.cells[idx];
  const core = s.cells[s.coreIdx];
  return Math.abs(c.x - core.x) + Math.abs(c.y - core.y);
}

const ATTACK_MODES: OppMode[] = ["redirect", "armHalt", "armSiphon"];

function progOf(mode: OppMode): "attack" | "defend" {
  return ATTACK_MODES.includes(mode) ? "attack" : "defend";
}

/** Decide this turn's cast by priority; targets resolve at cast time. */
function decideProgram(s: DuelState): void {
  const econ = s.econ.opp;
  if (econ.ram < 1) return;
  const atk = s.cfg.oppAttackModes;
  const def = s.cfg.oppDefendModes;

  // Tutorial: keep exactly one scripted trap on the player's lane while
  // the lesson runs. It lands shallow so a tier-1 Scan can find it - and
  // if the player springs or purges it early, another gets planted, so
  // the scan-purge lesson always has a subject.
  if (s.cfg.tutorial) {
    const hasTrap = s.cells.some((c) => c.trap && c.trap.by === "opp");
    if (!tutorialLessonDone(s) && !hasTrap && !econ.used.attack && atk.length > 0) {
      s.oppTurn.pendingCast = { prog: "attack", mode: atk[0] };
    }
    return;
  }

  const playerCost = routeCost(s, "player");
  const ownCost = routeCost(s, "opp");

  // 1. The player is closing on the core: block their route.
  if (isFinite(playerCost) && playerCost <= 4 && playerCost <= ownCost && !econ.used.attack) {
    const armMode = atk.find((m) => m !== "redirect");
    if (armMode && roll(s) < 0.55) {
      s.oppTurn.pendingCast = { prog: "attack", mode: armMode };
      return;
    }
    if (atk.includes("redirect")) {
      s.oppTurn.pendingCast = { prog: "attack", mode: "redirect" };
      return;
    }
    if (def.includes("lock") && !econ.used.defend) {
      s.oppTurn.pendingCast = { prog: "defend", mode: "lock" };
      return;
    }
  }

  // 2. Player traps sit on its planned route: sweep them.
  if (def.includes("purge") && !econ.used.defend) {
    const plan = routePlan(s, "opp");
    const trapped = plan?.path.some((p) => {
      const c = s.cells[p.idx];
      return c.trap && c.trap.by === "player";
    });
    if (trapped && roll(s) < 0.7) {
      s.oppTurn.pendingCast = { prog: "defend", mode: "purge" };
      return;
    }
  }

  // 3. The player interfered recently: harden or fence them out.
  if (s.lastPlayerHitRound >= s.round - 1 && s.lastPlayerHitRound > 0 && roll(s) < 0.5) {
    const guard = def.find((m) => m === "lock") ?? def.find((m) => m === "ward");
    if (guard && !econ.used.defend) {
      s.oppTurn.pendingCast = { prog: "defend", mode: guard };
      return;
    }
  }

  // 4. The Analyze readout must come true early.
  if (!s.oppDominantUsed && s.round >= 2) {
    const dom = s.cfg.dominant;
    const prog = progOf(dom);
    const available =
      prog === "attack" ? (atk as OppMode[]).includes(dom) : (def as OppMode[]).includes(dom);
    if (available && !econ.used[prog]) {
      s.oppTurn.pendingCast = { prog, mode: dom };
      return;
    }
  }

  // 5. Proactive roll, dominant double-weighted.
  if (roll(s) < s.cfg.abilityFreq) {
    const pool: Array<{ prog: "attack" | "defend"; mode: OppMode }> = [];
    for (const m of atk) if (!econ.used.attack) pool.push({ prog: "attack", mode: m });
    for (const m of def) if (!econ.used.defend) pool.push({ prog: "defend", mode: m });
    for (const entry of [...pool]) if (entry.mode === s.cfg.dominant) pool.push(entry);
    if (pool.length > 0) {
      s.oppTurn.pendingCast = pool[Math.floor(roll(s) * pool.length)];
    }
  }
}

function computeIntent(s: DuelState): void {
  if (s.oppTurn.pendingCast) {
    s.oppNextIntent = `Charging ${s.oppTurn.pendingCast.mode.toUpperCase()}`;
    return;
  }
  const cost = routeCost(s, "opp");
  if (!isFinite(cost)) s.oppNextIntent = "Probing for a route";
  else if (cost <= 3) s.oppNextIntent = "FINAL APPROACH to the core";
  else s.oppNextIntent = "Aligning junctions toward the core";
}

export type CastAim = { kind: "cast"; prog: "attack" | "defend"; mode: OppMode; targets: number[] };

/**
 * Choose targets for a program cast, side-generic. Pure targeting: no RNG,
 * no state mutation. Returns null when no legal target exists. Width comes
 * from the caster's own tier (kit for the player, cfg for the machine).
 */
export function prepareCastFor(
  s: DuelState,
  side: Side,
  prog: "attack" | "defend",
  mode: OppMode,
): CastAim | null {
  const enemy = otherSide(side);
  const width = prog === "attack" ? ATTACK_WIDTH[tierOf(s, side, "attack")] : DEFEND_WIDTH[tierOf(s, side, "defend")];
  const targets: number[] = [];

  switch (mode) {
    case "armHalt":
    case "armSiphon": {
      // Trap the enemy's predicted route. Normally deep, so they commit
      // before it fires; in the tutorial shallow, so Scan can catch it.
      const plan = routePlan(s, enemy);
      let pool = (plan ? plan.path.map((p) => p.idx) : []).filter((i) =>
        armTargetLegal(s, side, i),
      );
      if (!s.cfg.tutorial) pool = pool.reverse();
      if (pool.length === 0) {
        pool = s.cells
          .map((_, i) => i)
          .filter((i) => armTargetLegal(s, side, i) && isFrontier(s, enemy, i));
      }
      targets.push(...pool.slice(0, width));
      if (targets.length === 0) return null;
      break;
    }
    case "redirect": {
      // Pick the twist that raises the enemy's route cost the most.
      const candidates = s.cells
        .map((_, i) => i)
        .filter((i) => redirectTargetLegal(s, side, i) && s.cells[i].owner === enemy)
        .sort((a, b) => coreDist(s, a) - coreDist(s, b))
        .slice(0, 6);
      let best = -1;
      let bestGain = -1;
      const before = routeCost(s, enemy);
      for (const i of candidates) {
        const c = s.cells[i];
        c.rot = (c.rot + 1) % 4;
        const after = routeCost(s, enemy);
        c.rot = (c.rot + 3) % 4;
        const gain = (isFinite(after) ? after : 99) - (isFinite(before) ? before : 99);
        if (gain > bestGain) {
          bestGain = gain;
          best = i;
        }
      }
      if (best === -1) return null;
      targets.push(best);
      targets.push(...candidates.filter((i) => i !== best).slice(0, width - 1));
      break;
    }
    case "purge": {
      const plan = routePlan(s, side);
      const onRoute = (plan ? plan.path.map((p) => p.idx) : []).filter((i) =>
        purgeTargetLegal(s, side, i),
      );
      const anywhere = s.cells.map((_, i) => i).filter((i) => purgeTargetLegal(s, side, i));
      const pool = [...new Set([...onRoute, ...anywhere])];
      targets.push(...pool.slice(0, width));
      if (targets.length === 0) return null;
      break;
    }
    case "lock": {
      // Freeze the enemy's next junctions when they threaten, else armor
      // the caster's own chain nearest the core.
      const enemyCost = routeCost(s, enemy);
      if (isFinite(enemyCost) && enemyCost <= 4) {
        const plan = routePlan(s, enemy);
        const chokes = (plan?.path ?? [])
          .filter((p) => s.cells[p.idx].owner === "none" && lockTargetLegal(s, side, p.idx))
          .map((p) => p.idx);
        targets.push(...chokes.slice(0, width));
      }
      if (targets.length < width) {
        const own = s.cells
          .map((_, i) => i)
          .filter(
            (i) =>
              s.cells[i].owner === side && lockTargetLegal(s, side, i) && !targets.includes(i),
          )
          .sort((a, b) => coreDist(s, a) - coreDist(s, b));
        targets.push(...own.slice(0, width - targets.length));
      }
      if (targets.length === 0) return null;
      break;
    }
    case "ward": {
      // Ward the unclaimed lane ahead - the nodes a trapper wants.
      const plan = routePlan(s, side);
      const ahead = plan?.path.find(
        (p) => s.cells[p.idx].owner === "none" && wardTargetLegal(s, side, p.idx),
      );
      if (!ahead) return null;
      targets.push(ahead.idx);
      break;
    }
  }
  return { kind: "cast", prog, mode, targets };
}

/**
 * Resolve the pending program into a telegraphed cast: targets chosen now,
 * shown to the player for one beat, applied on the next step.
 */
function prepareCast(s: DuelState): CastAim | null {
  const pc = s.oppTurn.pendingCast;
  if (!pc) return null;
  s.oppTurn.pendingCast = null;
  const econ = s.econ.opp;
  if (econ.used[pc.prog] || econ.ram < 1) return null;
  return prepareCastFor(s, "opp", pc.prog, pc.mode);
}

/** Land a telegraphed cast. Conditions cannot change between the beats. */
function executeCast(s: DuelState, aim: CastAim): void {
  const econ = s.econ.opp;
  if (econ.used[aim.prog] || econ.ram < 1) return;
  applyCast(s, "opp", aim.prog, aim.mode, aim.targets);
  if (aim.mode === s.cfg.dominant) s.oppDominantUsed = true;
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
    // A lock sits on the route: try to route around every frozen junction.
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
    // Claimed out from under us or lock-frozen: rebuild from scratch.
    queue.length = 0;
    replan();
    while (queue.length > 0 && s.cells[queue[0].idx].rot === queue[0].targetRot) queue.shift();
    head = queue[0];
    if (!head || !canRotate(s, side, head.idx)) return -1;
  }

  if (roll(s) >= greed) {
    // Fumble: twist a random reachable node instead; the queue stands.
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
  // (An actual player win is impossible - the core seals on contact.)
  if (s.cfg.tutorial && !isFinite(routeCost(s, "opp"))) {
    finishDuel(
      s,
      "opp",
      "core",
      "The machine stopped pretending and sealed itself. The door was never really open.",
    );
    return;
  }

  if (!ot.started) {
    ot.started = true;
    decideProgram(s);
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
      // Casts can reshape the board; recommit the movement plan.
      ot.queue = buildQueue(s, "opp");
      return;
    }
    if (canRotate(s, "opp", aim.idx) && s.econ.opp.ram >= 1) {
      applyRotate(s, "opp", aim.idx);
      return;
    }
    // The aimed junction was stolen between beats; fall through and replan.
  }

  if (ot.pendingCast) {
    const prepared = prepareCast(s);
    if (prepared) {
      ot.aim = prepared;
      emit(s, `oppCast:${prepared.mode}`);
      return;
    }
  }

  // Through the lesson (and the round it completes on), the tutorial
  // machine plays at quarter speed: at most 4 RAM a turn, banking the
  // rest. The player gets one full-kit turn before it stops pretending.
  if (
    s.cfg.tutorial &&
    (!tutorialLessonDone(s) || s.round <= s.tutorialLessonRound) &&
    ot.ramAtStart - s.econ.opp.ram >= 4
  ) {
    endOppTurn(s);
    return;
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
