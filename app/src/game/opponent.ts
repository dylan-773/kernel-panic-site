import { ATTACK_WIDTH, DEFEND_WIDTH, OppMode, WARD_RADIUS } from "./content/kit";
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
import {
  canRotate,
  computePower,
  isFrontier,
  repairCostOf,
  routeCost,
  routePlan,
} from "./duel-power";
import { execCommand } from "./duel-commands";
import { Board, DuelState, Side, isJunction, otherSide } from "./duel-types";

/**
 * The scripted opponent, v4: it plans with the same rotation-cost Dijkstra
 * the board generator uses, aligns junctions reach-outward along the cheapest
 * route on ITS OWN board, and runs the same three programs the player does -
 * one cast per turn, reaching across to twist or trap the player's grid, and
 * spending its defends on its own. Tier scales RAM, mistake rate and cast
 * width, never the rules. One visible move per oppStep.
 *
 * Two dials drive how well it plays, and neither is `greed`:
 *
 *   horizon  what it understands. 0 races blind, 1 scores a cut by route cost
 *            (the old AI), 2 also sees what a cut puts in the dark, 3 weights
 *            by repair cost and knows when to stop racing and start denying.
 *   focus    how reliably it picks the best of what it found. Rolled ONCE per
 *            turn, so unlike greed it does not compound with duel length.
 */

/** What the machine should be spending this turn on. */
type Stance = "race" | "deny" | "mixed";

/**
 * Compare the two clocks in TURNS, not route cost: a 20-cost route at 10 RAM
 * is closer to done than a 14-cost route at 5. Racing when you have already
 * lost the race is the single most common way a scripted opponent throws a
 * won position.
 */
function assessRace(s: DuelState): Stance {
  if (s.cfg.horizon < 3) return "mixed";
  const turns = (side: Side): number => {
    const c = routeCost(s.boards[side]);
    if (!isFinite(c)) return 99;
    return c / Math.max(1, s.econ[side].ramPerTurn);
  };
  const mine = turns("opp");
  const theirs = turns("player");
  if (theirs < mine - 0.25) return "deny";
  if (theirs > mine + 1) return "race";
  return "mixed";
}

function countTrue(a: boolean[]): number {
  let n = 0;
  for (const v of a) if (v) n++;
  return n;
}

/**
 * What twisting this cell does to the enemy, at the configured depth. Scored
 * on THEIR board, which is the only place a cut can land.
 *
 * The old scorer only ever asked "does this raise their route cost", which is
 * blind to the thing that actually hurts on a live grid: a twist at a junction
 * everything else hangs off puts the whole downstream in the dark and costs
 * them 3 RAM to put back, while the route cost barely moves.
 */
function cutScore(s: DuelState, foe: Board, idx: number): number {
  const c = foe.cells[idx];
  const horizon = s.cfg.horizon;
  const beforeCost = routeCost(foe);
  const beforeLit = countTrue(foe.power);

  c.rot = (c.rot + 1) % 4;
  const afterCost = routeCost(foe);
  const afterLit = horizon >= 2 ? countTrue(computePower(foe)) : beforeLit;
  c.rot = (c.rot + 3) % 4;

  const costGain = (isFinite(afterCost) ? afterCost : 99) - (isFinite(beforeCost) ? beforeCost : 99);
  let score = costGain * 2;
  // Depth 2: how much of their live grid this puts in the dark.
  if (horizon >= 2) score += (beforeLit - afterLit) * 3;
  // Depth 3: an elbow costs 3 RAM to undo, a straight 1, a cross nothing.
  if (horizon >= 3) score += repairCostOf(c) * 2;
  return score;
}

/** Manhattan distance to the nearest goal cell on that board. */
function goalDist(b: Board, idx: number): number {
  const c = b.cells[idx];
  let best = Infinity;
  for (const g of b.goal) {
    const gc = b.cells[g];
    best = Math.min(best, Math.abs(c.x - gc.x) + Math.abs(c.y - gc.y));
  }
  return best;
}

/** Distance from the entry, i.e. how much sits downstream of this node. */
function entryDist(b: Board, idx: number): number {
  const c = b.cells[idx];
  const e = b.cells[b.entry];
  return Math.abs(c.x - e.x) + Math.abs(c.y - e.y);
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
    const hasTrap = s.boards.player.cells.some((c) => c.trap);
    if (!tutorialLessonDone(s) && !hasTrap && !econ.used.attack && atk.length > 0) {
      s.oppTurn.pendingCast = { prog: "attack", mode: atk[0] };
    }
    return;
  }

  const playerCost = routeCost(s.boards.player);
  const ownCost = routeCost(s.boards.opp);
  const stance = assessRace(s);

  // 1. Their clock is shorter than ours, or they are about to close: reach
  // across. At horizon 3 this is a real comparison of the two race clocks;
  // below it, the old "they are nearly there" proxy.
  const mustDeny =
    stance === "deny" || (isFinite(playerCost) && playerCost <= 4 && playerCost <= ownCost);
  if (mustDeny && !econ.used.attack) {
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
    const plan = routePlan(s.boards.opp);
    const trapped = plan?.path.some((p) => s.boards.opp.cells[p.idx].trap);
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
  const cost = routeCost(s.boards.opp);
  if (!isFinite(cost)) s.oppNextIntent = "Probing for a route";
  else if (cost <= 3) s.oppNextIntent = "FINAL APPROACH to its goal";
  else s.oppNextIntent = "Aligning junctions toward its goal";
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
  const own = s.boards[side];
  const foe = s.boards[enemy];
  const width = prog === "attack" ? ATTACK_WIDTH[tierOf(s, side, "attack")] : DEFEND_WIDTH[tierOf(s, side, "defend")];
  const targets: number[] = [];

  switch (mode) {
    case "armHalt":
    case "armSiphon": {
      // Mine the enemy's predicted route on their own board. Normally deep,
      // so they commit before it fires; in the tutorial shallow, so Scan can
      // catch it.
      const plan = routePlan(foe);
      let pool = (plan ? plan.path.map((p) => p.idx) : []).filter((i) =>
        armTargetLegal(s, side, i),
      );
      if (!s.cfg.tutorial) pool = pool.reverse();
      if (pool.length === 0) {
        pool = foe.cells
          .map((_, i) => i)
          .filter((i) => armTargetLegal(s, side, i) && isFrontier(foe, i));
      }
      targets.push(...pool.slice(0, width));
      if (targets.length === 0) return null;
      break;
    }
    case "redirect": {
      if (s.cfg.horizon <= 0) {
        // Races blind: twists whatever sits nearest their goal.
        const naive = foe.cells
          .map((_, i) => i)
          .filter((i) => redirectTargetLegal(s, side, i))
          .sort((a, b) => goalDist(foe, a) - goalDist(foe, b))
          .slice(0, width);
        if (naive.length === 0) return null;
        targets.push(...naive);
        break;
      }
      /*
       * Candidates are drawn from their LIVE grid and their planned route,
       * not from "whatever is near the goal": a twist on a dark node they
       * have not reached yet costs them almost nothing.
       */
      const onRoute = new Set((routePlan(foe)?.path ?? []).map((p) => p.idx));
      const candidates = foe.cells
        .map((_, i) => i)
        .filter((i) => redirectTargetLegal(s, side, i) && (foe.power[i] || onRoute.has(i)))
        .sort((a, b) => goalDist(foe, a) - goalDist(foe, b))
        .slice(0, 14);
      if (candidates.length === 0) return null;
      const ranked = candidates
        .map((i) => ({ i, score: cutScore(s, foe, i) }))
        .sort((a, b) => b.score - a.score);
      // focus: one roll per turn, best target or a random one of the top three.
      const sloppy = roll(s) >= s.cfg.focus;
      const head = sloppy
        ? ranked[Math.floor(roll(s) * Math.min(3, ranked.length))]
        : ranked[0];
      targets.push(head.i);
      targets.push(...ranked.filter((r) => r.i !== head.i).slice(0, width - 1).map((r) => r.i));
      break;
    }
    case "purge": {
      // Their traps are on OUR board.
      const plan = routePlan(own);
      const onRoute = (plan ? plan.path.map((p) => p.idx) : []).filter((i) =>
        purgeTargetLegal(s, side, i),
      );
      const anywhere = own.cells.map((_, i) => i).filter((i) => purgeTargetLegal(s, side, i));
      const pool = [...new Set([...onRoute, ...anywhere])];
      targets.push(...pool.slice(0, width));
      if (targets.length === 0) return null;
      break;
    }
    case "lock": {
      // Bolt down our own chain against their REDIRECT. Nearest the entry
      // first: cutting there drops the most downstream, so it is the twist
      // worth denying. Fall back to any built node on the route.
      const plan = routePlan(own);
      const onRoute = (plan?.path ?? [])
        .map((p) => p.idx)
        .filter((i) => own.cells[i].built && lockTargetLegal(s, side, i))
        .sort((a, b) => entryDist(own, a) - entryDist(own, b));
      targets.push(...onRoute.slice(0, width));
      if (targets.length < width) {
        const rest = own.cells
          .map((_, i) => i)
          .filter((i) => own.cells[i].built && lockTargetLegal(s, side, i) && !targets.includes(i))
          .sort((a, b) => entryDist(own, a) - entryDist(own, b));
        targets.push(...rest.slice(0, width - targets.length));
      }
      if (targets.length === 0) return null;
      break;
    }
    case "ward": {
      /*
       * Ward is area cover, so centre it where it covers the most of our own
       * live chain plus the lane immediately ahead - the stretch a redirect
       * would cut and a trapper wants to mine. Lock takes named nodes; this
       * takes the neighbourhood, and picking the centre by coverage is the
       * whole difference between the two.
       */
      const plan = routePlan(own);
      const worth = new Set<number>([
        ...own.cells.map((_, i) => i).filter((i) => own.power[i] && isJunction(own.cells[i])),
        ...(plan?.path ?? []).map((p) => p.idx),
      ]);
      const radius = WARD_RADIUS[tierOf(s, side, "defend")];
      let bestIdx = -1;
      let bestCover = -1;
      for (const i of worth) {
        if (!wardTargetLegal(s, side, i)) continue;
        const c = own.cells[i];
        let cover = 0;
        for (const j of worth) {
          const d = own.cells[j];
          if (Math.abs(d.x - c.x) + Math.abs(d.y - c.y) <= radius) cover++;
        }
        if (cover > bestCover) {
          bestCover = cover;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) return null;
      targets.push(bestIdx);
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

/**
 * Land a telegraphed cast. Goes through the shared command gate rather than
 * re-deriving its own affordability check, which is where the machine used to
 * test `ram < 1` with a literal in place of `programCost`. Logging is off: the
 * machine never undoes, so it has no use for a turn log or a snapshot.
 */
function executeCast(s: DuelState, aim: CastAim): void {
  const r = execCommand(
    s,
    "opp",
    { kind: "cast", prog: aim.prog, mode: aim.mode, targets: aim.targets },
    { arm: false },
  );
  if (!r.ok) return;
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
  const b = s.boards[side];
  const frozen = (i: number): boolean =>
    b.cells[i].lockedThroughRound >= s.round && b.cells[i].lockedBy !== null && b.cells[i].lockedBy !== side;
  let plan = routePlan(b);
  if (plan && plan.steps.some((p) => frozen(p.idx))) {
    // A lock sits on the route: try to route around every frozen junction.
    const avoid = new Set(plan.steps.filter((p) => frozen(p.idx)).map((p) => p.idx));
    plan = routePlan(b, avoid) ?? plan;
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
  const b = s.boards[side];
  const aligned = (): boolean => queue.length > 0 && b.cells[queue[0].idx].rot === queue[0].targetRot;

  while (aligned()) queue.shift();
  let head = queue[0];
  if (!head) {
    replan();
    while (aligned()) queue.shift();
    head = queue[0];
    if (!head) return -1;
  }
  if (!canRotate(s, side, head.idx)) {
    // Lock-frozen between beats: rebuild from scratch.
    queue.length = 0;
    replan();
    while (aligned()) queue.shift();
    head = queue[0];
    if (!head || !canRotate(s, side, head.idx)) return -1;
  }

  if (roll(s) >= greed) {
    // Fumble: twist a random reachable fresh node instead; the queue stands.
    const pool = b.cells
      .map((_, i) => i)
      .filter((i) => i !== head.idx && !b.cells[i].built && canRotate(s, side, i));
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
  return execCommand(s, side, { kind: "rotate", idx }, { arm: false }).ok;
}

interface ReplanMem {
  n: number;
  lastCost: number;
}

/** Replanner with a strict-progress guard against planner blindspots. */
function makeReplanner(s: DuelState, side: Side, queue: QueueEntry[], mem: ReplanMem) {
  return () => {
    if (mem.n <= 0) return;
    const cost = routeCost(s.boards[side]);
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

  // The tutorial machine never lets the dive drag: if its own board somehow
  // has no route, it stops playing fair and seals the duel on the spot.
  // (An actual player win is impossible - the goal seals on contact.)
  if (s.cfg.tutorial && !isFinite(routeCost(s.boards.opp))) {
    finishDuel(
      s,
      "opp",
      "seal",
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
  // greed stays the per-day movement dial. The worry was that it compounds
  // with duel length (greed^oppRam per turn), but dives now run 3-4 rounds,
  // not the 9 that would make it unusable - and pinning it high deleted the
  // early-day sloppiness that is the whole reason day 1 is winnable.
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
