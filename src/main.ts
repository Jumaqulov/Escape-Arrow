/** Entry point: wires the scenes into a single fit-to-screen portrait game. */
import Phaser from 'phaser';
import { COLORS, DESIGN_HEIGHT, DESIGN_WIDTH } from './game/theme';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { LevelSelectScene } from './game/scenes/LevelSelectScene';
import { LevelScene } from './game/scenes/LevelScene';
import { WinScene } from './game/scenes/WinScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { ShopScene } from './game/scenes/ShopScene';
import { progress } from './game/progress';
import { getSdk } from './sdk/sdk';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  // Mouse + two touch pointers: the second touch is what makes pinch-zoom
  // possible on the board.
  input: { activePointers: 3 },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, MenuScene, LevelSelectScene, LevelScene, WinScene, SettingsScene, ShopScene],
};

const game = new Phaser.Game(config);

// Folded away in production: `import.meta.env.DEV` is a literal false there.
if (import.meta.env.DEV) {
  void import('./game/devcheck').then((m) => m.runDevChecks());
}

// Portals want to know when the player is actually playing: tabbing away has
// to pause the gameplay signal or the analytics (and the ad policy) are wrong.
// The scene holds gameplayStop while a modal or fail overlay is open, and a
// refocus must not override that.
game.events.on(Phaser.Core.Events.BLUR, () => getSdk().gameplayStop());
game.events.on(Phaser.Core.Events.FOCUS, () => {
  const level = game.scene.getScene('Level') as LevelScene | null;
  if (game.scene.isActive('Level') && level?.gameplayActive) getSdk().gameplayStart();
});

// The debounced save never fires if the page goes away first: flush so a
// reward granted moments before backgrounding survives.
window.addEventListener('pagehide', () => progress.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') progress.flush();
});

declare global {
  interface Window {
    __arrowEscape?: Phaser.Game;
  }
}

// Handy for debugging in the console and for automated smoke tests.
window.__arrowEscape = game;
