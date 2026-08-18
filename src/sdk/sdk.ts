/**
 * Platform auto-selector.
 *
 * One dist/ ships to every portal. At boot we work out where we are, inject
 * that portal's script tag, and hand back the matching adapter. Anything
 * unrecognised (or a failed script load) falls back to `stubSdk`, so local
 * dev and "opened the zip in a browser" both keep working.
 */
import type { ISdk, Platform } from './ISdk';
import { stubSdk } from './ISdk';
import { yandexSdk } from './yandex';
import { crazyGamesSdk } from './crazygames';

const YANDEX_SDK_URL = 'https://yandex.ru/games/sdk/v2';
const CRAZY_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

let resolved: ISdk | null = null;

function queryOverride(): Platform | null {
  try {
    const value = new URLSearchParams(window.location.search).get('platform');
    if (value === 'yandex' || value === 'crazygames' || value === 'stub') return value;
  } catch {
    /* no URL access */
  }
  return null;
}

function detect(): Platform {
  const override = queryOverride();
  if (override) return override;

  const envPlatform = import.meta.env['VITE_PLATFORM'];
  if (envPlatform === 'yandex' || envPlatform === 'crazygames') return envPlatform;

  if (window.YaGames) return 'yandex';
  if (window.CrazyGames) return 'crazygames';

  // Both portals serve the game from an iframe on their own domain, so the
  // ancestor / referrer is the reliable signal before any script is injected.
  const haystack = [
    window.location.hostname,
    document.referrer,
    ...(Array.from(document.location.ancestorOrigins ?? []) as string[]),
  ]
    .join(' ')
    .toLowerCase();

  if (haystack.includes('yandex')) return 'yandex';
  if (haystack.includes('crazygames') || haystack.includes('1001juegos')) return 'crazygames';

  return 'stub';
}

function loadScript(src: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve(true);
      return;
    }
    const el = document.createElement('script');
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    el.src = src;
    el.async = true;
    el.onload = () => {
      clearTimeout(timer);
      finish(true);
    };
    el.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    document.head.appendChild(el);
  });
}

/**
 * Detect, connect and cache. Always resolves - never throws - so a portal
 * outage degrades to a playable offline game instead of a black screen.
 */
export async function initSdk(): Promise<ISdk> {
  if (resolved) return resolved;

  const platform = detect();

  if (platform === 'yandex') {
    const ok = window.YaGames ? true : await loadScript(YANDEX_SDK_URL);
    if (ok && window.YaGames) {
      await yandexSdk.init();
      resolved = yandexSdk;
      console.info('[sdk] Yandex Games');
      return resolved;
    }
  }

  if (platform === 'crazygames') {
    const ok = window.CrazyGames ? true : await loadScript(CRAZY_SDK_URL);
    if (ok && window.CrazyGames) {
      await crazyGamesSdk.init();
      resolved = crazyGamesSdk;
      console.info('[sdk] CrazyGames');
      return resolved;
    }
  }

  await stubSdk.init();
  resolved = stubSdk;
  console.info('[sdk] local stub');
  return resolved;
}

/** The adapter chosen by initSdk(). Falls back to the stub before boot finishes. */
export function getSdk(): ISdk {
  return resolved ?? stubSdk;
}
