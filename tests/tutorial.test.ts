import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowTapTutorial } from '../src/game/tutorial';

test('tap tutorial is shown only while an opening campaign board still needs coaching', () => {
  assert.equal(shouldShowTapTutorial(0, true, false), true);
  assert.equal(shouldShowTapTutorial(1, true, false), true);

  assert.equal(shouldShowTapTutorial(0, false, false), false);
  assert.equal(shouldShowTapTutorial(1, false, false), false);
  assert.equal(shouldShowTapTutorial(2, true, false), false);
  assert.equal(shouldShowTapTutorial(0, true, true), false);
});
