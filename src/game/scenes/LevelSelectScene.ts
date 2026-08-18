/** Chapter picker + 5x10 level grid with star counts and locks. */
import Phaser from 'phaser';
import { COLORS, FONT, RADIUS, applyChapterPalette, columnBounds, hex } from '../theme';
import { IconButton, addTitle, drawCard, drawShadow, drawStar, iconBack, iconLock, setCenteredHitArea, ambientBackdrop } from '../ui';
import { progress } from '../progress';
import { CHAPTERS, globalIndex } from '../levels';
import { chapterName, t } from '../i18n';

const COLS = 5;
const CELL = 84;
const GAP = 12;

export class LevelSelectScene extends Phaser.Scene {
  private chapter = 0;
  private gridLayer!: Phaser.GameObjects.Container;
  private tabs: Array<{ bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }> = [];
  private currentGlobal = 0;

  constructor() {
    super('LevelSelect');
  }

  init(data: { chapter?: number }): void {
    this.chapter = Math.min(Math.max(0, data?.chapter ?? this.lastPlayedChapter()), CHAPTERS.length - 1);
    this.tabs = [];
    this.currentGlobal = progress.resumeGlobal();
    applyChapterPalette(this.chapter);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    ambientBackdrop(this, this.chapter + 4);

    new IconButton(this, {
      x: 58,
      y: 58,
      size: 52,
      fill: COLORS.card,
      icon: iconBack,
      onClick: () => this.scene.start('Menu'),
    });

    addTitle(this, 62, t('levels'), 38).setLetterSpacing(4);

    this.buildTabs(150);

    this.gridLayer = this.add.container(0, 0);
    this.renderGrid();
  }

  private lastPlayedChapter(): number {
    const unlocked = Math.max(0, progress.data.unlocked - 1);
    let seen = 0;
    for (let c = 0; c < CHAPTERS.length; c++) {
      const size = CHAPTERS[c]?.levels.length ?? 0;
      if (unlocked < seen + size) return c;
      seen += size;
    }
    return CHAPTERS.length - 1;
  }

  private buildTabs(y: number): void {
    const { width } = this.cameras.main;
    const column = columnBounds(width);
    const gap = 10;
    const tabWidth = Math.floor((column.width - gap * (CHAPTERS.length - 1)) / CHAPTERS.length);
    const startX = column.x + tabWidth / 2;

    CHAPTERS.forEach((_chapter, index) => {
      const container = this.add.container(startX + index * (tabWidth + gap), y);
      const bg = this.add.graphics();
      container.add(bg);

      const text = this.add
        .text(0, 0, chapterName(index), {
          fontFamily: FONT,
          fontSize: '21px',
          color: hex(COLORS.inkSoft),
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      container.add(text);

      setCenteredHitArea(container, tabWidth, 56);
      container.on('pointerup', () => {
        if (this.chapter === index) return;
        // A tab is a whole re-skin, so rebuild rather than repaint piecemeal.
        this.scene.restart({ chapter: index });
      });

      this.tabs.push({ bg, text });
    });

    this.paintTabs(tabWidth);
  }

  private paintTabs(tabWidth: number): void {
    const half = tabWidth / 2;
    this.tabs.forEach((tab, index) => {
      const active = index === this.chapter;
      tab.bg.clear();
      if (active) drawShadow(tab.bg, -half, -28, tabWidth, 56, RADIUS.pill, 5, 2);
      tab.bg.fillStyle(active ? COLORS.accent : COLORS.accentSoft, 1);
      tab.bg.fillRoundedRect(-half, -28, tabWidth, 56, RADIUS.pill);
      tab.text.setColor(hex(active ? COLORS.card : COLORS.inkSoft));
    });
  }

  private renderGrid(): void {
    this.gridLayer.removeAll(true);

    const { width } = this.cameras.main;
    const chapter = CHAPTERS[this.chapter];
    if (!chapter) return;

    const rows = Math.ceil(chapter.levels.length / COLS);
    const gridWidth = COLS * CELL + (COLS - 1) * GAP;
    const gridHeight = rows * CELL + (rows - 1) * GAP;
    // Centred on the canvas, never anchored to a corner.
    const startX = (width - gridWidth) / 2;
    const startY = 222;

    const panel = this.add.graphics();
    drawCard(panel, startX - 22, startY - 22, gridWidth + 44, gridHeight + 44, RADIUS.card);
    this.gridLayer.add(panel);

    chapter.levels.forEach((level, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = startX + col * (CELL + GAP) + CELL / 2;
      const y = startY + row * (CELL + GAP) + CELL / 2;
      this.gridLayer.add(this.buildCell(x, y, index, level.id));
    });
  }

  private buildCell(x: number, y: number, index: number, displayId: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const unlocked = progress.isUnlocked(this.chapter, index);
    const stars = progress.stars(this.chapter, index);
    const isCurrent = unlocked && globalIndex(this.chapter, index) === this.currentGlobal;

    const bg = this.add.graphics();
    const fill = !unlocked ? COLORS.locked : isCurrent ? COLORS.accent : COLORS.card;
    if (unlocked) drawShadow(bg, -CELL / 2, -CELL / 2, CELL, CELL, RADIUS.tile, 5, 2);
    bg.fillStyle(fill, 1);
    bg.fillRoundedRect(-CELL / 2, -CELL / 2, CELL, CELL, RADIUS.tile);
    container.add(bg);

    if (!unlocked) {
      const lock = this.add.graphics();
      iconLock(lock, 22, COLORS.lockInk, 3.5);
      container.add(lock);
      return container;
    }

    container.add(
      this.add
        // Only ride up when there are stars underneath to make room for.
        .text(0, stars > 0 ? -9 : 0, String(displayId), {
          fontFamily: FONT,
          fontSize: '27px',
          color: hex(isCurrent ? COLORS.card : COLORS.ink),
          fontStyle: '800',
        })
        .setOrigin(0.5),
    );

    if (stars > 0) {
      const starsG = this.add.graphics();
      for (let s = 0; s < 3; s++) {
        drawStar(starsG, (s - 1) * 19, 22, 8, s < stars ? COLORS.amber : COLORS.locked, true);
      }
      container.add(starsG);
    }

    if (isCurrent) {
      // Soft pulse so the eye lands on "where I am" immediately.
      this.tweens.add({
        targets: container,
        scale: 1.06,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    setCenteredHitArea(container, CELL, CELL);
    container.on('pointerup', () => {
      this.scene.start('Level', { global: globalIndex(this.chapter, index) });
    });

    return container;
  }
}
