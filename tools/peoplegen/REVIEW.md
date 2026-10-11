# The people drawn in code: what to look at

Branch `wip/people-gen` (from main 8768d16, next to `wip/procart`; it touches `index.html` and `js/people.js`, nothing in spritegen or artgen). The Craftpix sheet `assets/sprites/people_v2.png` is still in the repo and still loads when you ask for it.

## Look first

1. `tools/peoplegen/sheets/lineup_0-47_walk+run+gest+uwalk+uopen.png`: 48 of the 53 citizen looks at 4x (walk, run, gesture, umbrella walk, umbrella opening), each in a palette of its own.
2. `lineup_48-58_...png`: the last five couriers and the roles (officer, bouncer, archivist, three lurkers) in every frame, 5x. `lineup_59-62_walk.png`: the four umbrellas, 10x (frames 0 to 4: furled, three opening, open).
3. `game_city_crowd_z8|15|30_h12|22.png` and `game_city_square_...`: the same street in the real game, old people on the left, new on the right, by day and by night. Zoom 8 is the one that matters most.
4. In the game: set `window.__OLD_PEOPLE = true` before the page loads (or, with F3 exact timing on, the overlay test "old people (as before)") for the Craftpix people. Flip it back and forth with no reload: `window.__OLD_PEOPLE = false; PG.apply()`.
5. Make it rain (`S.rain = true`): people stop, open umbrellas in a stagger over about 3 seconds, the ones without one run for a few seconds, and everything closes when it stops.

## What it is

- `js/peoplegen.js`: the core. A cell is 12 x 16, frames in the old order (6 walk, 4 idle, 6 gesture, 4 sit, 6 scanner, 6 angry), then the new 6 run, 6 umbrella walk, 4 umbrella idle, 4 umbrella opening (52 frames). A skeleton from a pose per frame (feet, knees, hands, elbows, head), a painter that draws a look on it in 15 index colours, the palette table, the look picker.
- `js/peoplegen_poses.js`: the pose of every frame, `PG.STRIDE` (6 px a walk cycle, 12 px a run cycle: the run frames play at the pace that matches the ground speed).
- `js/peoplegen_parts.js`: 17 hairstyles, 14 hats, 10 face items, 17 tops, 9 bottoms, 12 props. `js/peoplegen_shapes.js`: 53 citizen looks (everyday, low zone, industrial, high zone, couriers) with weights per zone, and the zone leans of the palettes. `js/peoplegen_roles.js`: officer, bouncer, archivist, three lurkers, the emote bubbles (drawn again, direct colours). `js/peoplegen_umbrella.js`: four canopies (round, flat, clear with lit trim, dark pointed), five states.
- The sheet is index colours (red channel = index * 16 + 8). Each person has a palette row (3840 mixes of 5 skins x 8 hair x 8 top x 4 accent x 3 bottom, then the role palettes); the shader looks the colour up. Index 11 is a lit accent: neon trim keeps its colour at night. Look code = old row | shape << 5 | palette << 12 (the drones and the old sheet leave the lookup off).
- `js/people.js` changes: the look code and palette in the shader, the run frames, the umbrella (a second instance in the same batch: its foot is put at the hand pixel of the frame, so one drawing serves every look and frame), the rain behavior, the zone passed to the look picker, industrial workers re-picked once when they first get a job in an industrial place.

## Decisions

- 53 citizen looks, 6 roles, 4 umbrellas, 1 emote row = 64 rows of 16 px: the sheet is 624 x 1024, inside the limit. One more look would have needed 1040 rows; I dropped the last courier look instead of going to a wider sheet.
- Hash only: look, palette, umbrella carried or not (65% high zone, 50% mid, 40% low and industrial), umbrella canopy, the delays (0.3 to 2.8 s) and the run (3 to 5.5 s) all come from `hash(id, ...)`. No `Math.random` in the new code. The shower count (`pplRainEpoch`) makes each person decide once per shower.
- Rain starts above 0.35 and ends below 0.12 of `LK.rainNow()`. Out of a door in the rain: the umbrella opens on the doorstep. At a door: it closes 0.9 world units before it. People with the hood-up look get no extra hood; they just run for a few seconds (the plan's "raise the hood" is not done).
- Run frames: anyone with `p.rush`, `p.hurry` or in the rain run (non-carriers), at 1.6 times the walking speed or more. Not the club crowd: a bouncer shoving someone out sets `p.hurry` but also `p.noRun`, so they walk, fast. Lurkers use run frames when they flee or strike. Officers rushing to a mugging run.
- Umbrella people never run (they use the umbrella walk). Officers, bouncers, the archivist and the club crowd carry no umbrellas.
- `PPL_MAX` goes from 700 to 1000 with the new people (umbrellas are extra instances); with the old sheet it stays 700.
- The sheet must stay 12 x 16 with a bit of headroom: `Cell.set` ignores column 0, column 11 and row 0, so every figure keeps its outline.

## Costs

- Load: drawing all 64 rows x 52 frames takes about 38 to 45 ms in headless Chromium (software rendering, cold, run by `tools/peoplegen/dump.py`), under the 100 ms limit, so nothing is cached. On your computer: `PG.buildMs` in the console shows the real number (it is measured inside the build).
- The people pass: one draw call as before, one more texture lookup per pixel (the palette, 16 x 4096), no new attributes. Counts only: the batch holds up to 1000 instances (was 700); in rain about half the people on screen add an umbrella instance. No timing was done in the software renderer. For real numbers: `tools/peoplegen/owner_people.js` (paste into the console on the busiest scene: max city at night, around 23:00, club open, zoom 15 or 30; about 2 minutes, tab in front): old and new people, still and in a slow turn, frames a second, the people pass time with F3 exact timing (color pass with the people batch shown minus hidden), and the CPU time of the people update. The rows stay in `window.__ownerPeopleRows`.
- The script was only checked for syntax and the overlay text it reads in the harness (the harness clock is stubbed), never run on a real card.

## Checks (all in this commit)

- `window.__OLD_PEOPLE = true` against the start commit 8768d16 (harness diff): city 25 captures, dense 13, megas 2 and max city 2 (steps `noon_f1,night_zoom_out`): 0 problems in every scene.
- `tools/peoplegen/same_places.py`: with no rain, old and new people on two pages stepped alike: every person's position, place, job and walk identical for 6 steps of 1.5 s (0 differences).
- `tools/peoplegen/rain_test.py`: clear, rain, clear. 3 s after the rain starts, 72 of the 89 carriers have the umbrella open (the rest are opening, with the staggered delays), 78 people running; after the rain stops all are closed within a second; no page errors.
- `tools/peoplegen/live_test.py`: a real page, night and day, 12 walkers made to hurry: they all use run frames, none of the club crowd; flipping old/new four times: no errors. A club night and a mugging did not happen by themselves in the 4 minutes I ran in the stock city, so those two were not seen running.
- The plot worker still does not load people.js: `recipe.js` lists `peoplegen` in the names it loads for the worker (a plan-statement correction: it does load people.js's generator part, not people.js), and `recipe_proof.py city --worker --max 120` gives 0 of 120 plots differ, no fallbacks, no page errors.

## Weak spots (be honest)

- Dark shoes, black trousers and black hair are close to the outline colour and can merge at 1x. A lighter shoe index and bottom colour would help (I left the palette as it is).
- Coats and trenches read as a bell. Faces are an eye pixel with skin in front.
- Run contact frames crouch deeply on 13 px bodies. The look-up nod while opening an umbrella is a one pixel head shift.
- The bouncer, lurker A and the archivist are very dark in the day and read mostly by their lit accents.
- Not checked: the officer sitting on the new (procart) police bike, the club queue, the police chase, the drone delivery with the new people in a real page (they need events that did not occur in my runs). The officer sits on the bike with the old frame (`F_SIT`) the same as before.
