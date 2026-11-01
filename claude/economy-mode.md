# Economy mode

A city started as **Economy** on the title screen (New city → Mode) runs on Scrip. Sandbox cities, including every city made before this, never load any of it: `ECON.on` is false and every hook steps aside.

Balance source: the Economy Balancer artifact and the project doc `claude/economy-balance.md`. Pace (Oct 31, owner): a clicker, not an idle game. The model's hour passes in one real minute (`K = 60` in economy.js), so every rate reads per minute, a level lights in a second or two, cores charge in seconds to two minutes, and nothing accrues while the game is closed. Classifications: 100, 300, 650, 1,100, 1,700, 2,500 residents (plus 500, 1,800, 4,500, 9,500, 16,000 Scrip/min, and 80 lit buildings for the coast).

## Where it lives

- `js/economy.js`: everything. State in `localStorage['neonIsland.economy']` (a city key, so slots, files and cloud saves carry it). Loads before `main.js` and wraps the build functions.
- Small hooks elsewhere, each commented:
  - `core.js put`: `DARK` can be a height (lights above it off) or -1/-2 (more flicker mid-way or far from a core).
  - `sprites.js`: signs and halos follow the same rule.
  - `world.js`: `isDarkPlot` asks `ECON.dark(c)`; corps sections (`sec.corp`) build from the office blocks of the industrial set; `c.dark === true` keeps meaning "dark street" (rooftop boards, lurkers in `people.js`, Furnish).
  - `input.js`: Transit opens by classification (metro at Zoned, sky highways at Incorporated); the Buildings menu shows prices; a tap on a building with no zone picked shows how it's doing.
  - `wirelog.js`: `WIRELOG.say(channel, text)` for the demand lines.
  - `slots.js`, `title.js`, `index.html`, `css/style.css`: the Sandbox / Economy choice on New city; Economy cities are tagged on the list.
  - `overseer.js`: the coast stays sealed until the final classification.
  - `saveguard.js`: `neonIsland.economy` is a city key.

## How the game maps onto the model

- **A building** is a plot with sections. **A level** is a section (a stacked piece, usually two to four floors). The model counted floors; here every per-floor number is tripled per level and the Sector Grade caps are in levels: E 2, D 2, C 2, B 3, A 4 (factories and corps 2). Stacking a level is the existing "click a roof to stack a section".
- **Isolation.** Reach spreads from the megastructures (and metro stops) along any connected ground, built on or not, and hops up to two plots between buildings. A building cut off from all of that stays empty and says so.
- **Light-up.** Three sizes: a home's first level gets a quick two-strand surge, other levels three strands, and a building reaching its Grade cap (or the first building of a zone) four thicker strands, a bigger burst and a label. Each has random spin, turns and tint, and its own synthesized tone (`sfx.tone`, audio.js) that climbs a pentatonic step per level, a chord for the big ones. A level lighting for the first time sends a surge up the building (three crackling strands of current spiraling from the street to that level, in its zone's color), then that level flashes, pays a floating +Scrip, and that building is redrawn first. A building just placed starts dark (no flash of light).
- **One zone per building.** A building only takes more of its own zone (corps only on corps).
- **Distances** are in plots (Chebyshev), measured to a megastructure's footprint. Emitter Core: within 2 poor air (Grade −25), within 5 mid (95% output, a little more flicker), within 9 far (80%, more flicker), past 9 no power.
- **Power order**: megastructures, metro stops and finished highways first; then buildings nearest a core first, oldest first.
- **Megastructures**: one each (Emitter Cores as many as you like; the Sky mall stacks to 3 levels from its roof). A new city starts with one Emitter Core and nothing else; the Psycho-Acoustic Grid is an optional 300 Scrip build from the start. Reach-based ones (Acoustic Grid, Police station, Town Square, Bath House, LIDAR) work by radius in plots; the Grid and Police station take reach upgrades in the City office.
- **Sky highway** benefits (trade rates) start once one highway is finished; track and stops are paid per plot.

## Player-facing pieces

- HUD (top center; under the clock on phones): Scrip and Scrip/h, residents, power used/capacity, progress to the next classification, demand once the Wire Nest stands, Office.
- City office: classification ladder, power and cores (upgrade, or Stabilize while charging), megastructures with reach upgrades, Overseer auto-upgrades once the Data Spire stands, income breakdown, tutorial replay.
- Classification: the biggest moment. A ring of light runs out from every core, every lit building flashes as it passes, the name lands big mid-screen with what it opens, and a rising arpeggio plays over the arrival sound (about 4 s, never blocks play).
- HUD next-classification readout names whichever gate is further behind (residents or Scrip/min, the bar turns green for income); hover it for both.
- Zone buttons show the next placement price and dim when you can't afford it; refusals and the hover info say how long until you can ("ready in about 20 s").
- Tips (after the tutorial, once each, stored in `st.hints`): the Grid when affordable, isolation, out of core reach, power maxed, Grade cap (on the first refused stack), jobs and shoppers (only after 25 s of the problem), core charging, Wire Nest demand, metro.
- Reach preview: while placing a megastructure with a reach (Grid, Police, Town square, Bath House, LIDAR), every plot it would cover is tinted, a low wall of light marks the edge, a beam rises over each building it would affect, and a label says how many buildings, the effect, the reach and the plots covered. Once placed, a signal arcs from it to each building in reach (nearest first), which flashes in the megastructure's color with the effect floating off it.
- Floating numbers (+Scrip, −cost, labels) are 17 to 20 px on a dark pill, raised above the building.
- Moving in: a level's first half arrives at once (it lights in about a second, with the surge), then the rest trickle in over about 15 s (`P.trickle`). Every 3 residents (2 in luxury) a thin glow runs up one corner of the building and round its top edge, with a small "+3 residents" and a soft tick.
- Full: when a building has lit every level and holds 95% of what it can where it stands, it pays a bonus (half a level's bonus per level, once per height) and plays the uplink: a holographic scan sweeps down the building and back, it glitches magenta and cyan, data glyphs rise off the roof, and a projector on the roof throws a hologram panel above it (light rays to its corners) that decodes out of noise into "FULL HOUSE" (Packed, Full shift) with the payout counting up. The panel is a real object in the world: it faces the camera when it appears and stays where it is if the view turns. Uplinks queue (up to three, then they shrink to a label). Old saves mark buildings already full quietly.
- No force-field dome over the city in Economy (`fieldPlan` returns nothing). Instead, every 4.5 s a grid of light runs out over the ground from each working core, as far as it reaches: open ground carries it on, a building takes a ring round its foot and stops it, so the pulse flows round buildings rather than through them.
- Smoke: each working core breathes out smog that hangs thick within 2 plots, thins through the mid band and fades out at the edge of its reach.
- Power view: click a core (no zone picked) to see its reach and bands on the ground for 9 s (red poor air up to 2 plots, amber 95% output 3 to 5, green 80% output to the edge, grey no power), or press Power in the top bar (or V) to show every core's. A legend explains the colors.
- Power surges (after the tutorial; the first about 2 min in, then every 3 to 5 min): a core glows yellow, orange, then red, 5 s each, with a label and a warning ring. Click it to open the stabilizer (keep the trace in the band for 4 s; the clock stops while you work); success pays a little Scrip. Ignore it and the core shuts down: its buildings go dark until you click it and crank it back up (click, tap or Space fills a bar that drains). After a restart its reach is 7 plots for 90 s. Charging a new core no longer has a mini game.
- Objectives panel (top left, always shown; the Grid's player and the Buildings menu stack under it): the next classification, an overall bar (the average of its requirements), a bar per requirement (the one holding you back marked), and what it unlocks. The top bar's Next box is hidden.
- Always night: the sky and lights are drawn as 23:00 (the clock, people and stories run on); the title room is lit for night too.
- Tutorial notes hover over what they're about (the core, the zone button to use, the home in question, the objectives panel) with a pointer; tips sit at the bottom right on desktop (centered on touch and narrow windows).
- Tutorial: the goal and core; a home right beside the core; why that's too close (poor air within two plots); deselect and lay empty tiles outward until one is 3 plots from the core (it checks the distance) (everything must connect by ground or it's isolated); a home on the far tile (clean air, but further from work); a factory; a shop; stack a level; next goal. Notes are one action each, the button to use pulsing, a progress strip; no dimming, no spotlight; skippable; replay from the Office. On touch it waits for the gesture tutorial first.
- Hover (mouse) or tap with no zone picked (touch): a building's Grade, lit levels, cap, why it's struggling, taxes, next level's price.
- Corps: with Industrial picked from Chartered on, a Factory / Corps switch appears.

## Residential look

Residential is lit like homes: moss-green neon trim (`M.neonMoss`, halo `GLOW.moss`) and umber/tungsten windows (`RES_ROOMS`, buildings.js), in both modes; the zone color is moss (#9BD86A). The little icon signs on residential shopfronts still use the cyan art (only pink, cyan and amber are drawn).

## Console

`ECON.state()`, `ECON.r` (live totals), `ECON.info(cell)`, `ECON.dev.money(n)`, `ECON.dev.tier(t)`, `ECON.dev.run(hours)`.

## Not done yet

- Sector Grade map overlay in the Data Spire ledger (the Spire's economy job here is the Overseer's auto-upgrades).
- Storylet tie-ins (living beside a core, priced out by corps).
- The game's numbers were moved from floors to levels and the fill speed raised so a level lights in minutes; the week's pace should hold (it's set by power, Scrip and play time) but needs a real playthrough to confirm.
