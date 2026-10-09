# Frame-rate work: results (2026-10-07)

Every change below was checked with `harness.py diff`. The final check compares the build before any of this work
(local tag `perf-base`, commit 87f3f6e) with the finished build: 106 captures (3 scenes, 2 screen sizes, noon to night, rain, zoom, pan,
effects off and on, edits mid-animation, a station rush, a running day cycle). Every PNG, simulation dump, save and
`renderer.info` count was identical.

## Timings, before and after

These are SwiftShader numbers (Chromium's CPU-based GPU), in ms. Treat them as relative: a real GPU is much faster, but
the shares are similar. CPU times are the mean of 600 simulated frames. GPU times are the mean of 6 redraws of a single
pass. Differences under about 15% are within run-to-run noise.

| Measure | Scene, view | Before | After | Change |
| --- | --- | ---: | ---: | ---: |
| CPU frame | city | 2.57 | 1.97 | -24% |
| CPU frame | megastructures | 2.23 | 1.21 | -46% |
| CPU frame | island | 0.35 | 0.18 | -48% |
| Composite pass | city, night zoomed out | 570 | 472 | -17% |
| Composite pass | city, night close | 274 | 230 | -16% |
| Composite pass | megastructures, noon | 514 | 416 | -19% |
| Composite pass | megastructures, night rain | 490 | 391 | -20% |
| Composite pass | island, night rain | 197 | 146 | -26% |
| Night-light pass | city, night close | 150 | 25 | -83% |
| Night-light pass | megastructures, night close | 116 | 78 | -33% |
| Whole frame (GPU) | city, night close | 1101 | 924 | -16% |

## What was done (plan item: commit)

| Item | What | Commit |
| --- | --- | --- |
| harness | `tools/perf`: deterministic pixel and simulation diff, plus timings | d2b802e and later harness commits |
| G1+G2 | World matrices are updated once per frame instead of in each of the five scene passes. Static plots, regions and the scene root keep fixed matrices. | b3c8755 |
| G6 | Light shafts skip their 12-step shadow march when a line of sight never comes near the haze | 1e2d532 |
| G4+G5 | The lift-pad and metro-field shimmer loops are skipped, or given fewer cars, when what they would show is off screen | 7a3e58f |
| G7 | One depth read and one line of sight shared by both shimmers | 2e5cb38 |
| G9+G11 | No writes to the unused metro deck glow. The animation outline pass finds its meshes once. | 421ed81 |
| G3 | Night-light squares further off screen than their reach are dropped in the vertex shader | 77b1d45 |
| C1 | Metro riders are indexed once per frame. The waiting count is kept up to date incrementally instead of rescanning the city per rider, per train and per lift. | 2772fb8 |
| C2 | Metro scratch objects are reused | 11c0812 |
| C3+C4 | Highway cars are sorted and compacted in reused arrays. Pulse colors are uploaded only when a segment changes step. | e030fe4 |
| C7 | Vehicle shadows use a scratch vector | d7df470 |
| C5 | Deck walkers keep their keys and lengths. The bump check uses number keys and reused lists. | a2d4637 |
| C8 | Megastructure belt, crate and spire-light buffers upload only while on screen | b3bdbb4 |
| allocations | Neon Dome beams reuse their down vector | 68778f6 |

## Skipped, and why

- **G8** (glow pass bookkeeping): the plan marks it unsafe. The final mix reads the bloom targets even with bloom off.
- **G10** (merge the color and normal passes with multiple render targets): the plan makes this a separate decision.
  It was not attempted.
- **C6** (`ghPose` flag): the lookup is already a single `Map.get`. A flag would need hooks at every place `p.at` is
  assigned, which adds risk for no measurable gain.
- **C9** (steam): left as is, as the plan says.
- **C10** (hoist the `emit` closure): one closure per frame. Hoisting it would mean restructuring `updatePeople`'s
  locals into module state, for no measurable gain.
- **Pod lift `Map` and `ckey` strings** (`updateLifts`): only riders in pods are grouped, a handful per frame.
- **Metro door matrix** (metro.js, `mtDrawDoors`): this code sits after an early `return` and never runs.

# Round 2: the biggest city (2026-10-08)

Scene `maxcity`: the view at the furthest zoom filled with buildings of all four zones, two of each megastructure, two
metros and three highways, about 10,200 people. Numbers are from the same SwiftShader setup as above. Draw calls and
triangles are exact counts; times are medians.

| Measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Draws, color pass, furthest zoom | 1931 | 1352 | -30% |
| Draws, normal pass, furthest zoom | 845 | 690 | -18% |
| Draws, foliage pass | 204 | 36 | -82% |
| Draws, color pass, close up (zoom 6) | 724 | 326 | -55% |
| Triangles, color pass, furthest zoom | 16.52M | 16.52M | 0% |
| Triangles, color pass, close up | 3.264M | 3.271M | +0.2% |
| People update, real clock (ms) | 8.4 | 5.9 | -30% |
| Whole simulation step, real clock (ms) | 13.3 | 10.3 | -23% |

"Real clock": the harness freezes the clock inside a frame, so the 2.5 ms decision budget in `updatePeople` never
trips there and every frame makes 60 decisions (routing then dominates the profile). With the real clock the budget
works as in the game.

| Item | What |
| --- | --- |
| people | Walkers carry on from the path segment they were on instead of scanning their path from the start (4 places). The bump check sorts movers into a flat grid of typed arrays (counting sort), visiting neighbours in the same order as before. Every person is created with all its fields, so they share one hidden class. Police bikes keep their path segment too. |
| batching | Plants and glows (and those of the bridges and walkways) are still built per region at the same moments, but drawn 4 x 4 regions at a time (they are never culled, so this draws nothing more). Bridges and walkways themselves stay one mesh per region, so close-up views draw no extra geometry. Merged batches keep their first piece's place in the draw order, for see-through things too. |
| megastructures | Logistics hub forklifts, drone rotor discs and floor light pools are drawn as one batch per material and shape. Police drones and the radar head draw one mesh per material. |
| harness | `--ref` picks the candidate for `diff`; `PERF_STEPS` runs a subset of steps; each build gets a fresh browser (two max cities in one browser lost the page). |

Check: city, megastructures and dense scenes (53 captures) plus 5 max-city captures. Simulation dumps and saves are
identical everywhere. Pixels: at most 57 differ per capture, and 631 (mean 1.7 levels out of 255) on the city's day
cycle after its edits. These are halos crossing a sprite or steam: after an edit, a merged batch can be drawn on the
other side of them than the rebuilt region was, the same kind of order the game already varies with build history.
Close up, the logistics hubs can cost up to 15 more draws when only part of a hub is in view.

Not done: walkers off screen already stop being tested once the 700 drawn people are full (`emit` returns first).

# Round 3: exact pass timing on a real graphics card (2026-10-08)

The overlay's "gpu ms" column comes from WebGL timer queries. In Chrome on an Apple M2 (ANGLE on Metal) they are not
usable: for the `maxcity` scene they added up to 146 ms a frame while frames took 64 ms, and the bloom chain (seven small
passes at a quarter and an eighth of the size) and the plain upscale to the screen each read about 25 ms, the same as the
composite. So the overlay now has **Exact timing** (its button, or Shift+F3): before and after each pass it waits until
the card has finished (`gl.finish` plus a one-pixel read from the target the pass drew into) and times the gap with the
clock. The glow passes are also listed one by one in this mode. Reading back from a separate 1 x 1 target was tried first
and does not wait on Metal (the composite then read 0.4 ms), so the read has to come from the pass's own target.

The waiting stops the processor and the card overlapping, so in this mode a frame takes longer (about 100 ms here) and
the passes add up to more than the real frame. Read the shares, not the total. With exact timing off the overlay
works as before, and while it's hidden it costs nothing. Frames are drawn the same either way (harness: 0 problems).

Measured in the live game, `maxcity` (2025 plots, about 10,200 people), zoom 30, render 3420 x 1640 (720p, "Optimize
framerate" off), 15:30, no rain. Standing still, then panning round the middle of the city with the keys.

| Pass | Normal overlay, gpu ms (still) | Exact, still | Exact, panning | Exact, night (22:00) |
| --- | ---: | ---: | ---: | ---: |
| color (with a shadow redraw) | | | 52.9 | |
| color | 49.0 | 41.3 | 36.2 | 41.1 |
| normals | 19.7 | 23.3 | 20.2 | 23.0 |
| night lights | 1.2 | 0.4 | 0.4 | 3.8 |
| clouds | 1.5 | 0.7 | 1.3 | 0.7 |
| **composite** | 24.2 | **20.0** | **18.6** | **17.8** |
| bloom and grade (7 passes) | 25.2 | 3.9 | 3.8 | 3.9 |
| to screen | 25.7 | 1.0 | 1.0 | 1.0 |

The normal overlay itself, for reference: still, 15 to 16 FPS, frame 64.5 ms, main thread 22.7 ms (people 6.3 ms);
panning, 17 FPS, frame 60.2 ms (95% under 83.5), main thread 24.0 ms, and about 8 shadow redraws a second.

- The **composite** is the costliest full-screen pass by a wide margin, about 18 to 20 ms. Every other full-screen pass
  is under 4 ms: the whole bloom and halation chain about 4 ms (its biggest step, the final mix, 1 ms), the night lights
  4 ms after dark, the upscale 1 ms.
- The two scene passes cost more than any full-screen pass: color about 41 ms and normals about 23 ms (each about 18M
  triangles at this zoom).
- Panning redraws the shadow map on most frames, adding about 12 to 17 ms to the color pass each time (the work on
  `wip/shadow-strips` is aimed at this).

# Round 3: shadows without spikes, the city drawn once (2026-10-08)

Measured live in Chrome on the owner's M2 (max city, zoom 30, rendering 2560x1440), before and after:

| Reading | Before | After |
| --- | ---: | ---: |
| FPS, standing still | 20 | 26 |
| Frame time, standing still | 51.0 ms | 39.0 ms |
| FPS, panning | 19 | 28 |
| Worst frame, panning | 67.6 ms | 50.9 ms |
| Shadow redraws in 10 s, panning | 82 | 0 |
| FPS, day cycle on | 17 | 29 |
| Shadow redraws in 10 s, day cycle on | 169 | 0 |
| Triangles per frame (harness) | 32.6M | 16.5M |
| Exact time, color + normals | 56.2 ms | 39.6 ms |

| Item | What |
| --- | --- |
| shadows | The shadow map is drawn twice as wide as the view needs (4096 texels, same texel size and grid), so panning stays inside it. A new map (when the view nears its edge, the sun moves, or the zoom steps) is drawn in the background a strip per frame into a second map and swapped in when done. The two maps share one depth buffer. Edits still redraw at once. With the day cycle on, the old code redrew the whole map every frame. |
| draw once | The color pass also writes the normal image (a second render target): every material writes the normal the old normal pass drew there. Draws the normal pass never made don't touch it, and among solid draws come last. The separate normal, plant-normal and sweep-normal passes are gone (kept as a fallback without WebGL 2). |

Check: no simulation differences anywhere (57 captures, live and in the harness). Pixels: 2 to 4% of pixels differ as thin
speckle along edges, where the old normal pass and the color pass disagreed about which surface is in front (now both
come from one drawing); with the day cycle running, shadows catch up with the sun every half second instead of every
frame. Shadow maps take about 160 MB of graphics memory instead of 24 MB.

# Round 4, W1a: per-plot culling inside merged blocks (2026-10-08)

Each 3 x 3 block's merged building mesh now remembers every plot's box and index ranges; each frame only the plots in view
are drawn (one WEBGL_multi_draw call, or one draw per range without it). Overlay test "no per-plot culling" switches it off.

Harness (SwiftShader, 1280x720): city, dense, megas 53 captures and maxcity (noon_f1, night_zoom_in, night_pan) 3 captures,
0 problems; city and dense again with the multi-draw extension forced off (the per-range fallback), 38 captures, 0 problems.

| Scene, step | Triangles before | After |
| --- | ---: | ---: |
| maxcity noon (furthest zoom) | 34.5M | 32.5M (5.7%) |
| maxcity zoom 4.5 | 2.05M | 1.29M (37%) |
| maxcity pan | 2.04M | 1.24M (39%) |
| city zoom 4.5 / pan | 391k / 345k | 233k / 185k |

Timing on the real card is not measured yet (needs the owner's M2: see the plan's protocol).

## W1b: finer wall slices (tried, not kept)

Probe (maxcity, zoom 30, after plot culling): 6.4M building triangles submitted, 1.23M (19%) face away: 401k of 2.77M in A
(only 83k of those tilt under 8 degrees, so a tilt-aware order is not worth it) and 828k of 3.65M wall triangles (8 slices
let in walls near the edges). 16 or 32 slices would cut about 9% of triangles, but both change the order triangles tie in
and move 3 pixels by one level in one channel (megas edit0). Kept at 8 slices so the harness stays at exactly 0.

## W3a: normals as signed bytes (tried, not kept)

Harness: thousands of pixels differ per capture (megas: 3,800 to 8,700) because slanted faces' toon bands and the normal
image flip on knife-edge values. Not "the same picture", so the vertex stays at float normals. Positions as 16-bit were not
tried: they move edges, which is the same kind of change.

# Round 4, second pass: the cheats, built on request (each its own commit, revert any one)

Order of commits after W1a: (1) 16 wall slices (W1b) and byte normals (W3a); (2) size-sorted triangle order (W2a);
(3) off-screen people at quarter rate (W5.1). Checked with the harness against the commit before each one (SwiftShader).

| Change | Harness vs the commit before | Triangles (city, dense, megas, all steps) |
| --- | --- | --- |
| 16 slices + byte normals | thousands of pixels differ by a level (earlier trial of byte normals: 3,800 to 8,700 a capture) | n/a |
| W2a: triangles under a pixel not sent | median 2,223 pixels of 921,600 differ (0.24%), worst 16,505 (1.8%, night zoomed out, looks identical by eye); no state differences, no page errors | 51.0M to 31.9M (36% fewer); zoom-in steps about 50% fewer |
| W5.1: people off screen every 4th frame | state differs (expected: the simulation changed); no page errors | n/a |

W2a: a first version drew only a third of each list (counts in triangles, ranges in indices); caught by looking at the
capture, fixed. Threshold: longest edge under one render pixel at the current zoom, in doubling classes (SMALL_E in world.js).
Overlay tests (exact mode, Shift+F3): "draw sub-pixel triangles too", "people off screen at full rate",
"no per-plot culling".

Not built, with reasons:
- W3a positions as 16-bit: needs per-batch origins; every reader of merged geometry (walking maps, ray tests) would change.
- W4a half-resolution composite effects: the wet-ground search, mist and rays are interleaved with the pixel stepping in one
  shader (sky.js); splitting them out blind, with no real graphics card here to time it, risked a broken composite.
- W6 cached static city: a large new render path (margin target, strip refresh, live/static split). Better started once
  the numbers from the owner's M2 show how much of the frame is left after these changes.
- W3b, W5.2, W2b, W2c: small, unmeasured gains; left until the M2 timing says which one is worth it.

# Round 5: the cached static city (branch wip/static-cache, from a7b4449)

Plan: the owner's `cached-static-city-plan.md`. Measured only in the harness (SwiftShader) so far; the owner's M2 numbers are still to
come (script: tools/perf/MEASURE_STATIC_CACHE.md). Nothing is merged or published.

**Read this first: where the work departs from the plan.**
1. The plan's "diff 0" checks for steps 2 and 3 were not met. The cache frames match the old way of drawing (the same build's old
   path, drawn through the same view) to within 12 to 2,300 of 921,600 pixels, nearly all one level, not 0. I carried on instead of
   stopping, judging that within the plan's allowance ("a handful of tie pixels, explained"), which is a stretch; the owner decides.
2. `SC.drawView` is not in the plan. The cache camera's projection is wider than the view's, and rasterization of an edge that falls on
   a pixel centre depends on the exact floats. To make the cache and the frame come out alike, the view itself is drawn with the
   cache camera's widened projection and a viewport offset by the margin. Consequence: with the cache enabled, even frames drawn the
   old way differ from a7b4449's. Only cache off ('off' mode, or the overlay test "no static cache") is exactly a7b4449.
3. Step 6 does not rebuild "on the shadow schedule, every half second" as the plan says. It redraws when the lighting has drifted
   by 0.003 (under a level of 255), when the shadow map is swapped, or when the view has used half the margin; jumps over 0.03 redraw at
   once. The plan's half-second lighting measurement was not taken as such; see "Lighting lag" below.
4. Not in the plan: while the cache's inputs keep changing from frame to frame (turn or zoom easing, the lights switching) the frame is
   drawn the old way until they hold still for a frame (otherwise it was redrawing a cache 1.5 times the view's area every frame).
5. Not tested: the cache on the real graphics card (SwiftShader here, so no timings), and Chrome's own "Optimize framerate"
   automatic lowering (the setting's cap was toggled; the automatic lowering depends on the measured frame time). City, megas, dense,
   island and (for a few still captures) the max city were run with the cache on; the max city was not run through the full cache script.

What it is: opaque toon, lambert and basic meshes built once (buildings and walls, ground, bridges: everything that joins the world
through freezeTree) move to layer 5 ("static"); everything else stays live (people, plants, vehicles, glow points, see-through things,
anything with a time uniform or a clipping plane, pieces mid-sweep). The static set is drawn into a target 256 render pixels wider than
the view on every side (color, normals and depth, the color target's formats); each frame the window the view needs is blitted into the
color target at a whole-pixel offset and only the live set is drawn on top, with a small overlay for the lights that flicker or blink
and the windows that stutter. Code: js/staticcache.js, hooks in world.js, sky.js, input.js, main.js, people.js, perfhud.js.

| Step | Commit | What the check found |
| --- | --- | --- |
| 1 static and live flags, layer split | a63f7aa | harness against a7b4449, city, megas, dense, 53 captures, 0 problems |
| 2 cache target and camera, redrawn every frame, copied | 42d0d64 | copy matches the same build's old path to 12 to 20 pixels; draw order 0 (city) |
| 3 camera pinned along the view | 602b615 | no haze or rain shift; 12 to 613 pixels of depth-quantization noise |
| 4 reuse: signature, coverage, fallback | 0b73c2f | flicker frozen at that step (fixed in 5) |
| 5 glow overlay | 53c1cba | first captures 562 and 637 to 62 and 63 pixels |
| 6 strips into a second target, soft and hard signature | 8b33406 | 26 steps on the city, below |
| 7 overlay line and tests, tooling, measurement script, fixes, this record | (last commit) | below |

Correction to steps 2 to 6: their messages call the 1,000 to 4,500 pixels against a7b4449 "rasterization rounding". Part of it was
a defect: the plants' and people's vertex shaders turn world positions into whole render pixels with `projectionMatrix` and the `res`
uniform and emit clip coordinates for a target of size `res`; with the widened view that was the wrong size. Fixed in step 7
(`FOL_UNI.res` is the widened size while the view is drawn widened); the 'off' mode and the cache-vs-same-build numbers were not
affected, because they either never widen or widen both sides. After the fix, noon on the city against a7b4449: 4,600 to 1,500 pixels.

## Exactness (SwiftShader, 1280x720)

- Cache off ('off' mode): exactly a7b4449, harness city, megas and dense, standard script, 53 captures, 0 problems. The default build
  against itself: 25 captures, 0 problems.
- Default build (cache on) against a7b4449, same 53 captures: **0 state differences, 0 page errors**; pixels differing per capture (of
  921,600): city 164 to 3,184 (median about 1,900), megas 12 to 2,928, dense 126 to 4,828, island (13 captures, 0 state differences) 0 to 1,388, six of them identical; at most 294 by more than 32 levels in the
  city, 228 in megas, 856 in dense (the one with effects off, in palette mode, turns small differences into palette steps).
- Cache against the old path of the same build through the same view ('oldview'), the cache script (below): 62 and 63 pixels on the
  first draws, 538 to 2,300 afterwards on the city; at most 54 beyond 32 levels. Two causes: isolated single pixels at foliage and
  sprite edges where a live and a static surface meet at one depth (static is drawn first, live after; the one order the split cannot
  keep: 20 pixels on the max city's pan with no cache at all), and one-level steps in depth-dependent effects (outlines, dither), because
  pinning the camera along the view moves every depth value.
- No differences line up on a row or a column (no strip seams: at most 6 in any row).

## The cache script (PERF_SC_STEPS=1: still, pans, a strip job, turn, zoom, edits on and off screen, dusk, night, rain, the day cycle,
## the optimize-framerate cap; frames before a capture are drawn so the cache is carried along; cache in reuse against 'oldview')

| Scene | Captures | State differences | Page errors | Pixels per capture (of 921,600) | Most beyond 32 levels |
| --- | ---: | ---: | ---: | --- | ---: |
| city | 30 | 0 | 0 | 62 to 2,284 | 54 |
| megas | 34 | 0 | 0 | 49 to 2,275 | 44 |
| dense | 34 | 0 | 0 | 54 to 1,902 | 58 |
| island | 39 | 0 | 0 | not tabulated (state and errors only) | |

The cache line at each capture reads as it should: in use when still, after panning slowly, after edits and after settling; "redrawing n
of 8" for a view nearing the edge and for a light that drifted; "off (changing: drawn the old way)" during turns, zooms, the lights
switching and the day cycle at dusk; the render-size toggles of "Optimize framerate" (cap on and off) rebuild and carry on (13 to 140 pixels
after settling). Frames that redraw the whole cache are single frames; a strip job costs an eighth of a full draw for eight frames.

Triangles submitted at the capture frame (renderer.info), old path against cache frame:

| Capture | Old path | Cache frame | Draw calls old / cache |
| --- | ---: | ---: | ---: |
| city, still | 502,784 | 44,614 | 254 / 180 |
| city, night, settled | 408,955 | 61,184 | 390 / 330 |
| maxcity (1280x720 render), still | 7.93M | 1.66M | 2,264 / 1,974 |
| city, turn, zoom, dusk, day cycle, cap toggles | 295,282 to 480,051 | the same (old way) | the same |

What remains in the max city's cache frame is mostly the live set: wind-driven plants (instanced), glow points, people, vehicles.

## The glow overlay

Probe (tools/perf/overlay_probe.py): the overlay draws 0.64 to 0.87% of the building (ATLAS) triangles per frame by day and by night
(city 7,100 of 818,154; max city 122,927 of 19.07M), 1.6 to 1.8% at a held evening hour (the windows in the stutter band of LIGHTS_ON, by
threshold: 14,592 and 306,650); the whole stored overlay is 11 to 12.5% (index memory only). How many pixels it repaints was not measured
(WebGL 2 has no sample count query).

## Lighting lag

The plan asked how much the toon lighting changes in half a second. Not measured as such. The cache redraws when the sun, sky light or
glow strengths have drifted by 0.003 (under 1/255), so by construction it trails by under a level plus a strip job. Checked by running
the day cycle at 27 times its real speed with every frame drawn (a harsh upper bound): 124,000 to 178,000 pixels differ from the
old way, but only 4,800 to 12,300 by more than one level and 120 to 230 by more than 8; at the real speed that lag is 27 times smaller.
A first attempt (900 skipped frames at the real speed) showed 385,000 pixels; that was the harness skipping drawing for 15 seconds so
the cache never refreshed, not a property of the cache (in play every frame runs the cache logic).

## Other things found on the way

- A held mid-morning hour with the day cycle on kept the cache off: LIGHTS_ON follows a target that drifts a few millionths a frame by
  day. Below the lowest window threshold (about .18) it can change nothing, so it no longer counts as a change.
- A harness slip: for a while the cache code's early exit on skipped frames also skipped the harness's record of an owed shadow redraw,
  so captures after edits had stale shadows in every mode, including 'off' (656,022 pixels at edit0_mid). Found by checking 'off' against
  a7b4449 and fixed; the figures here are from after the fix.
- Two first versions of step 6 failed the check and were fixed: rain on left the old lighting for 8 frames (a 0.45 change was classed as
  drift; the jump threshold is now 0.03), and held evening hours froze the stuttering windows.

Memory: two sets of cache targets of (W + 512) x (H + 512) pixels, 12 bytes a pixel (color 4, normals 4, depth 4): at 3420 x 1640 about
101 MB each, 203 MB together (the second set is made at the first background redraw). Shadow maps are another 160 MB already.

## To look at on the M2

- Shadows lag the sun by up to a strip job after a shadow-map swap with the day cycle on: watch dawn and dusk for a seam or a late shadow.
- Windows at held evening hours (19:00 to 21:00, 5:00 to 7:00): they stutter with the clock and the overlay redraws them each frame.
- Turn, zoom and the lights switching draw the old way; so the turning numbers should match the old build's.
- tools/perf: PERF_SC_STEPS=1 (the cache script), PERF_SC_MODE and PERF_SC_BASE_MODE (reuse, every, off, oldview, split), PERF_SC_DRAW
  (cap on drawn frames), PERF_STEPS (also picks cache steps), crops.py, diffstats.py, overlay_probe.py.

# Round 6 (branch wip/round6, from wip/static-cache 1bc4451)

Plan: the owner's `perf-round6-plan.md`. Harness numbers are SwiftShader on a shared machine and noisy (the same build varied by 20% from
run to run); speed claims below use alternating A/B runs (tools/perf/ab_cpu.py) and say so.

## Item 1: main thread

**1a. People off screen, lazily: not possible as described. Reported, not built.**
- The test that decides who is "off screen" (W5.1's `offScreen`) has to be conservative about height (people ride lifts and walk decks up to
  40 units up), so it only calls a person off screen when they are off to the side. In the max city that is 165 of 10,201 people at zoom 30,
  560 at zoom 15 and 977 at zoom 8. At the owner's views nearly everyone counts as on screen; there is almost nothing to skip. A tighter test
  would change who is stepped on which frame, and so when walks end and decisions are made: not exact against the previous commit.
- `checkBumps` runs over every walker in its safe stretch, seen or not, from the positions of the walkers and with the random stream
  (`pplRand`) for the outcome. Making unseen walkers lazy would change which pairs meet and in what order they draw random numbers. The plan
  names this case ("collision avoidance between unseen people") and says to keep that part as it is; it is the largest piece after the
  loop itself (2.5 to 2.8 ms of 10.8 here).
- Where the time goes in the max city at steady state (1,500 warm-up frames; this machine, about twice the M2's time; people 10,203,
  decisions already subtracted unless noted): the loop over everyone 5.3 ms, collision checks 2.5 to 2.8, decisions 1.5 (in the harness the
  clock is frozen inside a frame, so the 2.5 ms decision budget never trips; in the first minute everyone's wait has run out and 60 decisions
  a frame show up as 10 to 19 ms, which is a start-up burst, not steady state), bots, lurkers and clubs 0.3, the stall scan 0.3, lifts 0.2,
  removing the gone 0.2. (Timers are now in the overlay: "detail inside the laps above", people: ...)
- Done instead, all exact (arithmetic and order unchanged): the per-frame `pplList.some(p => p.gone)` scan became a counter; `offScreen` and
  `emit` evaluate the projection inline (the same arithmetic as Vector3.applyMatrix4, no vector per person); the stall key string is made
  once per spot; the collision pair loop does `bumpPair`'s first tests before the call; `route` (A*) keeps its working arrays between calls
  with a stamp instead of allocating and filling four network-sized arrays every call; `leisure` walks a list of the places that can draw
  anyone (rebuilt only when the places are) instead of every place. Measured with alternating runs, four rounds, steady state: people
  without decisions 9.76 against 9.71 ms (medians), minimum 8.20 against 8.41: no measurable change. The saving is real in the decision path
  (route and desire were 4.7 and 3.2 ms of the 9.6 start-up burst) but decisions are a small part of steady state.
- Verification: harness diff against 1bc4451, standard script, city, megas and dense, 53 captures, 0 pixel and 0 state differences; max city,
  noon, noon at 120 frames, night zoom in, night pan and the evening cycle (people's states after about 1,000 simulated frames), 5 captures,
  0 problems.

**1b. Vehicles, highways, metros, drones: not changed.** Measured (harness, steady state): metros 0.6 to 0.7 ms, highways 0.3 to 0.7,
conveyors 0.2 to 0.3, drones 0.1, steam 1.8 to 2.2, megastructure effects 1.4 to 1.7. The highway cars read each other every frame (gap to the
car ahead, clashes between cars off the deck) and spawn with random numbers; the metros run four passes over all people each frame for riders
and waiters; neither can be put on a "position is a function of time" footing without changing what the cars and trains do. The pieces that
could be trimmed exactly are each a few tenths of a millisecond; I left them. (The 3.6 ms on the M2 is more than this scene's 1.3 ms: the
owner's save has more highways or riders than the harness scene.)

**1c. Scene upkeep: what it is, and an exact fix.** `flushSolid` costs nothing when nothing changed; the cost is `scene.updateMatrixWorld()`,
which visits every object in the scene every frame: 13,312 objects (12,324 under the world group, 969 with matrixAutoUpdate on), 1.5 ms here
(about 2 ms on the M2). Everything under the world group is frozen (matrices set once) and walked for nothing. Frozen trees now compute their
matrices once and are skipped afterwards (`frozenUpdate`, world.js; overlay test "walk every matrix" restores the old walk). Measured with the
alternating A/B: the whole simulated frame is 1.8 to 2.1 ms shorter (medians 19.49 against 17.35, minimums 16.72 against 14.94). Same
verification as above, plus the cache script on the city (edits on and off screen, dusk, night, rain, day cycle) against 1bc4451 with the
cache on both sides.

## Round 6, items 2 to 12 (overnight; the full report with checks, crops and decisions is tools/perf/OVERNIGHT.md)

- Item 1 (people by on-screen size, 8d5d783): people lap, decisions out, max city, alternating A/B: zoom 30 7.16 to 5.32 ms (26% less), zoom 15 6.42 to 4.80 ms (25%); whole simulated frame 12.98 to 11.82 and 12.49 to 10.79 ms.
- Item 2 (ring cache, 40cc6b7): panning draws only the leading strip; no seams; residue as before. Item 3 (d44c52e): old-way frames use the view's own projection; "copy the cache by drawing" switch for the composite question.
- Item 4: memory, max city, 10 minutes of play: a7b4449 2,889 to 2,925 MB JS heap and 1,495 to 1,595 MB graphics; cache build 3,008 to 3,045 and 1,555 to 1,651. No growth after the first minutes; the 3 GB is the city's geometry (2.4 GB of typed arrays).
- Item 5: 17 to 18% of building triangles are already hidden from the camera (undersides, faces inside blocks); the flat-face rule would add 0.3 to 0.5% with tie pixels: not shipped.
- Item 6 (78966fe, 6297025): speed-based detail while turning: fast spin 26 to 52% fewer color-pass triangles, 47,817 px (5%) differ, slow turns and rest identical.
- Item 7 (305d348): an edit redraws a rectangle of the cache instead of the whole picture; 70/70 captures identical to whole redraws and to the previous commit.
- Item 8 (b94b439): wet reflections, mist and shafts at half resolution; with the test on, equal to the previous commit; flip: 4 to 17% of pixels differ by dither-sized amounts.
- Items 9, 10: custom shapes are 29.8% of the triangles put (rounded boxes 15%, cyl16 11.8%); flat detail on walls is 7 to 8% (under the 20% bar).
- Items 11, 12: main-thread spread and the collision pass's every-N-th-frame spike; zoom 60 table; the cache frame's live pass holds 1.16 million triangles at zoom 30.
- Item 13 (extra, 6ecac6e): the cache frame's live pass no longer draws objects only the margin band could show: max city zoom 30, 1024x576: 1,990 to 1,363 draw calls, 1.67 M to 1.28 M triangles; pictures identical (cache steps 70/70 and 12/12, standard script 0).
