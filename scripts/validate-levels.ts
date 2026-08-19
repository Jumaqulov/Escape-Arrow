/**
 * Gate for src/levels/levels.json (format v2).
 *
 *   npm run validate
 *
 * Exits non-zero if any level or boss board is unsolvable, malformed,
 * duplicated, or breaks the per-chapter design budget. Prints the difficulty
 * distribution either way.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Analysis } from '../src/core/rules';
import { analyze, solve, structuralErrors } from '../src/core/rules';
import { parseLevel, parsePack } from '../src/core/format';
import type { LevelData } from '../src/core/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../src/levels/levels.json');

interface Budget {
  /** Grid bounds across the chapter, first level to last. */
  minSize: number;
  maxSize: number;
  minArrows: number;
  maxArrows: number;
  minTail: number;
  maxTail: number;
}

/**
 * Ranges, not fixed values: every level inside a chapter sits somewhere on a
 * ramp, so the gate checks the band rather than one number.
 */
const BUDGETS: Budget[] = [
  { minSize: 8, maxSize: 18, minArrows: 5, maxArrows: 80, minTail: 1, maxTail: 5 },
  { minSize: 16, maxSize: 22, minArrows: 38, maxArrows: 95, minTail: 1, maxTail: 7 },
  { minSize: 20, maxSize: 26, minArrows: 48, maxArrows: 120, minTail: 1, maxTail: 9 },
];

/**
 * Boards are deliberately packed near the construction ceiling - that crowded,
 * winding look is the game. Past this line even the generator's own solution
 * paths stop reading as arrows, so treat it as corrupt output.
 */
const MAX_DENSITY = 0.97;

function signatureOf(level: LevelData): string {
  const arrows = level.arrows
    .map((a) => `${a.x},${a.y},${a.d},${a.t}`)
    .slice()
    .sort()
    .join('/');
  return `${level.w}x${level.h}|${arrows}`;
}

const errors: string[] = [];
const pack = parsePack(readFileSync(FILE, 'utf8'));

if (pack.chapters.length !== 3) {
  errors.push(`expected 3 chapters, found ${pack.chapters.length}`);
}

const ids = new Set<number>();
const signatures = new Set<string>();
const perChapter: Analysis[][] = [];

/** Shape/solvability/duplicate checks shared by campaign and boss boards. */
function checkBoard(level: LevelData, where: string): Analysis | null {
  if (ids.has(level.id)) errors.push(`${where}: duplicate id`);
  ids.add(level.id);

  const signature = signatureOf(level);
  if (signatures.has(signature)) errors.push(`${where}: duplicate board`);
  signatures.add(signature);

  let board;
  try {
    board = parseLevel(level);
  } catch (error) {
    errors.push(`${where}: ${(error as Error).message}`);
    return null;
  }

  const shape = structuralErrors(board);
  if (shape.length > 0) {
    for (const message of shape.slice(0, 3)) errors.push(`${where}: ${message}`);
    return null;
  }

  if (!solve(board).solved) {
    errors.push(`${where}: UNSOLVABLE`);
    return null;
  }

  const a = analyze(board);
  if (a.initialFree < 1) errors.push(`${where}: no opening move`);
  if (a.density > MAX_DENSITY) {
    errors.push(`${where}: density ${(a.density * 100).toFixed(0)}% is past the readable ceiling`);
  }
  return a;
}

pack.chapters.forEach((chapter, ci) => {
  const budget = BUDGETS[ci];
  const stats: Analysis[] = [];

  if (chapter.levels.length !== 50) {
    errors.push(`${chapter.name}: expected 50 levels, found ${chapter.levels.length}`);
  }

  chapter.levels.forEach((level, li) => {
    const where = `${chapter.name} #${li + 1} (id ${level.id})`;

    const a = checkBoard(level, where);
    if (!a) return;
    stats.push(a);

    if (budget) {
      const size = Math.max(level.w, level.h);
      if (size < budget.minSize || size > budget.maxSize) {
        errors.push(`${where}: ${level.w}x${level.h} outside grid band ${budget.minSize}-${budget.maxSize}`);
      }
      if (a.arrows < budget.minArrows || a.arrows > budget.maxArrows) {
        errors.push(`${where}: ${a.arrows} arrows outside budget ${budget.minArrows}-${budget.maxArrows}`);
      }
      if (a.minTail < budget.minTail || a.maxTail > budget.maxTail) {
        errors.push(
          `${where}: tails ${a.minTail}-${a.maxTail} outside budget ${budget.minTail}-${budget.maxTail}`,
        );
      }
    }
  });

  perChapter.push(stats);
});

// Boss boards: one per chapter, index-aligned, each strictly bigger than the
// finale of the chapter it crowns.
const bosses = pack.boss ?? [];
const bossStats: Analysis[] = [];
if (bosses.length !== pack.chapters.length) {
  errors.push(`expected ${pack.chapters.length} boss boards, found ${bosses.length}`);
}
bosses.forEach((boss, bi) => {
  const where = `Boss ${bi + 1} (id ${boss.id})`;
  const a = checkBoard(boss, where);
  if (!a) return;
  bossStats.push(a);

  const chapterLevels = pack.chapters[bi]?.levels ?? [];
  const finale = chapterLevels[chapterLevels.length - 1];
  if (finale && boss.w * boss.h <= finale.w * finale.h) {
    errors.push(`${where}: ${boss.w}x${boss.h} is not bigger than its chapter finale ${finale.w}x${finale.h}`);
  }
});

function histogram(values: number[], buckets: number[]): string {
  return buckets
    .map((edge, i) => {
      const next = buckets[i + 1] ?? Number.POSITIVE_INFINITY;
      const n = values.filter((v) => v >= edge && v < next).length;
      const label = next === Number.POSITIVE_INFINITY ? `${edge}+` : `${edge}-${next - 1}`;
      return `    ${label.padStart(7)} | ${'#'.repeat(Math.min(n, 60))} ${n}`;
    })
    .join('\n');
}

const all = perChapter.flat();
const avg = (nums: number[]): string =>
  nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '-';

console.log(`Arrow Escape - level validation (format v${pack.version})`);
console.log(`  file:   ${FILE}`);
console.log(`  levels: ${all.length} + ${bossStats.length} bosses`);
console.log('');

pack.chapters.forEach((chapter, ci) => {
  const stats = perChapter[ci] ?? [];
  const arrows = stats.map((s) => s.arrows);
  console.log(
    `  ${chapter.name}: ${stats.length} levels | arrows ${Math.min(...arrows)}-${Math.max(...arrows)} ` +
      `(avg ${avg(arrows)}) | cells ${avg(stats.map((s) => s.cells))} | ` +
      `density ${avg(stats.map((s) => s.density * 100))}% | openings ${avg(stats.map((s) => s.initialFree))}`,
  );
});
bossStats.forEach((a, bi) => {
  const boss = bosses[bi]!;
  console.log(
    `  Boss ${bi + 1}: ${boss.w}x${boss.h} | ${a.arrows} arrows | ` +
      `density ${(a.density * 100).toFixed(1)}% | openings ${a.initialFree}`,
  );
});

console.log('');
console.log('  arrows per level:');
console.log(histogram(all.map((s) => s.arrows), [0, 15, 30, 45, 60, 75, 90, 105]));
console.log('');

if (errors.length > 0) {
  console.error(`FAILED - ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}

console.log(`OK - all ${all.length} levels and ${bossStats.length} bosses are solvable and within budget.`);
