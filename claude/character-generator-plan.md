# Plan: a code-drawn character generator for the people

For: a Claude Code agent working in the NeonTerrarium repo (github.com/VibeLearner/NeonTerrarium).
Start from: `main` once the procedural art round (`claude/procedural-art-plan.md`, branch `wip/procart`) is merged, or from `main` at 8768d16 or later if the owner wants the two to run side by side (they touch different files apart from `index.html` and possibly `js/spritegen.js`). Make a new branch, for example `wip/people-gen`.
Background: `js/people.js` (the header, `PPL`, the frame constants, `spriteMat`, `spriteBatch`, and the draw loop near the end), `docs/people.md`, the project doc `claude/people-system.md`, `js/spritegen.js` (generator core, palette and style rules from the foliage round), and `js/artgen.js` if the art round has landed.

## Why

The people are the last pictures in the game that aren't drawn in code. They are Craftpix sprites (licensed, so this isn't about publishing): 12 citizens, the police officer, the club's bouncers (the officer in red) and the hooded archivist, packed into `assets/sprites/people_v2.png`. The owner wants a generator instead, because:
- **Variety:** 12 faces for a whole city repeat fast. A generator can give hundreds of distinct people, and dress them for where they live and work.
- **Matching style:** the rest of the city is now drawn in code with one palette and one set of style rules; the people should sit in the same world.
- **Fully her own:** nothing licensed left in the visuals.

**The owner's standard:** she judges by eye, with flip tests and crops. The new people have to read at least as well as the Craftpix ones at zoom 8, 15 and 30, day and night: a clear silhouette, a readable walk, and a sense that each one is a different person.

## What stays the same

- **The cell and the frames.** 12 x 16 pixel cells, facing right (mirrored for left), feet on the bottom row, in the same order: 6 walk, 4 idle, 6 gesture, 4 sitting (`F_IDLE`, `F_SPEC`, `F_SIT`), and the officer's extras (scanner `F_USE`, angry `F_ANGRY`). The new running and umbrella frames (section 2b) are added after these. people.js picks the existing frames the same way; the only behavior code added is for running and umbrellas. Taller characters are out of scope for this round.
- **One draw call** for every person on screen, as now, with the same dither when they step through a door, the same night lighting, and the emote bubbles (already drawn in code, row 14) unchanged.
- **The roles:** officers, the bouncers, the hooded archivist, the lurkers (rows 9 to 11 now: shady figures), stall keepers, couriers, the club crowd. Each keeps a recognizable look.
- **No new random draws.** A person's look comes from a hash of who they are (`hash(id, 'look')` now), never from `Math.random`, so the same resident always looks the same and the harness stays deterministic. Don't add `Math.random` calls anywhere in people.js.

## How it works (my recommendation; the agent may improve on it)

### 1. Shapes and colors kept apart

Draw the parts in a few **index colors** (skin, hair, top, top shade, bottom, shoes, accent, a lit accent for neon trim, plus fixed outline and eye colors). Each person gets a **palette**: a row in a small palette texture with real colors for each index. The shader looks the color up per pixel.

- One sheet of shapes then serves any number of color combinations. About 48 to 96 **shape looks** (body, hair, clothes and props combined) times hundreds of palettes gives thousands of distinct people in a sheet about the size of today's.
- The palettes come from curated ramps (skin tones; natural and dyed hair; clothing colors that suit a rainy neon city, mostly muted with one accent each), hue-shifted like the foliage ramps. Never fully random colors: pick from the ramps, and keep the accent count low so crowds don't turn into confetti.
- The instance needs one more number for its palette. `aSpr` is full (row, frame, flip, fade), so add an `aPal` attribute or pack it into the row. Keep the drone sheet (it shares `spriteMat`) working: palette off for it.

### 2. Bodies drawn on poses

A small **pose table** per frame: where the head, shoulders, hands, hips, knees and feet sit, in whole pixels, for walk, idle, gesture, sit, the scanner and the angry reaction. The body and every clothing part are drawn as functions of the pose, so any outfit works in every frame.

- **Body types:** a few heights (13 to 15 pixels tall inside the 16) and builds (slim, average, broad), and a child size if the agent thinks it reads (optional; the owner decides).
- **Heads:** hair styles (short, long, bun, mohawk, undercut, braids, buzz, curly, ponytail, bald), hats and caps, hoods, visors and goggles, headphones, face masks (a rainy city with air-filter ads; some people wear respirators).
- **Tops:** tee, hoodie, jacket, long coat, trench (the noir mood), work overalls, vest over shirt, dress. Coats and long hair get a little swing in the walk.
- **Bottoms:** trousers, shorts, skirt, cargo pants; boots or sneakers.
- **Props:** backpack, shoulder bag, a cyber arm with a lit accent, a glowing collar or trim, a delivery box for couriers, a paper cup.
- **Walk quality:** at 12 x 16 the walk is mostly legs and a one-pixel bob. Copy the rhythm of the old sprites (contact, pass, contact), and check the arms swing opposite the legs. Every look gets real gesture frames (only five of the old characters had them).
- **Follow-through:** long hair, coat tails and bag straps trail a frame behind the body.

### 2b. New animations: running, and the umbrella

These are new frames, appended after the existing ones (the rows grow wider: the sheet can go to 48 cells, 576 px, per row). The existing frame numbers don't move.

- **Run (6 frames):** a longer stride with both feet off the ground on the passing frames, the body leaning forward a pixel, the arms bent and pumping, a two-pixel bob, and coats and hair trailing further than in the walk. people.js already has people who hurry: the mugger fleeing, officers rushing to a mugging, the victim hurrying off. Use the run frames for these, and for anyone else moving faster than a threshold (about 1.6 times walking speed; pick it by eye), **except the club crowd going home: they always walk**, however fast people.js moves them (check what speed it gives them, and keep them on the walk frames), and play them faster than the walk, matched to the ground speed so the feet don't slide.
- **The umbrella:** its own small sprite in the same sheet, not part of each character: closed (furled, hanging from the hand), 3 opening frames, open. Closing is the opening played backward. It is drawn as a second instance in the same draw call, placed at the character's hand from the pose table, so one umbrella drawing works for every look and every frame. Make the umbrella's quad tall enough that the open canopy sits above the head, outside the 16 px cell.
  - The character gets **umbrella poses:** walk and idle with one arm raised holding the shaft (the other arm swings as usual), and a short open/close arm motion (4 frames) to go with the umbrella's frames.
  - **Looks:** a few canopy shapes (round, flat, a clear one with neon trim, a little Blade Runner) colored from the person's palette accent. A canopy can catch a faint glow at night if its trim is lit.
- **When it happens:** people who are outside when the rain starts (`LK.rainNow()` crossing a threshold) stop for a moment, open their umbrella, and walk on, each after a short delay from a hash so a street doesn't open in unison. People leaving a building while it rains come out with the umbrella opening on the doorstep. They close it at a door before they dissolve inside, and outside when the rain stops. Not everyone carries one (about half, by hash and zone): the rest raise their hood if their look has one, or run for a few seconds when the rain starts.
- **Keep it deterministic:** who carries an umbrella and the delays come from hashes, never `Math.random`.
- **The cost:** one extra instance per umbrella holder, in the same draw call. Raise `PPL_MAX` if needed, and say by how much.

### 3. Dressed for their life

The look picker takes what people.js knows about the person: home zone (low, mid, high, industrial), job, courier or not, and the hour.
- Industrial workers lean toward overalls, hi-vis accents and caps; high-zone residents toward coats and clean colors; low-zone toward hoodies and patched layers; couriers get a cap, a bag and a bright accent.
- Each district can have a slight palette lean, so a neighborhood has a character without everyone matching.
- All of it by hash and weights, so the same person always gets the same look.

### 4. The special roles

- **Police officer:** a uniform with a cap or helmet, a lit badge and blue trim, with the scanner and angry frames. **Bouncers:** the same build in red and black (or their own heavy look). **The archivist:** a long hooded robe (walk and idle only, as now). **Lurkers:** dark hoods, masks and low collars from the generator's shady set.
- Check the officer still sits right on the police bike (the art round redraws the bike). The rider's seat height and hands should line up on all 8 views.

## Speed and size

- All looks drawn at load in under 100 ms on the owner's M2 (count pixels; time in headless Chromium and give her a console snippet), or drawn once and kept in IndexedDB by generator version.
- The sheet stays at 1024 x 1024 or smaller (or 2048 x 1024 if the shape count needs it; say why).
- The people pass should cost the same as now: one draw, one more texture lookup per pixel for the palette at most. Check the pass time with F3 exact timing on the max city at night with the club open (the busiest street scene), with a script for the owner's Chrome thread.

## The comparison sheets, and the switch

- `tools/peoplegen/sheet.py`: a lineup of 48 random citizens (all frames of a few of them at 4x, including run and the umbrella open, walk and close); every role; a crowd crop on a busy street at zoom 8, 15 and 30, by day and by night, old against new; the club queue; a police chase; the square with chatting and sitting.
- An overlay test **"old people (as before)"** (`PH.tests.oldPeople`, `window.__OLD_PEOPLE`) loads the Craftpix sheet as now. **Don't delete `people_v2.png` in this round;** the owner approves by eye first.

## Checks

- Harness diff with `window.__OLD_PEOPLE = true` against the starting commit: 0 problems.
- With the generator on and no rain, the people are in the same places doing the same things (only how they look changes, apart from running frames where they hurry): compare people positions over a few harness steps, old against new. Stopping to open an umbrella changes positions in the rain; that's expected.
- A real page: a city by day and night, the club, a mugging and the police response (running), a drone delivery, the square; switch a look from clear to rain and back (umbrellas open in a staggered way, close at doors and when the rain stops, nobody's feet slide when running); flip the switch; no errors.
- The plot worker doesn't load people.js; check it still doesn't.

## Working speed

- Quick checks on one scene while working; the full set once at the end.
- Any single check over 10 minutes: make it smaller.
- No timing in the software renderer; counts are fine.

## Working rules

**When something doesn't work:** try another approach (up to three), ask your advisor, and if still stuck, keep the old sprite for that role, note why, and move on.

**Decide for yourself:** the pose tables, the part list, the palettes, the shape count, the zone weights. List the main decisions in `tools/peoplegen/REVIEW.md`.

**Never:** merge into main, publish, delete `people_v2.png`, change the cell size or the frame order, add `Math.random` draws to people.js, copy any character from the Craftpix packs or any other game, or ship any image made by an AI tool.

**Keep going:** commit and push after each step that passes its checks. Bump the `?v=` tags in `index.html` in the last commit.

## Deliverables

1. The branch with the generator (`js/peoplegen.js`), the palette lookup, the zone-aware picker, the roles, running, umbrellas, and the switch.
2. `tools/peoplegen/REVIEW.md` (what to look at first, how to flip, the decisions, the costs) and the sheets in `tools/peoplegen/sheets/`.
3. The owner's Chrome script for the people pass time.
