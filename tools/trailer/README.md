# The trailer

A 69.5 second film of the game, cut to **Bytes** (`assets/audio/music/Bytes.mp3`), with no text except the logo at the end.
It is played by the game itself: open the game with `#trailer` at the end of the address. Code: `js/trailer.js`.

| Time | Shot |
|---|---|
| 0 to 8.4 s | Four sectors with a metro winding through all of them, turning while the morning comes up; about a hundred buildings are placed round their edges with the game's build animation until the city fills the frame |
| 8.4 to 27.9 s | The camera dives into a garden; the person cam goes through three people there (about six seconds each), its log filling in from what they say. The third says goodnight and walks into their building |
| 27.9 to 36.6 s | Their apartment opens in Furnish pod: the hologram scan, then a piece of furniture, a ceiling light and a plant on a table are set down while the room turns |
| 36.6 to 41.95 s | A glitch into the coast: a town over the cliffs and the land behind them, at midday, seen whole (shorebirds), and a glitch out |
| 41.95 s | A metro seen from the side (a little zoomed out, so the landmarks show whole), past the foundry and factories, the Neon Dome, the market mall and towers, then out over the clouds at golden hour |
| 54.2 to 57.4 s | A long arcology at the dense city's front edge sweeps across and fills the whole frame for about three seconds while dusk turns to night. The camera then pulls back and swings round over the dense neon city in the dark, the arcology at the right edge, the city and the metro running on past the edges of the frame |
| 62 s | The city's lights flicker on |
| 65 s | The logo |

Bytes plays as it is, from the top.

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
- `--preview --from 24 --until 37` makes a quick 1280 x 720, 30 fps film of just that stretch (here the furnish scene) to
  `tools/trailer/out/trailer-preview.mp4`. The trailer still plays from the top with the same stepped clock, so it never
  lags, but only that stretch is captured. Use it to check a scene that stutters when watched live in the browser.
- `tools/trailer/out/trailer-log.txt` notes what the trailer picked (the safehouse, the resident, the timings) and any problems.

## The coast sounds

`assets/audio/trailer/coast_flash.wav` is made entirely in code by `tools/trailer/make_coast_sfx.py` (shaped noise for the
waves and foam, synthesized plover peeps and a distant gull): no recordings and nothing AI-generated. Run it again after
changing it; `--preview` also writes an mp3 of it laid over Bytes.

## Tuning

The timings are at the top of `js/trailer.js` (`MK`), the city layout below them (`SECT`, `MEGAS`, the metro's `MT_WAY`),
and each shot's camera in `camAt`.
