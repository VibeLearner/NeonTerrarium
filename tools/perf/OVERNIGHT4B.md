# Overnight 4B: items 3 and 6, the remaining parts (branch wip/recipes-b, from wip/recipes b0ae469)

## Items

| Item | State | Commit | Check |
| --- | --- | --- | --- |
| 3 Walking network, remaining parts | done (door search moved to the worker, door meshes and spots in steps, path searches stay: see item 3b) | Round 9 item 3b | strict network check per edit (stepped = one call = caches cleared, old = new) city 12 edits and maxcity 4 edits 0 differ; recipe_proof city and dense --worker 0 differ; harness city 25 captures 0 problems |

## Tool fixes

- `worker_edit.py`: the worker run now loads the city on the page (`__LOAD_MAIN`), because item 7 made a worker run load through the worker, so the two runs compared different cities (height sums 977 against 162, random calls 59983 against 10255). The wait for the worker polls on a timer (`polling=200`): under the harness shim `requestAnimationFrame` never fires, so the default wait never returned. Neither change touches what is compared. Baseline on b0ae469 with both: `worker_edit.py city --edits 12` 0 differ.

## Item 3b: the walking network, the parts the first pass left on the page

What was done (js/people.js only, new test `netOld`: "walking network: door searches and door meshes on the page in one call (as before)", `PH.tests.netOld` or `window.__NET_OLD`):
- The door search of a building plot (`plotDoor`: `findDoor` at two tolerances and `openEntry`, four sides) reads only the plot's own maps and where it stands. `findDoorG`, `doorAtG`, `openEntryG` take a map and a position; `doorTable` runs all twelve searches (4 sides, 3 passes, one way in 1.75) in the plot worker with the maps (`plotMaps` when `self.IN_RECIPE_WORKER`), as a 12 by 13 table of doubles that rides with the maps; `plotDoor` replays its three passes over the sides in its own order from the table (`doorFromTable`) and finds what it always found, because the search of one side does not read another. No line in recipe.js or recipeworker.js changed (the table rides in the grids object). Plots made on the page (fallback, megastructure cells, and the megastructures' doors with another way in of 1.8) search as before.
- `rebuildDoorMeshes` (every door of the city, one call, allocating about 7 matrices a door) became `doorMeshGen`: the same matrices made into spare arrays 150 doors a step (matrices reused, nothing allocated) and copied into the instance arrays in the step that commits the network, so the door meshes switch in the same frame as before. The values are bit-identical (same operations in the same order; hashed).
- `makeSpots` (a megastructure square's or a bench plot's standing spots) is a generator: a step every 24 spots, the two neighbor passes a step every 64 spots, and the crowding test ("is there a spot within .34 of this one") uses a grid of .34 squares instead of a walk over every earlier spot (same yes or no, so the same spots are kept; it was a quadratic loop in the biggest square of maxcity).
- The bench loop yields every 8 plots with spots.
- Extra steps are off under the perf harness (its steps are counted, so more steps would move when the people get the new network and every later random draw): `NETSPLIT()` is false there unless `window.__NET_SPLIT`, which `worker_edit.py` sets. With the test `netOld` on, the step structure is the old one exactly.

Not moved, and why (one line): the path searches stay on the page, because after one edit only a handful are redone (city: 4 searches, 2,828 heap pops; maxcity: 11 searches, 4,711 pops, the biggest 531 pops, well under a millisecond each), since every other plot's paths, crossings and doors come from the per-plot caches, so a worker would add a snapshot protocol (the neighbors' free maps for the crossing endpoints) to save almost nothing. Crossings stay for the same reason (3 and 4 searches).

Check (stricter than round 7's single end hash): `worker_edit.py` now hashes the network after every edit three ways (built in steps with `syncPeopleNetStep` and warm caches; in one call with warm caches; in one call after deleting every plot's `_pe`, `_pd`, `_cx`), plus the door meshes' instance arrays and every spot's key, approach, node and chat partners, and requires all three equal, and the run with generation on the page and the old network code (`__GEN_MAIN`, `__NET_OLD`) equal to the run with the worker and the new code (`__NET_SPLIT`) at every edit. City, 12 edits: 8 checks per run, 0 differ; maxcity, 4 edits: 3 checks per run (1,419 doors in the last), 0 differ. Door tables: `recipe_proof.js` compares the worker's table with the page's own search on the same maps byte for byte, and every table pick with a direct search (`recipe_proof.py city --worker` 0 of 227 plots differ, dense 0 of 361). Harness `diff --base b0ae469 --quick --only city`: 25 captures (pictures and people state) 0 problems.

The biggest single call, by counts (`net_steps.py`: one section added to a plot of maxcity, then the network built a step at a time; no timing, the software renderer's clock means nothing):

| | old way (`netOld`, one step each) | now |
| --- | --- | --- |
| most standing spots made in one step | 3,810 (2,458 approach searches over 17 by 17 cells, and a crowding test against every earlier spot) | 65 (48 approach searches) |
| door meshes made in the last step | 1,200 doors, about 8,400 matrix products and as many allocations | 150 doors, none allocated |
| most door-search samples in one step | 5,614 | 5,614 (8 searches: not split further) |
| most heap pops in one step | 531 | 531 |

So after items 2 and 3 the biggest single piece of the network is one door-search step (8 searches, 5,614 samples, each sample one small array: tens of microseconds) or a 150-door mesh chunk; neither is near 33 ms by counts. What is the biggest single call in a placement now is not in the walking network: it is one of the other upkeep stages of an edit (`rebuildConnections`, `syncAgentsA`, the steam map step, `syncPeopleRestStep`, none in my files) or the page's `stageTake` and region merge steps. `tools/perf/placement.py` on the owner's machine names it with its time.
