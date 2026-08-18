/**
 * Gameplay. Tap an arrow whose head has a clear path to the edge and the whole
 * body flies off, the tail unwinding along the exact route the head took. Tap
 * a blocked one and it wiggles and costs a heart.
 */
import Phaser from 'phaser';
import type { Arrow, Cell, Board } from '../../core/types';
import { DX, DY, arrowCells } from '../../core/types';
import { blockerOf, freeArrows, isFree } from '../../core/rules';
import { parseLevel } from '../../core/format';
import { COLORS, FONT, RADIUS, hex } from '../theme';
import {
  Button,
  IconButton,
  confetti,
  drawArrowMark,
  drawCard,
  drawDotGrid,
  drawHand,
  drawHeart,
  drawPolyArrow,
  iconMagnifier,
  iconBack,
  iconRestart,
  iconUndo,
  rippleRing,
  toast,
} from '../ui';
import { playSound } from '../audio';
import { progress } from '../progress';
import { refByGlobal, type LevelRef } from '../levels';
import { t } from '../i18n';
import { getSdk } from '../../sdk/sdk';

interface ArrowView {
  arrow: Arrow;
  /** Anchored on the head cell centre; the polyline is drawn relative to it. */
  container: Phaser.GameObjects.Container;
  gfx: Phaser.GameObjects.Graphics;
  /** One invisible tap target per occupied cell. */
  zones: Phaser.GameObjects.Zone[];
}

const FLIGHT_MS = 350;
const MAX_HEARTS = 3;

const HUD_Y = 132;
const HUD_HEIGHT = 88;
const TOOLBAR_Y = 1190;
const TOOLBAR_SIZE = 56;

/** Clear air between the board and the two bars that bracket it. */
const BOARD_GAP = 24;
/** Side margin for the grid itself; the card's padding eats into it. */
const BOARD_MARGIN = 56;
const BOARD_PAD = 22;

/** The rect the grid is centred inside, on both axes. */
const BOARD_TOP = HUD_Y + HUD_HEIGHT / 2 + BOARD_GAP;
const BOARD_BOTTOM = TOOLBAR_Y - TOOLBAR_SIZE / 2 - BOARD_GAP;

export class LevelScene extends Phaser.Scene {
  private ref!: LevelRef;
  private board!: Board;

  private cell = 64;
  private originX = 0;
  private originY = 0;
  private lineWidth = 8;

  private views = new Map<number, ArrowView>();
  private history: Arrow[] = [];
  private hintsUsed = 0;
  private undosUsed = 0;
  private hearts = MAX_HEARTS;
  private hintFreeSpent = false;
  private undoFreeSpent = false;
  private busy = false;
  private finished = false;
  private failed = false;

  private boardLayer!: Phaser.GameObjects.Container;
  private arrowLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private overlayLayer: Phaser.GameObjects.Container | null = null;
  private tutorial: Phaser.GameObjects.Container | null = null;

  private counter!: Phaser.GameObjects.Text;
  private heartLayer!: Phaser.GameObjects.Container;
  private hearts3: Phaser.GameObjects.Graphics[] = [];
  private totalArrows = 0;
  private undoButton!: IconButton;
  private hintButton!: IconButton;

  constructor() {
    super('Level');
  }

  init(data: { global?: number }): void {
    const ref = refByGlobal(data?.global ?? 0) ?? refByGlobal(0);
    if (!ref) throw new Error('LevelScene: level pack is empty');
    this.ref = ref;

    this.views = new Map();
    this.history = [];
    this.hearts3 = [];
    this.hintsUsed = 0;
    this.undosUsed = 0;
    this.hearts = MAX_HEARTS;
    this.hintFreeSpent = false;
    this.undoFreeSpent = false;
    this.busy = false;
    this.finished = false;
    this.failed = false;
    this.overlayLayer = null;
    this.tutorial = null;
  }

  create(): void {
    const { width } = this.cameras.main;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.board = parseLevel(this.ref.data);
    this.totalArrows = this.board.arrows.length;
    this.computeLayout();

    this.boardLayer = this.add.container(0, 0);
    this.arrowLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0).setDepth(50);

    this.drawBoard();
    this.spawnArrows();
    this.buildHud(width);
    this.buildToolbar(width);

    if (this.ref.global === 0 && progress.needsTutorial()) {
      this.time.delayedCall(420, () => this.showTutorial());
    }

    getSdk().gameplayStart();
    this.events.once('shutdown', () => getSdk().gameplayStop());
  }

  // ---------------------------------------------------------------- layout

  private computeLayout(): void {
    const { width } = this.cameras.main;
    const availWidth = width - BOARD_MARGIN * 2;
    const availHeight = BOARD_BOTTOM - BOARD_TOP;

    this.cell = Math.floor(Math.min(availWidth / this.board.w, availHeight / this.board.h));
    this.lineWidth = Math.max(6, this.cell * 0.12);

    const boardWidth = this.cell * this.board.w;
    const boardHeight = this.cell * this.board.h;

    // Centred on both axes of the rect, not just horizontally.
    this.originX = (width - boardWidth) / 2;
    this.originY = BOARD_TOP + (availHeight - boardHeight) / 2;
  }

  private cellCenter(cell: Cell): { x: number; y: number } {
    return {
      x: this.originX + cell.x * this.cell + this.cell / 2,
      y: this.originY + cell.y * this.cell + this.cell / 2,
    };
  }

  private boardCenter(): { x: number; y: number } {
    return {
      x: this.originX + (this.cell * this.board.w) / 2,
      y: this.originY + (this.cell * this.board.h) / 2,
    };
  }

  private drawBoard(): void {
    const boardWidth = this.cell * this.board.w;
    const boardHeight = this.cell * this.board.h;

    const g = this.add.graphics();
    drawCard(
      g,
      this.originX - BOARD_PAD,
      this.originY - BOARD_PAD,
      boardWidth + BOARD_PAD * 2,
      boardHeight + BOARD_PAD * 2,
      RADIUS.card + 4,
    );
    drawDotGrid(g, this.originX, this.originY, this.board.w, this.board.h, this.cell);

    this.boardLayer.add(g);
  }

  // ---------------------------------------------------------------- arrows

  /** Polyline points in scene space: head first, then each tail cell. */
  private bodyPoints(arrow: Arrow): Array<{ x: number; y: number }> {
    return arrowCells(arrow).map((c) => this.cellCenter(c));
  }

  private spawnArrows(): void {
    for (const arrow of this.board.arrows) this.spawnArrow(arrow, false);
  }

  private spawnArrow(arrow: Arrow, animateIn: boolean): void {
    const points = this.bodyPoints(arrow);
    const origin = points[0]!;

    const container = this.add.container(origin.x, origin.y);
    const gfx = this.add.graphics();
    container.add(gfx);
    this.arrowLayer.add(container);

    const view: ArrowView = { arrow, container, gfx, zones: [] };
    this.paint(view, COLORS.ink);

    // One tap target per occupied cell: arrows never share a cell, so this is
    // exact and needs no custom hit testing.
    for (const c of arrowCells(arrow)) {
      const centre = this.cellCenter(c);
      const zone = this.add.zone(centre.x, centre.y, this.cell, this.cell).setOrigin(0.5);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.onTap(view));
      view.zones.push(zone);
    }

    this.views.set(arrow.id, view);

    if (animateIn) {
      container.setScale(0.4);
      container.setAlpha(0);
      this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    }
  }

  /** Redraw an arrow at rest, in `color`. */
  private paint(view: ArrowView, color: number): void {
    const origin = this.cellCenter(view.arrow.head);
    const local = this.bodyPoints(view.arrow).map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
    view.gfx.clear();
    drawPolyArrow(view.gfx, local, this.lineWidth, color, view.arrow.dir, this.cell);
  }

  // ----------------------------------------------------------------- input

  private onTap(view: ArrowView): void {
    if (this.busy || this.finished || this.failed) return;
    if (!this.views.has(view.arrow.id)) return;

    if (isFree(view.arrow, this.board, this.board.w, this.board.h)) {
      this.launch(view);
    } else {
      this.reject(view);
    }
  }

  /**
   * Fly the arrow out. Every point of the body walks the same track - reversed
   * body, then the head's ray beyond the edge - offset by its distance behind
   * the head, so the tail unwinds through exactly the corners the head took.
   */
  private launch(view: ArrowView): void {
    const arrow = view.arrow;

    playSound(this, 'tap');
    playSound(this, 'slide');

    this.board.arrows = this.board.arrows.filter((a) => a.id !== arrow.id);
    this.views.delete(arrow.id);
    this.history.push(arrow);
    for (const zone of view.zones) zone.destroy();
    view.zones = [];

    this.undoButton.setEnabled(true);
    this.updateCounter(true);
    this.dismissTutorial();

    const body = this.bodyPoints(arrow);
    const origin = body[0]!;
    rippleRing(this, origin.x, origin.y, this.cell * 0.42, COLORS.accent, this.fxLayer);

    // Track: tail tip -> ... -> head -> off the edge.
    const dx = DX[arrow.dir];
    const dy = DY[arrow.dir];
    const cellsToEdge =
      dx !== 0
        ? dx > 0
          ? this.board.w - arrow.head.x
          : arrow.head.x + 1
        : dy > 0
          ? this.board.h - arrow.head.y
          : arrow.head.y + 1;

    const track = body.slice().reverse();
    track.push({ x: origin.x + dx * cellsToEdge * this.cell, y: origin.y + dy * cellsToEdge * this.cell });

    const cum = [0];
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1]!;
      const b = track[i]!;
      cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = cum[cum.length - 1]!;
    const headIndex = body.length - 1;

    this.paint(view, COLORS.accent);

    // Arc length of the body itself. It never changes: the arrow is a rigid
    // ribbon that slides along the track, exactly like a snake.
    const bodyLength = cum[headIndex]!;

    const state = { offset: 0 };
    this.tweens.add({
      targets: state,
      offset: total + this.cell * 3,
      duration: FLIGHT_MS,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        // Take the WHOLE slice of the track the body currently covers, corner
        // vertices included. Sampling only the original cell centres would
        // chord across each bend and the arrow would come out skewed.
        const shape = this.pathSlice(track, cum, state.offset, state.offset + bodyLength, dx, dy);
        shape.reverse(); // pathSlice runs tail -> head; the renderer wants head first.

        view.gfx.clear();
        drawPolyArrow(
          view.gfx,
          shape.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
          this.lineWidth,
          COLORS.accent,
          arrow.dir,
          this.cell,
        );
      },
      onComplete: () => {
        view.container.destroy();
        this.checkWin();
      },
    });
  }

  /**
   * The stretch of `points` between two arc lengths, as a polyline.
   *
   * Both ends are interpolated, and every track vertex in between is kept - so
   * a body crossing a corner still bends at exactly that corner instead of
   * cutting the chord across it.
   */
  private pathSlice(
    points: Array<{ x: number; y: number }>,
    cum: number[],
    from: number,
    to: number,
    dx: number,
    dy: number,
  ): Array<{ x: number; y: number }> {
    const out = [this.samplePath(points, cum, from, dx, dy)];
    for (let i = 0; i < cum.length; i++) {
      const at = cum[i]!;
      if (at > from && at < to) out.push(points[i]!);
    }
    out.push(this.samplePath(points, cum, to, dx, dy));
    return out;
  }

  /** Point `distance` along the polyline, extrapolating straight past the end. */
  private samplePath(
    points: Array<{ x: number; y: number }>,
    cum: number[],
    distance: number,
    dx: number,
    dy: number,
  ): { x: number; y: number } {
    const first = points[0]!;
    if (distance <= 0) return first;

    const total = cum[cum.length - 1]!;
    if (distance >= total) {
      const last = points[points.length - 1]!;
      const over = distance - total;
      return { x: last.x + dx * over, y: last.y + dy * over };
    }

    for (let i = 1; i < cum.length; i++) {
      if (distance <= cum[i]!) {
        const span = cum[i]! - cum[i - 1]!;
        const t = span === 0 ? 0 : (distance - cum[i - 1]!) / span;
        const a = points[i - 1]!;
        const b = points[i]!;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return points[points.length - 1]!;
  }

  private reject(view: ArrowView): void {
    playSound(this, 'error');
    this.cameras.main.shake(120, 0.006);

    const sdk = getSdk();
    if (sdk.supportsVibration) sdk.vibrate(80);

    this.paint(view, COLORS.danger);
    this.time.delayedCall(220, () => {
      if (this.views.has(view.arrow.id)) this.paint(view, COLORS.ink);
    });

    // Wiggle +-4 degrees around the head.
    this.tweens.add({
      targets: view.container,
      angle: { from: -4, to: 4 },
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => view.container.setAngle(0),
    });

    const blocker = blockerOf(view.arrow, this.board, this.board.w, this.board.h);
    const blockerView = blocker ? this.views.get(blocker.id) : undefined;
    if (blockerView) {
      this.tweens.add({
        targets: blockerView.container,
        scale: 1.08,
        duration: 120,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    this.loseHeart();
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(width: number): void {
    new IconButton(this, {
      x: 58,
      y: 52,
      size: 48,
      fill: COLORS.card,
      icon: iconBack,
      onClick: () => this.scene.start('LevelSelect', { chapter: this.ref.chapter }),
    });

    const pillWidth = 600;
    const pillX = (width - pillWidth) / 2;
    const pill = this.add.graphics();
    drawCard(pill, pillX, HUD_Y - HUD_HEIGHT / 2, pillWidth, HUD_HEIGHT, RADIUS.pill + 4);

    // ---- left: arrows extracted so far ----------------------------------
    const mark = this.add.graphics();
    drawArrowMark(mark, 18, COLORS.accent);
    mark.setPosition(pillX + 40, HUD_Y);

    this.counter = this.add
      .text(pillX + 62, HUD_Y, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: hex(COLORS.ink),
        fontStyle: '800',
      })
      .setOrigin(0, 0.5);
    this.updateCounter(false);

    // ---- centre: level number -------------------------------------------
    this.add
      .text(width / 2, HUD_Y, `${t('levelShort')}${this.ref.data.id}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: hex(COLORS.ink),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // ---- right: hearts ---------------------------------------------------
    this.heartLayer = this.add.container(pillX + pillWidth - 96, HUD_Y);
    for (let i = 0; i < MAX_HEARTS; i++) {
      const g = this.add.graphics();
      drawHeart(g, 0, 0, 28, COLORS.pink);
      g.setPosition(i * 32, 0);
      this.heartLayer.add(g);
      this.hearts3.push(g);
    }
  }

  /** Counts arrows EXTRACTED, so a fresh level opens on "0/N". */
  private updateCounter(pop: boolean): void {
    const extracted = this.totalArrows - this.board.arrows.length;
    this.counter.setText(`${extracted}/${this.totalArrows}`);
    if (!pop) return;
    this.counter.setScale(1);
    this.tweens.add({
      targets: this.counter,
      scale: 1.3,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private loseHeart(): void {
    if (this.hearts <= 0) return;
    this.hearts--;

    const g = this.hearts3[this.hearts];
    if (g) {
      this.tweens.add({
        targets: g,
        scale: 0.1,
        alpha: 0,
        duration: 260,
        ease: 'Back.easeIn',
      });
    }

    if (this.hearts === 0) {
      this.time.delayedCall(320, () => this.showFailOverlay());
    }
  }

  private refillHearts(): void {
    this.hearts = MAX_HEARTS;
    for (const g of this.hearts3) {
      this.tweens.add({ targets: g, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    }
  }

  // ------------------------------------------------------------- toolbar

  private buildToolbar(width: number): void {
    const gap = 108;

    this.hintButton = new IconButton(this, {
      x: width / 2 - gap,
      y: TOOLBAR_Y,
      icon: iconMagnifier,
      caption: t('hint'),
      onClick: () => void this.onHint(),
    });

    this.undoButton = new IconButton(this, {
      x: width / 2,
      y: TOOLBAR_Y,
      icon: iconUndo,
      caption: t('undo'),
      enabled: false,
      onClick: () => void this.onUndo(),
    });

    new IconButton(this, {
      x: width / 2 + gap,
      y: TOOLBAR_Y,
      icon: iconRestart,
      caption: t('restart'),
      onClick: () => this.scene.restart({ global: this.ref.global }),
    });
  }

  /** Hint and undo are free once each per level, then cost a rewarded video. */
  private async payFor(kind: 'hint' | 'undo'): Promise<boolean> {
    const spent = kind === 'hint' ? this.hintFreeSpent : this.undoFreeSpent;
    if (!spent) {
      if (kind === 'hint') this.hintFreeSpent = true;
      else this.undoFreeSpent = true;
      this.refreshAdBadges();
      return true;
    }

    const granted = await getSdk().showRewarded();
    if (!granted) toast(this, t('adFailed'), COLORS.danger);
    return granted;
  }

  private refreshAdBadges(): void {
    this.hintButton.setBadge(this.hintFreeSpent ? 'AD' : undefined);
    this.undoButton.setBadge(this.undoFreeSpent ? 'AD' : undefined);
  }

  // ---------------------------------------------------------------- actions

  private async onUndo(): Promise<void> {
    if (this.busy || this.finished || this.failed || this.history.length === 0) return;
    this.busy = true;

    if (!(await this.payFor('undo'))) {
      this.busy = false;
      return;
    }

    const arrow = this.history.pop();
    if (arrow) {
      this.board.arrows.push(arrow);
      this.spawnArrow(arrow, true);
      this.undosUsed++;
      this.updateCounter(true);
      playSound(this, 'tap');
    }

    this.undoButton.setEnabled(this.history.length > 0);
    this.busy = false;
  }

  private async onHint(): Promise<void> {
    if (this.busy || this.finished || this.failed) return;

    const free = freeArrows(this.board, this.board.w, this.board.h);
    if (free.length === 0) {
      toast(this, t('noFreeArrow'));
      return;
    }

    this.busy = true;
    if (!(await this.payFor('hint'))) {
      this.busy = false;
      return;
    }

    this.hintsUsed++;
    this.highlight(free[0]!);
    this.busy = false;
  }

  private highlight(arrow: Arrow): void {
    const view = this.views.get(arrow.id);
    if (!view) return;

    const origin = this.cellCenter(arrow.head);
    const local = this.bodyPoints(arrow).map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));

    const ghost = this.add.graphics();
    drawPolyArrow(ghost, local, this.lineWidth + 8, COLORS.amber, arrow.dir, this.cell, 0.55);
    ghost.setPosition(origin.x, origin.y);
    this.fxLayer.add(ghost);

    this.tweens.add({
      targets: ghost,
      alpha: 0.15,
      duration: 420,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => ghost.destroy(),
    });
  }

  // -------------------------------------------------------------- tutorial

  private showTutorial(): void {
    if (this.finished || this.tutorial) return;
    const free = freeArrows(this.board, this.board.w, this.board.h);
    const target = free[0];
    if (!target) return;

    const at = this.cellCenter(target.head);
    const layer = this.add.container(at.x + this.cell * 0.34, at.y + this.cell * 0.44).setDepth(80);

    const hand = this.add.graphics();
    drawHand(hand, 58, COLORS.ink);
    layer.add(hand);

    const bubbleText = this.add
      .text(0, -96, t('tapHint'), {
        fontFamily: FONT,
        fontSize: '26px',
        color: hex(COLORS.card),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const bw = bubbleText.width + 40;
    const bubble = this.add.graphics();
    bubble.fillStyle(COLORS.accent, 1);
    bubble.fillRoundedRect(-bw / 2, -96 - 24, bw, 48, 24);
    bubble.fillTriangle(-10, -96 + 22, 10, -96 + 22, 0, -96 + 40);

    layer.add(bubble);
    layer.add(bubbleText);

    this.tweens.add({
      targets: layer,
      scale: 0.86,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.tutorial = layer;
  }

  private dismissTutorial(): void {
    if (!this.tutorial) return;
    const layer = this.tutorial;
    this.tutorial = null;
    progress.markTutorialDone();
    this.tweens.killTweensOf(layer);
    this.tweens.add({
      targets: layer,
      alpha: 0,
      scale: 0.5,
      duration: 200,
      onComplete: () => layer.destroy(),
    });
  }

  // ------------------------------------------------------------ fail state

  private showFailOverlay(): void {
    if (this.finished || this.overlayLayer) return;
    this.failed = true;
    getSdk().gameplayStop();

    const { width, height } = this.cameras.main;
    const layer = this.add.container(0, 0).setDepth(200);

    const dim = this.add.rectangle(width / 2, height / 2, width, height, COLORS.ink, 0.42);
    dim.setInteractive();
    layer.add(dim);

    const cardW = 520;
    const cardH = 340;
    const card = this.add.graphics();
    drawCard(card, (width - cardW) / 2, (height - cardH) / 2, cardW, cardH, RADIUS.card);
    layer.add(card);

    const centreY = height / 2;

    const brokenHeart = this.add.graphics();
    drawHeart(brokenHeart, width / 2, centreY - 96, 56, COLORS.danger, 0.9);
    layer.add(brokenHeart);

    layer.add(
      this.add
        .text(width / 2, centreY - 34, t('noHearts'), {
          fontFamily: FONT,
          fontSize: '36px',
          color: hex(COLORS.ink),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    layer.add(
      this.add
        .text(width / 2, centreY + 6, t('noHeartsSub'), {
          fontFamily: FONT,
          fontSize: '20px',
          color: hex(COLORS.inkSoft),
        })
        .setOrigin(0.5),
    );

    layer.add(
      new Button(this, {
        x: width / 2,
        y: centreY + 68,
        width: 400,
        height: 78,
        label: t('refill'),
        variant: 'primary',
        fontSize: 30,
        badge: 'AD',
        onClick: () => void this.onRefill(),
      }),
    );

    layer.add(
      new Button(this, {
        x: width / 2,
        y: centreY + 158,
        width: 400,
        height: 68,
        label: t('restart'),
        variant: 'plain',
        fontSize: 26,
        onClick: () => this.scene.restart({ global: this.ref.global }),
      }),
    );

    this.overlayLayer = layer;

    layer.setScale(0.9);
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private async onRefill(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    const granted = await getSdk().showRewarded();
    this.busy = false;

    if (!granted) {
      toast(this, t('adFailed'), COLORS.danger);
      return;
    }

    this.refillHearts();
    this.failed = false;
    const layer = this.overlayLayer;
    this.overlayLayer = null;
    if (layer) {
      this.tweens.add({
        targets: layer,
        alpha: 0,
        scale: 0.9,
        duration: 180,
        onComplete: () => layer.destroy(),
      });
    }
    getSdk().gameplayStart();
  }

  // -------------------------------------------------------------------- win

  private checkWin(): void {
    if (this.finished || this.board.arrows.length > 0) return;
    this.finished = true;

    getSdk().gameplayStop();
    playSound(this, 'win');

    const stars = this.hintsUsed === 0 && this.undosUsed === 0 ? 3 : this.hintsUsed + this.undosUsed <= 2 ? 2 : 1;

    this.time.delayedCall(300, () => {
      const centre = this.boardCenter();
      confetti(this, centre.x, centre.y, 52, this.fxLayer);
    });

    this.time.delayedCall(950, () => {
      this.scene.start('Win', {
        global: this.ref.global,
        stars,
        hints: this.hintsUsed,
        undos: this.undosUsed,
      });
    });
  }
}
