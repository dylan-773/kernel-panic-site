import { memo, type ReactElement } from "react";
import { DuelCell, DuelState } from "../../game/duel-types";
import { rotateArms } from "../../game/types";

const CS = 48;
const HALF = CS / 2;

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

interface DuelCellViewProps {
  cell: DuelCell;
  idx: number;
  round: number;
  poweredP: boolean;
  poweredO: boolean;
  legal: boolean;
  selected: boolean;
  aimed: boolean;
  trapVisible: boolean;
  onCell: (idx: number) => void;
}

const DuelCellView = memo(function DuelCellView({
  cell,
  idx,
  round,
  poweredP,
  poweredO,
  legal,
  selected,
  aimed,
  trapVisible,
  onCell,
}: DuelCellViewProps) {
  const cx = cell.x * CS + HALF;
  const cy = cell.y * CS + HALF;
  const mine = cell.owner === "player";
  const theirs = cell.owner === "opp";
  const lit = mine ? poweredP : theirs ? poweredO : false;
  const locked = cell.lockedThroughRound >= round;

  const classes = ["kp-dcell"];
  if (cell.kind === "node") {
    if (mine) classes.push("kp-dcell-p");
    else if (theirs) classes.push("kp-dcell-o");
    else classes.push("kp-dcell-n");
    if (lit) classes.push("kp-dlit");
  }
  if (legal) classes.push("kp-dlegal", "kp-dlive");
  if (selected) classes.push("kp-dselected");

  const armClass = mine ? "kp-darm-p" : theirs ? "kp-darm-o" : "kp-darm-n";
  const label =
    cell.kind === "entryP"
      ? "Your port"
      : cell.kind === "entryO"
        ? "Intrusion port"
        : cell.kind === "core"
          ? "Core"
          : cell.kind === "block"
            ? "Dead sector"
            : mine
              ? "Your junction"
              : theirs
                ? "Intrusion junction"
                : "Open junction";

  return (
    <g
      className={classes.join(" ")}
      transform={`translate(${cx} ${cy})`}
      onClick={legal ? () => onCell(idx) : undefined}
      onKeyDown={
        legal
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCell(idx);
              }
            }
          : undefined
      }
      role={legal ? "button" : undefined}
      tabIndex={legal ? 0 : undefined}
      aria-label={legal ? `${label}, select` : label}
    >
      <rect x={-HALF} y={-HALF} width={CS} height={CS} fill="transparent" />

      {aimed && (
        <g className="kp-daim" aria-hidden="true">
          <path d="M -18 -10 L -18 -18 L -10 -18 M 10 -18 L 18 -18 L 18 -10" className="kp-daim-b" />
          <path d="M -18 10 L -18 18 L -10 18 M 10 18 L 18 18 L 18 10" className="kp-daim-b" />
        </g>
      )}

      {cell.kind === "block" && (
        <g className="kp-dblock">
          <polygon points="-14,-8 -4,-15 9,-12 15,-2 10,10 -2,14 -13,7" className="kp-dblock-body" />
          <path d="M -6 -4 L 4 5 M 2 -7 L -2 2" className="kp-dblock-crack" />
        </g>
      )}

      {cell.kind === "node" && (
        <g key={`cl-${cell.claimSeq}`} className={cell.claimSeq > 0 ? "kp-claimpop" : undefined}
          style={cell.claimSeq > 0 ? { animationDelay: `${cell.claimWave * 55}ms` } : undefined}
        >
          {legal && <rect x={-HALF + 4} y={-HALF + 4} width={CS - 8} height={CS - 8} className="kp-dlegal-ring" />}
          <g className="kp-darms" style={{ transform: `rotate(${cell.spin * 90}deg)` }}>
            {armLines(cell.base, armClass, 6)}
            {lit && armLines(cell.base, `${armClass}-glow`, 12)}
            {lit && armLines(cell.base, `${armClass}-lit`, 3)}
          </g>
          <circle
            className={
              mine ? "kp-dnode kp-dnode-p" : theirs ? "kp-dnode kp-dnode-o" : "kp-dnode kp-dnode-n"
            }
            r={mine || theirs ? 6.5 : 5}
          />
          {locked && (
            <g className="kp-dshield">
              <path d="M -13 -9 L -13 -14 L -8 -14 M 8 -14 L 13 -14 L 13 -9" className="kp-dshield-b" />
              <path d="M -13 9 L -13 14 L -8 14 M 8 14 L 13 14 L 13 9" className="kp-dshield-b" />
              <rect x={-4} y={-3} width={8} height={6} className="kp-dshield-lock" />
            </g>
          )}
          {cell.trap && trapVisible && (
            <g className={cell.trap.by === "player" ? "kp-dtrap kp-dtrap-p" : "kp-dtrap kp-dtrap-o"}>
              <path
                d="M 0 -14 L 3 -8 L 9 -7 L 5 -2 L 6 4 L 0 1 L -6 4 L -5 -2 L -9 -7 L -3 -8 Z"
                className="kp-dtrap-body"
              />
            </g>
          )}
        </g>
      )}

      {cell.kind === "entryP" && (
        <g className="kp-dport kp-dport-p">
          <g>{armLines(rotateArms(cell.base, cell.rot), "kp-darm-p-lit", 5)}</g>
          <rect x={-11} y={-11} width={22} height={22} className="kp-dport-body" />
          <circle r={4.5} className="kp-dport-eye" />
          <text className="kp-dtag" y={22}>
            YOU
          </text>
        </g>
      )}

      {cell.kind === "entryO" && (
        <g className="kp-dport kp-dport-o">
          <g>{armLines(rotateArms(cell.base, cell.rot), "kp-darm-o-lit", 5)}</g>
          <rect x={-11} y={-11} width={22} height={22} className="kp-dport-body" />
          <circle r={4.5} className="kp-dport-eye" />
          <text className="kp-dtag kp-dtag-o" y={22}>
            SIG-0
          </text>
        </g>
      )}

      {cell.kind === "core" && (
        <g className={poweredP || poweredO ? "kp-dcore kp-dcore-lit" : "kp-dcore"}>
          <g>{armLines(cell.base, "kp-darm-core", 5)}</g>
          <polygon
            points="14,0 9.9,9.9 0,14 -9.9,9.9 -14,0 -9.9,-9.9 0,-14 9.9,-9.9"
            className="kp-dcore-body"
          />
          <circle r={5} className="kp-dcore-eye" />
          <circle r={19} className="kp-dcore-ring" />
          <text className="kp-dtag" y={29}>
            CORE
          </text>
        </g>
      )}
    </g>
  );
});

export interface DuelBoardProps {
  state: DuelState;
  legal: Set<number>;
  selected: Set<number>;
  /** Cells the machine has locked onto this beat (telegraphed move). */
  aimed: Set<number>;
  onCell: (idx: number) => void;
}

export function DuelBoard({ state, legal, selected, aimed, onCell }: DuelBoardProps) {
  const { w, h, cells } = state;
  const vw = w * CS;
  const vh = h * CS;

  return (
    <svg
      className={`kp-dboard kp-dphase-${state.phase}`}
      viewBox={`-8 -8 ${vw + 16} ${vh + 16}`}
      role="application"
      aria-label={`Duel grid, ${w} by ${h}`}
    >
      <defs>
        <pattern id="kpDDots" width={CS} height={CS} patternUnits="userSpaceOnUse">
          <circle cx={HALF} cy={HALF} r={1.2} className="kp-dot" />
        </pattern>
      </defs>

      <rect x={-6} y={-6} width={vw + 12} height={vh + 12} className="kp-dboard-bg" />
      <rect x={0} y={0} width={vw} height={vh} fill="url(#kpDDots)" />
      <rect x={-6} y={-6} width={vw + 12} height={vh + 12} className="kp-dboard-frame" />

      {cells.map((cell, idx) => {
        const trapVisible =
          !!cell.trap &&
          (cell.trap.by === "player" || cell.trap.revealed || state.phase !== "playing");
        return (
          <DuelCellView
            key={idx}
            cell={cell}
            idx={idx}
            round={state.round}
            poweredP={state.power.player[idx] ?? false}
            poweredO={state.power.opp[idx] ?? false}
            legal={legal.has(idx)}
            selected={selected.has(idx)}
            aimed={aimed.has(idx)}
            trapVisible={trapVisible}
            onCell={onCell}
          />
        );
      })}
    </svg>
  );
}
