/** Sound toggle + language picker. Changing language restarts the scene. */
import Phaser from 'phaser';
import { COLORS, FONT, RADIUS, columnBounds, hex } from '../theme';
import { Button, IconButton, addTitle, drawCard, iconBack } from '../ui';
import { progress } from '../progress';
import { setSoundEnabled, playSound } from '../audio';
import { LANGS, LANG_NAMES, getLang, t } from '../i18n';
import { getSdk } from '../../sdk/sdk';

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create(): void {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    new IconButton(this, {
      x: 58,
      y: 58,
      size: 52,
      fill: COLORS.card,
      icon: iconBack,
      onClick: () => this.scene.start('Menu'),
    });

    addTitle(this, 62, t('settings'), 38).setLetterSpacing(4);

    const column = columnBounds(width);

    // ---- sound -----------------------------------------------------------
    const soundCard = this.add.graphics();
    drawCard(soundCard, column.x, 150, column.width, 108, RADIUS.card);

    this.add
      .text(column.x + 36, 204, t('sound'), {
        fontFamily: FONT,
        fontSize: '26px',
        color: hex(COLORS.ink),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    new Button(this, {
      x: column.x + column.width - 90,
      y: 204,
      width: 148,
      height: 64,
      label: progress.data.sound ? t('on') : t('off'),
      variant: progress.data.sound ? 'primary' : 'soft',
      fontSize: 24,
      onClick: () => {
        const next = !progress.data.sound;
        setSoundEnabled(this, next);
        if (next) playSound(this, 'tap');
        this.scene.restart();
      },
    });

    // ---- language --------------------------------------------------------
    this.add
      .text(width / 2, 312, t('language'), {
        fontFamily: FONT,
        fontSize: '24px',
        color: hex(COLORS.inkSoft),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const cols = 2;
    const cellH = 76;
    const gap = 18;
    const cellW = Math.floor((column.width - gap) / cols);
    const startX = column.x + cellW / 2;
    const startY = 376 + cellH / 2;

    LANGS.forEach((lang, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const active = getLang() === lang;
      new Button(this, {
        x: startX + col * (cellW + gap),
        y: startY + row * (cellH + gap),
        width: cellW,
        height: cellH,
        label: LANG_NAMES[lang],
        fontSize: 24,
        variant: active ? 'primary' : 'plain',
        onClick: () => {
          progress.setLanguage(lang);
          playSound(this, 'tap');
          this.scene.restart();
        },
      });
    });

    // ---- footer ----------------------------------------------------------
    this.add
      .text(width / 2, height - 118, getSdk().platform.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '15px',
        color: hex(COLORS.inkMuted),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(3);

    this.add
      .text(width / 2, height - 74, t('privacy'), {
        fontFamily: FONT,
        fontSize: '18px',
        color: hex(COLORS.inkSoft),
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        window.open(`${import.meta.env.BASE_URL}privacy.html`, '_blank', 'noopener');
      });
  }
}
