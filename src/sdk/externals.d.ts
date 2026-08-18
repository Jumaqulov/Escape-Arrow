/** Minimal ambient types for the portal SDKs we inject at runtime. */

interface YaAdvCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (error: unknown) => void;
  onRewarded?: () => void;
}

interface YaPlayer {
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
}

interface YaSdk {
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv: {
    showFullscreenAdv(options: { callbacks?: YaAdvCallbacks }): void;
    showRewardedVideo(options: { callbacks?: YaAdvCallbacks }): void;
  };
  getPlayer(options?: { scopes?: boolean }): Promise<YaPlayer>;
  environment?: { i18n?: { lang?: string } };
}

interface CrazyAdCallbacks {
  adFinished?: () => void;
  adError?: (error: unknown, extra?: unknown) => void;
  adStarted?: () => void;
}

interface CrazySdk {
  init(): Promise<void>;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime?(): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks?: CrazyAdCallbacks): void;
  };
  user?: { systemInfo?: { countryCode?: string; browser?: { name?: string } } };
}

interface Window {
  YaGames?: { init(): Promise<YaSdk> };
  ysdk?: YaSdk;
  CrazyGames?: { SDK: CrazySdk };
}
