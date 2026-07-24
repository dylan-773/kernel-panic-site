import { type ReactElement } from "react";

/** Tiny SVG preview of a bridge piece at a given rotation. */
export function PiecePreview({
  mask,
  rot,
  highlight = false,
}: {
  mask: number;
  rot: number;
  highlight?: boolean;
}) {
  const arms: ReactElement[] = [];
  const ends: Array<[number, number]> = [
    [0, -16],
    [16, 0],
    [0, 16],
    [-16, 0],
  ];
  for (let d = 0; d < 4; d++) {
    if ((mask & (1 << d)) === 0) continue;
    const [ex, ey] = ends[d];
    arms.push(
      <line key={d} x1={0} y1={0} x2={ex} y2={ey} strokeWidth={5} className="kp-pp-arm" />,
    );
  }
  return (
    <svg
      viewBox="-20 -20 40 40"
      className={highlight ? "kp-piece-preview kp-pp-hi" : "kp-piece-preview"}
      aria-hidden="true"
    >
      <rect x={-19} y={-19} width={38} height={38} className="kp-pp-bg" />
      <g style={{ transform: `rotate(${rot * 90}deg)` }}>{arms}</g>
      <circle r={4.5} className="kp-pp-node" />
    </svg>
  );
}
