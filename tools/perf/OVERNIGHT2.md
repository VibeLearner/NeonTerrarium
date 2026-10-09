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
- **Fewer draw calls (1,482 in a cached frame at zoom 30): measured, not built.** Where the calls are (one frame, maxcity): glow overlays of the merged building meshes 226 (opaque, depth equal, drawn over the cache; few triangles each);
  hologram sign quads 273 (189 + 84, about 4 triangles each, additive, two materials); window glass and see-through boxes 151 (3,000 triangles each); three animated opaque shader materials (uniforms time and night) 222 (about 900 triangles each); sprites 136; glow points 51; instanced meshes about 130 (crowd, vehicles, lamps);
  the rest are small meshes outside the batches (about 170, 12 to 85 triangles each).
  Why not exact: the sign quads and glass are transparent, drawn back to front by each object's own depth against each other, so one merged mesh per super region changes their order against the glass (a sign behind a window, a window behind a sign) and the picture; the sign quads are additive,
  which commutes except where 8-bit rounding differs by 1 level, but they are interleaved with normal blended glass in the same list. The overlays would merge exactly (opaque, no depth write, equal depth; the only order effect is coplanar duplicates, 0.08%): build one overlay per merge block by copying just its
  flicker and window triangles (a few thousand) with multi-range draws for the stutter band, which removes about 180 of the 226 calls (12% of all calls); that needs the overlay built while the CPU arrays exist (before upload; item 4 frees them) and a per-member visibility test each frame. I did not build it: I can't measure the gain on this machine and it touches how
  every region is merged. First thing to build next round if the draw submission is the limit on your machine; the signs and glass need your approval as a cheat (sort them with the glass by layer).
- **The live pass's glass triangles (457,000 of 1.16 million): not built.** Glass is mostly double-sided transparent boxes (each pane 12 triangles, front and back both blended), not flat quads that share an edge: joining neighbors changes how many layers blend where they overlap, so it is not the same picture.
  Plants per super region (cull): the per-plot cull already leaves out plants off screen.
- Laps before and after, in-page A/B on the same page (not between runs): steam 1.48 to 1.01 ms; doors about 0.1 ms; lurkers (night) a 43 ms frame to 24; bike routes 33 to 12.6 ms a search; everything else unchanged.

**6. Turning at zoom 30: done (a cheat, with crops).**
- Tool: tools/perf/sd_tune.py (frames drawn the old way during a steady turn, draw calls stubbed so only the triangle count is read, same start view for every setting) and tools/perf/sd_crops.py.
  City scene, zoom 30, color-pass triangles a frame, change against no speed-based detail (speeds are px a frame at the pivot's edge, which is the number SD uses):
  | turn | now (v0 10) | v0 6 (chosen) | v0 5, 3 classes | v0 6, step 1.7 |
  |---|---|---|---|---|
  | 2.7 px/frame | 0.0% | 0.0% | 0.0% | 0.0% |
  | 5.4 px/frame (slow drag) | 0.0% | 0.0% | 0.0% | 0.0% |
  | 10.5 px/frame | 0.0% | -2.4% | -6.6% | -2.4% |
  | 15 px/frame | -1.8% | -17.6% | -20.9% | -18.8% |
  | 23 px/frame | -18.0% | -33.1% | -37.1% | -36.2% |
- Chosen: **`SD.v0` 10 to 6**, everything else as it was (`step` 2, `max` 2, `fast` 40, `fastMax` 1, `cursorPx` 200, `hys` .25). With hysteresis the first class goes at 7.5 px a frame and comes back below 4.5, so a slow drag (under about 5) is untouched (measured 0.0% at 2.7 and 5.4 px), and a medium turn (10 to 15 px a frame) gets
  2.4% to 17.6% fewer triangles (against 0 to 1.8% before); a fast spin 33% instead of 18%. I did not touch `max`, `fast` or `cursorPx`: a third class (v0 5, max 3) only gains 3 to 4 points more and drops detail further.
  Overlay test "turn detail: start at 10 px a frame (as before)" restores the old setting; "no speed-based detail" still turns it all off.
- Crops (cheat, yours to approve): tools/perf/overnight2/item6_city_0p012.png: one frame of a steady 14 px a frame turn at zoom 30, three places (middle, left, right), columns: full detail, the old settings, the new settings, and the difference between new and full detail times 4.
  Triangles in that frame: full 1,214,373, old 1,188,498, new 994,842. The difference column is speck-level building detail on moving walls; the clouds differ in every column because they animate with time. Check: harness city, dense, megas quick: 0 problems (the standard script doesn't turn at those speeds).

**2d. Round parts and rounded boxes by zoom band: not built (cheat; needs your approval first and a layout change).** The candidates and their share are in 2c (pipeSeg and the other 16-sided cylinders about 11% of triangles put, the rounded plates and boxes about 12%).
A lean variant means a second set of triangles for each round part in the same buffer and a way to choose between the sets per zoom band; the index layout has only one dimension for choosing (the size classes, by edge length) and the lean set needs its own: another set of rows per piece
(`rowS`, `rowC`) and the multi-range draw of both. I judged it a day's work in the code every region passes through, for a gain I can only count in triangles here (about 15% of what is drawn when the cache is not used: turns and cache redraws). Next round, with item 5's overlay merge.

**2e. Thin sticks at far zoom: not built (the rule's measurement came out above 10%, but the real saving is smaller than first thought).** Sticks are about 47% of the drawn triangles at zoom 30 and replacing each by its most frontal long side or a quad would save about 13% of drawn triangles.
But the walls already go through the facing arcs: every stick's long sides are in the wall slices (`sideLayout`), and the arc leaves out the slices that face away, so about half of a stick's four long sides is already not drawn and the end caps go as small triangles. What is left to save is the second visible side of each stick, which needs
its own narrower arc, which needs its own slice rows in the layout (same cost as 2d). Test name reserved: "full sticks". Next round, with 2d.
