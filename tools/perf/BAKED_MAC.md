# Baked far buildings on your Mac (real Chrome, your graphics card)

Install, once (needs Python 3, Google Chrome, and either npm or an internet connection for the first run):

```
pip install playwright pillow numpy
```

Run (from the repo folder, with this branch checked out):

```
PERF_GPU=1 python3 tools/perf/baked_mac.py dense --out baked_mac_out
```

A Chrome window opens three times, one after the other (baked, real, stand-in); leave it in front and do not resize it. Each build is loaded once and goes through every zoom (24.5, 27, 30), hour (12, 19, 23) and motion (still, mid-turn) from that same page. The first (baked) pass includes baking the whole scene (several minutes in the software renderer for the dense scene; a card should be quicker, but I have not timed it on one).

Everything lands in `baked_mac_out/`: `crops/` (real | stand-in | baked | differences, one picture per capture), `full/` (the whole pictures, for flip tests), `numbers.json`, `numbers.csv` and `SUMMARY.md` (triangles and draw calls with the whole frame drawn, milliseconds a frame, whether the three pages had the same moving things, geometry and map memory, bake counts, times and stalls).

Other scenes and options: `city`, `maxcity` (about 1,600 plots and 3 GB of baked maps: needs a card with room), `megas`; `--zooms`, `--hours`, `--motions`, `--tpu` (texels a unit; the game picks 10 to 24 from the render setting and the screen), `--keepdist 0.45`, `--paint-lights`, `--no-timing`, `--pages` (the limit on baked maps; the game itself stops at 10 pages, 480 MB). `python3 tools/perf/baked_mac.py --help` lists them. For frames a second in a normal tab (still and turning), paste `tools/perf/baked_owner.js` into the game's console instead. The report is `tools/perf/BAKED.md`.
