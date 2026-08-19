/**
 * Post-level celebration.
 *
 * Deliberately dark: the whole game is pale, so dropping the lights and
 * turning on golden rays makes finishing a level feel like an event rather
 * than another white card.
 */
import Phaser from 'phaser';
import { COLORS, FONT, applyChapterPalette, columnBounds, hex } from '../theme';
import { Button, burstShapes, confetti, drawCoin, drawHappyFace, drawStar, goldenBurst } from '../ui';
import { progress, COINS_PER_WIN, COINS_BONUS } from '../progress';
import { refByGlobal, TOTAL_LEVELS } from '../levels';
import { t } from '../i18n';
import { getSdk } from '../../sdk/sdk';

interface WinData {
  global: number;
  stars: number;
  hints: number;
  undos: number;
  /** Set for boss/daily clears; the campaign fields above are then unused. */
  special?: 'boss' | 'daily';
  /** Boss only: which chapter's boss fell. */
  chapter?: number;
  /** Special reward already granted by record*Win; 0 on a repeat clear. */
  reward?: number;
  /** Daily only: consecutive days won, today included. */
  streak?: number;
}

const BACKDROP = 0x14161f;

export class WinScene extends Phaser.Scene {
  private result!: WinData;
  private showAdOnNext = false;
  // Latched by the first NEXT/LEVELS tap: the interstitial await leaves the
  // buttons live, and a second scene.start would restart the level mid-play.
  private navigating = false;

  constructor() {
    super('Win');
  }

  init(data: WinData): void {
    this.navigating = false;
    this.result = {
      global: data?.global ?? 0,
      stars: data?.stars ?? 1,
      hints: data?.hints ?? 0,
      undos: data?.undos ?? 0,
      special: data?.special,
      chapter: data?.chapter,
      reward: data?.reward ?? 0,
      streak: data?.streak ?? 0,
    };
  }

  create(): void {
    const { width, height } = this.cameras.main;

    const special = this.result.special;
    const ref = special ? null : refByGlobal(this.result.global);
    // Specials wear the palette of the board they were just played on: the
    // boss's own chapter, or (daily) wherever the campaign currently stands.
    if (special === 'boss') applyChapterPalette(this.result.chapter ?? 0);
    else if (special === 'daily') applyChapterPalette(refByGlobal(progress.resumeGlobal())?.chapter ?? 0);
    else applyChapterPalette(ref?.chapter ?? 0);
    this.cameras.main.setBackgroundColor(BACKDROP);

    if (special) {
      // No recordWin and no unlock advancement - the special's own reward was
      // granted by record*Win before this scene started - but the flat
      // per-win purse still lands on top of it.
      progress.addCoins(COINS_PER_WIN);
      void progress.persist();
    } else if (ref) {
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
    const headline =
      special === 'boss'
        ? t('boss')
        : special === 'daily'
          ? t('daily')
          : `${t('level')} ${ref?.data.id ?? this.result.global + 1}`;
    this.add
      .text(width / 2, height * 0.1, headline, {
        fontFamily: FONT,
        fontSize: '30px',
        color: hex(COLORS.card),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const bannerText =
      special === 'boss' ? t('bossClear') : special === 'daily' ? t('dailyClear') : t('completed');
    const banner = this.add
      .text(width / 2, height * 0.15, bannerText, {
        fontFamily: FONT,
        fontSize: '54px',
        color: hex(COLORS.amber),
        fontStyle: '800',
      })
      .setOrigin(0.5)
      .setLetterSpacing(2);
    banner.setScale(0.5);
    this.tweens.add({
      targets: banner,
      scale: 1,
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => {
        // A tiny settle once it lands, not a permanent idle animation —
        // finite repeat so nothing keeps ticking after the scene closes.
        this.tweens.add({
          targets: banner,
          scale: 1.04,
          duration: 160,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
      },
    });

    // ---- mascot ----------------------------------------------------------
    const face = this.add.graphics();
    drawHappyFace(face, 0, 0, 190);
    face.setPosition(width / 2, centreY);
    face.setScale(0);
    this.tweens.add({ targets: face, scale: 1, duration: 460, ease: 'Back.easeOut' });

    // Stars grade help used on a campaign level; a special has no grade to
    // give, so its slot shows what the clear actually paid instead.
    if (special) this.buildSpecialResult(width / 2, height * 0.56);
    else this.buildStars(width / 2, height * 0.56);

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
          let granted = false;
          try {
            granted = await getSdk().showRewarded();
          } finally {
            // Coins are global state and always land; the scene may have been
            // torn down mid-ad, so UI feedback is gated on it being live.
            if (granted) progress.addCoins(COINS_BONUS);
            if (this.sys.isActive()) {
              if (granted) confetti(this, width / 2, height * 0.73, 34);
              else bonus.setEnabled(true);
            }
          }
        })();
      },
    });

    // ---- onward ----------------------------------------------------------
    // A special has no "next": the button goes home instead. (t('levels') is
    // the label because the dictionary has no dedicated menu key.)
    const next = special ? null : refByGlobal(this.result.global + 1);
    if (special) {
      new Button(this, {
        x: width / 2,
        y: height * 0.83,
        width: buttonWidth,
        height: 84,
        label: t('levels'),
        variant: 'plain',
        fontSize: 30,
        radius: 42,
        onClick: () => void this.leaveTo('Menu'),
      });
    } else if (next) {
      new Button(this, {
        x: width / 2,
        y: height * 0.83,
        width: buttonWidth,
        height: 84,
        label: t('nextLevel'),
        variant: 'plain',
        fontSize: 30,
        radius: 42,
        onClick: () => void this.leaveTo('Level', { global: next.global }),
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
      .on('pointerup', () => {
        if (this.navigating) return;
        this.navigating = true;
        this.scene.start('LevelSelect', {
          // A daily clear has no ref and no chapter of its own: land the
          // player where the campaign actually stands, not on chapter 0.
          chapter:
            ref?.chapter ?? this.result.chapter ?? refByGlobal(progress.resumeGlobal())?.chapter ?? 0,
        });
      });

    this.time.delayedCall(240, () => confetti(this, width / 2, centreY, 54));
  }

  private buildStars(x: number, y: number): void {
    const sweep = this.result.stars === 3;
    for (let i = 0; i < 3; i++) {
      const earned = i < this.result.stars;
      const g = this.add.graphics();
      drawStar(g, 0, 0, 34, earned ? COLORS.amber : 0x3a3d48, true);
      const sx = x + (i - 1) * 88;
      const sy = y - (i === 1 ? 14 : 0);
      g.setPosition(sx, sy);

      if (earned) {
        g.setScale(0);
        this.tweens.add({
          targets: g,
          scale: 1,
          duration: 700,
          delay: 300 + 200 * i,
          // Elastic needs the extra length to actually read as a spring,
          // where Back's overshoot was over almost before it started.
          ease: 'Elastic.easeOut',
          // Only the third star of a full sweep gets the payoff burst.
          onComplete: i === 2 && sweep ? () => burstShapes(this, sx, sy) : undefined,
        });
      }
    }
  }

  /**
   * The special's payout, in the stars' slot: the one-off reward when it was
   * actually granted this run (a repeat clear pays 0 and says nothing), and
   * for the daily the streak line underneath.
   */
  private buildSpecialResult(x: number, y: number): void {
    const reward = this.result.reward ?? 0;
    const lines: string[] = [];
    if (reward > 0) {
      lines.push(this.result.special === 'boss' ? t('bossReward', reward) : t('dailyReward', reward));
    }
    if (this.result.special === 'daily') lines.push(t('dailyStreak', this.result.streak ?? 0));

    lines.forEach((line, i) => {
      const rewardLine = reward > 0 && i === 0;
      const text = this.add
        .text(x, y + i * 42 - (lines.length - 1) * 21, line, {
          fontFamily: FONT,
          fontSize: rewardLine ? '30px' : '22px',
          color: hex(rewardLine ? COLORS.amber : 0x8d93a3),
          fontStyle: '800',
        })
        .setOrigin(0.5);
      text.setScale(0);
      this.tweens.add({
        targets: text,
        scale: 1,
        duration: 420,
        delay: 300 + 160 * i,
        ease: 'Back.easeOut',
      });
    });
  }

  /**
   * Every way onward funnels through here: one latch guards the double-tap,
   * and the interstitial cadence is the same whether the destination is the
   * next level or - after a special - the menu.
   */
  private async leaveTo(scene: string, payload?: object): Promise<void> {
    if (this.navigating) return;
    this.navigating = true;
    if (this.showAdOnNext) {
      this.showAdOnNext = false;
      await getSdk().showInterstitial();
    }
    this.scene.start(scene, payload);
  }
}
