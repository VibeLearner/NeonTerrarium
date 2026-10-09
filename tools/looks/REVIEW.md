# The looks system: review

Branch `wip/looks`, from `main` at 6da3dbf. Everything in this round is in `js/looks.js` (the looks, blending, weather), `js/lookui.js` (the editor and the menu), `js/sky.js` (the shaders and the hand-off) and a few lines elsewhere (listed under "Files touched"). Screenshots are in `tools/looks/shots/`, the tools that made them and the numbers below are in `tools/looks/`.

## What is there

1. **Ten looks as data** (`js/looks.js`). Each look is a plain object: 42 knobs (numbers and colors) in six groups (Sky, Light, Air, Wet, Grade, Lens and film) and an 8-color palette. The starting values of each come from the nearest old keyframe and grade (`KEYS`, `GRADES` in sky.js), then lean toward its palette: sky and haze from the light and mid colors, shadow tint from the darkest, highlight tint from the lightest warm one. The two night looks keep a deep palette for sky and shadows and a small palette blend (0.08 to 0.1), so the neon stays bright and saturated. Morning keeps the hand-revised punchy palette, with haze, grain and flare doing the softening.
2. **Blending and Auto.** `LK.lookAt(hour, rain, cloud)` returns the weights of the looks; every knob is mixed with those weights, colors in linear light. It replaces `gradeFor` and the `KEYS` lerp. Hour windows are one table (`LK.auto`): Late night 3:00, Morning 5:30, Mid afternoon 11:00, Past golden hour 16:30, Dusk 18:30, Night 20:00; each hand-off is a smoothstep over one hour centered on the boundary (`LK.overlap`). Rain turns Morning into Rainy morning, Mid afternoon and Past golden hour into Rainy afternoon, Night into Rainy night; clouds without rain turn the day looks toward Overcast; Dusk and Late night take a little of the rainy and overcast feel of their neighbors.
3. **Weather states.** Clear, Overcast, Rain, by hand (chips in the deck) or Auto weather (slots of 4 to 9 real minutes drawn from a stream seeded by the city's seed, never `Math.random`; always clear to begin with, never two rainy slots in a row; about 57% clear, 33% overcast, 10% rain over eight hours). Changes blend over 30 real seconds (`LK.wx.fadeSec`). `S.rain` stays a plain true/false for everything else that reads it (it flips when the rain amount passes half); setting `S.rain` from outside (the harness steps do) is taken as a manual choice, at once.
4. **A look picked by hand** locks the look whatever the time and weather, with a 3 second crossfade.
5. **New effects**, all inside passes that already run (no pass added; see the counts below), each skipped when its value is 0: film grain (after the grade, 24 re-rolls a second, size in pixels), color fringing (whole-pixel red and blue offsets, only toward the edges), vignette, lens flare and sun glare (a glow and four soft ghosts on the line from the sun through the middle; the sun's place is taken from the star map's sky mapping, so it comes into view as the camera turns; with the sun far off screen only a faint glare on its side), sparkle on wet ground and roofs (one cell per pixel, fixed to the world, twinkling, only where the picture or the sun's light there is strong), the palette as a gradient map (the 8 colors dark to light, mixed in at the look's blend value), a midtone tint, haze color and amount, mist color, a horizon color in the sky, cloud cover and cloud color, stars, bloom strength and threshold, halation.
6. **The look editor** (Shift+L, or "Look editor" in the deck). Pick any look; preview it at any hour and weather with time held; every knob as a slider or color picker, grouped; the palette as 8 swatches; reference images dropped on the panel (shown beside the game, kept in this browser only: in memory and in this browser's IndexedDB, never in the repo); Save (localStorage), Reset to default, Copy JSON (one look or all ten) and Paste JSON; hold B to see the shipped look; a "Show blends" mode that runs a day in 15 s to 2 minutes with Auto on; and the old-way switches (below).
7. **The player's menu** in the settings deck: weather chips and Auto weather, then Auto and the ten looks by name with a swatch strip from each palette. The choice is remembered (localStorage, in try/catch). Auto is the default; weather starts clear.

## The old way is kept

- `window.__OLD_GRADES = true` (or "Old grades (as before)" in the editor, `LK.old`) draws with the old `applyTime` (kept as `applyTimeOld`) and every new knob set to what leaves the picture unchanged.
- **Proof:** `PERF_CAND_INIT='window.__OLD_GRADES = true;' python3 tools/perf/harness.py diff --base 6da3dbf --quick --only city` reports `25 captures compared, 0 problems` (pixels byte for byte, every mover and decision, `renderer.info`), run again on the final code.
- Each new effect also has its own switch in the editor ("Compare with the old way": grain, fringing, vignette, lens flare, sparkle, palette blend).
- **The F3 overlay's test list was not extended.** The names live in a table inside `js/perfhud.js`, which is off limits this round (the performance round changes it). The tests are in the editor, and `window.__OLD_GRADES` works the way the overlay's `__SLOW_SHADOW_JUMP` does. To list them in the overlay later: add `oldGrades: false` to its `tests` and `TEST_NAMES` and have `LK.old` read it.

## The ten looks

Screenshots of the same city scene (`city`, yaw 0.7, 1280x720), zoom 15 and zoom 30, from the same view, each look held at an hour that suits it with its own weather. The images in "Mood board" are the numbers and file names from `claude/looks-moodboard.md`; the mood board itself was not available to me (see "What I could not do").

| Look | Hour, weather | Zoom 15 | Zoom 30 | Mood board images |
|---|---|---|---|---|
| Morning | 8:00, clear | ![](shots/morning_z15.jpg) | ![](shots/morning_z30.jpg) | 1, 3, 6, 12 |
| Rainy morning | 8:00, rain | ![](shots/rainyMorning_z15.jpg) | ![](shots/rainyMorning_z30.jpg) | 18, 2, 13, 19 |
| Mid afternoon | 13:30, clear | ![](shots/afternoon_z15.jpg) | ![](shots/afternoon_z30.jpg) | 24, 22, 17 |
| Rainy afternoon | 14:30, rain | ![](shots/rainyAfternoon_z15.jpg) | ![](shots/rainyAfternoon_z30.jpg) | 10, 11, 15 |
| Overcast | 12:30, overcast | ![](shots/overcast_z15.jpg) | ![](shots/overcast_z30.jpg) | none picked yet |
| Past golden hour | 17:24, clear | ![](shots/golden_z15.jpg) | ![](shots/golden_z30.jpg) | 4, 5, 23, 14 |
| Dusk | 19:12, clear | ![](shots/dusk_z15.jpg) | ![](shots/dusk_z30.jpg) | 7, 8, 16, 20 |
| Night | 23:00, clear | ![](shots/night_z15.jpg) | ![](shots/night_z30.jpg) | 25, 21, 14, 9 |
| Rainy night | 23:00, rain | ![](shots/rainyNight_z15.jpg) | ![](shots/rainyNight_z30.jpg) | 25 |
| Late night or pre-dawn | 4:12, clear | ![](shots/late_z15.jpg) | ![](shots/late_z30.jpg) | none picked yet |

Regenerate with `PERF_PORT=9610 python3 tools/looks/shoot.py` (needs Playwright; software rendering, about two minutes a picture on a busy machine). Each shot is taken after 700 simulated frames so the lights have come on.

## What I could not do

- **No sheets with her mood board images.** The project folder `ashleyjacob165_weather/` is not on this machine, so I never saw the images; every look was set from its palette and the owner's description only. `tools/looks/sheet.py` builds one sheet per look (our two screenshots beside her images) when run with `MOODBOARD_DIR=<the folder>`; it writes to `tools/looks/sheets/`, which git ignores, so her images never reach the repo.
- **No performance timing.** Only the software renderer is available here and the rules say no timing from it. What I can give is counts (below). The 0.5 ms check has to be done on the M2: F3, then Shift+F3 for exact timing, max city, zoom 30, with the new look path and then "Old grades (as before)" in the editor, 3 runs each, same hour. Please also switch grain, fringing, flare and sparkle off one at a time in the editor to see which (if any) costs anything.
- **The overlay's test list** (above).
- `input.js` and `main.js` are untouched (the caller's rule). Shift+L is handled in `lookui.js` ahead of the game's own keys; `main.js` sets wet, rain and shafts values every frame after `applyTime()`, so the looks apply theirs at the top of `compVariant()` in sky.js, which runs after it.

## Performance: counts, not times

`tools/looks/pass_counts.py` (results in `tools/looks/results/pass_counts.json`): the city scene at zoom 30, one drawn frame, base commit against this branch.

| State | Render calls (full-screen passes included) | Draw calls | Triangles | Textures | Shader programs |
|---|---|---|---|---|---|
| Day, base | 15 | 195 | 47,336 | 40 | 43 |
| Day, looks (Auto, every effect on) | 15 | 195 | 47,336 | 40 | 43 |
| Night with rain, base | 15 | 304 | 427,656 | 40 | 45 |
| Night with rain, old path of this branch | 15 | 304 | 427,656 | 40 | 45 |
| Night with rain, Rainy night, effects off | 14 | 303 | 427,654 | 39 | 44 |
| Night with rain, Rainy night, effects on | 14 | 303 | 427,654 | 39 | 44 |

- **No pass is added.** Everything new is in the composite and in the final grade pass that already ran. The one fewer render call at night is the light-shafts pass not running because Rainy night sets shafts to 0. (The rainy morning row in the json shows one more: that run caught the static cache's background strip job mid-frame, which is one render call; it is not a look pass.)
- **Texture reads added per pixel:** in the grade pass none, except color fringing: two more reads, and only for pixels where the offset is at least one whole pixel (the outer part of the picture). The palette map, grain, vignette and flare read no textures (the palette is 8 uniform colors). In the composite, sparkle adds one shadow-map read, only on wet up-facing pixels, only while a look has sparkle above 0 (Rainy morning, Rainy afternoon, Rainy night). The composite is compiled without sparkle when it's 0.
- Shader programs: the composite gains one effect flag (`FX_SPARK`), compiled only when sparkle is on; sparkle on a rainy look adds one program after its first use, as every other flag does.

## What the static cache does during a blend

The cache's own bookkeeping (`tools/looks/cache_blend.py`, results in `tools/looks/results/cache_blend.json`): every frame is drawn on the small island scene at 240 lines, and for each frame the cache's state and reason are counted. Sun, sky light and emissive strengths go through the same path as the day cycle (the sun and hemisphere lights, `EM_I` and the materials, all set in `lkApply`), so the cache sees them as its "soft" drift.

| Scenario | Frames | Cache in use | Background strip jobs | Cache off (old way draws) | Whole redraws in one frame |
|---|---|---|---|---|---|
| Nothing changing | 150 | 150 | 0 | 0 | 0 |
| Hand pick, Mid afternoon to Night (3 s crossfade, then at rest), final | 330 | 30 | 0 | 299 | 1 (the first draw after the fade) |
| The same before the fix below | 330 | 35 | 74 | 203 | 18 (and 19 swaps) |
| Hand pick, Mid afternoon to Overcast, final | 330 | 111 | 0 | 218 | 1 |
| The same before the fix | 330 | 117 | 89 | 111 | 13 |
| Auto weather, clear to rain over the real 30 s | 1950 | 278 | 645 | 1027 | 0 |
| Auto weather, clear to overcast over the real 30 s | 1950 | 335 | 684 | 931 | 0 |

What this shows:

- **A slow blend does not make the cache redraw whole every frame.** The 30 second weather blends have no whole redraws at all; the light drift is carried by background strip jobs (the cache's normal path for a creeping sun). It is "off" for about half of those frames because the windows switch on as the blend passes through looks with some evening in them (Overcast, the rainy ones set "Lights on" to 0.2 to 0.36, the old rain only 0.15, below the 0.17 where windows start to light). While the lights are moving the cache stands down by design, and the old path draws, as at every dusk.
- **The 3 second hand-pick crossfade was a problem**: the light moves faster than the cache tolerates and it redrew itself whole 13 to 18 times in the 3 seconds. Fix, one guard at the top of `SC.frame` in `js/staticcache.js` (the only edit outside the files named in the plan; `staticcache.js` is not in the other round's list): during a crossfade the cache stands down, the old path draws, and the cache is built once more when the fade ends. Whole redraws in the crossfade: 18 down to 1. (`window.__NO_FADE_HOLD = true` turns the guard off for comparison.)
- **The day run fast** (a day in a minute, "Show blends"): the cache is off nearly all the time, on the old path too (evening: off 412 of 450 frames on the old path, 398 on the looks; dawn: 450 of 450 old, 260 looks). Nothing to report except that it is no worse.
- Not measured: time per frame. Please look at the overlay's "show cache redraws" test on the M2 while a blend runs (editor, Show blends, or Auto weather).

## The blending, checked

`tools/looks/blend_check.py` (results in `tools/looks/results/blend_check.json`), no drawing, over the whole day and the whole weather range (7,206 samples):

- The weights always add up to 1 (error under 0.0003) and are never negative.
- Smooth: the largest change per 0.02 game hours is 0.06 (L1 of the weights), per 0.01 of rain amount 0.03. No hand-off is a jump.
- Each hand-off between times of day overlaps for about 0.8 hours with both looks above 2% (a one-hour smoothstep).
- Looks in the blend (above 5%): one 43% of the time, two 28%, three 24%, four 3.8%, five 1%. **The plan said at most two or three; mixed weather at a hand-off can hold four or five** (each time of day brings its rainy and overcast variants). Trimming it to three was tried and gave jumps where weights tie, so I left it whole.
- Auto weather: two fresh runs give the same sequence. Over eight hours: 57% clear, 33% overcast, 10% rain; there is no rain in the first three hours of play with the default seed (rare by design; change the three numbers in `wxSlot`, or add a "rain more often" setting, if she wants it sooner).

## Main decisions

- Colors are mixed in linear light and stored as sRGB hex, so `Copy JSON` is readable and pasteable.
- Looks hold absolute emissive strengths (window, neon, bulb, trim) and a "Lights on" amount instead of the old formula from the night amount; "Lights on" still drives the windows switching on (`LIGHTS_GOAL`), the stars' glow and the bloom's night weight.
- The sun still follows the clock whatever the look (shadows never flip); the look only sets its color and strength. In Auto the sun's direction therefore does not follow the look, only its light.
- Cloud cover 0.5 is the way the clouds always were; cloud color leans the cloud shader's ramp toward the look's color by half. Clouds exist only below and around the island (the baked atlas), so cover can fill the sky round the island, not overhead.
- The hand-off windows overlap one hour, centered on the boundary; weather blends 30 s; hand pick 3 s.
- Grain is scaled so a look's 0.3 is a fine grain at 480p; fringing in whole pixels, as the cube of the distance from the middle, so the middle stays sharp.
- A look picked by hand also holds the weather's rain streaks (rain is still a state of its own); the looks themselves do not change with weather while picked.
- The editor holds the time (cycle off) while open and restores it on close; "Show blends" restores the pick.
- Reference images persist per look in IndexedDB (try/catch); nothing is uploaded.

## Files touched

- New: `js/looks.js`, `js/lookui.js`, `tools/looks/` (this file, `shoot.py`, `ui_shot.py`, `cache_blend.py`, `pass_counts.py`, `blend_check.py`, `sheet.py`, `shots/`, `results/`).
- `js/sky.js`: `applyTime` becomes a wrapper (old body kept as `applyTimeOld`), new uniforms and shader code in the composite, the cloud shader and the grade pass, a hook at the top of `compVariant` and one in `renderGlow`.
- `js/staticcache.js`: one guard in `SC.frame` (above).
- `index.html`: two script lines after `sky.js`; the `?v=` of `sky.js`, the two new scripts and `css/style.css` is `2026-10-09-looks1` (the other lines are untouched so a merge only meets the script list).
- `css/style.css`: the menu and the editor.
- Not touched: `core.js`, `world.js`, `recipe.js`, `recipeworker.js`, `matreg.js`, `loadcity.js`, `neverseen.js`, `people.js`, `perfhud.js`, `main.js`, `input.js`, `buildings.js`, `tools/perf/`.

## A 5 minute guide for the owner

**Open the editor.** Press **Shift+L** (or Settings, then "Look editor" under Look and weather). Time stops while it's open. Pick a look in the top list: the city shows that look, held. To see it as Auto would blend it at this hour, tick "Show it blended". The Hour slider and the Clear / Overcast / Rain chips set what you preview it in.

**Tune a look against your images.** Drop the mood board images for the look on the "Reference images" box (or click it); they show beside the game, click one to make it bigger. They stay in your browser only. Open the groups (Sky, Light, Air, Wet, Grade, Lens and film) and move things while looking at the city and at the images. Start with these, in this order:
1. **Palette blend** and the **8 palette colors** (Grade): this puts the palette on screen. 0.1 to 0.25 is the range to try. Dark colors reach the shadows, light ones the highlights.
2. **Shadow tint** and **Highlight tint** with their amounts (Grade), then **Saturation** and **Contrast**.
3. **Sky, top / horizon / bottom** and **Haze color** (Sky, Air).
4. **Lights on** and the four brightnesses (Light) for how much of the city's own light shows.
5. **Film grain, Color fringing, Lens flare, Vignette** (Lens and film) last.
Hold **B** (or the "Hold to see the shipped look" button) to flip back to the look as it shipped and see how far you've moved. **Save** keeps your edits in this browser; **Reset to default** puts the look back.

**Copy your looks back.** In "Save and share": **Copy JSON** copies the look you're on, **Copy all ten** copies everything. Paste it to me (or into a file in the repo); to bring it back into the game, paste it in the box and press **Apply pasted**, then **Save**. The text is plain JSON of the form `{ "id": "night", "pal": [8 colors], "v": { knob: value } }`, and each look can then be made a default by replacing its entry in `js/looks.js`.

**Check the hand-offs.** Tick **Show blends** (editor, bottom): Auto runs a whole day in the time you pick (60 seconds by default). Use the weather chips as it runs. The line under the checkbox says which looks are in the blend. In the deck, "Auto" is the normal mode; picking a look there locks it.

**Compare with the old picture.** "Compare with the old way" at the bottom of the editor: "Old grades (as before)" puts the whole old time of day and grade back; the other boxes switch one new effect off at a time.

**Which looks are furthest from their mood board and need your eye first** (my guess, not from your images, which I could not see):
1. **Overcast** and **Late night or pre-dawn**: no images picked, so their palettes are mine (a cool slate scale; a quiet blue-gray scale).
2. **Morning**: the iridescent, prism-pink sky is the thing I could not get. I have a blue-to-peach sky with a cream haze, radial red/blue fringing and a flare; the "iridescent" part of the sky is not there.
3. **Rainy night**: one image only. Sparkle and wet reflections are strong; check the purple against image 25.
4. **Rainy morning**: the sparkle is single-pixel glints, which may be too peppery or too faint next to images 18, 2, 13 and 19.
5. **Past golden hour**: the sky and light follow the amber palette; the "sliding toward navy and coral" of image 14 is only in the sky gradient.

**Where it might surprise you**
- Windows now light a little by day in Overcast and in the rainy looks (a deliberate "neon reads stronger"); set "Lights on" to 0 to stop it.
- Auto weather is off by default and weather starts clear. Rain, when it comes, takes 30 seconds to arrive.
- If the F3 overlay shows frames slower than before on the M2, switch the editor's per-effect boxes off one at a time and tell me which one.
