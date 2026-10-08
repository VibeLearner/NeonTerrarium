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
  captured while moving: 50,000 to 53,000 px differ (5% of 921,600; mostly fine detail: window bars, rails, small pieces; crop:
  tools/perf/overnight/item6_fast_spin_before_after.png, base left, new right). Those numbers are with v0 = 6; the speeds in those two captures were far above
  either threshold, so v0 = 10 changes them little (re-checked in the final run, see the table).
- Triangles drawn by the color pass during a fast spin (+3 rad, city, 1280x720): zoom 30: 35 to 49% fewer; zoom 15: 39 to 54% fewer (with v0 = 6).
  GPU time can only be read on the owner's machine: record a fast spin and a Q/E turn at zoom 30 with the test on and off.

**4. Memory: measured; nothing grows, the 3 GB is the city's geometry.** (tools/perf/memcheck.py: max city, harness Chrome with SwiftShader at 1280x720,
10 minutes of simulated play: a pan, turn, zoom, hour change or one build every 20 simulated seconds; JS heap after a forced collection; graphics bytes counted
from the API calls: textures, buffers and renderbuffers asked for, minus those deleted, no mips or driver padding. Same script on both builds.)

| | JS heap at load | after 10 min | graphics at load | after 10 min | three geometries at load / after |
|---|---|---|---|---|---|
| a7b4449 (before the cache) | 2,889 MB | 2,925 MB | 1,495 MB | 1,595 MB | 1,520 / 2,023 |
| round 6 at item 3 (d44c52e, cache with ring) | 3,008 MB | 3,045 MB | 1,555 MB | 1,651 MB | 2,366 / 2,645 |
| same build, no building in the cycle, 400 s | 3,008 MB | 3,045 MB (flat from 50 s: 3,036, 3,039, 3,038, 3,048, 3,050, 3,046, 3,046, 3,045) | 1,555 MB | 1,648 MB | 2,366 / 2,642 (2,574 at 50 s, then +60 in the next 100 s, +5 after) |

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
- The shadow gate your advisor-style trap: every edit also redraws the shadows in one frame, which used to drop the cache. Now that frame is drawn the old way,
  as it always was, and the cache stays; the next frame draws the rectangle. `redrawn N times` in the overlay no longer counts up on edits; `edit rectangles N`
  (and the last rectangle) is on the cache line. tools/perf/edit_frames.py shows it frame by frame: place, tall tower, demolish: one old-way frame (the shadow
  frame), then the rectangle, and the sweep end the same way; zero whole redraws.
- Checks: cache steps with edits drawn frame by frame (r_place, r_demo, r_tower, an edit after a pan that wrapped the ring, each with its sweep end): rectangles
  against whole redraws in this build, 70 captures, 0 problems; against the previous commit (whole redraws), 70 captures, 0 problems; standard script against
  the previous commit: city 25, megas 15, dense 13 captures, 0 problems. tools/perf/cache_compare.py (reads the cache, draws it whole, compares) shows what
  any two draws of the same cache differ by when nothing was edited: 19 to 134 px (tie pixels where merging changed draw order), so numbers near that are noise.
- Decision: the first version used the cache's own light tolerance and kept the cache across the shadow frame even while other things were changing; the standard
  script then showed two frames (city edit1_mid 1,809 px, megas edit0 835 px) drawn the old way instead of from a fresh cache. Fixed by keeping the cache only
  when nothing else changed, and by the tighter light tolerance; the standard script is back to 0.
