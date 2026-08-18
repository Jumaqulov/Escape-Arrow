/**
 * Generates src/levels/levels.json - 150 levels in 3 chapters of 50 (format v2).
 *
 * Deterministic: the same BASE_SEED always produces the same 150 levels, so
 * regenerating never silently reshuffles a player's saved progress.
 *
 * The ramp is deliberately steep. A sparse board with six arrows is solved on
 * sight, which is exactly why players bounce; the interesting puzzle only
 * starts once the board is crowded enough that you have to hunt for the one
 * arrow whose lane is clear.
 *
 *   npx tsx scripts/generate-levels.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Chapter, LevelData, LevelPack } from '../src/core/types';
import { PACK_VERSION } from '../src/core/types';
import { generateLevel } from '../src/core/generator';
import { parseLevel, serializeLevel, serializePack } from '../src/core/format';
import { analyze, validate } from '../src/core/rules';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/levels/levels.json');

const BASE_SEED = 20260818;
const PER_CHAPTER = 50;

interface ChapterSpec {
  name: string;
  /** Grid at the first and last level of the chapter. */
  from: { w: number; h: number; arrows: number };
  to: { w: number; h: number; arrows: number };
  minTail: number;
  maxTail: number;
  /** Warnsdorff pays off once the board is big and crowded. */
  walk: 'random' | 'open';
}

/** Level 1 is the one deliberately tiny board, for the tap tutorial. */
const OPENER = { w: 8, h: 10, arrows: 5 };

const CHAPTERS: ChapterSpec[] = [
  {
    name: 'Chapter 1',
    from: { w: 10, h: 13, arrows: 30 },
    to: { w: 12, h: 15, arrows: 48 },
    minTail: 1,
    maxTail: 3,
    walk: 'random',
  },
  {
    name: 'Chapter 2',
    from: { w: 12, h: 15, arrows: 48 },
    to: { w: 14, h: 18, arrows: 62 },
    minTail: 1,
    maxTail: 3,
    walk: 'random',
  },
  {
    name: 'Chapter 3',
    from: { w: 14, h: 18, arrows: 62 },
    to: { w: 17, h: 22, arrows: 90 },
    minTail: 1,
    maxTail: 3,
    walk: 'random',
  },
];

function lerpInt(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
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

const pack: LevelPack = { version: PACK_VERSION, chapters: [] };
const seenBoards = new Set<string>();

let globalId = 1;
let seedCursor = BASE_SEED;
let rejectedDuplicates = 0;
let shortfall = 0;

const started = Date.now();

for (let c = 0; c < CHAPTERS.length; c++) {
  const spec = CHAPTERS[c]!;
  const chapter: Chapter = { name: spec.name, levels: [] };

  for (let i = 0; i < PER_CHAPTER; i++) {
    const linear = PER_CHAPTER > 1 ? i / (PER_CHAPTER - 1) : 0;
    // Front-loaded curve: the board should get busy within a couple of levels,
    // not thirty. Only level 1 is allowed to be a five-arrow tutorial.
    const t = Math.pow(linear, 0.45);
    const opener = c === 0 && i === 0;

    const w = opener ? OPENER.w : lerpInt(spec.from.w, spec.to.w, t);
    const h = opener ? OPENER.h : lerpInt(spec.from.h, spec.to.h, t);
    const wanted = opener ? OPENER.arrows : lerpInt(spec.from.arrows, spec.to.arrows, t);

    let level: LevelData | null = null;
    let best: LevelData | null = null;
    let bestCount = 0;

    // The builder stops when the board genuinely runs out of legal placements,
    // so accept the densest board it managed rather than looping forever.
    for (let attempt = 0; attempt < 26 && !level; attempt++) {
      seedCursor += 7919;
      const board = generateLevel({
        w,
        h,
        // Fill the grid to the rule set's ceiling - except the tutorial board,
        // which stays deliberately tiny.
        count: opener ? OPENER.arrows : 999,
        // A board that runs out of legal placements early is still a good
        // board - take it rather than looping forever chasing an exact count.
        minCount: wanted,
        seed: seedCursor,
        minTail: spec.minTail,
        maxTail: spec.maxTail,
        minInitialFree: 1,
        attempts: 2,
        tangle: 0.9,
        walk: spec.walk,
      });
      if (!board || !validate(board)) continue;

      const candidate = serializeLevel(board, globalId);
      const signature = signatureOf(candidate);
      if (seenBoards.has(signature)) {
        rejectedDuplicates++;
        continue;
      }

      if (board.arrows.length >= wanted) {
        seenBoards.add(signature);
        level = candidate;
      } else if (board.arrows.length > bestCount) {
        bestCount = board.arrows.length;
        best = candidate;
      }
    }

    if (!level && best) {
      seenBoards.add(signatureOf(best));
      level = best;
      shortfall++;
    }

    if (!level) {
      throw new Error(`Could not generate ${spec.name} level ${i + 1} (${w}x${h}, ${wanted} arrows)`);
    }

    chapter.levels.push(level);
    globalId++;
  }

  pack.chapters.push(chapter);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serializePack(pack), 'utf8');

const all = pack.chapters.flatMap((ch) => ch.levels);
const stats = all.map((lvl) => analyze(parseLevel(lvl)));

const avg = (nums: number[]): string =>
  (nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length)).toFixed(1);

console.log(`Wrote ${all.length} levels to ${OUT}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log(`  format version:  ${PACK_VERSION}`);
console.log(`  all solvable:    ${stats.every((s) => s.solvable) ? 'yes' : 'NO'}`);
console.log(`  arrows:          ${stats[0]!.arrows} (level 1) -> ${stats[stats.length - 1]!.arrows} (level 150)`);
console.log(`  avg arrows:      ${avg(stats.map((s) => s.arrows))}`);
console.log(`  avg density:     ${avg(stats.map((s) => s.density * 100))}%`);
console.log(`  avg initialFree: ${avg(stats.map((s) => s.initialFree))}`);
console.log(`  duplicates skipped: ${rejectedDuplicates}`);
console.log(`  levels below target count: ${shortfall}`);
