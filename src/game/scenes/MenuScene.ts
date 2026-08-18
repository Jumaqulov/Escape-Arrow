/** Title screen: logo card, one big indigo PLAY, settings behind the gear. */
import Phaser from 'phaser';
import { COLORS, FONT, applyChapterPalette, columnBounds, hex } from '../theme';
import { Button, IconButton, buildLogoCard, drawStar, iconGear, ambientBackdrop } from '../ui';
import { progress } from '../progress';
import { TOTAL_LEVELS, refByGlobal } from '../levels';
import { t } from '../i18n';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const { width, height } = this.cameras.main;
    // The menu wears the colours of the chapter the player is up to.
    applyChapterPalette(refByGlobal(progress.resumeGlobal())?.chapter ?? 0);
    this.cameras.main.setBackgroundColor(COLORS.bg);
    ambientBackdrop(this, 3);

    const logo = buildLogoCard(this, width / 2, height * 0.3, 460, 232);
    this.tweens.add({
      targets: logo,
      y: height * 0.3 - 10,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    new IconButton(this, {
      x: width - 60,
      y: 60,
      size: 56,
      fill: COLORS.card,
      icon: iconGear,
      onClick: () => this.scene.start('Settings'),
    });

    this.add
      .text(width / 2, height * 0.47, t('tagline'), {
        fontFamily: FONT,
        fontSize: '21px',
        color: hex(COLORS.inkSoft),
      })
      .setOrigin(0.5);

    const buttonWidth = Math.min(400, columnBounds(width).width);

    new Button(this, {
      x: width / 2,
      y: height * 0.6,
      width: buttonWidth,
      height: 96,
      label: t('play'),
      variant: 'primary',
      fontSize: 38,
      radius: 26,
      onClick: () => this.scene.start('Level', { global: progress.resumeGlobal() }),
    });

    new Button(this, {
      x: width / 2,
      y: height * 0.71,
      width: buttonWidth,
      height: 78,
      label: t('levels'),
      variant: 'plain',
      fontSize: 28,
      onClick: () => this.scene.start('LevelSelect'),
    });

    this.buildStarCounter(width / 2, height * 0.81);

    this.add
      .text(width / 2, height - 40, t('privacy'), {
        fontFamily: FONT,
        fontSize: '17px',
        color: hex(COLORS.inkMuted),
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        window.open(`${import.meta.env.BASE_URL}privacy.html`, '_blank', 'noopener');
      });
  }

  private buildStarCounter(x: number, y: number): void {
    const stars = progress.totalStars();
    const g = this.add.graphics();
    drawStar(g, x - 62, y, 15, COLORS.amber, true);

    this.add
      .text(x - 38, y, `${stars} / ${TOTAL_LEVELS * 3}`, {
        fontFamily: FONT,
        fontSize: '24px',
        color: hex(COLORS.inkSoft),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
  }
}
