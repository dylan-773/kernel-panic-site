import { memo, type ReactElement } from "react";
import { DivePhase } from "../../game/dive-reducer";
import { Board, Cell, PowerResult } from "../../game/types";

const CS = 64;
const HALF = CS / 2;

interface BoardViewProps {
  board: Board;
  power: PowerResult;
  phase: DivePhase;
  t: number;
  pingActive: boolean;
  advClaimed: number;
  onCell: (idx: number) => void;
}

/** Arm line endpoints for each direction (local cell coordinates). */
const ARM_ENDS: Array<[number, number]> = [
  [0, -HALF],
  [HALF, 0],
  [0, HALF],
  [-HALF, 0],
];

function armLines(mask: number, className: string, width: number): ReactElement[] {
  const out: ReactElement[] = [];
  for (let d = 0; d < 4; d++) {
    if ((mask & (1 << d)) === 0) continue;
    const [ex, ey] = ARM_ENDS[d];
    out.push(
      <line
        key={`${className}-${d}`}
        x1={0}
        y1={0}
        x2={ex}
        y2={ey}
        className={className}
        strokeWidth={width}
      />,
    );
  }
  return out;
}

interface CellViewProps {
  cell: Cell;
  idx: number;
  powered: boolean;
  feeds: number;
  satisfied: boolean;
  interactive: boolean;
  locked: boolean;
  pingActive: boolean;
  onCell: (idx: number) => void;
}

const CellView = memo(function CellView({
  cell,
  idx,
  powered,
  feeds,
  satisfied,
  interactive,
  locked,
  pingActive,
  onCell,
}: CellViewProps) {
  const cx = cell.x * CS + HALF;
  const cy = cell.y * CS + HALF;
  const lit = powered && (cell.kind !== "and" || satisfied);
  const fed = cell.kind === "and" && !satisfied && feeds > 0;

  const classes = ["kp-cell"];
  if (interactive) classes.push("kp-cell-live");
  if (lit) classes.push("kp-lit");
  if (locked) classes.push("kp-locked");
  if (cell.seared) classes.push("kp-seared");

  const label =
    cell.kind === "source"
      ? "Intake port"
      : cell.kind === "advsource"
        ? "Intruder port"
        : cell.kind === "core"
          ? "Core node"
          : cell.kind === "and"
            ? "Dual gate junction"
            : cell.kind === "loot"
              ? "Salvage cache"
              : cell.kind === "frag"
                ? "Data fragment"
                : cell.kind === "corrupt"
                  ? "Corrupt sector"
                  : cell.jam > 0
                    ? "Jammed junction"
                    : "Junction";

  return (
    <g
      className={classes.join(" ")}
      transform={`translate(${cx} ${cy})`}
      onClick={() => onCell(idx)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCell(idx);
        }
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${label}, rotate` : label}
    >
      {/* Hit area */}
      <rect x={-HALF} y={-HALF} width={CS} height={CS} fill="transparent" />

      {/* Rotating arm group */}
      <g className="kp-arms" style={{ transform: `rotate(${cell.spin * 90}deg)` }}>
        {armLines(cell.base, "kp-arm", 6)}
        {lit && armLines(cell.base, "kp-arm-glow", 11)}
        {lit && armLines(cell.base, "kp-arm-lit", 3.4)}
        {lit && armLines(cell.base, "kp-arm-flow", 2)}
      </g>

      {/* Node piece */}
      {cell.kind === "normal" && cell.bug === 0 && (
        <circle className="kp-node" r={7.5} />
      )}

      {cell.kind === "normal" && cell.bug > 0 && (
        <>
          {cell.patched ? (
            <g key="patched" className="kp-bug-patched">
              <circle r={10} className="kp-bug-fill" />
              <path d="M -4.5 0.5 L -1.5 3.5 L 5 -3" className="kp-bug-check" />
            </g>
          ) : (
            <circle className="kp-node" r={7.5} />
          )}
          {pingActive && !cell.patched && (
            <g key="ping" className="kp-ping-badge">
              <circle r={13} className="kp-ping-ring" />
              <circle r={17.5} className="kp-ping-ring kp-ping-ring-outer" />
              <g transform="translate(13.5 -13.5)">
                <circle r={8.5} className="kp-ping-num-bg" />
                <text className="kp-ping-num" dy={3.4}>
                  {cell.bug}
                </text>
              </g>
            </g>
          )}
        </>
      )}

      {cell.kind === "source" && (
        <g className="kp-source">
          <rect x={-12} y={-12} width={24} height={24} rx={4} className="kp-port" />
          <circle r={5} className="kp-port-eye" />
          <circle r={12} className="kp-port-pulse" />
          <text className="kp-cell-tag" y={24}>
            IN
          </text>
        </g>
      )}

      {cell.kind === "advsource" && (
        <g className="kp-advsource">
          <rect x={-12} y={-12} width={24} height={24} rx={4} className="kp-port kp-port-adv" />
          <circle r={5} className="kp-port-eye kp-port-eye-adv" />
          <text className="kp-cell-tag kp-cell-tag-adv" y={24}>
            INTRUDER
          </text>
        </g>
      )}

      {cell.kind === "core" && (
        <g className={lit ? "kp-core kp-core-lit" : "kp-core"}>
          <polygon
            points="15,0 10.6,10.6 0,15 -10.6,10.6 -15,0 -10.6,-10.6 0,-15 10.6,-10.6"
            className="kp-core-body"
          />
          <circle r={5.5} className="kp-core-eye" />
          <circle r={20} className="kp-core-ring" />
          <text className="kp-cell-tag" y={30}>
            CORE
          </text>
        </g>
      )}

      {cell.kind === "and" && (
        <g className={satisfied ? "kp-and kp-and-open" : fed ? "kp-and kp-and-fed" : "kp-and"}>
          <rect
            x={-10.5}
            y={-10.5}
            width={21}
            height={21}
            transform="rotate(45)"
            className="kp-and-body"
          />
          <text className="kp-and-num" dy={3.6}>
            2
          </text>
        </g>
      )}

      {cell.kind === "loot" && (
        <g className={cell.looted ? "kp-loot kp-loot-open" : "kp-loot"}>
          <rect x={-9} y={-9} width={18} height={18} rx={3} className="kp-loot-body" />
          <circle r={3} className="kp-loot-eye" />
        </g>
      )}

      {cell.kind === "frag" && (
        <g
          className={
            cell.lost ? "kp-frag kp-frag-lost" : cell.recovered ? "kp-frag kp-frag-got" : "kp-frag"
          }
        >
          <polygon points="0,-11 9.5,-5.5 9.5,5.5 0,11 -9.5,5.5 -9.5,-5.5" className="kp-frag-body" />
          {cell.lost ? (
            <path d="M -5 -5 L 5 5 M 5 -5 L -5 5" className="kp-frag-x" />
          ) : (
            <circle r={3} className="kp-frag-eye" />
          )}
        </g>
      )}

      {cell.kind === "corrupt" && (
        <g key={cell.spent ? "spent" : "armed"} className={cell.spent ? "kp-corrupt kp-corrupt-spent" : "kp-corrupt"}>
          <polygon
            points="0,-13 3.5,-3.5 13,0 3.5,3.5 0,13 -3.5,3.5 -13,0 -3.5,-3.5"
            className="kp-corrupt-body"
          />
          <circle r={2.6} className="kp-corrupt-eye" />
        </g>
      )}

      {cell.jam > 0 && (
        <g key={`jam-${cell.jam}`} className="kp-jam">
          <path d="M -13 -9 L -13 -14 L -8 -14 M 8 -14 L 13 -14 L 13 -9" className="kp-jam-bracket" />
          <path d="M -13 9 L -13 14 L -8 14 M 8 14 L 13 14 L 13 9" className="kp-jam-bracket" />
          <g className="kp-jam-pips">
            {Array.from({ length: cell.jam }).map((_, i) => (
              <circle key={i} cx={(i - (cell.jam - 1) / 2) * 8} cy={0} r={2.6} className="kp-jam-pip" />
            ))}
          </g>
        </g>
      )}

      {locked && (
        <g className="kp-lock">
          <circle r={14} className="kp-lock-ring" />
          <rect x={-5} y={-3} width={10} height={8} rx={1.5} className="kp-lock-body" />
          <path d="M -3 -3 V -6 A 3 3 0 0 1 3 -6 V -3" className="kp-lock-shackle" />
        </g>
      )}
    </g>
  );
});

export function BoardView({
  board,
  power,
  phase,
  t,
  pingActive,
  advClaimed,
  onCell,
}: BoardViewProps) {
  const { w, h, cells } = board;
  const vw = w * CS;
  const vh = h * CS;

  const advPoints: Array<[number, number]> = board.advPath
    .slice(0, Math.max(1, advClaimed))
    .map((i) => [cells[i].x * CS + HALF, cells[i].y * CS + HALF]);
  const advHead = advPoints[advPoints.length - 1];

  return (
    <svg
      className={`kp-board kp-board-${board.type} kp-phase-${phase}`}
      viewBox={`-10 -10 ${vw + 20} ${vh + 20}`}
      role="application"
      aria-label={`${board.type} dive board, ${w} by ${h} junction grid`}
    >
      <defs>
        <pattern id="kpDots" width={CS} height={CS} patternUnits="userSpaceOnUse">
          <circle cx={HALF} cy={HALF} r={1.4} className="kp-dot" />
        </pattern>
      </defs>

      <rect x={-6} y={-6} width={vw + 12} height={vh + 12} rx={10} className="kp-board-bg" />
      <rect x={0} y={0} width={vw} height={vh} fill="url(#kpDots)" />
      <rect x={-6} y={-6} width={vw + 12} height={vh + 12} rx={10} className="kp-board-frame" />

      {/* Cells */}
      {cells.map((cell, idx) => (
        <CellView
          key={idx}
          cell={cell}
          idx={idx}
          powered={power.powered[idx] ?? false}
          feeds={power.andFeeds.get(idx) ?? 0}
          satisfied={power.satisfiedAnds.has(idx)}
          interactive={
            phase === "run" &&
            !cell.fixed &&
            cell.kind !== "source" &&
            cell.kind !== "advsource"
          }
          locked={cell.lockedUntil > t}
          pingActive={pingActive}
          onCell={onCell}
        />
      ))}

      {/* Adversary trace, over arms */}
      {board.type === "network" && advPoints.length >= 2 && (
        <g className="kp-adv-layer">
          <polyline
            points={advPoints.map(([x, y]) => `${x},${y}`).join(" ")}
            className="kp-adv-trace-glow"
          />
          <polyline
            points={advPoints.map(([x, y]) => `${x},${y}`).join(" ")}
            className="kp-adv-trace"
          />
          {advHead && phase === "run" && (
            <circle cx={advHead[0]} cy={advHead[1]} r={6} className="kp-adv-head" />
          )}
        </g>
      )}
    </svg>
  );
}
