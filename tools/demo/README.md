# The demo clip

A 15 second clip of the game being played, for ads and social posts. The game plays it itself: open it with
`?full#demo` at the end of the address. Code: `js/demo.js`.

| Time | Shot |
|---|---|
| 0 to 2.6 s | Up close on a plaza in a big night city: a cursor picks zones and places buildings, the last a floor on a tenement there |
| 2.6 s | The person cam on someone who lives in that tenement, their log filling in, and in through their front door |
| about 4.2 s | The hologram into their apartment, furnished by the game from who lives there. The Plants catalog opens, a bonsai is set on their table, picked, and its color changed in its color menu |
| 7.75 s | Exit, and the game's own power-down back to the city |
| 8.4 s | A pan to the Grid, a double click, the Acoustic Panel. The Booth loop that has been playing all along is missing two notes in its first bar; both are drawn into its note strip and play on the very next pass, then the panel closes with the music going on |
| 11 s | The camera pulls out over the whole city and the title (`assets/trailer/neon_terrarium_title.svg`) comes on |

Captions name the first four beats and "All footage captured in engine" stays in the bottom right corner throughout.

**The music is the game's own:** a Booth loop broadcast on the Grid from the first frame, the two notes added to it, and the build
sounds. Every time in the clip is fixed so the picture and the sound line up; the furnishing fits into however much time the
apartment's room leaves before the Exit.

The clip builds its own city every time and never saves anything, and it never reads your city or settings (`js/saveguard.js`, NT_DEMO).

## Recording it (1920 x 1080, 60 fps, with sound)

```
pip3 install playwright && python3 -m playwright install chromium
python3 tools/demo/record.py --stills
python3 tools/demo/record.py --preview
python3 tools/demo/record.py --vertical
```

The first makes PNGs at the key moments in `tools/demo/out/stills/`. The second is a quick 720p look. The third is the clip
(`tools/demo/out/neon-terrarium-demo.mp4`) plus a 1080 x 1920 version for phones.

It works in two passes. The picture: the game runs on a stepped clock (`tools/demo/shim.js`) and every frame is captured in turn,
so nothing stutters. The sound: the clip plays again in real time in a hidden browser and everything the game sends to the speakers
is recorded (`tools/demo/audio.js`). Each pass first lets the city live for a few in-game hours and opens the apartment once to
warm the lab up, so expect a few minutes before each starts.

Both passes run in a headless browser (no window), where the page is exactly 1920 x 1080 whatever your screen; a clipped window was
what put the trailer's title and log off center. `--window` films the picture in a visible Chrome window instead, only if headless
draws wrong on your Mac.

`tools/demo/out/demo-log.txt` notes who was picked, when the room was ready, what was placed and every moment as it fired.

## Tuning

Times are at the top of `js/demo.js` (`MK`), captions in `CAPS`, the loop and its two missing notes in `MELODY` and `MISSING`,
the city in `CITY`, `PLAZA` and `MEGAS`, and each shot's camera in `camAt`.
