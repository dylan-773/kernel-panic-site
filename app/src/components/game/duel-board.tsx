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

export interface GhostPiece {
  mask: number;
  rot: number;
}

interface DuelCellViewProps {
  cell: DuelCell;
  idx: number;
  round: number;
  poweredP: boolean;
  poweredO: boolean;
  legal: boolean;
  selected: boolean;
  trapVisible: boolean;
  ghost: GhostPiece | null;
  interactive: boolean;
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
  trapVisible,
  ghost,
  interactive,
  onCell,
}: DuelCellViewProps) {
  const cx = cell.x * CS + HALF;
  const cy = cell.y * CS + HALF;
  const mine = cell.owner === "player";
  const lit = mine ? poweredP : poweredO;
  const shielded = cell.shieldedThroughRound >= round;

  const classes = ["kp-dcell"];
  if (cell.kind === "node") classes.push(mine ? "kp-dcell-p" : "kp-dcell-o");
  if (lit && cell.kind === "node") classes.push("kp-dlit");
  if (legal) classes.push("kp-dlegal");
  if (selected) classes.push("kp-dselected");
  if (interactive) classes.push("kp-dlive");

  const label =
    cell.kind === "entryP"
      ? "Your port"
      : cell.kind === "entryO"
        ? "Intrusion port"
        : cell.kind === "core"
          ? "Core"
          : cell.kind === "block"
            ? "Dead sector"
            : cell.kind === "node"
              ? mine
                ? "Your node"
                : "Intrusion node"
              : "Open sector";

  const armClass = mine ? "kp-darm-p" : "kp-darm-o";

  return (
    <g
      className={classes.join(" ")}
      transform={`translate(${cx} ${cy})`}
      onClick={interactive ? () => onCell(idx) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCell(idx);
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${label}, select` : label}
    >
      <rect x={-HALF} y={-HALF} width={CS} height={CS} fill="transparent" />

      {cell.kind === "empty" && (
        <>
          <circle r={1.6} className="kp-ddot" />
          {legal && <rect x={-HALF + 5} y={-HALF + 5} width={CS - 10} height={CS - 10} className="kp-dlegal-ring" />}
          {legal && ghost && (
            <g className="kp-dghost" style={{ transform: `rotate(${ghost.rot * 90}deg)` }}>
              {armLines(ghost.mask, "kp-dghost-arm", 5)}
              <circle r={5.5} className="kp-dghost-node" />
            </g>
          )}
        </>
      )}

      {cell.kind === "block" && (
        <g className="kp-dblock">
          <polygon points="-14,-8 -4,-15 9,-12 15,-2 10,10 -2,14 -13,7" className="kp-dblock-body" />
          <path d="M -6 -4 L 4 5 M 2 -7 L -2 2" className="kp-dblock-crack" />
        </g>
      )}

      {cell.kind === "node" && (
        <>
          <g className="kp-darms" style={{ transform: `rotate(${cell.spin * 90}deg)` }}>
            {armLines(cell.base, armClass, 6)}
            {lit && armLines(cell.base, `${armClass}-glow`, 11)}
            {lit && armLines(cell.base, `${armClass}-lit`, 3)}
          </g>
          <circle className={mine ? "kp-dnode kp-dnode-p" : "kp-dnode kp-dnode-o"} r={6.5} />
          {shielded && (
            <g className="kp-dshield">
              <path d="M -12 -8 L -12 -13 L -7 -13 M 7 -13 L 12 -13 L 12 -8" className="kp-dshield-b" />
              <path d="M -12 8 L -12 13 L -7 13 M 7 13 L 12 13 L 12 8" className="kp-dshield-b" />
            </g>
          )}
          {cell.trap && trapVisible && (
            <g className={cell.trap.by === "player" ? "kp-dtrap kp-dtrap-p" : "kp-dtrap kp-dtrap-o"}>
              <path d="M 0 -14 L 3 -8 L 9 -7 L 5 -2 L 6 4 L 0 1 L -6 4 L -5 -2 L -9 -7 L -3 -8 Z" className="kp-dtrap-body" />
            </g>
          )}
        </>
      )}

      {cell.kind === "entryP" && (
        <g className="kp-dport kp-dport-p">
          <g className="kp-darms">{armLines(rotateArms(cell.base, cell.rot), "kp-darm-p", 6)}</g>
          <rect x={-11} y={-11} width={22} height={22} className="kp-dport-body" />
          <circle r={4.5} className="kp-dport-eye" />
          <text className="kp-dtag" y={22}>
            YOU
          </text>
        </g>
      )}

      {cell.kind === "entryO" && (
        <g className="kp-dport kp-dport-o">
          <g className="kp-darms">{armLines(rotateArms(cell.base, cell.rot), "kp-darm-o", 6)}</g>
          <rect x={-11} y={-11} width={22} height={22} className="kp-dport-body" />
          <circle r={4.5} className="kp-dport-eye" />
          <text className="kp-dtag kp-dtag-o" y={22}>
            SIG-0
          </text>
        </g>
      )}

      {cell.kind === "core" && (
        <g className={poweredP || poweredO ? "kp-dcore kp-dcore-lit" : "kp-dcore"}>
          <g className="kp-darms">{armLines(cell.base, "kp-darm-core", 5)}</g>
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
  /** Cells the current interaction may click. */
  legal: Set<number>;
  /** Cells already picked in a multi-target ability. */
  selected: Set<number>;
  ghost: GhostPiece | null;
  onCell: (idx: number) => void;
}

export function DuelBoard({ state, legal, selected, ghost, onCell }: DuelBoardProps) {
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
        // Traps: yours on their grid always show; theirs on yours only when
        // revealed by Scan (or if the duel is over).
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
            trapVisible={trapVisible}
            ghost={ghost}
            interactive={legal.has(idx)}
            onCell={onCell}
          />
        );
      })}
    </svg>
  );
}
