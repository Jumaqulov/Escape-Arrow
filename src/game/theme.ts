/**
 * Light, minimal, premium hypercasual palette.
 *
 * Everything on screen is Phaser Graphics + Text: no raster assets, no web
 * fonts, no CDN. The whole look is a pale board, ink-black line art and one
 * indigo accent, with pink and amber as the only other voices.
 */
import type { Dir } from '../core/types';
import { progress } from './progress';

export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

const BASE_COLORS = {
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
  /** Affirmative feedback: the hold-preview saying "this one can leave". */
  ok: 0x14a06d,
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
  /** Drifting background blobs. */
  ambient: 0x3b4acb,
  /** Colour the soft shadows are built from. */
  shadow: 0x14161f,
};

/**
 * The live palette. Every widget reads these fields at draw time, so swapping
 * chapter re-skins the whole game without threading a theme object through
 * every constructor.
 */
export const COLORS = { ...BASE_COLORS };

/**
 * One palette per chapter. Progress is the thing players actually feel, and
 * an identical board for 150 levels is what makes a puzzle game feel endless
 * in the bad way - so each chapter owns a distinct hue.
 *
 * Only the hues move: contrast, ink darkness and dot weight stay matched so
 * readability is identical in all three.
 */
export const CHAPTER_PALETTES: Array<Partial<typeof BASE_COLORS>> = [
  // 1 - Rocket: indigo on cool paper.
  {},
  // 2 - Comet: teal on sea glass.
  {
    bg: 0xe9f3f2,
    accent: 0x0e8f86,
    accentDark: 0x0a6f68,
    accentSoft: 0xd3e7e4,
    ink: 0x11201f,
    inkSoft: 0x4e6a67,
    inkMuted: 0x93b0ac,
    dot: 0xa8c6c2,
    iconInk: 0x4e6e6a,
    locked: 0xdceae8,
    lockInk: 0x93aeaa,
    ambient: 0x0e8f86,
  },
  // 3 - Nebula: violet on lilac.
  {
    bg: 0xf2edfa,
    accent: 0x7a3de8,
    accentDark: 0x5c2bb5,
    accentSoft: 0xe2d9f7,
    ink: 0x191026,
    inkSoft: 0x5f5175,
    inkMuted: 0xa89bc0,
    dot: 0xc3b4dc,
    iconInk: 0x655381,
    locked: 0xe7dff6,
    lockInk: 0xa294bd,
    ambient: 0x9b5de5,
  },
];

let activeChapter = 0;

/**
 * Re-skin the game for a chapter. Call this in a scene's `init()`, before
 * anything has been drawn.
 *
 * A bought theme pins the palette: `progress.themeChoice` 0..2 wins over the
 * chapter's own, and -1 (the default) keeps the chapter behaviour.
 */
export function applyChapterPalette(chapter: number): void {
  const choice = progress.themeChoice;
  const wanted = choice >= 0 ? choice : chapter;
  activeChapter = Math.max(0, Math.min(CHAPTER_PALETTES.length - 1, wanted));
  Object.assign(COLORS, BASE_COLORS, CHAPTER_PALETTES[activeChapter]);
}

export function currentChapterPalette(): number {
  return activeChapter;
}

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

/** Shared visual rhythm for gameplay feedback and ambient motion. */
export const GAME_FEEL = {
  snap: 110,
  response: 400,
  settle: 640,
  ambient: 6400,
} as const;

/** Clockwise rotation applied to an up-pointing glyph. */
export const DIR_ANGLES: Readonly<Record<Dir, number>> = { U: 0, R: 90, D: 180, L: 270 };

/**
 * Resting ink, one colour per direction. Reading a 90-arrow board a glyph at a
 * time is the slow part of the puzzle, and hue is scanned far faster than the
 * rotation of a dart - so direction gets a colour instead of only a shape.
 *
 * All four are ink weight: deep, desaturated and matched to within a few
 * points of the same relative luminance, so no direction shouts over the
 * others and a packed board still reads as line art on pale paper rather than
 * as a bag of primaries. Feedback colours stay bright on purpose (`danger`,
 * `ok`, `accent`), which is what keeps them separable from the ink.
 */
export const DIR_INK: Readonly<Record<Dir, number>> = {
  /** Deep navy. */
  U: 0x21477a,
  /** Deep brick red. */
  R: 0x8a3128,
  /** Deep forest green. */
  D: 0x1f5138,
  /** Dark amber. */
  L: 0x6b4410,
};

/**
 * A purchasable recolour of the arrow ink. Every `ink` set inherits DIR_INK's
 * contrast duty: four directions a player can tell apart at a glance on the
 * pale board, without any of them vanishing into the white card.
 */
export interface ArrowSkin {
  id: string;
  nameKey: string;
  price: number;
  ink: Record<Dir, number>;
}

/**
 * The shop's catalogue. Each paid set keeps classic's hue-per-direction logic
 * (cool = up, red = right, green = down, warm = left) where it can, so a
 * player who has internalised "blue means up" keeps that reflex across skins.
 * Mono deliberately gives that up: it is a single slate hue on a wide,
 * evenly-spaced value ladder, and direction leans on the head glyph plus the
 * ladder - the luxe-minimal look is the whole point of paying for it.
 */
export const ARROW_SKINS: ArrowSkin[] = [
  { id: 'classic', nameKey: 'skinClassic', price: 0, ink: { ...DIR_INK } },
  {
    id: 'neon',
    nameKey: 'skinNeon',
    price: 400,
    // Bright and saturated, but each still dark enough to hold an 8px line
    // against white; orange is the lightest and sits at the readable floor.
    ink: { U: 0x0e6fe8, R: 0xe8244e, D: 0x00a45a, L: 0xf07800 },
  },
  {
    id: 'pastel',
    nameKey: 'skinPastel',
    price: 400,
    // Softened, not washed out: candy hues at mid value, never tint-light.
    ink: { U: 0x6d83d1, R: 0xd4708f, D: 0x5cab84, L: 0xc79a4e },
  },
  {
    id: 'mono',
    nameKey: 'skinMono',
    price: 600,
    // One near-ink slate hue; the four steps are spaced far enough apart
    // that lightness alone separates the directions.
    ink: { U: 0x14161f, R: 0x363d52, D: 0x59637f, L: 0x7f89a6 },
  },
  {
    id: 'gold',
    nameKey: 'skinGold',
    price: 900,
    // Amber and bronze, but each direction keeps a hue tilt - brown-bronze,
    // russet copper, olive, bright amber - so the set is luxe without
    // collapsing into four indistinguishable golds.
    ink: { U: 0x6d4712, R: 0xa8431c, D: 0x6b6b14, L: 0xc08a0a },
  },
];

/**
 * The live arrow ink, exactly like COLORS: gameplay reads these fields at
 * draw time, and applying a skin assigns into them rather than swapping the
 * object, so nothing has to be re-threaded through constructors.
 */
export const ARROW_INK: Record<Dir, number> = { ...DIR_INK };

/** Apply an owned skin's ink set. Unknown ids fall back to classic. */
export function applyArrowSkin(id: string): void {
  const skin = ARROW_SKINS.find((s) => s.id === id) ?? ARROW_SKINS[0]!;
  Object.assign(ARROW_INK, skin.ink);
}

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
