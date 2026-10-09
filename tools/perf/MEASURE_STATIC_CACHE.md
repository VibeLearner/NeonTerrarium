# Measuring the static cache (script for the other thread)

Branch `wip/static-cache`. Serve that working tree as the game (or open its `index.html`), in Google Chrome on the M2, in front,
laptop on power, no other heavy tabs. Nothing here is merged or published.

## Switching the cache on and off (this works with exact timing off)

The overlay's "no static cache" test only exists in exact mode (Shift+F3), and leaving exact mode clears every test. For the plain
frame-rate readings use the browser console (DevTools, Console tab, one line, it takes effect on the next frame):

- `SC.mode = 'off'`    the old way of drawing, every frame (exactly the previous build's picture)
- `SC.mode = 'reuse'`  the cache (the default)

(In exact mode the Tests row's **no static cache** button does the same as `'off'`.) Run `SC.line()` in the console, or read the
overlay's `static cache:` line, to see what it's doing.

## Setup (once)

1. Load the max city (2,025 plots). Settings: Render **720p**, **Optimize framerate off**.
2. Press **F3** (or `` ` ``) for the overlay. New line under the shadow line:
   `static cache: in use`, `redrawing n of 8 (reason)`, `redrawn (reason)`, `off (reason)`, with frames since the last redraw and
   how many times it has been redrawn. `off (changing: drawn the old way)` is normal while turning or zooming or while the
   lights switch at dusk: the cache waits until the view holds still.
3. Shift+F3 (exact timing) shows the Tests row. Besides **no static cache** there is **show cache redraws (red)**: a red frame the
   frame a whole cache is drawn, red bars at the screen edges where a background strip is being drawn. Leave it off for readings.
4. Write down: the overlay's `render WxH of ...` line, the Chrome version, and the page's memory (Chrome task manager, Shift+Esc)
   with the cache off and on. The cache adds two sets of targets of (W+512) x (H+512) pixels, about 12 bytes a pixel each
   (roughly 200 MB together at 3420 x 1640; the second set appears at the first background redraw).

## Protocol for every reading

20 seconds after any change (zoom, time, rain, `SC.mode`), then 3 readings 5 seconds apart; report the **middle** one. Per reading,
from the overlay (exact timing **off**): `FPS`, `frame ms` (and the 95% figure), `main thread ms`, `people ms`, the cache line,
and `building pieces drawn X of Y`.

## Part 1: frame rate, cache on against off (exact timing off)

Four conditions, in this order (day cycle **off**; set the hour with the time control):

| Condition | Time | Weather | Zoom |
| --- | --- | --- | --- |
| A | 12:00 | dry | 30 |
| B | 22:00 | rain | 30 |
| C | 12:00 | dry | 15 |
| D | 22:00 | rain | 15 |

(After changing the hour, let the lights settle: at about 19:00 to 20:00 and 5:00 to 6:00 they take about 7 seconds to switch and
the cache stays off for that time. After setting 22:00 wait the 20 seconds.)

For each condition run these five readings with `SC.mode = 'off'` and again with `SC.mode = 'reuse'`:

1. **Still**: hands off the mouse and keyboard.
2. **Panning slowly**: hold W (or an arrow) the 5 seconds, in the same direction for the 3 readings (turn round between readings
   if the city's edge comes up).
3. **Panning fast**: hold Shift + W for the 5 seconds.
4. **Turning**: Q and E (or drag to rotate) steadily for the 5 seconds.
5. **Zooming**: scroll in and out once a second for 5 seconds.

Expect: still and slow panning much faster with the cache; fast panning faster, with the cache redrawing now and then (the
overlay counts them); turning and zooming about the same as the old way (the cache is off while the view eases, with one redraw
when it stops; the old way is what's drawn in between).

## Part 2: exact timing, cache on against off

Shift+F3 on (exact timing). For **all four conditions** A to D, standing still, once with `SC.mode = 'off'` (or the Tests row's
"no static cache" on) and once with `SC.mode = 'reuse'`, report from the pass table and the "costliest passes" list:
`color`, `composite`, `night lights`, `bloom and grade`, `all passes, exact`, and the `main thread` line.
Do the same for A and B while panning slowly (hold W).

## What to send back

- Part 1 as a table: condition x mode x the five readings: FPS, frame ms, main thread ms (middle reading of three).
- Part 2 as a table: condition x mode: the exact passes above.
- For the cache-on runs, the cache line as it reads during each reading, and how many times it was redrawn during the 15 seconds
  of the three readings.
- Memory with the cache off and on.
- One screenshot with **show cache redraws** on during a slow pan, one during a fast pan.
- Anything that looks different from the old way: windows or aircraft lights that flicker differently, a seam or band across the
  screen, a pop when the cache redraws, shadows lagging when the day cycle is on (turn it on for 20 seconds at dawn and at dusk
  and watch), plants or people drawn in front of or behind something they shouldn't be, a pixel shimmer along building edges while
  panning. (The cache is drawn with a slightly different projection from the old way, so a few edge pixels differ; it should not
  be visible.)
- The main thread laps (people, vehicles, megastructures, scene upkeep, pass setup) in condition A, still, cache on. If the
  frame is still over 16.7 ms they say what to work on next.
