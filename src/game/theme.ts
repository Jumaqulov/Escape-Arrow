/**
 * Light, minimal, premium hypercasual palette.
 *
 * Everything on screen is Phaser Graphics + Text: no raster assets, no web
 * fonts, no CDN. The whole look is a pale board, ink-black line art and one
 * indigo accent, with pink and amber as the only other voices.
 */
import type { Dir } from '../core/types';

export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

export const COLORS = {
  /** Page background. */
  bg: 0xeef2f8,
  /** Cards, pills, the board surface. */
  card: 0xffffff,
  /** Arrow line art and primary text. */
  ink: 0x14161f,
  /** Secondary text. */
  inkSoft: 0x5a6172,
  /** Tertiary text, disabled labels. */
  inkMuted: 0x9aa3b5,
  /** Primary accent: flying arrows, primary buttons. */
  accent: 0x3b4acb,
  accentDark: 0x2e3aa5,
  /** Tinted fill for toolbar buttons and inactive tabs. */
  accentSoft: 0xdde1f0,
  /** Secondary accent. */
  pink: 0xf04a86,
  /** Blocked feedback, heart loss. */
  danger: 0xe5484d,
  /** Stars. */
  amber: 0xf5a524,
  /** Board dot grid. */
  dot: 0xb9c0d4,
  /** Locked level tiles. */
  locked: 0xe3e7f2,
  /** Toolbar icon strokes. */
  iconInk: 0x5a6280,
  /** The padlock on a locked tile. */
  lockInk: 0x9aa3bd,
  /** Colour the soft shadows are built from. */
  shadow: 0x14161f,
};

/** Widest a UI column ever gets, so wide canvases keep a readable measure. */
export const COLUMN_MAX = 560;

/** Soft card shadow, rgba(20,22,31,0.08). */
export const SHADOW_ALPHA = 0.08;

/** Standard corner radii. */
export const RADIUS = {
  card: 20,
  pill: 18,
  tile: 16,
  button: 14,
};

/** Clockwise rotation applied to an up-pointing glyph. */
export const DIR_ANGLES: Readonly<Record<Dir, number>> = { U: 0, R: 90, D: 180, L: 270 };

/**
 * System rounded stack - nothing is fetched. Nunito and Arial Rounded MT Bold
 * are the intended faces; system-ui keeps Windows and Android rounded-ish
 * rather than dropping straight to a generic grotesque.
 */
export const FONT = '"Nunito", "Arial Rounded MT Bold", system-ui, -apple-system, sans-serif';

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Multiply a packed colour towards black. `amount` 0.1 = 10% darker. */
export function darken(color: number, amount: number): number {
  const k = 1 - amount;
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * k)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * k)));
  return (r << 16) | (g << 8) | b;
}

/**
 * A centred content column. Everything that is not the board lives inside one
 * of these, so a wide canvas never stretches a button row across the screen.
 */
export function columnBounds(width: number, margin = 80): { x: number; width: number } {
  const w = Math.min(width - margin, COLUMN_MAX);
  return { x: (width - w) / 2, width: w };
}

/** Mix two packed colours, `t` from 0 (a) to 1 (b). */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
