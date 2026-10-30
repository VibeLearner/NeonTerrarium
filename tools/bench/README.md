# Phone benchmark

Open **https://vibelearner.github.io/NeonTerrarium/?bench** on the phone, press Start, hold it upright and leave it for about ten minutes.

- `js/benchboot.js` (first script in the head) does nothing unless the address has `?bench`. With it, the page's saves live in memory only,
  so the player's own city in that browser is never touched, and the title screen is skipped.
- `js/bench.js` runs the test: the five cities in `tools/perf/scenes/`, one page load each (still, slow turn, fast turn, pan, zoomed out,
  zoomed in, night rain, with the F3 overlay's breakdown on a few steps), every effect off one at a time in the medium city, and a three-minute
  warm-up test. If the page dies in the middle of a city (out of memory), that is noted and the next city runs.
- The results go to the save server (`PUT /saves/ntbench-results/<run id>`). `.github/workflows/bench-collect.yml` copies them every hour into the
  **bench-results** branch as `results/<id>.json` plus a readable `results/<id>.md`, and lists them in that branch's README.
- If sending fails, the last screen has Download results: attach the file in the chat, or `python3 tools/bench/collect.py --report file.json`.

Testing the benchmark itself (not real numbers): `?bench&benchquick` runs every step at a tenth of its length, `&benchonly=island,city` runs only those cities.
Fetch one run by hand: `python3 tools/bench/collect.py some/folder --id r202610300812-ab12`.

Phone mode (js/touch.js `PHONE`, off by default for now): `?phone=1` turns it on for that page load, on any device, and `?bench&phone=1` benchmarks it.
In phone mode the benchmark's frame times are the frames actually drawn (a steady 30 a second is the goal: under 33.4 ms).
