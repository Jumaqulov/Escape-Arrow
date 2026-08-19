/**
 * Yandex Games adapter.
 * Docs: https://yandex.ru/dev/games/doc/en/
 */
import type { ISdk, SaveData } from './ISdk';
import { defaultSave } from './ISdk';

const SAVE_KEY = 'arrowEscape';
const LOCAL_MIRROR = 'arrow-escape-save';
const LEADERBOARD = 'stars';

/**
 * Leaderboards are not in our ambient YaSdk stubs and not every Yandex build
 * exposes them, so the shape lives here and the call is feature-detected.
 */
interface YaLeaderboards {
  setLeaderboardScore?(boardName: string, score: number): Promise<unknown>;
}

type YaSdkWithBoards = YaSdk & { getLeaderboards?: () => Promise<YaLeaderboards | null> };

let ysdk: YaSdk | null = null;
let player: YaPlayer | null = null;
let loadingSignalled = false;
let gameplayRunning = false;

/**
 * Never let a portal callback that forgets to fire wedge the game. The
 * fallback is a thunk so the watchdog reports state as of the timeout - a
 * reward earned before the deadline must survive a missing onClose.
 */
function withTimeout<T>(build: (resolve: (value: T) => void) => void, ms: number, fallback: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => done(fallback()), ms);
    build((value) => {
      clearTimeout(timer);
      done(value);
    });
  });
}

/** Bound a bare portal promise; rejections still propagate to the caller. */
function bounded<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export const yandexSdk: ISdk = {
  platform: 'yandex',

  async init(): Promise<void> {
    try {
      const connect = window.YaGames?.init();
      ysdk = connect ? await bounded<YaSdk | null>(connect, 6000, null) : null;
      window.ysdk = ysdk ?? undefined;
      try {
        const fetchPlayer = ysdk?.getPlayer({ scopes: false });
        player = fetchPlayer ? await bounded<YaPlayer | null>(fetchPlayer, 6000, null) : null;
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
        try {
          ysdk?.adv.showFullscreenAdv({
            callbacks: {
              onClose: () => resolve(),
              onError: (error) => {
                console.warn('[sdk:yandex] interstitial error', error);
                resolve();
              },
            },
          });
        } catch (error) {
          console.warn('[sdk:yandex] interstitial error', error);
          resolve();
        }
      },
      // Unskippable interstitials legitimately run well past 20s.
      60000,
      () => undefined,
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
        try {
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
        } catch (error) {
          console.warn('[sdk:yandex] rewarded error', error);
          resolve(false);
        }
      },
      60000,
      () => rewarded,
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
    let cloud: SaveData | null = null;
    try {
      const data = player
        ? await bounded<Record<string, unknown> | null>(player.getData([SAVE_KEY]), 6000, null)
        : null;
      const value = data?.[SAVE_KEY];
      if (value && typeof value === 'object') cloud = { ...defaultSave(), ...(value as SaveData) };
    } catch (error) {
      console.warn('[sdk:yandex] cloud load failed, using local mirror', error);
    }
    let local: SaveData | null = null;
    try {
      const raw = localStorage.getItem(LOCAL_MIRROR);
      if (raw) local = JSON.parse(raw) as SaveData;
    } catch {
      /* storage disabled */
    }
    // The cloud can serve a stale snapshot after offline play: whichever copy
    // was written last wins, so it never rolls back the local mirror.
    if (cloud && local) return (local.savedAt ?? 0) > (cloud.savedAt ?? 0) ? local : cloud;
    return cloud ?? local;
  },

  submitScore(score: number): void {
    // Fire and forget: an anonymous player or missing leaderboard rejects
    // here, and none of that may ever surface as a gameplay error.
    try {
      const boards = (ysdk as YaSdkWithBoards | null)?.getLeaderboards?.();
      void boards
        ?.then((lb) => lb?.setLeaderboardScore?.(LEADERBOARD, Math.max(0, Math.floor(score))))
        .catch((error) => console.warn('[sdk:yandex] leaderboard submit failed', error));
    } catch (error) {
      console.warn('[sdk:yandex] leaderboard submit failed', error);
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
