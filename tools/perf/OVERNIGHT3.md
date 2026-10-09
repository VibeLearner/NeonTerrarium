# Overnight report 3 (round 8)

Branch `wip/round8` (from `wip/round7`, f114836). Nothing merged or published. No timing or A/B speed runs were done on this machine (the software renderer cannot time a card); the few counts below are triangle counts and call counts. What your machine should measure is at the end.

## Items

| item | status | commit | check (city only, `PERF_STEPS`, background) |
|---|---|---|---|
| 1 never-seen faces (cheat, default on) | done | bcaf52c, later fixes in the last commits | with "draw never-seen faces too" on, a small view set so jobs finish: noon_f1, noon_f120, dusk_19h, night_pan, 0 differences against wip/round7. With it off, pixels differ (the cheat), counted below |
| 2 placement freeze | done, target not provable here | bcaf52c | all old-way tests on, noon_f1, noon_f30, edit0 and edit1 (mid and end), evening_cycle: 7 captures, 0 problems. Plot built in steps equals the one-frame build (5 plots, with other builds and random state interleaved between steps): identical |
| 3 lean round parts, thin sticks | done, small gains | third commit | both tests on: noon_f1 to night_pan, 6 captures, 0 problems |
| Final: city, dense, megas (quick) against wip/round7 | all round 8 switches off: 53 captures, 0 problems. Defaults: see below | | |
| Max city, once | switches off, noon_f1 and night_zoom_out: 0 problems | | |

## 1. Never-seen faces (2b as a cheat)

What it does (js/neverseen.js): for each plot, in idle frames, the plot's own triangles (never the neighbors) are drawn as an id picture from 48 turns x 8 tilts (PITCH_MIN to PITCH_MAX) x 4 sub-pixel offsets at a pixel of .006 (your 1,640-line closest zoom), your best set from round 7. Each view's ids are scattered on the card into a small map, so one read-back per plot. Drawn triangles never seen, and not a depth tie, move to H (still in the shadow pass and in sweeps). The result is stored by the plot's geometry signature in IndexedDB (once per plot, ever); stored results apply one plot a frame. Idle means: view still for 30 frames, no upkeep, no sweep, tab visible; views a frame go from 1 up to 8 while frames stay under 18 ms; plots nearest the view first. Overlay test "draw never-seen faces too" (and `window.__NV_DRAW_ALL = true`) puts the faces back at once; `window.__NV_OFF = true` stops the job. Placing a building is not slowed: the job waits for a quiet view and a plot is rebuilt only when its geometry changes.

Numbers (dense scene, 20-plot style picks by size, production set against a dense reference of 96 x 14 views at pixel .0045 offset by half a step; each plot took minutes in the software renderer, so two plots):
| plot | drawn | production removes | reference never sees | false removals | depth ties kept |
|---|---|---|---|---|---|
| industrial, 1,342 triangles | 1,342 | 183 (13.6%) | 183 | 0 | 10 |
| mid, 6,238 triangles | 6,238 | 1,119 (17.9%) | 1,010 (16.2%) | 155 (13.9% of removed, 2.5% of drawn) | 24 |
Round 7's three-plot run gave 3.0% of removed; this plot is worse, so expect 3 to 14% of the removed set to be seen somewhere in a dense sweep.
Triangles removed per frame at zoom 30 and 15: I could not run the job over a whole city here (136 to 525 ms a view in the software renderer, 1,536 views a plot). By share, 14 to 18% of a plot's drawn building triangles; with the dense scene drawing 852,000 triangles at your zoom 30 pixel size and 329,000 at zoom 15 (item 3 table), that is about 120,000 to 150,000 and 45,000 to 60,000 fewer once every plot is done: an estimate, not a measurement. Your machine can read the real number: toggle the test and read the color pass triangles (see the script).
Crops of the worst false removals (mid plot, ordered by area; flat shading from the view where the reference sees the triangle most): tools/perf/overnight3/item1_worst_plot60.png (columns: all faces, faces the build keeps, difference x4). The worst ones are a one-pixel-wide line along a ledge (a thin strip of a face seen at a grazing angle, 150 and 130 pixels long in the picture, one pixel wide) and single pixels or a one-pixel column; none is a patch of wall.
Pixels at default against off (all plots done is not reachable here): not measured.
Idle cost: 1,536 views a plot; at 1 view a frame and 60 FPS that is 25 s a plot, so 2,025 plots take hours, shortened by the adaptive views a frame and kept for good in the store. Memory: 2 render targets of at most 4,000 squared while a job runs, freed after.

## 2. Placement freeze

Built (world.js, people.js, sky.js, mega.js), all on by default, each with the old way behind a test:
- Plots are generated in steps ("plots built in one frame (as before)", `__STAGE_NOW`): the platform, then each section, then the pieces of collect (typed arrays, hideCovered a bucket at a time, the wall layout), about 90 to 117 steps for a plot, run a few milliseconds a frame; the old look stays until the new is ready, then the sweep starts. The globals the builders write are put back between steps, so nothing else that builds sees a half-made piece; any new edit first finishes the pending plot. The plots an edit makes rebuild (air towers, pods) are made the same way, one after another.
- The walking network is rebuilt in steps (tables swapped in only while a step runs; people keep the old network until the new one is committed); unchanged plots reuse their cached crossings, doors and paths, so only the changed plots do path searches (each search a step).
- Residents/jobs, the steam map (a few vents a frame), the region merges (a step per attribute, per row of triangles, per material), the police alert (next frame, second bike a frame later) are in steps. The un-merge of a block when a sweep starts is now immediate and cheap (the re-merge follows); it used to be a whole merge in the edit's frame.
- A frame's spread work is counted so the region merge waits for a quieter frame.
- "edit upkeep in the same frame (as before)", "police alert in one frame (as before)".
Not done: a Web Worker (the builders touch the kit's three.js objects and shared module state); megastructure arrival (once per kind per city, a single build of 80 to 160 ms here, now in a frame of its own); a megastructure's own collect is in one step; one step of a very large tower section and the glow overlay's scan when a region is finished are single units. Steps here, in the software renderer, mostly stayed under about 25 ms; I could not prove no frame over 33 ms (see the script). The check is only that the picture and the result are the same as the old way.
Plots' own CPU geometry (approved if picking and editing pass): not dropped. Re-merging a block, the walking maps and the door ray tests read every plot's arrays; the only way back is to generate the plots again, whose random flicker and detail ids come out different, and each edit would regenerate up to 8 neighbors. Revisit with a compact copy (16-bit corners).
People and timing differ after an edit (the random stream), as allowed.

## 3. Lean round parts (2d) and thin sticks (2e)

Each plot and block gets a second index order (js/world.js sideLayoutGen far, mergeCutGen far; blocks share their corners) used when the pixel size is large enough: lean parts from a pixel of .0227 world units (about zoom 19 at 1,640 lines), sticks narrowed from .035 (zoom 29). Overlay tests "full round parts", "full sticks" (they rebuild the city once when toggled). The static cache key includes which order is in use.
- Lean round parts: the 16-sided cylinder (pipes, 9.6% of triangles put) becomes the 8-sided one on the same circle when its radius is under .098 (the gap is at most a quarter of a pixel at the switch); the rounded plate (lxPlate) gets a coarser corner when its corner radius is under .175. The full triangles go to H (shadows unchanged). The kit's other round parts (U.cyl 8 sides, sphere 8x6, blob) are already coarse; the other rounded boxes use 2 curve segments already. So the share that can be made lean is small: 63,000 of 1.42 million drawn triangles in the dense scene (4.4%), saving about 1.7% of them.
- Thin sticks: the walls of long pieces thinner than .06 (the facing arcs already drop their back sides) are drawn over an arc of 60 degrees round the camera instead of 90, so a stick shows its most frontal side. 312,000 triangles of 1.42 million are stick walls in the dense scene.
Triangles the color pass draws in a frame (dense scene, cache off, pixel size of your zoom 30 and 15):
| | zoom 30 | zoom 15 |
|---|---|---|
| both off (old) | 897,833 | 339,458 |
| full sticks (lean only) | 891,346 (-0.7%) | 338,712 |
| full round parts (sticks only) | 858,636 (-4.4%) | 329,813 |
| both on | 852,148 (-5.1%) | 329,067 (-3.1%) |
Crops: tools/perf/overnight3/item3_both_dense_z30.png (before | after | difference x4, the three places that differ most). 1,408 of 921,600 pixels differ (0.15%), almost all single-pixel columns where a thin line loses its second side.
Honest result: 2d is worth under 1% of triangles in the scenes I can build; 2e about 4 to 5%. Raising the lean radius limits needs a second zoom band, which is more orders (memory); say if you want it.

## Final runs (quick, against wip/round7)
- All round 8 switches off (`__NV_OFF`, `__FULL_ROUND`, `__FULL_STICKS`, `__STAGE_NOW`, `__SYNC_NOW`, `__ALERT_NOW`): city (with its edit steps), dense, megas, 53 captures, 0 problems. The old ways come back exactly.
- Defaults (job off): dense and megas, no edits: 1,000 to 5,000 pixels of 921,600 differ at each step (the lean parts and sticks; 0.1 to 0.5%), city the same before its edits; after the city's edits 70,000 to 200,000 pixels (a building appears later than before and the people's random stream moved). megas edit step 16,000 to 19,000.
- Max city, once: the same switches off, noon_f1 and night_zoom_out: 0 problems.

## Skipped, and why
- Dropping plots' own CPU geometry: above.
- Web Worker for generation: above.
- Whole-city never-seen run and the per-frame removal measurement: software renderer too slow; your machine does it in idle time (script).
- A check running over 10 minutes: none was a check; the false-removal measurement (two plots, prod and reference run in parallel, 5 to 25 minutes each) is a measurement and ran longer, noted here.

## My decisions
1. Never-seen: per-plot job in idle frames with a persistent store, because generation-time cost would block placing; a sampled set accepted as asked, ties never removed, neighbors never count.
2. Scatter into a map on the card, one read-back per plot (checked equal to a full read-back of the same views: 0 differences).
3. Placement: steps with the builders' globals swapped between steps rather than a Worker (shared state); one pending plot at a time and any other edit finishes it.
4. The sync-everything old way is kept behind tests (as asked) and verified exact.
5. Lean parts only where the outline stays within a quarter pixel at the switch; sticks narrowed to 60 degrees (not removed).
6. Second order stored beside the first (memory is lower now); blocks share corners.

## For you to judge
- tools/perf/overnight3/item1_worst_plot60.png (false removals), item3_both_dense_z30.png (round parts and sticks).
- Decide whether 3 to 14% of removed faces being seen somewhere in a dense sweep is acceptable (the crops say: one-pixel ledge lines and specks).

## Measurement script for your machine (5 minutes)
Chrome, max city, 720p, optimize framerate off. F3 then Shift+F3 (Tests row).
1. Leave the game idle at zoom 30 for 2 minutes, then in the console `NV.stats` (plots done, triangles removed of drawn, views) and `NV.job ? 'working' : 'idle'`.
2. Zoom 30, still, 10 s each: note FPS, main thread ms and the color pass triangles, with the default, then with the test "draw never-seen faces too", then back; likewise "full round parts" and "full sticks" (each rebuilds the city, wait for the cache). Repeat at zoom 15.
3. Turn at a medium speed for 10 s at zoom 30 with the default and with each test.
4. Placing: in the console `window.__w = 0; (function f(){ const t = performance.now(); requestAnimationFrame(() => { __w = Math.max(__w, performance.now() - t); f(); }); })()`; place a house, wait 5 s, read `__w`, set it to 0, place a tower, wait, read; then toggle "plots built in one frame", "edit upkeep in the same frame" and "police alert in one frame" on and repeat for the old numbers.
5. Memory (Shift+Esc): footprint after 5 minutes idle; the store grows in IndexedDB (DevTools, Application).

## Update: dense reference set as the view set; lean parts and sticks off by default

- Item 1 now uses the dense reference set itself: 96 turns (offset half a step) x 14 tilts at pixel .0045 (1,344 views a plot), signature version v2 (old stored results are not reused). Nothing the reference sees is removed, so false removals against it are 0 by construction; confirmed by running the production job on both plots: industrial plot 183 removed, reference never sees 183; mid plot 1,010 removed, reference 1,010 (was 1,119 removed with 155 false). Share removed: 13.6% and 16.2% of drawn (was 17.9% on the mid plot). Ties are still kept (10 and 24).
- Idle time a plot: 1,344 views. On a card at 1 view a frame and 60 FPS that is 22 s; the adaptive rate goes up to 8 views a frame, about 3 s, while frames stay under 18 ms. In this machine's software renderer one view took 222 ms (1,342-triangle plot) to 376 ms (6,238) so 5 to 8.5 minutes a plot, which says nothing about your card: `NV.stats.views` and the time it takes for `NV.stats.plots` to rise are the numbers to read.
- Lean round parts and thin sticks are off by default; tests renamed "lean round parts (cheat)" and "thin sticks, narrow arc (cheat)" (flags `__LEAN_ROUND`, `__THIN_STICKS`): turning one on rebuilds the city once. Check: defaults with the job off, noon_f1, noon_f30, night_zoom_out, night_pan on the city against wip/round7: 4 captures, 0 problems. The earlier numbers in item 3 are what the tests give when on. In the item 3 section read "full round parts" and "full sticks" as the new tests "lean round parts (cheat)" and "thin sticks, narrow arc (cheat)": the table rows marked "full ..." show the cheat that is left on when the other is off.

- The never-seen job works only on plots built or changed during play; existing plots are not backfilled unless the test "never-seen backfill" (`__NV_BACKFILL`) is on (a stored result still applies to them).
