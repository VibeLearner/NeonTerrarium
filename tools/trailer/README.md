# The trailer

There are two things here: **the trailer maker**, where you make your own trailers in the game (below), and the
built-in scripted trailer (further down).

## The trailer maker

Open the game with `#dev&director` on the end of the address (for example `http://localhost:8000/#dev&director`).
The first time, it asks which city to film: the city you play now, any of your save slots, or an empty map. The trailer
keeps its **own copy** of that city, so nothing you do in the trailer maker ever changes your real city or your settings.
Trailers are kept in this browser; you can have as many as you like (the menu button at the left of the timeline).

### Words used here

- **Keyframe (key):** a saved value at a moment in time. The camera has keys (where it looks, zoom, turn, tilt) and so does
  the time of day. Between two keys the game works out every frame in between; that's called *interpolation*.
- **Easing:** how the movement between two keys speeds up and slows down. Each camera key says how the camera travels to
  the next one: *flow* (a smooth curve through all the keys at a steady pace, best for long camera moves), *ease* (slows
  down into each key and pauses there), *linear* (constant speed, sharp corners) or *cut* (jumps straight to the next key,
  like a film cut).
- **Playhead:** the pink line on the timeline: the moment you are looking at.
- **Scrubbing:** dragging the playhead to see the camera at any moment.

### Making a trailer

1. **Camera:** move the view with the game's normal controls, put the playhead where you want it, press **K** (or
   "+ Camera key"). Do that at a few moments and the path appears in the city as a cyan line with pink markers. Click a key
   to change it: "Set to my view" updates it to where your camera is now, and its easing is in the panel.
2. **Building on camera:** put the playhead where the building should start and press **Rec**. Now play the game normally:
   place plots and floors, stack pods, place megastructures from the menu, draw metro lines and highways, remove things,
   change greenery. Each action lands on the *Edits* row at the moment you did it, and when the film plays it is built
   with the game's own build animation, exactly as you built it. Press Stop (or Esc) when done.
   While recording you can also open someone in the person cam, open an apartment with Furnish pod, change the look or
   the weather, or drag the time of day: those are recorded too. The camera dropdown sets what the camera does meanwhile:
   *free* (yours to move), *on path* (it follows your camera keys, so you can build "for the shot"), or *record moves*
   (your camera moves become camera keys).
3. **Time of day:** "+ Time key" saves the city's current hour at the playhead. Between keys the day runs forward (22:00
   to 02:00 goes through midnight).
4. **Effects:** "+ Effect" adds fades (in from or out to black or white), flashes, glitches, cinema bars, the logo,
   your own neon text, city lights (one by one like the game, flicker on, on, off), a look, the weather, the person cam (optionally following that
   person, with the highlight brackets, and keeping them in place so they don't wander off), following a metro train (it can drive the train along its line at a set speed, so it's where you want it), and opening an apartment. Drag an effect to move it,
   drag its right edge to change its length.
5. **Watch it:** *Preview* plays the camera, time and effects from the playhead, live, without rebuilding anything.
   *Play film* reloads the trailer's city and plays the whole thing from the start with every edit built as it happens
   (*From here* starts at the playhead). Esc stops.

Other things: drag anything on the timeline to retime it (hold Alt to move it freely; otherwise it snaps to 0.05 s);
double-click a key to jump to it; Delete removes what's picked; Ctrl or Cmd + Z undoes; **T** hides the timeline so you
can build with the whole screen. On an edit, "Spread out" spaces it and the ones after it evenly up to the next camera
key, which is handy for turning a quick burst of building into a steady build-up.

If you record from the middle of a trailer, the city first has to look the way it does at that moment, so it asks to
reload the city with every edit before the playhead built.

### The scripted trailer, editable

`tools/trailer/neon-terrarium.trailer.json` is the built-in trailer remade for the trailer maker (without the apartment
and the coast, so it runs 53.55 s and everything from the metro ride on is 15.95 s earlier than in the scripted one).
Import it from the menu ("Import a trailer file"). It runs 61.15 s and has the trailer's city, the 139 builds of the opening build-up on
the Edits row, the camera path (the turntable, the dive into the garden, the ride past the landmarks, the pull back over
the dense city), the time of day, three person cam stretches in the garden (each on whoever is nearest that spot when the film starts, held in place),
a flash into the ride, the ride train driven along its line with the camera on it, a fade through black for the night,
the lights coming on one by one as they do in the game (about 9 s), the logo and the fade out. The
arcology (trailer-only geometry) is replaced by ordinary towers and the night comes in through a fade to black instead.

### Getting the video

Open the menu (the trailer's name at the left), set the music start and fade, then **Export file**. Then on your Mac:

```
python3 tools/trailer/record.py --project ~/Downloads/your-trailer.trailer.json --preview   # quick 720p look
python3 tools/trailer/record.py --project ~/Downloads/your-trailer.trailer.json            # the 1080p 60 fps film
```

The film lands in `tools/trailer/out/` named after the trailer. The recorder plays it frame by frame (like the built-in
trailer below), so it never lags however heavy the scene, and the music is laid in afterwards.

What it can't do yet: the furnishing itself inside an apartment (dragging furniture in the lab) isn't recorded, only
the apartment opening and closing; the coast isn't available as a scene; and megastructures that would normally arrive
on their own are switched off in the trailer maker (place them from the menu instead, so they are on the timeline).

# The built-in trailer

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
