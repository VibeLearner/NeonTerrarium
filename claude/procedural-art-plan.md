# Plan: the rest of the AI art, drawn in code

For: a Claude Code agent working in the NeonTerrarium repo (github.com/VibeLearner/NeonTerrarium).
Start from: `main` at 5939af1 or later. Make a new branch, for example `wip/procart`.
Background: `tools/procfol/INVENTORY.md` (the image inventory), `tools/procfol/REVIEW.md` section 5, `js/spritegen.js` (the generator core, palette and style rules from the foliage round), `js/sprites.js` (the sprite atlas, and the signs already drawn in code: `GLYPH_*`, `NEON_GRAF`, `MKT_SIGNS`, ON AIR, POLICE, MALL, the 3x5 pixel font), and the project doc `claude/procedural-foliage-plan.md` (the last round; this one works the same way).

## Why

The game is going to be published, so no AI-made image can ship. The foliage round replaced the plants, floor decals, laundry and lawn (merged and approved; the old pictures are deleted). These are what's left, marked "AI (likely)" in the inventory. The owner has decided they all go:

| asset | file(s) | used by | size |
|---|---|---|---|
| shop icon signs | `sign_<shop>_<pink,cyan,amber>.png` (15 icons x 3 colors) | `SPR`, sprite atlas (`plant()`) | 30 x 22 to 29 |
| police badge sign | `sign_police.png` | `SPR` | 40 x 50 |
| animated hologram ads | `holo_ads.png` | `HOLO_MAT` (buildings.js): 9 ads, a row each, 64 x 48 cells, frames across | 384 x 432 |
| the big hacked holograms | `holo_pureair` / `holo_freeair`, `holo_aether` / `holo_sky`, `holo_synth` / `holo_watch` | `AIR_HOLO_MAT` (buildings.js), `AIR_ASPECT` | 512 x 384 or 440 |
| wall holograms | `holo_walls.png` (sushi, repair, PureFlow, satellite, loan) | `AIR_HOLO_MAT`, `WALL_CELLS`, `WALL_ASPECT` | 2147 x 2618 atlas |
| holographic koi | `koi_neon.png` | mega.js (`KOI_FRAMES`, `KOI_W`, `KOI_H`) | 10 frames of 100 x 139 |
| wanted posters | `wanted.png` | mega.js `policeFx` | 9 posters, 576 x 68 |
| delivery drone | `ddrone.png` | people.js `DD` (8 views, parcel, puke, puddle) | 11 cells of 22 x 19 |
| police bike | `pbike_r?c?.png` | mega.js `PBIKE_VIEWS`, `PBIKE_SIZE` | 8 views, 14 to 26 x 16 to 18 |
| radio cassette | `assets/ui/cassette.png` | index.html `.tape`, music.js, style.css | 59 x 44, shown at 118 x 88 |
| the big sources | `assets/sprites/originals/*` (tracked files only), and the tools that cut them (`tools/make_holo_ads.py`, `tools/make_wall_holo_signs.py`, and any other tool whose input is one of these) | not loaded | about 7 MB |

**Keep:** `people_v2.png` and anything else from the Craftpix packs (licensed). Check the untracked folders in `originals/` (`people`, `police`, `robot`): if they're Craftpix, leave them; if not, list them for the owner.

**The owner's standard:** she judges by eye, with flip tests and crops. The new art has to read at least as well as the old at zoom 8, 15 and 30, by day and by night. It doesn't have to copy the old pictures: same idea, same job, same place in the city, drawn cleanly.

## The rules that keep everything else the same

- **Same sizes, aspect ratios and layouts.** Every replacement fills the same texture shape and the same cells as the picture it replaces (the atlas sizes, `WALL_CELLS` proportions, `AIR_ASPECT`, `KOI_W` / `KOI_H` / `KOI_FRAMES`, `DD`, `PBIKE_SIZE`, the `SPR` sizes and anchors). The shaders, uvs, billboards and geometry don't change, and the plots come out the same, because the plot builders and recipes only see sizes. The one exception is the wall-hologram atlas: it may be redrawn smaller (about a quarter of the size, which reads as real pixel art at game zoom) as long as each sign keeps its aspect ratio. Update `WALL_ATLAS` and `WALL_CELLS` to match.
- **No new random draws.** Variety comes from fixed seeds or position hashes (`SG.vAt`), never from `fxRand` or `Math.random` during generation. `recipe_proof.py --worker` must still report 0 differing plots.
- **The worker draws nothing.** It only needs sizes, which stay plain tables.
- **Drawn at load, fast.** All of this round's art is drawn in under 150 ms more at load on the owner's M2 (count pixels, time it in Chrome), or drawn once and kept in IndexedDB by generator version. Things that only appear with a building (the koi, the wanted posters, the big holograms) can be drawn the first time one is built, like `wantedTex` and `koiTex` load lazily now.
- **The animation and effects stay:** the holograms' scanlines, rolling band, flicker, glitches, tear and hack cycle (`AIR_CYCLE`); the koi's glitching frame changes; the evening switch-on; the ink tints (`HOLO_INK`); the scrolling text strips; the cassette's turning reels; the drone and bike picking a view by heading.

## Shared tools first (`js/artgen.js`, using `js/spritegen.js`)

Most of this art is neon line work and lettering on a dark board, so build these once:

1. **Bitmap fonts drawn in code.** The 3x5 font already exists. Add a 5x7 font (signs, small print) and a bold display font about 7 to 9 pixels tall (headlines like "SUSHI", "OPEN 24/7", "THE SKY BELONGS TO NO ONE"), with a condensed variant for tall narrow boards. Upper case, digits and the punctuation the copy uses (`* % / - . , ! ? :`). Hard pixels only. (Silkscreen, already used for the scrolling text, is an OFL font and fine to keep using there.)
2. **A neon line drawer.** Draws a path (lines, arcs, circles, polygons) as a 1 or 2 pixel tube in one color, with an optional soft halo ring one pixel out in a darker shade, on a dark board or on transparency. A board helper: a rounded or chamfered frame with corner ornaments, an inner rule, and a dark fill (the old boards' look).
3. **One drawing, many colors.** Icons and line art are drawn once as a mask and colored at blit time, so the 3 colors of a shop sign or the 10 hologram inks come from one drawing.
4. **A tiny voxel renderer** for the drone and the bike: a model made of a few boxes and ellipsoids with colors, rendered to a small canvas from a given heading at the game's camera tilt, with flat toon shading lit from the upper left and a selective dark outline. It gives 8 views that agree with each other, which hand-drawing 8 views rarely does.

Keep the foliage round's style rules (`spritegen.js` header): true pixel size, no anti-aliasing, hue-shifted ramps, silhouette first, no stray single pixels. For neon: the tube is the brightest value, never pure white except a one-pixel hot core where the old art had one.

## Items, in order

### 1. Shop icon signs and the police badge (small, sets up the tools)

- 15 icons as line art inside a board, at the existing sizes: arcade (joystick), bakery (croissant), books (open book), clinic (cross), cocktail (glass), coffee (steaming cup), games (controller), hotel (bed), laundry (washtub), music (note), noodles (bowl), plant (potted plant), ramen (bowl with steam), records (disc), repair (wrench). Each in pink, cyan and amber from one drawing.
- The police badge: a shield outline with a star, at 40 x 50 (two colors, like the old one).
- These are `SPR` kinds, so they plug into the sprite atlas the same way the foliage did: `SG.has(kind)` makes the atlas draw them in code. A few variants per icon (small differences in the drawing) by position hash if it's free, as with the plants.

### 2. Wanted posters

- 9 posters at 64 x 68 each, side by side as now: a colored border, "WANTED" in the display font, a masked or helmeted face in line art, "REWARD x,xxx CR" and a class line in the 3x5 font.
- Faces from parts with a seed: helmet shape, visor or goggles, respirator or gas mask, hood, antenna or ears, a scar or a sticker. Nine distinct, recognizable characters. Invent the names, rewards and classes, or keep the old ones (they're plain words).

### 3. The radio cassette

- 59 x 44 neon line art: the shell, the label window, the two reel holes, the screws, the tape window at the bottom. music.js sets the `<img>`'s `src` to the drawn canvas at load (index.html keeps the `img` tag; no file).
- The reel holes stay where the CSS reels sit (`.reel.l`, `.reel.r` in style.css); check the turning reels line up at 118 x 88.

### 4. The delivery drone and the police bike (voxel models)

- Drone: a round hover body, a sensor eye, two or four rotor arms, and the parcel strapped under it. Rendered into the 8 views at 22 x 19 in the `DD` order (0 heading away from the camera, then clockwise), plus the three extra cells: the parcel set down on a doorstep, and the club's puke and puddle (those two are tiny; draw them by hand in code).
- Police bike: a low hover bike with a dark body, blue light strips, a red and blue light bar, at the 8 `PBIKE_SIZE` sizes in the `PBIKE_VIEWS` order. The officer is drawn separately by people.js, so check the rider still sits right on every view (the seat height and position should match the old views).
- **Fallback:** the owner has the Craftpix free drones pack (license in the project docs). If the voxel drone doesn't pass her eye, a drone from that pack is an allowed replacement; note it, don't use it without trying the code version first.

### 5. The holographic koi

- 10 frames of 100 x 139: two koi circling a lotus over ripples, neon line art in the old palette (pinks, blues, violet). A koi is a spine curve with a body width profile, a head, fins and a split tail, drawn as outlines with a few scale marks.
- The old frames didn't flow into each other, which is why the shader glitches every change. The new frames can be a smooth swim loop (the koi move a tenth of the way round per frame). Keep the glitch shader as it is in this round; tell the owner the frames now flow, and she can decide later whether to calm the glitches.

### 6. The animated hologram ads (`holo_ads.png`)

- 9 ads at the same cells (6 portrait at 40 x 46, 3 landscape at 64 x 44, inside 64 x 48 cells, the same frame counts per row as now). They are drawn in white or one light color, since the shader tints each board with `HOLO_INK`, so check what the old sheet's values were and match them.
- The ads, with a small looping animation each: advertising robots (a robot waving), bot shop and robot repair (a robot and a wrench), meet your new best friend (a robot), ramen (a bowl with rising steam), laundry (a washer with the drum turning), arcade (a joystick rocking), air filters (a mask breathing), messages to grounders (a dish sending waves), neon club (a dancer, a few poses). Short words in the 3x5 or 5x7 font, as the old ones had ("BOT SHOP", "RAMEN", "NEON CLUB").

### 7. The big hacked holograms and the wall holograms (most visible, do them last with the tools mature)

- **Three pairs, at 512 x 384 (Aether-Vane pair 512 x 440):**
  - Caelum-Sol's pure-air ad (a filter logo, "CAELUM-SOL", "HAS THE PUREST FILTRATION SYSTEM", a small print line) hacked by "BREATHE FOR FREE".
  - Aether-Vane's Platform 9 recruitment hacked by "THE SKY BELONGS TO NO ONE" (protest, rebel, resist).
  - Synth Corp's security ad hacked by "BIG BROTHER IS WATCHING" (an eye).

  The corporate side is clean, ordered and gold or cyan with a logo. The hacked side is ragged: spray-paint lettering, a glitchy frame and red and cyan splits. Look at the old pictures for the wording and layout, and keep the copy (the brands are invented for the game).
- **Wall holograms:** five tall boards (sushi "OPEN 24/7", repair "OPEN 24/7" with a robot and a wrench, "AIR FILTER PUREFLOW, air filter shop", satellite "CALL THE GROUND TODAY, satellite communication shop", "LOAN ON CREDITS, 47% INTEREST ONLY, LOAN SHOP"). The boards keep their aspect ratios; the atlas can be about a quarter of its old size (see the rules).
- Drawn at a pixel size that reads as pixel art at zoom 15, the zoom she plays at most. These textures are drawn with `NearestFilter` up close and `LinearFilter` far away now; keep that.

### 8. The comparison sheets, and the switch

- `tools/procart/sheet.py`: per asset, old against new at 1x and 4x (and every frame for the animated ones), plus in-game crops at zoom 8, 15 and 30, day and night: a shop street with icon signs, the police station with posters and bikes, a drone delivery, the pond with the koi, a hologram board, each air hologram in both states, the wall holograms, and the radio corner.
- An overlay test **"old art (as before)"** (`PH.tests.oldArt`, `window.__OLD_ART`) loads the old pictures, the same way the foliage round did, so the owner can flip in the game. **Don't delete any old picture in this round.** She approves each asset by eye, then a later commit removes the pictures, `originals/`, the old cutting tools and the switch.

### 9. For the owner

`tools/procart/REVIEW.md`: the sheets; how to flip; the weak spots she should look at first; what she can change cheaply (copy, colors, which ads appear); the load time; the checks that ran.

## Checks

- Harness diff with `window.__OLD_ART = true` against the starting commit: 0 problems (quick set on city, dense and megas; maxcity on two steps).
- `recipe_proof.py --worker` on city and megas: 0 differing plots.
- A real page with the worker on: load a city with a police station, a club, the pond mega and the air-filter tower; watch a hack cycle; send a drone; flip the switch; no page errors and no failed requests.
- The load time added, counted in pixels and timed in headless Chromium (and give the owner a two-line console snippet to time it on her M2).

## Working speed

- Quick checks on one scene while working; the full set once at the end.
- Any single check over 10 minutes: make it smaller.
- No timing in the software renderer; counts are fine.

## Working rules

**When something doesn't work:** try another approach (up to three), ask your advisor, and if still stuck, leave that asset on its old picture, note why, and move on.

**Decide for yourself:** the font shapes, the models, the poses, the layout of each board, the variant counts, the palette (start from the old pictures' colors). List the main decisions in REVIEW.md.

**Never:** merge into main, publish, delete the old pictures, change sizes or anchors (apart from the wall atlas as allowed), use `fxRand` or `Math.random` for anything the art draws, use a real brand, logo or trademark, or ship any new image made by an AI tool.

**Keep going:** commit and push after each item that passes its checks. Bump the `?v=` tags in `index.html` in the last commit.

## Deliverables

1. The branch with `js/artgen.js` (and any family files), every asset above drawn in code, and the switch.
2. `tools/procart/REVIEW.md` and the comparison sheets in `tools/procart/sheets/`.
3. A note on the untracked `originals/` folders (Craftpix or not).
