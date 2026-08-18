/**
 * Arrow Escape - rules engine (format v2).
 *
 * A tapped arrow escapes only if every cell between its HEAD and the board
 * edge, along the direction it points, is free of OTHER arrows. Its own tail
 * never sits on that ray (enforced by the generator and by validate), so the
 * arrow can always slide out of its own body.
 *
 * Removing an arrow can only ever empty cells, never fill them, so "free" is
 * monotone: an arrow that is free stays free no matter what else is removed
 * first. That makes a greedy sweep an EXACT solvability test rather than a
 * heuristic - tails do not change the argument.
 */
import type { Arrow, Board, Cell } from './types';
import { DIRS, DX, DY, adjacent, arrowCells, cellKey } from './types';

/** Either a full board or just its arrows (then w/h must be supplied). */
export type BoardLike = Board | Arrow[];

function arrowsOf(board: BoardLike): Arrow[] {
  return Array.isArray(board) ? board : board.arrows;
}

function widthOf(board: BoardLike, w?: number): number {
  if (typeof w === 'number') return w;
  if (!Array.isArray(board)) return board.w;
  throw new Error('rules: width is required when passing a bare arrow list');
}

function heightOf(board: BoardLike, h?: number): number {
  if (typeof h === 'number') return h;
  if (!Array.isArray(board)) return board.h;
  throw new Error('rules: height is required when passing a bare arrow list');
}

/** cellKey -> owning arrow id, for every cell any arrow covers. */
export function occupancy(arrows: Arrow[], w: number): Map<number, number> {
  const map = new Map<number, number>();
  for (const a of arrows) {
    for (const c of arrowCells(a)) map.set(cellKey(c.x, c.y, w), a.id);
  }
  return map;
}

/** Cells the head travels through on its way out (excluding the head cell). */
export function pathCells(arrow: Arrow, w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  const dx = DX[arrow.dir];
  const dy = DY[arrow.dir];
  let x = arrow.head.x + dx;
  let y = arrow.head.y + dy;
  while (x >= 0 && x < w && y >= 0 && y < h) {
    cells.push({ x, y });
    x += dx;
    y += dy;
  }
  return cells;
}

/**
 * Can this arrow fly off the board right now?
 * Accepts either `isFree(arrow, board)` or `isFree(arrow, board, w, h)`.
 */
export function isFree(arrow: Arrow, board: BoardLike, w?: number, h?: number): boolean {
  const width = widthOf(board, w);
  const height = heightOf(board, h);
  const occ = occupancy(arrowsOf(board), width);

  for (const c of pathCells(arrow, width, height)) {
    const owner = occ.get(cellKey(c.x, c.y, width));
    if (owner !== undefined && owner !== arrow.id) return false;
  }
  return true;
}

/** Every arrow that can be tapped right now. */
export function freeArrows(board: BoardLike, w?: number, h?: number): Arrow[] {
  const arrows = arrowsOf(board);
  const width = widthOf(board, w);
  const height = heightOf(board, h);
  const occ = occupancy(arrows, width);

  return arrows.filter((a) =>
    pathCells(a, width, height).every((c) => {
      const owner = occ.get(cellKey(c.x, c.y, width));
      return owner === undefined || owner === a.id;
    }),
  );
}

/** Which arrow covers this cell, if any? */
export function arrowAt(board: BoardLike, x: number, y: number, w?: number): Arrow | undefined {
  const arrows = arrowsOf(board);
  const width = widthOf(board, w);
  const owner = occupancy(arrows, width).get(cellKey(x, y, width));
  return owner === undefined ? undefined : arrows.find((a) => a.id === owner);
}

/**
 * The first arrow blocking `arrow`, or undefined when it is free.
 * Used by the hint system to explain *why* a tap did nothing.
 */
export function blockerOf(arrow: Arrow, board: BoardLike, w?: number, h?: number): Arrow | undefined {
  const arrows = arrowsOf(board);
  const width = widthOf(board, w);
  const height = heightOf(board, h);
  const occ = occupancy(arrows, width);

  for (const c of pathCells(arrow, width, height)) {
    const owner = occ.get(cellKey(c.x, c.y, width));
    if (owner !== undefined && owner !== arrow.id) {
      return arrows.find((a) => a.id === owner);
    }
  }
  return undefined;
}

/** Result of a full greedy sweep. */
export interface SolveResult {
  solved: boolean;
  /** Arrow ids in the order they were removed. */
  order: number[];
  /** How many arrows were tappable before each removal. */
  branching: number[];
  /** Arrows still stuck on the board when the sweep dead-ended. */
  remaining: Arrow[];
}

/**
 * Greedy monotone solver. Because freedom is monotone, ANY order of tapping
 * free arrows clears exactly the same set, so a single greedy pass decides
 * solvability with no search and no backtracking.
 */
export function solve(board: BoardLike, w?: number, h?: number): SolveResult {
  const width = widthOf(board, w);
  const height = heightOf(board, h);
  let live = arrowsOf(board).slice();

  const order: number[] = [];
  const branching: number[] = [];

  for (;;) {
    const free = freeArrows(live, width, height);
    if (free.length === 0) break;
    branching.push(free.length);
    const picked = free[0]!;
    order.push(picked.id);
    live = live.filter((a) => a.id !== picked.id);
  }

  return { solved: live.length === 0, order, branching, remaining: live };
}

/** Difficulty band derived from the numeric score. */
export type DifficultyBand = 'easy' | 'medium' | 'hard' | 'brutal';

export interface Analysis {
  solvable: boolean;
  arrows: number;
  /** Number of taps required (equals `arrows` for a solvable level). */
  steps: number;
  /** Tappable arrows on the untouched board - the main difficulty signal. */
  initialFree: number;
  minFree: number;
  maxFree: number;
  avgFree: number;
  /** Free-arrow count before each tap. */
  branching: number[];
  /** Total cells covered by arrow bodies. */
  cells: number;
  /** Shortest and longest tail on the board. */
  minTail: number;
  maxTail: number;
  /** Fraction of cells occupied. */
  density: number;
  /** Roughly 0..100, higher is harder. */
  difficulty: number;
  band: DifficultyBand;
  order: number[];
}

/** Measure a board / level without mutating it. */
export function analyze(board: BoardLike, w?: number, h?: number): Analysis {
  const width = widthOf(board, w);
  const height = heightOf(board, h);
  const arrows = arrowsOf(board);

  const result = solve(arrows, width, height);
  const branching = result.branching;
  const initialFree = branching.length > 0 ? branching[0]! : 0;
  const minFree = branching.length > 0 ? Math.min(...branching) : 0;
  const maxFree = branching.length > 0 ? Math.max(...branching) : 0;
  const avgFree =
    branching.length > 0 ? branching.reduce((a, b) => a + b, 0) / branching.length : 0;

  const cells = arrows.reduce((sum, a) => sum + 1 + a.tail.length, 0);
  const tails = arrows.map((a) => a.tail.length);
  const density = cells / Math.max(1, width * height);

  // Hard levels are the ones where, at almost every step, only one or two of
  // the remaining arrows can actually be tapped.
  const tightness = avgFree > 0 ? 1 / avgFree : 0;
  const raw = arrows.length * 4 * tightness + (arrows.length - initialFree) * 3 + density * 20;
  const difficulty = Math.max(0, Math.min(100, Math.round(raw)));

  let band: DifficultyBand = 'easy';
  if (difficulty >= 70) band = 'brutal';
  else if (difficulty >= 50) band = 'hard';
  else if (difficulty >= 30) band = 'medium';

  return {
    solvable: result.solved,
    arrows: arrows.length,
    steps: result.order.length,
    initialFree,
    minFree,
    maxFree,
    avgFree,
    branching,
    cells,
    minTail: tails.length > 0 ? Math.min(...tails) : 0,
    maxTail: tails.length > 0 ? Math.max(...tails) : 0,
    density,
    difficulty,
    band,
    order: result.order,
  };
}

/**
 * Everything wrong with the SHAPE of this board, ignoring solvability.
 * Returned as messages so the validate script can print something useful.
 */
export function structuralErrors(board: BoardLike, w?: number, h?: number): string[] {
  const arrows = arrowsOf(board);
  const width = widthOf(board, w);
  const height = heightOf(board, h);
  const errors: string[] = [];

  if (arrows.length === 0) errors.push('board has no arrows');

  const taken = new Map<number, number>();

  for (const a of arrows) {
    if (!DIRS.includes(a.dir)) {
      errors.push(`arrow ${a.id}: bad direction ${String(a.dir)}`);
      continue;
    }

    const body = arrowCells(a);
    const own = new Set<number>();

    for (let i = 0; i < body.length; i++) {
      const c = body[i]!;
      if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) {
        errors.push(`arrow ${a.id}: non-integer cell ${c.x},${c.y}`);
        continue;
      }
      if (c.x < 0 || c.x >= width || c.y < 0 || c.y >= height) {
        errors.push(`arrow ${a.id}: cell ${c.x},${c.y} outside ${width}x${height}`);
        continue;
      }
      const key = cellKey(c.x, c.y, width);
      if (own.has(key)) errors.push(`arrow ${a.id}: self-crossing at ${c.x},${c.y}`);
      own.add(key);

      const other = taken.get(key);
      if (other !== undefined && other !== a.id) {
        errors.push(`arrow ${a.id}: overlaps arrow ${other} at ${c.x},${c.y}`);
      }
      taken.set(key, a.id);

      if (i > 0 && !adjacent(body[i - 1]!, c)) {
        errors.push(`arrow ${a.id}: tail breaks between cells at ${c.x},${c.y}`);
      }
    }

    // The head must be able to leave without passing through its own body.
    for (const c of pathCells(a, width, height)) {
      if (own.has(cellKey(c.x, c.y, width))) {
        errors.push(`arrow ${a.id}: tail sits on its own escape ray at ${c.x},${c.y}`);
        break;
      }
    }

    // Neck rule: the first tail cell is always directly behind the head, so
    // the dart always grows straight out of its own shaft.
    const neck = a.tail[0];
    if (!neck) {
      errors.push(`arrow ${a.id}: has no tail, so no neck`);
    } else if (neck.x !== a.head.x - DX[a.dir] || neck.y !== a.head.y - DY[a.dir]) {
      errors.push(
        `arrow ${a.id}: neck at ${neck.x},${neck.y} is not directly behind the ${a.dir} head at ${a.head.x},${a.head.y}`,
      );
    }
  }

  return errors;
}

/** Is this board well formed AND fully clearable? */
export function validate(board: BoardLike, w?: number, h?: number): boolean {
  if (structuralErrors(board, w, h).length > 0) return false;
  return solve(board, w, h).solved;
}

/** Remove an arrow by id, returning a new board (pure). */
export function removeArrow(board: Board, id: number): Board {
  return { w: board.w, h: board.h, arrows: board.arrows.filter((a) => a.id !== id) };
}

/** Deep copy of a board. */
export function cloneBoard(board: Board): Board {
  return {
    w: board.w,
    h: board.h,
    arrows: board.arrows.map((a) => ({
      id: a.id,
      dir: a.dir,
      head: { ...a.head },
      tail: a.tail.map((c) => ({ ...c })),
    })),
  };
}
