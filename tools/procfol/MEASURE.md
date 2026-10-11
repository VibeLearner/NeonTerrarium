# Foliage measurements (plan item 6, "measure first")

Counts only. Everything here comes from the harness's software renderer with the draw calls turned into no-ops (renderer.info counts a draw when three issues it, so the triangle counts are the same as with real drawing: checked on the city scene, identical to the digit). Nothing here is a time. The owner's own timing is `tools/procfol/owner_foliage.js` (see the end).

## BEFORE numbers: main 2709cbf

Current `wip/procfol` has no foliage change (only the plan and the inventory differ from 2709cbf), so these are the "before". Scenes are `tools/perf/scenes/{city,dense,maxcity}.json`, harness viewport 1280 x 720, scene camera (yaw 0.7, pitch 32 degrees, looking at the origin), zoom set to 8, 15 and 30 in turn. The game renders at a smaller size when zoomed out, so the render sizes differ by zoom: 640 x 360 at 8, 720 x 405 at 15, 1024 x 576 at 30; `LOD.plants` (what the vertex shader thins by) is 0 up to zoom 15 and 0.180 at zoom 30 with these sizes. On the owner's screen H differs, so her `LOD.plants` differs (the owner script prints it).

Commands (from the repo root; `PERF_PORT` keeps clear of other harness runs; each run is 10 to 60 seconds, the max city about a minute):

```
PERF_PORT=8934 python3 tools/procfol/measure_foliage.py city    --zooms 8 15 30 --tag before --ref 2709cbf
PERF_PORT=8934 python3 tools/procfol/measure_foliage.py dense   --zooms 8 15 30 --tag before --ref 2709cbf
PERF_PORT=8934 python3 tools/procfol/measure_foliage.py maxcity --zooms 8 15 30 --tag before --ref 2709cbf
PERF_PORT=8934 python3 tools/procfol/measure_foliage.py maxcity --lawns --zooms 8 15 30 --tag before_lawns --ref 2709cbf
# with the static cache left on (a still view: the cache plus what is drawn live), frames drawn first so the cache has built:
PERF_PORT=8934 python3 tools/procfol/measure_foliage.py maxcity --cache 400 --zooms 8 30 --tag before_cache --ref 2709cbf
PERF_PORT=8934 python3 tools/procfol/measure_foliage.py maxcity --cache 1500 --zooms 15 --tag before_cache_z15 --ref 2709cbf
python3 tools/procfol/measure_foliage.py --markdown tools/procfol/measure/maxcity.before.json   # the tables below, from the saved JSON
```

Files: `tools/procfol/measure/city.before.json`, `dense.before.json`, `maxcity.before.json`, `maxcity.before_lawns.json`, `city.before_cache.json`, `dense.before_cache.json`, `maxcity.before_cache.json`, `maxcity.before_cache_z15.json`, `city.before_cache_z30.json`. Each holds, per zoom: instances, in view, thinned, per kind, per family, per super-region, the frame's triangles shown and hidden; and once per scene the per-plot counts of every kind (`plots`) and of the grass plots (`grassPlots`).

How it counts. Instances: every InstancedMesh with the foliage shader in the scene (one per super-region: `r..` are plots, `c..` are bridges and walkways; 100 instances on the max city sit in meshes outside the super-regions, under `(not in a super-region)`), read from the `aRect` attribute, which names the kind (a quad is 2 triangles; a free-standing plant is two crossed instances). In view: the instance's world position and the diagonal of its quad against the real camera's frustum (a conservative sphere, so it errs toward counting more). Thinned: the vertex shader's rule from `FOL_SHADER`, `fract(phase * 5.17) < lodPlants * (width < 24 ? 0.85 : 0.5)`, replayed on the CPU with the zoom's real `LOD.plants` (lit signs are never thinned). A thinned instance is still counted in renderer.info (the shader moves it out of the clip volume), so "triangles" stays at 2 per instance and "thinned" says how many of them do no pixel work. Frame share: whole frames drawn with `PH.tests.noStatic = true`, the foliage meshes shown and then hidden (shown, hidden, shown, hidden, shown: the people and cars move, so a frame's count drifts a little); the foliage's drawn triangles are exactly 2 per instance (no culling, nothing skipped) and the difference of the hidden and shown frames agrees to within the drift (the two are in the JSON as `foliageTrisDrawn` and `foliageTrisByDifference`).

### Findings

1. **The plan's figure does not reproduce.** The plan says plants are about 1.97 million triangles, 28% of the frame, at zoom 30 on the max city with the static cache off. Measured on 2709cbf: the frame is 6.98 million triangles (so 28% of it would be 1.95 million, which is where the plan's pair of numbers fit together), but the plants are **95,550 instances = 191,100 triangles = 2.7% of that frame**. The plan's plant count is about 10 times too high. Over the three zooms (static cache off): **10.7% at zoom 8, 5.8% at zoom 15, 2.7% at zoom 30**, because the frame grows with the zoom and the plants do not. I cannot tell where 1.97 million came from. A city laid to lawn would be near it (the 1,637 plots that are not part of a megastructure x 772 grass instances x 2 triangles = 2.5 million), but the stock max city has only 112 empty plots (see the lawn run below).
2. **Where the cost is.** At zoom 30 (191,100 triangles): ferns and bushes 103,720 (54%; `succulent` alone 45,840), hanging greenery 47,892, laundry 16,100, signs 15,780 (signs are not foliage), ground cover 7,608, grass 0. No grass at all: the grass tufts exist only on plots laid to lawn (`green = 'grass'`), and none of the stock scenes has one.
3. **Nothing is culled now, so most of what is drawn is off screen.** All 95,550 instances are drawn at every zoom. In view: 3% at zoom 8 (3,236), 11% at zoom 15 (10,324), 45% at zoom 30 (42,621). The foliage meshes have `frustumCulled = false` (one per super-region, 4 x 4 regions of 5 x 5 plots), so a region's whole mesh is drawn whenever the page draws; the per-super-region table shows how unevenly the instances sit (the biggest region holds 35,610 of them, 22,111 in view at zoom 30).
4. **The vertex shader's thinning is small at zoom 30**: 12,373 instances thrown away of 95,550 (13%) at `LOD.plants` = 0.180, none at zoom 15 or 8. At the full LOD value (1.0), which only a much smaller screen would reach, it would throw away 71%. They are still counted in the frame's triangles.
5. **With the static cache on (a still view) the plants are a bigger share of what is drawn.** The cache holds the buildings, so a still frame is mostly the live things, and the plants are drawn live whole: **33.8% of the frame at zoom 8, 22.4% at zoom 15, 13.9% at zoom 30** on the max city (frames of 566 k, 854 k and 1.37 M triangles). This is the relevant share for the owner standing still, and it argues that plant triangles matter more than the 2.7% suggests, mostly when zoomed out (where almost nothing of them is in view). The cache's frames at a zoom change are unsettled for a while (the first try at zoom 15 with 400 frames was still redrawing: 22.4% is the 1,500-frame run; city zoom 30 likewise), so only runs whose "drawn" and "by difference" agree are quoted.
6. **Lawns.** Laying every empty plot of the max city to lawn (112 plots) adds 86,448 grass instances: **386 tufts a plot on average (377 to 395; the plan's 400 is the 20 x 20 grid less the places kept clear for blankets and seats), 772 instances = 1,544 triangles a plot**, and nothing but `gt0` (`gt1` to `gt9` are in the sprite table but nothing places them: `world.js` and `mega.js` use `gt0` only). The foliage becomes 181,972 instances = 363,944 triangles = **5.1% of the frame at zoom 30, 10.5% at zoom 15, 18.6% at zoom 8** (static cache off). Grass is the main cost of a lawn-heavy city: a lawn plot costs about 1,550 plant triangles (775 instances with its bushes) against a mean of 91 for a plot of the max city.
7. **Per plot.** The 2,095 cells that carry any plant instance (the plots plus bridge and walkway pieces, grouped by rounding each instance's position to the nearest plot) hold a median of 19 and a mean of 45.6 instances (about 91 triangles), at most 391 (table at the end of the max city section). The heaviest kinds are `succulent` (958 plots, median 12 a plot), `bush`, `fern`, `h_ivy`, `vines`, `pothos`.

## Owner script

`tools/procfol/owner_foliage.js`: paste into the console of her Chrome with the city open (about 3 minutes, tab in front, F3 closed). For 4 settings (old or new sprites x foliage LOD off or on), at zoom 30 standing still and in a slow turn: frames a second and worst frame over 10 s with no overlay (requestAnimationFrame counts), then the plants' pass time with F3 "exact timing". The plants have no pass of their own: they are drawn inside the `color` pass (`main.js`, the instanced mesh is on layer 2 and `cam.layers.enableAll()` draws it with the buildings), so the script reads the color pass's exact time with the plant meshes shown and hidden over 4 seconds each, and the plants' time is the difference (a pass with "plant" in its name is also read if one is ever added). `PH.tests.oldSprites` and `PH.tests.foliageLodOff` are read and set by those names; a setting whose switch is missing is skipped with a note; zoom, turn, overlay and switches are put back. It prints a `console.table` and returns the rows (also `window.__ownerFoliageRows`). Tested only for running without errors in the harness page (clock and draws stubbed, so every time it printed was 0 and the frame rate a stub 60: the harness cannot time anything): it ran 8 rows with both switches present and 2 rows with neither, and restored the zoom, the yaw, the overlay and the switch values. It has not run on a graphics card.

Notes for the lead: `PH.setExact(false)` (also reached by closing F3) switches every `PH.tests` entry off, so the script sets the two switches at the start of each round, after the overlay is closed, and refuses to start if F3 is open or another overlay test is on. If the old/new sprite switch needs the atlas rebuilt, the script waits 1.5 s after setting it (`settleMs`); if it takes longer, say so and raise `settleMs` in `window.__OWNER_OPTS`.

## Tables

### Max city, static cache off (the full set)

#### maxcity (before), settled with 95550 plant instances

Per family, all zoom levels (instances; a quad is 2 triangles; "in view" counts an instance whose quad touches the camera frustum):

| zoom | family | instances | triangles | in view | in view % | thinned by LOD | kinds |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | ground cover | 3804 | 7608 | 190 | 5% | 0 | 7 |
| 8 | ferns and bushes | 51860 | 103720 | 1736 | 3% | 0 | 8 |
| 8 | hanging greenery | 23946 | 47892 | 899 | 4% | 0 | 10 |
| 8 | laundry | 8050 | 16100 | 216 | 3% | 0 | 12 |
| 8 | signs (not foliage) | 7890 | 15780 | 195 | 2% | 0 | 207 |
| 8 | **all** | 95550 | 191100 | 3236 | 3% | 0 | |
| 8 | **foliage only (no signs)** | 87660 | 175320 | | | | |
| 15 | ground cover | 3804 | 7608 | 374 | 10% | 0 | 7 |
| 15 | ferns and bushes | 51860 | 103720 | 5646 | 11% | 0 | 8 |
| 15 | hanging greenery | 23946 | 47892 | 2733 | 11% | 0 | 10 |
| 15 | laundry | 8050 | 16100 | 780 | 10% | 0 | 12 |
| 15 | signs (not foliage) | 7890 | 15780 | 791 | 10% | 0 | 207 |
| 15 | **all** | 95550 | 191100 | 10324 | 11% | 0 | |
| 15 | **foliage only (no signs)** | 87660 | 175320 | | | | |
| 30 | ground cover | 3804 | 7608 | 1466 | 39% | 538 | 7 |
| 30 | ferns and bushes | 51860 | 103720 | 22842 | 44% | 7802 | 8 |
| 30 | hanging greenery | 23946 | 47892 | 10939 | 46% | 2798 | 10 |
| 30 | laundry | 8050 | 16100 | 3889 | 48% | 1233 | 12 |
| 30 | signs (not foliage) | 7890 | 15780 | 3485 | 44% | 2 | 207 |
| 30 | **all** | 95550 | 191100 | 42621 | 45% | 12373 | |
| 30 | **foliage only (no signs)** | 87660 | 175320 | | | | |

Per zoom: render size, LOD.plants value (what the vertex shader thins by), and the frame:

| zoom | render | LOD.plants | frame triangles | without foliage layer | foliage drawn (triangles) | share of frame | in view and not thinned (instances) |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | 640x360 | 0.000 | 1788710 | 1597610 | 191100 | 10.7% | 3236 |
| 15 | 720x405 | 0.000 | 3293401 | 3102299 | 191100 | 5.8% | 10324 |
| 30 | 1024x576 | 0.180 | 6979906 | 6788804 | 191100 | 2.7% | 37026 |

Thinning (lodPlants) for other LOD values, at any zoom (instances thrown away of 95550; signs are never thinned):

| LOD.plants | 0.25 | 0.5 | 0.75 | 1 |
|---|---:|---:|---:|---:|
| thinned | 17283 (18%) | 34203 (36%) | 51304 (54%) | 67942 (71%) |

Per kind at zoom 30 (instances, in view, thinned at this zoom's LOD):

| kind | family | instances | triangles | in view | thinned |
|---|---|---:|---:|---:|---:|
| succulent | ferns and bushes | 22920 | 45840 | 10234 | 3546 |
| bush | ferns and bushes | 9706 | 19412 | 4220 | 1514 |
| fern | ferns and bushes | 8518 | 17036 | 3874 | 1330 |
| h_ivy | hanging greenery | 3419 | 6838 | 1590 | 307 |
| vines | hanging greenery | 3364 | 6728 | 1602 | 531 |
| pothos | hanging greenery | 3146 | 6292 | 1395 | 489 |
| bushFlower | ferns and bushes | 3130 | 6260 | 1308 | 462 |
| h_vine3 | hanging greenery | 3054 | 6108 | 1409 | 480 |
| bonsai | ferns and bushes | 3006 | 6012 | 1324 | 434 |
| g_fern2 | ferns and bushes | 2668 | 5336 | 1164 | 242 |
| h_curtain1 | hanging greenery | 2170 | 4340 | 954 | 189 |
| h_curtain2 | hanging greenery | 2136 | 4272 | 946 | 194 |
| h_curtain3 | hanging greenery | 2128 | 4256 | 933 | 195 |
| h_heart | hanging greenery | 2124 | 4248 | 1009 | 196 |
| moss | ground cover | 2042 | 4084 | 888 | 368 |
| g_spread1 | ground cover | 1342 | 2684 | 572 | 146 |
| w_tangle | hanging greenery | 1296 | 2592 | 573 | 127 |
| bamboo | ferns and bushes | 1128 | 2256 | 394 | 186 |
| l_mossroots | hanging greenery | 1109 | 2218 | 528 | 90 |
| g_fern3 | ferns and bushes | 784 | 1568 | 324 | 88 |
| l_towel_green | laundry | 720 | 1440 | 345 | 107 |
| l_tee_sage | laundry | 705 | 1410 | 342 | 98 |
| l_socks | laundry | 680 | 1360 | 326 | 103 |
| l_tee_lilac | laundry | 676 | 1352 | 330 | 121 |
| l_jeans | laundry | 675 | 1350 | 319 | 125 |
| l_tee_butter | laundry | 675 | 1350 | 318 | 93 |
| l_shirt_pink | laundry | 673 | 1346 | 315 | 89 |
| l_shirt_blue | laundry | 671 | 1342 | 349 | 93 |
| l_tee_rose | laundry | 664 | 1328 | 338 | 105 |
| l_tee_blue | laundry | 654 | 1308 | 324 | 108 |
| l_tee_peach | laundry | 631 | 1262 | 298 | 100 |
| l_towel_cream | laundry | 626 | 1252 | 285 | 91 |
| sign_c_noodles | signs (not foliage) | 187 | 374 | 69 | 0 |
| glyph_v7 | signs (not foliage) | 170 | 340 | 77 | 0 |
| glyph_v2 | signs (not foliage) | 168 | 336 | 74 | 0 |
| glyph_v0 | signs (not foliage) | 166 | 332 | 76 | 0 |
| glyph_v8 | signs (not foliage) | 162 | 324 | 69 | 0 |
| glyph_v1 | signs (not foliage) | 160 | 320 | 74 | 0 |
| glyph_v4 | signs (not foliage) | 156 | 312 | 71 | 0 |
| sign_c_open | signs (not foliage) | 154 | 308 | 68 | 0 |
| glyph_v13 | signs (not foliage) | 151 | 302 | 61 | 0 |
| glyph_v9 | signs (not foliage) | 151 | 302 | 73 | 0 |
| glyph_v3 | signs (not foliage) | 147 | 294 | 66 | 0 |
| sign_c_ramen | signs (not foliage) | 147 | 294 | 59 | 0 |
| sign_c_sushi | signs (not foliage) | 147 | 294 | 52 | 0 |
| glyph_v11 | signs (not foliage) | 146 | 292 | 61 | 0 |
| glyph_v10 | signs (not foliage) | 140 | 280 | 59 | 0 |
| glyph_v6 | signs (not foliage) | 135 | 270 | 57 | 0 |
| glyph_v5 | signs (not foliage) | 132 | 264 | 55 | 0 |
| glyph_v12 | signs (not foliage) | 127 | 254 | 53 | 0 |
| sign_w_repairs | signs (not foliage) | 123 | 246 | 48 | 0 |
| sign_c_cramen | signs (not foliage) | 119 | 238 | 47 | 0 |
| g_cover | ground cover | 112 | 224 | 0 | 2 |
| sign_w_parts | signs (not foliage) | 111 | 222 | 44 | 0 |
| glyph_h13 | signs (not foliage) | 109 | 218 | 55 | 0 |
| sign_coffee_amber | signs (not foliage) | 104 | 208 | 34 | 0 |
| glyph_h1 | signs (not foliage) | 103 | 206 | 44 | 0 |
| glyph_h10 | signs (not foliage) | 101 | 202 | 45 | 0 |
| glyph_h11 | signs (not foliage) | 99 | 198 | 42 | 0 |
| glyph_h12 | signs (not foliage) | 99 | 198 | 52 | 0 |
| glyph_h7 | signs (not foliage) | 97 | 194 | 45 | 0 |
| glyph_h8 | signs (not foliage) | 94 | 188 | 41 | 0 |
| g_clover | ground cover | 92 | 184 | 0 | 6 |
| sign_cocktail_amber | signs (not foliage) | 91 | 182 | 32 | 0 |
| glyph_h2 | signs (not foliage) | 90 | 180 | 47 | 0 |
| sign_c_pawn | signs (not foliage) | 90 | 180 | 32 | 0 |
| sign_c_tea | signs (not foliage) | 89 | 178 | 33 | 0 |
| sign_music_amber | signs (not foliage) | 88 | 176 | 43 | 0 |
| glyph_h5 | signs (not foliage) | 85 | 170 | 39 | 0 |
| glyph_h4 | signs (not foliage) | 84 | 168 | 40 | 0 |
| sign_c_techparts | signs (not foliage) | 84 | 168 | 26 | 0 |
| sign_w_scrap | signs (not foliage) | 83 | 166 | 46 | 0 |
| g_moss2 | ground cover | 82 | 164 | 0 | 6 |
| sign_noodles_amber | signs (not foliage) | 82 | 164 | 31 | 0 |
| sign_hotel_amber | signs (not foliage) | 81 | 162 | 37 | 0 |
| g_spread2 | ground cover | 80 | 160 | 0 | 6 |
| glyph_h3 | signs (not foliage) | 80 | 160 | 33 | 0 |
| glyph_h9 | signs (not foliage) | 79 | 158 | 47 | 0 |
| glyph_h6 | signs (not foliage) | 78 | 156 | 31 | 0 |
| glyph_h0 | signs (not foliage) | 77 | 154 | 35 | 0 |
| sign_repair_amber | signs (not foliage) | 76 | 152 | 38 | 0 |
| sign_c_mods | signs (not foliage) | 68 | 136 | 20 | 0 |
| sign_c_noodlebar | signs (not foliage) | 68 | 136 | 25 | 0 |
| sign_c_prints | signs (not foliage) | 66 | 132 | 32 | 0 |
| sign_mt_line | signs (not foliage) | 64 | 128 | 39 | 0 |
| sign_c_hotel | signs (not foliage) | 62 | 124 | 32 | 0 |
| sign_c_gear | signs (not foliage) | 56 | 112 | 18 | 0 |
| sign_w_24h | signs (not foliage) | 56 | 112 | 24 | 0 |
| g_flowers | ground cover | 54 | 108 | 6 | 4 |
| sign_w_gear | signs (not foliage) | 54 | 108 | 24 | 0 |
| sign_music_pink | signs (not foliage) | 53 | 106 | 21 | 0 |
| sign_w_ramen | signs (not foliage) | 51 | 102 | 28 | 0 |
| sign_plant_pink | signs (not foliage) | 49 | 98 | 20 | 0 |
| sign_ramen_amber | signs (not foliage) | 49 | 98 | 22 | 0 |
| sign_clinic_amber | signs (not foliage) | 46 | 92 | 19 | 0 |
| sign_laundry_cyan | signs (not foliage) | 45 | 90 | 24 | 0 |
| sign_ramen_pink | signs (not foliage) | 44 | 88 | 21 | 0 |
| sign_bakery_amber | signs (not foliage) | 42 | 84 | 23 | 0 |
| sign_noodles_cyan | signs (not foliage) | 42 | 84 | 18 | 0 |
| sign_w_barber | signs (not foliage) | 41 | 82 | 20 | 0 |
| sign_ramen_cyan | signs (not foliage) | 40 | 80 | 21 | 0 |
| sign_laundry_amber | signs (not foliage) | 39 | 78 | 18 | 0 |
| sign_noodles_pink | signs (not foliage) | 39 | 78 | 13 | 0 |
| sign_w_meds | signs (not foliage) | 39 | 78 | 20 | 0 |
| sign_repair_cyan | signs (not foliage) | 38 | 76 | 19 | 0 |
| sign_w_stitch | signs (not foliage) | 38 | 76 | 18 | 0 |
| sign_books_amber | signs (not foliage) | 37 | 74 | 18 | 0 |
| sign_plant_amber | signs (not foliage) | 36 | 72 | 17 | 0 |
| sign_plant_cyan | signs (not foliage) | 36 | 72 | 15 | 0 |
| sign_bakery_cyan | signs (not foliage) | 34 | 68 | 20 | 0 |
| sign_cocktail_pink | signs (not foliage) | 34 | 68 | 22 | 0 |
| sign_ng_11 | signs (not foliage) | 34 | 68 | 17 | 0 |
| sign_c_records | signs (not foliage) | 32 | 64 | 19 | 0 |
| sign_laundry_pink | signs (not foliage) | 32 | 64 | 14 | 0 |
| sign_w_tea | signs (not foliage) | 32 | 64 | 15 | 0 |
| sign_bakery_pink | signs (not foliage) | 31 | 62 | 18 | 0 |
| sign_cocktail_cyan | signs (not foliage) | 31 | 62 | 17 | 0 |
| sign_hotel_pink | signs (not foliage) | 31 | 62 | 18 | 0 |
| sign_repair_pink | signs (not foliage) | 31 | 62 | 14 | 0 |
| sign_w_fixit | signs (not foliage) | 31 | 62 | 18 | 0 |
| sign_ng_12 | signs (not foliage) | 30 | 60 | 14 | 0 |
| sign_ng_16 | signs (not foliage) | 30 | 60 | 9 | 0 |
| sign_w_herbs | signs (not foliage) | 30 | 60 | 17 | 0 |
| sign_ng_0 | signs (not foliage) | 29 | 58 | 13 | 0 |
| sign_ng_7 | signs (not foliage) | 29 | 58 | 12 | 0 |
| sign_w_lube | signs (not foliage) | 29 | 58 | 14 | 0 |
| sign_music_cyan | signs (not foliage) | 28 | 56 | 7 | 0 |
| sign_ng_10 | signs (not foliage) | 28 | 56 | 12 | 0 |
| sign_hotel_cyan | signs (not foliage) | 26 | 52 | 15 | 0 |
| sign_ng_13 | signs (not foliage) | 26 | 52 | 10 | 0 |
| sign_ng_5 | signs (not foliage) | 26 | 52 | 13 | 0 |
| sign_c_baropen | signs (not foliage) | 25 | 50 | 11 | 0 |
| sign_ng_14 | signs (not foliage) | 25 | 50 | 11 | 0 |
| sign_mt_station | signs (not foliage) | 24 | 48 | 8 | 0 |
| sign_ng_3 | signs (not foliage) | 24 | 48 | 12 | 0 |
| sign_c_dataloan | signs (not foliage) | 23 | 46 | 9 | 0 |
| sign_ng_1 | signs (not foliage) | 23 | 46 | 11 | 0 |
| sign_ng_4 | signs (not foliage) | 23 | 46 | 7 | 0 |
| sign_c_drones | signs (not foliage) | 22 | 44 | 7 | 0 |
| sign_w_hot | signs (not foliage) | 22 | 44 | 12 | 0 |
| sign_w_noodlesP | signs (not foliage) | 22 | 44 | 12 | 0 |
| sign_ng_15 | signs (not foliage) | 21 | 42 | 11 | 0 |
| sign_ng_6 | signs (not foliage) | 21 | 42 | 8 | 0 |
| sign_ng_2 | signs (not foliage) | 18 | 36 | 4 | 0 |
| sign_c_dome | signs (not foliage) | 17 | 34 | 7 | 0 |
| sign_w_import | signs (not foliage) | 16 | 32 | 8 | 0 |
| sign_c_techmods | signs (not foliage) | 15 | 30 | 9 | 0 |
| sign_c_pawntech | signs (not foliage) | 14 | 28 | 12 | 0 |
| sign_c_robot | signs (not foliage) | 14 | 28 | 8 | 0 |
| sign_w_frag | signs (not foliage) | 12 | 24 | 6 | 0 |
| sign_w_kib | signs (not foliage) | 12 | 24 | 6 | 0 |
| sign_records_pink | signs (not foliage) | 11 | 22 | 1 | 0 |
| sign_w_noodles | signs (not foliage) | 11 | 22 | 2 | 0 |
| sign_c_nexus | signs (not foliage) | 9 | 18 | 3 | 0 |
| sign_mkt13 | signs (not foliage) | 8 | 16 | 3 | 0 |
| sign_mkt5 | signs (not foliage) | 8 | 16 | 3 | 0 |
| sign_w_cargo | signs (not foliage) | 8 | 16 | 4 | 0 |
| sign_arcade_pink | signs (not foliage) | 6 | 12 | 3 | 0 |
| sign_books_pink | signs (not foliage) | 6 | 12 | 1 | 0 |
| sign_hw_arrivals | signs (not foliage) | 6 | 12 | 2 | 0 |
| sign_ng_17 | signs (not foliage) | 6 | 12 | 4 | 0 |
| graf_0 | signs (not foliage) | 5 | 10 | 4 | 0 |
| graf_2 | signs (not foliage) | 5 | 10 | 1 | 0 |
| sign_c_arakawa | signs (not foliage) | 5 | 10 | 1 | 0 |
| sign_c_arcology | signs (not foliage) | 5 | 10 | 3 | 0 |
| sign_c_hab | signs (not foliage) | 5 | 10 | 3 | 0 |
| sign_clinic_pink | signs (not foliage) | 5 | 10 | 3 | 0 |
| sign_mkt1 | signs (not foliage) | 5 | 10 | 1 | 0 |
| sign_ng_8 | signs (not foliage) | 5 | 10 | 3 | 0 |
| sign_games_pink | signs (not foliage) | 4 | 8 | 0 | 0 |
| sign_mkt15 | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_onair | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_police | signs (not foliage) | 4 | 8 | 3 | 0 |
| sign_w_heavy | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_w_kibou | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_w_megahub | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_w_mw | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_w_onsen | signs (not foliage) | 4 | 8 | 4 | 0 |
| sign_w_satcom | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_w_sortout | signs (not foliage) | 4 | 8 | 2 | 0 |
| sign_w_steam | signs (not foliage) | 4 | 8 | 4 | 0 |
| graf_4 | signs (not foliage) | 3 | 6 | 2 | 1 |
| graf_5 | signs (not foliage) | 3 | 6 | 1 | 0 |
| graf_6 | signs (not foliage) | 3 | 6 | 3 | 0 |
| sign_arcade_amber | signs (not foliage) | 3 | 6 | 0 | 0 |
| sign_c_block | signs (not foliage) | 3 | 6 | 2 | 0 |
| sign_games_amber | signs (not foliage) | 3 | 6 | 0 | 0 |
| sign_hw_entry | signs (not foliage) | 3 | 6 | 0 | 0 |
| sign_hw_toll | signs (not foliage) | 3 | 6 | 0 | 0 |
| sign_mkt0 | signs (not foliage) | 3 | 6 | 0 | 0 |
| sign_mkt14 | signs (not foliage) | 3 | 6 | 1 | 0 |
| sign_mkt7 | signs (not foliage) | 3 | 6 | 3 | 0 |
| sign_arcade_cyan | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_books_cyan | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_coffee_cyan | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_coffee_pink | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_mall | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_mkt12 | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_mkt16 | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_mkt17 | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_mkt4 | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_mkt9 | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_mktroof | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_policetext | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_records_amber | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_agri | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_archive | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_w_bar | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_baths | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_w_bay | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_club | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_coldstore | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_w_dataspire | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_w_distro | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_drinks | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_dronecharge | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_dronestore | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_enter | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_export | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_farm24 | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_fragile | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_geobath | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_w_grid | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_w_hydro | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_level7 | signs (not foliage) | 2 | 4 | 2 | 0 |
| sign_w_mlink | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_music | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_neondome | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_nightclub | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_nofly | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_snacks | signs (not foliage) | 2 | 4 | 0 | 0 |
| sign_w_sortin | signs (not foliage) | 2 | 4 | 1 | 0 |
| sign_w_temp | signs (not foliage) | 2 | 4 | 2 | 0 |
| graf_1 | signs (not foliage) | 1 | 2 | 0 | 0 |
| graf_3 | signs (not foliage) | 1 | 2 | 1 | 1 |
| graf_7 | signs (not foliage) | 1 | 2 | 1 | 0 |
| sign_c_geomarket | signs (not foliage) | 1 | 2 | 0 | 0 |
| sign_clinic_cyan | signs (not foliage) | 1 | 2 | 0 | 0 |
| sign_games_cyan | signs (not foliage) | 1 | 2 | 1 | 0 |
| sign_mkt11 | signs (not foliage) | 1 | 2 | 1 | 0 |
| sign_mkt3 | signs (not foliage) | 1 | 2 | 1 | 0 |
| sign_mkt6 | signs (not foliage) | 1 | 2 | 0 | 0 |
| sign_mkt8 | signs (not foliage) | 1 | 2 | 1 | 0 |
| sign_records_cyan | signs (not foliage) | 1 | 2 | 1 | 0 |

Per super-region (r = plots, c = bridges and walkways) at each zoom, instances in view; largest 8 of 30:

| region | instances | triangles | in view @8 | in view @15 | in view @30 |
|---|---:|---:|---:|---:|---:|
| r0,0 | 18614 | 37228 | 1739 | 4169 | 13607 |
| r-1,0 | 16772 | 33544 | 337 | 2057 | 8707 |
| r0,-1 | 13672 | 27344 | 555 | 1613 | 7077 |
| r-1,-1 | 12062 | 24124 | 291 | 1218 | 6031 |
| r-1,1 | 4029 | 8058 | 0 | 0 | 126 |
| c0,0 | 3353 | 6706 | 104 | 358 | 2016 |
| r1,0 | 3173 | 6346 | 0 | 0 | 418 |
| r0,1 | 2857 | 5714 | 0 | 0 | 452 |

Super-regions: 30, instances min 53, median 1678, max 18614.

Per plot (a plot is a LOT x LOT cell, 2095 with any plant instance): instances of each kind among the plots that have it:

| kind | plots with it | min | median | max |
|---|---:|---:|---:|---:|
| succulent | 958 | 2 | 12 | 148 |
| bush | 1222 | 2 | 6 | 46 |
| fern | 1118 | 2 | 6 | 34 |
| h_ivy | 1193 | 1 | 2 | 18 |
| vines | 1165 | 1 | 2 | 19 |
| pothos | 1133 | 1 | 2 | 20 |
| bushFlower | 570 | 2 | 2 | 34 |
| h_vine3 | 1071 | 1 | 2 | 16 |
| bonsai | 535 | 2 | 2 | 40 |
| g_fern2 | 689 | 2 | 2 | 30 |
| h_curtain1 | 694 | 1 | 2 | 16 |
| h_curtain2 | 694 | 1 | 2 | 17 |
| h_curtain3 | 674 | 1 | 2 | 23 |
| h_heart | 652 | 1 | 2 | 18 |

### Max city with every empty plot laid to lawn (static cache off)

#### maxcity with every empty plot laid to lawn (before_lawns), settled with 181972 plant instances

Per family, all zoom levels (instances; a quad is 2 triangles; "in view" counts an instance whose quad touches the camera frustum):

| zoom | family | instances | triangles | in view | in view % | thinned by LOD | kinds |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | grass | 86448 | 172896 | 4638 | 5% | 0 | 1 |
| 8 | ground cover | 3804 | 7608 | 190 | 5% | 0 | 7 |
| 8 | ferns and bushes | 51834 | 103668 | 1736 | 3% | 0 | 8 |
| 8 | hanging greenery | 23946 | 47892 | 899 | 4% | 0 | 10 |
| 8 | laundry | 8050 | 16100 | 216 | 3% | 0 | 12 |
| 8 | signs (not foliage) | 7890 | 15780 | 195 | 2% | 0 | 207 |
| 8 | **all** | 181972 | 363944 | 7874 | 4% | 0 | |
| 8 | **foliage only (no signs)** | 174082 | 348164 | | | | |
| 15 | grass | 86448 | 172896 | 7270 | 8% | 0 | 1 |
| 15 | ground cover | 3804 | 7608 | 374 | 10% | 0 | 7 |
| 15 | ferns and bushes | 51834 | 103668 | 5646 | 11% | 0 | 8 |
| 15 | hanging greenery | 23946 | 47892 | 2733 | 11% | 0 | 10 |
| 15 | laundry | 8050 | 16100 | 780 | 10% | 0 | 12 |
| 15 | signs (not foliage) | 7890 | 15780 | 791 | 10% | 0 | 207 |
| 15 | **all** | 181972 | 363944 | 17594 | 10% | 0 | |
| 15 | **foliage only (no signs)** | 174082 | 348164 | | | | |
| 30 | grass | 86448 | 172896 | 30924 | 36% | 13334 | 1 |
| 30 | ground cover | 3804 | 7608 | 1466 | 39% | 538 | 7 |
| 30 | ferns and bushes | 51834 | 103668 | 22814 | 44% | 7808 | 8 |
| 30 | hanging greenery | 23946 | 47892 | 10939 | 46% | 2798 | 10 |
| 30 | laundry | 8050 | 16100 | 3889 | 48% | 1233 | 12 |
| 30 | signs (not foliage) | 7890 | 15780 | 3485 | 44% | 2 | 207 |
| 30 | **all** | 181972 | 363944 | 73517 | 40% | 25713 | |
| 30 | **foliage only (no signs)** | 174082 | 348164 | | | | |

Per zoom: render size, LOD.plants value (what the vertex shader thins by), and the frame:

| zoom | render | LOD.plants | frame triangles | without foliage layer | foliage drawn (triangles) | share of frame | in view and not thinned (instances) |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | 640x360 | 0.000 | 1960014 | 1596069 | 363944 | 18.6% | 7874 |
| 15 | 720x405 | 0.000 | 3461958 | 3098013 | 363944 | 10.5% | 17594 |
| 30 | 1024x576 | 0.180 | 7138175 | 6774229 | 363944 | 5.1% | 63068 |

Thinning (lodPlants) for other LOD values, at any zoom (instances thrown away of 181972; signs are never thinned):

| LOD.plants | 0.25 | 0.5 | 0.75 | 1 |
|---|---:|---:|---:|---:|
| thinned | 35979 (20%) | 71521 (39%) | 106966 (59%) | 141686 (78%) |

Grass plots: 112, tufts (distinct points) per plot min 377, mean 385.9, max 395; instances per plot mean 771.9 (two crossed quads a tuft); gt kinds used per plot: [1].

### Dense city (static cache off)

#### dense (before), settled with 8175 plant instances

Per family, all zoom levels (instances; a quad is 2 triangles; "in view" counts an instance whose quad touches the camera frustum):

| zoom | family | instances | triangles | in view | in view % | thinned by LOD | kinds |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | ground cover | 298 | 596 | 16 | 5% | 0 | 7 |
| 8 | ferns and bushes | 4226 | 8452 | 472 | 11% | 0 | 8 |
| 8 | hanging greenery | 2083 | 4166 | 270 | 13% | 0 | 10 |
| 8 | laundry | 799 | 1598 | 79 | 10% | 0 | 12 |
| 8 | signs (not foliage) | 769 | 1538 | 119 | 15% | 0 | 159 |
| 8 | **all** | 8175 | 16350 | 956 | 12% | 0 | |
| 8 | **foliage only (no signs)** | 7406 | 14812 | | | | |
| 15 | ground cover | 298 | 596 | 138 | 46% | 0 | 7 |
| 15 | ferns and bushes | 4226 | 8452 | 2328 | 55% | 0 | 8 |
| 15 | hanging greenery | 2083 | 4166 | 1103 | 53% | 0 | 10 |
| 15 | laundry | 799 | 1598 | 435 | 54% | 0 | 12 |
| 15 | signs (not foliage) | 769 | 1538 | 428 | 56% | 0 | 159 |
| 15 | **all** | 8175 | 16350 | 4432 | 54% | 0 | |
| 15 | **foliage only (no signs)** | 7406 | 14812 | | | | |
| 30 | ground cover | 298 | 596 | 298 | 100% | 22 | 7 |
| 30 | ferns and bushes | 4226 | 8452 | 4226 | 100% | 652 | 8 |
| 30 | hanging greenery | 2083 | 4166 | 2083 | 100% | 242 | 10 |
| 30 | laundry | 799 | 1598 | 799 | 100% | 127 | 12 |
| 30 | signs (not foliage) | 769 | 1538 | 769 | 100% | 0 | 159 |
| 30 | **all** | 8175 | 16350 | 8175 | 100% | 1043 | |
| 30 | **foliage only (no signs)** | 7406 | 14812 | | | | |

Per zoom: render size, LOD.plants value (what the vertex shader thins by), and the frame:

| zoom | render | LOD.plants | frame triangles | without foliage layer | foliage drawn (triangles) | share of frame | in view and not thinned (instances) |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | 640x360 | 0.000 | 435866 | 419516 | 16350 | 3.8% | 956 |
| 15 | 720x405 | 0.000 | 944391 | 927999 | 16350 | 1.7% | 4432 |
| 30 | 1024x576 | 0.180 | 1032255 | 1015905 | 16350 | 1.6% | 7132 |

Thinning (lodPlants) for other LOD values, at any zoom (instances thrown away of 8175; signs are never thinned):

| LOD.plants | 0.25 | 0.5 | 0.75 | 1 |
|---|---:|---:|---:|---:|
| thinned | 1443 (18%) | 2896 (35%) | 4403 (54%) | 5712 (70%) |



### City (static cache off)

#### city (before), settled with 3643 plant instances

Per family, all zoom levels (instances; a quad is 2 triangles; "in view" counts an instance whose quad touches the camera frustum):

| zoom | family | instances | triangles | in view | in view % | thinned by LOD | kinds |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | ground cover | 124 | 248 | 4 | 3% | 0 | 7 |
| 8 | ferns and bushes | 1936 | 3872 | 302 | 16% | 0 | 8 |
| 8 | hanging greenery | 997 | 1994 | 93 | 9% | 0 | 10 |
| 8 | laundry | 198 | 396 | 0 | 0% | 0 | 12 |
| 8 | signs (not foliage) | 388 | 776 | 61 | 16% | 0 | 111 |
| 8 | **all** | 3643 | 7286 | 460 | 13% | 0 | |
| 8 | **foliage only (no signs)** | 3255 | 6510 | | | | |
| 15 | ground cover | 124 | 248 | 60 | 48% | 0 | 7 |
| 15 | ferns and bushes | 1936 | 3872 | 1258 | 65% | 0 | 8 |
| 15 | hanging greenery | 997 | 1994 | 633 | 63% | 0 | 10 |
| 15 | laundry | 198 | 396 | 114 | 58% | 0 | 12 |
| 15 | signs (not foliage) | 388 | 776 | 292 | 75% | 0 | 111 |
| 15 | **all** | 3643 | 7286 | 2357 | 65% | 0 | |
| 15 | **foliage only (no signs)** | 3255 | 6510 | | | | |
| 30 | ground cover | 124 | 248 | 124 | 100% | 4 | 7 |
| 30 | ferns and bushes | 1936 | 3872 | 1936 | 100% | 304 | 8 |
| 30 | hanging greenery | 997 | 1994 | 997 | 100% | 131 | 10 |
| 30 | laundry | 198 | 396 | 198 | 100% | 31 | 12 |
| 30 | signs (not foliage) | 388 | 776 | 388 | 100% | 0 | 111 |
| 30 | **all** | 3643 | 7286 | 3643 | 100% | 470 | |
| 30 | **foliage only (no signs)** | 3255 | 6510 | | | | |

Per zoom: render size, LOD.plants value (what the vertex shader thins by), and the frame:

| zoom | render | LOD.plants | frame triangles | without foliage layer | foliage drawn (triangles) | share of frame | in view and not thinned (instances) |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 | 640x360 | 0.000 | 319749 | 312393 | 7286 | 2.3% | 460 |
| 15 | 720x405 | 0.000 | 498713 | 491428 | 7286 | 1.5% | 2357 |
| 30 | 1024x576 | 0.180 | 426125 | 418841 | 7286 | 1.7% | 3173 |

Thinning (lodPlants) for other LOD values, at any zoom (instances thrown away of 3643; signs are never thinned):

| LOD.plants | 0.25 | 0.5 | 0.75 | 1 |
|---|---:|---:|---:|---:|
| thinned | 601 (16%) | 1231 (34%) | 1843 (51%) | 2453 (67%) |



### Static cache on (a still view): the frame

Triangles of one frame (cache plus live), the foliage as a share of it. Quoted runs are those where the foliage layer's share by difference agrees with its drawn count.

| scene | zoom | frame triangles | foliage drawn | share | by difference | cache |
|---|---:|---:|---:|---:|---:|---|
| city | 8 | 48414 | 7286 | 15.0% | 7286 | settled |
| city | 15 | 53971 | 7286 | 13.5% | 7285 | settled |
| city | 30 | 135211 | 7286 | 5.4% | 83777 | NOT settled (cache redrawing: not quoted) |
| city | 30 | 58721 | 7286 | 12.4% | 7287 | settled |
| dense | 8 | 70254 | 16350 | 23.3% | 16350 | settled |
| dense | 15 | 133903 | 16350 | 12.2% | 16349 | settled |
| dense | 30 | 157012 | 16350 | 10.4% | 16351 | settled |
| maxcity | 8 | 565579 | 191100 | 33.8% | 191307 | settled |
| maxcity | 15 | 1640690 | 191100 | 11.6% | 1034286 | NOT settled (cache redrawing: not quoted) |
| maxcity | 30 | 1373217 | 191100 | 13.9% | 191116 | settled |
| maxcity | 15 | 854040 | 191100 | 22.4% | 191107 | settled |
