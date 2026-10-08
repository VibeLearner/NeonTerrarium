# Overnight report (round 6 and after)

(Being written as the work goes; the final version is at the end of the run.)

## Decisions made on my own
- Item 1 people rate: N from each person's own speed (rush, hurry included) with the frame time quantized to 1/240 s so N doesn't flap with jitter; N capped at 4; the cursor radius is 90 render pixels. Why: the plan leaves them open; these are conservative and keep a step under about .75 of a render pixel.
- Sprites of people skipped on a frame are drawn from what their last step left (including the emote bubble, hologram and picnic upkeep). Why: "drawn every frame", and holograms/picnics are fed by the people loop.
- The collision check runs every N-th frame for everyone (N = the typical walker's rate from the previous frame), not per subset. Why: pairs are only found when both walkers are in the pass, so a subset would find far fewer meetings; a meeting lasts many frames, so a whole pass every N frames finds them.

**2. Ring (wrap-around) cache: done.** The cache picture is addressed modulo its size; the copy to the frame is up to four blits; when the view
moves, only the strip that became needed is drawn (strip camera, viewport offset beyond the attachment, scissor), up to the margin's width.
Pins and view-left-the-cache still redraw whole. Overlay test "no ring: redraw the cache whole at the edge" restores the old behavior;
the cache line shows `ring strips N`. Check: cache steps incl. five long pans (c_ring1 to 5, forward, back, other axis) against the
build before the item, both drawn the old way for the reference: 0 state differences, 0 page errors, residue 20 to 3,300 px a capture (same range
as before the ring: 60 to 2,300; the largest is the capture after a 1,500-unit pan), no seam: no row or column of the diff holds more than 13 pixels.
Decision: the strip is extended to the full margin once less than half is left (fewer, wider strips beat many one-pixel ones), and a strip
wider than the margin falls back to a whole redraw ("pan too fast for the ring").

**3. Turn and zoom slowdown: done (a); (b) can only be told on the owner's GPU.**
(a) Frames drawn the old way (turning, zooming, lights changing) now use the view's own projection instead of the cache's widened one: no margin
pixels drawn, no extra plots past per-plot culling. Chosen over scissor + real-frustum culling because it is the same draw path as `SC.mode = 'off'`
(the view's own projection; not checked against a7b4449 pixel for pixel in this build, the camera is still pinned along the view while the cache is
on) and removes the margin cost outright. The cache's own draws and the harness's `oldview` reference mode still use the
widened projection. Residue against the widened reference on the 7 changing-frame captures: 46 to 807 px of 921,600; every in-use frame is identical.
(b) The composite's extra 1 to 3 ms with the cache: the harness (SwiftShader) cannot show GPU timing. Built a switch that draws the cache copy
as a full-screen pass instead of blitting ("copy the cache by drawing, not blitting"; also `window.__COPY_DRAW = true`): same pictures as the
blit (checked on the cache steps; same 7 changing-frame captures differ, none new). If the composite is the same with it on and off, the cause
is not the blit's state; then the pinned camera's depth (wet-ground search, shimmer tiles) or `pxK` is next, which need the owner's GPU to measure.

**5. Fewer triangles: investigated; nothing shipped (details below).**
- Headroom (tools/perf/visprobe.py: triangle ids rendered from 12 turns x 3 tilts at zoom 30 around a mid-city point, ~6,800 triangles): of the
  triangles in the always-drawn and wall lists, 0.8% (A) and 5.3% (S) are never seen in those 36 views (front faces only, as the game draws them);
  sub-pixel ones (16% of S, 1.7% of A) can't be judged this way. The hidden segment H already holds 17 to 18% of all building triangles (166,726 of 949,000 in the city: undersides and
  faces inside blocks). The owner's 25% "never visible" is therefore mostly already out of the camera passes; what is left is a few percent.
- 5a rule built and measured: a face lying flat against a block's face, turned into that block (back of a plate or pane on a wall, touching faces of two
  blocks), moved to H. Provably covered (the block is between it and any view), and cheap. It moves only 0.3% of drawn triangles in the city and dense scenes
  and 0.5% in island and megas (2,334 of 951,000; 4,585; 48; 2,945). The sweep (12 turns x 3 tilts x 3 zooms, quick third) against the previous commit: 6 of
  36 captures differ by 4 to 77 px, all at the edges of the covered face where the face and the block's own side tie in depth (crops looked at: a few pixels of
  a window sill and a bolt, brightness differences up to 184 at one pixel). Not exact, and the gain is under a tenth of a millisecond: reverted. The patch is
  kept as tools/perf/patches/hide_flat_faces.patch (apply to js/world.js; `window.__NO_HIDE_FLAT = true` before load turns it off) so it can be tried.
- 5b leaner sticks: not applicable. Each of a stick's five non-bottom faces is visible from some allowed angle (the sides from different turns, the top
  from any tilt), so none can be removed for good. Which sides face away in a given frame is already handled: walls go to the per-direction slices (W1b) and
  the graphics card drops back faces. Nothing to build.

**6. Speed-based detail while turning: done, a cheat (flip test).**
- Per plot, on frames drawn the old way: its on-screen speed (render px a frame) around the pivot at the middle of the screen (turn, tilt and zoom;
  the plot's slowest part, so a big plot is as slow as its nearest edge). Triangles up to one or two size classes bigger than the usual cutoff go
  (SMALL_E doubles each class: at zoom 30, 1640 lines, class +1 drops edges under about 2 px, +2 under about 4); a fast spin gets one more class.
  A still view is never reduced (and the cache is always drawn at full detail); plots within 200 px of the cursor keep full detail whatever the speed;
  hysteresis of 25% round every threshold; a class comes back at most one a frame.
- Console variables, effective next frame: `SD.on`, `SD.v0` (10: px/frame where the first class goes), `SD.step` (2: next class at this multiple),
  `SD.max` (2), `SD.fast` (40: px/frame where a fast spin may drop `SD.fastMax` (1) more), `SD.cursorPx` (200), `SD.hys` (.25). Overlay test "no speed-based
  detail"; overlay line `speed-based detail: plots by extra classes +0: n +1: n ...  fastest N px/frame`.
- Decision: v0 = 10, not the 6 I first used. A keyboard turn (Q/E: 1.4 rad/s, .035 rad/frame at the M2's 40 FPS) at zoom 30 on 1640 lines moves a plot
  at 27 px/unit x .035 x its distance from the pivot: about 1 px/frame per unit of distance; with v0 = 6 and its margin (7.5) a normal keyboard turn would
  drop detail beyond 8 units, a quarter of the way to the edge of the screen; v0 = 10 (12.5) puts that at 13 units and a mouse drag turn (a few tenths of
  a radian a second) never reaches it. Tune by eye: raise `SD.v0` if you ever see detail drop, lower it for more speed.
- Check: standard script against the previous commit (still and eased frames must be identical): city 25, megas 15, dense 13 captures, 0 problems.
  Cache steps: a slow turn (+.12 rad, peaking at about .007 rad/frame) captured mid-turn: identical; a fast spin (+3 rad) and a quick zoom out
  captured while moving: 47,817 px (fast spin) and 29,214 px (quick zoom out) differ, 5% and 3% of 921,600, mostly fine detail: window bars, rails, small pieces
  (crop: tools/perf/overnight/item6_fast_spin_before_after.png, base left, new right; the crop was taken at v0 = 6, the numbers are with the final v0 = 10); the slow
  turn, and every capture at rest, are identical.
- Triangles drawn by the color pass during a fast spin (+3 rad, city, 1280x720): zoom 30: 35 to 49% fewer; zoom 15: 39 to 54% fewer (with v0 = 6).
  GPU time can only be read on the owner's machine: record a fast spin and a Q/E turn at zoom 30 with the test on and off.

**4. Memory: measured; nothing grows, the 3 GB is the city's geometry.** (tools/perf/memcheck.py: max city, harness Chrome with SwiftShader at 1280x720,
10 minutes of simulated play: a pan, turn, zoom, hour change or one build every 20 simulated seconds; JS heap after a forced collection; graphics bytes counted
from the API calls: textures, buffers and renderbuffers asked for, minus those deleted, no mips or driver padding. Same script on both builds.)

| | JS heap at load | after 10 min | graphics at load | after 10 min | three geometries at load / after |
|---|---|---|---|---|---|
| a7b4449 (before the cache) | 2,889 MB | 2,925 MB | 1,495 MB | 1,595 MB | 1,520 / 2,023 |
| round 6 at item 3 (d44c52e, cache with ring) | 3,008 MB | 3,045 MB | 1,555 MB | 1,651 MB | 2,366 / 2,645 |
| 6297025 (item 6), no building in the cycle, 400 s | 3,008 MB | 3,045 MB (flat from 50 s: 3,036, 3,039, 3,038, 3,048, 3,050, 3,046, 3,046, 3,045) | 1,555 MB | 1,648 MB | 2,366 / 2,642 (2,574 at 50 s, then +60 in the next 100 s, +5 after) |

- Both builds grow the same: +36 MB of JS heap and about +100 MB of graphics in 10 minutes, then flat. Without building, the geometry count rises for the first
  two minutes (plots and plants are built as the camera reaches them) and stops. No leak in either build.
- The cache build costs about +120 MB of JS heap and +60 MB of graphics at load (the second set of cache targets, +86 MB of textures, comes at the first
  background redraw). Your 3.2 GB reading was mostly the max city itself: a7b4449 already shows 2.9 GB right after load.
- Where the 3 GB is (tools/perf/heapsplit.py): Chrome's `performance.memory` counts the backing stores of typed arrays. Each geometry keeps its CPU copy of its
  vertex data after upload: 2.4 GB in 7,970 geometries (positions 870 MB, indices 505, normals 303, window emissive data 283, colors 214, three flicker/on/fine
  attributes 71 each). A plot's own meshes stay (hidden) next to the merged mesh of their region, so much of it is held twice; summing by owner, meshes that
  are hidden account for 1.9 GB of a (double-counted) 4.2 GB. Dropping the CPU copies of merged meshes after upload would save a large part of it; I did not do it
  (picking, edits and re-merging read those arrays; it needs a careful pass). Suggested as its own item.
- The sampling heap profiler (tools/perf/heapsites.py) sees only 153 MB of ordinary JS objects (the building scan, roundedBox geometry, collect lists, plants).

**7. Building without redrawing the whole cache: done.**
- What it does: an edit (a piece placed, removed, sweeping in or out, a neighbor's bridge or walkway rebuilt) no longer throws the whole cache away. The world notes
  the box of every static piece that came, went, showed or hid (`SC_DIRTY`, world.js; region and super-region merges, which change nothing on screen, and
  plants or glows that are drawn live and cast no shadow, are left out). The next frame draws just the rectangle those boxes can change: each box widened by 1.2
  units, swept down to the ground along the sun's rays (a point is in a new shadow if its ray to the sun meets the box), projected into the cache's pixels with
  4 px to spare, drawn with the strip camera and scissor of item 2 (so it wraps round the ring's edge correctly), with the lights the cache was drawn with (new:
  held lights for every strip and rectangle, which also makes ring strips exact under a running day cycle). Test "redraw the cache whole on edits" and
  `window.__NO_RECT = true` keep the old way; "strips drawn with the current lights" switches the held lights off.
- The whole picture is still drawn (as before) when: something changed that has no box (the highway and metro builders say so), the shadow map or the sun's light
  isn't what the cache was drawn with (light drift over 2e-4, tighter than the cache's own tolerance so a rectangle never sits beside visibly older light),
  the sun is below about 7 degrees, the rectangle is more than 55% of the cache, more than 24 boxes, or anything else the cache depends on changed in the same
  frames (turning, zooming, lights switching).
- The shadow gate: every edit also redraws the shadows in one frame, which used to drop the cache. Now that frame is drawn the old way,
  as it always was, and the cache stays; the next frame draws the rectangle. `redrawn N times` in the overlay no longer counts up on edits; `edit rectangles N`
  (and the last rectangle) is on the cache line. tools/perf/edit_frames.py shows it frame by frame: place, tall tower, demolish: one old-way frame (the shadow
  frame), then the rectangle, and the sweep end the same way; zero whole redraws.
- Checks: cache steps with edits drawn frame by frame (r_place, r_demo, r_tower, an edit after a pan that wrapped the ring, each with its sweep end): rectangles
  against whole redraws in this build, 70 captures, 0 problems; against the previous commit (whole redraws), 70 captures, 0 problems; standard script against
  the previous commit: city 25, megas 15, dense 13 captures, 0 problems. tools/perf/cache_compare.py (reads the cache, draws it whole, compares) shows what
  any two draws of the same cache differ by when nothing was edited: 19 to 134 px (tie pixels where merging changed draw order), so numbers near that are noise.
- Re-verified on the final commit (305d348) after the guard went in: edit_frames.py (above) and the cache-step lines show `edit rectangles` counting up on every
  place, tall tower, demolish and sweep end while `redrawn N times` stays put; the edit after the ring-wrapping pan (r_wrap) also took the rectangle path (x 322 to 544,
  y 157 to 358); the rectangle code is item 2's wrap-aware piece drawing, so it wraps when it has to (a rectangle that happens to straddle the ring's edge was not forced
  in a test). On the filtered step list rectangles against whole redraws in the same build differ by 45 px at r_wrap (clusters at (169,124), (210,669), (488,581),
  (496,415), (545,540)); tools/perf/cache_compare.py shows why: against a fresh whole redraw the cache differs by 22 to 153 px after every edit, and by 141 with no edit at
  all (c_still), and only 0 to 3 of those pixels lie within 40 px outside the rectangle: the rectangle's borders are fine, the rest is the same tie-pixel floor.
- Decision: the first version used the cache's own light tolerance and kept the cache across the shadow frame even while other things were changing; the standard
  script then showed two frames (city edit1_mid 1,809 px, megas edit0 835 px) drawn the old way instead of from a fresh cache. Fixed by keeping the cache only
  when nothing else changed, and by the tighter light tolerance; the standard script is back to 0.

**8. Soft effects at half resolution: done, a cheat (flip test).**
- What: the composite's wet-ground reflection search (22 steps), the steam mist (8) and the light shafts (12) are now worked out once per 2 x 2 block of pixels into three
  small RGBA8 targets (pass "soft effects (half resolution)", sky.js `softEffects`); the composite reads them where its own cheap tests say the effect applies (wet:
  up-facing opaque pixel in the wet; mist and shafts: the block's own result says something is there), as the four nearest texels weighted by how well each one's depth
  agrees with the pixel's (nothing bleeds across an edge, including at the foot of a wall: texels from a wall are not used for the ground). The pixel-art stepping and
  dither (reflection in five levels, mist in twenty, shafts in ten) is applied at full resolution to the result, with the full-resolution Bayer value. Outlines, ambient
  occlusion, rain, shimmer, night lights, rim light are untouched. The 2 x 2 grid is fixed to the world's pixel parity (the camera's corner, mod 2), so a pan of
  one pixel moves it by one pixel (checked by reading the code; not measured, so look for crawl on shafts and reflections while panning slowly).
- Test "soft effects at full resolution" (and `window.__SOFT_FULL = true`) restores the old composite: the shader program with `SOFT_HALF` off is the old text, and the
  pass is skipped. Exact half of the check: with the test on, the standard script against the previous commit (9e06e75), city 25, megas 15, dense 13 captures: 0 problems,
  including the rain night and the morning rays.
- Flip numbers (same build, half against full resolution, the standard script's captures; of 921,600 pixels): city 50,000 to 160,000 differ (5 to 17%), of which over 8 levels
  9,000 to 45,000 (1 to 5%) and over 32 levels 76 to 3,900 (up to 0.4%, the worst in the night pan); megas 43,000 to 76,000 (over 8: 4,500 to 6,800; over 32: 62 to 280);
  dense 48,000 to 82,000 (over 8: 6,100 to 11,200; over 32: 140 to 360). Most of it is the dither and stepping landing on neighboring levels, as the crops show. Same-frame
  crops (full resolution left, half right; tools/perf/soft_compare.py): tools/perf/overnight/item8_soft_rain_night.png (and _rain_night_far), _mist_vent_night, _mist_vent_day,
  _rays_morning, _rays_evening. Same-frame differences (soft_compare): night rain 29,775 px (over 8: 5,848; over 32: 103), rain far 24,433 (4,842; 163), mist at a vent at night
  27,553 (2,842; 9), mist by day 41,343 (12,821; 364), morning rays 36,483 (10,679; 503), evening rays 37,215 (16,121; 891).
- Cost: the GPU saving can't be measured here (SwiftShader). Exact timing (Shift+F3) lists "soft effects (half resolution)" beside "composite": read both with the test on and
  off, in rain at night (wet), at a steam vent, and at golden hour (shafts). What changes: the reflection search, mist march and shaft march run for a quarter of the pixels;
  the composite adds 1 fetch (mist, shafts) or 4 depth fetches plus 4 result fetches (only where they apply) per pixel.
- Bloom check: its first downsample already reads the composite's target directly into a target a quarter of the size (`glowPick`, W/4 x H/4, eight taps); no full-size pass in
  between. Nothing to change.
- Decisions: three single-output passes (r128 has no multiple render targets) rather than one with three outputs; RGBA8 with scaled values (no float targets needed); the texel's
  stand-in is the block's lower-left pixel; depth agreement weight 1/(1 + (dz/s)^4) with s = 6 pixels' worth of world units (.02 at least); the light shafts and mist read the
  block's own texel first and skip the other fetches where it says nothing is there (so an effect's faint outer edge can lose up to a texel).

**9. Custom shapes and round parts: measured and reported; nothing changed (as asked: report first).** tools/perf/shapes_report.py counts every primitive put into a piece while
the max city is generated (1,269,884 primitives, 24.0 million triangles before any hiding or culling; the visible share can only be sampled, see item 5).
- The kit: boxes 56.1% (12 triangles each, 1.12 million uses), `U.cyl16` 11.8% (64 each, 44,376 uses), `U.sph` 7.3% (80 each), `U.cyl` (8 sides) 5.8%, `U.blob` 1.0%.
  Everything else: 29.8% (`U.cyl16` is outside the four named shapes of the plan, so it counts here).
- Custom shapes by builder: `roundedBox` (core.js; an ExtrudeGeometry with a 1-step bevel and rounded plan corners) about 15% in all, in many sizes: 156 triangles (8,647 uses,
  5.6%), 242 (2.8%), 236 (1.9%), 292 (1.1%), 184 (.9%) and ten more under .5%. Its users: the building masses (buildings.js 344, 424, 598, 2122), floor slabs and trims
  (360, 420, 421, 526, 725, 794, 1322: slabs .07 to .13 high with corner radius .03 to .05), awnings (379), planters (1300), road furniture (ground.js 184). `U.torus` (6 x 20 sides,
  240 triangles) 1.9%, the luxury ribs and hoops (`lxRib`, `lxHoop`, `lxDome`) .4%, `U.cone` .1%, plus a few lathes and 4,000-triangle one-offs (.7%).
- Round parts all together (cylinders of both kinds, spheres, blobs, tori, domes, cones): 26.4%.
- Waste that is exact: none found. A rounded box's bottom cap and bottom bevel (about 40% of its triangles) face down and are already in the hidden segment, so they cost nothing to the
  camera; its plan corners use 4 segments each (three's arcs double `curveSegments`), which at radius .03 to .05 is far below a pixel.
- What would pay (cheats, need a flip test and per-zoom shape variants, so not done tonight): (1) rounded boxes with radius at most .06 drawn with one segment per corner when small on screen:
  a slab goes from 156 to about 60 triangles, the outline moves by under .3 of a pixel at zoom 30 on 1640 lines (r (1 - cos 22.5 degrees) at .05 is .004 units); the rounded boxes are
  about 15% of the triangles put, so something like 9% of all triangles. (2) `cyl16` drawn as 8 sides when its diameter is under about 6 pixels (the 8-gon is inside a quarter pixel
  of the circle up to a radius of 3.3 px) and as 4 sides under about 1.7 pixels: `cyl16` is 11.8% of the triangles put, 8 sides is half the cost. Both would be chosen per piece range like the
  size classes of W2a, so they need the shapes generated in two or three variants and one more row per piece in the layout. Say if you want it.

**10. Painted wall detail at far zoom: measured, under the threshold, so no prototype.** tools/perf/paint_probe.py (boxes only; a box counts when all of it lies within the depth of the
plane of a larger box's face, parallel to it, its footprint inside that face's rectangle: sills, frames, panels, panes, window bars, rails laid on a wall; counted with its 12 triangles):
- Depth .06 (the plan's number): city 7.7% of all triangles put (11.3% of the boxes; of that 1.0% glowing, 6.7% plain), dense 7.0% (11.6% of boxes). The plan's threshold is 20%: not reached.
- Depth .12 (twice the plan's, about 3 pixels at zoom 30, so no longer "under a pixel"): city 18.5% (27.1% of the boxes).
- The visible share can't be read from this probe (the owner's measurement: thin plates 14%, panes 8%); boxes lying on a wall show about half of their 12 triangles at most, so counting by pieces
  overstates the saving. By the plan's rule (over 20% of building triangles within about .06 of a larger parallel wall face) I did not build the prototype.

**11. Steady frame pacing: measured, one cause found and not fixable cheaply, the rest explained.** tools/perf/spikes.py (main thread without drawing: the real clock, per frame, with
the function that took the time; and drawn frames counted: whole redraws, strips, rectangles, programs compiled, draw calls). Max city, zoom 30, this machine (about twice the M2's time):
- Main thread, 400 frames each after 1,200 warm-up frames. Still: median 9.5 ms, 95% 18.9, 99% 33.3, max 52.0. Slow pan: median 9.6, 95% 14.9, 99% 27.9, max 31.7. Slow turn: median 9.1,
  95% 15.5, 99% 34.6, max 50.5 (95% over median 1.5 to 2.0).
- What the standing-out frames are: (1) `decide` in bursts of 14 to 18 ms in single frames, and the first frames after the harness has drawn: the harness freezes the clock inside a frame, so the
  game's 2.5 ms a frame decision budget never stops them; in the game that cap holds and the steady cost is about 1.5 ms. An artifact, not a spike you will see. (2) `checkBumps`: 2.5 to 4 ms on
  every N-th frame (N = 2 to 4 by zoom: item 1 runs the whole pass every N-th frame). That is a real, regular spike: 9, 9, 12 ms at N = 3. I tried spreading it (each frame only the walkers whose
  place in the list plus the frame number is a multiple of N look for someone near them, so each looks once in N frames): the list and the grid have to be built every frame then, and that is most of
  the pass (about 2 ms), so the mean went from about 1 ms a frame to 3 ms. Reverted. The fix is a grid kept between frames and updated as walkers step (each walker is stepped once in N frames anyway):
  a design, not tonight's job. (3) `updateSteam` (2 to 6 ms) and `updateMegaFx` (2 to 8 ms) vary from frame to frame with no budget on them; no single cause.
  (4) Garbage collection can't be seen from the page; nothing in the table ("other") was left over after the timed functions in the frames that stood out.
- Drawn frames (counted; the harness's renderer can't time the card): slow pan, 60 frames: 0 whole redraws, 0 strips, all frames from the cache, 2,089 to 2,119 draw calls. Fast pan: 2 strips in 60
  frames, each frame with a strip submits about 350 to 480 more draw calls (1,950 to 2,420). Slow turn: every frame drawn the old way (the cache waits for the view to hold still), 1,403 to 1,418 calls.
  Day cycle running: a whole redraw twice in 60 frames (the cache redraws when the lights switch, 8 background strips each time, one draw-call bump of about 750 on the frames with a strip).
  No shader program was compiled in any of these scenarios once warm (the first time a weather or time-of-day combination appears it compiles; not measurable here).
  An edit: see item 7 (edit_frames.py: one old-way frame, the one that redraws the shadows, then one rectangle).
- Found while counting calls: a cached frame has MORE draw calls (about 2,100) than an old-way frame (about 1,400) at zoom 30 in the max city, because the live pass of the cache also draws the glow
  overlay (one small draw per piece with flickering or stuttering windows) and the live set. See item 12 for what the live pass holds: 1.16 million triangles in 886 objects at zoom 30, the largest part
  glass.
- Done about it: nothing shipped. The one regular spike (`checkBumps` every N-th frame) has a design but not a quick fix; everything else is either an artifact of the harness's clock or
  already smooth. If you see stutter on the M2 that is not this, the likely suspects are the glass and plants live set (item 12) and shader compiles on weather changes.

**12. Zoom 60 (measure only; the cap stays at 30).** tools/perf/zoom60.py sets `zoom = zoomT = 60` in code; max city, harness render size 1024 x 576, cache on, other changes in. Draw calls and
triangles are as submitted; GPU time can't be read here, the owner's script below has the readings.
| | zoom 30 | zoom 60 |
|---|---|---|
| world units a render pixel covers | .104 | .208 |
| people on screen of 10,203 / step rate N | 7,304 / 4 | 10,118 / 4 |
| size class cutoff (CULL.lvl) | 3 | 4 |
| cached still frame: draw calls / triangles submitted | 2,098 / 1.70 M | 2,447 / 1.90 M |
| main thread, no drawing: median / 95% / max | 8.85 / 17.5 / 24.9 ms | 9.80 / 17.4 / 24.5 ms |
| slow pan, 40 frames: whole redraws / strips / old-way frames / draw calls | 0 / 0 / 0 / 2,089 to 2,119 | 0 / 0 / 0 / 2,424 to 2,448 |
| slow turn, 40 frames: old-way frames / draw calls | 40 / 1,564 to 1,595 | 40 / 2,556 to 2,637 |
- At zoom 60 the whole city (everyone) is on screen, so per-plot culling removes nothing: the frames drawn the old way (turning, zooming, lights changing) submit 65% more draw calls than at
  zoom 30, and those are the frames that will hurt. Still and panning keep the cache's benefit (draw calls +17%), and the cache's margin (256 px) then covers 53 units instead of 27, so
  pans need strips about half as often.
- The live pass (what a cached frame still draws; tools/perf/live_tris.py), max city, zoom 30: 1.16 million triangles in 886 objects that pass the frustum test: see-through glass of the
  buildings (177 objects, 457k, `colorOnly` materials: transparent, drawn after the people so they tint what is behind them, which is why they can't live in the cache), building meshes that
  write their normals themselves (219 objects, 205k), plants (34 instanced objects, 95,550 instances, 191k), glow points (98k), instanced street furniture and vehicles (155k). This is what the
  color pass still costs with the cache on; trimming it (glass quads merged where they share an edge, plants culled by super-region) is the largest lever left on the card side.
