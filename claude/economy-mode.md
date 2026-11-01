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
- **Isolation.** A building joins the city when it stands within two plots of another that has, starting from the megastructures, or within reach of a metro stop. An isolated one stays empty and says so.
- **Light-up.** A level lighting for the first time pulses in its zone's color, pays a floating +Scrip, and that building is redrawn first. A building just placed starts dark (no flash of light).
- **One zone per building.** A building only takes more of its own zone (corps only on corps).
- **Distances** are in plots (Chebyshev), measured to a megastructure's footprint. Emitter Core: within 2 poor air (Grade −25), within 5 mid (95% output, a little more flicker), within 9 far (80%, more flicker), past 9 no power.
- **Power order**: megastructures, metro stops and finished highways first; then buildings nearest a core first, oldest first.
- **Megastructures**: one each (Emitter Cores as many as you like; the Sky mall stacks to 3 levels from its roof). Nothing arrives on its own. Reach-based ones (Acoustic Grid, Police station, Town Square, Bath House, LIDAR) work by radius in plots; the Grid and Police station take reach upgrades in the City office.
- **Sky highway** benefits (trade rates) start once one highway is finished; track and stops are paid per plot.

## Player-facing pieces

- HUD (top center; under the clock on phones): Scrip and Scrip/h, residents, power used/capacity, progress to the next classification, demand once the Wire Nest stands, Office.
- City office: classification ladder, power and cores (upgrade, or Stabilize while charging), megastructures with reach upgrades, Overseer auto-upgrades once the Data Spire stands, income breakdown, tutorial replay.
- Stabilizer: optional mini game while a core charges. Keep the trace in the band (tap, click or Space). Each second inside takes 2 s off, up to half the charge.
- Always night: the sky and lights are drawn as 23:00 (the clock, people and stories run on); the title room is lit for night too.
- Tutorial: six short notes, one action each, the button to use pulsing, a progress strip; no dimming, no spotlight; skippable; replay from the Office. On touch it waits for the gesture tutorial first.
- Hover (mouse) or tap with no zone picked (touch): a building's Grade, lit levels, cap, why it's struggling, taxes, next level's price.
- Corps: with Industrial picked from Chartered on, a Factory / Corps switch appears.

## Console

`ECON.state()`, `ECON.r` (live totals), `ECON.info(cell)`, `ECON.dev.money(n)`, `ECON.dev.tier(t)`, `ECON.dev.run(hours)`.

## Not done yet

- Sector Grade map overlay in the Data Spire ledger (the Spire's economy job here is the Overseer's auto-upgrades).
- Storylet tie-ins (living beside a core, priced out by corps).
- The game's numbers were moved from floors to levels and the fill speed raised so a level lights in minutes; the week's pace should hold (it's set by power, Scrip and play time) but needs a real playthrough to confirm.
