# Arrow Escape

A minimalist grid puzzle for **Yandex Games** and **CrazyGames**.

The board is full of arrows, each one a head with a tail trailing behind it.
Tap an arrow and the whole thing slides off the board — but only if the head's
straight path to the edge is empty. Anything in the way, and it stays put and
costs you a heart. Clear every arrow to finish the level.

Built with **Vite + TypeScript (strict) + Phaser 3**. No sprites, no images, no
raster assets, no web fonts: every pixel on screen is drawn with
`Phaser.Graphics`. Production build is **~339 KB gzipped**.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That is all you need — with no portal SDK present the game falls back to
`stubSdk`, which stores progress in `localStorage` and grants every rewarded ad
instantly so you can exercise the hint/undo/refill flows offline.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc --noEmit`) then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally, exactly as a portal would |
| `npm run validate` | Solve-check all 150 levels + print the difficulty distribution |
| `npm run generate` | Regenerate `src/levels/levels.json` from the seeded generator |
| `npm run sounds` | Regenerate the four WAVs in `public/sounds/` |
| `npm run zip` | Package `dist/` into `release/arrow-escape.zip` |
| `npm run release` | `validate` → `build` → `zip` in one go |

`npm run validate` is a hard gate: it exits non-zero if any level is
unsolvable, malformed, duplicated, or outside its chapter's design budget.

```
Chapter 1: 50 levels | arrows 4.50 | cells 11.28 | initialFree 1.66 | difficulty 29.14
Chapter 2: 50 levels | arrows 6.00 | cells 23.38 | initialFree 1.64 | difficulty 42.06
Chapter 3: 50 levels | arrows 7.00 | cells 34.70 | initialFree 1.90 | difficulty 47.12
OK - all 150 levels are solvable and within budget.
```

---

## Look

Light, minimal, premium hypercasual — the whole thing is line art on paper.

| Token | Value | Used for |
| --- | --- | --- |
| background | `#EEF2F8` | every scene |
| card | `#FFFFFF` | board, HUD pill, buttons, panels |
| ink | `#14161F` | arrow line art, primary text |
| accent | `#3B4ACB` | flying arrows, primary buttons, tabs |
| pink | `#F04A86` | hearts, "AD" badges, the *Escape* wordmark |
| amber | `#F5A524` | stars |
| danger | `#E5484D` | blocked feedback |
| dot | `#C7CDDB` | the board's dot grid (r=2, at cell corners) |

Cards use radius 16–20 and a soft `rgba(20,22,31,0.08)` shadow, faked by
stacking six translucent rounded rects — `Graphics` cannot blur.

Phaser's `Graphics` has no line cap/join setting either, so every stroked shape
caps its own corners with a filled circle of half the line width. That is what
makes the arrows read as rounded line art rather than mitred sticks.

Type is a system rounded stack, nothing fetched:
`"Nunito", "Arial Rounded MT Bold", system-ui, -apple-system, sans-serif`.

---

## Project layout

```
src/
  core/            engine-independent game logic (no Phaser, no DOM)
    types.ts       Arrow (head + dir + tail), Cell, Board, LevelData, Dir, DX/DY
    rules.ts       isFree(), freeArrows(), blockerOf(), solve(), analyze(),
                   structuralErrors(), validate()
    generator.ts   mulberry32() + reverse-build generateLevel()
    format.ts      parseLevel() / serializeLevel() / parsePack() / serializePack()
  sdk/
    ISdk.ts        the interface every platform implements + stubSdk
    yandex.ts      Yandex Games adapter (cloud save, LoadingAPI, GameplayAPI, adv)
    crazygames.ts  CrazyGames SDK v3 adapter (localStorage save, ad.requestAd)
    sdk.ts         runtime detection + script injection + stub fallback
    externals.d.ts ambient types for the two portal SDKs
  game/
    theme.ts       palette, radii, design resolution, font stack
    i18n.ts        EN / RU / TR / ES / PT / UZ dictionary
    levels.ts      parsed level pack + chapter/global index helpers
    progress.ts    stars, unlocks, settings, tutorial flag; reads/writes via ISdk
    audio.ts       mute-aware sound playback
    ui.ts          Button, IconButton, icons, cards, dot grid, arrow line art,
                   stars, hearts, confetti, ripples, toasts
    scenes/        Boot, Menu, LevelSelect, Level, Win, Settings
  levels/levels.json   150 levels, 3 chapters, format v2
  main.ts          Phaser game config and entry point
scripts/
  generate-levels.ts   writes src/levels/levels.json
  validate-levels.ts   the `npm run validate` gate
  make-sounds.ts       synthesises tap / slide / win / error WAVs
  pack-dist.ts         dependency-free ZIP writer for the release archive
public/
  privacy.html   privacy policy (required for CrazyGames approval)
  favicon.svg
  sounds/*.wav
```

`src/core/` never imports Phaser and never touches the DOM, so the rules can be
run from Node — which is exactly what the level scripts do.

---

## How the puzzle works

An arrow is a **head cell plus an orthogonal tail**: `tail[0]` is adjacent to
the head, `tail[i+1]` to `tail[i]`, no cell repeats. The cells it occupies are
head + tail.

`isFree(arrow, board)` walks from the **head** towards the edge in the arrow's
own direction and returns false the moment it meets a cell belonging to another
arrow. A tail never sits on its own head's ray — the generator guarantees it and
`structuralErrors()` rejects any level that breaks it — so an arrow can always
slide out through its own body.

The key property is unchanged from the tail-less version: **removing an arrow
can only empty cells, never fill them.** So freedom is monotone — an arrow that
is free stays free no matter what else you take first. Two consequences:

1. A single greedy sweep is an **exact** solvability test. `solve()` needs no
   search and no backtracking.
2. There is no lose state from the *puzzle*. A validated level cannot be
   bricked, which is why hearts refill rather than ending the run.

### The generator builds levels backwards

`generateLevel()` starts from an empty board and adds arrows one at a time:

1. place a **head** whose ray to the edge is clear of every cell already taken;
2. grow a **tail** from it by a random walk through empty cells only, never
   touching the head's own ray.

The arrows already placed are exactly the ones still on the board when the new
one gets tapped, so replaying the placement order in reverse is a guaranteed
solution. The tail *is* free to lie across an **earlier** arrow's ray — that
arrow is tapped later, by which time this one is long gone. That is precisely
what turns a pile of arrows into a dependency chain rather than seven
independent taps.

Everything is seeded (Mulberry32), so `npm run generate` is reproducible — the
same `BASE_SEED` always yields the same 150 levels, and regenerating never
silently reshuffles a player's saved progress.

### Level format (v2)

```json
{
  "version": 2,
  "chapters": [
    {
      "name": "Chapter 1",
      "levels": [
        { "id": 1, "w": 6, "h": 6, "arrows": [ { "x": 3, "y": 3, "d": "L", "t": "RU" } ] }
      ]
    }
  ]
}
```

`x`/`y` are the head, `d` is the direction it points and flies in, and `t` is
the tail written as **relative steps from the head** — `"RU"` reads as "from the
head, step Right, then Up". An empty `t` is a bare head. Arrow ids are assigned
in file order, so they are stable across reloads.

`parsePack()` refuses to load anything that is not `version: 2`, so a stale
`levels.json` fails loudly instead of rendering nonsense.

### Chapter budgets

| Chapter | Grid | Arrows | Tail length | Max opening moves |
| --- | --- | --- | --- | --- |
| 1 | 6×6 | 4–5 | 1–2 | 3 |
| 2 | 7×7 | 5–7 | 2–4 | 3 |
| 3 | 8×8 | 6–8 | 3–5 | 4 |

### Stars

| Stars | Condition |
| --- | --- |
| 3 | cleared with **no** hints and **no** undos |
| 2 | 1–2 hints/undos used |
| 1 | 3 or more used |

No timers — the brief explicitly rules out timed stars.

### Hearts

Three hearts per level. A tap on a blocked arrow wiggles it, flashes it red,
vibrates, and costs one. At zero the fail overlay offers a rewarded ad to refill
(keeping the board as it is) or a restart. Hearts are per attempt and are never
persisted.

---

## Platform integration

`src/sdk/sdk.ts` picks the adapter at runtime, injects that portal's script tag,
and falls back to `stubSdk` if anything is missing or the script fails to load.
**One `dist/` ships to both portals.** Detection order:

1. `?platform=yandex|crazygames|stub` in the URL (handy for testing)
2. `VITE_PLATFORM` build-time env var
3. `window.YaGames` / `window.CrazyGames` already present
4. hostname / referrer / `ancestorOrigins` sniffing
5. otherwise the stub

Both adapters call `gameplayStop()` before every ad and `gameplayStart()`
afterwards, and every ad callback is wrapped in a timeout so a portal that never
fires `onClose` cannot wedge the game.

### Testing an adapter locally

```bash
npm run dev
# then open:
#   http://localhost:5173/?platform=stub          (default)
#   http://localhost:5173/?platform=yandex        (real Yandex SDK loads; ads no-op off-portal)
#   http://localhost:5173/?platform=crazygames    (real CrazyGames SDK loads)
```

### Upload to Yandex Games

```bash
npm run release          # validate + build + zip
```

1. Open the [Yandex Games developer console](https://games.yandex.ru/console) and
   create a draft.
2. Upload `release/arrow-escape.zip` in **Черновик → Загрузить архив**. The
   archive's `index.html` is at the root, which is what the console expects.
3. Fill in the catalogue card, and paste the URL of the deployed
   `privacy.html` into the privacy policy field.
4. Send for moderation. The build already calls `LoadingAPI.ready()` when the
   loading bar reaches 100% and brackets ads with `GameplayAPI.start()` /
   `.stop()`, which are the two things moderation checks most often.

Cloud save is enabled through `ysdk.getPlayer()`; anonymous players fall back to
a `localStorage` mirror automatically.

### Upload to CrazyGames

```bash
npm run release
```

1. Open the [CrazyGames developer portal](https://developer.crazygames.com/) and
   create a new game.
2. Upload the same `release/arrow-escape.zip`.
3. Supply a link to the hosted `privacy.html` — CrazyGames requires a reachable
   privacy policy before approval.
4. The build calls `SDK.game.loadingStart()` / `loadingStop()` around boot,
   `gameplayStart()` / `gameplayStop()` around play, and requests `midgame` and
   `rewarded` ads through `SDK.ad.requestAd()`.

Bundle limits on both portals are comfortably met: the whole archive is ~379 KB
against a 2 MB budget.

---

## Ads

- **Interstitial** — after every third completed level, shown on the *Next
  Level* button in `WinScene` so it never interrupts play.
- **Rewarded** — three places, all optional:
  - *Hint* and *Undo* in the toolbar. **The first use of each is free every
    level**; after that the button shows a pink `AD` badge and costs a video.
  - *Refill* on the out-of-hearts overlay.

Locally, `stubSdk` grants every rewarded ad instantly and logs interstitials.

## Onboarding

The very first time a player ever opens level 1, a pulsing hand and a `Tap!`
bubble sit over a free arrow. It disappears on the first successful tap and the
`tutorialDone` flag is written to the save, so it never shows again.

---

## Adding or changing levels

```bash
# edit CHAPTERS / BASE_SEED in scripts/generate-levels.ts, then
npm run generate
npm run validate
```

Hand-written levels are fine too — add them to `src/levels/levels.json` in the
same format and `npm run validate` will solve-check them and check the tail
geometry.

---

## Constraints honoured

- `src/core/*` is engine-independent and is never imported by anything that
  needs a browser
- Phaser 3 only — no Unity, Godot, PixiJS, or hand-rolled canvas
- tap input only, no swipes or virtual sticks
- `Phaser.Graphics` only, no raster sprites, no web fonts, no CDN
- stars come from hints/undos, never from a timer
- `ISdk` and its two adapters, and every scene key, are unchanged from v1
- TypeScript `strict` with `noUnusedLocals` / `noUnusedParameters`; `npm run build`
  fails on any type error
