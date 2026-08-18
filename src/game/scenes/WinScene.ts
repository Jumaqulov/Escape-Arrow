/** Post-level card: stars, save, and the interstitial cadence. */
import Phaser from 'phaser';
import { COLORS, FONT, RADIUS, columnBounds, hex } from '../theme';
import { Button, confetti, drawCard, drawStar } from '../ui';
import { progress } from '../progress';
import { refByGlobal, TOTAL_LEVELS } from '../levels';
import { t } from '../i18n';
import { getSdk } from '../../sdk/sdk';

interface WinData {
  global: number;
  stars: number;
  hints: number;
  undos: number;
}

export class WinScene extends Phaser.Scene {
  private result!: WinData;
  private showAdOnNext = false;

  constructor() {
    super('Win');
  }

  init(data: WinData): void {
    this.result = {
      global: data?.global ?? 0,
      stars: data?.stars ?? 1,
      hints: data?.hints ?? 0,
      undos: data?.undos ?? 0,
    };
  }

  create(): void {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    const ref = refByGlobal(this.result.global);
    if (ref) {
      progress.recordWin(ref.chapter, ref.index, this.result.stars);
      void progress.persist();
    }
    // Decided here, before the player taps: the counter moves on again as
    // soon as the next level is finished.
    this.showAdOnNext = progress.shouldShowInterstitial();

    const cardW = columnBounds(width, 120).width;
    const cardH = 470;
    const cardX = (width - cardW) / 2;
    const cardY = height * 0.2;

    const card = this.add.graphics();
    drawCard(card, cardX, cardY, cardW, cardH, RADIUS.card);

    this.add
      .text(width / 2, cardY + 62, t('cleared'), {
        fontFamily: FONT,
        fontSize: '46px',
        color: hex(COLORS.accent),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(5);

    this.add
      .text(width / 2, cardY + 106, `${t('level')} ${ref?.data.id ?? this.result.global + 1}`, {
        fontFamily: FONT,
        fontSize: '22px',
        color: hex(COLORS.inkSoft),
      })
      .setOrigin(0.5);

    this.buildStars(width / 2, cardY + 216);

    this.add
      .text(width / 2, cardY + 316, this.result.stars === 3 ? t('perfect') : t('usedHelp'), {
        fontFamily: FONT,
        fontSize: '22px',
        color: hex(this.result.stars === 3 ? COLORS.amber : COLORS.inkSoft),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, cardY + 384, `${progress.totalStars()} / ${TOTAL_LEVELS * 3}  ${t('totalStars')}`, {
        fontFamily: FONT,
        fontSize: '19px',
        color: hex(COLORS.inkMuted),
      })
      .setOrigin(0.5);

    const next = refByGlobal(this.result.global + 1);
    const buttonWidth = Math.min(400, columnBounds(width).width);

    if (next) {
      new Button(this, {
        x: width / 2,
        y: height * 0.78,
        width: buttonWidth,
        height: 92,
        label: t('nextLevel'),
        variant: 'primary',
        fontSize: 32,
        radius: 24,
        onClick: () => void this.goNext(next.global),
      });
    } else {
      this.add
        .text(width / 2, height * 0.78, t('allClear'), {
          fontFamily: FONT,
          fontSize: '28px',
          color: hex(COLORS.amber),
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }

    new Button(this, {
      x: width / 2,
      y: height * 0.88,
      width: buttonWidth,
      height: 74,
      label: t('backToLevels'),
      variant: 'plain',
      fontSize: 26,
      onClick: () => this.scene.start('LevelSelect', { chapter: ref?.chapter ?? 0 }),
    });

    if (this.result.stars === 3) {
      this.time.delayedCall(220, () => confetti(this, width / 2, cardY + 200, 40));
    }
  }

  private buildStars(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const earned = i < this.result.stars;
      const g = this.add.graphics();
      drawStar(g, 0, 0, 48, earned ? COLORS.amber : COLORS.locked, true);
      g.setPosition(x + (i - 1) * 118, y - (i === 1 ? 20 : 0));

      if (earned) {
        g.setScale(0);
        this.tweens.add({
          targets: g,
          scale: 1,
          duration: 360,
          delay: 130 * i,
          ease: 'Back.easeOut',
        });
      }
    }
  }

  private async goNext(global: number): Promise<void> {
    if (this.showAdOnNext) {
      this.showAdOnNext = false;
      await getSdk().showInterstitial();
    }
    this.scene.start('Level', { global });
  }
}
