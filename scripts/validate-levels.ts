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
  size: number;
  minArrows: number;
  maxArrows: number;
  minTail: number;
  maxTail: number;
  maxInitialFree: number;
}

const BUDGETS: Budget[] = [
  { size: 6, minArrows: 4, maxArrows: 5, minTail: 1, maxTail: 2, maxInitialFree: 3 },
  { size: 7, minArrows: 5, maxArrows: 7, minTail: 2, maxTail: 4, maxInitialFree: 3 },
  { size: 8, minArrows: 6, maxArrows: 8, minTail: 3, maxTail: 5, maxInitialFree: 4 },
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
      if (level.w !== budget.size || level.h !== budget.size) {
        errors.push(`${where}: expected ${budget.size}x${budget.size}, got ${level.w}x${level.h}`);
      }
      if (a.arrows < budget.minArrows || a.arrows > budget.maxArrows) {
        errors.push(
          `${where}: ${a.arrows} arrows outside budget ${budget.minArrows}-${budget.maxArrows}`,
        );
      }
      if (a.minTail < budget.minTail || a.maxTail > budget.maxTail) {
        errors.push(
          `${where}: tails ${a.minTail}-${a.maxTail} outside budget ${budget.minTail}-${budget.maxTail}`,
        );
      }
      if (a.initialFree > budget.maxInitialFree) {
        errors.push(`${where}: initialFree ${a.initialFree} > ${budget.maxInitialFree}`);
      }
      if (a.initialFree < 1) {
        errors.push(`${where}: no opening move`);
      }
      if (a.density > 0.85) {
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
      return `    ${label.padStart(7)} | ${'#'.repeat(n)} ${n}`;
    })
    .join('\n');
}

const all = perChapter.flat();
const avg = (nums: number[]): string =>
  nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '-';

console.log(`Arrow Escape - level validation (format v${pack.version})`);
console.log(`  file:   ${FILE}`);
console.log(`  levels: ${all.length}`);
console.log('');

pack.chapters.forEach((chapter, ci) => {
  const stats = perChapter[ci] ?? [];
  const bands = { easy: 0, medium: 0, hard: 0, brutal: 0 };
  for (const s of stats) bands[s.band]++;
  console.log(
    `  ${chapter.name}: ${stats.length} levels | arrows ${avg(stats.map((s) => s.arrows))} | ` +
      `cells ${avg(stats.map((s) => s.cells))} | initialFree ${avg(stats.map((s) => s.initialFree))} | ` +
      `difficulty ${avg(stats.map((s) => s.difficulty))}`,
  );
  console.log(
    `    bands: easy ${bands.easy}, medium ${bands.medium}, hard ${bands.hard}, brutal ${bands.brutal}`,
  );
});

console.log('');
console.log('  difficulty distribution (all levels):');
console.log(histogram(all.map((s) => s.difficulty), [0, 20, 30, 40, 50, 60, 70, 80]));
console.log('');
console.log('  opening moves available:');
console.log(histogram(all.map((s) => s.initialFree), [1, 2, 3, 4, 5]));
console.log('');

if (errors.length > 0) {
  console.error(`FAILED - ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}

console.log(`OK - all ${all.length} levels are solvable and within budget.`);
