# Planner mode (the placement puzzle)

Opened on its own link: `index.html#plan` (the phone page keeps the hash, so `m.html#plan` too). No money and no build limits: the puzzle is where
things go. Design doc: the owner's Claude doc "Neon Terrarium: Placement Puzzle System" (Nov 4, 2026).

## Where it lives

- `js/placement.js`: everything. `PLAN.on` is true only on the `#plan` link; every hook steps aside otherwise. State in
  `localStorage['neonIsland.plan']` (a city key).
- `js/saveguard.js`: on the `#plan` link every city key, the save slots' bookkeeping and the computer tutorial's progress are stored as
  `'plan:' + key`, so Planner cities and sandbox cities never meet (nothing converts either way). `NT_PLAN`, `NT_NS`, `NT_nsKey()`.
  Changing the hash between the two reloads. `NT_MODE()` returns the running mode (ECON, PLAN or null) for the hooks below.
- `js/slots.js`: the Planner's cities are their own list (IndexedDB `neonTerrarium.slots.plan`); no cloud on that link.
- Hooks that now ask `NT_MODE()` instead of `ECON`: `input.js` (mega click, tap info, Buildings menu text, transit), `world.js`
  (`isDarkPlot`), `overseer.js` (the coast stays sealed until Sovereign).
- A new megastructure, the **Air Scrubber** (`scrubber`, 2 x 2, repeatable), is added to `MEGA_TYPES` by placement.js (built on the page,
  never by the plot worker).

## The model

- `fill = levels x needs x max(0.3, support) x (0.4 + 0.6 x comfort) x rent`. Only the supported share counts toward tiers
  (`counted = fill x people x support / max(0.3, support)`), so towers with no jobs glow but don't progress.
- Needs: powered (inside a core's reach; the last 2 plots flicker at 80%), and reachable (not isolated).
- Support (jobs, 0 to 1) and Life (things to do) are shared out by capacity: each place's capacity over everyone in its reach, full pull close
  in and about half over the last few plots of its reach. Metro stops join everyone near a stop to everything near any stop. A Logistics
  Hub shuttles up to 300 workers to industry near it from homes within 12 plots.
- Comfort: 0.7 x the average + 0.3 x the lowest of Air, Quiet, Safety, Ease, Life (luxury weighs Quiet, Air and Life more and Ease much less).
  Dials open with their tier (Quiet at Connected, Safety and Ease at Patrolled) and fade in over 20 minutes.
- Thriving home: powered and connected, support 0.8+, every open dial 0.7+.
- Fields are painted on a grid (haze leans one plot downwind; noise is soaked up by anything three floors or taller in between; helpful
  effects that overlap give less each time, harmful ones add up), jobs and Life use summed-area tables. The painting runs only after an
  edit (`REV`), the quick pass (crime, the Grid's song, fades, fill) every second. About 40 ms for 1,300 buildings on a laptop core in node.
- Crime from Patrolled: hotspots form where shops and night spots go unwatched (coverage from police stations, patrol visits sampled
  from the officers on the street, busy lit streets, walls), drift away from coverage losing a third each move, dissolve below a third of
  their peak, never revisit a recent spot or cross a wall. They only lower Safety nearby.
- The Grid's song: four traits read from the Acoustic Panel (tempo, filter brightness, resonance, stasis), smoothed; each helps one dial
  and costs another, offsetting at most a third of what's missing within the broadcast (7 plots, 11 from Nightfall). Presets set the panel.
- Forks (picked by clicking the building): cores Wide / Clean, police Beat / Watch, scrubbers Quiet / Turbo. A change later refits in a minute.

## Tiers (supported residents, thriving homes)

Settled 150/4, Connected 400/10, Patrolled 750/20, Nightfall 1,100/32, Secured 1,450/45, Uptown 1,850/60, Skyline 2,400/80, Sovereign 3,000/100.
Unlocks in `TIERS[].opens`. Tiers, once reached, are kept; counts are smoothed over 20 s.

## Interface

Goal card (top left), lenses (Power, Air, Noise, Safety; V cycles), the city's voice (the biggest complaint, where, what helps; click to go
there), the ledger line after each edit, the preview while a zone or megastructure is held (green and red beams over homes, a +/- chip,
rounded until the Data Spire stands), the home card (hover or tap), fork and broadcast cards, a tier celebration, one intro note per tier,
just-in-time tips. Tutorial: seven short beats, no dimming; touch waits for the gesture tutorial. Replay from the ? on the goal card.

## Console

`PLAN.state()`, `PLAN.r`, `PLAN.last()`, `PLAN.compute(PLAN.snapshot())`, `PLAN.song()`, `PLAN.crime.forecast()`, `PLAN.dev.tier(n)`, `PLAN.dev.wind(radians)`.

## Not built yet (from the design doc)

- Patrol and drone route editing at the Precinct desk (patrols use the officers' own routes; drones are modeled as coverage).
- Person cam dispatch, the reserve officer, known faces.
- Relay Pylons as buildings (the broadcast simply widens at Nightfall), Dome reputation feeding catchment, shape bonuses (courtyards).
- The coast page doesn't load saveguard.js yet, so a Planner city's coast is the shared one.
