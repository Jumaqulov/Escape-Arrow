import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyze,
  blockerOf,
  freeArrows,
  isFree,
  pathCells,
  solve,
  structuralErrors,
  validate,
} from '../src/core/rules';
import type { Arrow, Board } from '../src/core/types';

const horizontal: Arrow = {
  id: 1,
  head: { x: 1, y: 1 },
  dir: 'R',
  tail: [{ x: 0, y: 1 }],
};

const verticalBlocker: Arrow = {
  id: 2,
  head: { x: 2, y: 1 },
  dir: 'U',
  tail: [{ x: 2, y: 2 }],
};

const blockedBoard: Board = { w: 4, h: 4, arrows: [horizontal, verticalBlocker] };

test('blocking, free-arrow discovery, and the monotone solver agree', () => {
  assert.deepEqual(pathCells(horizontal, blockedBoard.w, blockedBoard.h), [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
  ]);
  assert.equal(isFree(horizontal, blockedBoard), false);
  assert.equal(blockerOf(horizontal, blockedBoard)?.id, verticalBlocker.id);
  assert.deepEqual(freeArrows(blockedBoard).map((arrow) => arrow.id), [verticalBlocker.id]);

  const result = solve(blockedBoard);
  assert.equal(result.solved, true);
  assert.deepEqual(result.order, [verticalBlocker.id, horizontal.id]);
  assert.deepEqual(result.branching, [1, 1]);
  assert.deepEqual(result.remaining, []);
});

test('a structurally valid board satisfies both geometry and solvability checks', () => {
  assert.deepEqual(structuralErrors(blockedBoard), []);
  assert.equal(validate(blockedBoard), true);
});

test('structural validation reports overlap, missing neck, and self-ray violations', () => {
  const invalid: Board = {
    w: 4,
    h: 4,
    arrows: [
      horizontal,
      { id: 2, head: { x: 0, y: 1 }, dir: 'R', tail: [] },
      { id: 3, head: { x: 1, y: 3 }, dir: 'U', tail: [{ x: 1, y: 2 }] },
    ],
  };

  const errors = structuralErrors(invalid);
  assert.ok(errors.some((message) => message.includes('overlaps arrow 1')));
  assert.ok(errors.some((message) => message.includes('has no tail')));
  assert.ok(errors.some((message) => message.includes('own escape ray')));
  assert.equal(validate(invalid), false);
});

test('analysis reports tail length and winding complexity', () => {
  const winding: Arrow = {
    id: 1,
    head: { x: 3, y: 1 },
    dir: 'R',
    tail: [
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
    ],
  };

  const stats = analyze({ w: 5, h: 5, arrows: [winding] });
  assert.equal(stats.avgTail, 5);
  assert.equal(stats.avgTurns, 4);
  assert.equal(stats.longTailRatio, 1);
});
