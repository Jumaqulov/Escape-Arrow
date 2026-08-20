export interface PathPoint {
  x: number;
  y: number;
}

/** Point `distance` along a polyline, extrapolating straight past its end. */
export function samplePath(
  points: readonly PathPoint[],
  cumulative: readonly number[],
  distance: number,
  exitDx: number,
  exitDy: number,
): PathPoint {
  const first = points[0]!;
  if (distance <= 0) return first;

  const total = cumulative[cumulative.length - 1]!;
  if (distance >= total) {
    const last = points[points.length - 1]!;
    const over = distance - total;
    return { x: last.x + exitDx * over, y: last.y + exitDy * over };
  }

  for (let i = 1; i < cumulative.length; i++) {
    if (distance <= cumulative[i]!) {
      const span = cumulative[i]! - cumulative[i - 1]!;
      const t = span === 0 ? 0 : (distance - cumulative[i - 1]!) / span;
      const a = points[i - 1]!;
      const b = points[i]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }

  return points[points.length - 1]!;
}

/**
 * The stretch of a polyline between two arc lengths.
 *
 * Both ends are interpolated and every crossed vertex is retained, so a
 * moving arrow bends around corners instead of cutting a chord across them.
 */
export function pathSlice(
  points: readonly PathPoint[],
  cumulative: readonly number[],
  from: number,
  to: number,
  exitDx: number,
  exitDy: number,
): PathPoint[] {
  const out = [samplePath(points, cumulative, from, exitDx, exitDy)];
  for (let i = 0; i < cumulative.length; i++) {
    const at = cumulative[i]!;
    if (at > from && at < to) out.push(points[i]!);
  }
  out.push(samplePath(points, cumulative, to, exitDx, exitDy));
  return out;
}
