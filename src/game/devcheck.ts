/**
 * Development-only invariants.
 *
 * Tree-shaken out of the production bundle: main.ts only calls this behind
 * `import.meta.env.DEV`, which Vite folds to `false` at build time.
 */
import { DIRS, DX, DY } from '../core/types';
import type { Dir } from '../core/types';
import { HEAD_ANGLE, arrowHeadPoints } from './ui';

export interface HeadCheck {
  dir: Dir;
  angle: number;
  /** Unit vector the drawn dart actually points along. */
  actual: { x: number; y: number };
  expected: { x: number; y: number };
  ok: boolean;
}

/**
 * Build one test arrow per direction and confirm the dart the renderer would
 * draw points exactly along that direction.
 *
 * This calls the same `arrowHeadPoints()` the renderer calls, so it fails if
 * anyone re-derives head orientation from something other than HEAD_ANGLE.
 */
export function checkArrowHeads(cell = 100): HeadCheck[] {
  return DIRS.map((dir) => {
    const dart = arrowHeadPoints(0, 0, dir, cell);

    // Normalise the tip offset back to a unit vector.
    const len = Math.hypot(dart.tip.x, dart.tip.y) || 1;
    const actual = { x: Math.round(dart.tip.x / len), y: Math.round(dart.tip.y / len) };
    const expected = { x: DX[dir], y: DY[dir] };

    // The base must straddle the shaft start, not sit off to one side.
    const midX = (dart.left.x + dart.right.x) / 2;
    const midY = (dart.left.y + dart.right.y) / 2;
    const baseCentred = Math.abs(midX) < 0.001 && Math.abs(midY) < 0.001;

    return {
      dir,
      angle: HEAD_ANGLE[dir],
      actual,
      expected,
      ok: actual.x === expected.x && actual.y === expected.y && baseCentred,
    };
  });
}

/** Run every dev invariant, logging a table when one fails. */
export function runDevChecks(): void {
  const heads = checkArrowHeads();
  const broken = heads.filter((h) => !h.ok);

  if (broken.length > 0) {
    console.error('[devcheck] arrow head rotation is wrong:', broken);
    return;
  }
  console.info(
    '[devcheck] arrow heads OK -',
    heads.map((h) => `${h.dir}=${h.angle}deg`).join(' '),
  );
}
