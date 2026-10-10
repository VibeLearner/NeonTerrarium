# Plan: baked far buildings (impostors for the zoomed-out view)

For: a Claude Code agent working in the NeonTerrarium repo (github.com/VibeLearner/NeonTerrarium).
Start from: `main` at b1ff117 (round 9 merged: recipes, the plot worker, plots' arrays let go, detail tiers with the render-menu setting). Make a new branch, for example `wip/baked`.
Background: `tools/perf/OVERNIGHT4.md` (round 9, including the fixes after review at the end), and the project docs `claude/recipes-round-plan.md` and `claude/perf-round7-plan.md`.

## Why

Zoomed out (past zoom 24), the city is drawn with stand-ins: each plot without its small pieces. Removing pieces is the wrong tool for the owner's standard. Lit windows lose their frames and read as bright bands, and every fix keeps more pieces, which eats the saving (the stand-in is now 55% of a plot's triangles).

The new idea: when a building is made, bake it into a few small textures on a simple shell of boxes the same size and height. Zoomed out, draw the shell with the baked textures. Zoomed back in, the real building comes back. Every frame, mullion and sill is kept as painted pixels, and a box face costs two triangles.

**The owner's standard:** at the zoom where the swap happens, flipping between real and baked must not show a visible change. She judges with flip tests and crops.

## The design

### 1. Bake the ingredients, not a picture

A baked finished picture would be frozen at one time of day, one sun direction and one look. Instead, bake per texel what the building shader needs, and light the shell live with the same lighting code as the buildings. Day to night, the sun's path, shadows, the looks system and the grade then all keep working.

Per texel, at least:
- **Albedo:** the vertex color.
- **Normal:** the surface normal of the piece seen at that texel (octahedral or 2-channel encoded), so the sun and sky light shade the painted balconies and frames correctly.
- **Emission:** the emissive color and kind (`aEm.rgb`, `aEm.a`: the light kinds, 1 to 6) and the window's switch-on threshold (`aOn`). The evening switch-on (`litOn(aOn, lightsOn, fTime)`) then still turns windows on one by one, and a switched-off window still shows as a dim room.
- **Depth inside the shell face** (optional, 8 bits): for a later parallax step, and for the outline pass if it needs it.

Pack these into as few textures as possible (WebGL2 multiple render targets when baking; for example two RGBA8 maps).

### 2. Flickering and blinking lights stay live

Don't exclude buildings with flickering lights: nearly every building has one. The game already draws flickering and blinking lights as a separate glow overlay (`ovRegister`, `ovFlush`, the overlay batches). Bake every flickering or blinking piece as its switched-off base color, and keep drawing it live through the overlay on top of the baked shell. Check that the overlay draws correctly against the shell's depth: overlay pieces in front of a shell face must not be hidden by it, and pieces fully inside the shell must not show through.

### 3. The shell: boxes that keep the silhouette

- Per plot, compute a small set of axis-aligned boxes (target 4 to 12) that follow the building's mass: the stacked sections, pods, towers and big rooftop structures. Suggested method: voxelize the plot's own geometry at about 0.2 to 0.25 units, then merge greedily into boxes. Keep a box only if it covers real mass; never add volume the building doesn't have.
- Anything outside the shell by more than a set distance (for example 0.3 units: a big overhang, a large sign, a skybridge) stays as real geometry, kept with the shell. Report how many triangles that keeps per plot.
- Small things sticking out less than that are painted onto the nearest face.
- **Roofs matter most.** The camera looks down at 12 to 82 degrees, so top faces are seen at every tilt and rooftop clutter is visible. Bake roof faces with the same care as walls.

### 4. Baking

- Bake on the GPU on the page (the worker has no WebGL; if `OffscreenCanvas` with WebGL2 works in a worker in Chrome, consider it later). For each shell face, render the plot's real geometry orthographically from outside that face into the face's region of an atlas, with depth limited to a slab from just outside the face to a set depth inside, so pieces inside the building and behind other faces aren't painted.
- **Texel density:** at least one texel per screen pixel at the swap zoom (`TIER.zs`, now 24) at the 720p render setting. Work it out from the camera's pixel size; report the number and the atlas memory per plot. At the "Smooth" (screen resolution) setting, either bake finer or keep stand-ins, and report the choice.
- **When:** right after a plot is made (placement and load), in idle frames with a time budget, the way the never-seen job schedules its work (`js/neverseen.js`), nearest the view first. Cache the bake by the plot's recipe signature in IndexedDB, as the never-seen job does, so a reload or the same plot again doesn't bake twice. Placing a building must not get slower: the plot appears with its real geometry; the bake follows.
- A plot changed by an edit or a neighbor rebakes. The old bake is dropped.

### 5. Drawing the shell

- One material for all shells: the building lighting (the toon ramp, sun, hemisphere light, shadow lookup, rim light, fog, mist) reading albedo, normal and emission from the atlas instead of vertex attributes. Reuse the building shader's chunks rather than writing a second lighting model, so the two can't drift apart.
- Shells are merged per block like the plots (`rebuildSolidGen`), one draw per block or per few blocks, with atlases per block or per super-block.
- **Shadows:** shells and their kept geometry cast into the shadow map. The fine self-shadowing of painted balconies is lost; check whether that's visible at zoom 24 to 30.
- The static cache: a block swapping between real and baked notes an edit rectangle (`scNoteBlock`), as tier swaps do now.

### 6. Swapping

- Zoomed out past the swap zoom, a block draws baked. Closer in, real. This takes over from the stand-in tier: reuse its machinery (`TIER.of`, `tierTick`, `tierMark`, the swap while the view moves, `TIER.rush`, the stash for instant flips, `noStand` handling), with 'baked' in place of 'stand'.
- Keep the stand-in as the fallback for a plot whose bake isn't ready yet.
- A plot's real geometry arrays can be let go while it's baked (as round 9 does), made again by the worker when it comes back into view: the existing `pmEnsure` path.
- **Setting:** "Baked far buildings" in the render menu next to "Detail tiers", remembered in this browser, switching at once like Detail tiers does now (stash the other merge for a minute after each switch).

## Items, in order

1. **Prototype on three building types:** a flat tower with window grids, one with balconies and frames, one with a big overhang or a rooftop pod. Bake, shell and shader working on just those, in a test page or behind a flag. **Crops for the owner** at zoom 24, 27 and 30, day, dusk and night, still and mid-turn: real against baked against the difference. **Stop and report after this item if baked versions are visibly different in ways the design can't fix.** The owner decides whether to go on.
2. The shell builder for every plot type, with the kept-geometry rule; triangle and texture counts per plot type.
3. Baking in idle frames with the IndexedDB cache; rebake on edits.
4. The shell material in the merged blocks, shadows, the glow overlay on top.
5. Swapping through the tier machinery, the setting in the render menu, the stand-in fallback.
6. **Measurements:** building triangles per frame and graphics memory at zoom 30 on the max city, real against stand-in against baked; bake time per plot; atlas memory. Plus a measurement script for the owner's Chrome thread, about 5 minutes: FPS at zoom 30 still and slow turn, memory, with each setting on and off.

## Working in parallel (use helper agents)

You are the lead. Use helper agents, each a subagent in its own git worktree (isolation: worktree), on its own branch, committing and pushing as it goes. You merge their branches into `wip/baked` when their checks pass. Give each helper this plan, its item, the files it owns, and the rules below.

**While you do item 1 (the prototype), start two helpers on work that doesn't depend on its outcome:**
- **Helper A, the shell builder (item 2),** on `wip/baked-shell`: voxelize and merge into boxes for every plot type, the kept-geometry rule, triangle counts per plot type. A new file (for example `js/shell.js`) plus a probe script; no changes to drawing.
- **Helper B, bake scheduling and the cache (item 3's plumbing),** on `wip/baked-cache`: idle-frame scheduling with a budget, nearest the view first, the IndexedDB store keyed by recipe signature, rebake on edits. Bake with a placeholder (a flat color per face) until your bake from item 1 is ready, then swap in yours. A new file (for example `js/bakejob.js`).

**After item 1, if it passes:** one helper on the shell material and the glow overlay on top (item 4), one on swapping and the render-menu setting (item 5), while you integrate and review. Item 6 (measurements) runs once everything is merged.

**If item 1 fails:** stop the helpers, keep their branches pushed but unmerged, and report.

**Rules for helpers:**
- Each helper owns its own files. Shared files (`js/world.js`, `js/core.js`, `js/recipe.js`, `index.html`) are changed only by you, the lead, or by one named helper at a time; say which in its instructions. Keep each helper's change to shared files small and well marked, so merges stay easy.
- Helpers follow the same rules, working speed and working rules as this plan, including the real-page test for anything that runs in the game.
- Each helper writes a short report (for example `tools/perf/BAKED_A.md`); you fold it into `BAKED.md`.
- Don't run several heavy harness checks at the same time on one machine: they slow each other down. Stagger them.

## Rules

- **The look:** at the swap zoom and beyond, baked must not look different from real in a flip test. Crops for every check, the owner approves. If something can't match (a silhouette, a shadow), say so with crops rather than hiding it.
- **Live things stay live:** flickering and blinking lights, the evening's window switch-on, time of day, weather, the sun's direction and the looks system (once the `wip/looks` branch is merged) must work on baked buildings exactly as on real ones.
- **No slower placing,** no new stalls: baking runs in idle frames with a budget.
- **The old ways stay behind settings or tests:** the stand-in tier, full detail everywhere.
- **Exactness where it applies:** with the setting off, the harness diff against b1ff117 is 0 problems.

## Working speed

- Quick checks on one scene while working; the full set (city, dense, megas, maxcity steps) once at the end.
- Any single check over 10 minutes: make it smaller.
- No timing in the software renderer; counts (triangles, bytes) are fine.
- Test the real page as well as the harness: load a city in a real-clock page with the worker on, switch the setting, zoom in and out, and check for errors. Round 9 passed the harness and still froze on the owner's machine.

## Working rules

**When something doesn't work:** try another approach (up to three), ask your advisor, and if still stuck, leave that part out, note why, and move on. The exception is item 1: if the prototype can't look right, stop there and report.

**Decide for yourself:** the shell method, texel density, texture packing, bake scheduling, atlas layout. List the main decisions in the notes.

**Never:** merge into main, publish, change what full-detail buildings look like, remove the stand-in tier or the setting, or let baking slow down placing.

**Keep going:** commit and push after each item that passes its checks. Bump the `?v=` tags in `index.html` in the last commit.

## Deliverables

1. The branch with baking, shells, the shell material, swapping and the setting.
2. `tools/perf/BAKED.md`:
   - what each item did
   - decisions made on your own
   - triangles, memory and bake-time numbers
   - what was skipped and why
   - the owner's measurement script
3. Crops in `tools/perf/baked/`: real, baked and difference at zoom 24, 27 and 30, day, dusk and night, still and mid-turn, for the three prototype types and for a wide view of the max city.
