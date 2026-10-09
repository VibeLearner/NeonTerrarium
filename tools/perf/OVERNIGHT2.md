# Overnight report 2 (round 7)

Branch `wip/round7` (from `wip/round6`, b6d34e5). Nothing is merged or published. Every pushed commit passed the harness for its item (checks are named in each section).

## Details by item

**1. Copy the cache by drawing: done (commit "Round 7 item 1").** The default now draws the copy as a full-screen pass; the blit is behind the overlay test "copy the cache by blitting (not drawing)" and `window.__COPY_BLIT = true`.
Check: standard script city 25, megas 15, dense 13 captures and the cache steps on the city (70): 0 differences against b6d34e5.

**2a. "Never visible": the owner's probe is right. Done (measurement only).**
- Ran geo20b.js exactly as given (tools/perf/geo20b.js, loaded by tools/perf/one.py on the current tree, max city, hour 22, zoom 30): 274,250 triangles, 220,872 drawn today, 166,173 visible from some view,
  54,730 drawn but never seen (24.8%; 10 to 38% per plot): the same numbers as yours to the triangle.
- Is it converged or a sampling artifact? On 7 of the 20 plots: your settings 25.2% never seen; 3 times the views and twice the resolution (72 turns x 12 tilts, pixel .006) 22.1%. So 3% of the drawn triangles are seen
  only in the denser sweep (a removal rule must stay safe against that), and about 22% are hidden from every view tried.
- Is it depth ties (a face coplanar with another that wins the draw order)? No: 685 of 20,798 never-seen triangles (3.3%, mostly sticks) have a drawn same-facing triangle in the same plane holding their middle. Those must never be removed
  (whether a tie face shows depends on draw order, and the probe's order is not the game's).
- Is it real occlusion? 395 of 400 sampled never-seen triangles have the triangle that covers them at least .1 units in front of them (only 5 within .1). What covers them: other shapes 38% (the rounded boxes and custom shapes),
  thin plates 18%, main structure 13%, sticks 16%, glowing parts 6%, windows 5%; in 47% of the cases the covering face is parallel to the hidden one and faces the same way, in the rest at an angle (inside corners, behind posts).
  So these are faces behind other geometry of the same plot (interiors, the backs of fittings, the far sides of things), which touching-face rules like round 6's flat-face rule can't see.
- Ten examples with where they are and what hides them: tools/perf/overnight2/item2a_examples.png (each crop: the plot in grey from the allowed view that faces the target best, the target triangle drawn on top in red with a yellow outline,
  the triangle in front of it in blue; label: class, zone, world position, view, the hider's class, its gap and how parallel). All ten are kept by the current build (the flat-face rule never shipped).
- Why round 6's number was 5% (visprobe.py, 36 views at zoom 30 around a mid-city point, about 6,800 triangles): it measured another population with a coarser question. It was run on the `city` test scene; on the max city, the same
  probe, same default camera, radius 4, zoom 30, gives 16,642 triangles, of which in A 320 never seen (9%, with 1,066 too small to judge at that pixel size) and in S 1,561 (18%, with 1,686 too small). The small ones are
  a fifth to a third of the triangles at that zoom and are excluded from "never", and its views were 36 at one offset. Even so the max city shows 9 to 18%. The first number said "few percent" because the scene and the disc were mostly street furniture and low plots.
  Re-run on the owner's plots (visprobe `--at`) it also gives far more than 5%. A denser view set and finer pixels lower the share (25 to 22%), they never made it small.
- Merge numbers in the owner's probe (the `merge` part) were not used: the normal attribute layout has changed (signed bytes then); the visibility counts don't depend on it.

**2b. Removing the never-seen triangles safely: stopped by the ladder after three attempts; nothing shipped to the game.** The share is real (item 2a: about 22 to 25% of the drawn building triangles),
so I tried to find a view set whose result can be trusted. tools/perf/vis2b.js tests candidates against a denser reference on the owner's plots (same picks as geo20b.js; reference 96 turns x 14 tilts at pixel .0045, offset by half a step from the
candidates' turns; depth-tie triangles are never counted as removable). The closest zoom's pixel on the owner's 1640-line render is .0061, so the candidates sample at .006.
- Three plots (low 3.9, mid 7, high 17.6; 30,088 drawn triangles; the reference finds 7,523 never seen = 25.0%; 357 triangles are depth ties and are kept):
  attempt 1, 24 turns x 6 tilts x 2 offsets: removes 7,324, of which the reference sees 578 (7.9%); attempt 2, 48 x 8 x 2 offsets: removes 6,877, 280 seen (4.1%); attempt 3, 48 x 8 x 4 offsets: removes 6,757, 206 seen (3.0%).
- First plot alone (6,940 drawn): 199, 118 and 78 false removals of 1,348, 1,247 and 1,192; the false ones are spread over every size (10 of them triangles with an edge over .4, 30 between .05 and .1), so they are not just specks:
  they are faces that show through a narrow gap or at a grazing angle in a few views. Density and offsets reduce them but don't reach zero, and the reference is itself a sample, so zero against it would still not be proof.
- The bar was zero. A removal that is wrong shows as a missing speck of wall in a few views, and the harness's angle sweep would find some. So an exact version isn't available from sampling. Options for you, in order of effort:
  (1) leave it; (2) a cheat: remove what a dense sampled sweep never sees (about 20% of drawn triangles), accept the rare missing speck, test "draw never-seen faces too", crops; it needs the per-piece layout change (a second index
  order, never-seen triangles moved to H, the old order restorable for the test), a GPU pass that accumulates per-triangle visibility over the views with max blending and one read-back per plot, run in idle frames, region re-merges batched (the design is worked out;
  I did not build it because it is a cheat that needs your approval first and a day of work); (3) an exact rule from geometry only (a face behind a parallel solid face that covers its whole footprint with margin) covers about half of the cases (47% of the hiders are parallel, same-facing faces) but needs the plot's solid shell, which the kit doesn't record.

**2c. Custom shapes: ranked, checked, no exact fix worth shipping.** tools/perf/shapes_sites.py attributes every 40th primitive put while the max city is generated to the builder that called the kit
(24.0 million triangles put in all; custom shapes only, share of all triangles put):
| builder (file) | shape | share | tris each |
|---|---|---|---|
| pipeSeg (buildings.js) | `U.cyl16` | 8.3% | 64 |
| lxPlate (buildings.js) | ExtrudeGeometry, rounded plate, 7 curve segments (14 a quarter turn) | 5.1% | 240 |
| chunkBox (buildings.js) | ExtrudeGeometry (rounded box) | 2.8% | 158 |
| slab (buildings.js) | ExtrudeGeometry (rounded slab) | 1.6% | 156 |
| pipework (ground.js) | `U.torus` | 1.5% | 240 |
| steamPot (mega.js) | `U.cyl16` | 1.3% | 64 |
| pod (buildings.js) | ExtrudeGeometry | 1.2% | 177 |
| arcBuilding (buildings.js) | ExtrudeGeometry | 1.1% | 292 |
| annex, brutalTower, foodBowl, ring, tube, signShop, roundTower, pottedPlant, twistTower and 14 more | various | 0.1 to 0.6% each | |
What I checked, exactly:
- Duplicated faces (same three corners to 1e-5, same facing, same attributes, within a piece's drawn lists; a sample of 254 pieces, 2.1 million drawn triangles): 1,608 exact duplicates = 0.08%; coincident back-to-back pairs (touching faces of two blocks) 705 = 0.03%. Negligible.
- Faces inside other faces / inside solids: the existing rule (inside a box) already puts those in H; extending it to the rounded boxes' solids (inner box inset .08 for corners and bevel) would catch 321 of the 22,867 never-seen triangles in 7 plots (0.4% of the drawn triangles). Not worth the code.
- Faces nobody sees: bottoms of the extruded plates, rounded boxes and cylinders already face down and sit in H.
- More segments than the outline needs at the closest zoom: a polygon with fewer sides is a different outline, so it changes pixels (the plate's 56-sided corners are over .0016 of the radius from the circle, which is under half a pixel for plates up
  to 2 units across, but not zero); that is a cheat by the plan's own rule, item 2d. So the exact fixes are exhausted; the candidates are listed for 2d: pipeSeg and the other cyl16 (about 11% of triangles put), lxPlate and the rounded boxes (about 12%).

**3. Placement freeze: partly (built, off by default; owner decision).**
- Split of the placing frame (house, city scene, zoom 30, tools/perf/placement.py): the placing call itself about 300 ms: the piece's own plots (generation 50 to 70 ms), the bridges (rebuildConnections), the steam map, the walking network (buildNetwork, 90 to 130 ms), residents and jobs, the save.
- Built: after a player's edit the piece's own plots are still built at once, and the rest runs one stage a frame (bridges, agent lists, walking network, residents and jobs, save), and merged regions rebuild one per frame (each is 20 to 50 ms).
  The placing call drops from about 300 to 68 ms (house). The worst later frame is the walking network (90 to 130 ms) and the generation (50 to 70 ms), which are single calls: **the 33 ms rule is not met**, a worker would be needed for those and they read the whole city's cells, so I did not split them further.
- Why it is off by default: it moves the people's random draws to other frames, so the people and vehicles differ after an edit (the harness's edit steps showed 120,000+ pixels and a different random count; the harness check for the item cannot pass with it on). Sky height and four empty lots' random heights also differ.
  Structure after settling is otherwise the same (tools/perf/placement_check.py: cells, bridges, regions, ports, walking network).
- It is behind the overlay test "edit upkeep spread over frames (people differ)" and `window.__SYNC_LATER = true`. Owner decision: turn it on by default if a different people sequence after an edit is fine.
- Check with it off (the default): harness quick city, 25 captures, 0 problems against the previous commit.
- Also built for item 3, exact and on by default (each behind the test "edit upkeep: a key string per path point (same picture)" / `__SLOW_SYNC`, and "steam map: rebuilt at every edit (same picture)" / `__STEAM_ALWAYS`):
  the walkers' "is my path still over existing plots" check uses one set of numbers instead of a key string per point of every walk (syncPeopleRest 79 to 45 ms); `neighbors` finds pairs through a map by grid position instead of every plot against every plot (2,618 pairs, same list and order, 25.4 to 4.3 ms);
  `plotEdges` compares endpoints number by number instead of building a string for each (the walking network, 20 ms less); the steam map is kept when an edit leaves the vents and lifts as they were (35 ms saved on most edits).
  The network after a rebuild is the same: cells, graph edges, lengths, doors, patrol nodes hashed in both modes (before and after an edit): identical. The whole upkeep (bridges and agents, steady state, maxcity): 150 to 190 ms before, 113 to 131 ms after (-25%).
  Placing calls (house, tower, same random seed, alternated in one page): house 205 to 220 ms either way (noise is about 30 ms), tower 380 to 394 before, 329 to 344 after.
  Check: harness city, dense, megas, both sizes, full script (106 captures): 0 problems.

**4. Stalls and memory: done (memory), stall cause found and two causes fixed exactly.**
- Memory (tools/perf/heapkind.py, memcheck.py): the CPU copies of the merged region geometry (999 meshes, 1,186 MB of typed arrays in the biggest city) were read by nothing after the card had them. They are now let go right after their upload
  (`dropCpuCopy` in world.js; three.js's attribute `onUpload` callback). The plots' own geometry stays (re-merging, the walking maps and door ray tests read it): 1,065 MB, which is the rest of the 2.3 GB.
  **JS heap, maxcity, at load: 3,008 MB before, 2,299 MB after (-709 MB, -24%)**; after 12 rounds of simulated play 3,045 before, 2,332 after (flat, same shape as before). Graphics bytes unchanged (1,542 MB at load).
  Overlay test "keep the CPU copies of merged geometry" (and `window.__KEEP_CPU = true`, which the probe scripts one.py, visprobe.py, live_tris.py, hidden_count.py, shapes_sites.py now set because they read the arrays).
  Check: harness city, dense, megas (full script, both sizes, edit steps included): 106 captures, 0 problems.
- Stall capture (tools/perf/stalls.py: main thread without drawing, real clock, night 22:00, rain on, zoom 15, 3,000 frames; each frame over 3x the median is broken down by function and checked for a heap drop; Chrome long tasks are listed):
  city scene: median 1.2 ms, max 7.9 ms, no stall. **maxcity: median 8.9 ms, 99% 24.8, 99.9% 69.7, max 96 ms**; 20 slow frames in 3,000, only 3 with a heap drop (a collection). So collections are not the main cause; the main thread work is:
  1. the first frames after load (people deciding: 30 to 40 ms);
  2. a mugging: **the police alert sent two bikes along street routes, 21 ms each** (a search over a 5 cm grid, one frame): 43 ms, and the same search when a bike goes on patrol or re-paths in a chase (60 ms frames);
  3. at dusk the 130 lurkers all looked for a victim in the same frame, each walking the whole crowd of 10,000: 40 ms (frame 609);
  4. the people collision pass every N-th frame (3 to 24 ms, more when the crowd is dense).
- Fixed (exact; each behind an overlay test): the bike route search is the same search with flat heap lists and the neighbors listed once (138 routes compared, all identical, 33 ms to 12.6 ms a search; test "bike routes: a key lookup per point (same picture)" / `__SLOW_FREE`);
  lurkers find their victim with a grid of 2-unit squares in walker order (130 lurkers compared against the old scan, 0 differences; test "lurkers scan every walker (same picture)" / `__LURK_SCAN`; the dusk frame went from 43 to about 24 ms, the rest being the bike search).
  maxcity at night after both: max 96 to 61 ms, 99.9% 69.7 to about 50.
  Check: harness city, dense, megas quick (53 captures) and maxcity steps noon_f1, noon_f120, night_23h_rain, night_zoom_out: 0 problems.
- Not fixed: the police alert still costs about 22 ms in one frame (two searches) and the first frames' decisions; spreading them over frames changes when people and bikes start, so not exact. Owner decision if wanted.
- Owner's trace (the harness can't time a card, so a stall on the owner's machine needs a recording): Chrome DevTools, Performance panel, tick "Screenshots" and "Web Vitals"; set the in-game hour to 22:00 with rain on and the zoom to 15;
  press record, leave the game alone for 20 seconds (a pan at the speed of a slow drag in the last 10 seconds), stop, save the trace (Save profile). Look for: (a) in the Main track a task over 50 ms (red corner): open it and read the bottom-up tab, which function is at the top
  (updatePeople, bikeStreetRoute and bikeRoute, updateLurkers, checkBumps are the known ones; "Minor GC" or "Major GC" means a collection); (b) in the GPU track a frame whose GPU time is long while the main thread is idle (the card, not the code), and shader compile entries ("compileShader", "linkProgram")
  at the start of a stall; (c) in the Frames track the dropped frames and whether they come in a row. Send the trace file.

**5. The zoom 30 main thread: partly (small exact wins built; the big ones measured and not built).**
- Laps (tools/perf/laps.py, maxcity, zoom 30, still, main thread without drawing, the real clock; this machine's software renderer can't time the card or the draw submission, so the 21 to 22 ms you see includes about 1,480 draw calls I can only count):
  updatePeople 5.1 ms (the biggest: including 0.6 checkBumps and 0.3 decide), updateSteam 1.4, updateMegaFx 1.15, updateMetros 0.5, updateHighways 0.4, updateDoors 0.5, updateClubs 0.2, the rest under 0.2. Whole simulated frame about 9.7 ms here (median 8.9).
  A profile of the same frames (V8 sampler) puts updatePeople's own time at 2.5 ms, updateSteam 1.4, three.js's matrix copy 0.9, updateDoors 0.5, updateMatrixWorld 0.5, checkBumps 0.4.
- Built, exact: **steam** (updateSteam): a puff not under a deck, nearly all of them, is not pushed sideways, so two of its three sine and cosine calls are the sine or cosine times zero and are skipped: 17,352 puffs, 10.4 million values compared over 120 frames, 0 different;
  1.48 to 1.01 ms a frame (-0.47 ms). Test "steam: every puff in full (same picture)" / `__STEAM_FULL`. **Doors** (updateDoors): the two passes over the 10,000 people share one pass (they only set flags): about -0.1 ms.
  Check: harness city, dense, megas quick (53 captures): 0 problems.
  Run-to-run noise on this machine is about 2 ms of frame mean (the same build gave 10.3 and 12.6 ms in two runs), so only the in-page A/B numbers above are reliable; the b6d34e5 and new laps files in the table of numbers are for orientation only.
- **Collision grid kept between frames: not built.** The pass is 0.6 ms a frame on average (6% of the simulated frame): 3 to 5 ms on the frames it runs, every N-th frame, sometimes 16 to 25 ms when the crowd is dense (the stall list in item 4). A kept grid still has to move every walker that moved (nearly all of them at the rates it runs),
  so it saves the counting sort (a third of the pass) and costs a cell update per walker per frame: about 0.2 ms gain on average, with a different order of neighbors in a cell (which changes who bumps whom, so not exact). Not worth it.
- **Fewer draw calls: the glow overlays are now batched (built, exact).** Where the 1,482 calls of a cached frame at zoom 30 (maxcity) were: glow overlays of the merged building regions 226 (opaque, depth equal, drawn over the cache; few triangles each);
  hologram sign quads 273 (189 + 84, about 4 triangles each, additive); window glass and see-through boxes 151 (3,000 triangles each); three animated opaque shader materials (uniforms time and night) 222 (about 900 triangles each); sprites 136; glow points 51;
  instanced meshes about 130; small meshes outside the batches about 170 (12 to 85 triangles each).
  Built: the overlays of the merged regions (each region's own overlay now has vertex data of its own, only the corners its triangles use) are joined into one mesh for every 4 x 4 regions, drawn each frame as one multi-range draw over the members in view (the same ranges each overlay would have drawn:
  the flickering and blinking triangles and the stutter band of windows). **Draw calls in the view: 1,510 to 1,302 (-208, -14%)**; 246 regions, 16 batches. Opaque, no depth write, depth equal or nearer, so only exactly coplanar duplicates (0.08%) could tell the order apart.
  Test "glow overlay: one draw per region (same picture)" / `__OV_PER_BLOCK` restores the first way (the region overlays stay, undrawn, so the switch is instant).
  Checks: harness city, dense, megas, both sizes, full script (106 captures) against the previous commit: 0 problems; and with the test on (`PERF_CAND_INIT='window.__OV_PER_BLOCK = true;'`) city quick against the previous commit: 25 captures, 0 differences (the old way comes back exactly).
- **Signs and glass: not merged.** The sign quads and glass are transparent and drawn back to front by each object's own depth against each other, so one merged mesh per super region changes their order against the glass (a sign behind a window, a window behind a sign): not the same picture, so a cheat that needs sorting them as one layer.
- **The live pass's glass triangles (457,000 of 1.16 million): not built.** Glass is mostly double-sided transparent boxes (each pane 12 triangles, front and back both blended), not flat quads that share an edge: joining neighbors changes how many layers blend where they overlap, so it is not the same picture.
  Plants per super region (cull): the per-plot cull already leaves out plants off screen.
- Laps before and after, in-page A/B on the same page (not between runs): steam 1.48 to 1.01 ms; doors about 0.1 ms; lurkers (night) a 43 ms frame to 24; bike routes 33 to 12.6 ms a search; everything else unchanged.

**6. Turning at zoom 30: done (a cheat, with crops).**
- Tool: tools/perf/sd_tune.py (frames drawn the old way during a steady turn, draw calls stubbed so only the triangle count is read, same start view for every setting) and tools/perf/sd_crops.py.
  Speeds are px a frame of the fastest plot in view (SD.top: the plots at the screen's edge; the plots nearer the pivot move slower and are reduced less). Maxcity, zoom 30, color-pass triangles a frame (mean over the turn; with no speed-based detail a turn frame submits **about 11.3 million triangles** at 720p):
  | fastest plot | now (v0 10) | v0 6 (chosen) | v0 5, 3 classes | v0 6, step 1.7 |
  |---|---|---|---|---|
  | 3.1 px/frame | 0.0% | 0.0% | | |
  | 5.0 px/frame (slow drag) | 0.0% | 0.0% | | |
  | 9.7 px/frame | 0.0% | -0.2% | | |
  | 15.5 px/frame (spikes.py's "slow turn", .004 rad/frame) | -0.1% | -5.9% | -10.5% | -6.0% |
  | 30 px/frame | -11.0% | -25.8% | -32.2% | -29.9% |
  | 43 px/frame | -23.0% | -39.4% | -43.0% | -41.8% |
  | 67 px/frame | -40.7% | -48.7% | -50.5% | -50.0% |
  | 109 px/frame | -49.5% | -52.8% | -53.9% | -53.7% |
  City scene, same measure: 2.7 and 5.4 px/frame 0.0% for every setting; 10.5 px: -2.4% (v0 6); 15 px: -1.8% now, -17.6% (v0 6); 23 px: -18.0% now, -33.1% (v0 6).
- Chosen: **`SD.v0` 10 to 6**, everything else as it was (`step` 2, `max` 2, `fast` 40, `fastMax` 1, `cursorPx` 200, `hys` .25). With hysteresis the first class goes at 7.5 px a frame and comes back below 4.5, so a slow drag (fastest plot under about 5 px a frame) is untouched (0.0% at 3.1 and 5.0 px in the max city, 2.7 and 5.4 in the city), and a medium turn gets
  6 to 26% fewer triangles in the max city at 15 to 30 px a frame (0.1 to 11% before) and 18% fewer in the city at 15 px (1.8% before); a fast spin 39% at 43 px instead of 23%. I did not touch `max`, `fast` or `cursorPx`: a third class (v0 5, max 3) only gains 3 to 4 points more and drops detail further.
  Overlay test "turn detail: start at 10 px a frame (as before)" restores the old setting; "no speed-based detail" still turns it all off.
- Crops (cheat, yours to approve): tools/perf/overnight2/item6_city_0p012.png: one frame of a steady 14 px a frame turn at zoom 30, three places (middle, left, right), columns: full detail, the old settings, the new settings, and the difference between new and full detail times 4.
  Triangles in that frame: full 1,214,373, old 1,188,498, new 994,842. Each column is rendered in its own fresh page with the same script (the clock and random numbers are scripted), so people, vehicles and clouds are the same in all four and the difference column (new against full detail, times 4) is only the detail the setting leaves out: sparse specks on walls and roofs. Check: harness city, dense, megas quick: 0 problems (the standard script doesn't turn at those speeds).

**2d. Round parts and rounded boxes by zoom band: not built (cheat; a layout change I judged too risky to land unmeasured).** The candidates and their share are in 2c (pipeSeg and the other 16-sided cylinders about 11% of triangles put, the rounded plates and boxes about 12%).
What stops it is structural, not approval: the index layout gives each frame one dimension to choose triangles by (the size classes, by longest edge) and a lean variant needs another (full or lean set). I tried the obvious shortcut, giving the lean set a larger class key than the full one, and it fails:
the class test uses the longest edge, and a tall thin cylinder's side triangles have the cylinder's height as longest edge, so the full set is never dropped and both sets would draw. A real second set needs its own rows next to the wall slices (rowS, rowC, the multi-range draw and the shadow lists), and the old way back behind the test means keeping both index orders.
It matters more than I first weighed: a turn frame in the max city submits about 11.3 million triangles at 720p (item 6), so triangle counts, not calls, are what turning at zoom 30 pays for. First thing next round, with 2e and 2b.

**2e. Thin sticks at far zoom: not built (same layout obstacle; and the saving I had measured is not verified).** An earlier measurement in this run put sticks at about 47% of the drawn triangles at zoom 30 and a simpler stick at about 13% fewer drawn triangles; I did not keep that script in the repo, so treat both numbers as unverified until it is redone.
The facing arcs already leave out about half of every stick's long sides (they are in the wall slices) and the end caps go as small triangles, so what a cheat can still take is the second visible side of each stick, which needs its own narrower arc, which needs its own slice rows (the same layout change as 2d). Reserved test name: "full sticks".
(At your 1,640-line render, a stick of the kit's minimum thickness is 1.4 px wide at zoom 30, so nearly every stick would qualify; at the harness's 720 lines the size classes and `LOD.fine` already thin them, so the harness understates the saving.)

## Table

| item | status | commit | check |
|---|---|---|---|
| 1 copy the cache by drawing | done | 2352815 | standard script + cache steps 0 differences |
| 2a never visible: reconcile | done (measurement) | 84b7487, 899843b | owner's probe reproduced to the triangle; 10 crops |
| 2b remove never-seen | stopped by the ladder, nothing shipped | 523f239 | 3.0 to 7.9% false removals against a dense reference |
| 2c custom shapes | done (ranked, measured), no exact fix worth shipping | 5b26878 | duplicates 0.08%, inside rounded solids 0.4% |
| 2d lean round parts | not built (layout change; reasons in 2d) | | |
| 2e thin sticks | not built (same layout obstacle; reasons in 2e) | | |
| 3 placement freeze | partly: spread version opt-in (33 ms rule not met); exact speedups on by default | 19faead, c86aae8 | harness 106 captures, 0 problems; network hashes identical |
| 4 stalls and memory | done: heap -709 MB (-24%), stall causes found, two fixed exactly | 35d72bb, 53aa309 | harness city/dense/megas 106 captures and maxcity night steps, 0 problems |
| 5 zoom 30 main thread | partly: steam, doors, glow overlay batches (-208 draw calls) exact; collision grid, signs, glass measured and not built | b36fa91, then the overlay batch commit | harness 106 captures 0 problems; old way (flag) 0 differences |
| 6 turning at zoom 30 | done (cheat, crops) | 5733ecf | harness 53 captures, 0 problems (the script doesn't turn at those speeds) |

Skipped, one sentence each:
- 2d (lean round parts): needs a second set of triangles per round part and its own row dimension in the index layout (the class shortcut fails for tall cylinders); too risky to land without the owner's GPU numbers.
- 2e (thin sticks): the facing arcs already leave out about half of every stick's long sides, and the rest needs its own narrower arc and rows in the layout (same cost as 2d); the earlier saving estimate was not kept.
- 2b (not skipped but not shipped): no view set reaches zero false removals; the cheat design is in the 2b section.
- Item 5's collision grid, sign and glass merges: measured, reasons in the item 5 section (about 0.2 ms, or not the same picture).

## Decisions I made (one line on why)

1. Item 1 default: draw the copy (as the plan said); the blit stays behind a test so you can measure both in one build.
2. 2a: ran your probe untouched first, then only variants of it (denser views, finer pixels, tie and hider analysis), so the answer is yours reproduced, not mine.
3. 2b: stopped after three attempts at density and offsets: zero against a sampled reference is not proof, and a wrong removal is a missing speck of wall.
4. 3: the spread-over-frames placement is opt-in, not the default, because it moves the people's random draws (the harness's edit steps would fail) and it still doesn't reach 33 ms on this machine (walking network 90 to 130 ms, generation 50 to 70 ms are single calls).
5. 3: the exact speedups (number sets, map-based neighbor pairs, no strings, steam map kept) are on by default, because they give the same city and make the old default faster.
6. 4: only the merged region geometry loses its CPU arrays, and only after its upload (three.js's `onUpload` callback); the plots' own geometry stays because re-merging, the walking maps and door ray tests read it.
7. 4: the bike route search was made faster with identical routes rather than spread over frames, because spreading would change when bikes start moving.
8. 4: lurkers use a grid in walker order, so the pick is the same one, rather than a cheaper rule that picks a different victim.
9. 5: no kept collision grid (about 0.2 ms on average and changes who bumps whom), no merges of signs or glass (transparent order changes the picture); the glow overlays are batched because only coplanar ties could tell the order apart and the harness shows none.
9b. 2b, 2d, 2e not built: each needs a new selection dimension in the index layout, the old way back behind a test means two index orders, and I could not measure the GPU gain here.
10. 6: `SD.v0` 6 only; the third class and a gentler step gain 3 to 4 points more for more lost detail, and slow drags (under 5 px a frame) stay at 0.0%.
11. Every item's check was run against the previous commit (`--base HEAD`) so each pushed commit stands on its own.

## For you to decide, with the numbers

1. **Turn detail start 10 to 6 px a frame** (cheat, built): medium turns 2.4 to 17.6% fewer color-pass triangles, fast spins 18 to 33%, slow drags unchanged. Crops: tools/perf/overnight2/item6_city_0p012.png. Test "turn detail: start at 10 px a frame (as before)".
2. **Spread the placing upkeep over frames by default** (built, off): the placing call drops from about 300 to 68 ms (house) but the next frames still hold the walking network (90 to 130 ms here) and generation (50 to 70 ms), and people differ after an edit. Test "edit upkeep spread over frames (people differ)".
3. **Approve 2b** (never-seen triangles, about 22% of drawn building triangles, a few false removals to accept) **and 2d, 2e** (lean round parts, thin sticks; about 15% and a few percent): each needs a layout change; I'd start with 2b.
4. **The police alert frame** (about 22 ms: two bike route searches in one frame) and the first frames' decisions: spreading them changes when bikes start. Fine to spread?
5. **Signs and glass merges** (about 420 more draw calls) need sorting them as one layer, a cheat: say if you want it. (The exact overlay batching, -208 calls, is built and on.)
6. **Drop the plots' own CPU geometry too** (another 1,065 MB of the 2.3 GB): needs the walking maps and door ray tests to keep compact copies; say if you want it.

## Measurement script for your thread (under 15 minutes; old b6d34e5 against new wip/round7)

Same Chrome, laptop on power, maxcity, render 720p, optimize framerate off, no other heavy tabs. Two checkouts: `git worktree add ../old b6d34e5` and the branch `wip/round7`; serve each in turn.
1. Zoom 30 then zoom 15, each: wait 10 s still, read the overlay's FPS and "main thread ms"; slow pan (hold an arrow key) 10 s, read the same; slow turn (drag the mouse slowly, under 5 px a frame) 10 s, read the same; medium turn (drag at a brisk walking pace, 10 to 15 px a frame) 10 s, read FPS (this is what item 6 changes: also try the test "turn detail: start at 10 px a frame" in the new build to see the difference in one build).
2. Placing: in each build place a house, then a tall tower, at the same spot (the green plot next to the middle); in the console run `__worst = 0; (function f(){ const t = performance.now(); requestAnimationFrame(() => { __worst = Math.max(__worst, performance.now() - t); f(); }); })()` before, wait 3 s after the placement, read `__worst`. Then in the new build set `window.__SYNC_LATER = true` and repeat.
3. Exact timing at zoom 30 still (Shift+F3): note the main-thread bars (updatePeople, updateSteam, others) in old and new.
4. Memory: Chrome task manager (Shift+Esc) the page's memory footprint after load: the new build should read about 0.7 GB less JS memory.
5. If a stall shows (a frame over 100 ms at night in rain), record it with the trace steps in item 4 and send the file.
In the harness on your machine, the same numbers come with `PERF_GPU=1 python3 tools/perf/harness.py time --ref b6d34e5 --frames 120` and the same with `--ref wip/round7`, and the laps with `python3 tools/perf/laps.py maxcity --ref b6d34e5` and `python3 tools/perf/laps.py maxcity`.

## Overlay tests added this round

"copy the cache by blitting (not drawing)" (item 1, default flipped), "glow overlay: one draw per region (same picture)" (5), "doors: two passes over the people (same picture)" (5), "edit upkeep spread over frames (people differ)" (3), "keep the CPU copies of merged geometry" (4), "lurkers scan every walker (same picture)" (4), "bike routes: a key lookup per point (same picture)" (4), "steam: every puff in full (same picture)" (5), "turn detail: start at 10 px a frame (as before)" (6), "edit upkeep: a key string per path point (same picture)" (3), "steam map: rebuilt at every edit (same picture)" (3).
The probe scripts (one.py, visprobe.py, live_tris.py, hidden_count.py, shapes_sites.py) set `window.__KEEP_CPU = true` because they read geometry arrays.

## End state check

Final head against b6d34e5 (the start of the round), harness city, dense, megas quick (53 captures): 0 problems (the only notes are the geometry count, 221 to 199, from the overlay batching). Items 1 to 5 are exact; item 6 (turn detail) acts only in turning frames and the standard script does not turn at those speeds; the spread-over-frames placement is off by default.
