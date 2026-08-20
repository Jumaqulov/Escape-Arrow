import assert from 'node:assert/strict';
import test from 'node:test';

import { ProgressStore, repairSave } from '../src/game/progress';
import { TOTAL_LEVELS } from '../src/game/levels';
import { BOSS_REWARD, DAILY_BASE, DAILY_STEP } from '../src/game/progress';
import { SAVE_VERSION } from '../src/sdk/ISdk';

test('save repair migrates old data and removes corrupted values', () => {
  const repaired = repairSave(
    {
      v: 4,
      stars: { '0:0': 3, bad: 2, '0:1': 9 },
      unlocked: 9999,
      sound: 'yes',
      lang: 'unknown',
      played: -4,
      tutorialDone: 'no',
      coins: Number.NaN,
      tools: { hint: -1, eraser: 2.9, grid: 1 },
      seenTools: ['hint', 'hint', 'unknown'],
      dragSensitivity: 99,
      seenZoomHint: 'yes',
      skins: ['neon', 4, 'neon'],
      skin: 'missing',
      themes: [1, 1, -1, 2.5],
      themeChoice: 2,
      daily: { lastWin: 42, streak: -1 },
      boss: [0, 0, 99],
      savedAt: -1,
    },
    'uz',
  );

  assert.equal(repaired.v, SAVE_VERSION);
  assert.deepEqual(repaired.stars, { '0:0': 3 });
  assert.equal(repaired.unlocked, TOTAL_LEVELS);
  assert.equal(repaired.sound, true);
  assert.equal(repaired.lang, 'uz');
  assert.equal(repaired.played, 0);
  assert.equal(repaired.tutorialDone, false);
  assert.equal(repaired.coins, 0);
  assert.deepEqual(repaired.tools, { hint: 0, eraser: 2, grid: 1 });
  assert.deepEqual(repaired.seenTools, ['hint']);
  assert.equal(repaired.dragSensitivity, 2);
  assert.equal(repaired.seenZoomHint, false);
  assert.deepEqual(repaired.skins, ['neon']);
  assert.equal(repaired.skin, 'classic');
  assert.deepEqual(repaired.themes, [1]);
  assert.equal(repaired.themeChoice, -1);
  assert.deepEqual(repaired.daily, { lastWin: '', streak: 0 });
  assert.deepEqual(repaired.boss, [0]);
  assert.equal(repaired.savedAt, undefined);
});

test('a missing save starts in the platform language', () => {
  assert.equal(repairSave(null, 'tr').lang, 'tr');
});

test('daily rewards are once per day, grow with a streak, and reset after a gap', () => {
  const store = new ProgressStore();
  const day1 = new Date(2026, 7, 20);
  const day2 = new Date(2026, 7, 21);
  const day4 = new Date(2026, 7, 23);

  assert.equal(store.recordDailyWin(day1), DAILY_BASE);
  assert.equal(store.recordDailyWin(day1), 0);
  assert.equal(store.recordDailyWin(day2), DAILY_BASE + DAILY_STEP);
  assert.equal(store.dailyStreak(day2), 2);
  assert.equal(store.recordDailyWin(day4), DAILY_BASE);
  assert.equal(store.dailyStreak(day4), 1);
  assert.equal(store.coins, DAILY_BASE * 2 + DAILY_BASE + DAILY_STEP);
  store.flush();
});

test('boss rewards are granted once per chapter', () => {
  const store = new ProgressStore();
  assert.equal(store.recordBossWin(1), BOSS_REWARD);
  assert.equal(store.recordBossWin(1), 0);
  assert.equal(store.bossCleared(1), true);
  assert.equal(store.coins, BOSS_REWARD);
  store.flush();
});
