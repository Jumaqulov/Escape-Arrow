/**
 * Post-level celebration.
 *
 * Deliberately dark: the whole game is pale, so dropping the lights and
 * turning on golden rays makes finishing a level feel like an event rather
 * than another white card.
 */
import Phaser from 'phaser';
import { COLORS, FONT, applyChapterPalette, columnBounds, hex } from '../theme';
import { Button, confetti, drawCoin, drawHappyFace, drawStar, goldenBurst } from '../ui';
import { progress, COINS_PER_WIN, COINS_BONUS } from '../progress';
import { refByGlobal, TOTAL_LEVELS } from '../levels';
import { t } from '../i18n';
import { getSdk } from '../../sdk/sdk';

interface WinData {
  global: number;
  stars: number;
  hints: number;
  undos: number;
}

const BACKDROP = 0x14161f;

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

    const ref = refByGlobal(this.result.global);
    applyChapterPalette(ref?.chapter ?? 0);
    this.cameras.main.setBackgroundColor(BACKDROP);

    if (ref) {
      progress.recordWin(ref.chapter, ref.index, this.result.stars);
      progress.addCoins(COINS_PER_WIN);
      void progress.persist();
    }
    // Decided here, before the player taps: the counter moves on again as
    // soon as the next level is finished.
    this.showAdOnNext = progress.shouldShowInterstitial();

    const centreY = height * 0.36;
    goldenBurst(this, width / 2, centreY, 340);

    // ---- headline --------------------------------------------------------
    this.add
      .text(width / 2, height * 0.1, `${t('level')} ${ref?.data.id ?? this.result.global + 1}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: hex(COLORS.card),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const banner = this.add
      .text(width / 2, height * 0.15, t('completed'), {
        fontFamily: FONT,
        fontSize: '54px',
        color: hex(COLORS.amber),
        fontStyle: '800',
      })
      .setOrigin(0.5)
      .setLetterSpacing(2);
    banner.setScale(0.5);
    this.tweens.add({ targets: banner, scale: 1, duration: 420, ease: 'Back.easeOut' });

    // ---- mascot ----------------------------------------------------------
    const face = this.add.graphics();
    drawHappyFace(face, 0, 0, 190);
    face.setPosition(width / 2, centreY);
    face.setScale(0);
    this.tweens.add({ targets: face, scale: 1, duration: 460, ease: 'Back.easeOut' });

    this.buildStars(width / 2, height * 0.56);

    // ---- coins -----------------------------------------------------------
    const purse = this.add.graphics();
    drawCoin(purse, width / 2 - 52, height * 0.645, 21);
    this.add
      .text(width / 2 - 22, height * 0.645, `+${COINS_PER_WIN}`, {
        fontFamily: FONT,
        fontSize: '32px',
        color: hex(COLORS.card),
        fontStyle: '800',
      })
      .setOrigin(0, 0.5);

    const buttonWidth = Math.min(360, columnBounds(width).width);

    const bonus = new Button(this, {
      x: width / 2,
      y: height * 0.73,
      width: buttonWidth,
      height: 74,
      label: `+${COINS_BONUS}`,
      variant: 'primary',
      fontSize: 28,
      radius: 37,
      badge: 'AD',
      onClick: () => {
        void (async () => {
          bonus.setEnabled(false);
          const granted = await getSdk().showRewarded();
          if (granted) {
            progress.addCoins(COINS_BONUS);
            confetti(this, width / 2, height * 0.73, 34);
          } else {
            bonus.setEnabled(true);
          }
        })();
      },
    });

    // ---- onward ----------------------------------------------------------
    const next = refByGlobal(this.result.global + 1);
    if (next) {
      new Button(this, {
        x: width / 2,
        y: height * 0.83,
        width: buttonWidth,
        height: 84,
        label: t('nextLevel'),
        variant: 'plain',
        fontSize: 30,
        radius: 42,
        onClick: () => void this.goNext(next.global),
      });
    } else {
      this.add
        .text(width / 2, height * 0.83, t('allClear'), {
          fontFamily: FONT,
          fontSize: '28px',
          color: hex(COLORS.amber),
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }

    this.add
      .text(width / 2, height * 0.92, `${t('backToLevels')}   ·   ${progress.totalStars()} / ${TOTAL_LEVELS * 3}`, {
        fontFamily: FONT,
        fontSize: '19px',
        color: hex(0x8d93a3),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('LevelSelect', { chapter: ref?.chapter ?? 0 }));

    this.time.delayedCall(240, () => confetti(this, width / 2, centreY, 54));
  }

  private buildStars(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const earned = i < this.result.stars;
      const g = this.add.graphics();
      drawStar(g, 0, 0, 34, earned ? COLORS.amber : 0x3a3d48, true);
      g.setPosition(x + (i - 1) * 88, y - (i === 1 ? 14 : 0));

      if (earned) {
        g.setScale(0);
        this.tweens.add({
          targets: g,
          scale: 1,
          duration: 360,
          delay: 300 + 130 * i,
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
