/**
 * The level pack, parsed once at module load.
 *
 * levels.json is imported (and therefore bundled) rather than fetched: packed
 * boards grew it to ~350 KB raw, but it gzips to ~45 KB and one fewer network
 * request matters on portals that serve the game from a cold CDN edge.
 */
import packJson from '../levels/levels.json';
import type { Chapter, LevelData, LevelPack } from '../core/types';
import { parsePack, serializeLevel } from '../core/format';
import { generateLevelOrThrow } from '../core/generator';

export const PACK: LevelPack = parsePack(packJson as unknown as LevelPack);
export const CHAPTERS: Chapter[] = PACK.chapters;

export interface LevelRef {
  /** Chapter index, 0 based. */
  chapter: number;
  /** Index inside the chapter, 0 based. */
  index: number;
  /** Index across the whole pack, 0 based. */
  global: number;
  data: LevelData;
}

const FLAT: LevelRef[] = [];
CHAPTERS.forEach((chapter, ci) => {
  chapter.levels.forEach((data, li) => {
    FLAT.push({ chapter: ci, index: li, global: FLAT.length, data });
  });
});

export const TOTAL_LEVELS = FLAT.length;

export function refByGlobal(global: number): LevelRef | null {
  return FLAT[global] ?? null;
}

export function refByChapter(chapter: number, index: number): LevelRef | null {
  return FLAT.find((r) => r.chapter === chapter && r.index === index) ?? null;
}

export function globalIndex(chapter: number, index: number): number {
  let total = 0;
  for (let c = 0; c < chapter; c++) total += CHAPTERS[c]?.levels.length ?? 0;
  return total + index;
}

export function nextRef(ref: LevelRef): LevelRef | null {
  return refByGlobal(ref.global + 1);
}

/** The oversized boss board crowning a chapter, or null when there is none. */
export function bossData(chapter: number): LevelData | null {
  return PACK.boss?.[chapter] ?? null;
}

/** Ids 1-150 are campaign, 1001+ are bosses; the daily lives well clear. */
const DAILY_ID = 9000;

/**
 * The daily challenge board, generated on the device rather than shipped:
 * a fresh mid-campaign-difficulty board for every date seed.
 *
 * A pure function of `seed`, so every player sees the same board on the same
 * day. minTail must stay 1: the core builder rejects the whole board when one
 * crowded tail walk comes up short of the floor, and with minTail 2 that
 * rejection cascades until nothing generates. Timed over a year of date seeds
 * without a single failure: ~30 ms typical, ~200 ms worst-case in node - a
 * one-frame hiccup at most, even allowing for a slow phone.
 */
export function dailyData(seed: number): LevelData {
  const board = generateLevelOrThrow(
    {
      w: 13,
      h: 16,
      count: 55,
      minCount: 42,
      seed,
      minTail: 1,
      maxTail: 6,
      minInitialFree: 1,
      attempts: 5,
      tangle: 0.9,
      walk: 'random',
    },
    40,
  );
  return serializeLevel(board, DAILY_ID);
}
