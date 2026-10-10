# Overnight 4: the recipes round (in progress)

Base: main at 6da3dbf. Work branch locally `wip/recipes`, pushed with `git push origin wip/recipes:claude/beautiful-lovelace-oa42g9` (the session branch; the owner asked for pushes this way).

## Items

| Item | State | Commit | Check |
| --- | --- | --- | --- |
| 0 Baseline | done (numbers below) | this file | memcheck, counts only |
| 1 Recipe and proof | done | see git log ("Round 9 item 1") | `tools/perf/recipe_proof.py`: 0 plots differ on maxcity (2025), city (227), dense (361), megas (267), 30 pods each on city and maxcity; harness quick check city 25 captures 0 problems |
| 2 Generation in a Web Worker | done | see git log ("Round 9 item 2") | `recipe_proof.py <scene> --worker` 0 differ on maxcity 2025, dense 361, megas 267, city 227, 30 pods; `worker_edit.py city --edits 12` 0 differ (8 by the worker, 4 taken back to the page); `diff --base 6da3dbf --quick --only city` 25 captures 0 problems |
| 3 Walking network off the main thread | partly; the helper moved the door search to the worker and put door meshes and spots in steps (OVERNIGHT4B.md item 3b, merged); path searches stay on the page | see git log ("Round 9 item 3") | `worker_edit.py city --edits 12`: network hash after all edits identical, 8 walking maps taken from the worker; `recipe_proof.py --worker`: walking maps byte-identical (city, dense); `diff --base 6da3dbf --quick --only city` 0 problems |
| 4 Drop the plots' own geometry | done (one named stall left) | see git log ("Round 9 item 4") | `diff --base 6da3dbf --quick` city 25, dense 13, megas 15 captures 0 problems; `plotmem_check.py <scene> --same` (the same edits with and without letting go of the arrays: every plot and every merged block hashed) 0 differ on city (231 plots, 33 blocks), dense (399, 54), megas (267, 40); maxcity JS heap after play 2,519 MB kept, 1,847 MB let go (-672 MB) |
| 5 Detail tiers (cheat) | built, default on; owner to approve | commits "item 5, part 1" and "stand-in tier policy" | `PERF_CAND_INIT="window.__TIER_OFF = true;"` against 6da3dbf: city 25, dense 13, megas 15 captures 0 problems; the tier machinery alone (stand-in laid out from the same buckets, nothing left out, all blocks on it, `__TIER_ALL` with `__TIER_KEEPALL`) 0 pixel differences on dense; static cache `tiers_cache_check.py dense` reuse against every 0 pixels differ in 6 legs |
| 6 Never-seen job | partly (helper, wip/recipes-b merged); tiles off, backfill stays off | merge of wip/recipes-b | 20 plots at 48 views identical (see item 6; my first check was empty and is withdrawn) |
| 7 Load from recipes | built, default on with a worker | same commit | `load_check.py city --old-order`: every plot, region, megastructure, network node, place and network hash identical to the old load |

## Item 0: baseline (main 6da3dbf, software renderer, counts only)

| scene | JS heap after load | graphics bytes after load | three.js geometries |
| --- | --- | --- | --- |
| maxcity | 2486 MB | 1635 MB (buffers 1426, textures 174, renderbuffers 35) | 1762 |
| city | 121 MB | 269 MB (buffers 60, textures 173, renderbuffers 35) | 180 |

Load time to first frame and the placement split are timings, so they come from the owner's machine (see the measurement script at the end, not yet written). The placement split of round 7 (OVERNIGHT3) is the reference until then.

## Item 1: the recipe (js/recipe.js) and its proof

A plot's recipe is `recipeOf(c)`: its own saved fields (`i j x z green style mega park sections below lift`), `dark` (isDarkPlot), `nb` (four bits: does the plot beside it exist), and `nbi` only for plots that need it (below). `recipeGen(r, world)` makes the plot from that alone, on a stand-in cell, in a `cells` map that holds only the plot and stand-ins for its neighbors. A stand-in throws if a builder reads a neighbor field it was not given, so a hidden read cannot pass silently.

Everything below was found by tracing and by the byte comparison, in that order (the comparison found two reads the trace missed).

Neighbor reads (all of them):
- `cells.has` at the four edge offsets (railings, lift pads, rim plants). Recipe: `nb`.
- `liftSupports` (pods on a scaffold): for each of the four sides, whether the neighbor is a megastructure, how many sections it has, its `height` and its pod's deck `lift.y`. This reads a neighbor's `height`, which is an output of that neighbor's own generation, so a pod must be generated after its neighbors (stageChain already does this). Recipe: `nbi`.
- `rooftopBoard` front test (the air-filter hologram, one tower in 30): the `height` of the three plots in front of each of the four faces, twelve plots with corners. Recipe: `nbi`, filled only when the plot is an air-filter pick (hash, or `AIR_FORCE`). Found by the comparison on maxcity (23 plots), not by the first trace, which had too few of them.

Own fields read before written (the recipe): `i j x z green style mega park sections below lift`, plus `dark`, which `rebuildCell` sets before generating and the builders read (found by the comparison: 4 maxcity plots on dark streets differed until the stand-in carried it). `sections` entries are not changed in place (checked).

Own fields written (what a worker sends back with the data): `topY height lifts sectionTops firstFloors vent walks liftCab liftRoof belowTop belowTops _topLot` (the stand-in's `_written` lists them per plot).

Globals read that change the output (found by changing each global in turn and remaking a sample of plots, `recipe_proof.py --reads`; the rest, all of `S.*`, `PH.tests.*` except the two below, `GREEN_DEFAULT`, `megas`, `airCells`, `WALL_FORCE`, `AIR_FORCE`, `AIR_PAIR`, changed nothing on the city sample):
- the highway and metro lines (`highways hwIndex metros mtIndex`, through hwAt, mtAt, hwFeet, mtFeet, hwKeepOut, mtKeepOut, lineKeepOut, hwCap). Handled by `recipeWorld()`: a plain-data copy of the lines and their indexes, swapped in while a plot is made. With it the plots under lines are identical (18 city plots differ with it removed, 0 with it).
- the far-order test switches `PH.tests.leanRound` and `PH.tests.thinSticks` (read in `collectGen` into `FAR_CFG`): a worker is told them.
- Not seen to change anything in these scenes but kept on the list for the worker: `megas` through `hwSurface` (only for highways over a megastructure plot).

Globals written during generation (fingerprint of every top-level name before and after, `--globals`): the builders' own buffers (`buckets emitters carPads curPorts glowList curSpots curCover`, the foliage lists, reset at the end of `collectGen`), `ALL_MATS` (materials created on first use, grows by a few: a worker needs the same material table and ids), `FLUID_PICK` (set at the start of each glass pipe run before any read, so nothing carries from one plot to the next), `airCells` (the stand-in is added or removed; recipeGen returns this as `_air` and takes the stand-in out again).
Math.random is used by `detailId` and `flickerId` (one call per piece): 10 to 2216 calls per plot, the same count live and from the recipe on every plot. A worker has to report its count so the main stream advances the same.

Result (seeded stream restarted before each plot, geometry attributes, indices, cut and far orders, plants, glows, emitters, pads, ports, spots, every written field, the air flag and the random count all compared as hashes):

| scene | plots | different |
| --- | --- | --- |
| maxcity | 2025 (388 megastructure plots, 1525 stacks, 112 empty) | 0 |
| city | 227 | 0 |
| dense | 361 | 0 |
| megas | 267 | 0 |
| pods, 30 hung on city | 30 | 0 |
| pods, 30 hung on maxcity (26 over a building) | 30 | 0 |

Negative controls: flipping a neighbor bit makes every plot differ (60 of 60); emptying the lines makes the 18 plots under them differ.

Decisions (each with why):
- The recipe holds the plot's own saved fields and not a hash of them, because a worker needs the values to build from.
- `nbi` only for pods and air-filter picks, because the other plots read no neighbor field (the stand-in throws otherwise), and a recipe should stay a few hundred bytes.
- The stand-in for the cell is a Proxy only while generating, to list what generation assigns, because the worker must send back exactly those fields and no others.
- Megastructures themselves (buildMega) are not recipes in this round: their plots are covered, the structures keep their own data, because their builders are a separate path and the plan's items name plots.
- The proof is a tool (`recipe_proof.py`) and not part of the quick check, since the quick check is the harness image comparison; the tool runs in 11 s on city, 130 s on maxcity.

## Item 2: generation in a worker (js/recipeworker.js, js/matreg.js, js/recipe.js)

What was built: the plot worker loads the game's own builder scripts (the same files in the same order as index.html, `importScripts`, no copy of any builder) with a stand-in document, renderer and texture loader, takes the lines once (`world`) and a recipe per plot (`gen`), and answers with the made plot as arrays (`recipePack`/`recipeUnpack`, buffers transferred, three.js vectors and matrices as tagged numbers, an object that appears twice staying one object, materials as their place in the load-time list). `stageStart` (world.js) asks the worker when it is ready; `stageStep` takes the answer (one cheap step on the page: wrapping arrays in geometries); `stageFinishAll` (any edit, a sync rebuild) cannot wait, so it cancels the job and makes the same plot on the page in steps as before. The round 8 staged path is the fallback for everything (worker not loaded yet, failed, a material made after load, a test).
Test: `generation on the main thread (as before)` (`PH.tests.genMain`, or `window.__GEN_MAIN`). In the perf harness the worker is off (the harness clock and seeded stream cannot be shared with a thread) unless `window.__GEN_WORKER`, which `recipe_proof.py --worker` and `worker_edit.py` set.

Things found on the way that a worker could not have done without (each is in the code with its reason):
- `core.js` kept `PITCH_MIN`, `PITCH_MAX` and `clamp` that the builders use in `input.js`, which the worker does not load. Moved to `core.js` (same values, nothing else changed).
- `buildings.js` (industrial windows) picks a color from `mat.id`, three's own counter. The page's renderer takes two ids for its shadow-pass materials before any game material, the worker's stand-in renderer takes them by making two materials, so the ids agree. The worker's start is checked: a signature of every load-time material (id, type, colors) must match the page's, or the worker is not used.
- `roundedBox` (core.js) caches shapes by size to two decimals and a later box of nearly the same size takes the first one's shape, so a plot differs by a few thousandths depending on which plot asked first (one pod in 30 differed in the first worker run). The page and the worker now keep one cache: each request carries the shapes the page has made since the last one, each answer the shapes the worker made, and when both made one the page's stands.
- A bug found on the way (not fixed, it does not change the picture): `buildings.js` night-market stalls call `toon(0x2a6a5a)` and `toon(0xb0803a)` for every stall to pick one of four materials, so every stall leaves two never freed materials in `ALL_MATS` (88 per 400 plots on dense), which `sky.js` walks every frame. Hoisting them to two constants would be exact, but it changes material identity and I left it for the owner to decide.

Decisions:
- One job at a time, as the staged path already was, because pods and air-filter towers read the heights of the plots made just before them.
- Materials by place in the load-time list and not by three's id, because ids differ between the threads (see the renderer's two).
- Lines copied as only the fields builders read (`id lanes done side dir0 st sides` and tile `i j L`), because the rest of a line is its drawn geometry and cars, with cycles (a copy of the whole line overflowed the stack in a played page).
- The worker starts 1.5 s after the page loads, so it never competes with the first frame.
- Harness: worker off by default, because a thread's answer cannot arrive on a scripted frame; the proof of the worker's output is byte for byte (`recipe_proof.py --worker`) and of the edit path (`worker_edit.py`).

Not measured here (software renderer, no timing): how long the page is free per placement. Counted instead: a placement on the page is `recipeOf` (a few object copies), one `stageTake` (geometry wrappers around transferred arrays) and the sweep, where it used to be many staged slices of generation; owner timing goes in the measurement script.

## Item 3: the walking network

Chosen: neither of the two ways the plan names whole. The part of `buildNetwork` that is new work after an edit is the changed plot's maps (`rasterize` of its geometry and the walking map `free`, run lazily by the first `cellGrid` call), which is exactly the compact snapshot the plan describes, and the plot worker has the plot's geometry in its hands anyway. So the worker makes the maps with the plot (`plotMaps`, the same code `cellGrid` ran, now a function of its own) and sends them as typed arrays with it; `cellGrid` takes them from `data.grids` and falls back to making them as before (plots made on the page, megastructures). One line on why: the rest of the build (crossings, doors, places, paths) is already in steps from round 8 on cached per-plot results and writes objects the page owns (places point at plots and megastructures, doors carry their open state, the door meshes), so a port to a worker would be a second copy of that logic and a way to break "identical", for the small part that is left.
Identical: after 12 edits through the worker (8 made by it, 4 taken back to the page because the next edit came first) the network built in one call has the same hash (nodes, links with their points and costs, doors, places) as after the same 12 edits on the page, and the walking maps of every plot of city and dense equal what the page makes (all five arrays, byte for byte). `diff --base 6da3dbf` on city (people state included): 0 problems. People keep the old network until the new one is committed: that is round 8's `netSlice`, unchanged.
Not done: running the path searches and the door search in the worker. They need the neighbors' maps for the crossing points, which the worker does not hold for plots made on the page.
The biggest single call after items 2 and 3: not measured here (no timing in the software renderer). By construction it is one of the page's own steps from round 8: a path search step in the network (a Dijkstra over at most 40 by 40 cells), `rebuildDoorMeshes` in the network's last step (it scales with the doors in the city), a region merge step, or `stageTake` (wraps arrays, copies none). `tools/perf/placement.py` now lists `stageStep stageTake recipeOf recipeUnpack plotMaps rasterize freeMap netSlice syncPeopleNetStep rebuildDoorMeshes gridPaths plotEdgesGen` too: its run on your machine names it with its time.

## Item 4: the plots' own geometry

Built (js/recipe.js `PM`, hooks in world.js, main.js, core.js): once a plot is merged into its block, the arrays of its atlas mesh (position, normal, color, aEm, aFlk, aFine, aOn) are let go: the attributes get accessors that make the plot again from its recipe and the random draws of its generation (`data.rec`) when anything reads them. The ones that matter ask in good time (`pmEnsure`: the worker makes the plot again, the arrays arrive a few frames later; a block's re-merge waits for them with the old merge staying drawn: `pmBlockReady` in `solidStep`), the rest is a slow restore on the page, counted in `PM.sync` (and traced by `PM.trace`). The index stays (the never-seen job reorders it, and it is the smaller part, 140 of 975 MB). Test: "keep the plots' own geometry (as before)" (`PH.tests.keepGeo`, `window.__KEEP_GEO`).
What made it exact: generation's random draws (detail and flicker ids, `core.js`) go through `fxRand`, which records them (`collectGen` returns them) or replays a recording, so a plot made again is the same to the byte; `recipe_proof.py --regen` checks every plot against its own recording (city, 227: 0 differ). The shared rounded-box cache and the load-time materials (item 2) make the worker's copy the same.
Every reader of a plot's arrays, found by letting them go and counting what fell back (`plotmem_check.py`, `st3` style run of the harness steps): the region merge (`rebuildSolidGen`: prefetched), the never-seen job (the plot is not let go until the job has been through it: `pmBusy`; it reorders the index and reads positions), the walking maps (`rasterize`: made with the plot, item 3; for plots made on the page `attachRec` makes them while the arrays are there), the door rays of a pod (`podDoorSpot` runs on fresh data), the bounding box `world.add/remove` note for the static cache (now taken when the plot is made, so no arrays are needed: `computeBoundingBox` in `collectGen`; this was 3 slow restores in the harness edit steps), and a luxury pod's walkway, which asks how far its neighbor's wall stands (`wallGap` reads the neighbor's triangles: for a pod made by the worker the page takes them from the neighbor's arrays, or, if they are let go, sends the neighbor's recipe and the worker makes the neighbor again for them: `recipeOf`/`recipeGen`).
Other things this found: `recipeGen` used to empty and refill the map `cells` while it ran, which breaks any caller further up that is going through it (found as a hang in a test); it now shadows `get` and `has` on the one map and makes `values`, `keys`, `entries`, `forEach` throw. A restore can happen in the middle of making another plot (a builder reading a neighbor): the builders' globals are put back around it (`stageCap`/`stageApply`).
Result on maxcity (memcheck, JS heap after a forced collection): 2,519 MB with the arrays kept, 1,847 MB with them let go after a short play (-672 MB, 27%); 2,024 of 2,025 plots are let go 600 frames after load. It stays above the plan's "most of 1,065 MB" because the index arrays (140 MB), the glow data, the recipes and draws (a few KB a plot) and the per-plot walking maps (27 KB a plot, were there already) stay, and because 'load' is measured before the first merges. Graphics bytes unchanged (1,640 MB).
The one stall left, named: placing a luxury ('high' zone) pod with `addLift` makes the pod on the page (`refresh` -> `rebuildCell`), and each supporting neighbor whose arrays are let go is made again on the page for its wall triangles (`wallGap`): up to four plots of generation in that one call (3 slow restores in the city edit script, 1 in dense). The same pod through the staged path would send the neighbors to the worker. In the played flows of `plotmem_check.py maxcity` (a section, a commercial pod, a demolition, turns, pans, zooms) there were 0 slow restores.
Not done: the `toon(0x2a6a5a), toon(0xb0803a)` leak in the night-market stalls stays (a plot made again on the page makes two more never-freed materials per stall; the worker's own copies do not matter). Hoisting the two would shift every later material id, and a builder picks industrial window colors by `mat.id`, so it would change the picture.

## Item 5: detail tiers (a cheat; for you to approve)

What it is. A plot has two geometries: full (today's) and a stand-in, cut from what the plot's generation just made (so it costs no random draws and is the same from a recipe): the pieces that are fine details (sticks, tiny bits: aFine) or have no side as long as `TIER.small` = .30 world units are left out, lights are always kept, and a small piece that touches a lit pane (its frame, a mullion across it) is kept too. By the piece classes of the round 7 probe (`classOf`, tools/perf/geo20f.js): sticks, thin plates and small boxes and small round parts go, windows, other glowing parts and the main structure stay. Which blocks (the 3 by 3 plots merged together) draw the stand-in: when the view is closer than zoom `TIER.zs` = 24 those whose middle is more than the view's reach plus 12 units away from the middle of the view (and any beyond the 36 nearest); when it is farther than 24, all of them (the zoom runs from 5 to 30, so at the farthest everything is stand-in). A block changes tier by being merged again from the other geometry; the old merge stays drawn until the new one is made, which waits for the worker to send the plots' arrays. The swap is held until the view moves (turning, tilting, zooming, panning) and happens in a still view only after 120 frames of waiting, so a change does not appear in the middle of a still frame; a block goes back to the stand-in after being out for 180 frames. A tier swap notes the block's box as an edit rectangle for the static cache (a merge is otherwise quiet). Tests (overlay): "full detail everywhere (as before)", "show tiers (stand-ins tinted red)", "stand-in tier everywhere (to measure)"; for tools `__TIER_OFF`, `__TIER_SHOW`, `__TIER_ALL`, `__TIER_SMALL`.
Cost per plot (CPU arrays, the same bytes as on the card), dense scene, 271 plots, `tiers_measure.py`: full 5,204 triangles and 0.33 MB, stand-in 2,419 triangles (46%) and 0.15 MB (47%): empty plots 78% (0.05 to 0.04 MB), industrial 34% (0.33 to 0.12), commercial 39% (0.52 to 0.19), low 47% (0.63 to 0.30), luxury 71% (0.53 to 0.37). Maxcity (2,025 plots), graphics buffers after the whole city had changed tier at zoom 30, `tiers_gfx.py`: 513 MB against 951 MB with the tiers off (-46%), graphics 699 MB against 1,137 MB; the triangles of a drawn frame (static cache off) 11.1 million against 14.1 million (-21%; round 6's size culling already drops sub-pixel triangles from the draw, so the drawn count falls less than the memory does). That run was with the first, more generous stand-in (45% of the triangles); the figures in the dense table are the final rule.
Triangles drawn, dense (static cache: a still view draws only the live 155,668 triangles both ways), turning: zoom 30 1,042,940 off against 799,492 on (-23%), zoom 22 1,157,411 against 1,090,959 (-6%), zoom 15 934,819 against 913,982 (-2%).
Crops (tools/perf/overnight4/tiers_dense_z*_h*_still|turn.png, each: tiers off | tiers on | difference x4; tiers_dense_show.png is the show-tiers picture; tiers_dense.json has the numbers). Pixels that differ of 921,600, day then night: still zoom 15 4,881 and 8,238; zoom 22 37,431 and 59,488; zoom 30 113,257 and 191,622; turning zoom 15 11,472 and 20,068; zoom 22 50,630 and 76,748; zoom 30 93,051 and 159,796.
What to look for. At night the window grids read brighter at the farthest zoom (the thin dark fittings in front of the panes are gone), railings and cables thin out, small rooftop fittings are missing, and at zoom 22 and farther the whole view is stand-in. Popping: after zooming in past 24 or panning, a block nearer than the margin is made again by the worker (a plot takes a worker generation, about the time of a placement's generation, some 50 ms on a laptop core, nine plots a block), merged in steps, and swapped in while the view moves; in a still view the change shows up within 2 seconds of the view stopping. The margin (12 units, about three plots) covers a slow pan; a fast pan will show stand-ins at the edge of the view for a second or two.
What I would check first: the farthest zoom at night. `TIER.small`, `TIER.zs`, `TIER.margin` and `TIER.maxFull` are the knobs.

## Item 6: never-seen job (my first part, then the helper's; details in OVERNIGHT4B.md)

My first part (views limited to what can hold an unseen triangle, same pixel grid by a viewport shift, readback now and then, early stop) was checked with `nv_compare.py`, and the helper found that check was empty: the tool set the harness's `__perf.skip`, which turns every `renderer.render` into nothing, so every id picture was blank, every triangle counted as never seen, and "identical removed sets, 4 to 8% fewer pixels" proved nothing. I withdraw those numbers. The helper fixed the tool and redid it (branch wip/recipes-b, merged here): 20 plots (5 per zone) at 48 views each instead of the 1,344: old and new removed sets identical triangle for triangle; scatter vertices 93.5% of the old job's on the 20 plots (83% on one plot at 1,344 views), drawn pixels 96%; the early stop never fires (a plot always keeps never-seen triangles); results are now kept by recipe as well as by geometry, so a plot whose arrays were let go is not made again to be looked up (76 city plots made again with other random draws gave the same positions, indexes and cut sizes); several views in one target ("tiles") are built but off: they differ on 2 of 7,000 triangles on one of four plots (a tile away from the corner adds a whole number to the window coordinates, which rounds coarsely), and they only save draw calls. Estimate for the whole maxcity from counts (`nv_estimate.py`; 1,637 plots, 1,344 views each, 5,305 Gpx drawn): the cap of 8 views a frame at 60 FPS alone gives 76 minutes, pixel work at an assumed 2 Gpx/s about 80 minutes, against the plan's limit of about 15 minutes: backfill stays off by default. Not done: old against new at the full 1,344 views (over 10 minutes a plot here).

## Item 7: loading a saved city from recipes (js/loadcity.js)

When the worker is there, a saved city is made from recipes: the worker starts as soon as recipe.js is read; plots are asked for nearest the camera first, put in the world a few milliseconds a frame as they come; the order of the old load (plain plots, pods, air-filter towers, megastructures, then the whole-city work: a region's plants and lights as soon as its plots are in, the walking network and people at the end); a click edits nothing until it is done; the old load is behind "load on the main thread (as before)" and runs when there is no worker, it does not come up in 20 s, or it fails. Check (`load_check.py city --old-order`): every plot's arrays (all but the random detail and flicker ids), the regions, megastructures, walking network nodes, places and network hash are identical to the old load. In the nearest-first order 4 of 227 plots differ in the shape of a rounded box by a few thousandths: `roundedBox` takes the shape of the first plot that asked for a size to two decimals (a first-asker rule that is in the old code too), so the shape depends on the order plots are made in. The first plot is in the world 0.8 s after the page starts in the software renderer; timing of the first frame and of a settled city is for your machine (the measurement script). The harness keeps the old load (no worker there).

## Skipped or partial, one sentence each

- Item 3: the path searches and crossings stay on the page (after one edit only a handful are redone, each well under a millisecond); everything per plot that is big is in the worker or in steps.
- Item 6: no large speed-up found that keeps the removed set identical; tiles are off because they are not exact; backfill stays off (76 minutes at the very least for maxcity).
- Item 5: the maxcity figures for graphics are from one run (tiers_gfx.py, 22,800 frames of settling); the crops are of the dense scene only (the maxcity picture at zoom 30 is the same kind of difference).
- Item 7: first-frame and settled-city times are for your machine (below); harness runs keep the old load.
- The never-seen job's recipe-signature store and the tier policy have no run on the harness's `maxcity` beyond the figures above and the steps listed in the final check.

## Final check (against 6da3dbf, every new way that can be switched off, switched off: `window.__TIER_OFF = true`; the worker is off in the harness, so the old generation, old load and old network run)

`harness.py diff --base 6da3dbf --quick --only X` with `window.__TIER_OFF = true;` (the worker and the new load are off in the harness anyway):
- city, also with `__NV_OLD` and `__NET_OLD`: 25 captures, 0 problems. With only `__TIER_OFF` the same run reports 3 problems that are all `renderer.info` counters in the rush steps (scatter points of the never-seen job and 2 more textures from its decided-ids map); the pictures and the people's state are identical.
- dense: 13 captures, 0 problems. megas: 15 captures, 0 problems.
- maxcity, steps noon_f1 and night_zoom_out only (software renderer, a full set is over 10 minutes): 2 captures, 0 problems.
Worker and load checks: `recipe_proof.py <scene> --worker` 0 differ on maxcity (2,025), dense, megas, city; `worker_edit.py city --edits 12` 0 differ; `plotmem_check.py <scene> --same` 0 differ on city, dense, megas; `load_check.py city --old-order` identical; `tiers_cache_check.py dense` 0 pixels differ in 6 legs.

## My decisions (each with one line why)

- Recipe holds only own fields plus a neighbor-existence mask, extra neighbor facts only for pods and air towers: those are the only plots that read more, found by the stand-in throwing on any other read.
- One shared rounded-box cache between page and worker, page's shapes win: the cache makes a plot's shape depend on who asked first, so two caches would make worker plots differ.
- Materials named by place in the load-time list, not by three's id: ids differ between the threads (the renderer takes two).
- The plot worker starts as soon as recipe.js is read: it loads the game's scripts while the page does, so a load from recipes need not wait for it.
- Arrays of a plot are let go through accessors that make the plot again on the page when read: any reader I missed works, slowly, and shows in a counter instead of breaking.
- Stand-in cut from the buckets just made, not from a second generation: costs no random draws and cannot differ from the full plot.
- Tier swaps held until the view moves (or 120 frames): the plan says never in the middle of a still frame; the wait is the price.
- A tier change notes the block's box as a static cache edit rectangle: a merge is quiet because it changes no picture, a tier swap does.
- Hoisting the two `toon()` calls of the night-market stalls was left alone: it would shift material ids, and industrial window colors are picked by `mat.id`.
- The recipe-signature idea for the never-seen store was done by the helper only as a lookup key kept beside the geometry key, never applied to a geometry it did not match.

## For you to judge

- Item 5, the cheat: tools/perf/overnight4/tiers_dense_z*_h*_still|turn.png (off | on | difference x4) and tiers_dense_show.png; start with zoom 30 at night. The knobs `TIER.small`, `TIER.zs`, `TIER.margin`, `TIER.maxFull`, `TIER.hold`, `TIER.stillWait`.
- Whether 4 of 227 plots differing in rounded-box shapes by a few thousandths after a nearest-first load matters (it is the old cache's first-asker rule showing).
- The looks round (separate branch wip/looks, tools/looks/REVIEW.md) is not part of this report.

## Measurement script for your machine (about 5 minutes, main 6da3dbf against this branch)

Chrome, max city, 1280 by 720, optimize framerate off. Restart Chrome between builds. Do the first build (main at 6da3dbf, served as you usually do), then the new branch, then the new branch again with the test "full detail everywhere (as before)" switched on (F3, then Shift+F3, Tests row). Each time:
1. Load time: reload with DevTools Performance open (or `performance.now()` at the first `requestAnimationFrame` after `loadTick`/first drawn frame); write down the time to the first drawn frame, and (new build) `LOADP.line()` in the console when done: it says "loaded from recipes in N s (first plot after M s)". Main thread build for the old: the time until the first frame.
2. Memory: after the city has settled (2 minutes, zoom 30 still), Shift+Esc (Chrome task manager): the page's memory footprint (the worker is its own row: write both); in the console `PM.line()`, `TIER.line()`, `RW.line()`.
3. Zoom 30, still, wait 30 s after the zoom change: FPS (F3), color pass triangles; then a slow turn for 10 s: FPS. Zoom 15: wait 30 s, a slow turn: FPS.
4. Placing: console `window.__w = 0; (function f(){ const t = performance.now(); requestAnimationFrame(() => { __w = Math.max(__w, performance.now() - t); f(); }); })()`; place a house, wait 5 s, read `__w`, set it to 0, place a tower (a 'high' section on a tall building), wait, read.
5. With the tests "generation on the main thread (as before)", "keep the plots' own geometry (as before)" and "load on the main thread (as before)" on, step 4 gives the old placement numbers.
Write down: first-frame time, settled-city time, memory, FPS at zoom 30 still, zoom 30 turn, zoom 15 turn, worst frame for a house and for a tower.

## Not yet done (nothing planned; kept for the next round)

Items 2 to 7 and the final measurement script. Items listed as skipped will each get a sentence here.

## Fix after review (2026-10-10): the stand-ins keep the long bars

The owner's crops at zoom 30 showed lit towers changing in the stand-in: the bars running down a tower's face (long fine-detail sticks) were dropped, so the lit windows merged into bright bands. The cause was the drop rule taking every fine-detail piece whatever its length; the rule that keeps pieces touching lit panes did not help (widening it to all lights and 15 to 40 cm barely moved the difference), and with nothing dropped (`__TIER_KEEPALL`) the pictures are identical.

Changes: a fine-detail piece at least `TIER.long` = 0.6 units long stays (`__TIER_LONG` to try others); the keep-near-lights rule now counts every light, not only window panes, within `TIER.near` = 0.15 (`__TIER_NEAR`).

New crops in `tools/perf/overnight4/fix/` (still views; the turn crops in the folder above are from the old rule). Pixels that differ, dense scene, old rule then new: zoom 30 night 191,622 then 128,496; zoom 30 day 113,257 then 60,324; zoom 22 night 45,264, day 26,611. The striped tower that turned into bright bands now matches; what is left is scattered single pixels.

Cost: the stand-in is now 55% of a full plot's triangles and 56% of its bytes (was 46% and 47%), dense scene, 186 plots: empty 77%, high 81%, industrial 51%, low 52%, mid 50%. Expect the maxcity graphics saving at zoom 30 to fall from about 44% to roughly 38% (estimated from the per-plot share, not measured).

## Fixes after the owner's benchmark (2026-10-10)

On the owner's Chrome the build froze on load. Two causes, both found and fixed:
1. **The worker never started.** The page compared the worker's material signature with one taken when the worker reported ready, after the time of day had already recolored some materials on the first frames (the clouds), so it always differed (reproduced here with the same numbers: `389502996:712 vs 2430897162:712`). Both sides now take it when the material list closes at load (`MATREG.sig`).
2. **The fallback froze the page.** A plot made again that drew more random numbers than the first time threw inside the frame loop. It now goes on with fresh numbers, counts it in `FX_OVER` and warns once in the console.

Checked: a real-clock page (worker on) loads the city from recipes with no errors through repeated zooms in and out; the harness city check against cc5f320 gives 0 problems.

## Detail tiers as a setting (2026-10-10)

- "Detail tiers" checkbox in the render menu (Optimize framerate), remembered in this browser (`neonIsland.tiers`), on by default.
- Switching it skips the waits (the hold before a block goes to its stand-in, the wait for the view to move), merges the blocks on screen first with a larger share of each frame, and stops letting arrays go until it is done (`TIER.rush`).
- For a minute after each switch a block keeps its other merge on the graphics card (`TIER.stash`), so switching back is a swap on the same frame. An edit to the block, or the end of the minute, lets it go.
- Bug found and fixed: a plot with nothing small to leave out has no stand-in, and its block asked the worker for one forever (over 6,000 remakes in minutes in the city; such blocks never changed tier). Such plots are now marked (`noStand`) and drawn full in a stand-in block.
- Measured in a real-clock page on the city (software renderer, about 1 frame a second): off 4 frames, first on 39 frames, every switch after that 3 frames; the setting is back after a reload. Harness city against 8fafaee: 0 problems.
