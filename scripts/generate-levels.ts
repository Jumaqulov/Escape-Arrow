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
 * first and walks tails dead-end-first, which reaches 93-96% occupancy.
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
 * Tail lengths are drawn bimodally: mostly-short darts keep the arrow count
 * high, while max-of-two draws from the long range guarantee genuinely long
 * snakes on every board. One arrow covers 1 + tail cells, so at a fixed grid
 * size the average tail length and the arrow count trade off directly -
 * this mix is how the boards get BOTH.
 */
interface TailMix {
  /** Chance of a short dart instead of a long snake. */
  shortChance: number;
  short: [number, number];
  long: [number, number];
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
    tails: { shortChance: 0.4, short: [1, 2], long: [3, 5] },
  },
  {
    name: 'Chapter 2',
    from: { w: 14, h: 18 },
    to: { w: 17, h: 21 },
    fill: { from: 0.87, to: 0.955 },
    tails: { shortChance: 0.37, short: [1, 2], long: [4, 7] },
  },
  {
    name: 'Chapter 3',
    from: { w: 17, h: 21 },
    to: { w: 19, h: 25 },
    fill: { from: 0.89, to: 0.96 },
    tails: { shortChance: 0.37, short: [1, 2], long: [5, 9] },
  },
];

/** One oversized showpiece per chapter, gated behind BOSS_GATE stars. */
const BOSSES: Array<{ w: number; h: number; fill: number; tails: TailMix }> = [
  { w: 15, h: 19, fill: 0.96, tails: { shortChance: 0.5, short: [1, 2], long: [3, 6] } },
  { w: 18, h: 22, fill: 0.96, tails: { shortChance: 0.55, short: [1, 2], long: [4, 8] } },
  { w: 20, h: 26, fill: 0.96, tails: { shortChance: 0.58, short: [1, 2], long: [5, 10] } },
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
 * Two heuristics buy the extra ~30 points of density:
 *  - Heads go to the cell with the FEWEST legal (direction) options first,
 *    deepest cell on ties. A deep cell that still has a clear ray is about to
 *    lose it for good; edge cells pointing outward stay placeable forever.
 *  - Tail steps prefer the neighbour with the fewest free exits, so walks
 *    consume dead-end pockets that would otherwise be stranded as holes.
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

  while (occupied.size < cellBudget) {
    // Most-constrained cell first, reservoir-sampled across ties so the same
    // spec still yields distinct boards from distinct seeds.
    let best: { x: number; y: number; dirs: Dir[] } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let ties = 0;
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
        const score = dirs.length * 100 - depth;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y, dirs };
          ties = 1;
        } else if (score === bestScore) {
          ties++;
          if (rnd() * ties < 1) best = { x, y, dirs };
        }
      }
    }
    // No empty cell has a legal head any more: the true ceiling of this board.
    if (!best) break;

    const dir = best.dirs[Math.floor(rnd() * best.dirs.length)]!;
    const head: Cell = { x: best.x, y: best.y };
    const own = new Set<number>([cellKey(head.x, head.y, w)]);
    const ownRay = new Set<number>();
    {
      let cx = head.x + DX[dir];
      let cy = head.y + DY[dir];
      while (inBounds(cx, cy)) {
        ownRay.add(cellKey(cx, cy, w));
        cx += DX[dir];
        cy += DY[dir];
      }
    }

    const blockedFor = (x: number, y: number): boolean => {
      const key = cellKey(x, y, w);
      return occupied.has(key) || own.has(key) || ownRay.has(key);
    };

    const freeExits = (x: number, y: number): number => {
      let n = 0;
      for (const d of DIRS) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (inBounds(nx, ny) && !blockedFor(nx, ny)) n++;
      }
      return n;
    };

    // Neck first, then grow. A walk boxed in early just yields a short dart -
    // never a rejected board.
    const target = drawTail();
    const tail: Cell[] = [{ x: head.x - DX[dir], y: head.y - DY[dir] }];
    own.add(cellKey(tail[0]!.x, tail[0]!.y, w));
    let cursor = tail[0]!;

    for (let step = 1; step < target; step++) {
      let next: Cell | null = null;
      let fewest = Number.POSITIVE_INFINITY;
      let optionTies = 0;
      for (const d of DIRS) {
        const nx = cursor.x + DX[d];
        const ny = cursor.y + DY[d];
        if (!inBounds(nx, ny) || blockedFor(nx, ny)) continue;
        const exits = freeExits(nx, ny);
        if (exits < fewest) {
          fewest = exits;
          next = { x: nx, y: ny };
          optionTies = 1;
        } else if (exits === fewest) {
          optionTies++;
          if (rnd() * optionTies < 1) next = { x: nx, y: ny };
        }
      }
      if (!next) break;
      tail.push(next);
      own.add(cellKey(next.x, next.y, w));
      cursor = next;
    }

    board.arrows.push({ id: board.arrows.length + 1, head, dir, tail });
    for (const key of own) occupied.add(key);
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
