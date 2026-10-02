# Neon Terrarium

A cozy, Townscaper-style cyberpunk city builder that runs in the browser. Grow a floating platform in the sky, then fill it with four zones of pixel-art buildings: residential, commercial, luxury and industrial. Neon, laundry lines, hover cars and delivery drones included.

Built with [Three.js](https://threejs.org/) r128, drawn at 480 lines and scaled up in whole pixels.

## Updates and caching

GitHub Pages takes a minute or two to publish each push, and browsers may keep the old files for up to about
10 minutes. The `?v=` on each script and stylesheet in `index.html` is bumped with every release so a
refresh picks up all the new files together; if a change doesn't show, do a hard refresh (Ctrl+Shift+R,
or Cmd+Shift+R on a Mac).

## Playing it locally

The game is plain HTML and JavaScript with no build step, but it has to be served over http (browsers block loading the sprite images straight from disk). From this folder:

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Controls

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Pick a zone | Zone A to D buttons, or 1 to 4 (Esc or 0 to deselect) | Zone buttons |
| Build | Click the sky to grow the platform; with a zone picked, click to build, click a roof to stack a section | Tap |
| Remove the top section | Right-click | Press and hold |
| Move around | W A S D (Shift for faster), H to jump back to the middle | |
| Rotate | Drag, or Q / E | Two-finger twist |
| Zoom | Scroll wheel | Pinch |

Your city saves automatically in the browser.

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
js/mega.js              megastructures: unlocking, placing, removing; the radio station
js/people.js            people: residents, jobs, daily routines, the sidewalk network, walking door to door
js/world.js             the game world: cells, building stacks, batching, edits, build and remove animations, saving
js/input.js             camera, mouse / touch / keyboard, settings panel
js/main.js              start-up and the frame loop
assets/sprites/         sprite PNGs at true pixel size (one file per sprite; the name is the sprite's id)
assets/sprites/people.png  the people atlas: 12 characters, one 16 px row each, 6 walk + 4 idle frames of 12 px
docs/people.md          the people system: how it works, plan and progress
assets/audio/music/     the music library the radio plays (see the README in that folder)
assets/ui/cassette.png  the radio's cassette (from the neon sign sheet)
js/music.js             the radio: music while the radio station stands, the cassette with the song name
tools/make_playlist.py  optional: writes assets/audio/music/playlist.json (track order, nicer titles)
assets/audio/sfx/       sound effects: place.wav (build pop), remove.wav (removal thud), radio-on.wav (radio station arrives), mega-arrive.wav (any other megastructure arrives; 4.6 s, the length of its arrival animation)
assets/audio/sfx/originals/  the untouched source recordings, for re-editing
```

The scripts are ordinary (non-module) scripts that share one scope, so the order in `index.html` matters.

## Industrial yards

Besides the halls, silos and tank yards, the industrial zone builds five small workshops: a rusty corrugated
scrap shed, a red brick gear workshop under a tiled roof, a mossy concrete repair shop with pipes over its roof, a
blue parts warehouse with a sawtooth roof, and an open timber lube shed under a glass roof, each with a lit doorway
and its own neon sign. For height there are stacked yards (two or three of the workshops piled on concrete decks with
an outside stair), an art-deco terraced foundry (stepped brick tiers with cyan neon edges, gold zigzag friezes, a
gold-fanned central pier and smokestacks) and a brutalist works tower (mossy concrete blocks with lit window grids, a
round silo with glowing portholes, rusty pipes wrapped round it). Neighbouring buildings are joined by chunky
pipework (straight runs, loops and jogs, copper elbows and collars, valve wheels, gauges, steam leaks, moss, ferns
and hanging vines), many with glass sections of glowing blue fluid. The fluid is faked in one shader material (bands,
ripples and bubbles sliding along with time, from world position), so it costs one draw per region and no per-frame
work; and neighbouring industrial buildings often by a raised conveyor belt
with crates riding along it (high enough for people to walk under). Code: `scrapShed` to `lubeShed` in
`js/buildings.js`; `BRIDGE.pipework`, `BRIDGE.conveyor` and the moving crates in `js/ground.js`.

## Megastructures

Landmarks that take a block of plots once the city is big enough. Each exists at most once. A megastructure never
replaces buildings: it takes the nearest free block (open platform, or new platform grown onto the edge of the city).
Each one arrives slowly (about four and a half seconds): its footprint is traced on the ground, a wireframe rises
out of it, then the structure is revealed from the ground up behind a glowing scan line, and its live parts (the
koi, the drone, the screens) switch on at the end.

- **Radio station:** arrives with the 20th building, of any zone (each built plot counts once; stacking doesn't
  add to it), on free ground near that build. Right-click removes it; with 20 or
  more buildings standing, the next build brings it back.
  While it stands, the radio plays the music in assets/audio/music/, shuffled, fading in slowly once the station has
  fully arrived. A neon cassette appears under the title showing the song, with previous, play/pause and next
  buttons and an equalizer that follows the music. Removing
  the station stops the music. Music volume is in Settings, Sound.
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
- New megastructures go in `MEGA_TYPES` at the top of `js/mega.js` (requirement, odds, footprint, max tiers).
- For testing, open the game with `#dev` at the end of the address and press **M** (radio station), **N** (sky mall), **B** (town square), **V** (foundry), **C** (police station), **X** (market mall) or **P** (cloud pagoda)
  to bring it in, or remove it, next to the plot under the pointer, skipping the requirement and the odds.

## People

Residents live in the buildings (seeded per section, so the same people always live in the same place), take
jobs nearby, and follow a daily routine set by the hour in Settings: busy at lunchtime, quiet late at night. They
walk the sidewalks door to door and dissolve in and out of doorways. Details and the roadmap: `docs/people.md`.

## Adding art and sound

- **Sprites:** add the PNG to `assets/sprites/`, then add its size and anchor to the `SPR` table at the top of `js/sprites.js`.
- **Sound effects:** short effects are trimmed and sped up to match the animations, then saved as small mono `.wav` files (no playback delay). Register a new one in `SFX_FILES` at the top of `js/audio.js` and call `sfx.play('name')`.
- **Music:** compressed `.mp3` or `.ogg` keeps downloads small; a loop of a few MB is fine.
