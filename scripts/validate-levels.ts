/**
 * Gate for src/levels/levels.json (format v2).
 *
 *   npm run validate
 *
 * Exits non-zero if any level is unsolvable, malformed, duplicated, or breaks
 * the per-chapter design budget. Prints the difficulty distribution either way.
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
  { minSize: 8, maxSize: 16, minArrows: 5, maxArrows: 60, minTail: 1, maxTail: 3 },
  { minSize: 12, maxSize: 19, minArrows: 40, maxArrows: 78, minTail: 1, maxTail: 3 },
  { minSize: 14, maxSize: 23, minArrows: 55, maxArrows: 108, minTail: 1, maxTail: 3 },
];

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

pack.chapters.forEach((chapter, ci) => {
  const budget = BUDGETS[ci];
  const stats: Analysis[] = [];

  if (chapter.levels.length !== 50) {
    errors.push(`${chapter.name}: expected 50 levels, found ${chapter.levels.length}`);
  }

  chapter.levels.forEach((level, li) => {
    const where = `${chapter.name} #${li + 1} (id ${level.id})`;

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
      return;
    }

    const shape = structuralErrors(board);
    if (shape.length > 0) {
      for (const message of shape.slice(0, 3)) errors.push(`${where}: ${message}`);
      return;
    }

    if (!solve(board).solved) {
      errors.push(`${where}: UNSOLVABLE`);
      return;
    }

    const a = analyze(board);
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
      if (a.initialFree < 1) {
        errors.push(`${where}: no opening move`);
      }
      if (a.density > 0.9) {
        errors.push(`${where}: density ${(a.density * 100).toFixed(0)}% leaves no room to read the board`);
      }
    }
  });

  perChapter.push(stats);
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
console.log(`  levels: ${all.length}`);
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

console.log('');
console.log('  arrows per level:');
console.log(histogram(all.map((s) => s.arrows), [0, 10, 25, 40, 55, 70, 85, 100]));
console.log('');

if (errors.length > 0) {
  console.error(`FAILED - ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}

console.log(`OK - all ${all.length} levels are solvable and within budget.`);
