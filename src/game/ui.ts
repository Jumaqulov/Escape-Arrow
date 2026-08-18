/**
 * Shared light-theme widgets. Everything here is Phaser Graphics + Text: the
 * game ships without a single raster asset, which keeps the bundle tiny and
 * the look consistent at any resolution.
 *
 * Phaser's Graphics has no line cap/join setting, so every stroked shape here
 * caps its own corners with a filled circle of half the line width. That is
 * what makes the arrows and icons read as rounded line art rather than mitred
 * sticks.
 */
import Phaser from 'phaser';
import type { Cell, Dir } from '../core/types';
import { COLORS, FONT, RADIUS, SHADOW_ALPHA, darken, hex } from './theme';

/**
 * Give a Container a centred, pointer-friendly hit area.
 *
 * Phaser adds the object's displayOrigin to the local point before testing it
 * (`InputPlugin.pointWithinHitArea`), and a Container's displayOrigin is half
 * its size. So the rectangle must start at 0,0 - passing -w/2,-h/2 "looks"
 * centred but actually shifts the whole hit box half a cell up and left.
 */
export function setCenteredHitArea(container: Phaser.GameObjects.Container, width: number, height: number): void {
  container.setSize(width, height);
  container.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
  container.input!.cursor = 'pointer';
}

// ---------------------------------------------------------------- surfaces

/**
 * Fake a soft drop shadow by stacking translucent rounded rects. Graphics
 * cannot blur, but six layers at ~1.3% each land almost exactly on the
 * rgba(20,22,31,0.08) the design calls for.
 */
export function drawShadow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  spread = 6,
  offsetY = 3,
): void {
  for (let i = spread; i >= 1; i--) {
    g.fillStyle(COLORS.shadow, SHADOW_ALPHA / spread);
    g.fillRoundedRect(x - i, y - i + offsetY, width + i * 2, height + i * 2, radius + i);
  }
}

/** White (or tinted) card with the standard soft shadow. */
export function drawCard(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = RADIUS.card,
  fill = COLORS.card,
  shadow = true,
): void {
  if (shadow) drawShadow(g, x, y, width, height, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, width, height, radius);
}

/** The board's dot grid: one dot at every cell corner. */
export function drawDotGrid(
  g: Phaser.GameObjects.Graphics,
  originX: number,
  originY: number,
  cols: number,
  rows: number,
  cell: number,
  radius = 2.5,
): void {
  g.fillStyle(COLORS.dot, 1);
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      g.fillCircle(originX + x * cell, originY + y * cell, radius);
    }
  }
}

// ------------------------------------------------------------------ arrows

/**
 * Rotation of the head dart, in degrees clockwise from "pointing right".
 *
 * This is the single source of truth for head orientation - the renderer never
 * derives it from DX/DY, so U can never silently come out as R.
 */
export const HEAD_ANGLE: Readonly<Record<Dir, number>> = { R: 0, D: 90, L: 180, U: 270 };

/** Dart proportions, as a fraction of one cell. */
export const HEAD_LENGTH = 0.48;
export const HEAD_HALF_WIDTH = 0.16;

export interface HeadPoints {
  tip: Cell;
  left: Cell;
  right: Cell;
  /** Unit vector the dart points along. */
  forward: Cell;
}

/**
 * The three corners of the head dart around (x,y).
 *
 * The base is centred exactly on (x,y), which is also where the shaft starts -
 * so there is never a gap or an overlap between neck and head.
 */
export function arrowHeadPoints(x: number, y: number, dir: Dir, cell: number): HeadPoints {
  const a = Phaser.Math.DegToRad(HEAD_ANGLE[dir]);
  const ux = Math.round(Math.cos(a));
  const uy = Math.round(Math.sin(a));
  const nx = -uy;
  const ny = ux;

  const len = cell * HEAD_LENGTH;
  const half = cell * HEAD_HALF_WIDTH;

  return {
    tip: { x: x + ux * len, y: y + uy * len },
    left: { x: x + nx * half, y: y + ny * half },
    right: { x: x - nx * half, y: y - ny * half },
    forward: { x: ux, y: uy },
  };
}

/**
 * Draw an arrow as stroked line art: a polyline through `points` (head first,
 * then the tail) plus a slim filled dart at the head.
 */
export function drawPolyArrow(
  g: Phaser.GameObjects.Graphics,
  points: Cell[],
  lineWidth: number,
  color: number,
  dir: Dir,
  cell: number,
  alpha = 1,
): void {
  const head = points[0];
  if (!head) return;

  if (points.length > 1) {
    g.lineStyle(lineWidth, color, alpha);
    g.beginPath();
    g.moveTo(head.x, head.y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
    g.strokePath();
  }

  // Round the caps and joins by hand - see the file header.
  g.fillStyle(color, alpha);
  for (const p of points) g.fillCircle(p.x, p.y, lineWidth / 2);

  const dart = arrowHeadPoints(head.x, head.y, dir, cell);
  g.fillTriangle(dart.tip.x, dart.tip.y, dart.left.x, dart.left.y, dart.right.x, dart.right.y);
}

// ------------------------------------------------------------------- icons

/**
 * An icon drawer owns the Graphics it is handed, so it may rotate it.
 * Every icon is centred on (0,0) and fits inside a `size` box.
 */
export type IconDrawer = (
  g: Phaser.GameObjects.Graphics,
  size: number,
  color: number,
  lineWidth: number,
) => void;

/** Round-capped straight segment. */
function stroke(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
  lw: number,
): void {
  g.lineStyle(lw, color, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.fillStyle(color, 1);
  g.fillCircle(x1, y1, lw / 2);
  g.fillCircle(x2, y2, lw / 2);
}

/** Filled triangle head for the curved icons, tip at `angle` degrees. */
function arrowTip(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angleDeg: number,
  length: number,
  half: number,
  color: number,
): void {
  const a = Phaser.Math.DegToRad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  g.fillStyle(color, 1);
  g.fillTriangle(x + ux * length, y + uy * length, x - uy * half, y + ux * half, x + uy * half, y - ux * half);
}

export const iconMagnifier: IconDrawer = (g, s, color, lw) => {
  const r = s * 0.3;
  const cx = -s * 0.09;
  const cy = -s * 0.09;
  g.lineStyle(lw, color, 1);
  g.strokeCircle(cx, cy, r);
  const k = Math.SQRT1_2;
  stroke(g, cx + r * k, cy + r * k, s * 0.44, s * 0.44, color, lw);
};

/** Curved arrow doubling back to the left. */
export const iconUndo: IconDrawer = (g, s, color, lw) => {
  const r = s * 0.32;
  const cy = s * 0.1;

  g.lineStyle(lw, color, 1);
  g.beginPath();
  g.arc(0, cy, r, Math.PI, 0, false);
  g.strokePath();

  // Right end drops straight down, so the curve reads as a return stroke.
  stroke(g, r, cy, r, cy + s * 0.22, color, lw);
  g.fillStyle(color, 1);
  g.fillCircle(-r, cy, lw / 2);

  arrowTip(g, -r, cy + lw * 0.1, 90, s * 0.26, s * 0.2, color);
};

/** Full circular arrow. */
export const iconRestart: IconDrawer = (g, s, color, lw) => {
  const r = s * 0.32;
  const startDeg = -50;
  const a = Phaser.Math.DegToRad(startDeg);

  g.lineStyle(lw, color, 1);
  g.beginPath();
  g.arc(0, 0, r, a, Phaser.Math.DegToRad(250), false);
  g.strokePath();

  const px = Math.cos(a) * r;
  const py = Math.sin(a) * r;
  g.fillStyle(color, 1);
  g.fillCircle(Math.cos(Phaser.Math.DegToRad(250)) * r, Math.sin(Phaser.Math.DegToRad(250)) * r, lw / 2);

  // Head sits on the open end, pointing back against the sweep.
  arrowTip(g, px, py, startDeg - 90, s * 0.28, s * 0.21, color);
};

export const iconGear: IconDrawer = (g, s, color, lw) => {
  const r = s * 0.24;
  g.lineStyle(lw, color, 1);
  g.strokeCircle(0, 0, r);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    stroke(g, cos * r * 1.3, sin * r * 1.3, cos * r * 1.8, sin * r * 1.8, color, lw * 0.8);
  }
};

export const iconBack: IconDrawer = (g, s, color, lw) => {
  stroke(g, s * 0.17, -s * 0.26, -s * 0.15, 0, color, lw);
  stroke(g, -s * 0.15, 0, s * 0.17, s * 0.26, color, lw);
};

export const iconLock: IconDrawer = (g, s, color, lw) => {
  g.lineStyle(lw, color, 1);
  g.beginPath();
  g.arc(0, -s * 0.08, s * 0.19, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.3, -s * 0.06, s * 0.6, s * 0.44, s * 0.1);
};

/** Filled heart, centred on (0,0). */
export function drawHeart(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1,
): void {
  const r = size * 0.5;
  g.fillStyle(color, alpha);
  g.fillCircle(x - r * 0.5, y - r * 0.32, r * 0.6);
  g.fillCircle(x + r * 0.5, y - r * 0.32, r * 0.6);
  g.fillTriangle(x - r * 1.05, y - r * 0.1, x + r * 1.05, y - r * 0.1, x, y + r * 1.05);
}

/** Tapping hand used by the level 1 tutorial. */
export function drawHand(g: Phaser.GameObjects.Graphics, size: number, color: number): void {
  const s = size;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.24, -s * 0.04, s * 0.48, s * 0.5, s * 0.16);
  g.fillRoundedRect(-s * 0.09, -s * 0.44, s * 0.18, s * 0.46, s * 0.09);
  g.fillStyle(COLORS.card, 1);
  g.fillCircle(0, -s * 0.38, s * 0.05);
}

/** Solid arrow mark used in the HUD counter. Same dart as the board arrows. */
export function drawArrowMark(g: Phaser.GameObjects.Graphics, size: number, color: number): void {
  const shaft = size * 0.34;
  g.lineStyle(size * 0.24, color, 1);
  g.lineBetween(-size * 0.5, 0, -size * 0.5 + shaft, 0);
  g.fillStyle(color, 1);
  g.fillCircle(-size * 0.5, 0, size * 0.12);
  const dart = arrowHeadPoints(-size * 0.5 + shaft, 0, 'R', size * 1.1);
  g.fillTriangle(dart.tip.x, dart.tip.y, dart.left.x, dart.left.y, dart.right.x, dart.right.y);
}

/** Five pointed star, filled or hollow, centred on (x,y). */
export function drawStar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  filled: boolean,
): void {
  const points: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(new Phaser.Geom.Point(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
  }
  if (filled) {
    g.fillStyle(color, 1);
    g.fillPoints(points, true);
  } else {
    g.lineStyle(Math.max(2, radius * 0.16), color, 1);
    g.strokePoints(points, true);
  }
}

// ----------------------------------------------------------------- buttons

export type ButtonVariant = 'primary' | 'plain' | 'soft';

export interface ButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  fontSize?: number;
  radius?: number;
  enabled?: boolean;
  /** Small pink pill in the top-right corner, e.g. "AD". */
  badge?: string;
}

interface Palette {
  fill: number;
  text: number;
}

function paletteFor(variant: ButtonVariant): Palette {
  if (variant === 'primary') return { fill: COLORS.accent, text: COLORS.card };
  if (variant === 'soft') return { fill: COLORS.accentSoft, text: COLORS.ink };
  return { fill: COLORS.card, text: COLORS.ink };
}

export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private badgeLayer: Phaser.GameObjects.Container | null = null;
  private readonly opts: Required<Omit<ButtonOptions, 'badge'>> & { badge?: string };
  private hovered = false;
  private pressed = false;
  private enabled: boolean;

  constructor(scene: Phaser.Scene, options: ButtonOptions) {
    super(scene, options.x, options.y);

    this.opts = {
      variant: 'plain',
      fontSize: 30,
      radius: RADIUS.pill,
      enabled: true,
      ...options,
    };
    this.enabled = this.opts.enabled;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.label = scene.add
      .text(0, 0, options.label, {
        fontFamily: FONT,
        fontSize: `${this.opts.fontSize}px`,
        color: hex(paletteFor(this.opts.variant).text),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add(this.label);

    setCenteredHitArea(this, this.opts.width, this.opts.height);

    this.on('pointerover', () => {
      this.hovered = true;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.setPressed(false);
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.setPressed(true);
    });
    this.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.setPressed(false);
      if (!this.enabled || !wasPressed) return;
      this.opts.onClick();
    });

    this.redraw();
    this.setBadge(options.badge);
    scene.add.existing(this);
  }

  private setPressed(value: boolean): void {
    this.pressed = value;
    this.setScale(value ? 0.9 : 1);
    this.redraw();
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.redraw();
    this.badgeLayer?.setAlpha(enabled ? 1 : 0.4);
    return this;
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }

  /** Pass undefined to clear. */
  setBadge(text?: string): this {
    this.badgeLayer?.destroy();
    this.badgeLayer = null;
    if (!text) return this;

    const { width, height } = this.opts;
    const layer = this.scene.add.container(width / 2 - 14, -height / 2 + 4);
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.pink, 1);
    g.fillRoundedRect(-20, -12, 40, 24, 12);
    layer.add(g);
    layer.add(
      this.scene.add
        .text(0, 0, text, {
          fontFamily: FONT,
          fontSize: '14px',
          color: hex(COLORS.card),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    this.add(layer);
    this.badgeLayer = layer;
    return this;
  }

  private redraw(): void {
    const { width, height, radius, variant } = this.opts;
    const palette = paletteFor(variant);
    let fill = this.enabled ? palette.fill : COLORS.locked;
    if (this.enabled && this.pressed) fill = darken(fill, 0.1);

    this.bg.clear();
    this.bg.setAlpha(this.enabled ? 1 : 0.6);
    drawShadow(this.bg, -width / 2, -height / 2, width, height, radius, 6, 3);
    this.bg.fillStyle(fill, 1);
    this.bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    if (this.hovered && this.enabled && !this.pressed) {
      this.bg.fillStyle(COLORS.card, 0.14);
      this.bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    }
    this.label.setColor(hex(this.enabled ? palette.text : COLORS.inkMuted));
    this.label.setAlpha(this.enabled ? 1 : 0.75);
  }
}

export interface IconButtonOptions {
  x: number;
  y: number;
  icon: IconDrawer;
  onClick: () => void;
  size?: number;
  iconSize?: number;
  lineWidth?: number;
  radius?: number;
  enabled?: boolean;
  fill?: number;
  iconColor?: number;
  /** Small pink pill, e.g. "AD" when the next use costs a rewarded video. */
  badge?: string;
  /** Caption under the button. */
  caption?: string;
}

/** Square toolbar button with a Graphics-drawn icon. */
export class IconButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly iconLayer: Phaser.GameObjects.Graphics;
  private readonly caption: Phaser.GameObjects.Text | null;
  private badgeLayer: Phaser.GameObjects.Container | null = null;
  private readonly opts: Required<Omit<IconButtonOptions, 'badge' | 'caption'>> & {
    badge?: string;
    caption?: string;
  };
  private pressed = false;
  private enabled: boolean;

  constructor(scene: Phaser.Scene, options: IconButtonOptions) {
    super(scene, options.x, options.y);

    const size = options.size ?? 56;
    this.opts = {
      size,
      // Spec: 30px icon drawn with a 5px stroke inside a 56px button.
      iconSize: Math.round(size * 0.54),
      lineWidth: Math.max(3, size * 0.089),
      radius: RADIUS.button,
      enabled: true,
      fill: COLORS.accentSoft,
      iconColor: COLORS.iconInk,
      ...options,
    };
    this.enabled = this.opts.enabled;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.iconLayer = scene.add.graphics();
    this.opts.icon(this.iconLayer, this.opts.iconSize, this.opts.iconColor, this.opts.lineWidth);
    this.add(this.iconLayer);

    this.caption = options.caption
      ? scene.add
          .text(0, this.opts.size / 2 + 14, options.caption, {
            fontFamily: FONT,
            fontSize: '15px',
            color: hex(COLORS.inkSoft),
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
      : null;
    if (this.caption) this.add(this.caption);

    setCenteredHitArea(this, this.opts.size, this.opts.size);

    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.setPressed(true);
    });
    this.on('pointerout', () => this.setPressed(false));
    this.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.setPressed(false);
      if (!this.enabled || !wasPressed) return;
      this.opts.onClick();
    });

    this.redraw();
    this.setBadge(options.badge);
    scene.add.existing(this);
  }

  private setPressed(value: boolean): void {
    this.pressed = value;
    this.setScale(value ? 0.9 : 1);
    this.redraw();
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.redraw();
    return this;
  }

  setBadge(text?: string): this {
    this.badgeLayer?.destroy();
    this.badgeLayer = null;
    if (!text) return this;

    const layer = this.scene.add.container(this.opts.size / 2 - 6, -this.opts.size / 2 + 4);
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.pink, 1);
    g.fillRoundedRect(-17, -11, 34, 22, 11);
    layer.add(g);
    layer.add(
      this.scene.add
        .text(0, 0, text, {
          fontFamily: FONT,
          fontSize: '13px',
          color: hex(COLORS.card),
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    this.add(layer);
    this.badgeLayer = layer;
    this.badgeLayer.setAlpha(this.enabled ? 1 : 0.4);
    return this;
  }

  private redraw(): void {
    const { size, radius, fill } = this.opts;
    const base = this.pressed && this.enabled ? darken(fill, 0.1) : fill;

    this.bg.clear();
    this.bg.fillStyle(base, 1);
    this.bg.fillRoundedRect(-size / 2, -size / 2, size, size, radius);
    // "Disabled = 40% alpha" applies to the whole control.
    this.setAlpha(this.enabled ? 1 : 0.4);
    this.badgeLayer?.setAlpha(this.enabled ? 1 : 0.4);
  }
}

// -------------------------------------------------------------------- feel

/** Expanding ring left behind where an arrow lifted off. */
export function rippleRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  layer?: Phaser.GameObjects.Container,
): void {
  const ring = scene.add.graphics();
  ring.lineStyle(4, color, 1);
  ring.strokeCircle(0, 0, radius);
  ring.setPosition(x, y);
  ring.setScale(0.4);
  if (layer) layer.add(ring);

  scene.tweens.add({
    targets: ring,
    scale: 1.5,
    alpha: 0,
    duration: 460,
    ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** Celebration burst in accent / pink / amber. */
export function confetti(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count = 46,
  layer?: Phaser.GameObjects.Container,
): void {
  const palette = [COLORS.accent, COLORS.pink, COLORS.amber];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 180 + Math.random() * 300;
    const color = palette[i % palette.length]!;
    const size = 7 + Math.random() * 8;

    const piece = scene.add.graphics();
    piece.fillStyle(color, 1);
    piece.fillRoundedRect(-size / 2, -size / 4, size, size / 2, size / 6);
    piece.setPosition(x, y);
    piece.setAngle(Math.random() * 360);
    if (layer) layer.add(piece);

    scene.tweens.add({
      targets: piece,
      x: x + Math.cos(angle) * speed,
      y: y + Math.sin(angle) * speed + 120,
      angle: piece.angle + (Math.random() * 480 - 240),
      alpha: 0,
      duration: 700 + Math.random() * 420,
      ease: 'Quad.easeOut',
      onComplete: () => piece.destroy(),
    });
  }
}

/** Short lived message near the bottom of the screen. */
export function toast(scene: Phaser.Scene, message: string, color = COLORS.ink): void {
  const cam = scene.cameras.main;
  const layer = scene.add.container(cam.width / 2, cam.height - 250).setDepth(1000);

  const text = scene.add
    .text(0, 0, message, {
      fontFamily: FONT,
      fontSize: '24px',
      color: hex(color),
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  const width = text.width + 52;
  const height = 60;
  const bg = scene.add.graphics();
  drawCard(bg, -width / 2, -height / 2, width, height, height / 2);

  layer.add(bg);
  layer.add(text);

  scene.tweens.add({
    targets: layer,
    alpha: { from: 0, to: 1 },
    y: cam.height - 282,
    duration: 170,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: layer,
        alpha: 0,
        delay: 1200,
        duration: 260,
        onComplete: () => layer.destroy(),
      });
    },
  });
}

/** Header used by the non-gameplay scenes. */
export function addTitle(scene: Phaser.Scene, y: number, text: string, size = 42): Phaser.GameObjects.Text {
  return scene.add
    .text(scene.cameras.main.width / 2, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: hex(COLORS.ink),
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
}

/** The "ARROW Escape" wordmark card, shared by Boot and Menu. */
export function buildLogoCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width = 420,
  height = 200,
): Phaser.GameObjects.Container {
  const layer = scene.add.container(x, y);

  const bg = scene.add.graphics();
  drawCard(bg, -width / 2, -height / 2, width, height, RADIUS.card);
  layer.add(bg);

  const mark = scene.add.graphics();
  drawPolyArrow(
    mark,
    [
      { x: 30, y: -height * 0.24 },
      { x: -14, y: -height * 0.24 },
      { x: -14, y: -height * 0.05 },
    ],
    9,
    COLORS.accent,
    'R',
    52,
  );
  layer.add(mark);

  layer.add(
    scene.add
      .text(0, height * 0.04, 'ARROW', {
        fontFamily: FONT,
        fontSize: '58px',
        color: hex(COLORS.accent),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(6),
  );

  layer.add(
    scene.add
      .text(0, height * 0.28, 'Escape', {
        fontFamily: FONT,
        fontSize: '34px',
        color: hex(COLORS.pink),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(4),
  );

  return layer;
}
