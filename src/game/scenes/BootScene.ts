/**
 * Boot: load audio, register the level pack, connect to whichever portal we
 * are running on, then hand over to the menu.
 *
 * The bar shows real progress: asset loading fills the first 80%, the portal
 * handshake and the save round-trip the rest. loadingReady() fires at 100%.
 */
import Phaser from 'phaser';
import { COLORS, FONT, hex } from '../theme';
import { PACK } from '../levels';
import { progress } from '../progress';
import { applyMuteFromSave, SOUND_KEYS } from '../audio';
import { buildLogoCard, drawShadow } from '../ui';
import { getSdk, initSdk } from '../../sdk/sdk';
import { t } from '../i18n';

const BAR_WIDTH = 320;
const BAR_HEIGHT = 14;

export class BootScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private percentText!: Phaser.GameObjects.Text;
  private label!: Phaser.GameObjects.Text;
  private shown = 0;
  private barX = 0;
  private barY = 0;

  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    buildLogoCard(this, width / 2, height * 0.4);

    this.barX = (width - BAR_WIDTH) / 2;
    this.barY = height * 0.62;

    const track = this.add.graphics();
    drawShadow(track, this.barX, this.barY, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2, 4, 2);
    track.fillStyle(COLORS.card, 1);
    track.fillRoundedRect(this.barX, this.barY, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);

    this.bar = this.add.graphics();

    this.percentText = this.add
      .text(width / 2, this.barY + 46, '0%', {
        fontFamily: FONT,
        fontSize: '24px',
        color: hex(COLORS.accent),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.label = this.add
      .text(width / 2, this.barY - 34, 'LOADING', {
        fontFamily: FONT,
        fontSize: '18px',
        color: hex(COLORS.inkMuted),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(4);

    this.load.on('progress', (value: number) => this.setPercent(value * 0.8));

    const base = import.meta.env.BASE_URL;
    for (const key of SOUND_KEYS) {
      this.load.audio(key, `${base}sounds/${key}.wav`);
    }
  }

  create(): void {
    // Levels are bundled, not fetched - publish them through the same cache
    // the rest of the game reads from.
    if (!this.cache.json.exists('levels')) {
      this.cache.json.add('levels', PACK);
    }
    void this.boot();
  }

  private setPercent(value: number): void {
    const clamped = Math.max(this.shown, Math.min(1, value));
    this.shown = clamped;

    this.bar.clear();
    const filled = Math.max(BAR_HEIGHT, BAR_WIDTH * clamped);
    this.bar.fillStyle(COLORS.accent, 1);
    this.bar.fillRoundedRect(this.barX, this.barY, filled, BAR_HEIGHT, BAR_HEIGHT / 2);

    this.percentText.setText(`${Math.round(clamped * 100)}%`);
  }

  private async boot(): Promise<void> {
    await initSdk();
    this.setPercent(0.9);

    await progress.load();
    applyMuteFromSave(this);
    this.label.setText(t('loading'));

    this.setPercent(1);
    getSdk().loadingReady();

    document.getElementById('boot')?.remove();

    // Let the 100% actually land on screen before the scene swaps out.
    this.time.delayedCall(160, () => this.scene.start('Menu'));
  }
}
