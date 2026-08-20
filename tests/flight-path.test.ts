import assert from 'node:assert/strict';
import test from 'node:test';
import { pathSlice, samplePath } from '../src/game/level/flightPath';

const points = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];
const cumulative = [0, 10, 20];

test('samplePath interpolates segments and extrapolates past the exit', () => {
  assert.deepEqual(samplePath(points, cumulative, 5, 0, 1), { x: 5, y: 0 });
  assert.deepEqual(samplePath(points, cumulative, 25, 0, 1), { x: 10, y: 15 });
});

test('pathSlice preserves every bend crossed by the moving arrow body', () => {
  assert.deepEqual(pathSlice(points, cumulative, 5, 15, 0, 1), [
    { x: 5, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ]);
});
