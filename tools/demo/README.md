# The demo clip

A 15 second clip of the game being played, for ads and social posts. Code: `js/demo.js`. It runs on the trailer's stage engine
(the `#stage` film on the trailer branch): **every action is scripted**.

- The game's simulation is off: nobody walks or decides by themselves, no traffic, drones, stories or cases, and no landmark arrives
  on its own. The people on screen are a cast, each move written for them.
- Every building is made from a seed of its own, so every run builds the same city, the same five buildings and the same apartment.
- The film's clock is its own frame count. While the apartment lab is still working, the film holds and nothing is filmed, so
  nothing lags or skips however slow a frame is.

| Time | Shot |
|---|---|
| 0 to 1.6 s | Up close on a plaza in a big night city: the cursor picks zones and puts up the first two buildings |
| 1.6 s | The person cam opens on a resident of the first building, standing on the plaza: their feed (always on them, at an angle with nothing in the way), their name and log |
| 2.1 to 5 s | Three more buildings go up while they walk to their door, and in |
| 5 s | A quick run of the game's hologram, from where the push in ends, into their apartment, furnished by the game for that household. The Plants catalog opens, a bonsai is set on their table, the view eases in on it and its color is changed in its color menu |
| 10.6 s | Exit, and the game's own power-down back to the city |
| 11.05 s | The camera pulls out over the whole city and the title comes on |

The Grid's Booth loop (`js/demo_loop.js`) plays under the whole clip from the first frame.

Captions name the beats, and "All footage captured in engine" stays in the bottom right corner throughout.

Before the film rolls it works everything out: it puts the five buildings up once to find which way the first one's door faces and
who lives there, picks camera angles with nothing between them and the walk, opens the apartment once so the lab furnishes it for
that household, then clears the plaza and builds it again on camera.

The clip never saves anything and never reads your city or settings (`js/saveguard.js`, NT_DEMO).

## Recording it (1920 x 1080, 60 fps, with sound)

```
pip3 install playwright && python3 -m playwright install chromium
python3 tools/demo/record.py --stills
python3 tools/demo/record.py --vertical
```

The first makes PNGs at the key moments in `tools/demo/out/stills/`. The second makes the clip
(`tools/demo/out/neon-terrarium-demo.mp4`) plus a 1080 x 1920 version for phones. `--preview` makes a quick 720p look.

Both run in a headless browser (no window), where the page is exactly 1920 x 1080 whatever your screen. The picture is filmed a
frame at a time in render mode (every frame drawn whole, as the trailer's film was). The sound is recorded in a second pass that
plays the clip in real time, drawing nothing, and records what the game sends to the speakers: the Grid's Booth loop
and the build sounds. `--window` films the picture in a visible Chrome window instead, only if headless draws wrong on your Mac.

`--test` checks the clip on a machine with no graphics card (software drawing, the real layout at half the pixels, no sound, very slow);
`--nolab` leaves the apartment out of a check.

`tools/demo/out/demo-log.txt` notes the plan (the door, who lives there, the camera angles and whether they're clear), how long the
film held for the lab, what was placed and every moment as it fired.

## Tuning

Times are at the top of `js/demo.js` (`MK`, `CLICK_T`), captions in `CAPS`, the buildings in `BLOCKS`, the Booth loop in `js/demo_loop.js`, the city in `CITY`, `PLAZA` and `MEGAS`, and each shot's camera in `camAt`.

## The long cut (29 s)

`python3 tools/demo/record.py --long` (with `--stills` or `--vertical` as above) makes `neon-terrarium-demo-long.mp4`: no captions and no
"All footage captured in engine" badge, and everything at an easier pace.

- The build runs to 5 s, the walk home to 6.5 s.
- In the apartment, the furnisher's own sofa (the biggest seat it put in) is noted and taken out before the film. On camera the cursor goes to
  Furniture, its Sofas, and a tile of that same sofa, resting on each before it presses; the tile pressed is the very piece that comes in,
  looking as its tile does. It rides under the cursor out of the catalog and across the room, and is set down where the furnisher had it.
  Then its color menu, and the part that differs (the cushions, usually) goes to the color the furnisher had picked. The tile is chosen
  beforehand as the one of that sofa whose own color is furthest from the furnisher's, so the change shows.
- The household runs warm for this cut, so the furnisher's own rules light the home more (a lamp by the sofa, warm ceiling lights, bedside
  lamps), and every lamp is set to a warm tungsten color (neon signs keep theirs). Before Exit the work light goes off, and the home is seen
  by its own lamps.
- No music: the Booth loop is left off (the game's own build sounds stay).
- The pull out over the city starts at 23 s and the title holds to the end.

Its apartment steps are in `RL` and its times in `MK` at the top of `js/demo.js`; the sofa is `SOFA`.

## The 30 s cut (wide and tall)

`python3 tools/demo/record.py --tod --both` makes `out/neon-terrarium-demo-30s.mp4` (1920 x 1080) and `out/neon-terrarium-demo-30s-tall.mp4`
(1080 x 1620), each filmed natively, plus a `-compressed.mp4` copy of each. No captions; "All footage captured in engine" in the corner.

| Time | Shot |
|---|---|
| 0 to 2.3 s | Two homes go up on the plaza (three floors and two) |
| 2.3 to 5.35 s | The person cam on a resident of the first, walking in at the door |
| 5.35 to 16.6 s | Into their apartment: the long cut's sofa scene, its color, the warm lamps, the work light off; Exit |
| 17 to 19.5 s | Out over the whole city, then a slow, steady turn |
| 19.6 to 27 s | Cuts through the day as it turns: morning, overcast afternoon, golden hour, rainy dusk, rainy late night (`TOD_JUMPS` in `js/demo.js`) |
| 27 to 30 s | Back to a clear night and the title |

## The 19 s cut (wide and tall)

`python3 tools/demo/record.py --mid --both` makes `out/neon-terrarium-demo-19s.mp4` (1920 x 1080) and `out/neon-terrarium-demo-19s-tall.mp4`
(1080 x 1620), each filmed natively, plus a `-compressed.mp4` copy of each to post.

- The long cut's apartment scene (the furnisher's sofa put back on camera, its color, the warm lamps, the work light off), at a quicker pace.
- The 15 s clip's captions and Booth loop, with every caption on the right; the person cam sits top left for it.
- 0 to 5 s the city and the walk home, 5 to 14.6 s the apartment, then the pull out and the title, ending at 19 s.

## The procedural generation cut (60 s)

`python3 tools/demo/record.py --pg` makes `tools/demo/out/neon-terrarium-procgen.mp4` (code: `js/demo_pg.js`, opened with `index.html?full#demo&pg`).
No captions; the cursor, the zone bar and the Grid's music player are the only interface on screen, with "Neon Terrarium" small in the
bottom right.

| Time | Shot |
|---|---|
| 0 s | One bare plot in the night sky |
| 1 to 11 s | Each zone picked on the zone bar and built, then stacked: Residential, Commercial, Luxury, Industrial |
| 11.6 to 18 s | One tower of every zone stacked on each other (zones picked with the number keys) |
| 19 to 25 s | A tall Commercial building, and three homes hung off its side |
| 26 to 28 s | The building taken down a section at a time (right-click): the homes go onto scaffolds of their own |
| 29.6 to 41.5 s | Its bare plot cycled to lawn, then fifteen lawn plots laid beside it: the garden grows its paths, pieces, pond and bridge |
| 47 to 60 s | The camera pulls out over the whole city; a fade to black at the very end so it loops |

- The music is the Grid's own live music (it stands far out of sight, so it plays from the first frame). It is never the same twice, so for
  `--pg` the sound pass runs first and notes what the player showed each moment (`out/procgen-deck.json`); the picture pass then shows exactly
  that, so the player on screen matches what you hear.
- The garden's rolls come from a salt picked before the film: it tries 500 and keeps the one that grows a pond of 2 to 5 plots partway
  through, a bridge and a gazebo. What it picked, and everything else the plan saw, is in `out/procgen-log.txt`.
- `--stills` (PNGs at the key moments, no sound pass, so the player there shows live music), `--preview` and `--test` work as for the clip.

Tuning: the clicks are `ACTS` at the top of `js/demo_pg.js` (time, kind, plot), the garden's plots and their order `LAWNS`, the camera's shots
`shots()` and its slow turn `yawAt`.

## The city cut (18 s, wide and tall)

`python3 tools/demo/record.py --city --both` films it twice, natively each time: `out/neon-terrarium-city.mp4` (1920 x 1080) and
`out/neon-terrarium-city-tall.mp4` (1080 x 1620), each with its own sound pass. Opened by hand: `index.html?full#demo&pg&city`.

- 0 to 3.8 s: the cursor builds three plots by hand, each a different zone (Commercial, Residential, Luxury).
- 4.2 to 12.8 s: the rest rises on its own, ring by ring: mostly homes and shops, an Industrial quarter at the far side, six towers mixing
  Residential, Commercial and Industrial. Luxury: three plots in the whole city, never stacked. The layout comes from its own seed
  (`cityActs` in `js/demo_pg.js`).
- 10.3 to 13.6 s: a park of about 19 lawn plots laid at the city's edge facing the camera; the camera moves in on it as it grows.
- 13.6 to 18 s: the camera pulls out and turns over the whole city; fade to black at the end.

Every run (any cut) also writes a `-compressed.mp4` copy beside the full-quality file: H.264 at about a tenth of the size, ready to post.
