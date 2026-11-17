# Neon Dome pour lab

A standalone page for the Neon Dome's drink station: the bartender's view across the bar, a speed rail of 13
bottles, a glass, measuring cups, a shaker and a bar spoon, and a test guest who asks for a drink in vibe
words. Not linked from the game yet. Open `tools/pourlab/index.html` from a local web server (it loads its art
with `fetch`, so opening the file directly won't work):

    cd ~/NeonTerrarium && python3 -m http.server 8000
    # then open http://localhost:8000/tools/pourlab/

## How to play

Everything is done by hand: there are no action buttons at the bar. Point at anything (a bottle, cup, tool, the ice
well, the glass, the screen) to see a card saying what it is and does.

**The screen** hangs from the top shelf on the left. It shows what's in the glass or the shaker, switching by itself to whichever you're pouring into or holding, and the drink's taste profile as it
stands (one short bar per note). Click the tabs to look at another vessel; click the screen for the full taste
breakdown.

**Pouring**

- **The rail:** the drinks with alcohol (rice spirit, rye, rum, coffee liqueur) stand at the left end with amber
  tapes; a post on the rail separates them from the drinks without alcohol (cream tapes). A bottle's card says which.
- **Click a bottle** on the rail to pick it up. It follows the pointer, held by its spout, resting tipped just
  short of pouring. **Hold** anywhere to pour; let go to stop. Each bottle pours at its own rate.
- **Click its slot** in the rail (a faint ghost of it shows there), anywhere along the rail, right-click or Escape to
  put it back. Clicking another bottle swaps.
- **Dashers** (Static bitters, Chili tincture): each click adds one dash, 0.05 parts; six at most.
- **Measuring cups** (quarter, half, one part): click one to set it beside the glass, pour into it, then click it to
  pick it up and pour the measure wherever you aim.
- **Ice**: press on the ice well to pick up a cube; drag it over the glass or the shaker and let
  go, or **flick** it there (let go while moving: it flies at your flick's speed and angle). A gentle steer forgives
  near misses. The glass takes 4 cubes, the shaker 6.
- **Move things around:** press and drag the glass, the shaker or a cup to slide it somewhere else on the counter.
- **Empty** the glass or the shaker by double-clicking it: everything goes, ice too.
- **Info cards:** a bottle's card shows as soon as you point at it; anything else (the glass, a tool, the spoon, a
  cup, the ice well, the screen) shows its card once the pointer has rested on it for about 2 seconds.

**Technique** (the three ways to make a drink, from the design doc)

- **Build:** pour straight into the glass over ice. The ice slowly melts in (to 10% water) and chills it a little.
- **Shake:** pour into the shaker and add ice (3 cubes is best; without ice it barely gets cold). Click it to pick it
  up, then **move it back and forth**: the cap goes on and it shakes, frosting over. About 10 seconds gets it cold.
  Shaking knocks most of the fizz out, so add soda after. **Hold** to pour it into the glass; the strainer keeps the ice
  in.
- **Stir:** stirring happens in the glass you serve. Add ice to the glass (3 cubes is best), click the **bar spoon**
  in its tin beside the shaker and it goes into the glass. Then **press on the spoon's handle** and **move the mouse
  in circles** (either way round, about one circle a second or faster). Back and forth doesn't count. Slower and
  gentler than shaking (about 20 seconds), it waters the drink down less and keeps the fizz. A quick click on the
  spoon takes it out; picking up or serving the glass takes it out too.
- **Both:** stir in the glass, pour the glass into the shaker and shake (or the other way round). Melted ice isn't
  counted twice, and the drink remembers both ("Stirred 20 s, shaken 3 s").
- **The glass** can be picked up and poured too (click it), into the shaker or out.

**The guest**

- The guest's bubble says what they want: their crowd, maybe a mood, and three things that matter most to them.
- **Serve** by sliding the glass over to the guest (drag it to the ring in front of their hands) once it holds at
  least the minimum drink amount: 2.5 parts. The small lights on the sides of the glass show it: red until there
  is enough, green after (it holds up to 8). They react in the same vibe
  words, and the full taste breakdown opens with their arrows: gold for more, pink for less, green for spot on.
- **The screen** hanging from the shelf shows what's in the glass or the tool you're using, in a small font. When
  the list is longer than the screen, it scrolls: the mouse wheel over the screen, or the little arrows on the
  divider. A new ingredient scrolls itself into view.
- The full taste breakdown (click the screen) has one bar per note, built from the ingredients that give it; a
  hollow piece is what got hidden, a glowing piece what got boosted. Depth, Brightness and Toasted grow from two
  notes being close. Complexity and Balance are dials. Point at a bar to read what made it.
- **The book** (top right) is a two-screen e-reader, saved in the browser. The left screen lists your discoveries,
  one line each, like "Coffee + Ginger = Toasted": any two ingredients that build Depth, Brightness or Toasted to 2
  or more, and the three secret pairings ("? + ? = Depth" until found). They're picked up from the screen as you
  make drinks, and from what you serve. The right screen holds your recipes: after a guest has tasted a drink,
  press **Save recipe** in the taste breakdown and it becomes a card with every ingredient and amount, the ice, how
  it was made and how the guest rated it. Turn pages with the arrows or the mouse wheel over a screen.
- **Next guest** brings someone new. The crowd button picks the crowd.

There is no timer, money or menu yet: those come next round.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page: one canvas, 480x270, scaled to fill the window with square, sharp pixels |
| `pour.js` | drawing and input: the bar, the panels, the spectrograph, the guest and the book (discoveries and recipes) |
| `sim.js` | the simulation, no drawing: pouring, the stream, surface waves, color mixing, fizz, ice, cups, tools |
| `flavor.js` | the taste model from the design doc: notes, masking, carrying, fused notes, Complexity, Balance, crowds, guests, scoring |
| `test_sim.mjs`, `test_flavor.mjs` | check the numbers with no screen: `node tools/pourlab/test_sim.mjs` |
| `art/neon_dome.px.js` | the bar, drawn in code with pxl (no image tools); `art/font5x7.px.js` is pxl's 5x7 font |
| `font_small.js` | the smaller hand-drawn pixel font used on the hanging screen (capitals 6 pixels tall, lowercase 4) |
| `export_layout.mjs` | reads the art file and writes `assets/layout.json` (positions, sizes, ingredients) and `assets/font5x7.json` |
| `assets/` | what the page loads: `pour_bg.png` (everything that never moves), `pour_front.png` (the rail's front plate), `sprites/` (bottles and their hover look, the glass, cups, shaker and its cap, the stirring glass, no longer used: the bar spoon is drawn in code), `neon_dome.png` (the whole scene, for reference) |

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
- **Mixing:** the drink's color is worked out the way light passes through it (Beer-Lambert): each liquid filters
  some of each color, by how much of the drink it is, so clear spirits, soda and melted ice lighten a drink without
  greying it and strongly colored ones lead. Each pixel of the liquid holds its own color and drifts toward its
  neighbors and toward that mix, so a new pour streaks in and blends over a second or two.
- **Shaking and stirring** follow the doc's curves: dilution and cold rise fast at first and level off, so going
  much longer than the sweet spot only waters the drink down.
- **State:** a tool moves from one state to the next (at home, lifted, straining, going back), and the page draws
  whatever state it's in.

## Choices made where the design doc is silent

The flow rates (`INGREDIENT_RULES` in `sim.js`, 0.9 to 2.2 parts a second at full tilt), the ice displacement
(0.35 parts a cube, 4 at most), ice in the tools (6 at most, 3 for the full effect, 8% effect with none), the flick
assist (16 px past an opening, or 10% of the throw's distance, whichever is more), how much a tool holds (6 parts), the strain rate (3 parts a second), how fast a
fizzy drink goes flat in the glass, the cut-offs between the five phrase levels (under 1, 1 to 3.5, 3.5 to 6, 6 to
8.5, 8.5 and up), the Sour and Spice phrases and the "none" phrases, what counts as a combined-note find (2 or more), and how much of each tag an ingredient needs
for a discovery (a fifth of a part), and what counts toward "too many ingredients" (at least 0.04 parts, so stray
drops from a dripping bottle don't count, while a single dash does). All are marked "lab choice" in the code.
