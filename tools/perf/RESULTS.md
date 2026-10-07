# Frame-rate work: results (2026-10-07)

Every change below was checked with `harness.py diff`. The final check compares the build before any of this work
(tag `perf-base`) with the finished build: 106 captures (3 scenes, 2 screen sizes, noon to night, rain, zoom, pan,
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
