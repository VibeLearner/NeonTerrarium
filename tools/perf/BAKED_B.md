# Baked far buildings, helper B: bake scheduling and the cache (item 3's plumbing)

Branch `wip/baked-cache` (from `wip/baked`). Files: `js/bakejob.js` (new, the whole feature), `tools/perf/bake_probe.py` and `tools/perf/bake_probe.js` (the probe). No shared file was edited.

## What it does

`BAKE` (a global const, like `NV`) keeps one entry per plot: the plot's signature, its state and its bake.

- **Signature.** Made from the recipe alone (`c.data.rec.r` as text, without the random draws, the same choice `nvRecSig` makes), the material set (`MATREG.sig`), the bake format version (`BAKE.ver`), the texel-density tag (`BAKE.density`, a string the lead sets, for example `'720p-1.0'`), an optional baker tag (`BAKE.bakerTag`, set it when the real baker changes what it writes) and the scripts' `?v=` tag (as `NV.gen`). No vertex array is read, so plots whose arrays are let go cost nothing. Set `BAKE.drawsInSig = true` if the bake turns out to depend on the generation's random draws (they only pick detail and flicker ids of small pieces; if flicker ids decide which pieces are baked and which stay live, turn it on, but then a city loaded without recorded draws will not hit the cache).
- **States.** `new` (signature made) then a store read (`looking`) or `queued`, then `baking`, then `ready`; or `failed` (the baker threw: stays failed until the plot's signature changes).
- **Store.** IndexedDB `neonTerrariumBakes`: store `b` holds the bake (`{tex, meta, sig}`), store `m` holds `{bytes, t}`. At open only `m` is read (keys and sizes), so a plot whose key is not there makes no trip, and atlases are read on demand (they are big). Oldest entries are evicted over `BAKE.maxCacheBytes` (192 MB). Equal plots share one bake in memory (reference counted) and are baked once.
- **Scheduler.** `BAKE.tick(budgetMs)` once a frame: scans up to 60 cells (new plots, a changed recipe, removed plots; the scan counts against the budget), starts up to 4 store reads (nearest first), then bakes the queued plot nearest the view (`camT`, or `BAKE.view()`; a plot passed to `want()` goes first), stepping the baker until the budget is spent. At least one step runs per tick, so a baker's step must be small. Baking runs only while `BAKE.idle()` (no `SYNC_Q`, no `anims`, nothing in `solidDirty`, tab visible); store reads and queueing always run. With no argument the budget is `BAKE.autoBudget()`: 4 ms while frames are under 18 ms, 1.5 ms under 34 ms, 0.5 ms otherwise.
- **Rebake.** Detected by the scan: a plot whose `c.data.rec` object changed is compared by signature; same signature (made again to the same recipe) keeps its bake, a new one drops the old bake (`onDrop`) and queues the plot (a neighbor edit works the same way, because the game makes the neighbor again with a new recipe: the probe's removal check shows the four neighbors dropping). A plot that leaves `cells` (or becomes ineligible: no recipe, a megastructure, animating) drops its bake. The store keeps the old bake by signature (a plot put back the same way hits it).
- **Baker interface.** `BAKE.baker(c, ctx)` returns a result `{tex, meta}` (`tex` an ArrayBuffer, typed array, or object/array of them; `meta` plain data), or a generator that yields between faces and returns the result (stepped once per `next()`, dropped with `gen.return()` if the plot changed between steps), or a promise (waited for, one at a time). `ctx = {c, sig, density, ver, left()}`; `left()` is the milliseconds left in this frame's budget. `BAKE.placeholder` is the default: six faces of flat color (from a hash of the signature), 4 by 4 texels each, three maps (`albedo`, `nor`, `emis`), a generator that yields per face, reading no geometry. If the baker reads the plot's vertex arrays it triggers `pmDrop`'s make-again accessors (made again on the page at once); use `pmEnsure` first or bake from the recipe.

## API

| call | what |
| --- | --- |
| `BAKE.tick(budgetMs)` | once a frame, after the regions are merged (next to `nvTick()` in main.js) |
| `BAKE.want(c)` | register the plot now and bake it before the others; returns its state |
| `BAKE.get(c)` | the bake, or null (null while the plot's recipe has moved on; a changed recipe is noticed here at once) |
| `BAKE.state(c)` | `new`, `looking`, `queued`, `baking`, `ready`, `failed` or null |
| `BAKE.drop(c)` | drop the plot's bake (memory only; the store keeps it) |
| `BAKE.clearCache()` | empty the store and memory, queue every plot again |
| `BAKE.stats()`, `BAKE.line()` | counts (plots by state, hits, baked, edits, dropped, failed, ticks, max tick ms, memory and store bytes) |
| `BAKE.onReady(c, bake)`, `BAKE.onDrop(c, bake)` | callbacks: mark the block dirty (`scNoteBlock`, the shell merge) |
| `BAKE.skip(c)` | which plots are not baked (default: megastructures) |
| `BAKE.view()` | optional `() => {x, z}` to override the camera for ordering |
| `BAKE.drain(budget, n)`, `BAKE.flushed()` | for tools |
| `window.__BAKE_OFF`, `window.__BAKE_NODB` | switches (no work at all; no IndexedDB) |

## Hooks the lead must add (shared files, not touched)

1. `index.html`: `<script src="js/bakejob.js?v=...">` after `neverseen.js`, before `main.js`.
2. `js/main.js`: `BAKE.tick();` next to `nvTick();` (the budget argument is optional).
3. When the shell/atlas merge wants a plot's bake: `BAKE.get(c)`; when a block should swap from the stand-in to baked: `BAKE.onReady = (c) => ...mark the block` and `BAKE.onDrop` the other way (`scNoteBlock`). No hook is needed for edits or removals: the scan finds them (up to one scan cycle later; `BAKE.get(c)` finds an edit at once). If you want removal noticed in the same frame, call `BAKE.drop(c)` from `removePlatform`.
4. If the real baker needs the plot's geometry: ask `pmEnsure(c)` first and bake when it returns true.

## Decisions

- Scan-based, not event-based: no edit to world.js, and it cannot miss a path (rebuildCell, the worker, load). The cost is a cheap loop (identity compare per plot, 60 plots a tick).
- The bake is looked up before baking and read lazily: the atlases are large; only keys and sizes are held at open.
- The signature excludes the draws like the never-seen job (see the note above on `drawsInSig`).
- IndexedDB writes are batched into one transaction a timer tick (100 ms, idle callback); `BAKE.flushed()` says whether writes are still on their way, `pagehide` flushes (a page killed before they land loses them: those plots are baked again next session, which is harmless).
- Plots that were there at load are baked too (the never-seen job skips them): the bake is what the far view draws, so every plot needs one.

## Checks (`python3 tools/perf/bake_probe.py city`, harness clock; `--real` for the real clock)

Harness mode, city scene (171 baked plots after the megastructures and animating plots): every eligible plot ready; baked once per distinct signature; baked nearest first with no step back in distance; stored; no tick past a budget of 4 ms; reload (same browser context, same IndexedDB) bakes nothing, 171 of 171 from the store, byte for byte equal; an edit drops the old bake and bakes the new signature; a removal drops the plot's bake (and its neighbors' with their new recipes); `clearCache` empties the store and every plot is baked again; no page or console errors. All ok.

Real-clock mode (`--real`: no scripted clock, the game's own frame loop, the plot worker on, a 400 by 225 page because the software renderer draws every frame; the probe injects `bakejob.js` and hooks `nvTick`, test-only): all ok as well. The 171 plots bake in 9 ticks with the placeholder (61 plots in the busiest tick, 4.0 ms against a budget of 4); a costly baker (1 ms a face) is worked through at about 4 steps a tick with the worst tick at 4.7 ms; the reload loads all 171 from the store, byte for byte equal; the edit goes through the worker (the plot is made again, its recipe changes, the old bake is dropped, the new one baked); no page or console errors. Baking waited for the city to finish merging (`BAKE.idle()`), as intended. The first two ticks run cold code and are reported apart (`BAKE.coldMs`, 4 to 5 ms: signatures of the first 60 plots); the store writes are batched and made from a timer (`BAKE.flush()`, also on `pagehide`), never inside the frame's budget.

## Skipped / not done

- Budget accounting is wall-clock time of the tick; a baker whose single step is longer than the budget overruns by that step (the real GPU baker should yield per face or per slab).
- No eviction by recency of use (oldest write first), and no per-plot size cap.
- Neighbor edits that do not regenerate the neighbor (no new recipe) are not seen; if the game ever leaves such a plot stale, call `BAKE.drop(c)`.
- Not tested with the lead's real baker (not on this branch).
