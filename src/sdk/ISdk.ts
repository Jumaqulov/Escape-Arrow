/**
 * Arrow Escape - platform abstraction.
 *
 * Every scene talks to this interface only. Yandex Games, CrazyGames and the
 * local-dev stub each implement it, so nothing in `src/game` ever branches on
 * which portal the build happens to be running on.
 */

/** Persisted player progress. Kept small: Yandex caps cloud saves. */
export interface SaveData {
  /** Save schema version, for future migrations. */
  v: number;
  /** "<chapterIndex>:<levelIndex>" -> best star count (1..3). */
  stars: Record<string, number>;
  /** How many levels are unlocked, counted across all chapters. */
  unlocked: number;
  sound: boolean;
  /** Two letter language code, see src/game/i18n.ts. */
  lang: string;
  /** Levels completed, counting replays - drives the interstitial cadence. */
  played: number;
  /** Has the player been shown the opening tap tutorial? */
  tutorialDone: boolean;
  /** Soft currency, earned per level and spent on tool charges. */
  coins: number;
  /** Remaining charges per tool. */
  tools: { hint: number; eraser: number; grid: number };
  /** Tools the player has been introduced to, by unlock ceremony. */
  seenTools: string[];
  /** Pan speed multiplier, 0.5 (slow) to 2 (fast). */
  dragSensitivity: number;
  /** Has the zoom coach mark been shown once? */
  seenZoomHint: boolean;
  /** Purchased arrow skin ids; 'classic' is free and never stored here. */
  skins: string[];
  /** The arrow skin currently applied. */
  skin: string;
  /** Purchased palette indices; palette 0 is free and never stored here. */
  themes: number[];
  /** Forced palette index, or -1 for the automatic per-chapter palette. */
  themeChoice: number;
  /** Daily challenge: local date (YYYY-MM-DD) of the last win, and the run. */
  daily: { lastWin: string; streak: number };
  /** Chapters whose boss level has been beaten (reward paid once each). */
  boss: number[];
  /** Epoch ms when this save was written; the newest copy wins cloud vs local. */
  savedAt?: number;
}

export type Platform = 'yandex' | 'crazygames' | 'stub';

export interface ISdk {
  readonly platform: Platform;

  /** Connect to the portal. Must never reject: fall back internally instead. */
  init(): Promise<void>;

  /** Tell the portal the loading screen is finished. Safe to call twice. */
  loadingReady(): void;

  /** Active gameplay has begun (sound on, no ads please). */
  gameplayStart(): void;

  /** Active gameplay paused or ended. MUST be called before showing any ad. */
  gameplayStop(): void;

  /** Full screen ad between levels. Resolves when the ad is done or skipped. */
  showInterstitial(): Promise<void>;

  /** Rewarded video. Resolves true only when the reward was actually earned. */
  showRewarded(): Promise<boolean>;

  save(data: SaveData): Promise<void>;
  load(): Promise<SaveData | null>;

  /**
   * Post the player's score to the portal leaderboard, fire-and-forget.
   * Portals without a leaderboard API simply omit this.
   */
  submitScore?(score: number): void;

  /** Portal UI language, used as the initial i18n choice. */
  getLang(): string;

  readonly supportsVibration: boolean;
  vibrate(pattern: number | number[]): void;
}

export const SAVE_VERSION = 5;

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    stars: {},
    unlocked: 1,
    sound: true,
    lang: 'en',
    played: 0,
    tutorialDone: false,
    coins: 0,
    tools: { hint: 0, eraser: 0, grid: 0 },
    seenTools: [],
    dragSensitivity: 1,
    seenZoomHint: false,
    skins: [],
    skin: 'classic',
    themes: [],
    themeChoice: -1,
    daily: { lastWin: '', streak: 0 },
    boss: [],
  };
}

const STUB_KEY = 'arrow-escape-save';

/**
 * Local development / offline fallback. Persists to localStorage so the dev
 * loop behaves like the real thing, and logs every ad call instead of showing
 * one.
 */
export const stubSdk: ISdk = {
  platform: 'stub',

  async init(): Promise<void> {
    // Nothing to connect to.
  },

  loadingReady(): void {
    console.info('[sdk:stub] loadingReady');
  },

  gameplayStart(): void {
    console.info('[sdk:stub] gameplayStart');
  },

  gameplayStop(): void {
    console.info('[sdk:stub] gameplayStop');
  },

  async showInterstitial(): Promise<void> {
    console.info('[sdk:stub] interstitial (skipped locally)');
  },

  async showRewarded(): Promise<boolean> {
    console.info('[sdk:stub] rewarded granted (no ad locally)');
    return true;
  },

  async save(data: SaveData): Promise<void> {
    try {
      localStorage.setItem(STUB_KEY, JSON.stringify(data));
    } catch {
      // Private mode / storage disabled - progress simply will not persist.
    }
  },

  async load(): Promise<SaveData | null> {
    try {
      const raw = localStorage.getItem(STUB_KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  },

  submitScore(score: number): void {
    console.info('[sdk:stub] submitScore', score);
  },

  getLang(): string {
    return (navigator.language || 'en').slice(0, 2).toLowerCase();
  },

  supportsVibration: typeof navigator !== 'undefined' && 'vibrate' in navigator,

  vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Ignored: vibration is a nicety, never a requirement.
    }
  },
};
