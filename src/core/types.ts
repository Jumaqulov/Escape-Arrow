/**
 * Arrow Escape - core types. Level format v2: an arrow is a head plus an
 * orthogonal tail, so the board holds polylines rather than single cells.
 *
 * Engine independent: this file must never import Phaser or touch the DOM.
 */

/** Direction the head points / travels in. */
export type Dir = 'U' | 'R' | 'D' | 'L';

/** All directions, in clockwise order starting at Up. */
export const DIRS: readonly Dir[] = ['U', 'R', 'D', 'L'] as const;

/** Horizontal step for a direction (grid x grows to the right). */
export const DX: Readonly<Record<Dir, number>> = { U: 0, R: 1, D: 0, L: -1 };

/** Vertical step for a direction (grid y grows downwards). */
export const DY: Readonly<Record<Dir, number>> = { U: -1, R: 0, D: 1, L: 0 };

/** Character used for each direction on disk. */
export const DIR_CHARS: Readonly<Record<Dir, string>> = { U: 'U', R: 'R', D: 'D', L: 'L' };

/** Reverse of DIR_CHARS. */
export const CHAR_DIRS: Readonly<Record<string, Dir>> = { U: 'U', R: 'R', D: 'D', L: 'L' };

/** A grid coordinate. */
export interface Cell {
  x: number;
  y: number;
}

/**
 * One arrow: a head cell plus a tail that trails behind it.
 *
 * `tail[0]` is orthogonally adjacent to `head`, `tail[i+1]` to `tail[i]`, and
 * no cell repeats - so head+tail is a simple orthogonal polyline. The tail
 * never sits on the head's own escape ray.
 */
export interface Arrow {
  /** Stable identity for the lifetime of a board instance. */
  id: number;
  head: Cell;
  /** Where the head points, and therefore where the whole arrow flies. */
  dir: Dir;
  /** Body cells behind the head, nearest first. May be empty. */
  tail: Cell[];
}

/** Mutable playable state. */
export interface Board {
  w: number;
  h: number;
  arrows: Arrow[];
}

/**
 * Serialized arrow. The tail is stored as relative steps from the head, which
 * keeps levels.json compact and readable: `{"x":2,"y":0,"d":"R","t":"DDL"}`.
 */
export interface LevelArrow {
  x: number;
  y: number;
  d: Dir;
  t: string;
}

/** Serialized level, the shape stored inside levels.json. */
export interface LevelData {
  id: number;
  w: number;
  h: number;
  arrows: LevelArrow[];
}

/** A named group of levels. */
export interface Chapter {
  name: string;
  levels: LevelData[];
}

/** Bumped whenever the on-disk level shape changes incompatibly. */
export const PACK_VERSION = 2;

/** Top level shape of levels.json. */
export interface LevelPack {
  version: number;
  chapters: Chapter[];
  /**
   * One oversized boss board per chapter, index-aligned with `chapters`.
   * Optional so packs written before bosses existed still parse; parsePack
   * normalizes an absent list to [].
   */
  boss?: LevelData[];
}

/** Runtime guard for untrusted direction characters. */
export function isDir(value: string): value is Dir {
  return value === 'U' || value === 'R' || value === 'D' || value === 'L';
}

/** Opposite direction helper. */
export function opposite(dir: Dir): Dir {
  switch (dir) {
    case 'U':
      return 'D';
    case 'D':
      return 'U';
    case 'L':
      return 'R';
    case 'R':
      return 'L';
  }
}

/** Every cell this arrow occupies: head first, then the tail in order. */
export function arrowCells(arrow: Arrow): Cell[] {
  return [arrow.head, ...arrow.tail];
}

/** Pack a coordinate into a single number so it can key a Set/Map. */
export function cellKey(x: number, y: number, w: number): number {
  return y * w + x;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Are these two cells orthogonally adjacent? */
export function adjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}
