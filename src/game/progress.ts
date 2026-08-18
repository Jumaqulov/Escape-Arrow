/**
 * Player progress: stars, unlocks, settings.
 *
 * Reads and writes through whichever ISdk is active, so cloud saves on Yandex
 * and localStorage on CrazyGames are the same code path from the scenes' side.
 */
import type { SaveData } from '../sdk/ISdk';
import { defaultSave, SAVE_VERSION } from '../sdk/ISdk';
import { getSdk } from '../sdk/sdk';
import { TOTAL_LEVELS, globalIndex } from './levels';
import { normalizeLang, setLang } from './i18n';

function key(chapter: number, index: number): string {
  return `${chapter}:${index}`;
}

class ProgressStore {
  data: SaveData = defaultSave();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Pull the save, repairing anything a schema change or bad write left behind. */
  async load(): Promise<void> {
    const sdk = getSdk();
    const loaded = await sdk.load();

    if (loaded && typeof loaded === 'object') {
      this.data = { ...defaultSave(), ...loaded, v: SAVE_VERSION };
      if (typeof this.data.stars !== 'object' || this.data.stars === null) this.data.stars = {};
      if (typeof this.data.unlocked !== 'number' || this.data.unlocked < 1) this.data.unlocked = 1;
      if (typeof this.data.sound !== 'boolean') this.data.sound = true;
      if (typeof this.data.played !== 'number') this.data.played = 0;
      if (typeof this.data.tutorialDone !== 'boolean') this.data.tutorialDone = false;
    } else {
      this.data = defaultSave();
      this.data.lang = sdk.getLang();
    }

    this.data.unlocked = Math.min(this.data.unlocked, TOTAL_LEVELS);
    setLang(normalizeLang(this.data.lang));
    this.data.lang = normalizeLang(this.data.lang);
  }

  /** Write now. */
  async persist(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await getSdk().save(this.data);
  }

  /** Write soon - coalesces the bursts that happen around a level transition. */
  persistSoon(delay = 400): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void getSdk().save(this.data);
    }, delay);
  }

  stars(chapter: number, index: number): number {
    return this.data.stars[key(chapter, index)] ?? 0;
  }

  isCleared(chapter: number, index: number): boolean {
    return this.stars(chapter, index) > 0;
  }

  isUnlocked(chapter: number, index: number): boolean {
    return globalIndex(chapter, index) < this.data.unlocked;
  }

  /** Record a finished level. Stars only ever go up. */
  recordWin(chapter: number, index: number, stars: number): void {
    const id = key(chapter, index);
    const best = this.data.stars[id] ?? 0;
    if (stars > best) this.data.stars[id] = stars;

    const nextGlobal = globalIndex(chapter, index) + 1;
    if (nextGlobal + 1 > this.data.unlocked) {
      this.data.unlocked = Math.min(TOTAL_LEVELS, nextGlobal + 1);
    }
    this.data.played += 1;
    this.persistSoon();
  }

  totalStars(): number {
    return Object.values(this.data.stars).reduce((sum, n) => sum + n, 0);
  }

  /** Where "Play" should drop the player: the first level they have not cleared. */
  resumeGlobal(): number {
    return Math.min(Math.max(0, this.data.unlocked - 1), TOTAL_LEVELS - 1);
  }

  /** The level 1 hand pointer only ever shows once per player. */
  needsTutorial(): boolean {
    return !this.data.tutorialDone;
  }

  markTutorialDone(): void {
    if (this.data.tutorialDone) return;
    this.data.tutorialDone = true;
    this.persistSoon();
  }

  setSound(enabled: boolean): void {
    this.data.sound = enabled;
    this.persistSoon();
  }

  setLanguage(lang: string): void {
    this.data.lang = setLang(lang);
    this.persistSoon();
  }

  /** Interstitials run every third completed level, per the design brief. */
  shouldShowInterstitial(): boolean {
    return this.data.played > 0 && this.data.played % 3 === 0;
  }
}

export const progress = new ProgressStore();
