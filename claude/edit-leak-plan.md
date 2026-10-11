# Plan: building in a session slowly costs frames (the edit leak)

For: a Claude Code agent working in the NeonTerrarium repo (github.com/VibeLearner/NeonTerrarium).
Start from: `main` at f4d3e32 or later. Make a new branch, for example `wip/editleak`.
Background: `js/world.js` (staging, `rebuildCell`, `addSection`, `addPlatform`, `removeAt`, `startAnim` / `endAnim`, `rebuildSolidGen`, `solidRemoveOld`, the stand-in tier and its stash, `flushSuper` / `mergeLeaves`, `dropView`, `disposeData`, `disposeGroup`, `disposeMerged`, the glow overlays `ov*`), `js/staticcache.js` (`scFull`, the background jobs and their swap, `scEditRect`), `js/recipe.js` (PM: arrays let go and remade), `tools/perf/memcheck.py`, `tools/perf/edit_frames.py`.

## The problem

The owner's report: "the city is smooth, I build a little, frames drop, I close the tab and the new size is now fine and smooth." On her M2 at full Retina resolution (3420 x 1752) a small city sat at 36 FPS after a building session and crept up toward 50; a reload of the same city is smooth.

So something builds up while she edits that a fresh load of the same city doesn't have.

## What I measured (headless, city scene, 1280 x 720)

20 mixed edits (sections added, platforms added, a plot removed), a frame drawn after each, then saved; then the saved city loaded fresh in a new page:

| | after 20 edits | same city, fresh load |
|---|---:|---:|
| draw calls in a frame | 470 | 361 |
| geometries on the card (`renderer.info.memory.geometries`) | 378 | 205 |
| textures | 52 | 36 |
| texture memory (memcheck's count) | 158 MB | 122 MB |
| buffer memory | 88 MB | 68 MB |
| shader programs | 49 | 43 |

A second run with the static cache off and no frames drawn during the edits showed almost nothing (draws 408 against 384, the same textures). So the build-up comes from **frames drawn while editing with the static cache on**: sweeps, edit rectangles, background cache jobs, tier swaps, region re-merges.

Leads, not conclusions:
- WebGL objects created during the edits and still alive afterwards: about 600 buffers whose stack didn't reach game code (three's stacks are deeper than the default 10 frames: raise `Error.stackTraceLimit` before tracing); 80 to 100 buffers from the multi-draw path (`world.js` around line 223, inside `renderBufferDirect`); render targets from `scFull` (`staticcache.js` line 274 into `mrtBegin`), and about 22 MB more renderbuffer memory.
- Two ShaderMaterials drawn 8 times each on the scene root after the edits and not after a reload (material ids 719 and 721 in that run: find what they are).
- In one run, more toon meshes on the live layer (mask 1) and sprites after the edits than after the reload. In another run the live sets matched, so check this across several edit mixes.
- The GPU time of a frame on her machine is mostly full-screen passes (composite, bloom and grade, soft effects, clouds), which don't depend on the city. So the slowdown she sees may come from GPU memory pressure (memory not freed after edits) as much as from the extra draws. Measure both on her machine.

## The work

### 1. A repeatable reproduction (`tools/perf/editleak.py`)

- Load a scene, then do N edits of a fixed mix (add sections in every zone, add platforms, remove plots, cycle greenery, a megastructure placed and removed, a highway piece and a metro piece if they're unlocked), drawing frames as the real game does (let sweeps play, let staged builds and tier swaps run, let the static cache redraw and swap). Then save, and load the saved city fresh in a new page.
- Print, after load, every 25 edits, after the edits and after the fresh load:
  - draw calls and triangles in one frame, with the cache in use, and again with the cache off
  - `renderer.info.memory` and programs
  - memcheck's texture, buffer and renderbuffer bytes
  - the WebGL objects created since load and still alive, grouped by creation site (with a deep stack)
  - the objects in the scene by layer and material, and anything on the live layers that is static on the fresh load
  - the static cache's state, and the targets it holds.
- Run it at N = 100 and N = 300 to tell a one-time cost (it levels off) from a leak (it keeps growing).

### 2. Fix each leftover

For each difference between "after the edits" and "fresh load", find where it is made and why it isn't freed or moved back, and fix it there. Likely places: geometries of replaced views, stand-ins and stashed tiers, old region merges, glow overlay batches, sweep materials and lines, the static cache's background job targets after a swap, multi-draw index buffers, anything left on the live layers after a sweep or a tier swap, and objects added to the scene root during edits and never removed.

**Target:** after 300 edits, the city drawn after the edits matches a fresh load of the same city to within 2% on draw calls, geometries, textures, and texture and buffer memory. Anything kept on purpose (a reused pool, a second cache target for the background jobs) is listed and justified, and has a fixed size that doesn't grow with edits.

### 3. Prove it on her machine

`tools/perf/owner_editleak.js`, a script for the owner's Chrome thread, under 5 minutes:
- Measures FPS and frame time (F3 exact timing on) at zoom 30 for 15 seconds, still.
- Does 150 edits by script, at about 4 a second, letting the frames draw.
- Measures again for 15 seconds, then prints `renderer.info.memory`, draw calls and Chrome's `performance.memory` if it's there.
- Tells her to reload, then measures the same view again for 15 seconds after a reload.
- Run it on main and on the branch. Done when the branch's FPS after the edits is within 5% of its FPS after a reload.

### 4. A line in the overlay

Add one line to the F3 overlay: draws, geometries, textures, programs, and an estimate of GPU memory (memcheck's counters, kept cheap: count in the wrappers only while the overlay is open, or sum the targets' and buffers' sizes when the overlay asks). Then the owner can see build-up as it happens.

## Rules

- **No visible change.** Harness diff against the starting commit: 0 problems (quick set on city, dense and megas; maxcity on two steps). `recipe_proof.py --worker`: 0 differing plots. The edit-frame checks (`edit_frames.py`) show the same frames as before.
- **No new stutter:** freeing things must not add long frames while building. Free in small pieces across frames if needed.
- **Don't change the look, the resolution or the clouds.**

## Working speed

- The software renderer is slow: keep runs short while working (N = 30 on the city), and save the N = 300 runs for the end. Any single run over 10 minutes: make it smaller or run it in the background and check on it.
- No timing in the software renderer; counts and bytes are fine.

## Working rules

**When something doesn't work:** try another approach (up to three), ask your advisor, and if still stuck, note it and move on to the next leftover.

**Never:** merge into main or publish.

**Keep going:** commit and push after each fix that passes its checks. Bump the `?v=` tags in `index.html` in the last commit.

## Deliverables

1. The branch with the fixes and the overlay line.
2. `tools/perf/editleak.py` and `tools/perf/owner_editleak.js`.
3. `tools/perf/EDITLEAK.md`: each leftover found, its cause, the fix, and the numbers before and after (headless at N = 100 and 300).
