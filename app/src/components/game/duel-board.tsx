import { useMemo } from "react";
import { effectiveDuelArms } from "../../game/duel-power";
import { Board, DuelCell, Side, isJunction } from "../../game/duel-types";
import { DX, DY, oppositeDir, rotateArms } from "../../game/types";

/**
 * ONE board as a circuit schematic: arms are crisp traces, hubs are pixel
 * squares, the entry is a component box, the goal column is a hatched block
 * with corner brackets that flare when signal touches it, slag is
 * checker-dithered debris, and powered arms carry marching-dash current
 * DIRECTED entry-to-frontier (a per-render BFS assigns every lit arm in/out
 * flow, so current visibly runs entry-to-frontier along a built line).
 *
 * The component renders whichever board the viewport is on; `side` says whose
 * it is, and drives the two-tone ownership palette. It never sees the other.
 *
 * NEVER `transform-box: fill-box` on the arm groups: CSS transforms on SVG
 * elements pivot on the local origin (the hub, after the parent translate),
 * which the pre-scrambled spin depends on. fill-box pivots on the arm set's
 * own bounding box, off-hub for I/L/T junctions, and the grid disconnects.
 */

const CS = 52;
const HALF = CS / 2;

export interface DuelBoardProps {
  /** The board on screen right now. */
  board: Board;
  /** Whose board it is: drives the palette, not the geometry. */
  side: Side;
  round: number;
  ended: boolean;
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
function flowDepths(b: Board): number[] {
  const D: number[] = new Array(b.cells.length).fill(Infinity);
  D[b.entry] = 0;
  const q = [b.entry];
  while (q.length > 0) {
    const i = q.shift()!;
    const c = b.cells[i];
    const arms = effectiveDuelArms(c);
    for (let d = 0; d < 4; d++) {
      if ((arms & (1 << d)) === 0) continue;
      const nx = c.x + DX[d];
      const ny = c.y + DY[d];
      if (nx < 0 || nx >= b.w || ny < 0 || ny >= b.h) continue;
      const n = ny * b.w + nx;
      if (!b.power[n] || isFinite(D[n])) continue;
      if ((effectiveDuelArms(b.cells[n]) & (1 << oppositeDir(d))) === 0) continue;
      D[n] = D[i] + 1;
      q.push(n);
    }
  }
  return D;
}

function CellG({
  board,
  side,
  round,
  ended,
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
  board: Board;
  side: Side;
  round: number;
  ended: boolean;
  cell: DuelCell;
  idx: number;
  legal: boolean;
  picked: boolean;
  aimed: boolean;
  traced: boolean;
  ghostMask: number | null;
  depths: number[];
  onCell: (idx: number) => void;
  machineTag: string;
}) {
  const mine = side === "player";
  const lit = board.power[idx] ?? false;
  const locked = cell.lockedThroughRound >= round;
  const warded = cell.wardThroughRound >= round;
  // Traps on this board were planted by the other side. The player sees their
  // own (planted on the machine's grid) always, and the machine's only once
  // Scan has exposed them.
  const trapVisible = !!cell.trap && (!mine || cell.trap.revealed || ended);

  const cls = ["dv-cell", `dv-k-${cell.kind}`, mine ? "dv-b-p" : "dv-b-o"];
  if (isJunction(cell)) {
    // BUILT is the ownership channel now: ground you have lit reads as yours
    // whether or not it is currently carrying.
    if (cell.built) cls.push(mine ? "dv-own-p" : "dv-own-o");
    else cls.push("dv-own-n");
  }
  if (cell.kind === "entry") cls.push(mine ? "dv-own-p" : "dv-own-o");
  if (lit) cls.push(mine ? "dv-lit-p" : "dv-lit-o");
  // Built but dark: the enemy cut this. The one state the old model could
  // not express, and the one the player most needs to see.
  if (isJunction(cell) && cell.built && !lit) cls.push("dv-cut");
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

  const flow = (liveDir: number): string => {
    if (!lit) return "";
    const D = depths;
    const nx = cell.x + DX[liveDir];
    const ny = cell.y + DY[liveDir];
    if (nx < 0 || nx >= board.w || ny < 0 || ny >= board.h) return "";
    const n = ny * board.w + nx;
    const facing = (effectiveDuelArms(board.cells[n]) & (1 << oppositeDir(liveDir))) !== 0;
    if (!(board.power[n] && facing && isFinite(D[n]) && isFinite(D[idx]))) return "";
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

      {isJunction(cell) && (
        <>
          <rect className="dv-legalring" x={-HALF + 5} y={-HALF + 5} width={CS - 10} height={CS - 10} />
          <g className="dv-jit" style={{ animationDelay: `${(idx % 7) * 0.11}s` }}>
            {/* first-light pop rides its own wrapper and never fights the
                glitch jitter. Keyed on `built` so it fires once, on the light
                that built the node, and not again on every repair. */}
            <g
              key={cell.built ? 1 : 0}
              className={cell.built ? "dv-popg dv-pop" : "dv-popg"}
              style={cell.built ? { animationDelay: `${cell.litWave * 55}ms` } : undefined}
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

      {cell.kind === "entry" && (
        <>
          <g className="dv-arms">
            <ArmSet mask={rotateArms(cell.base, cell.rot)} cls="dv-arm" width={4} />
            <LitArms mask={rotateArms(cell.base, cell.rot)} live={(d) => d} flow={flow} />
          </g>
          <rect className="dv-portbody" x={-12} y={-12} width={24} height={24} />
          <rect className="dv-porteye" x={-4} y={-4} width={8} height={8} />
          <text className={mine ? "dv-tag" : "dv-tag dv-tag-o"} y={30} textAnchor="middle">
            {mine ? "YOU" : machineTag}
          </text>
        </>
      )}

      {cell.kind === "goal" && (
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
          <text className={mine ? "dv-tag" : "dv-tag dv-tag-o"} y={34} textAnchor="middle">
            GOAL
          </text>
        </>
      )}
    </g>
  );
}

export function DuelBoard({
  board,
  side,
  round,
  ended,
  legal,
  selected,
  aimed,
  traced,
  ghostMask = null,
  onCell,
  machineTag = "SIG-0",
}: DuelBoardProps) {
  const depths = useMemo(() => flowDepths(board), [board]);
  return (
    <svg
      className={`dv-board ${side === "player" ? "dv-board-p" : "dv-board-o"}`}
      viewBox={`-10 -10 ${board.w * CS + 20} ${board.h * CS + 20}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label={`${side === "player" ? "Your" : "The intrusion's"} grid, ${board.w} by ${board.h}`}
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
      <rect x={0} y={0} width={board.w * CS} height={board.h * CS} fill="url(#dvGrid)" />
      {board.cells.map((cell, idx) => (
        <CellG
          key={idx}
          board={board}
          side={side}
          round={round}
          ended={ended}
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
