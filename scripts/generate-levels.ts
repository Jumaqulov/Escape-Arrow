/**
 * Generates src/levels/levels.json - 150 levels in 3 chapters of 50, plus one
 * boss board per chapter (format v2).
 *
 * Deterministic: the same BASE_SEED always produces the same boards, so
 * regenerating never silently reshuffles a player's saved progress.
 *
 * Boards are built with a density-first packer (below) rather than
 * src/core/generator.ts. The core generator's pressure-greedy head choice
 * strands interior pockets once big boards pass ~65% occupancy - no clear ray
 * reaches them and tails cannot cross occupied cells - which is exactly the
 * ceiling the reference game's packed, winding boards live far above. The
 * packer keeps the generator's reverse-construction invariant (each new head's
 * escape ray is clear of everything already placed, so replaying placement
 * order backwards is a guaranteed solution) but picks heads most-constrained-
 * first and backtracks through long, winding tails that cross existing escape
 * rays. That produces the dense dependency web seen in the reference game.
 *
 *   npx tsx scripts/generate-levels.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Board, Cell, Chapter, Dir, LevelData, LevelPack } from '../src/core/types';
import { DIRS, DX, DY, PACK_VERSION, cellKey } from '../src/core/types';
import { generateLevel, mulberry32 } from '../src/core/generator';
import { parseLevel, serializeLevel, serializePack } from '../src/core/format';
import { analyze, validate } from '../src/core/rules';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/levels/levels.json');

const BASE_SEED = 20260819;
const PER_CHAPTER = 50;

/**
 * Tail lengths are drawn bimodally. A small short band preserves some visual
 * rhythm, while the dominant long band creates the intertwined paths that make
 * a board readable as a puzzle instead of a pile of isolated darts.
 */
interface TailMix {
  /** Chance of a shorter connector instead of a long snake. */
  shortChance: number;
  short: [number, number];
  long: [number, number];
  /** Smallest tail accepted when the requested walk cannot be completed. */
  minActual: number;
}

interface ChapterSpec {
  name: string;
  /** Grid at the first and last level of the chapter. */
  from: { w: number; h: number };
  to: { w: number; h: number };
  /** Occupancy the fill stops at, ramped across the chapter. */
  fill: { from: number; to: number };
  tails: TailMix;
}

/** Level 1 is the one deliberately tiny board, for the tap tutorial. */
const OPENER = { w: 8, h: 10, arrows: 5 };

const CHAPTERS: ChapterSpec[] = [
  {
    name: 'Chapter 1',
    from: { w: 12, h: 15 },
    to: { w: 14, h: 18 },
    fill: { from: 0.85, to: 0.94 },
    tails: { shortChance: 0.14, short: [2, 4], long: [5, 8], minActual: 2 },
  },
  {
    name: 'Chapter 2',
    from: { w: 14, h: 18 },
    to: { w: 17, h: 21 },
    fill: { from: 0.87, to: 0.955 },
    tails: { shortChance: 0.1, short: [3, 5], long: [7, 11], minActual: 3 },
  },
  {
    name: 'Chapter 3',
    from: { w: 17, h: 21 },
    to: { w: 19, h: 25 },
    fill: { from: 0.89, to: 0.96 },
    tails: { shortChance: 0.08, short: [4, 6], long: [9, 14], minActual: 4 },
  },
];

/** One oversized showpiece per chapter, gated behind BOSS_GATE stars. */
const BOSSES: Array<{ w: number; h: number; fill: number; tails: TailMix }> = [
  { w: 15, h: 19, fill: 0.95, tails: { shortChance: 0.08, short: [4, 6], long: [8, 12], minActual: 4 } },
  { w: 18, h: 22, fill: 0.95, tails: { shortChance: 0.06, short: [5, 7], long: [10, 15], minActual: 5 } },
  { w: 20, h: 26, fill: 0.95, tails: { shortChance: 0.05, short: [6, 8], long: [12, 18], minActual: 6 } },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpInt(a: number, b: number, t: number): number {
  return Math.round(lerp(a, b, t));
}

/**
 * Density-first reverse-construction fill.
 *
 * Same solvability invariant as src/core/generator.ts: a head is only placed
 * where its escape ray is clear of every cell already occupied, the neck sits
 * directly behind the head, and the tail walks EMPTY cells only, never its own
 * ray. Tapping in reverse placement order therefore always clears the board.
 *
 * Three heuristics create the difficulty:
 *  - Heads go to the cell with the FEWEST legal (direction) options first,
 *    deepest cell on ties. A deep cell that still has a clear ray is about to
 *    lose it for good; edge cells pointing outward stay placeable forever.
 *  - Tails prefer cells that lie on existing escape rays. Each crossing adds a
 *    dependency, reducing the number of arrows that are immediately tappable.
 *  - A bounded backtracking walk favours turns every few cells and refuses to
 *    collapse a requested snake into a one-cell dart at the first dead end.
 */
function packBoard(
  w: number,
  h: number,
  fill: number,
  tails: TailMix,
  rnd: () => number,
): Board {
  const board: Board = { w, h, arrows: [] };
  const occupied = new Set<number>();
  const cellBudget = Math.floor(w * h * fill);

  const inBounds = (x: number, y: number): boolean => x >= 0 && x < w && y >= 0 && y < h;

  const rayClear = (x: number, y: number, dir: Dir): boolean => {
    let cx = x + DX[dir];
    let cy = y + DY[dir];
    while (inBounds(cx, cy)) {
      if (occupied.has(cellKey(cx, cy, w))) return false;
      cx += DX[dir];
      cy += DY[dir];
    }
    return true;
  };

  const randInt = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

  const drawTail = (): number =>
    rnd() < tails.shortChance
      ? randInt(tails.short[0], tails.short[1])
      : Math.max(randInt(tails.long[0], tails.long[1]), randInt(tails.long[0], tails.long[1]));

  interface HeadCandidate {
    head: Cell;
    dir: Dir;
    rank: number;
  }

  /** How many already-placed arrows would be blocked by occupying each cell. */
  const rayPressure = (): Map<number, number> => {
    const pressure = new Map<number, number>();
    for (const arrow of board.arrows) {
      let x = arrow.head.x + DX[arrow.dir];
      let y = arrow.head.y + DY[arrow.dir];
      while (inBounds(x, y)) {
        const key = cellKey(x, y, w);
        pressure.set(key, (pressure.get(key) ?? 0) + 1);
        x += DX[arrow.dir];
        y += DY[arrow.dir];
      }
    }
    return pressure;
  };

  const occupiedNeighbours = (x: number, y: number): number => {
    let count = 0;
    for (const dir of DIRS) {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (inBounds(nx, ny) && occupied.has(cellKey(nx, ny, w))) count++;
    }
    return count;
  };

  /**
   * Find the longest useful walk towards `target`. Unlike the old greedy
   * walker this explores alternate bends when its first route is boxed in.
   */
  const growTail = (
    candidate: HeadCandidate,
    target: number,
    pressure: Map<number, number>,
  ): Cell[] => {
    const { head, dir } = candidate;
    const ownRay = new Set<number>();
    let rayX = head.x + DX[dir];
    let rayY = head.y + DY[dir];
    while (inBounds(rayX, rayY)) {
      ownRay.add(cellKey(rayX, rayY, w));
      rayX += DX[dir];
      rayY += DY[dir];
    }

    const neck: Cell = { x: head.x - DX[dir], y: head.y - DY[dir] };
    const own = new Set<number>([cellKey(head.x, head.y, w), cellKey(neck.x, neck.y, w)]);
    const tail: Cell[] = [neck];
    let best = tail.slice();
    let explored = 0;
    const searchBudget = 320;

    const blockedFor = (x: number, y: number): boolean => {
      const key = cellKey(x, y, w);
      return occupied.has(key) || own.has(key) || ownRay.has(key);
    };

    const freeExits = (x: number, y: number): number => {
      let count = 0;
      for (const nextDir of DIRS) {
        const nx = x + DX[nextDir];
        const ny = y + DY[nextDir];
        if (inBounds(nx, ny) && !blockedFor(nx, ny)) count++;
      }
      return count;
    };

    const search = (): boolean => {
      if (tail.length > best.length) best = tail.slice();
      if (tail.length >= target) return true;
      if (explored++ >= searchBudget) return false;

      const cursor = tail[tail.length - 1]!;
      const before = tail.length > 1 ? tail[tail.length - 2]! : head;
      const previousDx = cursor.x - before.x;
      const previousDy = cursor.y - before.y;

      const body = [head, ...tail];
      let runLength = 1;
      for (let i = body.length - 2; i > 0; i--) {
        const from = body[i - 1]!;
        const to = body[i]!;
        if (to.x - from.x !== previousDx || to.y - from.y !== previousDy) break;
        runLength++;
      }

      const options: Array<{ cell: Cell; key: number; score: number }> = [];
      for (const nextDir of DIRS) {
        const nx = cursor.x + DX[nextDir];
        const ny = cursor.y + DY[nextDir];
        if (!inBounds(nx, ny) || blockedFor(nx, ny)) continue;

        const key = cellKey(nx, ny, w);
        own.add(key);
        const exits = freeExits(nx, ny);
        own.delete(key);

        const isTurn = DX[nextDir] !== previousDx || DY[nextDir] !== previousDy;
        const remaining = target - tail.length - 1;
        let score = (pressure.get(key) ?? 0) * 18 + occupiedNeighbours(nx, ny) * 2;
        // Warnsdorff-style ordering consumes constrained pockets first. The
        // zero-exit case is useful only for the final cell; earlier it would
        // knowingly terminate the requested snake.
        if (remaining > 0) {
          if (exits === 0) continue;
          score += (4 - Math.min(exits, 4)) * 5;
        }
        if (isTurn) score += runLength >= 2 ? 10 : -2;
        else score += runLength === 1 ? 4 : -8;
        score += rnd() * 3;
        options.push({ cell: { x: nx, y: ny }, key, score });
      }

      options.sort((a, b) => b.score - a.score);
      for (const option of options) {
        tail.push(option.cell);
        own.add(option.key);
        if (search()) return true;
        own.delete(option.key);
        tail.pop();
      }
      return false;
    };

    return search() ? tail.slice() : best;
  };

  while (occupied.size < cellBudget) {
    const pressure = rayPressure();
    const candidates: HeadCandidate[] = [];

    // Keep most-constrained heads near the front, but let ray crossings and a
    // small seeded jitter vary the geometry from board to board.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (occupied.has(cellKey(x, y, w))) continue;
        const dirs: Dir[] = [];
        for (const dir of DIRS) {
          const nx = x - DX[dir];
          const ny = y - DY[dir];
          if (!inBounds(nx, ny) || occupied.has(cellKey(nx, ny, w))) continue;
          if (!rayClear(x, y, dir)) continue;
          dirs.push(dir);
        }
        if (dirs.length === 0) continue;
        const depth = Math.min(x, y, w - 1 - x, h - 1 - y);
        for (const dir of dirs) {
          const rank =
            dirs.length * 40 - depth * 2 - (pressure.get(cellKey(x, y, w)) ?? 0) * 12 + rnd() * 5;
          candidates.push({ head: { x, y }, dir, rank });
        }
      }
    }
    candidates.sort((a, b) => a.rank - b.rank);
    if (candidates.length === 0) break;

    const remainingBudget = cellBudget - occupied.size - 1;
    if (remainingBudget < 1) break;
    const target = Math.min(drawTail(), remainingBudget);
    const candidateLimit = Math.min(56, candidates.length);
    let chosen: { candidate: HeadCandidate; tail: Cell[] } | null = null;
    let longest: { candidate: HeadCandidate; tail: Cell[] } | null = null;

    for (let i = 0; i < candidateLimit; i++) {
      const candidate = candidates[i]!;
      const tail = growTail(candidate, target, pressure);
      if (!longest || tail.length > longest.tail.length) longest = { candidate, tail };
      if (tail.length >= target) {
        chosen = { candidate, tail };
        break;
      }
    }

    const minimum = Math.min(tails.minActual, target);
    if (!chosen && longest && longest.tail.length >= minimum) chosen = longest;

    // Near the packing ceiling, one short connector may be the only way to
    // consume a stranded pocket. Do not let that exception dominate the mix.
    if (!chosen && longest && occupied.size / (w * h) < fill - 0.035) chosen = longest;
    if (!chosen) break;

    const { head, dir } = chosen.candidate;
    board.arrows.push({ id: board.arrows.length + 1, head, dir, tail: chosen.tail });
    occupied.add(cellKey(head.x, head.y, w));
    for (const cell of chosen.tail) occupied.add(cellKey(cell.x, cell.y, w));
  }

  return board;
}

/** Stable fingerprint of a board, used to reject duplicate levels. */
function signatureOf(level: LevelData): string {
  const arrows = level.arrows
    .map((a) => `${a.x},${a.y},${a.d},${a.t}`)
    .slice()
    .sort()
    .join('/');
  return `${level.w}x${level.h}|${arrows}`;
}

const pack: LevelPack = { version: PACK_VERSION, chapters: [], boss: [] };
const seenBoards = new Set<string>();

let globalId = 1;
let rejectedDuplicates = 0;

const started = Date.now();

/** Build one board for a slot, bumping a per-level seed until it is fresh. */
function buildUnique(
  id: number,
  make: (rnd: () => number) => Board,
): LevelData {
  for (let bump = 0; bump < 40; bump++) {
    const rnd = mulberry32(BASE_SEED + id * 7919 + bump * 104729);
    const board = make(rnd);
    if (!validate(board)) continue;

    const candidate = serializeLevel(board, id);
    const signature = signatureOf(candidate);
    if (seenBoards.has(signature)) {
      rejectedDuplicates++;
      continue;
    }
    seenBoards.add(signature);
    return candidate;
  }
  throw new Error(`Could not build a fresh valid board for id ${id}`);
}

for (let c = 0; c < CHAPTERS.length; c++) {
  const spec = CHAPTERS[c]!;
  const chapter: Chapter = { name: spec.name, levels: [] };

  for (let i = 0; i < PER_CHAPTER; i++) {
    const linear = PER_CHAPTER > 1 ? i / (PER_CHAPTER - 1) : 0;
    // Front-loaded curve: the board should get busy within a couple of levels,
    // not thirty. Only level 1 is allowed to be a five-arrow tutorial.
    const t = Math.pow(linear, 0.42);
    const opener = c === 0 && i === 0;

    if (opener) {
      // The tutorial board still comes from the core generator: five arrows on
      // a sparse grid is its sweet spot, and dense packing is beside the point.
      const board = generateLevel({
        w: OPENER.w,
        h: OPENER.h,
        count: OPENER.arrows,
        seed: BASE_SEED,
        minTail: 1,
        maxTail: 3,
        minInitialFree: 1,
        attempts: 600,
        tangle: 0.9,
        walk: 'random',
      });
      if (!board || !validate(board)) throw new Error('Could not generate the tutorial opener');
      const level = serializeLevel(board, globalId);
      seenBoards.add(signatureOf(level));
      chapter.levels.push(level);
      globalId++;
      continue;
    }

    const w = lerpInt(spec.from.w, spec.to.w, t);
    const h = lerpInt(spec.from.h, spec.to.h, t);
    const fill = lerp(spec.fill.from, spec.fill.to, t);

    chapter.levels.push(buildUnique(globalId, (rnd) => packBoard(w, h, fill, spec.tails, rnd)));
    globalId++;
  }

  pack.chapters.push(chapter);
}

// Boss boards: one per chapter, noticeably bigger and denser than the finale
// they follow. Ids live in their own range so they can never collide with the
// campaign, and the seeds hang off the id like everything else.
BOSSES.forEach((spec, i) => {
  const finale = pack.chapters[i]!.levels[PER_CHAPTER - 1]!;
  if (spec.w * spec.h <= finale.w * finale.h) {
    throw new Error(`Boss ${i + 1} (${spec.w}x${spec.h}) is not bigger than its chapter finale`);
  }
  pack.boss!.push(buildUnique(1001 + i, (rnd) => packBoard(spec.w, spec.h, spec.fill, spec.tails, rnd)));
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serializePack(pack), 'utf8');

const all = pack.chapters.flatMap((ch) => ch.levels);
const stats = all.map((lvl) => analyze(parseLevel(lvl)));
const tailLengths = all.flatMap((lvl) => lvl.arrows.map((a) => a.t.length));

const avg = (nums: number[]): string =>
  (nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length)).toFixed(1);

console.log(`Wrote ${all.length} levels + ${pack.boss!.length} bosses to ${OUT}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log(`  format version:  ${PACK_VERSION}`);
console.log(`  all solvable:    ${stats.every((s) => s.solvable) ? 'yes' : 'NO'}`);
console.log(`  arrows:          ${stats[0]!.arrows} (level 1) -> ${stats[stats.length - 1]!.arrows} (level 150)`);
console.log(`  avg arrows:      ${avg(stats.map((s) => s.arrows))}`);
console.log(`  avg density:     ${avg(stats.map((s) => s.density * 100))}%`);
console.log(`  avg tail:        ${(tailLengths.reduce((a, b) => a + b, 0) / tailLengths.length).toFixed(2)}`);
console.log(`  longest tail:    ${Math.max(...tailLengths)}`);
console.log(`  avg initialFree: ${avg(stats.map((s) => s.initialFree))}`);
console.log(`  duplicates skipped: ${rejectedDuplicates}`);
pack.boss!.forEach((b, i) => {
  const a = analyze(parseLevel(b));
  console.log(
    `  boss ${i + 1}: ${b.w}x${b.h}, ${a.arrows} arrows, ` +
      `density ${(a.density * 100).toFixed(0)}%, solvable ${a.solvable ? 'yes' : 'NO'}`,
  );
});
