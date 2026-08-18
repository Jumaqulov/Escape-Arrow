/**
 * Yandex Games adapter.
 * Docs: https://yandex.ru/dev/games/doc/en/
 */
import type { ISdk, SaveData } from './ISdk';
import { defaultSave } from './ISdk';

const SAVE_KEY = 'arrowEscape';
const LOCAL_MIRROR = 'arrow-escape-save';

let ysdk: YaSdk | null = null;
let player: YaPlayer | null = null;
let loadingSignalled = false;
let gameplayRunning = false;

/** Never let a portal callback that forgets to fire wedge the game. */
function withTimeout<T>(build: (resolve: (value: T) => void) => void, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => done(fallback), ms);
    build((value) => {
      clearTimeout(timer);
      done(value);
    });
  });
}

export const yandexSdk: ISdk = {
  platform: 'yandex',

  async init(): Promise<void> {
    try {
      ysdk = (await window.YaGames?.init()) ?? null;
      window.ysdk = ysdk ?? undefined;
      try {
        player = await ysdk?.getPlayer({ scopes: false }) ?? null;
      } catch {
        player = null; // Anonymous player: fall back to localStorage.
      }
    } catch (error) {
      console.warn('[sdk:yandex] init failed, running unconnected', error);
      ysdk = null;
    }
  },

  loadingReady(): void {
    if (loadingSignalled) return;
    loadingSignalled = true;
    try {
      ysdk?.features?.LoadingAPI?.ready();
    } catch (error) {
      console.warn('[sdk:yandex] LoadingAPI.ready failed', error);
    }
  },

  gameplayStart(): void {
    if (gameplayRunning) return;
    gameplayRunning = true;
    try {
      ysdk?.features?.GameplayAPI?.start();
    } catch {
      /* non fatal */
    }
  },

  gameplayStop(): void {
    if (!gameplayRunning) return;
    gameplayRunning = false;
    try {
      ysdk?.features?.GameplayAPI?.stop();
    } catch {
      /* non fatal */
    }
  },

  async showInterstitial(): Promise<void> {
    const wasPlaying = gameplayRunning;
    this.gameplayStop();

    if (!ysdk) {
      if (wasPlaying) this.gameplayStart();
      return;
    }

    await withTimeout<void>(
      (resolve) => {
        ysdk?.adv.showFullscreenAdv({
          callbacks: {
            onClose: () => resolve(),
            onError: (error) => {
              console.warn('[sdk:yandex] interstitial error', error);
              resolve();
            },
          },
        });
      },
      20000,
      undefined,
    );

    if (wasPlaying) this.gameplayStart();
  },

  async showRewarded(): Promise<boolean> {
    const wasPlaying = gameplayRunning;
    this.gameplayStop();

    if (!ysdk) {
      if (wasPlaying) this.gameplayStart();
      return false;
    }

    let rewarded = false;
    const result = await withTimeout<boolean>(
      (resolve) => {
        ysdk?.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => {
              rewarded = true;
            },
            onClose: () => resolve(rewarded),
            onError: (error) => {
              console.warn('[sdk:yandex] rewarded error', error);
              resolve(false);
            },
          },
        });
      },
      60000,
      false,
    );

    if (wasPlaying) this.gameplayStart();
    return result;
  },

  async save(data: SaveData): Promise<void> {
    try {
      localStorage.setItem(LOCAL_MIRROR, JSON.stringify(data));
    } catch {
      /* storage disabled */
    }
    try {
      await player?.setData({ [SAVE_KEY]: data }, true);
    } catch (error) {
      console.warn('[sdk:yandex] cloud save failed, local mirror kept', error);
    }
  },

  async load(): Promise<SaveData | null> {
    try {
      const cloud = await player?.getData([SAVE_KEY]);
      const value = cloud?.[SAVE_KEY];
      if (value && typeof value === 'object') return { ...defaultSave(), ...(value as SaveData) };
    } catch (error) {
      console.warn('[sdk:yandex] cloud load failed, using local mirror', error);
    }
    try {
      const raw = localStorage.getItem(LOCAL_MIRROR);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  },

  getLang(): string {
    const lang = ysdk?.environment?.i18n?.lang;
    if (lang) return lang.slice(0, 2).toLowerCase();
    return (navigator.language || 'ru').slice(0, 2).toLowerCase();
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
