/**
 * Arrow Escape - level (de)serialization, format v2.
 *
 * On disk an arrow is its head plus the tail as relative steps, which stays
 * short and diffable:
 *   { "id": 1, "w": 6, "h": 6, "arrows": [ {"x":2,"y":0,"d":"R","t":"DDL"} ] }
 *
 * "t" reads as: from the head, step Down, Down, Left. An empty "t" is a bare
 * head with no tail.
 */
import type { Arrow, Board, Cell, LevelArrow, LevelData, LevelPack } from './types';
import { CHAR_DIRS, DIR_CHARS, DX, DY, PACK_VERSION, adjacent, isDir } from './types';

/** Turn one arrow into its serialized form. */
export function serializeArrow(arrow: Arrow): LevelArrow {
  let previous: Cell = arrow.head;
  let steps = '';

  for (const cell of arrow.tail) {
    if (!adjacent(previous, cell)) {
      throw new Error(
        `serializeArrow: arrow ${arrow.id} jumps from ${previous.x},${previous.y} to ${cell.x},${cell.y}`,
      );
    }
    const dx = cell.x - previous.x;
    const dy = cell.y - previous.y;
    const dir = (Object.keys(DX) as Array<keyof typeof DX>).find((d) => DX[d] === dx && DY[d] === dy);
    if (!dir) throw new Error(`serializeArrow: arrow ${arrow.id} has a diagonal step`);
    steps += DIR_CHARS[dir];
    previous = cell;
  }

  return { x: arrow.head.x, y: arrow.head.y, d: arrow.dir, t: steps };
}

/** Board -> LevelData. */
export function serializeLevel(board: Board, id: number): LevelData {
  return { id, w: board.w, h: board.h, arrows: board.arrows.map(serializeArrow) };
}

/** Rebuild one arrow from its serialized form. Ids come from the caller. */
export function parseArrow(entry: LevelArrow, id: number): Arrow {
  if (typeof entry.x !== 'number' || typeof entry.y !== 'number') {
    throw new Error(`parseArrow: arrow ${id} is missing its head coordinates`);
  }
  if (!isDir(entry.d)) {
    throw new Error(`parseArrow: arrow ${id} has unknown direction "${String(entry.d)}"`);
  }

  const head: Cell = { x: entry.x, y: entry.y };
  const tail: Cell[] = [];
  let cursor: Cell = head;

  for (const ch of entry.t ?? '') {
    const step = ch.toUpperCase();
    if (!isDir(step)) {
      throw new Error(`parseArrow: arrow ${id} has unknown tail step "${ch}"`);
    }
    const dir = CHAR_DIRS[step]!;
    cursor = { x: cursor.x + DX[dir], y: cursor.y + DY[dir] };
    tail.push(cursor);
  }

  return { id, head, dir: entry.d, tail };
}

/**
 * LevelData (or its JSON text) -> playable Board.
 * Arrow ids are assigned in file order, so they are stable across reloads.
 */
export function parseLevel(source: LevelData | string): Board {
  const data: LevelData = typeof source === 'string' ? (JSON.parse(source) as LevelData) : source;

  if (!data || typeof data.w !== 'number' || typeof data.h !== 'number' || !Array.isArray(data.arrows)) {
    throw new Error('parseLevel: malformed level, expected { id, w, h, arrows }');
  }

  const arrows = data.arrows.map((entry, index) => parseArrow(entry, index + 1));
  return { w: data.w, h: data.h, arrows };
}

/** Parse the whole levels.json payload with a shape and version check. */
export function parsePack(source: LevelPack | string): LevelPack {
  const pack: LevelPack = typeof source === 'string' ? (JSON.parse(source) as LevelPack) : source;

  if (!pack || !Array.isArray(pack.chapters)) {
    throw new Error('parsePack: malformed pack, expected { version, chapters: [...] }');
  }
  if (pack.version !== PACK_VERSION) {
    throw new Error(
      `parsePack: levels.json is version ${String(pack.version)}, this build needs ${PACK_VERSION} - run "npm run generate"`,
    );
  }
  for (const chapter of pack.chapters) {
    if (typeof chapter.name !== 'string' || !Array.isArray(chapter.levels)) {
      throw new Error('parsePack: malformed chapter, expected { name, levels: [...] }');
    }
  }
  return pack;
}

/** Pretty-print a pack with one level per line - small diffs, readable file. */
export function serializePack(pack: LevelPack): string {
  const chapters = pack.chapters
    .map((chapter) => {
      const levels = chapter.levels.map((lvl) => `        ${JSON.stringify(lvl)}`).join(',\n');
      return `    {\n      "name": ${JSON.stringify(chapter.name)},\n      "levels": [\n${levels}\n      ]\n    }`;
    })
    .join(',\n');
  return `{\n  "version": ${PACK_VERSION},\n  "chapters": [\n${chapters}\n  ]\n}\n`;
}
