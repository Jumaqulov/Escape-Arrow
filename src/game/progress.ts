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

export const TOOLS = ['hint', 'eraser', 'grid'] as const;
export type Tool = (typeof TOOLS)[number];

/**
 * Which global level index first hands the player each tool. Introducing them
 * one at a time is what keeps the toolbar from being three grey mysteries on
 * the very first board.
 */
export const TOOL_UNLOCK_AT: Readonly<Record<Tool, number>> = { hint: 1, eraser: 2, grid: 3 };

/** Charges granted by the unlock ceremony. */
const TOOL_GRANT = 2;

/** A tool refill bought outright: this many charges for this many coins. */
export const TOOL_PACK = 3;
export const TOOL_PRICE = 200;

/** Coins paid for finishing a level, and the rewarded-video multiple. */
export const COINS_PER_WIN = 10;
export const COINS_BONUS = 200;

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
      if (typeof this.data.coins !== 'number' || this.data.coins < 0) this.data.coins = 0;
      if (!Array.isArray(this.data.seenTools)) this.data.seenTools = [];
      if (typeof this.data.seenZoomHint !== 'boolean') this.data.seenZoomHint = false;
      if (typeof this.data.dragSensitivity !== 'number' || !(this.data.dragSensitivity > 0)) {
        this.data.dragSensitivity = 1;
      }
      this.data.dragSensitivity = Math.min(2, Math.max(0.5, this.data.dragSensitivity));
      if (typeof this.data.tools !== 'object' || this.data.tools === null) {
        this.data.tools = { hint: 0, eraser: 0, grid: 0 };
      }
      for (const tool of TOOLS) {
        if (typeof this.data.tools[tool] !== 'number' || this.data.tools[tool] < 0) {
          this.data.tools[tool] = 0;
        }
      }
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

  // ------------------------------------------------------------ coins

  get coins(): number {
    return this.data.coins;
  }

  addCoins(amount: number): void {
    this.data.coins = Math.max(0, this.data.coins + amount);
    this.persistSoon();
  }

  /** Spend if affordable; returns false and changes nothing otherwise. */
  spendCoins(amount: number): boolean {
    if (this.data.coins < amount) return false;
    this.data.coins -= amount;
    this.persistSoon();
    return true;
  }

  // ------------------------------------------------------------ tools

  toolCharges(tool: Tool): number {
    return this.data.tools[tool] ?? 0;
  }

  grantTool(tool: Tool, amount = TOOL_GRANT): void {
    this.data.tools[tool] = this.toolCharges(tool) + amount;
    this.persistSoon();
  }

  /** Burn one charge. Returns false when the player has none left. */
  useTool(tool: Tool): boolean {
    if (this.toolCharges(tool) <= 0) return false;
    this.data.tools[tool] -= 1;
    this.persistSoon();
    return true;
  }

  /** Buy a pack of charges. Returns false when the purse is too light. */
  buyTool(tool: Tool): boolean {
    if (!this.spendCoins(TOOL_PRICE)) return false;
    this.grantTool(tool, TOOL_PACK);
    return true;
  }

  get dragSensitivity(): number {
    return this.data.dragSensitivity;
  }

  setDragSensitivity(value: number): void {
    this.data.dragSensitivity = Math.min(2, Math.max(0.5, value));
    this.persistSoon();
  }

  needsZoomHint(): boolean {
    return !this.data.seenZoomHint;
  }

  markZoomHintSeen(): void {
    if (this.data.seenZoomHint) return;
    this.data.seenZoomHint = true;
    this.persistSoon();
  }

  isToolUnlocked(tool: Tool, globalLevel: number): boolean {
    return globalLevel >= TOOL_UNLOCK_AT[tool];
  }

  /**
   * The tool this level should celebrate, if any. Each ceremony fires once
   * ever, the first time the player reaches its level.
   */
  pendingToolUnlock(globalLevel: number): Tool | null {
    for (const tool of TOOLS) {
      if (TOOL_UNLOCK_AT[tool] === globalLevel && !this.data.seenTools.includes(tool)) {
        return tool;
      }
    }
    return null;
  }

  markToolSeen(tool: Tool): void {
    if (this.data.seenTools.includes(tool)) return;
    this.data.seenTools.push(tool);
    this.grantTool(tool);
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
