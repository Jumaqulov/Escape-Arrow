/**
 * Generates src/levels/levels.json - 150 levels in 3 chapters of 50 (format v2).
 *
 * Deterministic: the same BASE_SEED always produces the same 150 levels, so
 * regenerating never silently reshuffles a player's saved progress.
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
  size: number;
  minArrows: number;
  maxArrows: number;
  /** Tail length in cells behind each head. */
  minTail: number;
  maxTail: number;
  /** Hard ceiling on how many arrows may be tappable on the fresh board. */
  maxInitialFree: number;
}

const CHAPTERS: ChapterSpec[] = [
  { name: 'Chapter 1', size: 6, minArrows: 4, maxArrows: 5, minTail: 1, maxTail: 2, maxInitialFree: 3 },
  { name: 'Chapter 2', size: 7, minArrows: 5, maxArrows: 7, minTail: 2, maxTail: 4, maxInitialFree: 3 },
  { name: 'Chapter 3', size: 8, minArrows: 6, maxArrows: 8, minTail: 3, maxTail: 5, maxInitialFree: 4 },
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

for (let c = 0; c < CHAPTERS.length; c++) {
  const spec = CHAPTERS[c]!;
  const chapter: Chapter = { name: spec.name, levels: [] };

  for (let i = 0; i < PER_CHAPTER; i++) {
    const t = PER_CHAPTER > 1 ? i / (PER_CHAPTER - 1) : 0;
    const count = lerpInt(spec.minArrows, spec.maxArrows, t);
    // Ramp the opening choice down: later levels give the player fewer
    // obviously-tappable arrows, which is what actually makes them think.
    const targetFree = Math.max(1, lerpInt(spec.maxInitialFree, 1, t));

    let level: LevelData | null = null;

    // Relaxation ladder: tighten first, loosen only if the seed space is dry.
    outer: for (let relax = 0; relax + targetFree <= spec.maxInitialFree + 1; relax++) {
      const cap = Math.min(spec.maxInitialFree, targetFree + relax);
      for (let attempt = 0; attempt < 220; attempt++) {
        seedCursor += 7919;
        const board = generateLevel({
          w: spec.size,
          h: spec.size,
          count,
          seed: seedCursor,
          minTail: spec.minTail,
          maxTail: spec.maxTail,
          maxInitialFree: cap,
          minInitialFree: 1,
          attempts: 40,
          tangle: 0.9,
        });
        if (!board) continue;
        // Retry on failure, exactly as required: never emit an invalid level.
        if (!validate(board)) continue;

        const candidate = serializeLevel(board, globalId);
        const signature = signatureOf(candidate);
        if (seenBoards.has(signature)) {
          rejectedDuplicates++;
          continue;
        }
        seenBoards.add(signature);
        level = candidate;
        break outer;
      }
    }

    if (!level) {
      throw new Error(
        `Could not generate ${spec.name} level ${i + 1} (${spec.size}x${spec.size}, ${count} arrows, tail ${spec.minTail}-${spec.maxTail})`,
      );
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
  (nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length)).toFixed(2);

console.log(`Wrote ${all.length} levels to ${OUT}`);
console.log(`  format version:  ${PACK_VERSION}`);
console.log(`  chapters:        ${pack.chapters.map((c) => `${c.name} (${c.levels.length})`).join(', ')}`);
console.log(`  all solvable:    ${stats.every((s) => s.solvable) ? 'yes' : 'NO'}`);
console.log(`  avg difficulty:  ${avg(stats.map((s) => s.difficulty))}`);
console.log(`  avg initialFree: ${avg(stats.map((s) => s.initialFree))}`);
console.log(`  avg cells used:  ${avg(stats.map((s) => s.cells))}`);
console.log(`  duplicates skipped: ${rejectedDuplicates}`);
