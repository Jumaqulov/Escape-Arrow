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

/** Local calendar date as YYYY-MM-DD - the daily challenge rolls at local midnight. */
function dayKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Yesterday's local date, via calendar arithmetic so DST days cannot skew it. */
function yesterdayKey(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dayKey(date);
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

/** Stars a chapter must hold before its boss level opens. */
export const BOSS_GATE = 90;
/** One-time coin payout for beating a chapter's boss. */
export const BOSS_REWARD = 500;

/** Daily challenge payout: base + step per extra streak day, capped. */
export const DAILY_BASE = 60;
export const DAILY_STEP = 30;
export const DAILY_CAP = 300;

/** Coin price of each unlockable palette (palette 0 is free). */
export const THEME_PRICE = 300;

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
      if (!Array.isArray(this.data.skins)) this.data.skins = [];
      if (typeof this.data.skin !== 'string' || this.data.skin === '') this.data.skin = 'classic';
      if (!this.hasSkin(this.data.skin)) this.data.skin = 'classic';
      if (!Array.isArray(this.data.themes)) this.data.themes = [];
      if (typeof this.data.themeChoice !== 'number' || this.data.themeChoice < -1) {
        this.data.themeChoice = -1;
      }
      // A forced palette the save does not actually own falls back to "auto".
      if (this.data.themeChoice >= 0 && !this.hasTheme(this.data.themeChoice)) {
        this.data.themeChoice = -1;
      }
      if (typeof this.data.daily !== 'object' || this.data.daily === null) {
        this.data.daily = { lastWin: '', streak: 0 };
      }
      if (typeof this.data.daily.lastWin !== 'string') this.data.daily.lastWin = '';
      if (typeof this.data.daily.streak !== 'number' || this.data.daily.streak < 0) {
        this.data.daily.streak = 0;
      }
      if (!Array.isArray(this.data.boss)) this.data.boss = [];
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
    await this.write();
  }

  /** Write soon - coalesces the bursts that happen around a level transition. */
  persistSoon(delay = 400): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.write();
    }, delay);
  }

  /**
   * Write a still-pending debounce right away. Page-exit events call this so
   * a reward granted in the last 400ms does not vanish with the timer.
   */
  flush(): void {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    void this.write();
  }

  /** Hand the payload to the SDK, stamped so load() can pick the newest copy. */
  private write(): Promise<void> {
    this.data.savedAt = Date.now();
    return getSdk().save(this.data);
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
    getSdk().submitScore?.(this.totalStars());
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

  // ------------------------------------------------------------ skins

  get skin(): string {
    return this.data.skin;
  }

  /** 'classic' is free for everyone, so it never lives in the save itself. */
  ownedSkins(): string[] {
    return ['classic', ...this.data.skins.filter((id) => id !== 'classic')];
  }

  hasSkin(id: string): boolean {
    return id === 'classic' || this.data.skins.includes(id);
  }

  /** Buy and wear. Returns false only when the purse is too light. */
  buySkin(id: string, price: number): boolean {
    if (!this.hasSkin(id)) {
      if (!this.spendCoins(price)) return false;
      this.data.skins.push(id);
    }
    this.selectSkin(id);
    return true;
  }

  selectSkin(id: string): void {
    if (!this.hasSkin(id)) return;
    this.data.skin = id;
    this.persistSoon();
  }

  // ------------------------------------------------------------ themes

  /** -1 means "follow the chapter", anything else forces that palette. */
  get themeChoice(): number {
    return this.data.themeChoice;
  }

  setThemeChoice(n: number): void {
    this.data.themeChoice = n;
    this.persistSoon();
  }

  hasTheme(n: number): boolean {
    return n === 0 || this.data.themes.includes(n);
  }

  /** Buy and apply. Returns false only when the purse is too light. */
  buyTheme(n: number, price: number): boolean {
    if (!this.hasTheme(n)) {
      if (!this.spendCoins(price)) return false;
      this.data.themes.push(n);
    }
    this.setThemeChoice(n);
    return true;
  }

  // ------------------------------------------------------------ daily challenge

  todayKey(): string {
    return dayKey(new Date());
  }

  canPlayDaily(): boolean {
    return this.data.daily.lastWin !== this.todayKey();
  }

  /** The streak as the player should see it: 0 once a day has been missed. */
  dailyStreak(): number {
    const last = this.data.daily.lastWin;
    if (last !== this.todayKey() && last !== yesterdayKey()) return 0;
    return this.data.daily.streak;
  }

  /** Pay out today's daily win. Returns the coins granted, 0 if already won today. */
  recordDailyWin(): number {
    const today = this.todayKey();
    if (this.data.daily.lastWin === today) return 0;
    this.data.daily.streak = this.data.daily.lastWin === yesterdayKey() ? this.data.daily.streak + 1 : 1;
    this.data.daily.lastWin = today;
    const reward = Math.min(DAILY_CAP, DAILY_BASE + DAILY_STEP * (this.data.daily.streak - 1));
    this.addCoins(reward);
    return reward;
  }

  // ------------------------------------------------------------ boss levels

  /** Stars collected inside one chapter - gates that chapter's boss. */
  chapterStars(chapter: number): number {
    const prefix = `${chapter}:`;
    return Object.entries(this.data.stars).reduce(
      (sum, [id, stars]) => (id.startsWith(prefix) ? sum + stars : sum),
      0,
    );
  }

  bossCleared(chapter: number): boolean {
    return this.data.boss.includes(chapter);
  }

  /** Pay out a boss win. Returns BOSS_REWARD the first time, 0 on replays. */
  recordBossWin(chapter: number): number {
    if (this.bossCleared(chapter)) return 0;
    this.data.boss.push(chapter);
    this.addCoins(BOSS_REWARD);
    return BOSS_REWARD;
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
