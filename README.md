# Neon Terrarium

A cozy, Townscaper-style cyberpunk city builder that runs in the browser. Grow a floating platform in the sky, then fill it with four zones of pixel-art buildings: residential, commercial, luxury and industrial. Neon, laundry lines, hover cars and delivery drones included.

Built with [Three.js](https://threejs.org/) r128, drawn at 480 lines and scaled up in whole pixels.

## Updates and caching

GitHub Pages takes a minute or two to publish each push, and browsers may keep the old files for up to about
10 minutes. The `?v=` on each script and stylesheet in `index.html` is bumped with every release so a
refresh picks up all the new files together; if a change doesn't show, do a hard refresh (Ctrl+Shift+R,
or Cmd+Shift+R on a Mac).

**Phones and tablets** are sent from `index.html` to `m.html`: the same page with smaller copies of the scripts
(`min/js/`, comments and spaces taken out) and a saved copy of the game's files on the phone (`sw.js`), so
they load faster. Both are made by `node tools/mobile/build.js` (needs `npm i --no-save terser@5.51.2`); the
"Mobile build" GitHub Action runs it on every push to main and commits the result, so a forgotten run fixes
itself within a few minutes. Never edit `m.html` or `min/` by hand. `index.html?full` keeps a phone on the
full page; `m.html?loadtest` shows how long a phone's load took, stage by stage, with a Send button
(the results land with the phone benchmarks, `tools/bench/`).

## Playing it locally

The game is plain HTML and JavaScript with no build step, but it has to be served over http (browsers block loading the sprite images straight from disk). Three.js and the fonts load from CDNs, so you also need a network connection. From this folder:

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Controls

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Pick a zone | Zone A to D buttons, or 1 to 4 (Esc or 0 to deselect) | Zone buttons |
| Build | Click the sky to grow the platform; with a zone picked, click to build, click a roof to stack a section | Tap |
| Change a plot's greenery | With no zone picked, click an empty plot: cycles some plants, bare, lawn (the choice becomes the default for new plots) | Tap |
| Remove the top section | Right-click | Press and hold |
| Delete mode | X, or the delete button by the zones: drag to select a block of plots, click inside it to delete everything there (buildings, platform and any megastructure reaching into it), click outside to drop the selection. X or Esc to leave | Delete button |
| Place a megastructure | Pick it in the Buildings menu, click to put it down, R turns it, right-click or Esc cancels | Tap |
| Turn a megastructure | With the pointer over a standing megastructure, press R: it turns a quarter, or the next facing that fits (a 3 x 2 swaps to 2 x 3 if the plots beside it are free), flashing red if none does. Turning keeps everything going: the police drones and bikes, the club's night and crowd, the square's stall keepers and visitors | |
| Furnish an apartment | The Furnish pod button by the zones: point at a residential or luxury building (or a lifted pod), scroll or Up / Down to pick the pod (the building's stacked homes, outlined as you go), click to open it in Build mode; Esc or right-click cancels. Inside, Save keeps it with the city and Exit to city goes back (keeping any changes) | Tap a pod to light it, tap it again to open it |
| Move around | W A S D or the arrow keys (Shift for faster), H or Home to jump back to the middle | |
| Rotate | Drag, or Q / E (45 degree steps) | Two-finger twist |
| Zoom | Scroll wheel, or + / - | Pinch |

Settings, Render has a **Pixels** choice of 240p, 480p (the default), 720p or Smooth: how many lines the picture is drawn at, so
how chunky the pixels are (240p is the lightest on the graphics card, 720p finer and heavier). Smooth drops the pixel look: it
is drawn at your screen's own resolution (up to 1440 lines), and the shading is not stepped or dithered, so the sky, clouds and
glows are smooth gradients. It is the heaviest. The plants, signs, people and drones are pixel-art sprites and stay that way. It is remembered in
the browser. The picture is drawn at whole screen pixels where it can be, so on some screens two choices land close
together (on a 1080 screen 480p is 540 lines).

The game opens on a title screen: your city through a rainy window. Continue goes in; New city and Cities manage several cities in this browser (each a save slot: `js/slots.js`), export or import a city as a `.neoncity` file, and a placeholder cloud save keeps cities under a username (not secure: anyone with the same username sees them). Settings, Title screen and cities comes back to it. Add `?notitle` to the address to skip it.

Your city saves automatically in the browser (plots, megastructures and the style sliders). The time of day, weather, wind, render options and camera are not saved and reset on reload.

## Project layout

```
index.html              page markup, loads everything below in order
css/style.css           interface styling
js/core.js              shared state, random numbers, renderer, materials, geometry kit
js/sprites.js           pixel sprites (plants, laundry, signs) from one texture atlas, glows, flickering lights
js/buildings.js         district styles and every building type
js/ground.js            streets, sidewalks, bridges and cables between buildings
js/vehicles.js          hover cars, delivery drones, their shadows, chimney steam
js/sky.js               time of day, the pixel composite (outlines, sky, stars, rain, reflections, light shafts), clouds
js/audio.js             sound effects (Web Audio), volume setting
js/mega.js              megastructures: unlocking, placing, removing, their live parts (koi, police drone and hoverbikes, club lights)
js/people.js            people: residents, jobs, daily routines, the sidewalk network, walking door to door, delivery drones, muggings and police, the Neon Dome's nights
js/world.js             the game world: cells, building stacks, batching, edits, build and remove animations, saving
js/input.js             camera, mouse / touch / keyboard, settings panel
js/main.js              start-up and the frame loop
js/furnish.js           Furnish pod: picking a pod, gathering the city round it, the apartment overlay, saving its recipe with the city
furnish.html            the Pod Furniture Lab's Build mode for Furnish pod (generated: tools/furnish/build.py, see docs/furnish.md)
furnish/                bridge.js and bridge.css, the game's side of furnish.html (its Exit to city and Save bar, the messages)
assets/sprites/         sprite PNGs at true pixel size (one file per sprite; the name is the sprite's id)
assets/sprites/people.png  the people atlas: 12 characters, one 16 px row each, 6 walk + 4 idle frames of 12 px
docs/people.md          the people system: how it works, plan and progress
assets/audio/music/     the old radio's songs (not played now; the Grid makes its own music)
js/grid.js, grid_panel.js, grid_engine.js   the Psycho-Acoustic Grid: live generated music while the Grid stands, its player, the Acoustic Panel, and the sound engine
assets/audio/radio/     the old radio host's recordings (not played now)
tools/make_playlist.py  optional: writes assets/audio/music/playlist.json (track order, nicer titles)
tools/make_floor_decals.py, tools/make_holo_ads.py  asset generators for the floor decals and the hologram ad sheets
assets/audio/sfx/       sound effects: place.wav (build pop), remove.wav (removal thud), radio-on.wav (radio station arrives), mega-arrive.wav (any other megastructure arrives; 4.6 s, the length of its arrival animation)
assets/audio/sfx/originals/  the untouched source recordings, for re-editing
```

The scripts are ordinary (non-module) scripts that share one scope, so the order in `index.html` matters.

## Furnish pod

Any pod of a residential or luxury building (the stacked homes it is built from), and any lifted pod, can be done up as an apartment. The **Furnish pod** button
by the zones starts picking: the pod under the pointer gets a bold outline in its zone's neon (scroll or Up / Down for the pod
above or below, "pod 3 of 5"), and a click opens that apartment in the Pod Furniture Lab's Build mode, full screen over the city, with the real city
round it and a hologram fly-in from your camera. Commercial and industrial buildings can't be picked. The city waits while you
are inside. **Save** keeps the apartment with the city (it goes into the save slot, city files and cloud saves with everything
else); **Exit to city** goes back and keeps any changes. Opening the same floor again brings it back.

The Build page is `furnish.html`, made from the lab (it runs its own three.js, r149, in a frame so it never mixes with the
game's r128). To make it again after the lab changes: `python3 tools/furnish/build.py path/to/podlab`. How it fits together:
`docs/furnish.md`.

## Industrial yards

Besides the halls, silos and tank yards, the industrial zone builds five small workshops: a rusty corrugated
scrap shed, a red brick gear workshop under a tiled roof, a mossy concrete repair shop with pipes over its roof, a
blue parts warehouse with a sawtooth roof, and an open timber lube shed under a glass roof, each with a lit doorway
and its own neon sign. For height there are stacked yards (two or three of the workshops piled on concrete decks with
an outside stair), an art-deco terraced foundry (stepped brick tiers with cyan neon edges, gold zigzag friezes, a
gold-fanned central pier and smokestacks) and a brutalist works tower (mossy concrete blocks with lit window grids, a
round silo with glowing portholes, rusty pipes wrapped round it). Neighbouring buildings are joined by chunky
pipework (straight runs, loops and jogs, copper elbows and collars, valve wheels, gauges, steam leaks, moss, ferns
and hanging vines), many with glass sections of blue, dark green or brown fluid that glows softly at night. The fluid is faked in one shader material (bands,
ripples and bubbles sliding along with time, from world position), so it costs one draw per region and no per-frame
work; and neighbouring industrial buildings often by a raised conveyor belt
with crates riding along it (high enough for people to walk under). Code: `scrapShed` to `lubeShed` in
`js/buildings.js`; `BRIDGE.pipework`, `BRIDGE.conveyor` and the moving crates in `js/ground.js`.

## Megastructures

Landmarks that take a block of plots once the city is big enough. Each kind first arrives on its own, when its
requirement is met (and, for some, on a random roll with each build). From then on it stays unlocked: the Buildings
menu (it appears when the first one arrives) lists every kind that has arrived and places as many more as you like,
each with its own variant. A megastructure never
replaces buildings: it takes the nearest free block (open platform, or new platform grown onto the edge of the city).
Each one arrives slowly (about four and a half seconds): its footprint is traced on the ground, a wireframe rises
out of it, then the structure is revealed from the ground up behind a glowing scan line, and its live parts (the
koi, the drone, the screens) switch on at the end.

- **Psycho-Acoustic Grid** (the radio station: its saved kind is still `radio`, so older cities load): arrives with the 20th building, of any zone (each built plot counts once; stacking doesn't
  add to it), on free ground near that build. Right-click removes it; with 20 or
  more buildings standing, the next build brings it back.
  In the city's story the planners broadcast harmonic frequencies through streetlamps, transit hubs and apartment vents to keep the
  population docile and productive. While the Grid stands it makes the district's music live (no recordings), fading in
  slowly once it has fully arrived: carrier chords, soft pads, neuro-trigger melodies and drifting grain clouds, never the same twice.
  A small player under the title shows the program, the carrier chord and mood, a live spectrum drawn from the music itself,
  previous program / hold / next program, and an **Acoustic panel** button. Double-clicking the Grid opens the same panel: a full-screen
  console with every control, named in the city's own terms (circadian clock rate is the tempo, carrier wave harmonics the drone chords,
  dopamine ping rate how often melodies fire, aerosol dispersion the grain clouds, smog attenuation the high-cut filter, canyon resonance the reverb,
  stasis field freezes the chord). A carrier chart of pads shows the chords of the current pattern (click one to jump to it).
  Programs: District hum (the default), Night sedation, Commute loop, Carrier only. What you set is remembered in this browser.
  Removing the Grid fades the music out and stops it. Music volume is in Settings, Sound. While the panel is open the city holds, the music plays on.
  Code: `js/grid.js` (the player, the programs, the building hook), `js/grid_panel.js` (the panel), `js/grid_engine.js` (the sound engine, sealed in one function).
  The old songs in `assets/audio/music/` and the host's recordings in `assets/audio/radio/` are no longer played (still in the repo).
- **Sky mall:** a 3x2 block (either way round). Unlocks at 50 luxury and 30 industrial sections, then a 1 in 50
  chance per build. An octagonal white-and-gold mall on white columns, each side one sheet of glass looking into
  an open atrium with walkways and boutiques round a central core; the roof is mostly pool under a white canopy.
  Click its roof with a zone picked to stack another tier of two floors (up to 3); right-click takes the top tier off.
- **Town square:** a 5x5 open plaza. Arrives with the 50th residential building (each plot with a residential
  section counts once). A holographic koi pond at its heart (a 10-frame neon sprite sheet, assets/sprites/koi_neon.png, played
  through a glitching hologram shader; the full-size original is in assets/sprites/originals/), lantern strings crossing over
  it, and a night market: food carts piled with food (menu-tower bike carts, hawker stalls, little food trucks),
  long market stands with trays of food under tarps, tables and crowds.
- **Foundry:** a 6x4 block (either way round). Unlocks at 60 industrial sections, then a 1 in 50 chance per build.
  A tall green-grey steel works with orange light tucked under every ledge, a scaffolded smokestack, a 22-unit
  chimney with a beacon, a tank tower ringed in light, looping pipes and a lit loading dock.
- **Police station:** a 3x3 civic building. Unlocks at 15 residential and 15 commercial sections, then a 1 in 20
  chance per build. A pale block over a lit glass lobby, a glass curtain wall, the neon badge and a POLICE fascia,
  framed facade screens cycling the wanted posters (assets/sprites/wanted.png, with a projection glitch), a cyan
  hologram ring round the building, a red/blue light bar flashing on the roof, patrol cars and officers out front.
  A police drone on the roof pad and a row of black hoverbikes in the bays out front are live: the drone patrols
  the nearby crossings, and the bikes patrol and rush to muggings (see `docs/people.md`).
- **Rainbow Plaza market mall (彩虹广场 MALL):** a 4x4 block, a size up from the police station and taller. Arrives
  with the 30th commercial building (each plot with a commercial section counts once). A stacked, weathered market
  building in teal concrete patched with paint, rust and graffiti: shops all round the ground floor under striped
  awnings and bright painted signboards, produce stalls spilling onto the two street sides, a terraced upper floor
  with lantern strings, laundry and plants, glass barrel vaults lit warm from inside, a blue tarp over a rooftop
  cafe, solar panels and a dish, and the rainbow sign on an arch at the very top.
- **Cloud Pagoda:** a 5x4 block (either way round), a size down from the foundry and the tallest building after
  its chimney. Arrives with the 60th luxury building (each plot with a luxury section counts once). A white stepped
  palace: a podium with stairs between two wings, four rounded glass-walled terraces with cyan-lit slabs and
  swept-up corners, Japanese gardens on every terrace (bonsai pines, bamboo, mossy rocks, lily ponds, stone
  lanterns) with glass domes, rounded glass bays bulging out of the floors, arched gold-framed entrances, blue
  strip lighting along every edge, white piers with gold chevrons, hover cars on cantilevered pads, and on top a
  two-tier white pagoda roof with gold hips and a gold spire.
- **Neon Dome:** a 4x4 nightclub under a geodesic glass dome. Arrives once there are 30 residential, 30 commercial
  and 30 luxury buildings (each plot counts once). The dome's struts are lit in cyan and pink in one of three
  patterns, picked per dome. It opens at 19:00 and closes at 4:00. Each night is packed, decent or nearly empty;
  residents who are home and free come out, queue along the rope, get their ID checked by two bouncers, and dance
  on the floor or the gallery. Details in `docs/people.md`.
- New megastructures go in `MEGA_TYPES` at the top of `js/mega.js` (requirement, odds, footprint, max tiers).
- For testing, open the game with `#dev` at the end of the address and press **M** (Psycho-Acoustic Grid), **N** (sky mall), **B** (town square), **V** (foundry), **C** (police station), **K** (market mall), **P** (cloud pagoda) or **J** (Neon Dome)
  to bring it in, or remove it, next to the plot under the pointer, skipping the requirement and the odds.

## Lawns and parks

Clicking an empty plot with no zone picked cycles its greenery: some plants, bare, or a lawn of tiny grass tufts
that sways with the wind setting. Four or more connected lawn plots become a park, with tall garden lamps throwing
wide pools of light. Every lawn has places to sit: a picnic blanket for two (brought by whoever comes to picnic and
folded away when they leave), a pair of spots for friends, and a small hologram projector whose show plays while
someone sits watching it. Code: `lawn` and `lawnSpots` in `js/world.js`, the shows and blankets in `js/people.js`.

## Commercial streets and holograms

The commercial zone builds neon-named shops, tiled-roof shops, market stalls, food plazas, glass towers, pagodas,
brutalist arcologies and dome market halls (`js/buildings.js`: `signShop`, `tiledShop`, `foodPlaza`,
`arcologyTower`, `glassTower`, `brutalTower`). The streets are lit warm from the shopfronts, with lantern strings
between buildings and no street lamps. About one commercial building in six that is mid-size or taller wears a
hologram ad down one face, from just under the roofline to the top of the ground floor: one of five tall neon signs
(a sushi bar, a repair shop, an air-filter shop, a satellite shop and a loan shop), scaled to fit without stretching.
Very tall walls get a stack that runs through the signs in turn. The signs are packed into one atlas, `assets/sprites/holo_walls.png`,
from `assets/sprites/originals/holo_*.webp` by `tools/make_wall_holo_signs.py` (needs Pillow; it prints the `WALL_CELLS`
line to paste into `js/buildings.js`).
A building never has both: about one tall tower in thirty (picked from the buildings without a wall sign) throws a huge air-filter hologram out over the
street. That one plays a cycle of ads (an air-filter ad, Aether-Vane recruitment, Synth Corp security) that
protest groups hack in turn. It hangs over the three plots in front of the tower, so it only appears where those
plots are lower than its bottom edge (the tower picks the clearest face, and rebuilds when a neighbor changes). Code: `wallHologram` and `airHologram`; ad art in `assets/sprites/holo_*.png`, built by
`tools/make_holo_ads.py`.

## People

Residents live in the buildings (seeded per section, so the same people always live in the same place), take
jobs nearby, and follow a daily routine set by the hour in Settings: busy at lunchtime, quiet late at night. They
walk the sidewalks door to door and dissolve in and out of doorways. Details and the roadmap: `docs/people.md`.

## Adding art and sound

- **Sprites:** add the PNG to `assets/sprites/`, then add its size and anchor to the `SPR` table at the top of `js/sprites.js`.
- **Sound effects:** short effects are trimmed and sped up to match the animations, then saved as small mono `.wav` files (no playback delay). Register a new one in `SFX_FILES` at the top of `js/audio.js` and call `sfx.play('name')`.
- **Music:** compressed `.mp3` or `.ogg` keeps downloads small; a loop of a few MB is fine.
