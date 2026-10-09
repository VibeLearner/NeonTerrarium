# Five seeds to try first, and what to tune next

**Read this first.** I cannot listen to audio. These five were picked by rendering many seeds offline and checking numbers (no errors, no clipping, steady tempo, loudness around -13 dBFS, a healthy build-and-drop shape) and by choosing ones that differ from each other in key, mode, form and meter. They are not picked by ear. Treat them as five varied starting points, and let your Keep and Doesn't work ratings be the real selection.

To use one: type the seed, set the sliders as listed (values are 0 to 100 on the page, so 0.65 is 65), and press Restart. Game state is left at day, clear, street.

| # | Seed | Key and tempo | Sliders | What it is meant to show |
| --- | --- | --- | --- | --- |
| 1 | `101` | Db major, about 172 | Energy 70, Jazz 35, Math 20, Emo 60, Punk 65, Drum and bass 60, Synth 50, Darkness 30, Tempo feel 20, Density 60 | Bright pop punk and emo choruses over a drum and bass pulse. A half-time breakdown and bridge. The most "pop" of the five. |
| 2 | `303` | F# minor (Dorian color), about 176 | Energy 65, Jazz 50, Math 40, Emo 40, Punk 20, Drum and bass 85, Synth 80, Darkness 80, Tempo feel 30, Density 65 | The cyberpunk one. Reese bass, arps, jazzy chords, and a 9/8 (2+2+2+3) bridge that returns to 4/4. |
| 3 | `2024` | C minor, about 166 | Energy 60, Jazz 45, Math 80, Emo 70, Punk 20, Drum and bass 40, Synth 40, Darkness 60, Tempo feel 45, Density 55 | Math rock and midwest emo. A 5/4 (2+3+3+2) bridge, twinkly plucks, slower and more spacious. |
| 4 | `404` | Bb minor, about 169 (felt as half-time) | Energy 55, Jazz 80, Math 35, Emo 35, Punk 10, Drum and bass 55, Synth 50, Darkness 50, Tempo feel 50, Density 50 | The jazz one. Slow clock, ii-V and tritone-sub color, jazz-brush drums in the breakdown and bridge. |
| 5 | `808` | Bb major (Lydian color), about 172 | Energy 85, Jazz 30, Math 30, Emo 40, Punk 80, Drum and bass 75, Synth 60, Darkness 45, Tempo feel 10, Density 80 | The loud, busy one. Driving eighths, big drops, a long build in the bridge. |

Seed 3 was chosen after a quick scan for seeds that actually get an odd-meter bridge with Math high. Odd meters show up only in some seeds and only when Math is up, as the profile suggests they do in your songs.

## What to tune next, after you rate some seeds

1. **Tempo range.** Your songs center near 148 BPM and the room sits near 170 to 176. If your Keeps cluster at the slow end, or if seeds feel frantic, lower the range in `makeSong` (`js/composer.js`) and the defaults in `style_defaults.js`.
2. **Jazz amount.** If Keeps have the Jazz slider high, raise the default. If notes feel "wrong" or crunchy when Jazz is high, the culprits to look at first are tritone substitutions and diminished passing chords in `segmentsFor`.
3. **Odd meters.** If math bridges feel jarring, shorten them or make them rarer. If they feel too safe, allow two odd bars in a row before the return.
4. **Mix.** The balance was set by numbers against your songs' averages, not by ear. The things most likely to need a hand: bass level on small speakers, how loud the twinkle and lead are, how much reverb the pads carry, and how hard the drum breaks hit.
5. **Which layers got muted.** If you solo layers and find one you mute every time, tell me. That layer's patterns or sound are the first thing to rework.
6. **The "doesn't work" notes.** Short phrases like "bass too busy" or "bridge felt lost" are the most useful input. Group them by section, layer and slider position.
7. **Unmeasured items.** Half-time share, bass mode and odd-meter share are the weakest numbers in the profile (see `STYLE_NOTES.md`). Your ratings are better evidence than they are.
