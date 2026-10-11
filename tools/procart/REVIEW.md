# Procedural art: review notes for the owner

Branch `wip/procart` (from main 8768d16; the plan named 5939af1, which is not in the remote, so this is the newest main that was there). Nothing is merged, **no old picture is deleted**, and no AI-made image was added. Everything below is drawn in code at load or just after.

## 1. What changed

Shop icon signs and the police badge, the wanted posters, the radio cassette, the delivery drone, the police bike, the koi, the nine hologram ads, the six big hacked-hologram boards and the five wall holograms are now generators in `js/artgen*.js`.

| file | what |
|---|---|
| `js/artgen.js` | the core: registry, one texture function for every picture (`ART.tex`), the old/new switch, the plain size table (`ART.SIZE`, the worker reads only this) |
| `js/artgen_tools.js` | the shared tools: four bitmap fonts (`3x5`, `5x7`, `bold`, `narrow`), a mask with line/curve/ellipse/polygon drawing, the neon painter (tube, accent, halo, one drawing in many colors), boards |
| `js/artgen_icons.js` | the 15 shop icons x 3 colors, and the police badge |
| `js/artgen_vox.js` | a tiny voxel renderer (`ART.vox`), the drone (8 headings, parcel on the step, puke, puddle) and the bike (8 views) |
| `js/artgen_wanted.js` | the 9 wanted posters (invented cast, see 5) and the cassette |
| `js/artgen_koi.js` | the koi: 10 frames, two koi circling a lotus over ripples, flowing into each other |
| `js/artgen_ads.js` | the 9 animated hologram ads |
| `js/artgen_air.js` | the 6 big boards: Caelum-Sol and its hack, Aether-Vane and its hack, Synth Corp and its hack |
| `js/artgen_walls.js` | the 5 wall holograms in a new atlas a quarter of the old size in each direction |

Sizes, aspect ratios, layouts, shaders, uvs and builders are unchanged, so plots come out the same. The one change outside the art: the wall atlas cells are now the shader's constants for the atlas in use (`airFrag` in `buildings.js`), and the builders keep the old aspect table, so plot geometry is identical in both modes. No random draws are made by the art (fixed seeds only); the worker draws nothing and loads only the size table.

## 2. The comparison sheets (`tools/procart/sheets/`)

- `dump/<name>_1x.png` and `_3x.png`: every asset, the old picture above and the new below (animated ones show every frame: the koi strip, the ad rows, the drone cells, the wanted strip).
- `game_<scene>_<stop>_z<zoom>_h<hour>.png` (the koi and the drone were redone after a revision: pond at zoom 8, 15, 30 by day and night, drone at zoom 8, 15, 30 by day and night): the same view in the game, old art on the left, new on the right (both captured in one page; the switch is flipped between them). Stops: `signs` (a shop street), `badge`, `posters`, `bikes` (the police station), `pond` (the koi), `airholo` and `airholo_hacked` (an air hologram in each state), `wallholo`, `ads`, `drone`. Made: signs, wall holograms and ads at zoom 8, 15 and 30 by day and by night (city); badge, posters, bikes, drone, pond, the two air hologram states and the wall holograms at night (zoom 8 and 15, the max city ones at 15 only). The station art is small at those distances: for the badge, posters and bikes the bare images in `dump/` are the better look.
- `radio_old_new.png`: the cassette in the page's own CSS at 118 x 88 (old, new, new with the reels turned 45 degrees: they line up).
- Regenerate: `python3 tools/procart/sheet.py` (all), `--stops signs,ads --zooms 15 --hours 22` for a few, `python3 tools/procart/dump.py NAME ...` for the bare images. `tools/procart/features.py` lists which scene has what (`features.json`): the signs, ads, wall holograms and drones are in city and dense; the police station and bikes in megas; the pond and the air holograms only in maxcity.

## 3. How to flip "old art (as before)"

F3, "Exact timing" on, then **old art (as before)** in the Tests row; click again for the new art. (Turning exact timing off resets every test.) Or `window.__OLD_ART = true` before load: the harness diff against 8768d16 is then 0 problems. The flip repaints the sprite atlas (shop signs, badge), swaps the image in every texture, and sets the cassette's picture and the wall atlas's shader table; the first flip to the old art loads the old files.

## 4. Where to look first (weak spots)

- **Drone (revised):** about the old size (20 x 17 or 18 px; the old 18 to 22 x 17 to 18), two small antennae back, a round teal body with a lavender dome and a ring of small rotor discs, and a clear orange parcel under the belly on short straps, at least 34 orange pixels in each of the 8 views (the old had 29 to 46); lit pixels per cell 215 to 219 (old 188 to 222). The ring of rotors reads a little spikier than the old art (which had two dark side bars), and the antennae are thin. If it still does not pass your eye, the licensed drone pack is the fallback (not used).
- **Bike:** smoother and flatter than the old hull, reads a little boat-like from the side; the 8 views agree with each other and the rider's seat is within 2 px of where it was (people.js is unchanged).
- **Koi (revised):** two filled koi (66 and 60 px long, one pink-orange, one blue-violet) with bright 2 px outlines, filled fins and tail, a filled lotus and bright 2 px ripples, matching the old sheet's coverage and brightness: lit pixels per frame 4,475 to 4,811 (average 4,592) against the old 4,056 to 6,065 (average 5,037), sum of brightness 1,060 to 1,136 against 824 to 1,315 (averages 1,087 and 1,072), no partial alpha; the 10 frames loop (the step from frame 9 to 0 is about 11% larger than the others: a ripple drops and a new one is born at the lotus). In the game at night the pond reads warmer (more orange and red) than the old pink-blue glow. The leaping koi are gone (a leap does not loop). The frames flow into each other; the glitch shader is unchanged, so you may want to calm the glitches (`KOI_SHADER` in `mega.js`). The tail fork is a little angular and the two koi pass close to each other.
- **Hologram ads:** the old ones were solid colored masses; the new are white-grey line and fill art that the shader tints. After a first pass that was thinner than the old, the robots, dish and dancer were thickened to the old coverage. The portrait ads now have a one-line label across the top, not a text panel at the side; "BOT SHOP / ROBOT REPAIR" alternation became "BOT SHOP" only, and "MEET YOUR NEW BEST FRIEND" is "MY FRIEND" (the scrolling slogans under the boards are unchanged).
- **Big boards:** the brush lettering on the hacked side is chunkier than the old spray paint (whole-pixel shear); the hacked boards are sparser than the old noise (the shader's own glitches add some); the ships and the eye are simpler. All lettering is upper case (the fonts have none).
- **Wall holograms:** flatter and with a fainter glow than the old ones; "CALL THE GROUND" is on two lines.
- **Wanted posters:** thin 1 px faces; the names are only in the cast table.
- **Shop icons:** the croissant and the ramen bowl are the least clear at 1x.
- **Cassette:** darker and flatter than the old picture (the CSS drop-shadow supplies the glow).

## 5. What you can change cheaply

- **Copy:** the big boards' words are strings in `js/artgen_air.js`, the wall boards' in `js/artgen_walls.js`, the ads' labels in `js/artgen_ads.js`, the posters' names, classes and rewards in the `CAST` table of `js/artgen_wanted.js` (`ART.WANTED_CAST`; the alias is not printed on the poster). The scrolling slogans under the ads (`HOLO_TEXT`) were not touched.
- **Colors:** the three sign colors are `ART.NEON` in `js/artgen_tools.js`; the hologram ink colors are `HOLO_INK` in `buildings.js` (unchanged).
- **Which ads appear:** the ad number comes from the building's hash (`holoQuad`, unchanged); to retire one, change its row's drawing, or point `holoQuad` calls away from it.
- The invented wanted cast: NIX (hacker), VEX (runner), BLIP (medic), GASPAR (dealer), MOTH (ghost), BRICK (muscle), ORBIT (tech), HOLLOW (bomber), DOLL (thief).

## 6. Load time

Counted in pixels and timed in headless Chromium (`python3 tools/procart/load_time.py`; no game, no GPU, so these are generator times only).

| | pixels | first (cold) run | later runs |
|---|---:|---:|---:|
| in the load itself: 46 shop signs and the badge, the drone and bike textures, the cassette | about 39,700 | 38 ms | 6 to 11 ms |
| just after load (deferred, one board a turn): the koi, wanted posters, hologram ads, six big boards, wall atlas | about 1.82 million | 117 ms | 60 to 72 ms |

Both are under the 150 ms budget, and the second set does not block the load. On your machine, with the game open (two lines in the console; they print the full generator time and the signs alone):

```
const t = performance.now(); for (const k in ART.gens){ const [w, h] = ART.SIZE[k] || [64, 64], c = document.createElement('canvas'); c.width = w; c.height = h; ART.gens[k].fn(c.getContext('2d'), w, h, ART); } console.log('art drawn in', (performance.now() - t).toFixed(0), 'ms');
const u = performance.now(); for (const k of ART.SIGNS) SG.draw(k, k === 'sign_police' ? 40 : 30, k === 'sign_police' ? 50 : 25, 0); console.log('shop signs and badge', (performance.now() - u).toFixed(1), 'ms');
```

## 7. Checks that were run

- Harness diff with `window.__OLD_ART = true` against 8768d16: **0 problems** on city, dense and megas (53 captures, quick set), and on the max city at two steps (`noon_f1`, `night_zoom_out`; all of this was run again after the koi and drone revision, same results; the max city's other steps were left out to stay under 10 minutes). That covers the signs, ads, wall holograms and drones (city and dense), the police station and bikes (megas), the pond and the air holograms (maxcity). Also 0 problems with nothing registered, before any drawing was added (the plumbing commit).
- `recipe_proof.py --worker`: **0 of 227 plots differ on city, 0 of 267 on megas**, no page errors.
- Real page with the worker on (`python3 tools/procart/realpage.py maxcity`: the max city has the police station, the club, the pond and the air-filter tower): the worker comes up ready, zoom 8, 15, 30 with turning, the air hologram held at the ad, the glitch, the hacked picture and back, and four flips of "old art (as before)" ran with **no page errors and no failed requests**. No delivery drone happened to be in flight in that run (drones were captured in the city scene instead: `game_city_drone_*`).
- The new art in the game was looked at in the sheets above (day and night, zoom 8, 15 and 30 where made); the air holograms in both states.

## 8. For the later commit (not done: you approve each asset first)

Delete, once approved: `assets/sprites/sign_<shop>_<pink,cyan,amber>.png` (45) and `sign_police.png`, `holo_ads.png`, `holo_pureair/freeair/aether/sky/synth/watch.png`, `holo_walls.png`, `koi_neon.png`, `wanted.png`, `ddrone.png`, `pbike_r?c?.png` (8), `assets/ui/cassette.png`, the 8 tracked files in `assets/sprites/originals/` (`holo_*.webp` x5, `koi_neon_sheet.png`, `police_badge.png`, `wanted_posters.png`, about 5 MB), `tools/make_holo_ads.py`, `tools/make_wall_holo_signs.py`; and in code: `PH.tests.oldArt`, `window.__OLD_ART`, the `path` argument of `ART.tex`, `ART.WALL_OLD` (keep its aspect numbers as plain constants: they set the plots' geometry), `loadOld`, the old-picture branches of `ART.cassette` and the sprite atlas (`ART.isArtKind`). README.md still describes the old pictures in two places (lines about the holograms and the koi).

## 9. The untracked `originals/` folders

`assets/sprites/originals/people/`, `police/` and `robot/` are in `.gitignore` and are **not in this repo or in the environment I worked in**, so I could not look at them. What the project's own docs say: `docs/people.md` states the `people` sheets are Craftpix assets, kept out of the repo for licensing; it does not say anything about `police/` (the officer sheet; the officer sprite is in the packed `people.png`) or `robot/` (the old delivery robot, row 13 of `people.png`, no longer drawn). Please check those two folders on your machine for Craftpix license files: if they are Craftpix, leave them; if they are not (or there is no license file), tell me and the sprites cut from them (the police officer rows and the robot row of `people.png`) go on the AI-asset list.

## 10. Decisions (mine, as the plan allowed)

- The sprite-atlas signs keep one variant each (no extra slots), so the atlas layout is unchanged.
- The wall atlas is exactly a quarter in each direction, cells 108x250, 88x314, 164x347, 176x367, 199x287 (each within 1% of the old aspect); the shader gets the table of the art in use, which recompiles once when you flip.
- Big boards, the koi, wanted posters, ads and walls are drawn deferred (one per timer turn, 30 ms after load); the signs, drone, bike and cassette in the load.
- The old puke and puddle cells were redrawn (the first voxel pass copied the old pixels, which is not allowed); they are new shapes.
- The ads are drawn in greys: the shader keeps only the brightest channel of each pixel and tints it by `HOLO_INK`.
- Fonts: the four bitmap fonts are original grids made for this (a standard 5x7 dot-matrix style, a 3x5 tiny font); Silkscreen, already used for the scrolling text, is untouched.
