# Procedural foliage: review notes for the owner

Branch `wip/procfol` (from main 2709cbf). Nothing is merged, the old PNGs are all still in `assets/`, and no AI-made image was added.

## 1. What changed

- The plants, grass tufts, hanging greenery, laundry, floor decals and the lawn tile are now drawn in code at load, from seeds, in the same pixel-art style (`js/spritegen.js` core and style rules, `spritegen_grass.js`, `spritegen_shrubs.js`, `spritegen_hang.js`, `spritegen_lawn.js`). 59 kinds (and the lawn tile). Kind names, sizes and anchors are unchanged, so plots come out the same.
- More variety at no cost in random draws: each kind has several variants side by side in the atlas (grass tufts 8, plants and ground cover 6, hanging greenery 4, laundry 3, floor decals 4). A plant or decal picks its variant from a hash of its position, never from `fxRand` or `Math.random`.
- Kinds with no generator keep their PNG (none are left: every kind in the plan has one). The signs and glyphs were already code-drawn.
- Colors come from a shared palette (`tools/procfol/palette.py`: k-means over the old sprites), so the city's tone does not shift.
- Foliage that costs less: plant meshes are culled to the view (block by block), and a lawn seen from far away is one flat tile plus a few tall tufts.

## 2. The comparison sheets (`tools/procfol/sheets/`)

- `<family>_1x.png` and `<family>_4x.png` for grass, ground, fern, shrub, hang, laundry, floor: the old picture first, then every new variant.
- `game_city_z{8,15,30}_{day,night,rain}.png`: the same view, old sprites on the left, new on the right. `full_city_z15_day.png` is the whole frame.
- `lawn_far_city_z{22,30}.png`: a city with every empty plot laid to lawn, every tuft drawn (left) against the far lawn (right).
- Regenerate: `python3 tools/procfol/sheet.py` (families and in-game crops), `python3 tools/procfol/lawn_far.py`.

## 3. How to flip "old sprites (as before)" in the game

- In the game: F3, turn "Exact timing" on, and the Tests row shows **old sprites (as before)**. Click it to switch the old pictures in, click again for the new ones. (Turning exact timing off resets every test.)
- Before loading: set `window.__OLD_SPRITES = true` in the console or an init script. The same pictures then come out as before, bit for bit (harness diff against 2709cbf: 0 problems).
- Plots already built keep the variant they picked; the old mode paints the one picture into every variant slot, so the picture is the same.
- There is also **plants: no culling or distance savings (as before)** (`PH.tests.foliageLodOff`), which draws every plant every frame and every lawn tuft, as before.

## 4. How the new sprites look, by eye (the weak spots)

Crops at zoom 8, 15 and 30 read as well as the old ones and are cleaner and more varied. Things I would look at first:

- **Bamboo:** the leaf sprays at the top are small and the canes airy; the old one was a dense dark mass.
- **Bonsai:** now in a pot (the old one had none); the trunk shows only between pads.
- **Moss decals** (`f_moss1`, `f_moss2`, `f_mossmat`) read as fairly flat dark blobs; `f_seam` is a little blocky and symmetrical.
- **Ground cover and ferns:** a little lighter overall than the old (ground cover) and a little smaller (ground ferns).
- **Tufts (`gt1` to `gt3`):** airier than the old dense ones.
- **Lawn tile:** a little lighter than the old one in the average (66, 106, 65 against 64, 103, 68).
- Each family is approved by you separately: say which to keep, and a later commit removes the PNGs and the switch.

## 5. Other AI assets (listed in `INVENTORY.md`, left alone this round)

| asset | what it is | suggestion |
|---|---|---|
| `sign_*` shop icons (45 files: 15 icons x 3 colors) | lit box-sign icons on shops | draw in code like the glyph signs (small, flat shapes: easy), or keep while you decide |
| `sign_police` and `originals/police_badge.png` | police badge sign and its 1600 px source | draw in code (a shield and a star) |
| `holo_ads`, `holo_aether`, `holo_freeair`, `holo_pureair`, `holo_sky`, `holo_synth`, `holo_watch` | hologram ads on towers | replace with code-drawn neon ads (text and simple shapes), or keep while you decide; they are the biggest and most visible |
| `holo_walls.png` and the five `originals/holo_*.webp` | wall-hologram signs | same as the ads |
| `koi_neon.png` and `originals/koi_neon_sheet.png` | the holographic koi, 10 frames | draw in code (a swimming fish outline, few frames), or keep |
| `wanted.png` and `originals/wanted_posters.png` | wanted posters | draw in code, or replace with a licensed pack |
| `ddrone.png`, `pbike_*.png` | delivery drone and police bike views | draw in code (small sprites) or take from a licensed pack |
| `assets/ui/cassette.png` | radio cassette | draw in code or keep |
| `people_v2.png` | Craftpix pack (licensed) | keep |

The big `originals/` sources are not loaded by the game; deleting them (after you decide) takes about 5 MB out of the repo.

## 6. Performance

All numbers are counts (instances, triangles, draw meshes, pixels). Nothing was timed in the software renderer; for real times use the owner script in section 7. Scene: the stock max city, harness view 1024 x 576 at zoom 30.

**Before (2709cbf):** plants are 95,550 instances = 191,100 triangles, **2.7% of the frame at zoom 30** (6.98 M triangles), 5.8% at zoom 15, 10.7% at zoom 8, all drawn every frame with no culling. With the static cache on, the buildings are in the cache and plants are drawn live in full, so they are **13.9% of a still frame at zoom 30**, 22.4% at zoom 15, 33.8% at zoom 8. The plan's "1.97 million triangles, 28% of the frame" does not reproduce on this city (see `MEASURE.md`); it matches a city with every empty plot laid to lawn (about 2.5 M).

**Plant triangles drawn, max city, cache off:**

| zoom | before | after culling in 50-unit blocks | change |
|---|---:|---:|---:|
| 8 | 191,100 | 121,600 | -36% |
| 15 | 191,100 | 145,996 | -24% |
| 30 | 191,100 | 174,890 | -8% |

- Culling cannot do more at zoom 30 on this city: the view covers about half of everything. One mesh per region culls more (-72%, -55%, -21%) but adds 168 draw calls (202 meshes instead of 34), which costs more than it saves on a real card; blocks of about 2 x 2 regions (74 meshes, +40 draws) are the compromise. A whole super-region (34 meshes) saves only 4 to 14%.
- **The "down by at least half at zoom 30" target is not met on the stock max city.** It is met, without any visible change, only on cities with lawns (next).

**Lawns (the city scene with every empty plot laid to lawn, 76,775 instances):** at zoom 30 the far lawn draws 12,799 instances instead of 76,775 (-83%): one flat tile with the carpet's average look, plus one tuft pair in eight for the silhouette. It starts where the plants start to thin (`loss` above 1.35, about zoom 28 on a 576-line render; back at 1.25). In the crops the average green differs by about 3% before the tile was darkened a little (see `sheets/lawn_far_city_z30.png`); please flip it by eye.

**Not done, and why:**
- **Rank thinning** (store by rank, draw a prefix): it reorders draws, which changed single pixels where overlapping sprites tie in depth, and it would save only about 13% of what is in view. Dropped.
- **Sway frozen into the static cache** (branch `wip/procfol-static`, not merged; its notes are `STATIC_FOLIAGE.md` there): the half-pixel rule it was asked to apply never fires in the game's zoom range at wind 1 and 480 lines (a tip moves about 1 px at zoom 30 against a limit of 0.5), so at default settings it changes nothing, and it splits each plant mesh in two (sway and lit signs), which adds draws. With the limit raised to 1.4 px it removes 91.5% of the live plant triangles at zoom 30 (still view), but freezes sway of up to about a pixel (16,000 pixels, about 1.5% of the frame, differ). That is your call: if a still, frozen far view is acceptable, it is the biggest saving available, and the branch is ready to merge.

## 7. Checks that were run

- Harness diff with `window.__OLD_SPRITES = true` against 2709cbf: 0 problems (city, dense, megas; see the last section of this file for the set that was run).
- `recipe_proof.py --worker`: 0 of 227 differing plots on city, 0 of 267 on megas.
- A city loaded through the worker is the same city as the main-thread load (`load_check.py city`), no errors. The worker loads only the plain variant table (`spritegen.js`) and draws nothing.
- Real page (worker on): zoom in and out, turn, flip the old/new switch, no page errors.
- Sprite drawing time: 294 sprites, about 59,000 pixels. In headless Chromium here: 108 ms on the first (cold) run, 28 to 40 ms after. Not measured on your M2; the atlas is 512 x 1024.

## 8. Your 5-minute Chrome script

`tools/procfol/owner_foliage.js`: open the city at your usual zoom, paste the whole file into the console (F12), keep the tab in front, and do not touch the mouse for about 3 minutes. It measures, for old and new sprites and foliage level of detail off and on, at zoom 30 standing still and in a slow turn: frames a second (10 s each), the worst frame, and the plants' pass time (the color pass with the plant layer shown minus hidden, with F3 exact timing). It prints a table and leaves the rows in `window.__ownerFoliageRows`. It was only run in the harness (stubbed clock and draws), never on a real card; if something in it is off, the fix is in that one file.

## 9. Decisions (mine, as the plan allowed)

- Variant counts (8, 6, 4, 3, 4); old pictures sit at the old atlas positions with the extra variants beside them, so the old mode samples the same texels as before; palette ramps in `SG.PAL`.
- Variants of plants and decals come from `SG.vAt(n, x, y, z)`, a hash of the position in the group's frame; in old mode it always returns 0.
- Lawn far zoom: `loss` above 1.35 (back below 1.25); one tuft pair in eight stays.
- Culling blocks of 50 world units (`FOL_BLOCK` in `world.js`).
- Rank thinning dropped; static freezing left on its own branch (section 6).
