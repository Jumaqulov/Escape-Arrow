/**
 * Arrow Escape - level generator, format v2.
 *
 * Built in REVERSE. Start from an empty board and add arrows one at a time:
 *
 *   1. Place a HEAD whose escape ray is clear of every cell already occupied.
 *   2. Give it a straight NECK: the first tail cell is always head - dir, so
 *      the dart always reads as pointing along the shaft it grows out of.
 *   3. Grow the rest of the TAIL from the neck by a random walk through EMPTY
 *      cells only, never touching the head's own ray.
 *
 * The arrows already on the board are exactly the ones that will still be
 * there when the new arrow is tapped, so replaying the placement order
 * backwards is a guaranteed solution. The tail is free to lie across an
 * EARLIER arrow's ray: that arrow is tapped later, by which time this one is
 * long gone. That is precisely what turns a pile of arrows into a dependency
 * chain. No search, no unsolvable output - `validate()` is only a safety net.
 */
import type { Board, Cell, Dir } from './types';
import { DIRS, DX, DY, cellKey } from './types';
import { analyze, validate } from './rules';

/** Deterministic 32-bit PRNG. Same seed in, same level out, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  /** Grid width in cells. */
  w: number;
  /** Grid height in cells. */
  h: number;
  /** How many arrows to aim for. */
  count: number;
  /** Fewest arrows worth keeping. Defaults to  (exact). */
  minCount?: number;
  /** PRNG seed - the whole level is a pure function of this. */
  seed: number;
  /** Shortest tail, in cells behind the head. */
  minTail: number;
  /** Longest tail, in cells behind the head. */
  maxTail: number;
  /** Reject boards where more than this many arrows are tappable at the start. */
  maxInitialFree?: number;
  /** Reject boards that open with fewer than this many options (default 1). */
  minInitialFree?: number;
  /** How many boards to try before giving up. */
  attempts?: number;
  /** 0..1 - how strongly to prefer placements that block existing arrows. */
  tangle?: number;
  /**
   * Tail walk strategy. "open" is Warnsdorff's rule - always step into the
   * cell that keeps the most exits free. It reaches far higher densities on
   * big boards; on small ones plain randomness packs better.
   */
  walk?: 'random' | 'open';
}

interface HeadCandidate {
  x: number;
  y: number;
  dir: Dir;
  score: number;
}

/** Cells a head at (x,y) would travel through on its way out. */
function rayFrom(x: number, y: number, dir: Dir, w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  let cx = x + DX[dir];
  let cy = y + DY[dir];
  while (cx >= 0 && cx < w && cy >= 0 && cy < h) {
    cells.push({ x: cx, y: cy });
    cx += DX[dir];
    cy += DY[dir];
  }
  return cells;
}

/** How many already-placed arrows have their escape ray crossing each cell. */
function rayPressure(board: Board): Map<number, number> {
  const map = new Map<number, number>();
  for (const a of board.arrows) {
    for (const c of rayFrom(a.head.x, a.head.y, a.dir, board.w, board.h)) {
      const key = cellKey(c.x, c.y, board.w);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

/** Pick from `items`, preferring the highest scoring ones `tangle` of the time. */
function choose<T extends { score: number }>(items: T[], rnd: () => number, tangle: number): T {
  if (rnd() < tangle) {
    let best = -Infinity;
    for (const item of items) if (item.score > best) best = item.score;
    const top = items.filter((item) => item.score === best);
    return top[Math.floor(rnd() * top.length)]!;
  }
  return items[Math.floor(rnd() * items.length)]!;
}

function buildOnce(opts: GenerateOptions, rnd: () => number): Board | null {
  const { w, h, count, minTail, maxTail } = opts;
  const tangle = opts.tangle ?? 0.85;
  const walk = opts.walk ?? 'random';

  const board: Board = { w, h, arrows: [] };
  const occupied = new Set<number>();

  for (let placed = 0; placed < count; placed++) {
    const pressure = rayPressure(board);

    // ---- 1. the head ----------------------------------------------------
    const heads: HeadCandidate[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (occupied.has(cellKey(x, y, w))) continue;
        for (const dir of DIRS) {
          const ray = rayFrom(x, y, dir, w, h);
          if (ray.some((c) => occupied.has(cellKey(c.x, c.y, w)))) continue;
          // The neck sits directly behind the head, so a head with no room
          // behind it is not a candidate at all.
          const nx = x - DX[dir];
          const ny = y - DY[dir];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (occupied.has(cellKey(nx, ny, w))) continue;
          heads.push({ x, y, dir, score: pressure.get(cellKey(x, y, w)) ?? 0 });
        }
      }
    }
    // Out of legal placements: the board is as full as this rule set allows.
    if (heads.length === 0) break;

    const head = choose(heads, rnd, tangle);
    const ownRay = new Set(rayFrom(head.x, head.y, head.dir, w, h).map((c) => cellKey(c.x, c.y, w)));
    const own = new Set<number>([cellKey(head.x, head.y, w)]);

    // ---- 2. the neck ----------------------------------------------------
    const target = minTail + Math.floor(rnd() * (maxTail - minTail + 1));
    const tail: Cell[] = [];

    const neck: Cell = { x: head.x - DX[head.dir], y: head.y - DY[head.dir] };
    tail.push(neck);
    own.add(cellKey(neck.x, neck.y, w));
    let cursor: Cell = neck;

    // ---- 3. the rest of the tail ----------------------------------------
    const freeAround = (c: Cell): number => {
      let n = 0;
      for (const dir of DIRS) {
        const nx = c.x + DX[dir];
        const ny = c.y + DY[dir];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const key = cellKey(nx, ny, w);
        if (!occupied.has(key) && !own.has(key) && !ownRay.has(key)) n++;
      }
      return n;
    };

    for (let step = 1; step < target; step++) {
      const options: Array<Cell & { score: number }> = [];
      for (const dir of DIRS) {
        const nx = cursor.x + DX[dir];
        const ny = cursor.y + DY[dir];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const key = cellKey(nx, ny, w);
        // EMPTY cells only, never our own body, never our own escape ray.
        if (occupied.has(key) || own.has(key) || ownRay.has(key)) continue;
        // Warnsdorff: score by how many exits the step leaves open, so the
        // walk does not paint itself into a corner on a crowded board.
        options.push({
          x: nx,
          y: ny,
          score: walk === 'open' ? freeAround({ x: nx, y: ny }) : (pressure.get(key) ?? 0),
        });
      }
      // Boxed in. Keep whatever we have rather than throwing the board away -
      // this single change roughly doubles the density the builder can reach.
      if (options.length === 0) break;

      const next = choose(options, rnd, walk === 'open' ? 1 : tangle);
      const cell: Cell = { x: next.x, y: next.y };
      tail.push(cell);
      own.add(cellKey(cell.x, cell.y, w));
      cursor = cell;
    }

    // A stub shorter than the floor is not worth keeping.
    if (tail.length < minTail) return null;

    board.arrows.push({
      id: placed + 1,
      head: { x: head.x, y: head.y },
      dir: head.dir,
      tail,
    });
    for (const key of own) occupied.add(key);
  }

  return board;
}

/**
 * Generate one solvable level, or null if the constraints could not be met
 * within `attempts` tries. Deterministic for a given seed.
 */
export function generateLevel(opts: GenerateOptions): Board | null {
  const attempts = opts.attempts ?? 600;
  const maxInitialFree = opts.maxInitialFree ?? Number.POSITIVE_INFINITY;
  const minInitialFree = opts.minInitialFree ?? 1;

  // The neck rule means every arrow is at least a head plus one cell.
  if (opts.minTail < 1) return null;
  if ((opts.minCount ?? opts.count) * (1 + opts.minTail) > opts.w * opts.h) return null;

  const rnd = mulberry32(opts.seed);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const board = buildOnce(opts, rnd);
    if (!board) continue;
    if (board.arrows.length < (opts.minCount ?? opts.count)) continue;

    const stats = analyze(board);
    if (!stats.solvable) continue;
    if (stats.initialFree > maxInitialFree) continue;
    if (stats.initialFree < minInitialFree) continue;
    if (stats.minTail < opts.minTail || stats.maxTail > opts.maxTail) continue;
    if (!validate(board)) continue;

    return board;
  }

  return null;
}

/** Convenience: keep bumping the seed until a level comes out. */
export function generateLevelOrThrow(opts: GenerateOptions, seedTries = 80): Board {
  for (let i = 0; i < seedTries; i++) {
    const board = generateLevel({ ...opts, seed: opts.seed + i * 7919 });
    if (board) return board;
  }
  throw new Error(
    `generateLevel: no ${opts.w}x${opts.h} level with ${opts.count} arrows ` +
      `(tail ${opts.minTail}-${opts.maxTail}) after ${seedTries} seeds`,
  );
}
