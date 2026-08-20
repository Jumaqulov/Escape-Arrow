import type Phaser from 'phaser';
import type { Dir } from '../../core/types';
import { DX, DY } from '../../core/types';
import { prefersReducedMotion } from '../motion';
import { GAME_FEEL } from '../theme';

export interface BoardFxBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** Blueprint-like details that give the white play surface a designed identity. */
export function drawBoardInstrumentation(
  graphics: Phaser.GameObjects.Graphics,
  bounds: BoardFxBounds,
  accent: number,
): void {
  const { x, y, width, height, radius } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;

  graphics.lineStyle(3, accent, 0.16);
  graphics.strokeRoundedRect(x + 2, y + 2, width - 4, height - 4, radius - 2);
  graphics.lineStyle(1.5, accent, 0.055);
  graphics.strokeRoundedRect(x + 13, y + 13, width - 26, height - 26, Math.max(8, radius - 8));

  // A quiet targeting field reads only in the gaps between arrows.
  graphics.lineStyle(1.5, accent, 0.04);
  const orbit = Math.min(width, height) * 0.2;
  graphics.strokeCircle(cx, cy, orbit);
  graphics.strokeCircle(cx, cy, orbit * 1.7);
}

/** A restrained scan travelling across the board; disabled for reduced motion. */
export function createBoardScan(
  scene: Phaser.Scene,
  bounds: BoardFxBounds,
  color: number,
  layer: Phaser.GameObjects.Container,
): Phaser.GameObjects.Graphics | null {
  if (prefersReducedMotion()) return null;

  const scan = scene.add.graphics();
  for (let i = 0; i < 7; i++) {
    const distance = i * 5;
    scan.lineStyle(2, color, Math.max(0.008, 0.055 - i * 0.007));
    scan.lineBetween(bounds.x + 18, distance, bounds.x + bounds.width - 18, distance);
  }
  scan.setY(bounds.y + 20);
  layer.add(scan);

  scene.tweens.add({
    targets: scan,
    y: bounds.y + bounds.height - 52,
    alpha: { from: 0.35, to: 0.9 },
    duration: GAME_FEEL.ambient,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return scan;
}

/** A board-wide response pulse for both successful and blocked taps. */
export function boardEnergyPulse(
  scene: Phaser.Scene,
  bounds: BoardFxBounds,
  color: number,
  layer: Phaser.GameObjects.Container,
  strong = false,
): void {
  const pulse = scene.add.graphics();
  const lineWidth = strong ? 8 : 5;
  pulse.lineStyle(lineWidth + 14, color, strong ? 0.15 : 0.1);
  pulse.strokeRoundedRect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, bounds.radius);
  pulse.lineStyle(lineWidth, color, strong ? 0.95 : 0.76);
  pulse.strokeRoundedRect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, bounds.radius);
  pulse.setPosition(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  pulse.setScale(0.985);
  layer.add(pulse);

  scene.tweens.add({
    targets: pulse,
    scale: strong ? 1.035 : 1.022,
    alpha: 0,
    duration: prefersReducedMotion() ? 120 : strong ? 700 : 560,
    ease: 'Quad.easeOut',
    onComplete: () => pulse.destroy(),
  });
}

/** Small directional shards at the lift-off point. */
export function launchSparks(
  scene: Phaser.Scene,
  x: number,
  y: number,
  dir: Dir,
  color: number,
  cell: number,
  layer: Phaser.GameObjects.Container,
): void {
  const dx = DX[dir];
  const dy = DY[dir];
  const nx = -dy;
  const ny = dx;
  const reduced = prefersReducedMotion();
  const count = reduced ? 4 : 9;

  for (let i = 0; i < count; i++) {
    const shard = scene.add.graphics();
    const length = cell * (0.12 + (i % 3) * 0.045);
    shard.lineStyle(i % 3 === 0 ? 5 : 3, i % 4 === 0 ? 0xffffff : color, 0.9);
    shard.lineBetween(-dx * length, -dy * length, dx * length, dy * length);
    const spread = ((i / Math.max(1, count - 1)) - 0.5) * cell * 0.9;
    shard.setPosition(x + nx * spread, y + ny * spread);
    layer.add(shard);

    scene.tweens.add({
      targets: shard,
      x: shard.x + dx * cell * (reduced ? 0.25 : 0.65),
      y: shard.y + dy * cell * (reduced ? 0.25 : 0.65),
      alpha: 0,
      scale: 0.35,
      duration: reduced ? 120 : 280 + (i % 3) * 45,
      ease: 'Quad.easeOut',
      onComplete: () => shard.destroy(),
    });
  }
}

/** Pink fragments make losing a heart feel physical instead of just disappearing. */
export function heartShatter(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
): void {
  const reduced = prefersReducedMotion();
  const count = reduced ? 4 : 10;
  for (let i = 0; i < count; i++) {
    const fragment = scene.add.graphics().setDepth(160);
    const size = 5 + (i % 3) * 2;
    fragment.fillStyle(i % 3 === 0 ? 0xffffff : color, 1);
    fragment.fillTriangle(0, -size, size * 0.7, size, -size * 0.7, size);
    fragment.setPosition(x, y);

    const angle = -Math.PI + (i / Math.max(1, count - 1)) * Math.PI;
    const distance = reduced ? 18 : 34 + (i % 4) * 8;
    scene.tweens.add({
      targets: fragment,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance + (reduced ? 8 : 30),
      angle: (i % 2 === 0 ? 1 : -1) * 160,
      alpha: 0,
      duration: reduced ? 140 : 360 + (i % 3) * 60,
      ease: 'Quad.easeOut',
      onComplete: () => fragment.destroy(),
    });
  }
}
