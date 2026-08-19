/**
 * Coin shop: arrow skins and board themes, one tab each.
 *
 * Every row repaints through a full scene.restart - a purchase or selection
 * changes global state (ARROW_INK, the live palette, the purse), and piecemeal
 * repaints of that have already gone wrong once in LevelSelect's tabs.
 */
import Phaser from 'phaser';
import {
  ARROW_SKINS,
  CHAPTER_PALETTES,
  COLORS,
  FONT,
  RADIUS,
  applyArrowSkin,
  applyChapterPalette,
  columnBounds,
  hex,
  type ArrowSkin,
} from '../theme';
import {
  Button,
  CoinButton,
  IconButton,
  addTitle,
  ambientBackdrop,
  coinChip,
  drawCard,
  drawPolyArrow,
  drawShadow,
  iconBack,
  setCenteredHitArea,
} from '../ui';
import { progress, THEME_PRICE } from '../progress';
import { refByGlobal } from '../levels';
import { DIRS, DX, DY } from '../../core/types';
import { chapterName, t, type Key } from '../i18n';
import { playSound } from '../audio';

type ShopTab = 'skins' | 'themes';
const TABS: ShopTab[] = ['skins', 'themes'];

const ROW_H = 118;
const ROW_GAP = 16;
const ROWS_TOP = 222;
/** Action slot (buy / select / selected) shared by every row. */
const ACTION_W = 160;
const ACTION_H = 54;

/**
 * Swatch fallbacks for palette 0, which overrides nothing. theme.ts keeps its
 * BASE_COLORS private and the live COLORS may already be re-skinned by the
 * time the shop draws, so the four preview hues are mirrored here.
 */
const SWATCH_BASE = { bg: 0xeef2f8, accent: 0x3b4acb, ink: 0x14161f, amber: 0xf5a524 } as const;

export class ShopScene extends Phaser.Scene {
  private tab: ShopTab = 'skins';
  private tabs: Array<{ bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }> = [];

  constructor() {
    super('Shop');
  }

  init(data: { tab?: ShopTab }): void {
    this.tab = data?.tab === 'themes' ? 'themes' : 'skins';
    this.tabs = [];
    // Same chapter the menu wears; applyChapterPalette honours themeChoice.
    applyChapterPalette(refByGlobal(progress.resumeGlobal())?.chapter ?? 0);
  }

  create(): void {
    const { width } = this.cameras.main;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    ambientBackdrop(this, 9);

    new IconButton(this, {
      x: 58,
      y: 58,
      size: 52,
      fill: COLORS.card,
      icon: iconBack,
      onClick: () => this.scene.start('Menu'),
    });

    addTitle(this, 62, t('shop'), 38).setLetterSpacing(4);

    // Balance pinned to the right edge; the chip is left-anchored and measures
    // itself, so it is placed after construction.
    const chip = coinChip(this, 0, 58, progress.coins, 44);
    chip.setX(width - 24 - chip.width);

    this.buildTabs(150);

    if (this.tab === 'skins') this.renderSkins();
    else this.renderThemes();
  }

  private buildTabs(y: number): void {
    const { width } = this.cameras.main;
    const column = columnBounds(width);
    const gap = 10;
    const tabWidth = Math.floor((column.width - gap * (TABS.length - 1)) / TABS.length);
    const startX = column.x + tabWidth / 2;

    TABS.forEach((tab, index) => {
      const container = this.add.container(startX + index * (tabWidth + gap), y);
      const bg = this.add.graphics();
      container.add(bg);

      const text = this.add
        .text(0, 0, t(tab === 'skins' ? 'skinsTab' : 'themesTab'), {
          fontFamily: FONT,
          fontSize: '21px',
          color: hex(COLORS.inkSoft),
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      container.add(text);

      setCenteredHitArea(container, tabWidth, 56);
      container.on('pointerup', () => {
        if (this.tab === tab) return;
        // A tab is a whole re-skin, so rebuild rather than repaint piecemeal.
        this.scene.restart({ tab });
      });

      this.tabs.push({ bg, text });
    });

    this.paintTabs(tabWidth);
  }

  private paintTabs(tabWidth: number): void {
    const half = tabWidth / 2;
    this.tabs.forEach((tab, index) => {
      const active = TABS[index] === this.tab;
      tab.bg.clear();
      if (active) drawShadow(tab.bg, -half, -28, tabWidth, 56, RADIUS.pill, 5, 2);
      tab.bg.fillStyle(active ? COLORS.accent : COLORS.accentSoft, 1);
      tab.bg.fillRoundedRect(-half, -28, tabWidth, 56, RADIUS.pill);
      tab.text.setColor(hex(active ? COLORS.card : COLORS.inkSoft));
    });
  }

  // ------------------------------------------------------------------ skins

  private renderSkins(): void {
    const column = columnBounds(this.cameras.main.width);
    ARROW_SKINS.forEach((skin, index) => {
      this.buildSkinRow(column.x, ROWS_TOP + index * (ROW_H + ROW_GAP), column.width, skin);
    });
  }

  private buildSkinRow(x: number, y: number, width: number, skin: ArrowSkin): void {
    const midY = y + ROW_H / 2;
    const card = this.add.graphics();
    drawCard(card, x, y, width, ROW_H, RADIUS.card);

    // Compass preview: one dart per direction, each in the skin's own ink, so
    // the row shows exactly what the board will look like.
    const preview = this.add.graphics();
    const cx = x + 70;
    for (const dir of DIRS) {
      const ux = DX[dir];
      const uy = DY[dir];
      drawPolyArrow(
        preview,
        [
          { x: cx + ux * 20, y: midY + uy * 20 },
          { x: cx + ux * 5, y: midY + uy * 5 },
        ],
        6,
        skin.ink[dir],
        dir,
        30,
      );
    }

    this.add
      .text(x + 130, midY, t(skin.nameKey as Key), {
        fontFamily: FONT,
        fontSize: '25px',
        color: hex(COLORS.ink),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const actionX = x + width - 24 - ACTION_W / 2;
    const owned = skin.price === 0 || progress.hasSkin(skin.id);

    if (progress.skin === skin.id) {
      this.selectedPill(actionX, midY);
    } else if (owned) {
      new Button(this, {
        x: actionX,
        y: midY,
        width: ACTION_W,
        height: ACTION_H,
        label: t('select'),
        variant: 'primary',
        fontSize: 20,
        onClick: () => {
          progress.selectSkin(skin.id);
          applyArrowSkin(skin.id);
          playSound(this, 'tap');
          this.scene.restart({ tab: this.tab });
        },
      });
    } else {
      new CoinButton(this, {
        x: actionX,
        y: midY,
        width: ACTION_W,
        height: ACTION_H,
        price: skin.price,
        balance: progress.coins,
        fontSize: 24,
        onClick: () => {
          if (!progress.buySkin(skin.id, skin.price)) return;
          applyArrowSkin(skin.id);
          playSound(this, 'tap');
          this.scene.restart({ tab: this.tab });
        },
      });
    }
  }

  // ----------------------------------------------------------------- themes

  private renderThemes(): void {
    const column = columnBounds(this.cameras.main.width);
    this.buildAutoRow(column.x, ROWS_TOP, column.width);
    CHAPTER_PALETTES.forEach((_palette, index) => {
      this.buildThemeRow(column.x, ROWS_TOP + (index + 1) * (ROW_H + ROW_GAP), column.width, index);
    });
  }

  /** "Auto" follows the chapter, so its preview is all three accents at once. */
  private buildAutoRow(x: number, y: number, width: number): void {
    const midY = y + ROW_H / 2;
    const card = this.add.graphics();
    drawCard(card, x, y, width, ROW_H, RADIUS.card);

    const preview = this.add.graphics();
    const cx = x + 70;
    CHAPTER_PALETTES.forEach((palette, index) => {
      const px = cx + (index === 0 ? -18 : index === 1 ? 18 : 0);
      const py = midY + (index === 2 ? 15 : -9);
      preview.fillStyle(palette.accent ?? SWATCH_BASE.accent, 1);
      preview.fillCircle(px, py, 13);
    });

    this.add
      .text(x + 130, midY, t('autoTheme'), {
        fontFamily: FONT,
        fontSize: '25px',
        color: hex(COLORS.ink),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const actionX = x + width - 24 - ACTION_W / 2;
    if (progress.themeChoice === -1) {
      this.selectedPill(actionX, midY);
      return;
    }
    new Button(this, {
      x: actionX,
      y: midY,
      width: ACTION_W,
      height: ACTION_H,
      label: t('select'),
      variant: 'primary',
      fontSize: 20,
      onClick: () => {
        progress.setThemeChoice(-1);
        playSound(this, 'tap');
        this.scene.restart({ tab: this.tab });
      },
    });
  }

  private buildThemeRow(x: number, y: number, width: number, palette: number): void {
    const midY = y + ROW_H / 2;
    const card = this.add.graphics();
    drawCard(card, x, y, width, ROW_H, RADIUS.card);

    // 2x2 swatch grid: bg / accent / ink / amber, the four voices of a palette.
    const entry = CHAPTER_PALETTES[palette] ?? {};
    const swatches = [
      entry.bg ?? SWATCH_BASE.bg,
      entry.accent ?? SWATCH_BASE.accent,
      entry.ink ?? SWATCH_BASE.ink,
      entry.amber ?? SWATCH_BASE.amber,
    ];
    const preview = this.add.graphics();
    const cx = x + 70;
    swatches.forEach((color, index) => {
      const sx = cx + (index % 2 === 0 ? -15 : 15) - 13;
      const sy = midY + (index < 2 ? -15 : 15) - 13;
      preview.fillStyle(color, 1);
      preview.fillRoundedRect(sx, sy, 26, 26, 7);
      // The bg swatch is near-white on a white card: give every square the
      // same hairline so the pale one does not vanish.
      preview.lineStyle(2, COLORS.dot, 1);
      preview.strokeRoundedRect(sx, sy, 26, 26, 7);
    });

    this.add
      .text(x + 130, midY, chapterName(palette), {
        fontFamily: FONT,
        fontSize: '25px',
        color: hex(COLORS.ink),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const actionX = x + width - 24 - ACTION_W / 2;
    const owned = palette === 0 || progress.hasTheme(palette);

    if (progress.themeChoice === palette) {
      this.selectedPill(actionX, midY);
    } else if (owned) {
      new Button(this, {
        x: actionX,
        y: midY,
        width: ACTION_W,
        height: ACTION_H,
        label: t('select'),
        variant: 'primary',
        fontSize: 20,
        onClick: () => {
          progress.setThemeChoice(palette);
          playSound(this, 'tap');
          this.scene.restart({ tab: this.tab });
        },
      });
    } else {
      new CoinButton(this, {
        x: actionX,
        y: midY,
        width: ACTION_W,
        height: ACTION_H,
        price: THEME_PRICE,
        balance: progress.coins,
        fontSize: 24,
        onClick: () => {
          // buyTheme both owns and wears the palette, so the restart below is
          // all it takes for the player to see what they paid for.
          if (!progress.buyTheme(palette, THEME_PRICE)) return;
          playSound(this, 'tap');
          this.scene.restart({ tab: this.tab });
        },
      });
    }
  }

  // ------------------------------------------------------------------ bits

  /** The current pick: an inert accent-rimmed pill where the button would be. */
  private selectedPill(x: number, y: number): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.accentSoft, 1);
    g.fillRoundedRect(x - ACTION_W / 2, y - ACTION_H / 2, ACTION_W, ACTION_H, RADIUS.pill);
    g.lineStyle(2.5, COLORS.accent, 1);
    g.strokeRoundedRect(x - ACTION_W / 2, y - ACTION_H / 2, ACTION_W, ACTION_H, RADIUS.pill);

    this.add
      .text(x, y, t('selected'), {
        fontFamily: FONT,
        fontSize: '18px',
        color: hex(COLORS.accent),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }
}
