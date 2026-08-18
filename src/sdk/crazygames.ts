/**
 * CrazyGames adapter (SDK v3).
 * Docs: https://docs.crazygames.com/sdk/html5-v3/
 *
 * CrazyGames has no cloud save, so progress lives in localStorage.
 */
import type { ISdk, SaveData } from './ISdk';

const SAVE_KEY = 'arrow-escape-save';

let sdk: CrazySdk | null = null;
let loadingSignalled = false;
let gameplayRunning = false;

export const crazyGamesSdk: ISdk = {
  platform: 'crazygames',

  async init(): Promise<void> {
    try {
      sdk = window.CrazyGames?.SDK ?? null;
      await sdk?.init();
      try {
        sdk?.game.loadingStart();
      } catch {
        /* non fatal */
      }
    } catch (error) {
      console.warn('[sdk:crazygames] init failed, running unconnected', error);
      sdk = null;
    }
  },

  loadingReady(): void {
    if (loadingSignalled) return;
    loadingSignalled = true;
    try {
      sdk?.game.loadingStop();
    } catch (error) {
      console.warn('[sdk:crazygames] loadingStop failed', error);
    }
  },

  gameplayStart(): void {
    if (gameplayRunning) return;
    gameplayRunning = true;
    try {
      sdk?.game.gameplayStart();
    } catch {
      /* non fatal */
    }
  },

  gameplayStop(): void {
    if (!gameplayRunning) return;
    gameplayRunning = false;
    try {
      sdk?.game.gameplayStop();
    } catch {
      /* non fatal */
    }
  },

  async showInterstitial(): Promise<void> {
    const wasPlaying = gameplayRunning;
    this.gameplayStop();

    if (!sdk) {
      if (wasPlaying) this.gameplayStart();
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = setTimeout(finish, 20000);
      sdk?.ad.requestAd('midgame', {
        adFinished: () => {
          clearTimeout(timer);
          finish();
        },
        adError: (error) => {
          console.warn('[sdk:crazygames] interstitial error', error);
          clearTimeout(timer);
          finish();
        },
      });
    });

    if (wasPlaying) this.gameplayStart();
  },

  async showRewarded(): Promise<boolean> {
    const wasPlaying = gameplayRunning;
    this.gameplayStop();

    if (!sdk) {
      if (wasPlaying) this.gameplayStart();
      return false;
    }

    const rewarded = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), 60000);
      sdk?.ad.requestAd('rewarded', {
        adFinished: () => {
          clearTimeout(timer);
          finish(true);
        },
        adError: (error) => {
          console.warn('[sdk:crazygames] rewarded error', error);
          clearTimeout(timer);
          finish(false);
        },
      });
    });

    if (wasPlaying) this.gameplayStart();
    return rewarded;
  },

  async save(data: SaveData): Promise<void> {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage disabled */
    }
  },

  async load(): Promise<SaveData | null> {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  },

  getLang(): string {
    return (navigator.language || 'en').slice(0, 2).toLowerCase();
  },

  supportsVibration: typeof navigator !== 'undefined' && 'vibrate' in navigator,

  vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  },
};
