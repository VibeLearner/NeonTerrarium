# Neon Dome pour lab

A standalone page for the Neon Dome's drink station: the bartender's view across the bar, a speed rail of 13
bottles, a glass, measuring cups, a shaker and a bar spoon, and guests who ask for drinks in vibe words, night
after night. Their tips and a nightly wage buy new bottles and garnishes at the supplier. Not linked from the game yet. Open `tools/pourlab/index.html` from a local web server (it loads its art
with `fetch`, so opening the file directly won't work):

    cd ~/NeonTerrarium && python3 -m http.server 8000
    # then open http://localhost:8000/tools/pourlab/

## How to play

Everything is done by hand: there are no action buttons at the bar. Point at anything (a bottle, cup, tool, the ice
well, the glass) to see a card saying what it is and does.

**The screen** hangs from the top shelf on the left. It lists everything in the drink in one list: what's in the
glass, and anything still in the shaker, marked with a gold [SHKR] tag next to its amount. The taste profile beside
it shows the glass; if everything is still in the shaker, it shows the shaker. When the ingredients are split
between the two, it shows only what's in the glass.

**Pouring**

- **The rail:** the drinks with alcohol (rice spirit, rye, rum, coffee liqueur) stand at the left end with amber
  tapes; a post on the rail separates them from the drinks without alcohol (cream tapes). A bottle's card says which.
- **Click a bottle** on the rail to pick it up. It follows the pointer, held by its spout, resting tipped just
  short of pouring. **Hold** anywhere to pour; let go to stop. Each bottle pours at its own rate.
- **Click its slot** in the rail (a faint ghost of it shows there), anywhere along the rail, right-click or Escape to
  put it back. Clicking another bottle swaps.
- **Dashers** (Static bitters, Chili tincture): each click adds one dash, 0.05 parts; six at most.
- **Measuring cups** are steel bar jiggers (quarter, half, one part): click one to set it beside the glass, pour into it, then click it to
  pick it up and pour the measure wherever you aim.
- **Ice**: press on the ice well to pick up a cube; drag it over the glass or the shaker and let
  go, or **flick** it there (let go while moving: it flies at your flick's speed and angle). A gentle steer forgives
  near misses. The glass takes 4 cubes, the shaker 6.
- **Move things around:** press and drag the glass, the shaker or a cup to slide it somewhere else on the counter.
- **Empty** the glass or the shaker by double-clicking it: everything goes, ice too.
- **Info cards:** a bottle's card shows as soon as you point at it; anything else (the glass, a tool, the spoon, a
  cup, the ice well) shows its card once the pointer has rested on it for about 2 seconds.

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

- Every guest is a new person, drawn in code from a seed (`guestgen.js`) in a visual-novel pixel style: anime eyes,
  locked hair with a shine, flat light-and-shadow shading, colored outlines. Their crowd sets their clothes (hi-vis and
  hard hats, hoodies and knits, suits and lanyards, long coats and jewelry) and how they react. Each guest is tagged
  female or male: only men get beards or stubble; women get inked lashes, lip color more often, a lighter build and
  longer hairstyles more often. Only one thing goes around the neck: a scarf, or headphones (or ear defenders) resting
  with a cup on each collarbone.
- Served, they reach for the glass, lift it, drink with their eyes closed, set it down and react: a raised brow and a
  small smile from luxury, a polished thumbs up from commercial, a warm grin from residential, a fist pump (or a
  tongue-out shudder) from industrial.
- They talk in their crowd's voice (`voices.js`): several ways to ask for each taste at each strength, never the
  same line twice in a row, always with a plain cue word (sweet, tart, bitter, smoke, heat, fresh, kick, smooth, layers).
- The guest's bubble says what they want: maybe a mood, the three things that matter most to them, and maybe a
  garnish (in gold). Their crowd isn't named: it shows in how they look and talk.
- **Serve** by sliding the glass over to the guest (drag it to the ring in front of their hands) once it holds at
  least the minimum drink amount: 2.5 parts. The small lights on the sides of the glass show it: red until there
  is enough, green after (it holds up to 8). They react in the same vibe
  words, and the full taste breakdown opens with their arrows: gold for more, pink for less, green for spot on.
- **The screen** hanging from the shelf shows the whole drink in a small font. When
  the list is longer than the screen, it scrolls: the mouse wheel over the screen, or the little arrows on the
  divider. A new ingredient scrolls itself into view.
- The full taste breakdown opens by itself after you serve, with the guest's reaction. It has one bar per note, built from the ingredients that give it; a
  hollow piece is what got hidden, a glowing piece what got boosted. Depth, Brightness and Toasted grow from two
  notes being close (as do Juicy and Velvet). Complexity and Balance are dials. Point at a bar to read what made it.
  On the hanging screen the ten notes are rows, and the fused notes show as small colored chips under them.
- **Recipes** (the button on the screen's title bar) opens a two-screen e-reader, saved in the browser. The left screen lists your discoveries,
  one line each, like "Coffee + Ginger = Toasted": any two ingredients that build Depth, Brightness or Toasted to 2
  or more, and the three secret pairings ("? + ? = Depth" until found). They're picked up from the screen as you
  make drinks, and from what you serve. The right screen holds your recipes: after a guest has tasted a drink,
  press **Save recipe** in the taste breakdown and it becomes a card with every ingredient and amount, the ice, how
  it was made and how the guest rated it. Turn pages with the arrows or the mouse wheel over a screen.
- **Next guest:** when you're done with a guest's reaction, press **Next guest** in the taste breakdown (or Escape)
  and someone new comes up. Each guest is from a random crowd.

**Nights, pay and the supplier**

- **The night** runs on the city's clock (the LED strip left of the DRINKS sign): the bar opens at 20:00, and the
  last guest comes in before 05:00. That's 22.5 real minutes. At 05:00 nobody new comes in; the guest at the bar
  always finishes (the button reads **Close the bar**), then it's day. There's no rush and no penalty for serving
  just one guest a night.
- **Pay:** a wage of 130 credits a night, however many guests you serve, plus a tip from each guest: more the more
  they liked it (nothing for a Bad drink), and more from the richer crowds. Each guest after the first in a night
  tips a little less. The strip right of the sign shows the bank and tonight's tips; it's all paid when the night ends.
- **The day:** a screen shows what the night earned, and the **supplier**: 10 spirits, 20 flavors and 10 garnishes
  (896 credits for everything), in tabs, with what each tastes like. Buy what you can afford, then **Open the bar**,
  or **Set up the rail first**: the bar stays closed (no clock) and you can practice with anything you own.
- **The back bar:** click the top shelf. Every bottle you own that isn't on the rail stands there. Pick one, then
  click a bottle on its side of the rail (alcohol on the left, the rest on the right) to swap them.
- **Garnishes** go in the wooden tray left of the mat. Click it, pick one, and it goes on the glass (picking another
  swaps it; "Take it off" removes it). A garnish has no volume: it adds a fixed nudge to a note or two (a lemon
  twist adds 1.2 Fresh, a salt rim hides some Bitter), however big the drink. Some guests ask for a kind of garnish
  (citrus, an herb, fruit, a rim, a flower, spice, smoke, roasted, something sweet): the right kind adds to their
  score, a different one takes a little off, none takes off more.
- **New notes:** the bought ingredients bring Fruity, Floral and Creamy, and two new fused notes: **Juicy** (Fruity
  and Sour close together) and **Velvet** (Creamy and Sweet). Cream softens strength and bitterness; smoke covers
  flowers; bubbles lift flowers as well as fresh notes. Seven new secret pairings wait in the book.
- **Orders follow the shelf:** a guest only asks for what the bar can make. Nobody wants flowers before there's a
  floral bottle, or a garnish before the tray has one. Each order is checked before the guest walks up (`bot.js`):
  a quick search must find a drink that lands everything they said and scores 80 or more, and every "lots of X"
  said with "little or none of Y" needs a bottle that gives X on its own without much Y (so "really bitter, zero
  sugar" waits until there's a bitter bottle that isn't sweet). Otherwise a different guest comes up.
- **They only hold you to what they said:** a guest's three or four spoken wishes are the only things they want
  more of. Anything they didn't mention can only be too much ("Too bitter" when they never asked for bitter), never
  missing, and Balance can always be too rough. Their "needed more" and "spot on" lines are only about what they
  asked for.
- **Saved in the browser:** the night, the clock, credits, what you own and your rail. For testing, add to the
  address: `?clock=10` (the clock runs 10 times faster), `?credits=500` (adds credits), `?reset=1` (starts over).

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page: one canvas, 480x270, scaled to fill the window with square, sharp pixels |
| `pour.js` | drawing and input: the bar, the panels, the spectrograph, the guest and the book (discoveries and recipes) |
| `sim.js` | the simulation, no drawing: pouring, the stream, surface waves, color mixing, fizz, ice, cups, tools |
| `flavor.js` | the taste model from the design doc: notes, masking, carrying, fused notes, Complexity, Balance, crowds, guests, scoring |
| `catalog.js` | every bottle and garnish: what it tastes like, its tags, how it pours, its price, its plain name and description |
| `economy.js` | nights on the city clock, the wage and tips, prices, buying, the rail, and the saved progress |
| `bot.js` | the bot bartender: searches for the best drink a guest could get from what the bar owns |
| `audit_orders.mjs` | the order audit: for guests at each stage of the shop, checks they're only held to what they said, only ask for "more" of what they said, that the best drink lands every said thing, and that each order has a plain route. `node tools/pourlab/audit_orders.mjs` |
| `sim_progress.mjs` | the progression simulation: a bot plays every stage of the shop; checks orders can be made, the pacing (about 2 hours relaxed, 1.5 quick), that the new notes behave as you'd guess, and edge cases. `node tools/pourlab/sim_progress.mjs` (add `--quick` for a short run) |
| `test_sim.mjs`, `test_flavor.mjs` | check the numbers with no screen: `node tools/pourlab/test_sim.mjs` |
| `art/neon_dome.px.js` | the bar, drawn in code with pxl (no image tools); `art/font5x7.px.js` is pxl's 5x7 font |
| `guestgen.js` | the guest generator: a look per seed and crowd, poses, expressions, cel shading, outlines |
| `voices.js` | how each crowd asks and reacts, with several wordings per taste and strength, picked without repeats |
| `guests.html`, `guests.js` | the generator's preview page: lineups per crowd, animated through a drink, every frame, roll new faces, save a PNG sheet. Open http://localhost:8000/tools/pourlab/guests.html |
| `font_small.js` | the smaller hand-drawn pixel font used on the hanging screen (capitals 6 pixels tall, lowercase 4) |
| `export_layout.mjs` | reads the art file and writes `assets/layout.json` (positions, the rail's 13 slots, all 43 bottles) and `assets/font5x7.json` |
| `assets/` | what the page loads: `pour_bg.png` (everything that never moves), `pour_front.png` (the rail's front plate), `sprites/` (bottles and their hover look, the glass, cups, shaker and its cap, the stirring glass, no longer used: the bar spoon is drawn in code), `neon_dome.png` (the whole scene, for reference) |

In the browser console, `pourlab` gives you the simulation, the guest and the spectrograph state to poke at.

## Changing the art

The art is made with the pxl skill (a Claude skill, not part of this repo). After editing `art/neon_dome.px.js`:
build it with pxl into a scratch folder, copy `scenes/pour_bg.png`, `scenes/pour_front.png`, `scenes/neon_dome.png`
into `assets/` and `sprites/bottle_*.png`, `sprites/garnish_*.png`, `glass.png`, `cup_*.png`, `shaker*.png`, `mixing_glass*.png` into
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
