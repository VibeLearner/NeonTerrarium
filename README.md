# Neon Terrarium

A cozy, Townscaper-style cyberpunk city builder that runs in the browser. Grow a floating platform in the sky, then fill it with four zones of pixel-art buildings: residential, commercial, luxury and industrial. Neon, laundry lines, hover cars and delivery drones included.

Built with [Three.js](https://threejs.org/) r128, drawn at 480 lines and scaled up in whole pixels.

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
js/world.js             the game world: cells, building stacks, batching, edits, build and remove animations, saving
js/input.js             camera, mouse / touch / keyboard, settings panel
js/main.js              start-up and the frame loop
assets/sprites/         sprite PNGs at true pixel size (one file per sprite; the name is the sprite's id)
assets/audio/music/     music (coming next)
assets/audio/sfx/       sound effects: place.wav (build pop), remove.wav (removal thud)
assets/audio/sfx/originals/  the untouched source recordings, for re-editing
```

The scripts are ordinary (non-module) scripts that share one scope, so the order in `index.html` matters.

## Adding art and sound

- **Sprites:** add the PNG to `assets/sprites/`, then add its size and anchor to the `SPR` table at the top of `js/sprites.js`.
- **Sound effects:** short effects are trimmed and sped up to match the animations, then saved as small mono `.wav` files (no playback delay). Register a new one in `SFX_FILES` at the top of `js/audio.js` and call `sfx.play('name')`.
- **Music:** compressed `.mp3` or `.ogg` keeps downloads small; a loop of a few MB is fine.
