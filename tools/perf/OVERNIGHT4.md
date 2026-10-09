# Overnight 4: the recipes round (in progress)

Base: main at 6da3dbf. Work branch locally `wip/recipes`, pushed with `git push origin wip/recipes:claude/beautiful-lovelace-oa42g9` (the session branch; the owner asked for pushes this way).

## Items

| Item | State | Commit | Check |
| --- | --- | --- | --- |
| 0 Baseline | done (numbers below) | this file | memcheck, counts only |
| 1 Recipe and proof | done | see git log ("Round 9 item 1") | `tools/perf/recipe_proof.py`: 0 plots differ on maxcity (2025), city (227), dense (361), megas (267), 30 pods each on city and maxcity; harness quick check city 25 captures 0 problems |
| 2 to 7 | not started | | |

## Item 0: baseline (main 6da3dbf, software renderer, counts only)

| scene | JS heap after load | graphics bytes after load | three.js geometries |
| --- | --- | --- | --- |
| maxcity | 2486 MB | 1635 MB (buffers 1426, textures 174, renderbuffers 35) | 1762 |
| city | 121 MB | 269 MB (buffers 60, textures 173, renderbuffers 35) | 180 |

Load time to first frame and the placement split are timings, so they come from the owner's machine (see the measurement script at the end, not yet written). The placement split of round 7 (OVERNIGHT3) is the reference until then.

## Item 1: the recipe (js/recipe.js) and its proof

A plot's recipe is `recipeOf(c)`: its own saved fields (`i j x z green style mega park sections below lift`), `dark` (isDarkPlot), `nb` (four bits: does the plot beside it exist), and `nbi` only for plots that need it (below). `recipeGen(r, world)` makes the plot from that alone, on a stand-in cell, in a `cells` map that holds only the plot and stand-ins for its neighbors. A stand-in throws if a builder reads a neighbor field it was not given, so a hidden read cannot pass silently.

Everything below was found by tracing and by the byte comparison, in that order (the comparison found two reads the trace missed).

Neighbor reads (all of them):
- `cells.has` at the four edge offsets (railings, lift pads, rim plants). Recipe: `nb`.
- `liftSupports` (pods on a scaffold): for each of the four sides, whether the neighbor is a megastructure, how many sections it has, its `height` and its pod's deck `lift.y`. This reads a neighbor's `height`, which is an output of that neighbor's own generation, so a pod must be generated after its neighbors (stageChain already does this). Recipe: `nbi`.
- `rooftopBoard` front test (the air-filter hologram, one tower in 30): the `height` of the three plots in front of each of the four faces, twelve plots with corners. Recipe: `nbi`, filled only when the plot is an air-filter pick (hash, or `AIR_FORCE`). Found by the comparison on maxcity (23 plots), not by the first trace, which had too few of them.

Own fields read before written (the recipe): `i j x z green style mega park sections below lift`, plus `dark`, which `rebuildCell` sets before generating and the builders read (found by the comparison: 4 maxcity plots on dark streets differed until the stand-in carried it). `sections` entries are not changed in place (checked).

Own fields written (what a worker sends back with the data): `topY height lifts sectionTops firstFloors vent walks liftCab liftRoof belowTop belowTops _topLot` (the stand-in's `_written` lists them per plot).

Globals read that change the output (found by changing each global in turn and remaking a sample of plots, `recipe_proof.py --reads`; the rest, all of `S.*`, `PH.tests.*` except the two below, `GREEN_DEFAULT`, `megas`, `airCells`, `WALL_FORCE`, `AIR_FORCE`, `AIR_PAIR`, changed nothing on the city sample):
- the highway and metro lines (`highways hwIndex metros mtIndex`, through hwAt, mtAt, hwFeet, mtFeet, hwKeepOut, mtKeepOut, lineKeepOut, hwCap). Handled by `recipeWorld()`: a plain-data copy of the lines and their indexes, swapped in while a plot is made. With it the plots under lines are identical (18 city plots differ with it removed, 0 with it).
- the far-order test switches `PH.tests.leanRound` and `PH.tests.thinSticks` (read in `collectGen` into `FAR_CFG`): a worker is told them.
- Not seen to change anything in these scenes but kept on the list for the worker: `megas` through `hwSurface` (only for highways over a megastructure plot).

Globals written during generation (fingerprint of every top-level name before and after, `--globals`): the builders' own buffers (`buckets emitters carPads curPorts glowList curSpots curCover`, the foliage lists, reset at the end of `collectGen`), `ALL_MATS` (materials created on first use, grows by a few: a worker needs the same material table and ids), `FLUID_PICK` (set at the start of each glass pipe run before any read, so nothing carries from one plot to the next), `airCells` (the stand-in is added or removed; recipeGen returns this as `_air` and takes the stand-in out again).
Math.random is used by `detailId` and `flickerId` (one call per piece): 10 to 2216 calls per plot, the same count live and from the recipe on every plot. A worker has to report its count so the main stream advances the same.

Result (seeded stream restarted before each plot, geometry attributes, indices, cut and far orders, plants, glows, emitters, pads, ports, spots, every written field, the air flag and the random count all compared as hashes):

| scene | plots | different |
| --- | --- | --- |
| maxcity | 2025 (388 megastructure plots, 1525 stacks, 112 empty) | 0 |
| city | 227 | 0 |
| dense | 361 | 0 |
| megas | 267 | 0 |
| pods, 30 hung on city | 30 | 0 |
| pods, 30 hung on maxcity (26 over a building) | 30 | 0 |

Negative controls: flipping a neighbor bit makes every plot differ (60 of 60); emptying the lines makes the 18 plots under them differ.

Decisions (each with why):
- The recipe holds the plot's own saved fields and not a hash of them, because a worker needs the values to build from.
- `nbi` only for pods and air-filter picks, because the other plots read no neighbor field (the stand-in throws otherwise), and a recipe should stay a few hundred bytes.
- The stand-in for the cell is a Proxy only while generating, to list what generation assigns, because the worker must send back exactly those fields and no others.
- Megastructures themselves (buildMega) are not recipes in this round: their plots are covered, the structures keep their own data, because their builders are a separate path and the plan's items name plots.
- The proof is a tool (`recipe_proof.py`) and not part of the quick check, since the quick check is the harness image comparison; the tool runs in 11 s on city, 130 s on maxcity.

## Not yet done

Items 2 to 7 and the final measurement script. Items listed as skipped will each get a sentence here.
