# The demo clip

A 15 second captioned clip of the game being played, for ads and social posts. The game plays it itself: open it with
`?full#demo` at the end of the address. Code: `js/demo.js`.

| Time | Shot | Caption |
|---|---|---|
| 0 to 3.2 s | A cursor picks zones and places plots and floors at the city's edge, with the game's build animation | Build it block by block |
| 3.2 s | The Neon Dome and the Cloud Pagoda arrive beside them as the music drops | Landmarks rise as your city grows |
| 6.0 s | The person cam on someone out on the street, their feed and log top right | Follow anyone through their day |
| 8.4 s | The Acoustic Panel's Booth: the loop running, the magic keys played | Jam over the city's broadcast |
| 10.6 s | The Data Spire's ledger | Read your city from the Data Spire |
| 12.5 s | The police station's precinct desk | Run the precinct desk |
| 14.0 s | The title over the whole city at night | Early access on itch.io |

"All footage captured in engine" stays in the bottom right corner throughout. The music is **Night City** from 25.65 s, so its
drop lands on the megastructures; the build pops and the arrival sound are the game's own, laid in where the game played them.

The clip builds its own city every time and never saves anything, and it never reads your city or settings (`js/saveguard.js`, NT_DEMO).

## Recording it (1920 x 1080, 60 fps, with sound)

```
pip3 install playwright && python3 -m playwright install chromium   # once
python3 tools/demo/record.py --stills      # a dozen PNGs at the key moments: the quick check of framing
python3 tools/demo/record.py --preview     # a 720p, 30 fps look
python3 tools/demo/record.py               # the clip -> tools/demo/out/neon-terrarium-demo.mp4
python3 tools/demo/record.py --vertical    # the clip, plus a 1080 x 1920 version for phones
```

Before the first frame it lets the city live for a few in-game hours (so there are people out, cases on the precinct's board
and something in the Spire's ledger), which takes a few minutes. It runs the game on a stepped clock (`tools/demo/shim.js`):
time only moves when a frame has been captured, and that includes the panels' own animations and timers, so nothing stutters
however slow a frame is. `tools/demo/out/demo-log.txt` notes who was picked for the person cam, every moment as it fired, and any problems.

## Watching it live

```
python3 -m http.server 8000
```

then open `http://localhost:8000/?full#demo`, wait for "click to play" and click. (Live, the Booth's own notes play over the music.)

## Tuning

Times, captions and music are at the top of `js/demo.js` (`MK`, `CAPS`, `MUSIC`); the city below them (`CITY`, `MEGAS`, `ARRIVE`),
the build's clicks in `PLAN`, the phrase played in the Booth in `PHRASE`, and each shot's camera in `camAt`.
