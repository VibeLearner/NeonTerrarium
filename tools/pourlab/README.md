# Neon Dome pour lab

A standalone page for the Neon Dome's drink station: the bartender's view across the bar, a speed rail of 13
bottles, and a glass to pour into. Not linked from the game yet. Open `tools/pourlab/index.html` from a local
web server (it loads its art with `fetch`, so opening the file directly won't work):

    cd ~/NeonTerrarium && python3 -m http.server 8000
    # then open http://localhost:8000/tools/pourlab/

## How to play

- **Click a bottle** on the rail to pick it up. It follows the pointer, held by its spout.
- **Hold** anywhere to tilt it and pour; let go to stop (a few last drops fall). Move while pouring to aim.
  Flow ramps up with the tilt, and each bottle pours at its own rate (syrups slower, soda faster).
- **Click the rail** (or right-click, or Escape) to put the bottle back. Clicking another bottle swaps.
- **Dashers** (Static bitters, Chili tincture): pick one up, then each click adds one dash, 0.05 parts.
- **Measuring cups** (quarter, half, one part): click one to bring it beside the glass, pour into it (it brims
  over past its measure), then click it to tip the exact measure into the glass. Click an empty cup to put it away.
- **Ice**: click the ice well to toss a cube in (up to 4). Cubes float, bob and raise the level.
- The panel shows what's in the glass, in parts, against the fill line (2.5 parts) and the glass's limit (8).
  **Empty glass** starts over. There is no timer.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page: one canvas, 480x270, scaled up whole pixels at a time |
| `pour.js` | drawing and input |
| `sim.js` | the simulation, no drawing: pouring, the stream, the surface waves, color mixing, fizz, ice, cups |
| `test_sim.mjs` | checks the simulation's numbers with no screen: `node tools/pourlab/test_sim.mjs` |
| `art/neon_dome.px.js` | the bar, drawn in code with pxl (no image tools); `art/font5x7.px.js` is pxl's 5x7 font |
| `export_layout.mjs` | reads the art file and writes `assets/layout.json` (positions, sizes, ingredients) and `assets/font5x7.json` |
| `assets/` | what the page loads: `pour_bg.png` (everything that never moves), `pour_front.png` (the rail's front plate), `sprites/` (bottles and their hover look, the glass, the cups), `neon_dome.png` (the whole scene, for reference) |

## Changing the art

The art is made with the pxl skill (a Claude skill, not part of this repo). After editing `art/neon_dome.px.js`:
build it with pxl into a scratch folder, copy `scenes/pour_bg.png`, `scenes/pour_front.png`, `scenes/neon_dome.png`
into `assets/` and `sprites/bottle_*.png`, `glass.png`, `cup_*.png` into `assets/sprites/`, then run
`node tools/pourlab/export_layout.mjs` so the page's positions match.

## How it works (and the game-dev terms)

- **Fixed step:** physics runs in equal slices of 1/120 s however fast the screen draws, so a pour is the same
  on every machine.
- **The stream** is particles (small moving dots, 0.01 parts each) thrown from the spout along the bottle's tilt,
  pulled down by gravity, with a slight wobble. Drawn joined up they read as a stream; when the flow is low the
  joins break and it falls as drops. Whatever misses the glass splats on the counter and is lost.
- **The surface** is a heightfield: one height per pixel column, each pulled by its neighbors, so where the stream
  lands it dips and the ripple runs out and back and settles. A hard, fast stream throws spray.
- **Mixing:** the drink's true color is the mix of everything in it by volume, worked out in linear light (how light
  really adds up). Each pixel of the liquid holds its own color and drifts toward its neighbors and toward that
  mix, and a new pour paints its color where it lands plus a few curls that sink and swirl, so you see it streak
  in and blend over a second or two.
- **Fizz:** shiso tonic and soda add a foam head that settles over a second or two, and bubbles that keep rising
  for a while.
- **Ice** floats mostly under the surface and bobs on the waves; each cube adds 0.35 parts to the level.
- The liquid's top is drawn as an ellipse because we look down on the glass, matching the rim.

## Choices made without the design doc

The Drink Crafting Design doc couldn't be opened when this was built, so these are placeholders to tune:
the flow rates (`INGREDIENT_RULES` in `sim.js`, 0.9 to 2.2 parts a second at full tilt), which ingredients
fizz, the ice displacement (0.35 parts a cube, 4 cubes at most), and the tilt at which pouring starts. The shaker
and stirring glass are drawn but don't do anything yet (shake and stir techniques come next).
