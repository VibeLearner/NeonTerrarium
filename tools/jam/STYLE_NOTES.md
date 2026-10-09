# Style notes: what the 24 songs say about your taste

These notes come from `analyze.py`, which listened to 24 of your songs and wrote `style_profile.json`. The profile holds only summary numbers (averages, spreads, per-song figures). It holds no melodies, no chord or note sequences and no audio. The songs themselves are not in this repo.

The jam room reads a handful of the aggregate numbers (through `style_defaults.js`) to set its starting slider positions. Nothing else from the songs is used.

## What the profile says, in plain language

**Tempo.** Most of your songs sit between about 125 and 165 BPM, with a median near 148. About a third read as fast (roughly 146 to 178), and one or two read as slow or half-time. That is a bit slower than the 170 to 176 target in the plan. The room still defaults to the fast end of what you have (most seeds land near 168 to 178), because that is what the plan asked for, but the data suggests you may also enjoy 150 to 165. Lowering the Drum and bass slider moves seeds toward the slow end of the range. If ratings favor slower seeds, shift the range down.

**Steadiness.** Your tempos are quite steady (beat spacing varies about 2%). Drift of around 16 BPM across a song mostly reflects sections that push or relax, not a loose clock. The room keeps a rigid clock and gets movement from section changes and half-time.

**Key and mode.** Spread across many keys, with A, G and B showing up a little more. By the major/minor test about 60% read major and 40% minor, but see the shaky list below: the bass-note test calls most of them natural minor (15 of 24), some Lydian (6) and a few Dorian (3). The room picks minor or major from the Darkness slider (it leans minor when dark), and uses Dorian and Lydian colors in some progressions.

**Chord color.** Your harmony is colorful. Roughly 6 in 10 chord moments carry an extension of some kind. Major sevenths are the most common color, then minor/dominant sevenths, then elevenths, then ninths. Sixths are rare. Suspended sounds and open fifths (power chords) are a big share, which fits pop punk and midwest emo guitar voicings. Chords change about twice per bar. The room's "jazziness" slider starts from the extension numbers here.

**Rhythm.** About 57% of onsets land on the beat, and syncopation is moderate (0.43 on a 0 to 1 scale). Off-beat eighths are common, off-beat sixteenths are less so. Swing is near straight on the median song, but a few songs are clearly triplet-feel (about a quarter of songs on average, driven by a few). So the room is mostly straight with an optional swing that rises with jazziness.

**Meter.** Almost entirely 4/4 (about 89% of analyzed windows). Odd meters appear at about 11% on average, and only 3 songs show them clearly. The room's math-rock sections therefore stay a minority of the form, and 7/8, 5/4 and 3+3+2 land cleanly on a bar boundary so the feel returns to 4/4.

**Energy shape.** Songs build about 0.7 times per minute, drop sharply about 0.9 times per minute, and have a real breakdown about every two minutes. Breakdowns take only about 6% of the time. The loudest moment usually comes late (median at about 85% through). This is why the room's form is intro, build, drop, breakdown, bridge, build, drop, outro, with the biggest drop near the end.

**Spectral character.** Bass-heavy: about 28% of energy below 60 Hz and 41% in the bass range (60 to 250 Hz). Mids carry about 17%, and very little sits above 6 kHz. The average brightness is around 1.9 kHz. That is a dark, warm, low-end-forward sound, and the room's mix is tuned in that direction, with the caveat that its sub is deliberately kept lower than the songs' so it will not shake small speakers.

## Numbers I would not lean on

- **Tempo octave.** Tempo trackers often pick half or double the felt pulse. The profile's "fast" and "mid" classes are a best guess. Half-time sections are not measured well (about 0.5% of windows), so the room's half-time share is a design choice, not something from your songs.
- **Major versus minor.** The key test favors the relative major when a song is really in minor. That is why the bass-note check is used for mode, and why the 60/40 major split above is probably too major.
- **Major sevenths and sus2.** Both are inflated. A power chord or a chord with a loose fifth and a prominent ninth reads as sus2 or maj7 to a chroma-based detector. I would treat "lots of open or suspended color" as true, and the exact 43% sus share and 38% maj7 share as too high.
- **Odd meter.** Only 3 songs show it, and detection in odd meter is the weakest part of the analysis. Treat 11% as an upper bound.
- **Bass mode (Dorian/Lydian).** Based on the single strongest bass note per song, so it is thin evidence.
- **Everything is per-song averages.** A song with a quiet intro and loud ending gets averaged. The spread columns (std, p25/p75) in the JSON show how much songs differ.

## How the profile maps to the room's defaults

| Profile figure | Where it lands |
| --- | --- |
| Ninth plus eleventh share (about 0.19) | starting Jazziness (about 0.4) |
| Odd-meter share (about 0.11) | starting Math slider (about 0.4) |
| Fast-tempo range (about 147 to 178) | tempo range for a seed, from 150 up to 178. With the default drum and bass amount most seeds land near 168 to 178 |
| Everything else (minor share, swing, syncopation, section rates, spectrum) | not wired in. I used them to sanity check my design choices and to set the mix targets by hand |

Key mode is chosen by a seeded draw that leans minor as the Darkness slider goes up, not from the profile's mode counts, because those counts are the shakiest numbers here.

## Main musical decisions I made

These were my calls; change any of them if the ratings say so.

- Key, tempo and the home progression are fixed when a seed starts. Sliders after that add or remove things (more ghost notes, more extensions) rather than reshuffling the piece, and some changes need Restart.
- Sections run 8, 16 or 24 bars. Intro happens once. A bridge can be math, jazz or emo flavored.
- Jazz recoloring is gated by the Jazziness slider: extensions, secondary dominants, tritone substitutions, ii-V approaches and diminished passing chords, with voice leading that moves each note the least it can.
- Pop punk shows up as driving eighths and open-fifth voicings, emo as sus and add9 color plus the twinkly guitar-like plucks, math as odd bars and syncopated bass, jazz as ride patterns and ghost notes, and drum and bass as chopped break patterns with a sub and reese bass.
- Half-time is used in some drops and breakdowns, both as a true slow clock and as a drum feel.
- The synthesized drums are noise and oscillator based. No samples anywhere.
