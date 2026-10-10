# Baked far buildings, helper A: the shell builder (item 2)

Branch `wip/baked-shell` (from `wip/baked`). Nothing outside these files was touched: no edit to `js/world.js`, `js/core.js`, `js/recipe.js`, `index.html` or any drawing code.

| file | what |
|---|---|
| `js/shell.js` | the builder. Pure functions, no THREE, no page globals: runs in the page, in a worker and in node. `Shell.build(parts, opts)`, `Shell.atlasParts`, `Shell.shadowCopy`, `Shell.atlasVisible` |
| `tools/perf/shell_probe.py` + `shell_probe.js` | builds plots of every kind through the game itself in the perf harness and prints the tables below |
| `tools/perf/shell_probe_node.js` | the voxel time, in node, on geometry the probe dumps (`--node`) |
| `tools/perf/shell_crops.py` + `shell_crops.js` | crops: real plot, shell and both overlaid, from two sides (second renderer, the game frame is not touched) |
| `tools/perf/baked/shell/*.png` | 32 crops (20 plots of the kinds and builders, 12 megastructures) |

Run (use `PERF_PORT=8933` or any free port when another check holds the harness's 8791):

```
python3 tools/perf/shell_probe.py city dense maxcity --node     # tables by plot kind, builder, megastructure; node timing
python3 tools/perf/shell_probe.py city --opts '{"keepDist":0.45}' --mega-boxes 1
python3 tools/perf/shell_crops.py dense --kinds low/1,pod,air --n 1
python3 tools/perf/shell_crops.py dense --builders glassHotel,spiralTower
python3 tools/perf/shell_crops.py maxcity --megas --opts '{"maxBoxes":24}'
```

## Headline numbers

326 plots over city, dense and maxcity (every kind, every builder that occurs, pods hung on plots, air-filter towers forced, platform/lawn/park variants of empty plots), default options (`vs` 0.2, `keepDist` 0.3, at most 12 boxes). Plots only, megastructures are separate below.

* **Boxes:** median 10, range 1 to 12 (284 of 326 plots have 4 to 12; the 42 with fewer are empty plots, which are one slab, and plain greenery).
* **Shell triangles:** 10 to 166 per plot (2 per visible face rectangle, bottoms and shared faces left out). Typical zone plot 90 to 130, pod 148.
* **Kept geometry (outside the shell by more than 0.3): median 9.3% of a plot's visible triangles, 90th percentile 22.7%.** Typical plot 300 to 2,000 triangles kept.
* **Phantom volume (the "never add volume" rule): 0.2% of box volume is open air** on average, worst plot 3.1% (see below for how it is measured). Snapping the faces to the real wall and roof planes shrinks the boxes by 12 to 15% of volume on net and moves a face outward by 0.22 at most.
* **Voxel time (node, one plot): 10 to 140 ms mean per kind, worst plot 390 ms (a pod); a megastructure 1.2 s mean, 3 s worst.**

Per plot kind (means per plot; real = visible triangles of the plot, kept = outside the shell by more than 0.3, stand = stand-in tier, x = textured, glow and shader geometry outside the atlas, which the shell does not cover and which stays as it is, baked = shell + kept + x):

```
kind          n  boxes  shell    real   kept  kept%  keptMd  cover | real+x stand+x baked+x
low/1        27   10.1    115    5670    639  11.3%    9.7%    83% |   5683    2986     767
low/2+       26   11.8    133   11203   2006  17.9%   18.4%    73% |  11216    5894    2152
mid/1        30    8.6     93    7263    506   7.0%    3.4%    89% |   7285    3576     621
mid/2+       48   10.3    106   10806   1041   9.6%    8.8%    81% |  10824    5367    1165
high/1       11    8.8     95    6603    638   9.7%    9.3%    83% |   7281    6352    1411
high/2+      22   11.2    118   11674   2042  17.5%   15.1%    72% |  12765   10315    3250
ind/1        36    8.0     87    3884    299   7.7%    7.8%    90% |   3963    2215     466
ind/2+       53   10.0    106    6806    658   9.7%    9.3%    83% |   6916    3635     874
air          18   11.4    121   12722   2096  16.5%   14.9%    77% |  12745    7477    2240
pod          13   12.0    148    9102    632   6.9%    6.7%    86% |   9155    4590     833
platform      9    1.4     16    1164    207  17.8%   30.7%    99% |   1171     507     231
lawn          9    1.4     16     720    217  30.1%   58.2%    99% |    764     267     278
park          9    1.4     16     795    278  35.0%   58.1%    99% |     840     574     339
plain-green  15    1.1     11     672     69  10.3%    6.8%   100% |    691     154      99
mega (all)   35   12.3    146   38591  16461  42.7%   31.8%    83% |  39427     836   17443
```

(`/1` one section, `/2+` a stack; kinds by the ground section's zone. `cover` is the share of the opened mass the boxes cover; the rest of the mass is thin or ragged mass that boxes of the 12-box budget leave out, its triangles are then kept or painted by the distance rule.)

So at the zone plots the baked total (shell + kept + x) is about 13% of the real triangles and about 25 to 35% of the stand-in tier, before the baker paints anything.

Per builder (ground section of single-section plots; from `shell_probe.py`, balcony = the builder called `balcony()`; only builders that occurred in the scenes appear). Highlights from dense (4 per builder): glassHotel 2.3% kept, stallMarket 1.0%, cornerMarket 2.8%, signShop 5.8%, brutalTower 4.6%, tiledShop 8.4%, glassTower 11.0%, buildTenement+balc 11.6% (the same builder without balconies did not occur in these scenes), spiralTower 15.5%, platformTower+balc 18.7%, shophouse+balc 17.4%, roundTower 21.6%, decoWorks 20.9%. Full tables are printed by the probe. Glass towers and market buildings are nearly all shell; the builders with balconies, round or twisting forms and ornamental ledges keep the most.

## What is on screen with the shell: crops

`tools/perf/baked/shell/`, three rows per plot (from two sides, 35 degrees down): real plot (grey) with the kept triangles orange and boxes as red wire; the shell as it would be drawn (boxes solid, kept triangles orange); the real plot faint with the boxes as translucent blue (a box poking out of the mass, or mass outside the boxes, shows here). The title line has the counts.

What the crops show:

* Stacked sections, setbacks, pods hanging on scaffolds, side bridges, rooftop plant rooms and the platform slab are all followed by boxes. A pod's scaffold legs are not mass (thin) and stay real geometry. Roof planes land on the roof (faces snapped).
* Orange (kept) is mostly: balcony slabs and ledges deeper than 0.3, awnings, rooftop tanks and gantries, antennas, chimneys, rails around the platform edge and park lamps on empty plots, big signs.
* Hard cases: `twistTower` and `roundTower` (rotating slabs and cylinders are only approximated by the largest box inside them: kept 35% on the one in dense), `spiralTower` and stacks with ornamental setbacks (`decoWorks`, 21%). `foodDeck` is an open stack of floors behind columns: the box fills it solid (cover 88%, phantom 2 to 3%); the real one has railings and glass in the gaps, and the baker paints that on the box faces.

## Method, and why

1. **Voxelize every triangle**, atlas order A + H + S (undersides and covered pieces too: an overhang's floor closes its volume; with only the visible triangles the outside flood got in from below and pods only survived because their deck has a top face). Surface voxels come from sampling each triangle at half a voxel. Everything below `groundY` (-0.7, the platform slab's bottom is at -0.655) is dropped. The lattice is global in x and z so neighbor plots line up.
2. **Mass = not outside.** The surface is grown by one voxel (seals gaps up to 0.4), the outside is flooded from the sides and the top (the ground below is not outside), and mass is everything not reached, less the outer ring the sealing added. Free-standing thin things stay thin. (A first version that took only voxels deep inside a sealed volume found almost no mass: 55% kept. Taking all non-outside voxels fixed it: 10% kept.)
3. **Opening in x and z** (default 1 voxel): railings, antennas, fences are not mass. It changes little (open 0 and 1 are the same, 2 is worse: 14% kept).
4. **Boxes: largest box that fits entirely in the mass left**, repeatedly (largest rectangle in a histogram per pair of layer runs, layers that look the same are one run, with pruning), until 12 boxes or what is left is under 0.4% of the mass or 0.06 units cubed. Disjoint boxes, so faces shared between them are exact. A box is thrown out when more than 30% of it is open air (see phantom).
5. **Snap**: each box face moves to the dominant real axis-aligned plane within 1.1 voxels (area weighted, by triangle area over the face), faces on one plane move together. The voxel grid is only 0.2 fine; snapped roofs and walls are what the baker projects from.
6. **Kept = any of a triangle's 7 points (corners, edge middles, center) farther than `keepDist` from every box.** Visible triangles only (A and S). Buried (inside the shell) and painted (within `keepDist` of a face) triangles are not counted as kept.
7. **Shell triangles**: five faces a box (bottom dropped: the camera is always above), the part of a face under another box's touching face cut away (rectangle subtraction), merged into rectangles; 2 triangles each.

### Decisions I took

* **Strict inside boxes** (a box never holds voxels that are not mass), then snapping. No tolerance growing of boxes.
* **`keepDist` 0.3 as given.** It is the biggest lever: all non-mega plots, kept share 0.3 -> 9.4%, 0.45 -> 2.7%, 0.6 -> 1.3%. If the baker can paint 0.45 deep without a visible change, kept almost disappears. `--opts '{"keepDist":0.45}'` shows it per kind.
* **Voxel 0.2** (task said 0.2 to 0.25): 0.25 costs about 40% less time and gives 11.2% kept instead of 9.4%, fewer boxes (7.8 against 8.4). Both are fine; 0.2 is the default.
* **Box budget 12.** More does not help much: 8 -> 13.2% kept, 16 -> 7.8%, 24 -> 7.5%; the stop is mostly the minimum volume. Pods and tenement stacks use all 12.
* **Phantom measure** (the check on "never add volume the building lacks"): the outside flooded again with the surface not sealed, minus everything within a voxel of a surface (facade relief and pinholes are not air); the share of box voxels that this reaches. 0.2% on average; the worst plot is 3.1% (a radio station, a foodDeck stack); the worst single box 20%. Without the "minus within a voxel" step the number was 4.4% on average, almost all of it recesses under 0.4 wide, which the baker paints. A box above 30% air is rejected (`maxPhantom`).
* **Atlas layout used as is**: `Shell.atlasParts(position, index, userData.cut)` returns the part: indices A + H + S for voxelizing, visible ranges A and S for counting. Kept triangle numbers are triangle numbers of the atlas index buffer itself (`t -> ix[3t..3t+2]`), so the lead can build the kept index list directly.

## What the lead needs to hook

* **Where to run it:** `Shell.build` is pure and fast enough for the plot worker: build the shell next to the plot and send `boxes` + the kept triangle numbers back with the plot message (`recipePack`). 10 to 140 ms for a plot (node), so it should be on the worker, not the page. A megastructure takes about 1 s.
* **Kept walls need their shadow copy.** The atlas index buffer has the first half of the wall slices again after S (D, for the shadow pass). `Shell.shadowCopy(cut, t)` gives the copy of a kept wall triangle (-1 if none; a far layout (`cut.far`, thin sticks lists) is not handled).
* **The input is `data.geo`'s ATLAS geometry only.** Geometry in other materials (map-textured decals, glow, shader pieces: `x` in the tables, 10 to 120 triangles per plot, 11,800 on the pagoda) is not voxelized and not in the kept count; it stays as it is. Foliage (`data.fol`) is instanced sprites, not triangles.
* **Snapped boxes sit within 1 voxel of real planes:** a box face is the real wall or roof plane where one covers 12% of the face or more, else the grid line (up to 0.2 off).

## What does not go through the same path

* **Megastructures do not go through `recipeGen` or the worker.** They are made by `collect()` in `js/mega.js` (`m.data`), have no stand-in tier, and would need the shell built from `m.data` on the page (the probe does that). Their cells' own plot data is empty (the mega lays its own ground).
* Megastructures are not box-shaped: with 12 boxes the kept share is 15 to 65% (greenhouse 15%, spire 21%, radio 30%, bathhouse 32%, square 32%, foundry 36%, pagoda 48%, club 58%, logistics 58%, market 65%). With one box per plot of footprint (`--mega-boxes 1`) logistics falls to 34% and market to 59%; the rest barely move: yards of containers, tanks, racks and stalls are objects bigger than 0.3. A megastructure is a landmark, one per several plots, and the better treatment is probably to leave it real (it is 1 to 2 plot-sized things in the city) or to shell only its building bulk; the shell builder cannot make them cheap on its own. At 24 boxes the crops are in `tools/perf/baked/shell/maxcity_mega-*`.
* Plain greenery plots, platforms, lawns, parks are one slab box (1 to 3 boxes); the slab's rim is part of the box, kept on them are the edge railings and park lamps (the dense scene's lawns 55 to 70%: a plot of 380 to 600 triangles of which most is a rail round the open edge and a lamp; the city scene's 3 to 30%).

## Timing (node, `--node`, after a warm-up run, ms per plot)

```
kind         n   mean    max   surface  fill  open  boxes  snap  keep   voxels(cells)
air          6   61.7   92.9      20.3   5.9   3.4   16.7   1.9  11.8   43k
ind/2+      16   90.6  332.4      31.5   6.5   2.4   22.5   4.8  15.7   27k
low/1        9   44.5   73.3      11.5   2.9   1.5   16.1   1.3  10.1   22k
low/2+       8  135.9  264.5      31.0   7.0   2.5   63.5   9.3  19.6   43k
mid/1        8   37.8   72.2      16.8   3.0   0.9    4.6   1.3   9.2   17k
mid/2+      12   52.1   91.5      18.3   4.5   1.8   11.7   1.8  12.2   32k
pod          6  141.3  387.7      56.9  12.6   3.8   23.7  14.7  25.9   46k
platform     3   24.5   34.5      10.3   5.6   2.0    5.2   0.2   0.8   42k
mega         4 1169.5 2991.2     218.5  69.0  27.4  692.3  42.5 110.2  578k
```

Surface (sampling the triangles) and box cutting dominate. These are single-thread JS in node on this machine, and counts only elsewhere: no frame was timed.

## Skipped, and why

* **Painting, baking, and the shell material** are not here (not mine): the shell gives boxes, faces and the kept list.
* **Balcony versus no balcony:** the builder row says `+balc` when `balcony()` was called while that section was made. `platformTower` and `podHouse` occurred both ways (kept share, one section: platformTower 13.3% without and 18.7% with balconies, podHouse 6.6% without and 7.2% with); `buildTenement` and `buildShophouse` came with balconies every time in these scenes (40 and 16 sections), so they have no without row. The other builders never call `balcony()`. The probe finds builders by watching `put` and `withStyle` (wrapped in the probe page only; draws unchanged).
* **No test of the Smooth (screen resolution) setting** or the baking of the shell's faces; that is the baker.
* **`Shell.build` on every plot of a city** is not run here (a maxcity is 2,000 plots); the probe takes an evenly spread sample (`--scan`). 326 plots, all kinds.
* **Roof-specific handling**: roofs come out with the same rule as walls (a box top snapped to the roof plane). Roof clutter over 0.3 stays real (kept) and under it is painted; there is no separate roof pass.
* **A twist or round tower stays poorly fitted** (an inscribed box). An idea not done: two or three rotated boxes, not axis-aligned (the task said axis-aligned).
