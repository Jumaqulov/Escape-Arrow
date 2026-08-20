import type Phaser from 'phaser';
import type { Cell, Dir } from '../../core/types';

/** Rotation clockwise from a right-pointing head. */
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

/** The three corners of the head dart around the point where its shaft ends. */
export function arrowHeadPoints(x: number, y: number, dir: Dir, cell: number): HeadPoints {
  const angle = (HEAD_ANGLE[dir] * Math.PI) / 180;
  const roundedX = Math.round(Math.cos(angle));
  const roundedY = Math.round(Math.sin(angle));
  const ux = Object.is(roundedX, -0) ? 0 : roundedX;
  const uy = Object.is(roundedY, -0) ? 0 : roundedY;
  const nx = -uy;
  const ny = ux;

  const length = cell * HEAD_LENGTH;
  const halfWidth = cell * HEAD_HALF_WIDTH;

  return {
    tip: { x: x + ux * length, y: y + uy * length },
    left: { x: x + nx * halfWidth, y: y + ny * halfWidth },
    right: { x: x - nx * halfWidth, y: y - ny * halfWidth },
    forward: { x: ux, y: uy },
  };
}

/** Draw a rounded polyline with a filled dart at its first point. */
export function drawPolyArrow(
  graphics: Phaser.GameObjects.Graphics,
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
    graphics.lineStyle(lineWidth, color, alpha);
    graphics.beginPath();
    graphics.moveTo(head.x, head.y);
    for (let i = 1; i < points.length; i++) graphics.lineTo(points[i]!.x, points[i]!.y);
    graphics.strokePath();
  }

  // Phaser Graphics has no rounded line caps, so cap the joints manually.
  graphics.fillStyle(color, alpha);
  for (const point of points) graphics.fillCircle(point.x, point.y, lineWidth / 2);

  const dart = arrowHeadPoints(head.x, head.y, dir, cell);
  graphics.fillTriangle(dart.tip.x, dart.tip.y, dart.left.x, dart.left.y, dart.right.x, dart.right.y);
}

/** Draw a soft stacked halo behind an arrow. */
export function drawPolyArrowGlow(
  graphics: Phaser.GameObjects.Graphics,
  points: Cell[],
  lineWidth: number,
  color: number,
  dir: Dir,
  cell: number,
  layers = 3,
): void {
  for (let i = layers - 1; i >= 0; i--) {
    drawPolyArrow(graphics, points, lineWidth + i * 6, color, dir, cell, 0.1);
  }
}
