import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLevel, parsePack, serializeLevel } from '../src/core/format';
import { generateLevelOrThrow } from '../src/core/generator';
import { structuralErrors, validate } from '../src/core/rules';
import { PACK_VERSION, type LevelData, type LevelPack } from '../src/core/types';

const level: LevelData = {
  id: 7,
  w: 4,
  h: 4,
  arrows: [
    { x: 1, y: 1, d: 'R', t: 'L' },
    { x: 2, y: 1, d: 'U', t: 'D' },
  ],
};

test('level format v2 round-trips head, direction, and relative tail steps', () => {
  const board = parseLevel(level);
  assert.deepEqual(serializeLevel(board, level.id), level);
  assert.deepEqual(structuralErrors(board), []);
});

test('pack parsing normalizes legacy missing boss arrays and rejects wrong versions', () => {
  const pack: LevelPack = { version: PACK_VERSION, chapters: [{ name: 'One', levels: [level] }] };
  assert.deepEqual(parsePack(pack).boss, []);

  assert.throws(
    () => parsePack({ version: PACK_VERSION - 1, chapters: [] }),
    /this build needs/,
  );
});

test('the seeded core generator is deterministic and preserves board invariants', () => {
  const options = {
    w: 8,
    h: 8,
    count: 12,
    minCount: 8,
    seed: 20260820,
    minTail: 1,
    maxTail: 3,
    minInitialFree: 1,
    attempts: 20,
    tangle: 0.8,
    walk: 'random' as const,
  };

  const first = generateLevelOrThrow(options, 10);
  const second = generateLevelOrThrow(options, 10);

  assert.deepEqual(first, second);
  assert.ok(first.arrows.length >= options.minCount);
  assert.deepEqual(structuralErrors(first), []);
  assert.equal(validate(first), true);
});
