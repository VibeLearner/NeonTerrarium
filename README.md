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
js/world.js             the game world: cells, building stacks, batching, edits, build and remove animations, saving
js/input.js             camera, mouse / touch / keyboard, settings panel
js/main.js              start-up and the frame loop
assets/sprites/         sprite PNGs at true pixel size (one file per sprite; the name is the sprite's id)
assets/audio/music/     music (coming next)
assets/audio/sfx/       sound effects: place.wav (build pop), remove.wav (removal thud), radio-on.wav (radio station arrives)
assets/audio/sfx/originals/  the untouched source recordings, for re-editing
```

The scripts are ordinary (non-module) scripts that share one scope, so the order in `index.html` matters.

## Megastructures

Landmarks that take over a block of plots once the city is big enough. Each exists at most once.

- **Radio station:** unlocks when there are 20 building sections of every zone. From then on, each build has a
  1 in 30 chance of bringing it in, on the 2x2 block nearest that build (replacing what stood there). Right-click
  removes it; it can come back once the city meets the requirement again.
- **Sky mall:** a 3x2 block (either way round). Unlocks at 50 luxury and 30 industrial sections, then a 1 in 50
  chance per build. An octagonal white-and-gold mall on white columns, each side one sheet of glass looking into
  an open atrium with walkways and boutiques round a central core; the roof is mostly pool under a white canopy.
  Click its roof with a zone picked to stack another tier of two floors (up to 3); right-click takes the top tier off.
- **Town square:** a 5x5 open plaza. Unlocks at 40 residential and 40 commercial sections, then a 1 in 40 chance
  per build. A holographic koi pond at its heart (a 10-frame neon sprite sheet, assets/sprites/koi_neon.png, played
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
- New megastructures go in `MEGA_TYPES` at the top of `js/mega.js` (requirement, odds, footprint, max tiers).
- For testing, open the game with `#dev` at the end of the address and press **M** (radio station), **N** (sky mall), **B** (town square), **V** (foundry) or **C** (police station)
  to bring it in, or remove it, next to the plot under the pointer, skipping the requirement and the odds.

## Adding art and sound

- **Sprites:** add the PNG to `assets/sprites/`, then add its size and anchor to the `SPR` table at the top of `js/sprites.js`.
- **Sound effects:** short effects are trimmed and sped up to match the animations, then saved as small mono `.wav` files (no playback delay). Register a new one in `SFX_FILES` at the top of `js/audio.js` and call `sfx.play('name')`.
- **Music:** compressed `.mp3` or `.ogg` keeps downloads small; a loop of a few MB is fine.
