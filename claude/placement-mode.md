# Planner mode (the placement puzzle)

Opened on its own link: `index.html#plan` (the phone page keeps the hash, so `m.html#plan` too). No money and no build limits: the puzzle is where
things go. Design doc: the owner's Claude doc "Neon Terrarium: Placement Puzzle System" (Nov 4, 2026).

## Where it lives

- `js/placement.js`: everything. `PLAN.on` is true only on the `#plan` link; every hook steps aside otherwise. State in
  `localStorage['neonIsland.plan']` (a city key).
- `js/saveguard.js`: on the `#plan` link every city key, the save slots' bookkeeping and the computer tutorial's progress are stored as
  `'plan:' + key`, so Planner cities and sandbox cities never meet (nothing converts either way). `NT_PLAN`, `NT_NS`, `NT_nsKey()`.
  Changing the hash between the two reloads. `NT_MODE()` returns the running mode (ECON, PLAN or null) for the hooks below.
- `coast.html` loads saveguard.js too, and the trip there and back keeps the `#plan` link (`TV.go` puts `?tv=1` before the hash), so a
  Planner city's coast is its own.
- `js/slots.js`: the Planner's cities are their own list (IndexedDB `neonTerrarium.slots.plan`); no cloud on that link. An imported file opens only on its own side (a Planner file on `#plan`, any other off it).
- Hooks that now ask `NT_MODE()` instead of `ECON`: `input.js` (mega click, tap info, Buildings menu text, transit), `world.js`
  (`isDarkPlot`), `overseer.js` (the coast stays sealed until Sovereign).
- A new megastructure, the **Air Scrubber** (`scrubber`, 2 x 2, repeatable), is added to `MEGA_TYPES` by placement.js (built on the page,
  never by the plot worker).

## The model

- `fill = levels x needs x max(0.3, support) x (0.4 + 0.6 x comfort) x rent`. Only the supported share counts toward tiers
  (`counted = fill x people x support / max(0.3, support)`), so towers with no jobs glow but don't progress.
- Needs: powered and reachable (not isolated). Power: inside a core's reach (the last 2 plots at 80%) and within its load. Each core powers
  `P.coreCap` (60); a level draws `P.draw` (home 1, shop and luxury 1.5, industry 2, corps 2.5) x (1 + 0.15 per extra level). Buildings nearest a
  core are served first, each by the nearest core in reach with room; the rest go dark, and a dark building gives no jobs, shops or pollution.
- Taller industry: 10% more jobs per extra level, pollution reaches 4 plots from four levels up, and its pollution passes over any building
  shorter than it (only a blocker at least as tall, and three levels or more, shades it).
- Support (jobs, 0 to 1) and Life (things to do) are shared out by capacity: each place's capacity over everyone in its reach, full pull close
  in and about half over the last few plots of its reach. Metro stops join everyone near a stop to everything near any stop. A Logistics
  Hub shuttles up to 300 workers to industry near it from homes within 12 plots.
- Comfort: 0.7 x the average + 0.3 x the lowest of Air, Quiet, Safety, Ease, Life (luxury weighs Quiet, Air and Life more and Ease much less).
  Air, Quiet, Safety and Life count from the start; Ease (feeling watched) opens with police at Patrolled and fades in over 20 minutes.
- Tall buildings (three levels or more) shade haze for the 3 plots behind them; past that it carries on. The tower breathes part of what it stops
  (`BLK`: half the most it stops from any one plot), so its residents get unhappy. Noise is soaked up by tall buildings anywhere along the way.
- Shops: a second level draws 0.75 of a first level's visitors, each level above that 0.45 (`P.shopTall`). Taller shops are louder (0.2 + 0.3 per
  extra level, by day) and reach 2 plots from three levels up, never as far as haze (3).
- Thriving home: powered and connected, support 0.8+, every open dial 0.7+.
- Fields are painted on a grid (haze leans one plot downwind; noise is soaked up by anything three floors or taller in between; helpful
  effects that overlap give less each time, harmful ones add up), jobs and Life use summed-area tables. The painting runs only after an
  edit (`REV`), the quick pass (crime, the Grid's song, fades, fill) every second. About 40 ms for 1,300 buildings on a laptop core in node.
- Crime from the start (never during the tutorial or the first 90 s): a home is unhappy by `1 - (0.65 x comfort without crime + 0.35 x
  work)`. A hotspot forms where enough unhappy people live within 3 plots (`FORM`), grows while the mood round it (unhappiness + half of what
  crime itself costs them) is above 0.38, spreads to the next unhappy block when hot, and fades once the cause is fixed: crime alone can't keep
  itself above 0.38. It lowers Safety within 3 plots (the same as a tower's haze shadow). Coverage (police from Patrolled, patrol visits,
  busy lit streets, walls) pressures it to drift, a third weaker each move.
- The Grid's song: four traits read from the Acoustic Panel (tempo, filter brightness, resonance, stasis), smoothed; each helps one dial
  and costs another, offsetting at most a third of what's missing within the broadcast (7 plots, 11 from Nightfall). Presets set the panel.
- Forks (picked by clicking the building): cores Wide / Clean, police Beat / Watch, scrubbers Quiet / Turbo. A change later refits in a minute.

## Tiers (supported residents, thriving homes)

Settled 150/4 (opens the Grid), Connected 400/10, Patrolled 750/20, Nightfall 1,100/32, Secured 1,450/45, Uptown 1,850/60, Skyline 2,400/80, Sovereign 3,000/100.
Unlocks in `TIERS[].opens`. Tiers, once reached, are kept; counts are smoothed over 20 s.

## Interface

- Planner hides the force-field dome over cores (`fieldPlan` returns nothing). Power has no view: each core sends a hologram grid wave (cyan lines, a pink front, the furnish pod's colors) over its whole reach, water
  included, when it's clicked, looping under a core being placed, and from every core when a goal is reached (never on its own). The last two
  plots of a reach, at 80% power, are amber. The core's card shows its load and its tuning; a refit takes 20 s and counts down.
- Names: needs are Jobs, Clean air, Quiet, Safety, Privacy, Things to do; the word is pollution, never haze. The goal card has a City
  balance: residents living out of room, and jobs and things to do against what a full city would need (short, balanced, spare).
- Views (V cycles; never switched on by placing something): Pollution, a weather-radar field (blue, green, yellow, orange, red, magenta, white as haze thickens, grains drifting with the
  wind); Noise, violet contour rings spreading out from loud places; Safety, tiles and hotspots. Sources glow and pulse; homes are lit green,
  amber or red by that measure (`TINT`: edge-lit boxes).
- Thriving homes on the goal card opens a panel: each requirement with how many homes pass, cycled with the arrows; the city lights the homes
  that pass green and those that don't red.
- Goal card, the city's voice (biggest complaint; click to go there), the ledger line after each edit, the preview tag while a zone or
  megastructure is held ("+12 residents", "about" until the Data Spire stands), the home card (hover with a quick box test, or tap), fork and
  broadcast cards, a tier celebration, one note per tier, just-in-time tips (tower shading, the Grid's song, the first crime with Show me).
- Tutorial (a new city): lays ground round the core (wind set toward +i), then fifteen steps on glowing tiles, each waiting for the player and
  then saying what happened, with Next: click the core, a home (the preview tag), its card, industry, a home next to the industry (a mistake on
  purpose: pollution and noise), the Pollution and Noise views, removing it, a shop, ground tiles, a home past the core's reach (no power),
  tall buildings, the tutorial building the rest (3 homes, 2 industry, 2 shops: 3 of 3 thriving, 144 residents, one home short of Settled),
  the balance bars, the goal and the thriving panel. On a city already built, replaying gives the same lessons as cards. The Grid opens at
  Settled with its own note; one-time notes for a full core, tower shading, the Grid's song and the first crime.

## Console

`PLAN.state()`, `PLAN.r`, `PLAN.crime.risk(i, j)`, `PLAN.last()`, `PLAN.compute(PLAN.snapshot())`, `PLAN.song()`, `PLAN.crime.forecast()`, `PLAN.dev.tier(n)`, `PLAN.dev.wind(radians)`.

## Not built yet (from the design doc)

- Patrol and drone route editing at the Precinct desk (patrols use the officers' own routes; drones are modeled as coverage).
- Person cam dispatch, the reserve officer, known faces.
- Relay Pylons as buildings (the broadcast simply widens at Nightfall), Dome reputation feeding catchment, shape bonuses (courtyards).
