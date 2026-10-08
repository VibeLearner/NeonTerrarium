# Measuring the static cache (script for the other thread)

Branch: `wip/static-cache`. Serve the working tree as the game (or open the branch's `index.html`), in Google Chrome on the
M2, in front, laptop on power, no other heavy tabs. Nothing here is released to the artifact.

## Setup (once)

1. Load the max city (2,025 plots). Settings: Render **720p**, **Optimize framerate off**. Browser window as for earlier rounds.
2. Press **F3** (or `` ` ``) for the performance overlay. It now has a line `static cache: ...` under the shadow line:
   `in use`, `redrawing n of 8 (why)`, `redrawn (why)` or `off (why)`, with the frames since the last redraw and how often it
   has been redrawn. Shift+F3 turns on exact timing and shows the **Tests** row. The new tests:
   - **no static cache**: the old way of drawing, every frame (on = cache off). This is the comparison for every reading below.
   - **show cache redraws (red)**: a red frame for the frame a whole cache is drawn again, red bars at the screen edges where
     a background strip is being drawn. For looking at how often it happens; leave off for readings.
3. Write down at the start: the overlay's `render WxH of ...` line, the Chrome version, and the memory the Mac reports for the
   page (Chrome task manager, Shift+Esc). The cache adds two sets of targets of about (W+512) x (H+512) pixels, each about
   12 bytes a pixel (roughly 200 MB together at 3420x1640).

## Protocol for every reading

20 seconds after any change (zoom, time, rain, test on or off), then 3 readings 5 seconds apart; report the **middle** one.
Per reading, from the overlay (exact timing **off**): `FPS`, `frame ms` (and the 95% figure), `main thread ms`,
`people ms`, the cache line, and the `building pieces drawn X of Y` line.

## The runs

Do each run twice: once with **no static cache: off** (cache on, the default) and once with it **on** (cache off, old way).
Use these four conditions, in this order:

| Condition | Time | Weather | Zoom |
| --- | --- | --- | --- |
| A | 12:00 | dry | 30 |
| B | 22:00 | rain | 30 |
| C | 12:00 | dry | 15 |
| D | 22:00 | rain | 15 |

(Set the hour with the time control with the day cycle **off**. Leave the lights time to settle: at 19:00 to 20:00 and 5:00 to 6:00
the lights switch for about 7 seconds and the cache is off for that time: that's expected.)

For each condition and each of the two modes, take these five readings (exact timing off):

1. **Still**: hands off the mouse and keyboard.
2. **Panning slowly**: hold W (or an arrow) in one direction for the 5 seconds, repeat for the 3 readings.
3. **Panning fast**: hold Shift + W for the 5 seconds.
4. **Turning**: Q/E (or drag to rotate) steadily for the 5 seconds.
5. **Zooming**: scroll in and out once a second for 5 seconds (zoom changes redraw the cache: this should look like the old way).

Then, with exact timing **on** (Shift+F3), for condition A and B only, still, in both modes: from the "costliest passes"
and the pass table report `color`, `composite`, `all passes (exact)` and `main thread`.

## What to send back

- A table: condition x mode x the five readings: FPS, frame ms, main thread ms.
- For the cache-on runs, the cache line as it reads during each reading (is it `in use` while still and while panning slowly?
  How many times was it redrawn during the 15 seconds of the three readings? Pans past the margin redraw it).
- Exact-mode numbers for A and B: `color`, `composite`, all passes, with the cache on and off.
- One screenshot with **show cache redraws** on during a slow pan, and one during a fast pan.
- Anything that looks different from the old way: flicker of windows or aircraft lights, a seam or a band across the screen,
  a pop when the cache redraws, shadows lagging when the day cycle is on, plants or people drawn in front of or behind
  something they shouldn't be. (Turn the day cycle on for 20 seconds at dawn and dusk and look for seams.)
- The main thread laps (people, vehicles, megastructures, scene upkeep, pass setup) in condition A, still, cache on: if the
  frame is still over 16.7 ms, they say what to work on next.
