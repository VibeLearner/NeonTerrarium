# Neon Terrarium Jam Room

A standalone procedural-music playground for the Neon Terrarium soundtrack. Every sound is synthesized in the browser with the Web Audio API, and every note comes from seeded rules. There are no samples, no recordings and no AI-generated audio. Your own songs were used only to set a few default slider positions (see `STYLE_NOTES.md`).

The game's own files are untouched. Everything lives in `tools/jam/`.

## Open it

1. Open `tools/jam/index.html` in Chrome by double-clicking it or dragging it into a window. It works from `file://` and needs no server or internet.
2. Click **Play**. Browsers only allow sound after a click, so nothing plays before that. The space bar also starts and stops.
3. Turn the master volume up slowly the first time.

## Controls

**Transport**
- **Composer** switch: **Old composer** is the first version, **New composer** is round 2 (the default). Switching restarts the same seed with the same sliders, so you can hear both. Ratings record which one was playing.
- **Seed** is any text. The same seed with the same sliders always plays the same piece.
- **New seed** picks a fresh one. The arrows step back and forward through the seeds you have visited. **Load** uses whatever is typed in the box. **Restart** replays the current seed from the top with the current settings.

**Genre blend (sliders)**
- **Drum and bass**: chopped breakbeats, reese bass, a fast pulse. Higher also pulls tempo toward the top of the range.
- **Jazz**: sevenths, ninths, elevenths, ii-V and passing chords, swing in quiet parts.
- **Math rock**: odd-meter bridges (7/8, 5/4, 9/8) and 3+3+2 patterns that land cleanly back in 4/4.
- **Midwest emo**: open add9 and sus chords, strums, long crescendo builds.
- **Pop punk**: driving eighths, major-key choruses, power bass.
- **Synth flavor**: reese bass, detuned saw shimmer, arpeggiated leads.

**Feel (sliders)**
- **Energy**: how full the arrangement is. Low energy drops layers.
- **Darkness / mood**: minor and phrygian color against major and lydian. Chosen when a piece starts.
- **Density**: how many optional notes happen (ghost notes, hat sixteenths, pickups).
- **Tempo feel**: full time on the left, half-time (about 85) on the right.
- **Tapping riffs**: new composer only. Some phrases hand the tune to a fast, syncopated tapping figure in the twinkle, and the lead answers on the cadence bar. See `NOTES4.md`.
- **Tempo (BPM)**: far left is Auto (the Drum and bass slider picks it). Otherwise 60 to 200. Optional notes, strums, slow attacks, swing and half-time all follow the tempo you set. See `NOTES3.md`.

Most sliders take effect smoothly while music plays and add or remove features instead of reshuffling the piece. Key and the home chord progression are fixed when a seed starts (the tempo is too while on Auto; the Tempo slider changes it live), so after big moves to Darkness or Drum and bass, press **Restart** to hear them fully.

**Game state preview**
- **Time of day** (day, dusk, night), **weather** (clear or rain) and **camera** (street or zoomed out and busy) nudge the sliders and mix the way the game would. The sliders themselves stay put.
- **Gated reverb** adds the 80s snare tail and pumped pads. **Vinyl**, **City hum** and **Radio crackle** switch the texture layers.

**Mixer**: a fader, mute and solo for each layer (drums, bass, keys, twinkle, pads, lead, texture). Use solo to judge one layer by itself.

**Rating**
- **Keep** or **Doesn't work**, with an optional note. Each rating stores the seed, the slider settings, the game state and where in the form you were, so the exact piece can be replayed.
- Ratings are saved in the browser (localStorage) if the browser allows it. To be safe, use **Export JSON** when you are done. It downloads a file named like `jam-ratings-YYYYMMDD-HHMM.json`. **Copy JSON** puts the same text on the clipboard, and **Clear list** empties the list. Press the play button on a rating to load its seed and settings again.
- Send the exported file back so the defaults can be tuned from it.

**NPC motif test**: any number turns into a short theme in the current key and mood. Try a few to hear how a tracked character could get its own tune.

**Display**: the top panel shows the current section, bar, chord, key, meter and tempo, a beat grid, a form timeline and a spectrum. The small "voices / ahead" line in the header is a health check: voices playing now, and how many seconds of music are scheduled ahead of the audio clock. Ahead should stay above about 0.1 s.

## Export format

```json
{
  "app": "neon-terrarium-jam-room",
  "version": 1,
  "exported": "ISO date",
  "currentSettings": { "seed": "...", "params": { "...": 0.5 }, "game": { "tod": "night", "rain": true, "view": "street" } },
  "ratings": [
    { "id": "...", "time": "ISO date", "verdict": "keep", "note": "...",
      "seed": "1234", "params": {}, "startParams": {}, "game": {},
      "song": { "key": "A minor", "bpm": 174, "home": "...", "scale": "..." },
      "at": { "section": "drop 3/16", "meter": "4/4", "bar": 41 } }
  ]
}
```

## How it is built

| File | Job |
| --- | --- |
| `index.html`, `jam.css` | the page |
| `js/rng.js` | seeded random numbers (every decision is a fixed draw compared to a slider level) |
| `js/theory.js` | scales, chord building, a curated progression list, smooth voice leading |
| `js/composer.js` | the old composer: form, meter, chords, motifs, drum and bass rules, fills, game-state modulation |
| `js/rules.js` | the hand-written rule book shared by the new composer and `lint.js`: register bands, ring and release times, chord scales, avoid notes, cadences, non-chord-tone figures, the checks |
| `js/motif.js` | the new composer's motif engine: rhythm cells, interval shapes, development ops, the seeded phrase search |
| `js/composer2.js` | the new composer: harmony timeline, phrases and cadences, arc, layers that leave room, validator |
| `lint.js` | Node-only checker (`node lint.js --random 200`) that counts rule violations per 100 bars for both composers |
| `js/synth.js` | all sounds, the mixer, effects, and the master limiter |
| `js/engine.js` | scheduling on the audio clock, one bar ahead of the music |
| `js/ui.js` | controls, display, ratings |
| `style_defaults.js` | the few aggregate numbers used for default sliders |
| `analyze.py` | the analyzer that made the style profile |
| `style_profile.json` | per-song and aggregate summary numbers (no notes, no audio) |
| `STYLE_NOTES.md` | what the profile says, and which numbers are shaky |
| `SEEDS.md` | the eight seeds to try first, the listening guide, and what to tune next |
| `NOTES2.md` | what round 2 changed, the lint table before and after, decisions, and what was skipped |

**Sounds**: Karplus-Strong plucked twinkle with chorus, an FM electric piano, detuned-saw pads, sub and reese bass, a saw and square lead with portamento and an arpeggio mode, a synthesized drum kit with chopped breaks, ghost notes and cymbals, and vinyl, rain, city hum and radio textures.

**Safety and quality**: a soft clipper and limiter on the master, every voice fades in and out to avoid clicks, per-layer voice caps with voice stealing, scheduling on the audio clock (a background timer only wakes it), and a hard cap on master output.

## Re-running the analyzer

`python3 analyze.py --help`. It needs librosa and numpy, reads a folder of your songs, and writes `style_profile.json` and `style_defaults.js`. It also writes `song_index.local.json` (a private map from ids like s01 to file names) and a `_cache/` folder. Both are git-ignored. Do not commit the songs.

## Export MIDI and hear the notes on good instruments

Press **Export MIDI** (next to Export JSON). You get 64 bars of the current seed and sliders as a MIDI file, one track per layer (Bass, Keys, Twinkle, Pads, Lead) and Drums on channel 10 with General MIDI note numbers. The tempo and the 5/4, 7/8 and 9/8 bars are written into the file. In the published page the browser can only save a few file types, so the file arrives inside a `.zip`; unzip it first.

In GarageBand: drag the `.mid` onto an empty project (or File > Import). Each track becomes a software instrument; change the instruments to something good (a Steinway or Rhodes for Keys, a clean electric guitar for Twinkle, a drum kit for Drums), and press Play. If the notes sound right on those instruments, the problem is the sounds in the jam room, not the music.
