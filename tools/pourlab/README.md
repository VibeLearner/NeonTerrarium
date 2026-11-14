# Neon Dome pour lab

A standalone page for the Neon Dome's drink station: the bartender's view across the bar, a speed rail of 13
bottles, a glass, measuring cups, a shaker and a stirring glass, and a test guest who asks for a drink in vibe
words. Not linked from the game yet. Open `tools/pourlab/index.html` from a local web server (it loads its art
with `fetch`, so opening the file directly won't work):

    cd ~/NeonTerrarium && python3 -m http.server 8000
    # then open http://localhost:8000/tools/pourlab/

## How to play

**Pouring**

- **Click a bottle** on the rail to pick it up. It follows the pointer, held by its spout.
- **Hold** anywhere to tilt it and pour; let go to stop (a few last drops fall). Move while pouring to aim.
  Flow ramps up with the tilt, and each bottle pours at its own rate (syrups slower, soda faster).
- **Click the rail** (or right-click, or Escape) to put the bottle back. Clicking another bottle swaps.
- **Dashers** (Static bitters, Chili tincture): pick one up, then each click adds one dash, 0.05 parts. Six
  dashes is the most a drink takes.
- **Measuring cups** (quarter, half, one part): click one to bring it beside the glass, pour into it (it brims
  over past its measure), then click it to pick it up and pour it wherever you aim. It goes back once it's empty.
- **Ice**: click the ice well to toss a cube into the glass (up to 4). Cubes float, bob and raise the level.

**Technique** (the three ways to make a drink, from the design doc)

- **Build:** pour straight into the glass over ice. The ice slowly melts into it (to 10% water) and chills it a
  little.
- **Shake:** pour into the shaker (the steel tin on the right), then click it to lift it. Hold anywhere to shake:
  the panel's gauges show it getting colder and more diluted, quickly (about 10 seconds is right). Shaking knocks
  most of the fizz out, so add soda after. Then **Strain into the glass**.
- **Stir:** the same with the stirring glass, slower and gentler (about 20 seconds), and it keeps the fizz.
- While a tool is lifted you can also **Taste** it, **Put down** to keep it for later, or **Dump** it out.

**The guest**

- The guest's bubble says what they want: their crowd, maybe a mood, and three things that matter most to them.
- **Taste** opens the spectrograph: a hologram with one bar per note. Each bar is built from the ingredients that
  give it (in their colors); a hollow piece is what got hidden (sweet hides sour, sugar hides burn, cold mutes
  sweet), a glowing piece is what got boosted (strength carries heat, bubbles lift freshness). Depth, Brightness and
  Toasted grow from two notes being close to each other (the bracket on the left shows which). Complexity and
  Balance are dials. Point at a bar to read what made it.
- **Serve** (once the glass reaches the gold line, 2.5 parts) slides the glass to the guest. They react in the same
  vibe words, and the spectrograph opens with their arrows: gold for more, pink for less, green for spot on.
- **Phrasebook** lists every phrase the guests use; serving someone teaches you the ones they said and what range
  of the note each stands for. It's saved in the browser.
- **Next guest** brings someone new. The crowd button picks the crowd (Industrial, Residential, Commercial,
  Luxury, or any).

There is no timer, money or menu yet: those come next round.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page: one canvas, 480x270, scaled up whole pixels at a time |
| `pour.js` | drawing and input: the bar, the panels, the spectrograph, the guest and the phrasebook |
| `sim.js` | the simulation, no drawing: pouring, the stream, surface waves, color mixing, fizz, ice, cups, tools |
| `flavor.js` | the taste model from the design doc: notes, masking, carrying, fused notes, Complexity, Balance, crowds, guests, scoring |
| `test_sim.mjs`, `test_flavor.mjs` | check the numbers with no screen: `node tools/pourlab/test_sim.mjs` |
| `art/neon_dome.px.js` | the bar, drawn in code with pxl (no image tools); `art/font5x7.px.js` is pxl's 5x7 font |
| `export_layout.mjs` | reads the art file and writes `assets/layout.json` (positions, sizes, ingredients) and `assets/font5x7.json` |
| `assets/` | what the page loads: `pour_bg.png` (everything that never moves), `pour_front.png` (the rail's front plate), `sprites/` (bottles and their hover look, the glass, cups, shaker and its cap, the stirring glass with and without its spoon), `neon_dome.png` (the whole scene, for reference) |

In the browser console, `pourlab` gives you the simulation, the guest and the spectrograph state to poke at.

## Changing the art

The art is made with the pxl skill (a Claude skill, not part of this repo). After editing `art/neon_dome.px.js`:
build it with pxl into a scratch folder, copy `scenes/pour_bg.png`, `scenes/pour_front.png`, `scenes/neon_dome.png`
into `assets/` and `sprites/bottle_*.png`, `glass.png`, `cup_*.png`, `shaker*.png`, `mixing_glass*.png` into
`assets/sprites/`, then run `node tools/pourlab/export_layout.mjs` so the page's positions match.

## How it works (and the game-dev terms)

- **Fixed step:** physics runs in equal slices of 1/120 s however fast the screen draws, so a pour is the same
  on every machine.
- **The stream** is particles (small moving dots, 0.01 parts each) thrown from the spout along the bottle's tilt,
  pulled down by gravity, with a slight wobble. Drawn joined up they read as a stream; when the flow is low the
  joins break and it falls as drops. Whatever misses lands on the counter and is lost.
- **Vessels:** the glass, each cup and each tool hold their own contents: parts of each ingredient (melted ice
  included), how cold it is, how much fizz is left, whether it was shaken, and a short log of how it was made.
  Pouring from one into another carries all of that along.
- **The surface** is a heightfield: one height per pixel column, each pulled by its neighbors, so where the stream
  lands it dips and the ripple runs out and back and settles. A hard, fast stream throws spray.
- **Mixing:** the drink's true color is the mix of everything in it by volume, worked out in linear light (how light
  really adds up). Each pixel of the liquid holds its own color and drifts toward its neighbors and toward that
  mix, so a new pour streaks in and blends over a second or two.
- **Shaking and stirring** follow the doc's curves: dilution and cold rise fast at first and level off, so going
  much longer than the sweet spot only waters the drink down.
- **State:** a tool moves from one state to the next (at home, lifted, straining, going back), and the page draws
  whatever state it's in.

## Choices made where the design doc is silent

The flow rates (`INGREDIENT_RULES` in `sim.js`, 0.9 to 2.2 parts a second at full tilt), the ice displacement
(0.35 parts a cube, 4 at most), how much a tool holds (6 parts), the strain rate (3 parts a second), how fast a
fizzy drink goes flat in the glass, the cut-offs between the five phrase levels (under 1, 1 to 3.5, 3.5 to 6, 6 to
8.5, 8.5 and up), the Sour and Spice phrases and the "none" phrases, and how much of each tag an ingredient needs
for a discovery (a fifth of a part). All are marked "lab choice" in the code.
