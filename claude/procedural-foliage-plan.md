# Plan: procedural sprites and foliage (no AI art, and foliage that costs less)

For: a Claude Code agent working in the NeonTerrarium repo (github.com/VibeLearner/NeonTerrarium).
Start from: `main` at 2709cbf or later. Make a new branch, for example `wip/procfol`.
Background: `js/sprites.js` (the sprite atlas `FOL_ATLAS`, `SPR`, `plant()`, `buildFoliage()`, the floor decals `FLOOR_SPR`, and the signs already drawn in code: `GLYPH_*`, `NEON_GRAF`, `MKT_SIGNS`, ON AIR, POLICE, MALL), `tools/perf/OVERNIGHT4.md`, and the project docs `claude/looks-system-plan.md` and `claude/baked-far-plan.md`.

## Why

1. **No AI art when the game is published.** The plant, grass, vine, laundry and floor sprites came from Retro Diffusion (an AI image tool), shrunk to true pixel size. They have to go. Everything that replaces them is drawn in code, at load, from seeds, in the same pixel-art style.
2. **Foliage is the second biggest cost.** On the max city at zoom 30 with the static cache off, plants are about 1.97 million triangles (28% of the frame), drawn every frame with no culling and no detail levels: every plant is two crossed quads in one instanced mesh per super-region (`buildFoliage`, `frustumCulled = false`), and a grass plot alone holds about 400 tufts (`gt0`, 20 x 20).

**The owner's standard:** she judges by eye, with flip tests and crops. New sprites have to look at least as good as the old ones at zoom 8, 15 and 30. Any cheat for distance (fewer plants, a flat texture instead of tufts) must not show a visible change at the zoom where it starts.

## Items, in order

### 1. Inventory (first, small)

List every image the game loads (`assets/`, and any `.png`, `.webp` or data URL in `js/` and `css/`) in `tools/procfol/INVENTORY.md`: the file, what uses it, where it came from (the git history; commit messages and file names say a lot), and a class:
- **AI:** Retro Diffusion or any other image generator. Known: everything in `assets/sprites/` that `SPR` lists (plants, `gt0` to `gt9`, `g_*`, `h_*`, `l_*`, `vines`, `pothos`, `moss`, `w_tangle`), and the floor decals in `assets/floor/`. Check the rest: the `sign_*` icon signs, `holo_*`, `koi_neon`, `wanted`, `sign_police`, `ddrone`, `assets/ui/cassette.png`, `assets/sprites/originals/`.
- **Licensed:** the craftpix packs (the people and the police; their license files are in the project). Keep these.
- **Already code-drawn.**

Items 2 to 5 cover the foliage, floor and laundry, which are known AI. **Anything else marked AI is listed for the owner and left alone in this round** (item 7 asks her).

### 2. A sprite generator (`js/spritegen.js`)

- It draws each sprite kind into a canvas at true pixel size, from a seed. The atlas (`FOL_ATLAS`, `FLOOR_MAT`) is filled from these canvases instead of from PNGs. `plant()`, `floorPatch()` and the builders don't change.
- **Keep every kind's name and size in this round** (`SPR.size`, `SPR.anchor`, `FLOOR_SPR`). Builders scale and place by them, and the recipes (`js/recipe.js`) depend on the random draws generation makes. Same names and sizes mean the same draws, so plots come out the same and the never-seen cache keeps working.
- **More variety at no cost in draws:** each kind gets several variants (for example 4 to 8 seeds) side by side in the atlas. A plant picks its variant from a hash of its position, never from `fxRand` or `Math.random`, and the variant goes into the instance's `aRect`. Same plots, more varied plants.
- **No canvas in the worker:** the worker makes plots but draws nothing. It needs only the sizes, which stay a plain table. Check that `recipe_proof.py --worker` still reports 0 differing plots.
- **Speed:** all sprites drawn in under 150 ms at load on the owner's M2 (count pixels drawn, and time it in Chrome), or drawn once and kept in IndexedDB by generator version. The atlas stays at 1024 x 1024 or smaller.

### 3. The style rules (write them in the file header, and follow them)

The new sprites should read as hand-made pixel art, not as noise or as vector shapes:
- True pixel size; one sprite pixel is one screen pixel at the default 480p zoom (`PX = 18`). No anti-aliasing, no blur, no half-transparent pixels except where the old sprites had them.
- Light from the upper left. Each material has a ramp of 3 to 5 values, hue-shifted (shadows cooler and more saturated, highlights warmer). Avoid pure black and pure gray.
- Silhouette first: each kind must be recognizable as a flat dark shape at 1x. Clusters of leaves rather than single pixels; no single isolated pixels except deliberate highlights.
- Outlines: a darker shade of the local color, only where the shape meets empty space at the bottom and right (selective outlining), or none, matching what the old sprites did. Check by eye against them.
- Dithering only in a few places, in regular 2 x 2 patterns, never random speckle.
- Colors: from a shared foliage palette built from the old sprites (sample them before deleting them: k-means over their pixels, 16 to 24 colors), so the city's overall tone doesn't shift. The looks system's grade and palette blend then work on top as now.

### 4. The kinds

Write one generator per family, each with a few parameters and a seed:
- **Grass tufts and reeds** (`gt0` to `gt9`): blades from the base, curved by a seeded bend, 2 to 3 values, a lighter tip. Clumps for `gt6` to `gt9`.
- **Ground cover** (`g_clover`, `g_cover`, `g_spread1`, `g_spread2`, `g_moss2`, `moss`, `g_flowers`): overlapping leaf clusters on a low mound; flowers as 1 to 2 pixel dots in a second palette.
- **Ferns** (`fern`, `g_fern2`, `g_fern3`): fronds as arcs from the center, with leaflets alternating along each arc and getting smaller toward the tip.
- **Bushes** (`bush`, `bushFlower`): a canopy of several overlapping round clusters, lit from the upper left, dark gaps between clusters, a short stem showing at the base. Flowers on top for `bushFlower`.
- **Bonsai** (`bonsai`): a twisted trunk (a short random walk, thick at the base) with 2 to 4 flat foliage pads, in a pot.
- **Bamboo** (`bamboo`): 2 to 4 segmented canes with nodes, leaves in sprays near the top.
- **Succulent** (`succulent`): a rosette of thick leaves, in a pot.
- **Hanging greenery** (`vines`, `pothos`, `h_ivy`, `h_vine3`, `h_curtain1` to `h_curtain3`, `h_heart`, `l_mossroots`, `w_tangle`): strands falling from the top with a little sway in the path, leaves alternating along each strand (heart-shaped for `pothos` and `h_heart`), thicker at the top. Curtains: many strands side by side.
- **Floor decals** (`f_*`, `grass`): flat moss mats, cracks with weeds growing out of them, creeping vines, fallen leaves, sprouts in tile seams, grass fringe along an edge. They lie flat and take the scene's light, so keep their values in a narrow middle range, as the old ones did.
- **Laundry** (`l_tee_*`, `l_shirt_*`, `l_towel_*`, `l_socks`, `l_jeans`): a template outline per garment (tee, shirt with collar, towel, pair of socks, jeans), a body color from the old palette, two fold shadows, a lighter edge at the top where it hangs, and clothes pegs.

### 5. The comparison sheet, and the switch

- `tools/procfol/sheet.py`: one page per family showing old against new at 1x and 4x, and in-game crops of the same view at zoom 8, 15 and 30 (day and night, one rainy look), old against new.
- An overlay test **"old sprites (as before)"** (`PH.tests.oldSprites`, `window.__OLD_SPRITES`) loads the PNGs as now, so the owner can flip in the game. **Don't delete the PNGs in this round:** the owner approves each family by eye first. Then a later commit deletes the AI files and the switch.

### 6. Foliage that costs less

Measure first and report: plant instances and triangles per kind, per super-region, on the max city at zoom 8, 15 and 30, and the frame time of the plants' pass (F3 exact timing on the owner's M2, via a script for her Chrome thread). Then, in this order, keeping each that passes a flip test:
1. **Culling:** each super-region's foliage mesh gets a real bounding sphere and frustum culling (it has `frustumCulled = false` now). Check plants at the edge of the view don't pop.
2. **Sway that can't be seen isn't drawn live.** Past the zoom where a plant's sway moves it by less than half a pixel, plants can go into the static cache like the buildings (frozen at rest), costing nothing per frame while the view is still. Work out that zoom from the sway amplitude and the pixel size. The static cache already has the machinery for what it holds. Report what it does to the cache's redraws.
3. **Lawns from far away:** each grass plot's 400 tufts become, past a swap zoom, one flat lawn texture per plot (drawn by the generator to match the tufts' average look from above, with the same palette) plus a few tall tufts kept for the silhouette. Flip test at the swap zoom; crops for the owner.
4. **Thinning by rank,** only if the above isn't enough: each instance gets a rank from a hash, instances are stored by rank, and from far away only the first N are drawn (a smaller instance count, no extra work). Only for kinds where the flip test passes.

Target: plant triangles at zoom 30 on the max city down by at least half, with no visible change in flip tests at any zoom.

### 7. For the owner

`tools/procfol/REVIEW.md`:
- The comparison sheets.
- How to flip "old sprites (as before)" in the game.
- The inventory's other AI assets with a suggestion for each (draw in code like the signs, replace with a licensed pack, or keep while the owner decides).
- The performance numbers before and after.

## Rules

- **The look:** the new sprites must read at least as well as the old ones at every zoom; the owner approves each family. Keep the old behind the switch until she does.
- **Same plots:** kind names, sizes and anchors unchanged; variants by position hash only. Harness diff with `window.__OLD_SPRITES = true` against the starting commit: 0 problems. `recipe_proof.py --worker` on city and megas: 0 differing plots.
- **Live things stay live:** wind sway (all five sway types), the evening switch-on of emissive sprites, the looks' grade and palette blend.
- **No slower load:** sprite generation under 150 ms on the M2, or cached.

## Working speed

- Quick checks on one scene while working; the full set (city, dense, megas, maxcity) once at the end.
- Any single check over 10 minutes: make it smaller.
- No timing in the software renderer; counts (instances, triangles, pixels drawn) are fine.
- Test the real page as well as the harness: load a city in a real-clock page with the worker on, zoom in and out, turn, flip the switch, and check for errors.

## Working rules

**When something doesn't work:** try another approach (up to three), ask your advisor, and if still stuck, leave that kind on its old sprite, note why, and move on.

**Decide for yourself:** generator algorithms, parameters, variant counts, the palette, the LOD zooms. List the main decisions in the notes.

**Never:** merge into main, publish, delete the old PNGs, change kind names or sizes, use `fxRand` or `Math.random` for variants, or ship any new image made by an AI tool.

**Keep going:** commit and push after each item that passes its checks. Bump the `?v=` tags in `index.html` in the last commit.

## Deliverables

1. The branch with the generator, the variants, the switch and the foliage LOD.
2. `tools/procfol/INVENTORY.md` and `tools/procfol/REVIEW.md`.
3. The comparison sheets in `tools/procfol/sheets/`.
4. The measurements before and after, and a 5-minute Chrome script for the owner's thread (plant pass time and FPS at zoom 30 still and turning, with the old and new sprites, LOD on and off).
