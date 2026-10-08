# Perf harness

Proves a performance change leaves every pixel and every simulation decision exactly as it was, and times the frame.

```
python3 tools/perf/harness.py self                # the working tree against itself: must report 0 problems
python3 tools/perf/harness.py diff --base HEAD    # HEAD vs the working tree
python3 tools/perf/harness.py diff --quick --only city   # one viewport, one scene (about 3 minutes)
python3 tools/perf/harness.py diff --base A --ref B      # two commits (no working tree)
PERF_STEPS=noon_f1,night_zoom_out python3 tools/perf/harness.py diff --quick --only maxcity   # only these steps
python3 tools/perf/harness.py time --ref HEAD --frames 120
python3 tools/perf/harness.py scenes              # rebuild scenes/*.json from scene_defs.json
python3 tools/perf/maxcity_gen.py                 # rebuild scenes/maxcity.json (the biggest city: see below)
```

`maxcity` is the stress scene: the whole view at the furthest zoom filled with buildings of all four zones, two of each
megastructure, two metros and three highways (about 10,000 people). Its full script takes over an hour here, so run it
with `PERF_STEPS`.

On a machine with a real graphics card, `PERF_GPU=1` runs it in that machine's own Google Chrome (`pip install
playwright pillow numpy`; no browser download needed), in visible windows, many times quicker:

```
PERF_GPU=1 python3 tools/perf/harness.py diff --base main --ref wip/shadow-strips --quick --only city megas dense
PERF_GPU=1 PERF_STEPS=noon_f1,noon_f120,night_23h_rain,night_zoom_out python3 tools/perf/harness.py diff --base main --ref wip/shadow-strips --quick --only maxcity
```

Compare two builds on the same machine: a different graphics card can round a few pixels differently.

Needs Python Playwright with Chromium and PIL. three.js r128 is fetched once with `npm pack` into `.cache/` (gitignored).

## How it stays deterministic

`shim.js` runs before any game script:

- `Math.random` is a seeded mulberry32, and its calls are counted (the count is part of the state dump, so a change in
  how many random numbers are drawn is caught even when nothing visible moves yet).
- `performance.now` and `requestAnimationFrame` run on a scripted clock, 1/60 s a frame. Note: with the clock frozen
  inside a frame, the 2.5 ms decision budget in `updatePeople` never trips, so all 60 decisions run every frame.
- `fetch` is refused (no music), auto resolution is off, and the scene's save is preloaded into `localStorage`.

Frames between captures are simulated but not drawn (`page.js`): a skipped draw still updates world matrices like
three's `render` does, and a shadow-map redraw it would have done is done on the captured frame instead.

## What a diff compares

Each scene (`scenes/`) runs a fixed script (`steps()` in `harness.py`): noon, dusk, night with rain, zoom out and in, a
pan, every effect off and on again, dawn, morning rays, the scene's edits (a building added and removed), and a running
day cycle. At each step, on both builds, at 1280x720 and 1920x1080:

1. the canvas PNG, byte for byte (on a mismatch `out/` gets base, candidate and a diff mask);
2. a JSON dump of every mover and decision (`__perf.state` in `page.js`) plus the full save;
3. `renderer.info`: draw calls and triangles may only go down, geometry and texture counts must be equal.

## Timing

`time` draws every frame (with `gl.finish` after each pass, so GPU work is charged to the pass that queued it) and
prints mean and p95 milliseconds per update function and per render pass. SwiftShader is a CPU rasterizer: pass times
show relative cost, not what a real GPU spends. Results land in `out/timing_*.json`.
