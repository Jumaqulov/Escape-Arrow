/** Title screen: logo card, one big indigo PLAY, settings behind the gear. */
import Phaser from 'phaser';
import { COLORS, FONT, applyChapterPalette, columnBounds, hex } from '../theme';
import { Button, IconButton, buildLogoCard, drawFlame, drawStar, iconGear, ambientBackdrop } from '../ui';
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

    // Shop and Daily share one row: two half-width buttons keep the column
    // from growing into a tower of full-width pills.
    const half = (buttonWidth - 14) / 2;

    new Button(this, {
      x: width / 2 - half / 2 - 7,
      y: height * 0.805,
      width: half,
      height: 72,
      label: t('shop'),
      variant: 'plain',
      fontSize: 24,
      onClick: () => this.scene.start('Shop'),
    });

    // Replay stays open after today's win - progress guards the reward - but
    // the button drops to the plain skin so it stops asking to be pressed.
    const dailyOpen = progress.canPlayDaily();
    const daily = new Button(this, {
      x: width / 2 + half / 2 + 7,
      y: height * 0.805,
      width: half,
      height: 72,
      label: dailyOpen ? t('daily') : t('dailyDone'),
      variant: dailyOpen ? 'soft' : 'plain',
      fontSize: dailyOpen ? 24 : 19,
      onClick: () => this.scene.start('Level', { daily: true }),
    });
    const streak = progress.dailyStreak();
    if (streak > 0) daily.add(this.buildStreakPill(streak, half, 72));

    this.buildStarCounter(width / 2, height * 0.875);

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

  /**
   * Flame-and-count pill riding the daily button's top-right corner, the same
   * perch the AD badge uses. Built here rather than via `badge` because the
   * badge is text-only and the streak needs its flame to read at a glance.
   */
  private buildStreakPill(streak: number, width: number, height: number): Phaser.GameObjects.Container {
    const layer = this.add.container(width / 2 - 16, -height / 2 + 6);

    const text = this.add
      .text(0, 0, String(streak), {
        fontFamily: FONT,
        fontSize: '15px',
        color: hex(COLORS.card),
        fontStyle: '800',
      })
      .setOrigin(0, 0.5);

    const flame = 17;
    const padX = 10;
    const gap = 5;
    const w = padX * 2 + flame + gap + text.width;
    const h = 26;

    const g = this.add.graphics();
    g.fillStyle(COLORS.amber, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    drawFlame(g, -w / 2 + padX + flame / 2, 0, flame, COLORS.card);
    text.setX(-w / 2 + padX + flame + gap);

    layer.add(g);
    layer.add(text);
    return layer;
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
