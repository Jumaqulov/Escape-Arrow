/**
 * Gameplay. Tap an arrow whose head has a clear path to the edge and the whole
 * body flies off, the tail unwinding along the exact route the head took. Tap
 * a blocked one and it wiggles and costs a heart.
 */
import Phaser from 'phaser';
import type { Arrow, Cell, Board } from '../../core/types';
import { DX, DY, arrowCells } from '../../core/types';
import { blockerOf, freeArrows, isFree, pathCells } from '../../core/rules';
import { parseLevel } from '../../core/format';
import { COLORS, DIR_INK, FONT, RADIUS, applyChapterPalette, darken, hex } from '../theme';
import {
  Button,
  CoinButton,
  IconButton,
  setCenteredHitArea,
  confetti,
  drawArrowMark,
  drawCard,
  drawDotGrid,
  drawHand,
  drawHeart,
  drawPolyArrow,
  drawPolyArrowGlow,
  drawStopMark,
  drawTimerArc,
  makeToolCursor,
  ambientBackdrop,
  popupLabel,
  trailDot,
  iconMagnifier,
  iconEraser,
  iconBack,
  iconUndo,
  iconZoomIn,
  iconZoomOut,
  iconGrid,
  drawCoin,
  drawClock,
  drawSoftPanel,
  coinChip,
  goldenBurst,
  iconClose,
  modalShell,
  popIn,
  slider,
  softRadial,
  toggleSwitch,
  iconGear,
  rippleRing,
  toast,
} from '../ui';
import { playSound, setSoundEnabled } from '../audio';
import { progress, TOOL_PACK, TOOL_PRICE, TOOL_UNLOCK_AT } from '../progress';
import type { Tool } from '../progress';
import { CHAPTERS, refByGlobal, type LevelRef } from '../levels';
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
const TOOLBAR_SIZE = 64;

/** Clear air between the board and the two bars that bracket it. */
const BOARD_GAP = 24;
/** Side margin for the grid itself; the card's padding eats into it. */
const BOARD_MARGIN = 56;
const BOARD_PAD = 22;

/** Cell size in WORLD space; the view scales, the board does not shrink. */
const WORLD_CELL = 48;
/** Movement past this many pixels counts as a pan, not a tap. */
const DRAG_THRESHOLD = 12;
/** Held longer than this and the press is a question about the arrow, not a move. */
const HOLD_MS = 150;
/**
 * Seconds on the clock: a floor plus an allowance per arrow.
 *
 * Generous is the same as absent - at 45s+5s/arrow a 46-arrow board ran four
 * and a half minutes and nobody ever saw the clock move. These numbers keep a
 * small board brisk and a dense one tight, and the ceiling stops the biggest
 * chapter-3 boards from handing back a timer that is pressure in name only.
 */
const TIME_BASE = 30;
const TIME_PER_ARROW = 2;
const TIME_MAX = 150;
/** Seconds a rewarded video buys back. */
const TIME_REFILL = 60;
/** Coins for the same rescue, for players who would rather not watch. */
const HEART_PRICE = 450;
/** Longest the whole board-intro cascade may take, in ms. */
const INTRO_MS = 700;
/** Below this the clock goes red and starts beating. */
const LOW_TIME = 10;
/** Longest the guideline grid may take to sweep in, in ms. */
const GRID_WAVE_MS = 600;

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
  private streak = 0;
  private bestStreak = 0;
  private undoFreeSpent = false;
  private busy = false;
  private finished = false;
  private failed = false;

  private world!: Phaser.GameObjects.Container;
  private worldScale = 1;
  private minScale = 0.4;
  private maxScale = 2.2;
  private secondsLeft = 0;
  /** Full-arc reference: what the clock read when the level opened. */
  private startSeconds = 0;
  private timerText!: Phaser.GameObjects.Text;
  private timerBg!: Phaser.GameObjects.Graphics;
  private timerLayer!: Phaser.GameObjects.Container;
  private timerPulse: Phaser.Tweens.Tween | null = null;
  private timedOut = false;
  private eraserArmed = false;
  private eraserBanner: Phaser.GameObjects.Container | null = null;
  private toolCursor: Phaser.GameObjects.Container | null = null;
  private gridOn = false;
  private gridLayer: Phaser.GameObjects.Container | null = null;
  private backdrop!: Phaser.GameObjects.Container;
  private coinText!: Phaser.GameObjects.Text;
  private toolButtons = new Map<Tool, IconButton>();
  private dragging = false;
  private dragMoved = 0;
  /** Ids of the arrows that can fly right now; drives the resting lift. */
  private freeIds = new Set<number>();
  private holdTimer: Phaser.Time.TimerEvent | null = null;
  private holdView: ArrowView | null = null;
  /** The hold already answered, so the release must not also launch. */
  private holdFired = false;
  /** Did the press that is being processed right now land on an arrow? */
  private holdPressed = false;
  private preview: Phaser.GameObjects.GameObject[] = [];
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
    applyChapterPalette(ref.chapter);

    this.views = new Map();
    this.history = [];
    this.hearts3 = [];
    this.freeIds = new Set();
    this.holdTimer = null;
    this.holdView = null;
    this.holdFired = false;
    this.holdPressed = false;
    this.preview = [];
    this.hintsUsed = 0;
    this.undosUsed = 0;
    this.hearts = MAX_HEARTS;
    this.streak = 0;
    this.bestStreak = 0;
    this.undoFreeSpent = false;
    this.busy = false;
    this.finished = false;
    this.failed = false;
    this.timedOut = false;
    this.eraserArmed = false;
    this.eraserBanner = null;
    this.toolCursor = null;
    this.timerPulse = null;
    this.gridOn = false;
    this.gridLayer = null;
    this.toolButtons = new Map();
    this.overlayLayer = null;
    this.tutorial = null;
  }

  create(): void {
    const { width } = this.cameras.main;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.board = parseLevel(this.ref.data);
    this.totalArrows = this.board.arrows.length;
    this.computeLayout();

    this.backdrop = ambientBackdrop(this, this.ref.global + 1);

    this.world = this.add.container(0, 0);
    this.boardLayer = this.add.container(0, 0);
    this.arrowLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0).setDepth(50);
    this.world.add([this.boardLayer, this.arrowLayer, this.fxLayer]);

    this.drawBoard();
    this.spawnArrows();
    this.refreshFreeLift();
    this.fitWorld();
    this.installCameraControls();
    this.buildHud(width);
    this.buildToolbar(width);

    this.secondsLeft = Math.min(TIME_MAX, TIME_BASE + this.totalArrows * TIME_PER_ARROW);
    this.startSeconds = this.secondsLeft;
    this.updateTimer();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickTimer() });

    // The opening two boards always coach; after that the player is on their own.
    if (this.ref.global <= 1) {
      this.time.delayedCall(420, () => this.showTutorial());
    }

    this.time.delayedCall(900, () => this.maybeShowZoomHint());

    const unlock = progress.pendingToolUnlock(this.ref.global);
    if (unlock) this.time.delayedCall(260, () => this.showToolUnlock(unlock));

    getSdk().gameplayStart();
    this.events.once('shutdown', () => getSdk().gameplayStop());

    // A hidden system cursor and a looping tween both outlive the scene if the
    // player leaves mid-level, so both are torn down by hand.
    this.events.once('shutdown', () => {
      this.input.setDefaultCursor('default');
      this.toolCursor?.destroy();
      this.toolCursor = null;
      this.stopTimerPulse();
      this.cancelHold();
    });
  }

  // ---------------------------------------------------------------- layout

  /**
   * The board is drawn at a fixed, comfortable cell size in WORLD space and
   * the whole world is then scaled to fit. A 20x26 board squeezed into 720px
   * would give 30px cells - too small to hit with a thumb - so the player
   * gets a zoom instead of a shrunken board.
   */
  private computeLayout(): void {
    this.cell = WORLD_CELL;
    this.lineWidth = Math.max(6, this.cell * 0.12);
    this.originX = 0;
    this.originY = 0;
  }

  private viewRect(): { x: number; y: number; width: number; height: number } {
    const { width } = this.cameras.main;
    return {
      x: BOARD_MARGIN,
      y: BOARD_TOP,
      width: width - BOARD_MARGIN * 2,
      height: BOARD_BOTTOM - BOARD_TOP,
    };
  }

  private worldSize(): { w: number; h: number } {
    return {
      w: this.cell * this.board.w + BOARD_PAD * 2,
      h: this.cell * this.board.h + BOARD_PAD * 2,
    };
  }

  /** Zoom out until the whole board is on screen, then centre it. */
  private fitWorld(): void {
    const view = this.viewRect();
    const size = this.worldSize();
    const fit = Math.min(view.width / size.w, view.height / size.h);

    this.minScale = fit * 0.9;
    this.maxScale = Math.max(1.6, fit * 3);
    this.worldScale = fit;
    this.applyWorld(
      view.x + (view.width - size.w * fit) / 2 + BOARD_PAD * fit,
      view.y + (view.height - size.h * fit) / 2 + BOARD_PAD * fit,
    );
  }

  /**
   * `x`/`y` are the scene position of the GRID ORIGIN, not of a centre, so the
   * clamp works on the card's real edges. An axis the board already fits on is
   * pinned dead centre; only an axis that overflows can be panned, and only as
   * far as its own edge.
   */
  private applyWorld(x: number, y: number): void {
    const view = this.viewRect();
    const size = this.worldSize();
    const w = size.w * this.worldScale;
    const h = size.h * this.worldScale;
    const pad = BOARD_PAD * this.worldScale;

    let left = x - pad;
    let top = y - pad;

    left =
      w <= view.width
        ? view.x + (view.width - w) / 2
        : Phaser.Math.Clamp(left, view.x + view.width - w, view.x);
    top =
      h <= view.height
        ? view.y + (view.height - h) / 2
        : Phaser.Math.Clamp(top, view.y + view.height - h, view.y);

    this.world.setScale(this.worldScale);
    this.world.setPosition(left + pad, top + pad);
  }

  /** Zoom about a screen point, keeping whatever is under it in place. */
  private zoomBy(factor: number, pivotX?: number, pivotY?: number): void {
    const view = this.viewRect();
    const px = pivotX ?? view.x + view.width / 2;
    const py = pivotY ?? view.y + view.height / 2;

    const next = Phaser.Math.Clamp(this.worldScale * factor, this.minScale, this.maxScale);
    if (next === this.worldScale) return;

    const ratio = next / this.worldScale;
    this.worldScale = next;
    this.applyWorld(px - (px - this.world.x) * ratio, py - (py - this.world.y) * ratio);
  }

  private installCameraControls(): void {
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomBy(dy > 0 ? 0.88 : 1.14, _p.x, _p.y);
    });

    this.input.on('pointerdown', () => {
      // Zone handlers run before this one, so a press that reached none of
      // them started no hold - and must clear whatever a gesture that never
      // got its release (alt-tab, a finger lifted off-canvas) left behind.
      if (!this.holdPressed) this.cancelHold();
      this.holdPressed = false;
      this.dragging = true;
      this.dragMoved = 0;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !pointer.isDown) return;
      const dx = pointer.x - pointer.prevPosition.x;
      const dy = pointer.y - pointer.prevPosition.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.dragMoved < DRAG_THRESHOLD) return;
      // Panning across an arrow is neither a tap nor a question about it.
      this.cancelHold();
      const k = progress.dragSensitivity;

      // Parallax off the world's REAL displacement, not the raw drag: at an
      // edge the clamp swallows the pan, and a backdrop that kept sliding
      // there would look detached from the board.
      const wasX = this.world.x;
      const wasY = this.world.y;
      this.applyWorld(this.world.x + dx * k, this.world.y + dy * k);
      this.backdrop.x += (this.world.x - wasX) * 0.25;
      this.backdrop.y += (this.world.y - wasY) * 0.25;
    });

    // Its own listener rather than a line in the pan handler above: that one
    // bails out on every move that is not a drag, which is most of them.
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.toolCursor?.setPosition(pointer.x, pointer.y);
    });

    // The gesture is resolved here rather than on the zone, so a release that
    // slipped a few pixels off the arrow still counts as the press it began.
    this.input.on('pointerup', () => {
      this.dragging = false;
      this.endHold();
    });

    // Released off the canvas: the gesture is over, but it resolved nowhere.
    this.input.on('pointerupoutside', () => {
      this.dragging = false;
      this.cancelHold();
    });
  }

  private cellCenter(cell: Cell): { x: number; y: number } {
    return {
      x: this.originX + cell.x * this.cell + this.cell / 2,
      y: this.originY + cell.y * this.cell + this.cell / 2,
    };
  }

  /** Is this scene point still inside the board card? */
  private overBoard(x: number, y: number): boolean {
    return (
      x >= this.originX - BOARD_PAD &&
      x <= this.originX + this.cell * this.board.w + BOARD_PAD &&
      y >= this.originY - BOARD_PAD &&
      y <= this.originY + this.cell * this.board.h + BOARD_PAD
    );
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

  /**
   * Deal the board in, one arrow at a time - a level should arrive, not blink.
   * The whole deal is capped: at 55ms each a 95-arrow board would take five
   * seconds to finish appearing, which reads as a bug, not a flourish.
   */
  private spawnArrows(): void {
    const per = Math.min(55, INTRO_MS / Math.max(1, this.board.arrows.length));
    this.board.arrows.forEach((arrow, index) => this.spawnArrow(arrow, true, index * per));
  }

  private spawnArrow(arrow: Arrow, animateIn: boolean, delay = 0): void {
    const points = this.bodyPoints(arrow);
    const origin = points[0]!;

    const container = this.add.container(origin.x, origin.y);
    const gfx = this.add.graphics();
    container.add(gfx);
    this.arrowLayer.add(container);

    const view: ArrowView = { arrow, container, gfx, zones: [] };
    this.repaint(view);

    // One tap target per occupied cell: arrows never share a cell, so this is
    // exact and needs no custom hit testing.
    for (const c of arrowCells(arrow)) {
      const centre = this.cellCenter(c);
      const zone = this.add.zone(centre.x, centre.y, this.cell, this.cell).setOrigin(0.5);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.beginHold(view));
      this.world.add(zone);
      view.zones.push(zone);
    }

    this.views.set(arrow.id, view);

    if (animateIn) {
      container.setScale(0.4);
      container.setAlpha(0);
      this.tweens.add({
        targets: container,
        scale: 1,
        alpha: 1,
        duration: 260,
        delay,
        ease: 'Back.easeOut',
      });
    }
  }

  /**
   * Redraw an arrow at rest, in `color`.
   *
   * An arrow that can leave right now gets a lift rather than a spotlight: two
   * ~9% passes of its own colour under the line, so it sits on a soft cushion
   * instead of lighting up. Ninety arrows all shouting would be no more
   * readable than ninety silent ones, so this stays at the edge of noticing.
   *
   * The line itself is always drawn at full alpha. Dimming the blocked ones
   * instead would bead every tail: `drawPolyArrow` lays round caps over the
   * stroke, and translucent overlap turns each cell centre into a dark dot.
   */
  private paint(view: ArrowView, color: number): void {
    const origin = this.cellCenter(view.arrow.head);
    const local = this.bodyPoints(view.arrow).map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
    view.gfx.clear();
    if (this.freeIds.has(view.arrow.id)) {
      drawPolyArrow(view.gfx, local, this.lineWidth + 10, color, view.arrow.dir, this.cell, 0.09);
      drawPolyArrow(view.gfx, local, this.lineWidth + 5, color, view.arrow.dir, this.cell, 0.09);
    }
    drawPolyArrow(view.gfx, local, this.lineWidth, color, view.arrow.dir, this.cell);
  }

  /** Repaint an arrow in its own direction's ink. */
  private repaint(view: ArrowView): void {
    this.paint(view, DIR_INK[view.arrow.dir]);
  }

  /**
   * Recompute which arrows can leave, then repaint the board.
   *
   * `freeArrows` builds the occupancy map once and walks each ray, so a single
   * call is cheap enough to run after every board change even at ~100 arrows -
   * far cheaper than asking `isFree` per arrow, which rebuilds the map each
   * time.
   */
  private refreshFreeLift(): void {
    this.freeIds = new Set(freeArrows(this.board, this.board.w, this.board.h).map((a) => a.id));
    for (const view of this.views.values()) this.repaint(view);
  }

  // ----------------------------------------------------------------- input

  /**
   * A press on an arrow starts a question, not a move. Release inside HOLD_MS
   * and it is an ordinary tap; keep holding and the arrow answers whether it
   * can escape - and then the release does nothing, because asking must never
   * cost a heart or spend the arrow.
   */
  private beginHold(view: ArrowView): void {
    this.cancelHold();
    this.holdPressed = true;
    if (this.busy || this.finished || this.failed) return;
    this.holdView = view;
    // The eraser owns the whole gesture: previewing an arrow about to be
    // deleted answers a question nobody asked.
    if (this.eraserArmed) return;

    this.holdTimer = this.time.delayedCall(HOLD_MS, () => {
      this.holdTimer = null;
      if (this.dragMoved >= DRAG_THRESHOLD || !this.views.has(view.arrow.id)) return;
      this.holdFired = true;
      this.showPreview(view);
    });
  }

  private endHold(): void {
    const view = this.holdView;
    const answered = this.holdFired;
    this.cancelHold();
    if (view && !answered) this.onTap(view);
  }

  private cancelHold(): void {
    this.holdTimer?.remove();
    this.holdTimer = null;
    this.holdView = null;
    this.holdFired = false;
    this.clearPreview();
  }

  private clearPreview(): void {
    for (const obj of this.preview) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.preview = [];
  }

  /**
   * Answer the hold, in the vocabulary a tap already taught: a free arrow gets
   * the halo the hint uses plus the lane it would fly down, a blocked one gets
   * the ray cut short at the offender under a stop mark - the same picture a
   * failed tap draws, minus the shake and the heart.
   */
  private showPreview(view: ArrowView): void {
    this.clearPreview();
    const arrow = view.arrow;
    const free = isFree(arrow, this.board, this.board.w, this.board.h);
    const from = this.cellCenter(arrow.head);
    const tone = free ? COLORS.ok : COLORS.danger;

    if (free) {
      const local = this.bodyPoints(arrow).map((p) => ({ x: p.x - from.x, y: p.y - from.y }));
      const glow = this.add.graphics();
      drawPolyArrowGlow(glow, local, this.lineWidth + 4, tone, arrow.dir, this.cell, 4);
      glow.setPosition(from.x, from.y);
      // Under the arrow, for the reason spelled out in `highlight`.
      this.boardLayer.add(glow);
      this.preview.push(glow);
    }

    const ray = pathCells(arrow, this.board.w, this.board.h);
    const blocker = free ? undefined : blockerOf(arrow, this.board, this.board.w, this.board.h);
    const blocked = blocker ? new Set(arrowCells(blocker).map((c) => `${c.x},${c.y}`)) : null;
    const stopAt = blocked ? ray.find((c) => blocked.has(`${c.x},${c.y}`)) : undefined;
    const last = stopAt ?? ray[ray.length - 1];
    const to = last ? this.cellCenter(last) : from;

    // A clear lane runs past its last cell so it reads as leaving the board
    // rather than as stopping politely on the rim.
    const end = free
      ? { x: to.x + DX[arrow.dir] * this.cell * 0.6, y: to.y + DY[arrow.dir] * this.cell * 0.6 }
      : to;

    const g = this.add.graphics();
    g.lineStyle(this.lineWidth * 0.6, tone, 0.5);
    g.lineBetween(from.x, from.y, end.x, end.y);
    if (free) {
      g.fillStyle(tone, 0.5);
      g.fillCircle(end.x, end.y, this.lineWidth * 0.55);
    } else {
      drawStopMark(g, end.x, end.y, this.cell * 0.5, tone);
    }
    this.fxLayer.add(g);
    this.preview.push(g);

    this.tweens.add({ targets: this.preview, alpha: { from: 0, to: 1 }, duration: 120 });
  }

  private onTap(view: ArrowView): void {
    if (this.busy || this.finished || this.failed) return;
    // The pointer travelled: that was a pan across the board, not a tap on it.
    if (this.dragMoved >= DRAG_THRESHOLD) return;
    if (!this.views.has(view.arrow.id)) return;

    // Eraser is armed: this tap deletes rather than launches.
    if (this.eraserArmed) {
      this.eraseArrow(view);
      return;
    }

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

    // A clean run should sound and look like one. Pitch rides the streak.
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    playSound(this, 'tap', 1 + Math.min(0.5, (this.streak - 1) * 0.06));
    playSound(this, 'slide');

    this.board.arrows = this.board.arrows.filter((a) => a.id !== arrow.id);
    this.views.delete(arrow.id);
    this.history.push(arrow);
    for (const zone of view.zones) zone.destroy();
    view.zones = [];

    this.undoButton.setEnabled(true);
    this.updateCounter(true);
    this.refreshFreeLift();
    this.dismissTutorial();

    const body = this.bodyPoints(arrow);
    const origin = body[0]!;

    rippleRing(this, origin.x, origin.y, this.cell * 0.42, COLORS.accent, this.fxLayer);
    this.time.delayedCall(90, () => rippleRing(this, origin.x, origin.y, this.cell * 0.3, COLORS.accent, this.fxLayer));

    if (this.streak >= 3) {
      const tone = this.streak >= 7 ? COLORS.amber : this.streak >= 5 ? COLORS.pink : COLORS.accent;
      popupLabel(this, origin.x, origin.y - this.cell * 0.5, `x${this.streak}`, tone, 30 + Math.min(14, this.streak), this.fxLayer);
    }

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

    // Dissolve over the back half of the flight. By then the head is past the
    // edge and only the tail is still on screen, so cutting the object at the
    // end of the tween would read as a dropped frame rather than an exit.
    this.tweens.add({
      targets: view.gfx,
      alpha: 0,
      scale: 0.6,
      delay: FLIGHT_MS * 0.45,
      duration: FLIGHT_MS * 0.5,
      ease: 'Quad.easeIn',
    });

    let frame = 0;
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

        // Trail only while the head is still over the board. Past the edge it
        // would just litter the margins and the toolbar.
        if (frame++ % 3 === 0) {
          const head = shape[0]!;
          if (this.overBoard(head.x, head.y)) {
            trailDot(this, head.x, head.y, this.cell * 0.13, COLORS.accent, this.fxLayer);
          }
        }

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
      if (this.views.has(view.arrow.id)) this.repaint(view);
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
    if (blocker && blockerView) {
      this.showBlockedRay(view.arrow, blocker);
      this.tweens.add({
        targets: blockerView.container,
        scale: 1.08,
        duration: 120,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    this.streak = 0;
    this.loseHeart();
  }

  /**
   * Draw the stretch of ray that is actually obstructed, from the head to the
   * offending cell. Players who can see WHY a tap failed stop repeating it.
   */
  private showBlockedRay(arrow: Arrow, blocker: Arrow): void {
    const blocked = new Set(arrowCells(blocker).map((c) => `${c.x},${c.y}`));
    const ray = pathCells(arrow, this.board.w, this.board.h);
    const hit = ray.find((c) => blocked.has(`${c.x},${c.y}`));
    if (!hit) return;

    const from = this.cellCenter(arrow.head);
    const to = this.cellCenter(hit);

    const g = this.add.graphics();
    g.lineStyle(this.lineWidth * 0.7, COLORS.danger, 0.55);
    g.lineBetween(from.x, from.y, to.x, to.y);
    g.fillStyle(COLORS.danger, 0.55);
    g.fillCircle(to.x, to.y, this.lineWidth * 0.55);
    this.fxLayer.add(g);

    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 620,
      ease: 'Quad.easeIn',
      onComplete: () => g.destroy(),
    });

    // The line says "up to here"; the sign says "and no further". It is drawn
    // around its own origin so the pop-in can scale it, and it rides fxLayer
    // so it stays exactly one half-cell wide at any zoom.
    const stop = this.add.graphics();
    drawStopMark(stop, 0, 0, this.cell * 0.5, COLORS.danger);
    stop.setPosition(to.x, to.y);
    stop.setScale(0);
    this.fxLayer.add(stop);

    this.tweens.add({
      targets: stop,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: stop,
          alpha: 0,
          duration: 500,
          ease: 'Quad.easeIn',
          onComplete: () => stop.destroy(),
        });
      },
    });
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(width: number): void {
    // The way out of a level is the one control a stuck player hunts for, so
    // it is a labelled pill rather than a 48px chevron: the word says where it
    // goes, and the whole pill is the target.
    const backLabel = this.add
      .text(0, 0, t('levels'), {
        fontFamily: FONT,
        fontSize: '19px',
        color: hex(COLORS.inkSoft),
        fontStyle: '800',
      })
      .setOrigin(0, 0.5);
    const backWidth = 78 + backLabel.width;
    const back = this.add.container(24 + backWidth / 2, 52);

    const backBg = this.add.graphics();
    drawCard(backBg, -backWidth / 2, -30, backWidth, 60, 30);
    const backIcon = this.add.graphics();
    iconBack(backIcon, 30, COLORS.iconInk, 5);
    backIcon.setPosition(-backWidth / 2 + 30, 0);
    backLabel.setPosition(-backWidth / 2 + 52, 0);
    back.add([backBg, backIcon, backLabel]);

    setCenteredHitArea(back, backWidth, 60);
    back.on('pointerdown', () => back.setScale(0.94));
    back.on('pointerout', () => back.setScale(1));
    back.on('pointerup', () => {
      back.setScale(1);
      this.scene.start('LevelSelect', { chapter: this.ref.chapter });
    });

    new IconButton(this, {
      x: width - 58,
      y: 52,
      size: 48,
      fill: COLORS.card,
      icon: iconGear,
      onClick: () => this.showSettings(),
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

    // ---- centre: level number, and where it sits in the chapter ----------
    // A global level number alone says nothing a player can act on. How far
    // into the current chapter they are is the progress they actually feel,
    // so the count and a slim bar sit under the headline.
    const chapterLength = CHAPTERS[this.ref.chapter]?.levels.length ?? 50;
    const done = this.ref.index + 1;

    this.add
      .text(width / 2, HUD_Y - 12, `${t('levelShort')}${this.ref.data.id}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: hex(COLORS.ink),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, HUD_Y + 14, `${done}/${chapterLength}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: hex(COLORS.inkMuted),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const barWidth = 112;
    const bar = this.add.graphics();
    bar.fillStyle(COLORS.locked, 1);
    bar.fillRoundedRect(width / 2 - barWidth / 2, HUD_Y + 28, barWidth, 5, 2.5);
    bar.fillStyle(COLORS.accent, 1);
    bar.fillRoundedRect(
      width / 2 - barWidth / 2,
      HUD_Y + 28,
      Math.max(5, (barWidth * done) / chapterLength),
      5,
      2.5,
    );

    // ---- countdown, sitting under the pill like the reference ------------
    this.timerLayer = this.add.container(width / 2, HUD_Y + HUD_HEIGHT / 2 + 20);
    this.timerBg = this.add.graphics();
    this.timerLayer.add(this.timerBg);
    // Left-aligned: the ring is laid out first and the text is parked beside
    // it, so a digit changing width never shifts the ring.
    this.timerText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '17px',
        color: hex(COLORS.ink),
        fontStyle: '800',
      })
      .setOrigin(0, 0.5);
    this.timerLayer.add(this.timerText);
    this.updateTimer();

    // ---- coin purse ------------------------------------------------------
    // Parked on the right, beside the gear: the labelled back pill now owns
    // the whole left end of the top row.
    const purse = this.add.graphics();
    drawCoin(purse, width - 200, 52, 15);
    this.coinText = this.add
      .text(width - 180, 52, String(progress.coins), {
        fontFamily: FONT,
        fontSize: '20px',
        color: hex(COLORS.inkSoft),
        fontStyle: '800',
      })
      .setOrigin(0, 0.5);

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

  // ------------------------------------------------------------------ timer

  private tickTimer(): void {
    if (this.finished || this.failed || this.timedOut) return;
    this.secondsLeft = Math.max(0, this.secondsLeft - 1);
    this.updateTimer();
    if (this.secondsLeft === 0) {
      this.timedOut = true;
      this.showFailOverlay(true);
    }
  }

  private formatTime(total: number): string {
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}m${String(sec).padStart(2, '0')}s`;
  }

  private updateTimer(): void {
    if (!this.timerText) return;
    // A rescue can hand back more time than the level started with; without
    // this the ring would sit pinned at full and read as frozen.
    if (this.secondsLeft > this.startSeconds) this.startSeconds = this.secondsLeft;

    const low = this.secondsLeft <= LOW_TIME;
    const tone = low ? COLORS.danger : 0x9a7420;
    this.timerText.setText(this.formatTime(this.secondsLeft));
    this.timerText.setColor(hex(tone));

    // 26px of lead-in for the ring, the ring itself, then the digits.
    const width = this.timerText.width + 68;
    const ringX = -width / 2 + 26;
    this.timerText.setPosition(ringX + 26, 0);

    this.timerBg.clear();
    drawCard(this.timerBg, -width / 2, -26, width, 52, 26, low ? 0xffe0e0 : 0xffeec2);
    drawTimerArc(
      this.timerBg,
      ringX,
      0,
      20,
      this.startSeconds > 0 ? this.secondsLeft / this.startSeconds : 0,
      tone,
      COLORS.card,
    );

    if (low && this.secondsLeft > 0) this.startTimerPulse();
    else this.stopTimerPulse();
  }

  /** Heartbeat for the last few seconds - slow enough to alarm, not nag. */
  private startTimerPulse(): void {
    if (this.timerPulse || !this.timerLayer) return;
    this.timerPulse = this.tweens.add({
      targets: this.timerLayer,
      scale: 1.12,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopTimerPulse(): void {
    if (!this.timerPulse) return;
    this.timerPulse.remove();
    this.timerPulse = null;
    this.timerLayer?.setScale(1);
  }

  // ------------------------------------------------------------------ tools

  /** Charges left, and whether the tool is available on this level at all. */
  private toolState(tool: Tool): { unlocked: boolean; charges: number } {
    return {
      unlocked: this.ref.global >= TOOL_UNLOCK_AT[tool],
      charges: progress.toolCharges(tool),
    };
  }

  private refreshTools(): void {
    for (const [tool, button] of this.toolButtons) {
      const state = this.toolState(tool);
      button.setEnabled(state.unlocked);
      // A "0" reads as a dead button and the player stops tapping it. "AD"
      // says the same thing honestly: still usable, costs a video.
      button.setBadge(state.unlocked ? (state.charges > 0 ? String(state.charges) : 'AD') : undefined);
    }
    if (this.coinText) this.coinText.setText(String(progress.coins));
  }

  /**
   * Spend a charge, or fall back to a rewarded video when the player is dry.
   * Returns false when the player declined or the ad failed.
   */
  private async spendTool(tool: Tool): Promise<boolean> {
    if (progress.useTool(tool)) {
      this.refreshTools();
      return true;
    }
    // Out of charges: let the player choose how to restock rather than
    // silently firing a video at them.
    this.showToolShop(tool);
    return false;
  }

  private toolLabel(tool: Tool): string {
    return tool === 'hint' ? t('toolHint') : tool === 'eraser' ? t('toolEraser') : t('toolGrid');
  }

  private toolIcon(tool: Tool): typeof iconMagnifier {
    return tool === 'hint' ? iconMagnifier : tool === 'eraser' ? iconEraser : iconGrid;
  }

  /**
   * Restock a tool: a rewarded video for one, or coins for a pack.
   *
   * The shop is the only one of the three modals that is *aspirational*, so it
   * is the only one that keeps the chapter accent for its headline and puts
   * golden rays behind the subject. Every child is laid out against the 520x470
   * card returned by `modalShell`; see MODAL_* below.
   */
  private showToolShop(tool: Tool): void {
    if (this.overlayLayer) return;
    const { layer, centreX: cx, centreY: cy } = modalShell(this, 520, 470, 215);
    getSdk().gameplayStop();

    const rays = goldenBurst(this, 0, 0, 70, 14);

    const close = (): void => {
      this.overlayLayer = null;
      // goldenBurst spins forever; the tween outlives the Graphics unless it
      // is killed before the layer goes.
      this.tweens.killTweensOf(rays);
      layer.destroy();
      if (!this.failed && !this.finished) getSdk().gameplayStart();
    };

    // ---- top row: what the player has, and the way out --------------------
    layer.add(coinChip(this, cx - 232, cy - 188, progress.coins));

    layer.add(
      new IconButton(this, {
        x: cx + 216,
        y: cy - 188,
        icon: iconClose,
        size: 48,
        radius: 24,
        iconSize: 26,
        lineWidth: 4,
        fill: COLORS.accentSoft,
        iconColor: COLORS.inkSoft,
        onClick: close,
      }),
    );

    // ---- headline ---------------------------------------------------------
    const title = this.add
      .text(cx, cy - 130, this.toolLabel(tool), {
        fontFamily: FONT,
        fontSize: '34px',
        color: hex(COLORS.accent),
        fontStyle: '800',
      })
      .setOrigin(0.5);
    layer.add(title);
    popIn(this, title, 80, 0.86);

    layer.add(
      this.add
        .text(cx, cy - 90, t('getMore'), {
          fontFamily: FONT,
          fontSize: '19px',
          color: hex(COLORS.inkSoft),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    // ---- hero: the tool itself, lit ---------------------------------------
    const hero = this.add.container(cx, cy + 2);
    hero.add(rays);

    const halo = this.add.graphics();
    softRadial(halo, 0, 0, 62, COLORS.amber, 0.3);
    hero.add(halo);

    // Icon drawers may rotate the Graphics they are handed (iconEraser tilts),
    // so the glyph gets its own object.
    const glyph = this.add.graphics();
    this.toolIcon(tool)(glyph, 96, COLORS.accent, 9);
    hero.add(glyph);
    layer.add(hero);
    popIn(this, hero, 150);

    // ---- Left: one charge for a video. Right: a pack for coins. -----------
    layer.add(
      new Button(this, {
        x: cx - 110,
        y: cy + 122,
        width: 200,
        height: 78,
        label: t('freeLabel'),
        variant: 'primary',
        fontSize: 24,
        radius: 39,
        badge: 'AD',
        onClick: () => {
          void (async () => {
            const granted = await getSdk().showRewarded();
            if (!granted) {
              toast(this, t('adFailed'), COLORS.danger);
              return;
            }
            progress.grantTool(tool, 1);
            this.refreshTools();
            close();
          })();
        },
      }),
    );

    layer.add(
      new CoinButton(this, {
        x: cx + 110,
        y: cy + 122,
        width: 200,
        height: 78,
        price: TOOL_PRICE,
        balance: progress.coins,
        fontSize: 28,
        onClick: () => {
          if (!progress.buyTool(tool)) return;
          this.refreshTools();
          toast(this, `+${TOOL_PACK} ${this.toolLabel(tool)}`, COLORS.accent);
          close();
        },
      }),
    );

    this.overlayLayer = layer;
  }

  /** One-off coach mark, the first time a board is too big to fit. */
  private maybeShowZoomHint(): void {
    if (!progress.needsZoomHint() || this.worldScale >= 0.95) return;
    progress.markZoomHintSeen();

    const { width } = this.cameras.main;
    const layer = this.add.container(width / 2, BOARD_BOTTOM + 4).setDepth(120);

    const text = this.add
      .text(0, 0, t('zoomHint'), {
        fontFamily: FONT,
        fontSize: '17px',
        color: hex(COLORS.ink),
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 420 },
      })
      .setOrigin(0.5);

    const bg = this.add.graphics();
    drawCard(bg, -(text.width + 48) / 2, -(text.height + 28) / 2, text.width + 48, text.height + 28, 20);
    layer.add(bg);
    layer.add(text);

    this.tweens.add({
      targets: layer,
      alpha: { from: 0, to: 1 },
      duration: 240,
      onComplete: () => {
        this.tweens.add({
          targets: layer,
          alpha: 0,
          delay: 3600,
          duration: 400,
          onComplete: () => layer.destroy(),
        });
      },
    });
  }

  // ---- eraser --------------------------------------------------------

  private async onEraser(): Promise<void> {
    if (this.busy || this.finished || this.failed) return;
    if (this.eraserArmed) {
      this.disarmEraser();
      return;
    }
    this.busy = true;
    const paid = await this.spendTool('eraser');
    this.busy = false;
    if (!paid) return;
    this.armEraser();
  }

  private armEraser(): void {
    this.eraserArmed = true;
    const { width } = this.cameras.main;

    const layer = this.add.container(width / 2, BOARD_TOP - 4).setDepth(120);
    const bg = this.add.graphics();
    drawCard(bg, -190, -34, 380, 68, RADIUS.card);
    layer.add(bg);

    const icon = this.add.graphics();
    iconEraser(icon, 30, COLORS.pink, 4);
    icon.setPosition(-140, 0);
    layer.add(icon);

    layer.add(
      this.add
        .text(-104, -12, t('toolEraser'), {
          fontFamily: FONT,
          fontSize: '20px',
          color: hex(COLORS.pink),
          fontStyle: '800',
        })
        .setOrigin(0, 0.5),
    );
    layer.add(
      this.add
        .text(-104, 12, t('eraserPrompt'), {
          fontFamily: FONT,
          fontSize: '16px',
          color: hex(COLORS.inkSoft),
        })
        .setOrigin(0, 0.5),
    );

    this.eraserBanner = layer;
    this.tweens.add({ targets: layer, alpha: { from: 0, to: 1 }, y: BOARD_TOP + 6, duration: 200 });

    // Swap the system pointer for the tool itself, so the mode is visible
    // wherever the player is actually looking.
    this.input.setDefaultCursor('none');
    this.setZoneCursor('none');
    this.toolCursor = makeToolCursor(this, 'eraser');
    this.toolCursor.setPosition(this.input.activePointer.x, this.input.activePointer.y);
  }

  private disarmEraser(): void {
    this.eraserArmed = false;
    this.eraserBanner?.destroy();
    this.eraserBanner = null;

    this.input.setDefaultCursor('default');
    this.setZoneCursor('pointer');
    this.toolCursor?.destroy();
    this.toolCursor = null;
  }

  /**
   * Every arrow zone asks for a hand cursor on hover, which would beat the
   * hidden default the moment the player moved over the board - exactly when
   * the tool cursor matters most.
   */
  private setZoneCursor(css: string): void {
    for (const view of this.views.values()) {
      for (const zone of view.zones) {
        if (zone.input) zone.input.cursor = css;
      }
    }
  }

  /** Erase ignores whether the arrow was free: removing only ever helps. */
  private eraseArrow(view: ArrowView): void {
    this.disarmEraser();
    playSound(this, 'slide');

    this.board.arrows = this.board.arrows.filter((a) => a.id !== view.arrow.id);
    this.views.delete(view.arrow.id);
    for (const zone of view.zones) zone.destroy();
    view.zones = [];
    this.updateCounter(true);
    this.refreshFreeLift();

    const origin = this.cellCenter(view.arrow.head);
    rippleRing(this, origin.x, origin.y, this.cell * 0.5, COLORS.pink, this.fxLayer);

    this.tweens.add({
      targets: view.container,
      scale: 0.2,
      alpha: 0,
      duration: 240,
      ease: 'Back.easeIn',
      onComplete: () => {
        view.container.destroy();
        this.checkWin();
      },
    });
  }

  // ---- guideline grid ------------------------------------------------

  private async onGrid(): Promise<void> {
    if (this.busy || this.finished || this.failed) return;
    if (this.gridOn) {
      this.hideGrid();
      return;
    }
    this.busy = true;
    const paid = await this.spendTool('grid');
    this.busy = false;
    if (!paid) return;

    this.gridOn = true;
    const layer = this.add.container(0, 0);
    this.boardLayer.add(layer);

    // One Graphics per line, because the wave needs a per-line alpha and a
    // single Graphics only has one. Verticals sweep left to right, then the
    // horizontals top to bottom, so the whole grid reads as being drawn.
    const lines: Phaser.GameObjects.Graphics[] = [];
    for (let x = 0; x <= this.board.w; x++) {
      const g = this.add.graphics();
      g.lineStyle(1.5, COLORS.accent, 0.28);
      g.lineBetween(x * this.cell, -BOARD_PAD, x * this.cell, this.board.h * this.cell + BOARD_PAD);
      lines.push(g);
    }
    for (let y = 0; y <= this.board.h; y++) {
      const g = this.add.graphics();
      g.lineStyle(1.5, COLORS.accent, 0.28);
      g.lineBetween(-BOARD_PAD, y * this.cell, this.board.w * this.cell + BOARD_PAD, y * this.cell);
      lines.push(g);
    }

    // Capped like the arrow cascade: on a 20x26 board a fixed per-line delay
    // would still be crawling across the grid seconds after the tap.
    const step = GRID_WAVE_MS / Math.max(1, lines.length);
    lines.forEach((g, i) => {
      g.setAlpha(0);
      layer.add(g);
      this.tweens.add({ targets: g, alpha: 1, duration: 160, delay: i * step });
    });

    this.gridLayer = layer;
  }

  private hideGrid(): void {
    const layer = this.gridLayer;
    if (layer) {
      // Half the lines may still be fading in; their tweens would keep
      // writing alpha into destroyed Graphics.
      for (const line of layer.list) this.tweens.killTweensOf(line);
      layer.destroy();
    }
    this.gridLayer = null;
    this.gridOn = false;
  }

  // ---- unlock ceremony -----------------------------------------------

  private showToolUnlock(tool: Tool): void {
    const { width, height } = this.cameras.main;
    const layer = this.add.container(0, 0).setDepth(220);

    const dim = this.add.rectangle(width / 2, height / 2, width, height, COLORS.ink, 0.55);
    dim.setInteractive();
    layer.add(dim);

    // Golden rays, the classic reward flourish.
    const rays = this.add.graphics();
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2;
      const a1 = a0 + Math.PI / 16;
      rays.fillStyle(COLORS.amber, 0.22);
      rays.beginPath();
      rays.moveTo(0, 0);
      rays.arc(0, 0, 300, a0, a1, false);
      rays.closePath();
      rays.fillPath();
    }
    rays.setPosition(width / 2, height * 0.45);
    layer.add(rays);
    this.tweens.add({ targets: rays, angle: 360, duration: 24000, repeat: -1 });

    const label = tool === 'hint' ? t('toolHint') : tool === 'eraser' ? t('toolEraser') : t('toolGrid');
    const desc = tool === 'hint' ? t('toolHintDesc') : tool === 'eraser' ? t('toolEraserDesc') : t('toolGridDesc');

    layer.add(
      this.add
        .text(width / 2, height * 0.24, label, {
          fontFamily: FONT,
          fontSize: '46px',
          color: hex(0x59c2ff),
          fontStyle: '800',
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );
    layer.add(
      this.add
        .text(width / 2, height * 0.29, t('unlocked'), {
          fontFamily: FONT,
          fontSize: '26px',
          color: hex(COLORS.card),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const art = this.add.graphics();
    const draw = tool === 'hint' ? iconMagnifier : tool === 'eraser' ? iconEraser : iconGrid;
    draw(art, 150, COLORS.card, 14);
    art.setPosition(width / 2, height * 0.45);
    layer.add(art);
    art.setScale(0);
    this.tweens.add({ targets: art, scale: 1, duration: 420, ease: 'Back.easeOut' });

    layer.add(
      this.add
        .text(width / 2, height * 0.62, desc, {
          fontFamily: FONT,
          fontSize: '22px',
          color: hex(COLORS.card),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    layer.add(
      new Button(this, {
        x: width / 2,
        y: height * 0.72,
        width: 320,
        height: 84,
        label: t('claim'),
        variant: 'primary',
        fontSize: 30,
        radius: 42,
        onClick: () => {
          progress.markToolSeen(tool);
          this.refreshTools();
          confetti(this, width / 2, height * 0.45, 40);
          layer.destroy();
        },
      }),
    );
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
    // 64px targets on a 100px pitch: the row spans 178..542 on a 720 canvas,
    // which clears the zoom column at 634 and still leaves 36px of air between
    // buttons for the captions to breathe.
    const gap = 100;
    const left = width / 2 - gap * 1.5;

    this.hintButton = new IconButton(this, {
      x: left,
      y: TOOLBAR_Y,
      size: TOOLBAR_SIZE,
      icon: iconMagnifier,
      caption: t('hint'),
      onClick: () => void this.onHint(),
    });
    this.toolButtons.set('hint', this.hintButton);

    this.toolButtons.set(
      'eraser',
      new IconButton(this, {
        x: left + gap,
        y: TOOLBAR_Y,
        size: TOOLBAR_SIZE,
        icon: iconEraser,
        caption: t('toolEraser'),
        onClick: () => void this.onEraser(),
      }),
    );

    this.toolButtons.set(
      'grid',
      new IconButton(this, {
        x: left + gap * 2,
        y: TOOLBAR_Y,
        size: TOOLBAR_SIZE,
        icon: iconGrid,
        caption: t('toolGrid'),
        onClick: () => void this.onGrid(),
      }),
    );

    this.undoButton = new IconButton(this, {
      x: left + gap * 3,
      y: TOOLBAR_Y,
      size: TOOLBAR_SIZE,
      icon: iconUndo,
      caption: t('undo'),
      enabled: false,
      onClick: () => void this.onUndo(),
    });

    this.refreshTools();

    // Dense boards need a zoom, so it sits right next to the tools.
    new IconButton(this, {
      x: width - 62,
      y: TOOLBAR_Y - 32,
      size: 48,
      fill: COLORS.card,
      icon: iconZoomIn,
      onClick: () => this.zoomBy(1.25),
    });
    new IconButton(this, {
      x: width - 62,
      y: TOOLBAR_Y + 32,
      size: 48,
      fill: COLORS.card,
      icon: iconZoomOut,
      onClick: () => this.zoomBy(0.8),
    });
  }

  /** Hint and undo are free once each per level, then cost a rewarded video. */
  private async payFor(kind: 'undo'): Promise<boolean> {
    const spent = this.undoFreeSpent;
    if (!spent) {
      void kind;
      this.undoFreeSpent = true;
      this.refreshAdBadges();
      return true;
    }

    const granted = await getSdk().showRewarded();
    if (!granted) toast(this, t('adFailed'), COLORS.danger);
    return granted;
  }

  /** Undo is not a charged tool, so it keeps its own free-then-ad badge. */
  private refreshAdBadges(): void {
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
      this.refreshFreeLift();
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
    if (!(await this.spendTool('hint'))) {
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

    const glow = this.add.graphics();
    drawPolyArrowGlow(glow, local, this.lineWidth + 4, COLORS.amber, arrow.dir, this.cell, 4);
    glow.setPosition(origin.x, origin.y);
    // Under the arrow, not over it: the halo is a stack of 10%-alpha passes
    // and would wash the arrow out if fxLayer put it on top.
    this.boardLayer.add(glow);

    this.tweens.add({
      targets: glow,
      alpha: 0.2,
      duration: 420,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => glow.destroy(),
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

  /**
   * The rescue modal, in both its flavours.
   *
   * The headline takes its colour from whatever ran out - red for hearts, deep
   * gold for the clock - instead of the chapter accent. Accent means "this is
   * the way forward" everywhere else in the game, so spending it on the word
   * "Out of hearts" was working against the sentence.
   *
   * Card is 520x580 and the layout below is written against `cy` = its centre;
   * the tallest child (RESTART, bottom edge cy+263) still clears the card edge
   * at cy+290 by 27px.
   */
  private showFailOverlay(outOfTime = false): void {
    if (this.finished || this.overlayLayer) return;
    this.failed = true;
    this.stopTimerPulse();
    getSdk().gameplayStop();

    const { layer, centreX: cx, centreY: cy } = modalShell(this, 520, 580);

    // One tone drives headline, halo and subject, so the modal reads as being
    // *about* the thing that ran out rather than merely mentioning it.
    const tone = outOfTime ? COLORS.amber : COLORS.danger;
    const titleTone = outOfTime ? darken(COLORS.amber, 0.34) : COLORS.danger;

    layer.add(coinChip(this, cx - 232, cy - 244, progress.coins));

    const title = this.add
      .text(cx, cy - 178, outOfTime ? t('outOfTime') : t('noHearts'), {
        fontFamily: FONT,
        fontSize: '38px',
        color: hex(titleTone),
        fontStyle: '800',
      })
      .setOrigin(0.5);
    layer.add(title);
    popIn(this, title, 80, 0.86);

    layer.add(
      this.add
        .text(cx, cy - 136, outOfTime ? t('outOfTimeSub') : t('noHeartsSub'), {
          fontFamily: FONT,
          fontSize: '20px',
          color: hex(COLORS.inkSoft),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    // ---- hero: the subject on its own light, not in a grey well -----------
    const hero = this.add.container(cx, cy - 26);

    const halo = this.add.graphics();
    softRadial(halo, 0, 0, 88, tone, 0.26);
    // A single hairline ring: the same round line-art vocabulary as the board,
    // and enough of an edge that the glow reads as deliberate.
    halo.lineStyle(3, tone, 0.3);
    halo.strokeCircle(0, 0, 74);
    hero.add(halo);

    const art = this.add.graphics();
    if (outOfTime) drawClock(art, 0, 0, 52, titleTone);
    else drawHeart(art, 0, 0, 116, COLORS.danger);
    hero.add(art);

    layer.add(hero);
    popIn(this, hero, 150);

    // ---- Left: free via rewarded video. Right: pay coins outright. --------
    layer.add(
      new Button(this, {
        x: cx - 110,
        y: cy + 112,
        width: 200,
        height: 78,
        label: t('freeLabel'),
        variant: 'primary',
        fontSize: 26,
        radius: 39,
        badge: 'AD',
        onClick: () => void this.onRefill(outOfTime),
      }),
    );

    layer.add(
      new CoinButton(this, {
        x: cx + 110,
        y: cy + 112,
        width: 200,
        height: 78,
        price: HEART_PRICE,
        balance: progress.coins,
        fontSize: 28,
        onClick: () => {
          if (!progress.spendCoins(HEART_PRICE)) {
            toast(this, t('noCharges'), COLORS.danger);
            return;
          }
          this.refreshTools();
          this.grantRescue(outOfTime);
        },
      }),
    );

    layer.add(
      new Button(this, {
        x: cx,
        y: cy + 232,
        width: 320,
        height: 62,
        label: t('restart'),
        variant: 'plain',
        fontSize: 22,
        radius: 31,
        onClick: () => this.scene.restart({ global: this.ref.global }),
      }),
    );

    this.overlayLayer = layer;
  }

  /** Put the player back in play after a refill, however it was paid for. */
  private grantRescue(outOfTime: boolean): void {
    if (outOfTime) {
      this.secondsLeft += TIME_REFILL;
      this.timedOut = false;
      this.updateTimer();
    } else {
      this.refillHearts();
    }
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

  /** In-level settings: sound, and the two ways out. */
  private showSettings(): void {
    if (this.overlayLayer) return;
    const { layer, centreX: cx, centreY: cy } = modalShell(this, 500, 560, 210);

    // Settings is the quiet one: plain ink for the headline, no hero, no
    // accent shouting. The accent lives in the two controls, where it means
    // something (the toggle track, the slider fill).
    layer.add(
      this.add
        .text(cx, cy - 218, t('settings'), {
          fontFamily: FONT,
          fontSize: '34px',
          color: hex(COLORS.ink),
          fontStyle: '800',
        })
        .setOrigin(0.5),
    );

    const close = () => {
      this.overlayLayer = null;
      layer.destroy();
      if (!this.failed && !this.finished) getSdk().gameplayStart();
    };

    layer.add(
      new IconButton(this, {
        x: cx + 206,
        y: cy - 218,
        icon: iconClose,
        size: 48,
        radius: 24,
        iconSize: 26,
        lineWidth: 4,
        fill: COLORS.accentSoft,
        iconColor: COLORS.inkSoft,
        onClick: close,
      }),
    );

    // ---- sound ------------------------------------------------------------
    const panels = this.add.graphics();
    drawSoftPanel(panels, cx - 210, cy - 162, 420, 74);
    drawSoftPanel(panels, cx - 210, cy - 68, 420, 128);
    layer.add(panels);

    layer.add(
      this.add
        .text(cx - 182, cy - 125, t('sound'), {
          fontFamily: FONT,
          fontSize: '24px',
          color: hex(COLORS.ink),
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    layer.add(
      toggleSwitch(this, cx + 152, cy - 125, progress.data.sound, (on) => {
        setSoundEnabled(this, on);
        if (on) playSound(this, 'tap');
      }),
    );

    // ---- drag sensitivity -------------------------------------------------
    layer.add(
      this.add
        .text(cx, cy - 38, t('sensitivity'), {
          fontFamily: FONT,
          fontSize: '19px',
          color: hex(COLORS.inkSoft),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    // Outside the slider's own 300px-wide drag zone, so tapping an end label
    // cannot yank the knob.
    layer.add(
      this.add
        .text(cx - 176, cy + 14, t('low'), {
          fontFamily: FONT,
          fontSize: '15px',
          color: hex(COLORS.inkMuted),
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(cx + 176, cy + 14, t('high'), {
          fontFamily: FONT,
          fontSize: '15px',
          color: hex(COLORS.inkMuted),
        })
        .setOrigin(0.5),
    );
    layer.add(
      slider(this, cx, cy + 14, 260, (progress.dragSensitivity - 0.5) / 1.5, (v) =>
        progress.setDragSensitivity(0.5 + v * 1.5),
      ),
    );

    layer.add(
      new Button(this, {
        x: cx,
        y: cy + 122,
        width: 340,
        height: 76,
        label: t('restart'),
        variant: 'primary',
        fontSize: 26,
        radius: 38,
        onClick: () => this.scene.restart({ global: this.ref.global }),
      }),
    );

    layer.add(
      new Button(this, {
        x: cx,
        y: cy + 214,
        width: 340,
        height: 76,
        label: t('backToLevels'),
        variant: 'plain',
        fontSize: 26,
        radius: 38,
        onClick: () => this.scene.start('LevelSelect', { chapter: this.ref.chapter }),
      }),
    );

    this.overlayLayer = layer;
    getSdk().gameplayStop();
  }

  private async onRefill(outOfTime = false): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const granted = await getSdk().showRewarded();
    this.busy = false;

    if (!granted) {
      toast(this, t('adFailed'), COLORS.danger);
      return;
    }
    this.grantRescue(outOfTime);
  }

  // -------------------------------------------------------------------- win

  private checkWin(): void {
    if (this.finished || this.board.arrows.length > 0) return;
    this.finished = true;
    this.stopTimerPulse();

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
