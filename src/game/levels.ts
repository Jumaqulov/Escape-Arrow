/**
 * The level pack, parsed once at module load.
 *
 * levels.json is imported (and therefore bundled) rather than fetched: it is
 * only ~16 KB, and one fewer network request matters on portals that serve the
 * game from a cold CDN edge.
 */
import packJson from '../levels/levels.json';
import type { Chapter, LevelData, LevelPack } from '../core/types';
import { parsePack } from '../core/format';

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
