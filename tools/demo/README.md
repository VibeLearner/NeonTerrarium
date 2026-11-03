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
| 5.15 s | The game's hologram into their apartment, furnished by the game for that household. The Plants catalog opens, a bonsai is set on their table, the view eases in on it and its color is changed in its color menu |
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
