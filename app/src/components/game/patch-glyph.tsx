import { type ReactElement } from "react";

/**
 * Shared arm-line renderer for junction shapes. The board draws cells with
 * it at half-size 24; the pouch draws piece glyphs with it at glyph scale.
 * Direction indexes match types.ts: 0 N, 1 E, 2 S, 3 W.
 */
export function armLines(
  mask: number,
  className: string,
  width: number,
  half = 24,
): ReactElement[] {
  const ends: Array<[number, number]> = [
    [0, -half],
    [half, 0],
    [0, half],
    [-half, 0],
  ];
  const out: ReactElement[] = [];
  for (let d = 0; d < 4; d++) {
    if ((mask & (1 << d)) === 0) continue;
    const [ex, ey] = ends[d];
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

/**
 * A patch piece as a mini junction: hub plus its exact arms. This IS the
 * pouch pip; a piece's arms are its identity, so the UI never shows a
 * count where it can show the shape.
 */
export function PatchGlyph({
  mask,
  size = 22,
  dim = false,
}: {
  mask: number;
  size?: number;
  dim?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      className={`kp-patch-glyph${dim ? " kp-patch-glyph-dim" : ""}`}
      aria-hidden="true"
    >
      {armLines(mask, "kp-pp-arm", 3.5, 10)}
      <circle cx={0} cy={0} r={3} className="kp-pp-node" />
    </svg>
  );
}
