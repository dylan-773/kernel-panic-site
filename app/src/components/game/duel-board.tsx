import { useMemo } from "react";
import { effectiveDuelArms } from "../../game/duel-power";
import { DuelCell, DuelState, Side } from "../../game/duel-types";
import { DX, DY, oppositeDir, rotateArms } from "../../game/types";

/**
 * The board as a circuit schematic: arms are crisp traces, hubs are pixel
 * squares, ports are component boxes, the core is a hatched component block
 * with corner brackets that flare when a flood touches it, slag is
 * checker-dithered debris, and powered arms carry marching-dash current
 * DIRECTED port-to-frontier (a per-render BFS assigns every lit arm in/out
 * flow, so current visibly runs port-to-frontier along a claimed line).
 *
 * NEVER `transform-box: fill-box` on the arm groups: CSS transforms on SVG
 * elements pivot on the local origin (the hub, after the parent translate),
 * which the pre-scrambled spin depends on. fill-box pivots on the arm set's
 * own bounding box, off-hub for I/L/T junctions, and the grid disconnects.
 */

const CS = 52;
const HALF = CS / 2;

export interface DuelBoardProps {
  state: DuelState;
  legal: Set<number>;
  selected: Set<number>;
  /** Cells the machine has locked onto this beat (telegraphed move). */
  aimed: Set<number>;
  /** TAP LINE: the intrusion's traced route. */
  traced: Set<number>;
  /** Armed patch piece's arms, or null when nothing is armed. */
  ghostMask?: number | null;
  onCell: (idx: number) => void;
  /** The machine's port tag. */
  machineTag?: string;
}

const ARM_ENDS: Array<[number, number]> = [
  [0, -HALF],
  [HALF, 0],
  [0, HALF],
  [-HALF, 0],
];

function ArmSet({ mask, cls, width, len = HALF }: { mask: number; cls: string; width: number; len?: number }) {
  const ends: Array<[number, number]> = [
    [0, -len],
    [len, 0],
    [0, len],
    [-len, 0],
  ];
  return (
    <>
      {ends.map(([x, y], d) =>
        (mask & (1 << d)) !== 0 ? (
          <line key={d} x1={0} y1={0} x2={x} y2={y} className={cls} strokeWidth={width} />
        ) : null,
      )}
    </>
  );
}

/** Powered-overlay lines, one per drawn arm, flow class per the BFS depths. */
function LitArms({
  mask,
  live,
  flow,
}: {
  mask: number;
  /** Maps a drawn direction to the live board direction. */
  live: (d: number) => number;
  flow: (liveDir: number) => string;
}) {
  return (
    <>
      {ARM_ENDS.map(([x, y], d) =>
        (mask & (1 << d)) !== 0 ? (
          <line key={`l${d}`} x1={0} y1={0} x2={x} y2={y} className={`dv-armlit${flow(live(d))}`} strokeWidth={2} />
        ) : null,
      )}
    </>
  );
}

/** Irregular slag silhouette, seeded off the index so it never reflows. */
function slagPoints(idx: number): string {
  let s = (idx * 2654435761) >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 8) / 0xffffff;
  };
  const pts: string[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + next() * 0.5;
    const r = 11 + next() * 6;
    pts.push(`${Math.round(Math.cos(a) * r)},${Math.round(Math.sin(a) * r)}`);
  }
  return pts.join(" ");
}

/**
 * Hop count from a side's port through its powered network, walking only
 * aligned arm pairs: current runs away from the port, so an arm facing a
 * shallower neighbor is the inflow. Undirected marching reads wrong the
 * moment two arms join.
 */
function flowDepths(state: DuelState, side: Side): number[] {
  const D: number[] = new Array(state.cells.length).fill(Infinity);
  const entry = side === "player" ? state.entryP : state.entryO;
  const pow = state.power[side];
  D[entry] = 0;
  const q = [entry];
  while (q.length > 0) {
    const i = q.shift()!;
    const c = state.cells[i];
    const arms = effectiveDuelArms(c);
    for (let d = 0; d < 4; d++) {
      if ((arms & (1 << d)) === 0) continue;
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || nx >= state.w || ny < 0 || ny >= state.h) continue;
      const n = ny * state.w + nx;
      if (!pow[n] || isFinite(D[n])) continue;
      if ((effectiveDuelArms(state.cells[n]) & (1 << oppositeDir(d))) === 0) continue;
      D[n] = D[i] + 1;
      q.push(n);
    }
  }
  return D;
}

function CellG({
  state,
  cell,
  idx,
  legal,
  picked,
  aimed,
  traced,
  ghostMask,
  depths,
  onCell,
  machineTag,
}: {
  state: DuelState;
  cell: DuelCell;
  idx: number;
  legal: boolean;
  picked: boolean;
  aimed: boolean;
  traced: boolean;
  ghostMask: number | null;
  depths: Record<Side, number[]>;
  onCell: (idx: number) => void;
  machineTag: string;
}) {
  const litP = state.power.player[idx] ?? false;
  const litO = state.power.opp[idx] ?? false;
  const locked = cell.lockedThroughRound >= state.round;
  const warded = cell.wardThroughRound >= state.round;
  const trapVisible =
    !!cell.trap && (cell.trap.by === "player" || cell.trap.revealed || state.phase !== "playing");

  const cls = ["dv-cell", `dv-k-${cell.kind}`];
  if (cell.kind === "node") {
    if (cell.owner === "player") cls.push("dv-own-p");
    else if (cell.owner === "opp") cls.push("dv-own-o");
    else cls.push("dv-own-n");
  }
  if (cell.kind === "entryP") cls.push("dv-own-p");
  if (cell.kind === "entryO") cls.push("dv-own-o");
  if (litP) cls.push("dv-lit-p");
  if (litO) cls.push("dv-lit-o");
  if (legal) cls.push("dv-legal");
  if (picked) cls.push("dv-picked");
  if (aimed) cls.push("dv-aimed");
  if (traced) cls.push("dv-traced");
  if (locked) cls.push("dv-locked");
  if (warded && !locked) cls.push("dv-warded");
  if (cell.fused) cls.push("dv-fused");
  if (trapVisible && cell.trap) {
    cls.push("dv-trapped", cell.trap.by === "player" ? "dv-trap-p" : "dv-trap-o");
    if (cell.trap.kind === "siphon") cls.push("dv-trap-siphon");
  }

  const side: Side | null = litP ? "player" : litO ? "opp" : null;
  const flow = (liveDir: number): string => {
    if (!side) return "";
    const D = depths[side];
    const nx = cell.x + DX[liveDir];
    const ny = cell.y + DY[liveDir];
    if (nx < 0 || nx >= state.w || ny < 0 || ny >= state.h) return "";
    const n = ny * state.w + nx;
    const facing = (effectiveDuelArms(state.cells[n]) & (1 << oppositeDir(liveDir))) !== 0;
    if (!(state.power[side][n] && facing && isFinite(D[n]) && isFinite(D[idx]))) return "";
    return D[n] < D[idx] ? " dv-flow-in" : " dv-flow-out";
  };

  return (
    <g
      className={cls.join(" ")}
      transform={`translate(${cell.x * CS + HALF} ${cell.y * CS + HALF})`}
      onClick={() => onCell(idx)}
    >
      {/* the whole group takes the click: arms and overlays would otherwise
          swallow a hit rect underneath */}
      <rect className="dv-hit" x={-HALF} y={-HALF} width={CS} height={CS} fill="transparent" />

      {cell.kind === "block" && (
        <>
          <polygon className="dv-slagbody" points={slagPoints(idx)} />
          <path className="dv-crack" d="M -6 -4 L 4 5 M 2 -7 L -2 2" />
          <rect className="dv-legalring" x={-HALF + 5} y={-HALF + 5} width={CS - 10} height={CS - 10} />
          {legal && ghostMask !== null && (
            <g className="dv-ghost">
              <ArmSet mask={ghostMask} cls="dv-ghostarm" width={3} len={HALF - 6} />
              <rect className="dv-ghostnode" x={-4} y={-4} width={8} height={8} />
            </g>
          )}
        </>
      )}

      {cell.kind === "node" && (
        <>
          <rect className="dv-legalring" x={-HALF + 5} y={-HALF + 5} width={CS - 10} height={CS - 10} />
          <g className="dv-jit" style={{ animationDelay: `${(idx % 7) * 0.11}s` }}>
            {/* claim pop rides its own wrapper (keyed on claimSeq so a new
                claim retriggers it) and never fights the glitch jitter */}
            <g
              key={cell.claimSeq}
              className={cell.claimSeq > 0 ? "dv-popg dv-pop" : "dv-popg"}
              style={cell.claimSeq > 0 ? { animationDelay: `${cell.claimWave * 55}ms` } : undefined}
            >
              <g className="dv-arms" style={{ transform: `rotate(${cell.spin * 90}deg)` }}>
                <ArmSet mask={cell.base} cls="dv-arm" width={4} />
                <LitArms mask={cell.base} live={(d) => (d + cell.rot) % 4} flow={flow} />
              </g>
              <rect className="dv-node" x={-6} y={-6} width={12} height={12} />
              <rect className="dv-weld" x={-3} y={-3} width={6} height={6} />
            </g>
          </g>
          <g className="dv-lock">
            <path className="dv-lockb" d="M -14 -10 L -14 -15 L -9 -15 M 9 -15 L 14 -15 L 14 -10" />
            <path className="dv-lockb" d="M -14 10 L -14 15 L -9 15 M 9 15 L 14 15 L 14 10" />
            <rect className="dv-lockrect" x={-4} y={-3} width={8} height={6} />
          </g>
          <rect className="dv-ward" x={-12} y={-12} width={24} height={24} transform="rotate(45)" />
          <path
            className="dv-trap"
            d="M 0 -14 L 3 -8 L 9 -7 L 5 -2 L 6 4 L 0 1 L -6 4 L -5 -2 L -9 -7 L -3 -8 Z"
          />
          <rect className="dv-trace" x={-HALF + 9} y={-HALF + 9} width={CS - 18} height={CS - 18} />
        </>
      )}

      {(cell.kind === "entryP" || cell.kind === "entryO") && (
        <>
          <g className="dv-arms">
            <ArmSet mask={rotateArms(cell.base, cell.rot)} cls="dv-arm" width={4} />
            <LitArms mask={rotateArms(cell.base, cell.rot)} live={(d) => d} flow={flow} />
          </g>
          <rect className="dv-portbody" x={-12} y={-12} width={24} height={24} />
          <rect className="dv-porteye" x={-4} y={-4} width={8} height={8} />
          <text className={cell.kind === "entryO" ? "dv-tag dv-tag-o" : "dv-tag"} y={30} textAnchor="middle">
            {cell.kind === "entryP" ? "YOU" : machineTag}
          </text>
        </>
      )}

      {cell.kind === "core" && (
        <>
          <g className="dv-arms">
            <ArmSet mask={rotateArms(cell.base, cell.rot)} cls="dv-arm dv-arm-core" width={4} />
            <LitArms mask={rotateArms(cell.base, cell.rot)} live={(d) => d} flow={flow} />
          </g>
          <rect className="dv-corebody" x={-15} y={-15} width={30} height={30} />
          {(
            [
              ["M 0 0 L 0 -7 L 7 -7", -21, -14],
              ["M 0 0 L 7 0 L 7 7", 14, -21],
              ["M 0 0 L 0 7 L -7 7", 21, 14],
              ["M 0 0 L -7 0 L -7 -7", -14, 21],
            ] as Array<[string, number, number]>
          ).map(([d, x, y], i) => (
            <path key={i} className="dv-coreb" d={d} transform={`translate(${x} ${y})`} />
          ))}
          <rect className="dv-coreeye" x={-5} y={-5} width={10} height={10} />
          <text className="dv-tag" y={34} textAnchor="middle">
            CORE
          </text>
        </>
      )}
    </g>
  );
}

export function DuelBoard({
  state,
  legal,
  selected,
  aimed,
  traced,
  ghostMask = null,
  onCell,
  machineTag = "SIG-0",
}: DuelBoardProps) {
  const depths = useMemo<Record<Side, number[]>>(
    () => ({ player: flowDepths(state, "player"), opp: flowDepths(state, "opp") }),
    [state],
  );
  return (
    <svg
      className="dv-board"
      viewBox={`-10 -10 ${state.w * CS + 20} ${state.h * CS + 20}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label={`Duel grid, ${state.w} by ${state.h}`}
    >
      <defs>
        <pattern id="dvGrid" width={CS} height={CS} patternUnits="userSpaceOnUse">
          <rect className="dv-gridline" x={0} y={-0.5} width={CS} height={1} />
          <rect className="dv-gridline" x={-0.5} y={0} width={1} height={CS} />
          <rect className="dv-griddot" x={-3.5} y={-0.5} width={7} height={1} />
          <rect className="dv-griddot" x={-0.5} y={-3.5} width={1} height={7} />
        </pattern>
        <pattern id="dvHatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect className="dv-hatchline" x={0} y={0} width={2.4} height={6} />
        </pattern>
        <pattern id="dvCheck" width={4} height={4} patternUnits="userSpaceOnUse">
          <rect className="dv-checkdot" x={0} y={0} width={2} height={2} />
          <rect className="dv-checkdot" x={2} y={2} width={2} height={2} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={state.w * CS} height={state.h * CS} fill="url(#dvGrid)" />
      {state.cells.map((cell, idx) => (
        <CellG
          key={idx}
          state={state}
          cell={cell}
          idx={idx}
          legal={legal.has(idx)}
          picked={selected.has(idx)}
          aimed={aimed.has(idx)}
          traced={traced.has(idx)}
          ghostMask={cell.kind === "block" ? ghostMask : null}
          depths={depths}
          onCell={onCell}
          machineTag={machineTag}
        />
      ))}
    </svg>
  );
}
