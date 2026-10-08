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
