# The trailer

A 45 second film of the game, cut to **Bytes** (`assets/audio/music/Bytes.mp3`), with no text except the logo at the end.
It is played by the game itself: open the game with `#trailer` at the end of the address. Code: `js/trailer.js`.

| Time | Shot |
|---|---|
| 0 to 8.4 s | Four separate sectors (residential, commercial, luxury, industrial) joined by one metro line, turning while the day runs from morning haze through golden hour to dusk; new buildings are placed round their outer edges with the game's build animation |
| 8.4 to 13.5 s | The camera dives onto a street corner where a resident meets a neighbor; the person cam opens and the log fills in from their conversation (the corner is picked so no building blocks the view) |
| 13.5 to 19 s | Their own apartment opens in Furnish pod: the hologram scan, then two pieces of furniture are set down while the room turns |
| 19 to 21.72 s | The lull in the music: the picture glitches into the coast, a town grown along the cliffs seen whole at midday (waves and shorebirds), and glitches back out on the drop |
| 21.72 s | The drop: 3 a.m. in the rain. The crime boss's people slip out the back of the safehouse with the crates |
| 26.22 s | Four officers hurry to its front door (arriving 29.5 s), knock, two go in, and come back out with one empty crate |
| 33.72 s | The camera rises over the whole city at night, trains running between the sectors |
| 41.22 s | The logo |

The cuts land on the music's bars (160 bpm; the drop is at 21.72 s and the lull before it starts at 19.2 s).

The trailer builds its own city every time and **never saves anything**: while `#trailer` is open every `neonIsland.*` key in
the browser is locked (`js/saveguard.js`), so your own city and settings are untouched.

## Watching it

```
python3 -m http.server 8000
```

then open `http://localhost:8000/#trailer`, wait for "click to play" (it builds the city, opens the apartment once to warm
it up, and loads the coast), and click. It plays with sound. A browser window around 1920 x 1080 shows it as it will be recorded.

## Recording it (1920 x 1080, 60 fps, with sound)

```
pip3 install playwright && python3 -m playwright install chromium   # once
python3 tools/trailer/record.py
```

The film lands in `tools/trailer/out/neon-terrarium-trailer.mp4`. It runs the game in Chrome with a stepped clock
(`tools/trailer/shim.js`): time only moves when a frame has been captured, so nothing stutters or drops however slow a
frame is. Expect roughly 5 to 15 minutes. Leave the Chrome window it opens alone (it can sit behind other windows).

- `--stills` saves PNGs at 16 key moments to `tools/trailer/out/stills/` instead of a film: the quick way to check framing.
- `--until 12` records only the first 12 seconds.
- `tools/trailer/out/trailer-log.txt` notes what the trailer picked (the safehouse, the resident, the timings) and any problems.

## The coast sounds

`assets/audio/trailer/coast_flash.wav` is made entirely in code by `tools/trailer/make_coast_sfx.py` (shaped noise for the
waves and foam, synthesized plover peeps and a distant gull): no recordings and nothing AI-generated. Run it again after
changing it; `--preview` also writes an mp3 of it laid over Bytes.

## Tuning

The timings are at the top of `js/trailer.js` (`MK`), the city layout below them (`SECT`, `MEGAS`, the metro's `MT_WAY`),
and each shot's camera in `camAt`.
