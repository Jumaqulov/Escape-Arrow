# Arrow Escape

A dense grid puzzle for **Yandex Games** and **CrazyGames**.

The board is packed with arrows, each one a head with a tail trailing behind
it. Tap an arrow and the whole thing slides off the board — but only if the
head's straight path to the edge is empty. Anything in the way and it stays
put, costing a heart. Clear every arrow before the clock runs out.

Built with **Vite + TypeScript (strict) + Phaser 3**. No sprites, no images, no
raster assets, no web fonts: every pixel on screen is drawn with
`Phaser.Graphics`. The current production bundle is **~395 KiB gzipped**.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

With no portal SDK present the game falls back to `stubSdk`, which stores
progress in `localStorage` and grants every rewarded ad instantly, so the
hint / eraser / grid / refill flows can all be exercised offline.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm test` | Run the Node regression suite for rules, generation, saves, tutorials, and extracted geometry |
| `npm run typecheck` | Check strict TypeScript without emitting files |
| `npm run build` | Type-check (`tsc --noEmit`) then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally, exactly as a portal would |
| `npm run validate` | Solve-check all 150 campaign levels and 3 bosses + print the difficulty spread |
| `npm run generate` | Regenerate `src/levels/levels.json` deterministically |
| `npm run sounds` | Regenerate the four WAVs in `public/sounds/` |
| `npm run zip` | Package `dist/` into `release/arrow-escape.zip` |
| `npm run release` | `validate` → `build` → `zip` in one go |

`npm run validate` is a hard gate: it exits non-zero if any level is
unsolvable, malformed, duplicated, or outside its chapter's design budget.

```
Chapter 1: 50 levels | arrows 5-67  (avg 54.9) | cells 209.3 | density 90.4% | openings 16.3
Chapter 2: 50 levels | arrows 43-81 (avg 67.0) | cells 303.4 | density 93.0% | openings 19.0
Chapter 3: 50 levels | arrows 54-103 (avg 83.4) | cells 413.2 | density 93.8% | openings 21.9
Boss 1: 15x19 | 79 arrows  | density 95.1% | openings 19
Boss 2: 18x22 | 101 arrows | density 93.9% | openings 23
Boss 3: 20x26 | 118 arrows | density 93.1% | openings 41
OK - all 150 levels and 3 bosses are solvable and within budget.
```

---

## How the puzzle works

An arrow is a **head cell plus an orthogonal tail**: `tail[0]` is adjacent to
the head, `tail[i+1]` to `tail[i]`, no cell repeats. The cells it occupies are
head + tail.

`isFree(arrow, board)` walks from the **head** towards the edge in the arrow's
own direction and returns false the moment it meets a cell belonging to another
arrow.

The key property: **removing an arrow can only empty cells, never fill them.**
So freedom is monotone — an arrow that is free stays free no matter what else
you take first. Two consequences:

1. A single greedy sweep is an **exact** solvability test. `solve()` needs no
   search and no backtracking.
2. The *puzzle* has no lose state. A validated board cannot be bricked, so
   hearts and the clock are the only pressure, and both refill.

That monotonicity is also why the **Eraser** tool is safe: deleting an arrow
outright only ever frees cells, so the rest of the board stays solvable.

### Two invariants the renderer depends on

- **The tail never sits on its own head's ray**, so an arrow can always slide
  out through its own body.
- **The neck rule**: `tail[0]` is always `head - dir`, giving every head a
  straight shaft to grow out of. Without it a head whose tail turns immediately
  reads as pointing along the tail, which looks like a rotation bug.

Both are enforced by the generator *and* re-checked by `structuralErrors()`, so
a hand-written level cannot smuggle in a violation.

### The generators build levels backwards

Both the reusable generator in `src/core/generator.ts` and the density-first
campaign packer in `scripts/generate-levels.ts` start from an empty board and
add arrows one at a time:

1. place a **head** whose ray to the edge is clear of every occupied cell, and
   which has a free cell directly behind it for the neck;
2. lay the **neck**;
3. grow the rest of the **tail** by a random walk through empty cells, never
   touching the head's own ray.

The arrows already placed are exactly the ones still on the board when the new
one is tapped, so replaying the placement order in reverse is a guaranteed
solution. The tail *is* free to lie across an **earlier** arrow's ray — that
arrow is tapped later, by which time this one is long gone. That is what turns
a pile of arrows into a dependency chain.

The shipped campaign and boss boards use the density-first packer. Two
most-constrained-first heuristics let it reach roughly 93–96% occupancy:

- heads are placed where the fewest legal direction choices remain, with deeper
  cells winning ties;
- tail walks consume dead-end pockets first, before those cells become
  unreachable.

The reusable core generator remains the source for the locally generated daily
challenge. Both implementations preserve the same reverse-construction
solvability invariant.

Everything is seeded (Mulberry32), so `npm run generate` is reproducible: the
same `BASE_SEED` always yields the same 150 campaign levels and 3 bosses.

### Level format (v2)

```json
{
  "version": 2,
  "chapters": [
    { "name": "Chapter 1", "levels": [
      { "id": 1, "w": 8, "h": 10, "arrows": [ { "x": 3, "y": 3, "d": "L", "t": "RU" } ] }
    ] }
  ]
}
```

`x`/`y` are the head, `d` is the direction it flies in, and `t` is the tail as
**relative steps from the head** — `"RU"` reads as "from the head, step Right,
then Up". `parsePack()` refuses anything that is not `version: 2`.

### The difficulty ramp

Level 1 is the one deliberately tiny board (5 arrows), reserved for the tap
tutorial. From level 2 the board is already busy, on a front-loaded `t^0.42`
curve — a sparse board is solved on sight, which is what makes players bounce.
The first two campaign boards are eligible for a one-time tap coach mark.

```
level:     1   2   5  25  50  75 100 125 150
grid:   8x10 12x16 13x16 13x17 14x18 16x20 17x21 18x24 19x25
arrows:    5  45  44  50  67  65  81  79  99
```

| Chapter | Campaign grids | Arrow range | Tail range | Boss |
| --- | --- | --- | --- | --- |
| 1 | 8×10 opener; 12×16 → 14×18 | 5–67 | 1–5 | 15×19, 79 arrows |
| 2 | 14×18 → 17×21 | 43–81 | 1–7 | 18×22, 101 arrows |
| 3 | 17×21 → 19×25 | 54–103 | 1–9 | 20×26, 118 arrows |

---

## Playing

### Camera

The largest 20×26 boss board squeezed into a 720 px canvas would produce cells
that are too small for a thumb. So the board is drawn at a **fixed 48 px cell
in world space** and the whole world is scaled to fit; the player zooms in from
there.

- mouse wheel, or the +/− buttons beside the toolbar
- drag to pan, at a speed set by the sensitivity slider (0.5–2×)
- movement past 12 px counts as a pan, so a drag never fires a tap
- an axis the board already fits on is pinned dead centre; only an
  overflowing axis can be panned, and only as far as its own edge
- a one-off coach mark explains the zoom the first time a board overflows

### Reading the board

Each direction has its own ink — deep navy up, brick red right, forest green down,
dark amber left — all matched to within a few points of the same luminance, so a
90-arrow board still reads as line art rather than a bag of primaries.

Press and hold an arrow for 150ms to ask whether it can leave: free arrows glow
green and trace their exit lane, blocked ones show a stop mark on the offending
cell. Releasing after a hold is a query, not a move — it never launches and never
costs a heart.

### Hearts and the clock

Three hearts. A tap on a blocked arrow wiggles it, flashes it red, vibrates,
draws the obstructed stretch of ray in red — so the player can see *why* — and
costs one heart.

The clock starts at `30s + 2s per arrow`, capped at 150s — generous enough to think, tight enough that you cannot coast. At zero, or at zero hearts, the same
modal offers a rewarded video (+3 hearts, or +60 s) or 450 coins.

### Tools

Each is introduced by its own unlock ceremony and arrives with 2 charges.

| Tool | Unlocks | Effect |
| --- | --- | --- |
| Hint | level 2 | Highlights an arrow that can exit |
| Eraser | level 3 | Deletes whichever arrow you pick, free or not |
| Grid | level 4 | Overlays guideline grid lines |

Out of charges, the tool opens a shop: one charge for a rewarded video, or a
pack of 3 for 200 coins.

### Coins

`+10` per clear, plus an optional rewarded `+200` on the win screen. A first
boss clear pays `+500`; daily rewards start at `+60`, add `+30` per consecutive
day, and cap at `+300`. Coins are spent on tool packs, rescues, arrow skins, and
colour themes.

### Stars

| Stars | Condition |
| --- | --- |
| 3 | cleared with **no** hints and **no** undos |
| 2 | 1–2 hints/undos used |
| 1 | 3 or more used |

No timed stars — the clock is a fail condition, never a scoring one.

### Daily challenge and bosses

- **Daily** — generated locally from the player's calendar date. Replays remain
  available after a win, but the streak reward is paid only once per day.
- **Bosses** — one oversized board per chapter, unlocked at 90 stars in that
  chapter. The `+500` reward is paid only on the first clear.
- **Shop** — unlockable arrow skins and board palettes share the same coin
  economy as tools and rescues.

---

## Look

Light, minimal line art. Each chapter owns a hue, so progress is something the
player can see: **indigo** (Rocket) → **teal** (Comet) → **violet** (Nebula).
Only the hues move — ink darkness, contrast and dot weight are matched across
all three, so readability is identical.

Two Phaser limits shape the drawing code:

- `Graphics` cannot blur, so soft shadows and the drifting background blobs are
  stacks of translucent shapes;
- `Graphics` has no line cap/join setting, so every stroked shape caps its own
  corners with a filled circle of half the line width. That is what makes the
  arrows read as rounded line art rather than mitred sticks.

Head orientation comes from a single `HEAD_ANGLE` map (`{R:0, D:90, L:180,
U:270}`) — never re-derived from `DX/DY` — and `src/game/devcheck.ts` asserts it
in dev builds. It is tree-shaken out of production.

When an arrow flies out, the body is drawn as the **slice of its track between
two arc lengths**, corner vertices included. Sampling only the original cell
centres would chord across each bend and the arrow would come out skewed.

---

## Project layout

```
src/
  main.ts          Phaser config, scene registration, lifecycle save hooks
  core/            engine-independent game logic (no Phaser, no DOM)
    types.ts       Arrow (head + dir + tail), Cell, Board, LevelData, Dir, DX/DY
    rules.ts       isFree(), freeArrows(), blockerOf(), solve(), analyze(),
                   structuralErrors(), validate()
    generator.ts   mulberry32() + reverse-build generateLevel()
    format.ts      parseLevel() / serializeLevel() / parsePack() / serializePack()
  sdk/             ISdk + Yandex / CrazyGames adapters + runtime detection
  game/
    audio.ts       sound loading/playback helpers
    levels.ts      campaign refs, boss lookup, seeded daily generation
    theme.ts       palette, chapter palettes, radii, font stack
    i18n.ts        EN / RU / TR / ES / PT / UZ dictionary
    progress.ts    stars, unlocks, economy, daily/boss state, settings
    tutorial.ts    one-time opening-board coach eligibility
    level/
      flightPath.ts  sampled flight geometry and corner-preserving path slices
    ui.ts          buttons, icons, cards, modals, and effects
    ui/
      arrow.ts     arrow-head geometry, line renderer, and glow
    devcheck.ts    dev-only invariants (arrow head rotation)
    scenes/        Boot, Menu, LevelSelect, Level, Win, Settings, Shop
  levels/levels.json   150 campaign levels + 3 bosses, format v2
scripts/           generate / validate / sounds / zip
tests/             Node regression tests (`npm test`)
public/            privacy.html, favicon, sounds
```

`src/core/` never imports Phaser and never touches the DOM, so the rules run
from Node — which is exactly what the level scripts do.

---

## Platform integration

`src/sdk/sdk.ts` picks the adapter at runtime, injects that portal's script tag,
and falls back to `stubSdk` if anything is missing. **One `dist/` ships to both
portals.** Detection order: `?platform=` query → `VITE_PLATFORM` → an already
present `window.YaGames` / `window.CrazyGames` → hostname/referrer sniffing →
stub.

Both adapters call `gameplayStop()` before every ad and `gameplayStart()`
afterwards, and every ad callback is wrapped in a timeout so a portal that never
fires `onClose` cannot wedge the game.

```bash
npm run dev
# http://localhost:5173/?platform=stub          (default)
# http://localhost:5173/?platform=yandex
# http://localhost:5173/?platform=crazygames
```

### Publishing

```bash
npm run release          # validate + build + zip
```

Upload `release/arrow-escape.zip` to the
[Yandex console](https://games.yandex.ru/console) or the
[CrazyGames portal](https://developer.crazygames.com/), and supply the URL of
the deployed `privacy.html`. The build calls `LoadingAPI.ready()` /
`loadingStop()` when the bar hits 100% and brackets ads with gameplay
start/stop, which are the two things moderation checks most often.

Cloud save runs through `ysdk.getPlayer()` on Yandex; anonymous players and
CrazyGames fall back to `localStorage`. The save schema is at **version 5** and
repairs anything an older or corrupted write left behind. On Yandex, the newer
`savedAt` timestamp wins when cloud data and the local mirror disagree.

---

## Ads

- **Interstitial** — cadence is driven by the campaign completion counter and
  the ad is shown only when leaving the win screen, so it never interrupts play.
- **Rewarded** — always optional, never a wall:
  - `+200` coins on the win screen
  - one tool charge, from the tool shop
  - +3 hearts or +60 seconds, from the rescue modal

Locally, `stubSdk` grants every rewarded ad instantly.

---

## Adding or changing levels

```bash
# edit CHAPTERS / OPENER / BASE_SEED in scripts/generate-levels.ts, then
npm run generate
npm run validate
```

Hand-written levels are fine too — add them in the same format and
`npm run validate` will solve-check them and check the tail and neck geometry.

## Constraints honoured

- `src/core/*` is engine-independent and never imported by anything needing a browser
- Phaser 3 only; `Phaser.Graphics` only, no raster sprites, no web fonts, no CDN
- tap input only for gameplay; drag and wheel drive the camera, never the puzzle
- stars come from hints/undos, never from a timer
- `ISdk` and its two adapters, and every scene key, are unchanged since v1
- TypeScript `strict` with `noUnusedLocals` / `noUnusedParameters`
