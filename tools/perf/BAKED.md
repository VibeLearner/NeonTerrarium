# Baked far buildings (round 10)

Base: main at b1ff117. Branch `wip/baked` (pushed). Plan: `claude/baked-far-plan.md`. Helper branches `wip/baked-shell` (item 2) and `wip/baked-cache` (item 3's plumbing), both merged. Reports of the helpers: `BAKED_A.md`, `BAKED_B.md`. For your own card: `BAKED_MAC.md` (one script, one folder of crops and numbers).

## What you have to decide

By its own counts the baked far view does **not** meet your standard (no visible change in a flip test at the swap zoom), and it does not pay for itself in the way the plan hoped.

* **Look.** In the dense scene with every block baked, 270 k to 430 k of 921,600 pixels differ from the real picture at zoom 24.5, 27 and 30, day, dusk and night, still and mid-turn; the stand-in tier differs in 47 k to 192 k. By that count baked is two to four times further from real than the stand-in. That is a count of pixels that differ at all (a one-pixel shift counts), not what an eye sees, and it is **not validated**: I did not check that the three pages have the same people and cars at capture time (the check, a comparison of random-call counts and a hash of the simulation state, is in `baked_mac.py` now; the run that would have used it was dropped at your request). If the movers differ, the counts are inflated. What I saw in the crops: silhouettes, colors and window grids match; differences are single-pixel edges, some rooftop equipment cut or doubled, and a few lights paler or brighter; at night on one tower (the dense scene, zoom 30, `far_dense_z30_h23_still.png`) the stand-in merges the lit windows into bands where the baked version keeps the frames. That last one is an impression of one tower, not a measurement.
* **Item 1.** The plan makes "baked is visibly different in ways the design cannot fix" your call. I judged the early differences fixable (they were: the relief mapping, wider quads, the lights kept real, whole pieces kept) and went on to build the rest; the three-plot prototype crops differ only by single-pixel edges. Whether the remaining differences are acceptable is yours to confirm; the code is built so it can be dropped (setting off by default, nothing runs while it is off).
* **Cost.** On the max city at zoom 30 the baked view draws about as many triangles as the stand-in (6.17 M against 5.97 M, real 7.25 M) and holds **2.9 GB of baked maps** (61 pages) on the card that the stand-in does not. That was at 16 texels a unit; the density your 720-line setting needs on a 1080 screen is 22.5, which makes the maps about twice as large (below).
* Everything with the setting off is exactly as before (harness checks, below).

## What each item did

| Item | State | Where |
| --- | --- | --- |
| 1 Prototype on three plot types | built; crops in `tools/perf/baked/` (made by the prototype, with its own bake); see "Item 1" above | `tools/perf/baked_prototype.js`, `baked_proto.py` |
| 2 Shell builder for every plot type | done by helper A, merged | `js/shell.js`, `shell_probe.py`, `BAKED_A.md` |
| 3 Baking in idle frames, cache, rebake on edits | done: helper B's scheduler and IndexedDB store (`js/bakejob.js`), my baker on it (`js/baked.js`); the plot and its shell come from the plot worker | `js/bakejob.js`, `js/baked.js`, `js/recipe.js` (`RW.shell`), `js/recipeworker.js` |
| 4 Shell material in the merged blocks, shadows, glow overlay | done by me, not by a helper: it shares the merge in `world.js` with item 5 | `js/baked.js` (`bkPageMaterial`, `bkBlock`), `js/world.js` (`rebuildSolidGen`) |
| 5 Swapping through the tier machinery, the setting, the stand-in fallback | done by me, same reason; not in the Smooth render mode | `js/world.js` (`tierOfKey`, `memberGeo`, `tierTick`), `js/input.js`, `index.html` |
| 6 Measurements and the owner's scripts | done; `baked_mac.py` (a card, one folder), `baked_owner.js` (frames a second in your tab) | below |

### How it works

1. **Shell** (`shell.js`, in the plot worker): a plot's geometry is voxelized, closed, cut into at most 12 boxes that follow its mass, each face snapped to the real wall or roof plane; a triangle that sticks out of the boxes by more than 0.3 stays real ("kept").
2. **Bake** (`baked.js`, on the page, a step a face): for each shell face the plot's real triangles are drawn orthographically from outside into a slab of 0.3 outside to 0.7 inside the face, into three RGBA maps: A the vertex color and the depth, E the emissive color and kind, N the normal (a byte per axis) and the window's switch-on threshold. Texels the slab saw nothing in take their neighbor's. Flickering and blinking pieces are baked switched off. The texels a unit follow the render setting and the screen (below).
3. **Pool**: maps live in pages of three 2048 x 2048 maps on the card (slots 1024 wide), not on the page's heap; the store (IndexedDB) keeps them by recipe signature, which includes the density.
4. **Draw**: a block at the `baked` tier merges, as before, the geometry its plots give it: for a baked plot that is its kept geometry (plus any small piece that touches a kept part, whole, and every bulb, neon and other glow that is not a window). Beside the merge the block gets one shell mesh per page: quads at the slab's outer boundary (and 0.8 wider than the face), a fragment shader that marches the view ray into the baked depth (32 steps and 5 of bisection), and the buildings' own toon lighting from the baked albedo, normal and emission (the evening switch-on is `litOn` on the baked threshold, as for real windows). The shell writes the normal image the outlines use and its own depth (`gl_FragDepth`), so the live glow overlay (flickering lights, windows near their switch-on: `glowOverlay`) draws over it with the same depth test as over real buildings. The shell casts its shadow from the wall (a depth material that pulls the quad back to the face).
5. **Swap**: the existing machinery. `tierOfKey` says `baked` when a block is at the stand-in tier, the setting is on, the render mode is not Smooth, and every plot of the block that can be baked has its bake (megastructures cannot; a block with a plot not yet baked stays on the stand-in, which is the fallback). A block changing between stand-in and baked is a tier change: it waits for the view to move, notes its box for the static cache, and keeps the other merge for a minute for flip tests (`TIER.stash`), like the detail tiers. Switching the setting does what switching the tiers does (`tierApplyNow`).
6. **Edits**: a plot made again with a new recipe (an edit, a neighbor) loses its bake, the block goes back to the stand-in, the plot is baked again, the block swaps again (the real-page check does this).

## Texels a unit, and what they cost

Pixels on screen a unit at the swap zoom (24) are `lines / 48`, where `lines` is what `applyRenderRes` gives at that zoom: the base lines of the render setting (a whole number of screen pixels each: `whole()`, and 720 stays 720), times 1.6 (the cap), no more than the screen's lines. The plan asks one texel a pixel. My first number, 16, was wrong for most screens (I took 480 x 1.6 = 768 lines without `whole()`). The game now takes the density from the setting and the screen (`bkWantTpu`: 10 to 24, redone when either changes: what was baked at another density is dropped and baked again):

| screen | 480 setting | 720 setting | Smooth |
| --- | --- | --- | --- |
| 720 lines | 12 | 15 | stand-ins stay |
| 1080 lines | 18 | 22.5 | stand-ins stay |
| 1440 lines | 16 | 24 | stand-ins stay |

Maps grow with the square of it. Measured at 16 (dense 1.03 MB a plot, max city 1.57 MB a plot, 2.9 GB for its 1,637 plots), so by scaling: at 12 about 0.56 times that (max city 1.6 GB), at 18 about 1.3 times (3.7 GB), at 22.5 about 2 times (5.8 GB), at 24 2.25 times (6.6 GB). **Everything measured and every crop below was made at 16 texels a unit**, which is under the density a 1080-line screen needs at either setting; the harness window (1280 x 720, 480 setting) needs 12, so its pictures had texels to spare. An earlier test that gave 32 texels a unit the same count of differing pixels was made in that window, so it shows only that texels beyond the need do not help; it says nothing about the 720 setting.

**Smooth** (screen resolution) now keeps the stand-ins: `BK.on()` is false in that mode (the plan's "either bake finer or keep stand-ins").

## Decisions I took

* **Relief mapping, not flat painting.** With the depth channel the prototype's differing pixels on the three plots fell from 19.7 k to 10.5 k, and to 7.6 k with the final shell builder (of 921,600). The quad must be drawn wider than the face (rays that cross the outer boundary beside the face hit the face below), and a ray that enters the face's rectangle from the side already below the surface is air, not a hit; both found in the first city-wide crops.
* **Shell at the slab's outer boundary** (0.3 out), so things that stand out of the wall by up to 0.3 keep their silhouette and parallax.
* **Maps**: three RGBA maps, 12 bytes a texel.
* **Kept geometry**: the shell builder's rule (farther than 0.3 from every box), plus a piece that has a kept part stays whole (up to 700 triangles), plus every bulb, neon and other glow that is not a window (a lit neon tube a texel and a half wide is baked fat and too bright).
* **Overlay**: the switch-on windows and the flickering and blinking pieces of the baked part are drawn from a copy of those triangles through the existing `glowOverlay`, on a mesh no pass draws.
* **Plot and shell from the worker** (`RW.shell`): the plot is made again there with `Shell.build` on its geometry, so the page never makes the plot or runs the voxelizer (10 to 140 ms a plot; 390 ms the worst). Without a worker (the harness) the page does it.
* **Setting off by default** (`neonIsland.baked`), needs Detail tiers on; with it off nothing runs (no scan, no store reads, no pages).
* **A page budget** (`BK.maxPages`, 10 pages = 480 MB by default, 140 to 270 plots depending on the density): once the pages are full no plot is baked (nearest the view first, what is baked stays); a block with an unbaked plot keeps the stand-in. The measurements lift it.

## Numbers (software renderer: counts and bytes only; no frame was timed). At 16 texels a unit.

### Max city (`measure_maxcity.json`, 1,637 plots that can be baked, zoom 30, noon, static cache off so the frame is drawn in full)

| | real | stand-in | baked |
| --- | --- | --- | --- |
| triangles drawn in a frame | 7,251,494 | 5,969,248 | 6,169,934 |
| draw calls | 1,591 | 1,591 | 2,152 |
| merged block geometry on the card | 1,160 MB | 690 MB | 218 MB |
| baked maps on the card | 0 | 0 | 2,928 MB (61 pages, 1.57 MB a plot) |
| three.js geometries / textures | 1,559 / 42 | 1,559 / 42 | 2,737 / 225 |

Per baked plot on the max city: shell 104 triangles, kept 2,047, overlay copy 569, 137 k texels (1.57 MB), 21% of the faces' texels were holes (filled from the neighbor). In the software renderer 1,210 ms a plot, of which 99 ms is making the plot (the page's step; off the page with the worker) and 264 ms the maps read back (a software renderer's read; a card's is far shorter). The CPU-only steps (sort, pieces, compaction, fill) are 4 ms together. With the default 10-page budget (at 16) only the nearest 270 or so plots would be baked.

### Dense scene (`measure_dense.json`, 271 plots, zoom 30, noon)

| | real | stand-in | baked | baked, keep 0.45 and lights painted |
| --- | --- | --- | --- | --- |
| triangles drawn in a frame | 1,036,236 | 821,101 | 720,128 | 521,836 |
| merged block geometry | 114 MB | 70 MB | 28 MB | 19 MB |
| baked maps | 0 | 0 | 336 MB (7 pages) | 336 MB |
| kept triangles per plot | | | 941 | 208 |

The last column is what the kept geometry costs: raising the keep distance from 0.3 to 0.45 and painting the lights that are not windows takes the kept triangles per plot from 941 to 208 and the frame to 522 k triangles, but it paints thin lights, which looked wrong at night in the first crops (`window.__BAKED_SHELL = {keepDist: 0.45}`, `window.__BAKED_NOLIGHTS = true`, or `baked_mac.py --keepdist 0.45 --paint-lights`).

### Dense scene, every block baked, through the game (`far_dense_z*_h*_*.png`; pixels of 921,600 that differ at all, so a one-pixel shift counts; NOT validated against a different simulation: see the top)

At zoom 24 the swap has not happened (blocks are full up to and including 24: 0 pixels differ, so those crops show nothing); the swap-zoom crops are at 24.5. Triangles are given only for mid-turn captures, where the frame is drawn in full (a still frame is the static cache copied).

| zoom | hour | motion | pixels differ real/stand | pixels differ real/baked | triangles real | stand-in | baked |
|---|---|---|---|---|---|---|---|
| 24.5 | 12 | still | 95,981 | 368,388 | | | |
| 24.5 | 12 | turn | 82,316 | 375,089 | 1,189,361 | 932,841 | 761,286 |
| 24.5 | 19 | still | 166,701 | 399,236 | | | |
| 24.5 | 19 | turn | 126,929 | 377,580 | 1,188,435 | 931,915 | 760,360 |
| 24.5 | 23 | still | 192,374 | 430,512 | | | |
| 24.5 | 23 | turn | 156,050 | 427,974 | 1,188,091 | 931,571 | 760,016 |
| 27 | 12 | still | 80,270 | 322,585 | | | |
| 27 | 19 | still | 139,915 | 353,313 | | | |
| 27 | 23 | still | 166,888 | 382,079 | | | |
| 30 | 12 | still | 60,415 | 273,857 | | | |
| 30 | 12 | turn | 47,201 | 258,418 | 1,043,588 | 870,013 | 747,585 |
| 30 | 19 | still | 110,418 | 294,621 | | | |
| 30 | 23 | still | 128,231 | 321,737 | | | |
| 30 | 23 | turn | 95,882 | 297,632 | 1,044,990 | 871,415 | 742,219 |

Mid-turn the baked frame has 16 to 19% fewer triangles than the stand-in in the dense scene (the max city, above, is the other way round: about 3% more).

A diagnostic on the rooftop specks (a rooftop dish with yellow and teal bits): with the glow overlays hidden they stay, and with the shells hidden they stay, so they are small real pieces kept next to painted ones (placement of single pieces), not the overlay.

### Reading the numbers

* **Triangles**: baked draws about as many as the stand-in on the max city, 3% more, and 12 to 19% fewer in the dense scene. The shell itself is nothing (about 100 triangles a plot); what is drawn is mostly the kept geometry (about 2,000 a plot on the max city). Baked does not remove the triangle cost the stand-in has.
* **Memory**: the baked maps are the cost, and they grow with the density the screen needs (above): 2.9 GB for the max city at 16, over 5 GB at the 720 setting on a 1080 screen. What would bring it down, not done: two maps instead of three (the emissive color is the material's, an index; the normal in two bytes: 8 bytes a texel, a third less), faces the camera cannot see not baked, and a budget by distance (done: `BK.maxPages`). Together perhaps half; still a few GB for a big city at the 720 setting.
* **Draw calls**: 35% more on the max city (a shell mesh per page per block, the overlay).
* **Bake time**: 0.4 s a plot in the dense scene and 1.2 s on the max city in the software renderer, spread over frames by the scheduler's budget (4 ms a frame while frames are short, `BAKE.autoBudget`). How long it takes on a card is the owner's to see.

## Checks

* **Setting off is exact**: `harness.py diff --base b1ff117 --quick`, the setting at its default (off): city 25 captures, dense 13 and megas 15 (28 together), maxcity `PERF_STEPS=noon_f1,night_zoom_out` 2 captures: 0 problems in all (1280 x 720; the 1920 x 1080 viewport and the full maxcity script were not run). Run before the density and Smooth changes below; those only act while the setting is on, and the island real-page check was repeated after them.
* **Real page** (`tools/perf/baked_real.py island`, the game's own frame loop, the plot worker on, a 480 x 270 window): the city loads from its recipes; the setting on; every plot baked by the worker's shell (9 of 9); 3 of 3 blocks swapped to baked; zoom in (blocks full), out again, the setting off and on again, a plot edited (its bake dropped, made again, swapped back); no page or console error. Run twice, the second time with the density and Smooth changes (density 10 in that small window). This check found a regression the harness cannot see: `shell.js` was loaded after `recipe.js`, so the worker (which reads the script list in a timer after `recipe.js` runs) never started; it is before it now. The city scene (171 plots) bakes too slowly in the software renderer for this script.
* **Bake stalls (no new stalls): not demonstrated.** On the island real-page run 33 of 217 bake ticks went over their 4 ms budget, the worst 800 ms, and 2.1 s on the edit. The steps are the software renderer's (the maps read back, the faces drawn: `ph` in `BK.stats` splits them), so this says nothing for a card either way, but nothing shows the opposite. `baked_real.py` and `baked_mac.py` now report the ticks, the ones over budget and the worst tick with its steps, so your run on your card will say.
* **The scheduler** (`bake_probe.py city`, harness): 19 of 19 checks pass (every plot baked once per signature, nearest first, no tick over budget with the placeholder baker, a reload bakes nothing, byte-for-byte the same, an edit and a removal drop and rebake, clearCache). It failed once on the edit check after my change to `BAKE.onReady`: a callback that returned a number (the probe's) was taken as a replacement bake; now only an object with a `sig` replaces it.
* **The Mac script** (`baked_mac.py island`, small, software renderer): runs end to end into one folder. On the island the three pages had the same simulation (random-call counts and state hashes equal), every timing loop drew (136 calls a frame without the cache, 157 with it), and the bake ticks are reported (64,700 ticks, 29 over budget, the worst 83 ms: the software renderer's steps). The milliseconds a frame (about 0.44 to 0.51 s in the software renderer) are measured with a one-pixel read that waits for the card (the first version used `gl.finish()`, which did not wait there and gave 2 to 3 ms); the cache-on loop came out at about twice the cache-off one in the software renderer (more calls and extra full-screen passes, I take it) and is only in `numbers.json`. None of this has run on a card.
* **Crops** (`tools/perf/baked/`): the prototype's (`dense_z{24,27,30}_h{12,19,23}_{still,turn}.png` and `_zoom.png`: real | baked | difference x4 for the three plots, made by `baked_proto.py` with the prototype's own bake) and the integrated ones through the game's own tier (`far_dense_z{24,24.5,27,30}_h{12,19,23}_still.png`, `far_dense_z24.5_h{12,19,23}_turn.png`, `far_dense_z30_h{12,23}_turn.png`: real | stand-in | baked | difference real/baked x4 | difference real/stand-in x4, the middle of the picture), and the max city wide view (`measure_maxcity_wide.png`).

## What the crops show (and do not)

* The prototype's three plots (plots 5,4, 7,4 and 7,3 of the dense scene: a tall tower with window grids, a stepped stack with balconies, frames and stairs, and a plot with rooftop structures and overhanging floors; none of the harness scenes has a lift pod, so the pod type was not in the prototype, though the shell builder was run on pods, `BAKED_A.md`): at zoom 24 to 30 day, dusk and night, still and mid-turn, silhouettes, colors, window grids, balconies and sills match; what differs is single-pixel edges, a few window panes in a slightly different tone, and the ends of thin lit lines. The evening switch-on matches.
* City-wide through the game (`far_*`): silhouettes and colors match, the shell does not show at the block borders, the ground is right. Differences: rooftop equipment sometimes cut or doubled, thin neon and vines at night differ in brightness unless kept (kept now), a few lights paler or brighter. The max city wide view (`measure_maxcity_wide.png`, noon) is close to real at that scale.
* Not solved: **fine-detail LOD** (from about zoom 24 at the default cap the real shader drops the smallest pieces by size class, `LOD.fine`; the baked pictures keep them, so at zoom 30 they differ by those pieces); **megastructures** stay on the stand-in (the shell builder cannot make them cheap: 15 to 65% kept); **round and twisting towers** fit boxes badly (35% kept).

## Skipped, and why

* **Validating the pixel counts** (same simulation in the three pages): dropped at the owner's request; the check is built into `baked_mac.py`.
* **Tilt below 15 degrees** (the Space tilt mode): the shell's quads are 0.8 wider than the face; at a lower pitch rays cross the outer boundary farther from the face and the edges show gaps.
* **Parallax past the slab**: things that stand out of the wall by more than 0.3 are real geometry (kept), things deeper than 0.7 inside it (the inside of a deep arcade) are not baked.
* **GPU-side filling and reading** of the maps: the read is a stall on a real card too (a few ms a map); an async read (a pixel buffer and a fence) and a fill on the card would remove it.
* **Memory reduction** (above) not done.
* **Worker bake**: the page's step makes the plot (55 to 100 ms) when there is no worker; with the worker it is the worker's.
* **`tools/perf/baked_prototype.js`** is the item 1 prototype, kept for the crops; its builder (voxel columns) is replaced by `shell.js` in the game.
* **The 1920 x 1080 viewport and the full maxcity script** of the exactness diff were not run.

## Your measurements

* `tools/perf/baked_mac.py` (`BAKED_MAC.md`): `PERF_GPU=1 python3 tools/perf/baked_mac.py dense --out baked_mac_out`: each build loaded once, every zoom, hour and motion from the same page, crops, full pictures, numbers, the simulation check, the bake stalls on your card.
* `tools/perf/baked_owner.js`: paste into the console of the game with your city, about 5 minutes. For tiers off, tiers on with baked off, tiers on with baked on, at zoom 30: frames a second standing still and in a slow turn (10 seconds each, `requestAnimationFrame` counts, the worst frame), the JS heap (Chrome), the merged block geometry and the baked maps in MB. Puts your settings back. Not run by me.

## Open for the owner

1. Is the baked far view worth its memory (2.9 GB for the max city at 16 texels a unit, over 5 GB at the density the 720 setting needs on a 1080 screen) for the look it gives, which by the pixel counts is further from real than the stand-in's, and by one night crop better where windows are lit?
2. If yes: which of the cuts (two maps, fewer plots by distance) and what budget.
3. Keep distance and lights (0.3 and kept, or 0.45 and painted) for fewer triangles.
4. Whether the item 1 differences are acceptable (the plan's stop condition).
