import assert from 'node:assert/strict';
import test from 'node:test';
import { arrowHeadPoints } from '../src/game/ui/arrow';

test('arrow head geometry rotates around the shaft without changing proportions', () => {
  assert.deepEqual(arrowHeadPoints(10, 20, 'R', 100), {
    tip: { x: 58, y: 20 },
    left: { x: 10, y: 36 },
    right: { x: 10, y: 4 },
    forward: { x: 1, y: 0 },
  });

  assert.deepEqual(arrowHeadPoints(10, 20, 'U', 100), {
    tip: { x: 10, y: -28 },
    left: { x: 26, y: 20 },
    right: { x: -6, y: 20 },
    forward: { x: 0, y: -1 },
  });
});
