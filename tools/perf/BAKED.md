# Baked far buildings (round 10)

Base: main at b1ff117. Branch `wip/baked` (pushed). Plan: `claude/baked-far-plan.md`. Helper branches `wip/baked-shell` (item 2) and `wip/baked-cache` (item 3's plumbing), both merged. Reports of the helpers: `BAKED_A.md`, `BAKED_B.md`.

## In one paragraph

It works, and it looks close to the real buildings, but it does not pay for itself the way the plan hoped, and it needs a decision from the owner. Item 1 passed: with a relief-mapped shell (the baked depth lets the shader find the surface the real building shows, so frames, sills and balconies keep their parallax), the three prototype plots at zoom 24, 27 and 30, day, dusk and night, still and mid-turn, differ from the real ones only by single-pixel edges. Built into the game (the tier `baked` of the detail tiers, the setting "Baked far buildings", off by default), the city-wide picture is close to real and, at night, close too once the lights that are not windows are kept as real geometry. Two numbers decide it: on the max city at zoom 30 the baked far view draws about as many triangles as the stand-in (6.17 M against 5.97 M, real 7.25 M), and it holds **2.9 GB of baked maps** on the card (61 pages) that the stand-in does not. The look is better than the stand-in at night for windows and frames; at noon the stand-in is as close to real as the baked one, or closer. Everything with the setting off is exactly as before (harness, below). Mac script for your card: `tools/perf/BAKED_MAC.md`.

## What each item did

| Item | State | Where |
| --- | --- | --- |
| 1 Prototype on three plot types | passed; crops in `tools/perf/baked/` (`dense_z*_h*_{still,turn}*.png`, made by the prototype in `baked_prototype.js`) | `tools/perf/baked_prototype.js`, `baked_proto.py` |
| 2 Shell builder for every plot type | done by helper A, merged | `js/shell.js`, `shell_probe.py`, `BAKED_A.md` |
| 3 Baking in idle frames, cache, rebake on edits | done: helper B's scheduler and IndexedDB store (`js/bakejob.js`), my baker on it (`js/baked.js`); the plot and its shell come from the plot worker | `js/bakejob.js`, `js/baked.js`, `js/recipe.js` (`RW.shell`), `js/recipeworker.js` |
| 4 Shell material in the merged blocks, shadows, glow overlay | done by me (not by a helper: it shares the merge in `world.js` with item 5) | `js/baked.js` (`bkPageMaterial`, `bkBlock`), `js/world.js` (`rebuildSolidGen`) |
| 5 Swapping through the tier machinery, the setting, the stand-in fallback | done by me, same reason | `js/world.js` (`tierOfKey`, `memberGeo`, `tierTick`), `js/input.js`, `index.html` |
| 6 Measurements and the owner's script | done; the script is `tools/perf/baked_owner.js` | below |

### How it works

1. **Shell** (`shell.js`, in the plot worker): a plot's geometry is voxelized, closed, cut into at most 12 boxes that follow its mass, each face snapped to the real wall or roof plane; a triangle that sticks out of the boxes by more than 0.3 stays real ("kept").
2. **Bake** (`baked.js`, on the page, a step a face): for each shell face the plot's real triangles are drawn orthographically from outside into a slab of 0.3 outside to 0.7 inside the face, into three RGBA maps: A the vertex color and the depth, E the emissive color and kind, N the normal (a byte per axis) and the window's switch-on threshold. Texels the slab saw nothing in take their neighbor's. Flickering and blinking pieces are baked switched off. 16 texels a unit.
3. **Pool**: maps live in pages of three 2048 x 2048 maps on the card (slots 1024 wide), not on the page's heap; the store (IndexedDB) keeps them by recipe signature.
4. **Draw**: a block at the `baked` tier merges, as before, the geometry its plots give it: for a baked plot that is its kept geometry (plus any small piece that touches a kept part whole, and every bulb, neon and other glow that is not a window). Beside the merge the block gets one shell mesh per page: quads at the slab's outer boundary (and 0.8 wider than the face), a fragment shader that marches the view ray into the baked depth (32 steps and 5 of bisection), and the buildings' own toon lighting from the baked albedo, normal and emission (the evening switch-on is `litOn` on the baked threshold, as for real windows). The shell writes the normal image the outlines use and its own depth (`gl_FragDepth`), so the live glow overlay (flickering lights, windows near their switch-on: `glowOverlay`) draws over it with the same depth test as over real buildings. The shell casts its shadow from the wall (a depth material that pulls the quad back to the face).
5. **Swap**: the existing machinery. `tierOfKey` says `baked` when a block is at the stand-in tier, the setting is on, and every plot of the block that can be baked has its bake (megastructures cannot; a block with a plot not yet baked stays on the stand-in, which is the fallback). A block changing between stand-in and baked is a tier change: it waits for the view to move, notes its box for the static cache, and keeps the other merge for a minute for flip tests (`TIER.stash`), exactly like the detail tiers. Switching the setting does what switching the tiers does (`tierApplyNow`).
6. **Edits**: a plot made again with a new recipe (an edit, a neighbor) loses its bake, the block goes back to the stand-in, the plot is baked again, the block swaps again (the real-page check does this).

## Decisions I took

* **Relief mapping, not flat painting.** Flat faces looked wrong (frames and balconies sit at their real depth only with parallax); with the depth channel the prototype's differing pixels on the three plots fell from 19.7 k to 10.5 k, and to 7.6 k with the final shell builder (of 921,600). The quad must be drawn wider than the face (rays that cross the outer boundary beside the face hit the face below), and a ray that enters the face's rectangle from the side already below the surface is air, not a hit; both were found in the first city-wide crops.
* **Shell at the slab's outer boundary** (0.3 out), so things that stand out of the wall by up to 0.3 keep their silhouette and parallax.
* **Maps**: three RGBA maps, 12 bytes a texel, 16 texels a unit (1 texel a pixel at zoom 24 on the 480-line base at the default cap of 1.6 times; at 720 lines on a 720 screen it is 15). More texels did not change the match (32 a unit gave the same count of differing pixels), so the match is limited by geometry, not by density.
* **Kept geometry**: the shell builder's rule (farther than 0.3 from every box), plus a piece that has a kept part stays whole (up to 700 triangles), plus every bulb, neon and other glow that is not a window. The last one is the difference between a lit vertical neon tube (a texel and a half wide, baked fat and too bright) and the real thing at night.
* **Overlay**: the switch-on windows and the flickering and blinking pieces of the baked part are drawn from a copy of those triangles through the existing `glowOverlay`, on a mesh no pass draws.
* **Plot and shell from the worker** (`RW.shell`): the plot is made again there with `Shell.build` on its geometry, so the page never makes the plot or runs the voxelizer (10 to 140 ms a plot; 390 ms the worst). Without a worker (the harness) the page does it, a step of 55 to 100 ms per plot.
* **Setting off by default** (`neonIsland.baked`), and it needs Detail tiers on. With it off nothing runs (no scan, no store reads, no pages).
* **A page budget** (`BK.maxPages`, 10 pages = 480 MB by default): once the pages are full no plot is baked (nearest the view first, what is baked stays); blocks with an unbaked plot keep the stand-in. The measurements below lift it.

## Numbers (software renderer: counts and bytes only; no frame was timed)

### Max city (`measure_maxcity.json`, 1,637 plots that can be baked, zoom 30, noon, static cache off so the frame is drawn in full)

| | real | stand-in | baked |
| --- | --- | --- | --- |
| triangles drawn in a frame | 7,251,494 | 5,969,248 | 6,169,934 |
| draw calls | 1,591 | 1,591 | 2,152 |
| merged block geometry on the card | 1,160 MB | 690 MB | 218 MB |
| baked maps on the card | 0 | 0 | 2,928 MB (61 pages, 1.57 MB a plot) |
| three.js geometries / textures | 1,559 / 42 | 1,559 / 42 | 2,737 / 225 |

Per baked plot on the max city: shell 104 triangles, kept 2,047 triangles, overlay copy 569 triangles, 137 k texels (1.57 MB), 21% of the faces' texels were holes (filled from the neighbor). Time per plot in the test pages (software renderer: the card's steps are its, not a card's): 1,210 ms of which 99 ms is making the plot (the page's own step: with the worker this is off the page) and 264 ms reading the maps back (a software renderer's read; a card's is far shorter). The CPU-only steps (sorting, pieces, compaction, fill) are 4 ms together. Counts above are of the uncapped bake; with the default 10-page budget only the nearest 270 or so plots would be baked.

### Dense scene (`measure_dense.json`, 271 plots, zoom 30, noon)

| | real | stand-in | baked | baked, keep 0.45 and lights painted |
| --- | --- | --- | --- | --- |
| triangles drawn in a frame | 1,036,236 | 821,101 | 720,128 | 521,836 |
| merged block geometry | 114 MB | 70 MB | 28 MB | 19 MB |
| baked maps | 0 | 0 | 336 MB (7 pages) | 336 MB |
| kept triangles per plot | | | 941 | 208 |

The last column is what the kept geometry costs: raising the keep distance from 0.3 to 0.45 and painting the lights that are not windows takes the kept triangles per plot from 941 to 208 and the frame to 522 k triangles, but it paints thin lights, which looked wrong at night (first crops); it is `window.__BAKED_SHELL = {keepDist: 0.45}` and `window.__BAKED_NOLIGHTS = true` for the owner to try.


### Dense scene, every block baked, through the game (`far_dense_z*_h*_*.png`; pixels of 921,600 that differ at all, so a one-pixel shift counts)

At zoom 24 the swap has not happened (blocks are full up to and including 24: 0 pixels differ, so those crops show nothing); the swap-zoom crops are at 24.5. Triangles are only given for mid-turn captures, where the frame is drawn in full (a still frame is the static cache copied).

| zoom | hour | motion | pixels differ real/stand | pixels differ real/baked | triangles real | stand-in | baked |
|---|---|---|---|---|---|---|---|
| 24.5 | 12 | still | 95981 | 368388 | (static cache: not counted) | |  |
| 24.5 | 12 | turn | 82316 | 375089 | 1189361 | 932841 | 761286 |
| 24.5 | 19 | still | 166701 | 399236 | (static cache: not counted) | |  |
| 24.5 | 19 | turn | 126929 | 377580 | 1188435 | 931915 | 760360 |
| 24.5 | 23 | still | 192374 | 430512 | (static cache: not counted) | |  |
| 24.5 | 23 | turn | 156050 | 427974 | 1188091 | 931571 | 760016 |
| 27 | 12 | still | 80270 | 322585 | (static cache: not counted) | |  |
| 27 | 19 | still | 139915 | 353313 | (static cache: not counted) | |  |
| 27 | 23 | still | 166888 | 382079 | (static cache: not counted) | |  |
| 30 | 12 | still | 60415 | 273857 | (static cache: not counted) | |  |
| 30 | 12 | turn | 47201 | 258418 | 1043588 | 870013 | 747585 |
| 30 | 19 | still | 110418 | 294621 | (static cache: not counted) | |  |
| 30 | 23 | still | 128231 | 321737 | (static cache: not counted) | |  |
| 30 | 23 | turn | 95882 | 297632 | 1044990 | 871415 | 742219 |

Reading it: by this count the baked far view differs from the real one in two to four times as many pixels as the stand-in does, at every zoom, hour and motion (a count of pixels, not of what an eye sees: see the crops). Mid-turn the frame has 1.19 M triangles real, 0.93 M stand-in, 0.76 M baked at zoom 24.5, and at zoom 30 1.04 M, 0.87 M and 0.75 M: baked draws 16 to 19% fewer than the stand-in in the dense scene (the max city, above, is the other way round: about 3% more).

What the crops show where the stand-in is worse: at night the stand-in merges the lit windows of a tower into bright bands and the baked version keeps the window frames (`far_dense_z30_h23_still.png`, the tower on the left).

A diagnostic on the rooftop specks (a rooftop dish with yellow and teal bits that the real one has in other places): with the glow overlays hidden they stay, and with the shells hidden they stay, so they are small real pieces kept next to painted ones, not the overlay: placement differences of single pieces, not a drawing bug.

### Reading the numbers

* **Triangles**: baked draws about as many as the stand-in on the max city, 3% more, and 12% fewer in the dense scene. The shell itself is nothing (about 100 triangles a plot); what is drawn is mostly the kept geometry (about 2,000 a plot on the max city). Baked does not remove the triangle cost the stand-in has.
* **Memory**: the baked maps are the cost. At 1 to 1.6 MB a plot they are 2.9 GB for the max city, four times what the stand-in's merged geometry takes in all, and more than most cards have free. What would bring it down, not done: two maps instead of three (the emissive color is the material's, an index; the normal in two bytes: 8 bytes a texel, a third less), 12 texels a unit instead of 16 (about 45% less area), faces the camera cannot see not baked, and a budget by distance (done: `BK.maxPages`). Together perhaps a fifth of today's size, still hundreds of MB for a big city.
* **Draw calls**: 35% more on the max city (a shell mesh per page per block, the overlay).
* **Bake time**: about 0.4 s a plot in the dense scene and 1.2 s on the max city in the software renderer, spread over frames by the scheduler's budget (4 ms a frame while frames are short, `BAKE.autoBudget`); the city loads and plays while it bakes (the real-page check bakes nine plots with the worker in the background). How long it takes on a card is the owner's to see; the script does not time bakes.

## Checks

* **Setting off is exact**: `harness.py diff --base b1ff117 --quick` against the working tree with the setting at its default (off): city 25 captures, dense 13 and megas 15 (28 together), maxcity `PERF_STEPS=noon_f1,night_zoom_out` 2 captures: 0 problems in all (1280 x 720; the 1920 x 1080 viewport was not run).
* **Real page** (`tools/perf/baked_real.py island`, the game's own frame loop, the plot worker on, a 480 x 270 window): the city loads from its recipes; the setting on; every plot baked by the worker's shell (9 of 9); 3 of 3 blocks swapped to baked; zoom in (blocks full), out again, the setting off and on again, a plot edited (its bake dropped, made again, swapped back); no page or console error. This check found a regression the harness cannot see: `shell.js` was loaded after `recipe.js`, so the worker (which reads the script list in a timer after `recipe.js` runs) never started; it is before it now. The city scene (171 plots) bakes too slowly in the software renderer for the same script; the plot-count and bake behaviour on it are in the harness crops.
* **Crops** (`tools/perf/baked/`): the prototype's (`dense_z{24,27,30}_h{12,19,23}_{still,turn}.png` and `_zoom.png`: real | baked | difference x4 for the three plots, made by `baked_proto.py` with the prototype's own bake, at zoom 24, 27 and 30, day, dusk and night, still and mid-turn) and the integrated ones through the game's own tier (`far_dense_z{24,24.5,27,30}_h{12,19,23}_still.png`, `far_dense_z24.5_h{12,19,23}_turn.png`, `far_dense_z30_h{12,23}_turn.png`: real | stand-in | baked | difference real/baked x4 | difference real/stand-in x4, the middle of the picture; zoom 24 is before the swap), and the max city wide view (`measure_maxcity_wide.png`, the same five panels, whole picture).

## What the crops show (and do not)

* The prototype's three plots (plots 5,4, 7,4 and 7,3 of the dense scene: a tall tower with window grids, a stepped stack with balconies, frames and stairs, and a plot with rooftop structures and overhanging floors; none of the harness scenes has a lift pod, so the pod type was not in the prototype, though the shell builder was run on pods, `BAKED_A.md`): at zoom 24 to 30 day, dusk and night, still and mid-turn, silhouettes, colors, the window grids, balconies and sills match; what differs is single-pixel edges (a 1 px frame lands on the next texel), a few window panes in a slightly different tone, and at the ends of thin lit lines. The evening switch-on matches.
* City-wide through the game (`far_*`): silhouettes and colors match, the shell does not show at the block borders, the ground is right. Differences: rooftop equipment is sometimes cut or doubled (the kept piece against the painted one), thin neon and vines at night differ in brightness unless kept (they are kept now), a few lights are brighter or paler. The stand-in is closer to real at noon at zoom 30 than the baked one in these crops; the baked one is better where the stand-in loses frames and mullions between lit windows.
* Not shown or not solved: the **Smooth (screen resolution)** setting (16 texels a unit is a pixel at 480 lines only; at the Smooth setting on a 1440-line screen the texels are coarser than pixels: baked would need 2 to 3 times the texels, or the stand-in stays: the tier does not know the setting, so it stays baked and looks soft); **fine-detail LOD** (from about zoom 24 at the default cap the real shader drops the smallest pieces by size class, `LOD.fine`; the baked pictures keep them, so at zoom 30 they differ by those pieces); **megastructures** stay on the stand-in (the shell builder cannot make them cheap: 15 to 65% kept); **round and twisting towers** fit boxes badly (35% kept).

## Skipped, and why

* **Tilt below 15 degrees** (the Space tilt mode): the shell's quads are 0.8 wider than the face; at a lower pitch rays cross the outer boundary farther from the face and the edges show gaps.
* **Parallax past the slab**: things that stand out of the wall by more than 0.3 are real geometry (kept), things deeper than 0.7 inside it (the inside of a deep arcade) are not baked.
* **GPU-side filling and reading** of the maps (the read is a stall in a real card too, a few ms a map): done on the CPU after a read; an async read (a pixel buffer and a fence) and a fill on the card would remove it.
* **Memory reduction** (above) not done; **`BAKE.skip` for far-away plots** is the page budget only.
* **Worker bake**: the page's step makes the plot (55 to 100 ms) when there is no worker; with the worker it is the worker's.
* **`tools/perf/baked_prototype.js`** is the item 1 prototype, kept for the crops; its builder (voxel columns) is replaced by `shell.js` in the game.
* **The 1920 x 1080 viewport and the full maxcity script** of the exactness diff were not run (quick mode, one viewport; two maxcity steps).

## The owner's measurement script

`tools/perf/baked_owner.js`: open the game with your city, press F12, Console, paste the file, Enter, leave the tab in front. About 5 minutes (a first run may wait up to 6 minutes per setting for bakes). For tiers off, tiers on with baked off, tiers on with baked on, at zoom 30: frames a second standing still and in a slow turn (10 seconds each, `requestAnimationFrame` counts, the worst frame), the JS heap (Chrome), the merged block geometry and the baked maps in MB. Prints a table and the JSON; puts your settings back. A second run finds the bakes in the browser's store.

## Open for the owner

1. Is the baked far view worth 2.9 GB (the max city) for a better look at night and with lit windows, with the stand-in as good at noon? Or only with the memory work above?
2. If yes: which of the cuts (two maps, 12 texels, fewer plots by distance) and what budget.
3. Keep distance and lights (0.3 and kept, or 0.45 and painted) for fewer triangles.
