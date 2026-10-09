# Round 5 notes: recorded sounds, instrument menus and a real mix

Branch `wip/jam-room-sound`, started from `wip/jam-room-4` at 2724c40. Everything is under `tools/jam/`. Nothing outside it was touched, nothing was merged, and the synth sounds are all still there ("Synth sounds" is one click away).

The notes did not change. Same seed and sliders give the same piece; the samples only change what the notes are played on.

## What each item changed

**1. MIDI export** (`js/midi.js`, commit bc1591a). An Export MIDI button writes the current seed and sliders as 64 bars, one track per layer (Bass, Keys, Twinkle, Pads, Lead), drums on channel 10 with General MIDI numbers, with the tempo changes and the 5/4, 7/8 and 9/8 bars written in. In the published page it arrives inside a `.zip` because the browser sandbox only saves a few file types. README has the GarageBand steps.

**2. Sample pack builder** (`samples/build.py`, a704880). Sparse, pinned downloads (`samples/pins.json`) of only the chosen instruments, never whole libraries. Per file: trim silence, cut the tail with a fade, equalize loudness per instrument, tune by spectral peak, mono 48 kHz Ogg Opus (libopus, bit-exact flags). Output is `samples/pack/`, `manifest.json` and `CREDITS.md`. The source WAVs live in `samples/_src/` and are git-ignored. The build is repeatable from the pinned commits. `check_licenses.py` fails on any shipped file without a CC0 source (tested against a bogus file).

**3. Sampler in the engine** (`js/sampler.js`). Lazy loading with `decodeAudioData`, only the instruments the settings use, with a "Loading sounds: N of M files" line. Anything not loaded yet plays on the synth, so playback never waits. Nearest sample by pitch, shifted with `playbackRate` (octave folding, per-sample tuning in cents), velocity layers, round robins that never repeat the same sample twice in a row, seeded tiny level variation (about 0.5 dB). Each hit and note has a 1.2 ms fade-in, because 132 of the 600 trimmed files begin mid-wave (worst 20% of peak, a ride). Plucks are cut at `J.RING.newMax` (1.2 s) with a short release, damping follows the round 2 rules, and voice caps steal the oldest note with a 12 ms fade. `J.RING.sampled` in `rules.js` lists the longest recorded tail of every instrument, and `lint.js` now fails if that table disagrees with the manifest.

**4. Drums from samples.** Two kits, picked automatically per bar: *tight* (Unruly kick and snare, Big Rusty ride, crash and toms, tuned up 2 to 3.5%) for drum and bass, punk and emo, and *jazz* (soft Unruly layers, side stick, brush hats, ride bow, brush toms) for half-time and jazz bridges. The drum bus: per-hit high-pass on everything except the kick, a brighter snare, a transient lift, a compressor (attack 12 ms, ratio 4) and parallel tanh saturation. The kick is the sample plus a short sine sub tuned to the tonic of the key. Hat chokes open hat. The composer's patterns, ghost notes and fills are untouched.

**5. Instruments per layer.** Twinkle: Black And Green Guitars (Gretsch), "twang" for arpeggios, "staccato" for accented riff notes, "hammer-on" for the other notes of tapping riffs. Alternatives: vibraphone, glockenspiel, marimba, kalimba. Keys: VCSL TX81Z FM Piano through a little tremolo and chorus; alternative VCSL upright piano; or the synth. Bass: sub and reese stay synthesized; the plucked bass mode uses double bass (Meatbass) in jazz and verses, bass guitar (Fashionbass) in choruses. Every layer has an instrument menu in the mixer, saved with ratings. Pads and lead stay synthesized but are upgraded: pads are five detuned saws spread across the stereo field with a per-note filter envelope, three shared slow drift sources (about 5 to 8 cents, 0.07 to 0.17 Hz), parallel soft saturation and the existing chorus; the lead filter now opens with velocity and the vibrato starts late (after 0.2 s, full at 0.6 s).

**6. The mix** (`js/synth.js`). Per layer: high-pass (keys 85 Hz, twinkle 170, pads 110, lead 150; none on kick and bass), a static cut for mud (pads 260 Hz -2.5 dB, keys and twinkle about 300 Hz -2 dB). While the lead plays, pads dip 4 dB and keys 3 dB around 3 kHz. Bass is summed to mono; the kick is a mono sample plus a centered sine. The existing kick pump now also ducks the bass (half the pad depth), and its depth already follows the drum and bass slider. Sends: the original 2.8 s hall plus a new 0.7 s room (generated noise impulse responses) for drums, keys and lead, and the existing tempo-synced ping-pong delay for twinkle and lead. Bus: glue compressor (2:1, -20 dB, 30 ms attack), tape-style saturation in parallel with a gentle high shelf, then the old soft clip and limiter. Game presets: rain darkens the hall (14 kHz down to 3.5 kHz low-pass) and widens it with two decorrelated copies; night warms the tape (more saturation, shelf to -4 dB); zoomed out raises the hall send by 60% and cuts the room by 70%. The "Mix chain" checkbox turns all of this off for comparison (the synth sounds themselves are unchanged by it, except pads, which keep the upgrade).

**7. Compare.** "Synth sounds" and "Sampled sounds" buttons, same seed and sliders. Ratings record which one was playing, the instrument of every layer, and whether the mix chain was on. "Switch between synth and sampled every 8 bars" alternates at the bar line.

## Pack sizes

| Group | Files | Size |
| --- | --- | --- |
| kit_tight | 60 | 0.27 MB |
| kit_jazz | 51 | 0.27 MB |
| gtr_green | 180 | 1.55 MB |
| fmpiano | 48 | 1.04 MB |
| bass_fashion | 78 | 0.79 MB |
| bass_double | 78 | 0.84 MB |
| vibes | 20 | 0.43 MB |
| glock | 7 | 0.12 MB |
| marimba | 30 | 0.31 MB |
| kalimba | 24 | 0.25 MB |
| upright | 22 | 0.40 MB |
| **Whole pack** | **600** | **6.29 MB** (budget 25 MB) |

The default set the page loads (both kits, FM piano, guitar, both basses) is 495 files, 4.75 MB. The plan's "drums, keys, one guitar" set is 3.13 MB (budget 10 MB). Alternatives load only when chosen.

## Checks

| Check | Result |
| --- | --- |
| `lint.js`, five SEEDS.md settings | all rules 0, same as round 4 |
| `lint.js`, 200 random seeds | clash 0.3, parallel 0.1 per 100 bars, same as round 4 (known residual from round 2) |
| Ring table | `J.RING.sampled` matches the pack; sampled plucks cut at 1.2 s |
| `check_licenses.py` | OK, 600 files, 6 libraries, all CC0 1.0 |
| Pack sizes | 6.29 MB total, 3.13 MB default |
| Scheduler, headless Chrome, samples loaded, 60 s | slack min 0.314 s, median 0.382 s (lookahead 0.35 s); 39 bars, 0 late; 0 console errors |
| Offline render, the 8 SEEDS.md seeds, 50 s each, sampled sounds | see below |

Offline render (sampled sounds, mix chain on, 44.1 kHz, ITU-R BS.1770 integrated loudness):

| Seed | LUFS | Peak | Clipped samples |
| --- | --- | --- | --- |
| 1 harbor-po | -14.26 | 0.685 | 0 |
| 2 ember-ja | -14.35 | 0.690 | 0 |
| 3 303 | -13.37 | 0.700 | 0 |
| 4 delta-ma | -15.05 | 0.687 | 0 |
| 5 808 | -13.83 | 0.695 | 0 |
| 6 delta-po | -14.01 | 0.683 | 0 |
| 7 birch-cy | -14.06 | 0.698 | 0 |
| 8 fjord-pu | -14.34 | 0.684 | 0 |

Mean -14.0 LUFS, range -13.4 to -15.1. Seed 4 sits lowest because its intro and 12-bar half-time breakdown are sparse; 50 s only reaches the first sections. No clicks: with the 1.2 ms fade-in the largest single-sample step in the 2 kHz low-passed signal is 0.10 of full scale on any seed (a click would show 0.3 or more), the DC offset is under 0.0003, and every shipped sample ends faded (last sample under 0.6% of its peak). My broadband spike counter still flags a few transient hits on seeds 1, 2 and 5 (crash and snare attacks in noisy material, which I looked at in the waveform); it is not a click detector for percussion, so I did not use it as the pass mark. The first full render before the fade-in and the makeup change gave -12.6 to -13.9 LUFS on 60 s; makeup was lowered by 0.8 dB afterwards.

## Decisions

- **Kits**: Unruly clean kick `k20/in` and top snare, Big Rusty ride 22, crash 17 and toms, tuned up about 2 to 3.5% for the tight kit. Four velocity layers and 2 to 3 round robins for kick, snare and closed hat.
- **Guitar**: green Gretsch only (the Hofner was left out to stay in the size budget). Notes every 2 semitones, two round robins, three articulations (twang has three velocity layers, staccato and hammer-on one).
- **Keys**: FM Piano every 4 semitones, three velocity layers.
- **Bass guitar vs double bass**: bass guitar in choruses, double bass elsewhere in the plucked mode, because walking and verse lines are the sparse, woody parts.
- **EQ and compression numbers** are in the item 6 text above. Glue is deliberately light (2:1) because the old limiter does the rest.
- **Loudness target**: the glue-stage makeup is 0.63 (`J.MIX_MAKEUP`). The master volume slider still scales everything.
- **Format**: Ogg Opus. It plays in Chrome, Firefox and Edge. I could only test Chrome; Safari support for Ogg Opus is recent, and where it is missing the page stays on synth sounds because decoding fails and the fallback takes over.
- **Published page**: loose files are impractical there (495 files), so the page reads one uncompressed zip of the same pack (`Jam.SAMPLE_ZIP`, a small zip reader in `sampler.js`). Only the default set is in the zip; picking vibraphone, glockenspiel, marimba, kalimba or upright there falls back to the synth until the full pack is served.

## Skipped, and why

- **Virtuosity Drums** and **Swirly brushes**: no repository could be found or verified as CC0, so the jazz kit uses Unruly soft layers and brush-style hits. If you find a CC0 source for Virtuosity, adding it is a change to `KITS` in `build.py`.
- **Karoryfer Osiris piano, Hofner guitar, Shinyguitar, Growlybass, Gogodze Phu**: not needed for the chosen sounds, left out for size.
- **Separate dynamic snare carve**: the static cuts and the per-hit snare brightening do this job; a lead-and-snare dynamic EQ would have added one more moving part.
- **jRhodes3**: not used (CC BY-NC), as agreed.

## Sources and licenses

Every file is single notes or single hits, no loops, from these six libraries, all CC0 1.0 Universal. Per-file original paths are in `samples/manifest.json`; the license text of each library is in `samples/licenses/`.

| Library | By | Source (pinned commit) | Used for |
| --- | --- | --- | --- |
| Unruly Drums | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.unruly-drums (9bf75c2) | kick, snare, rim, hats, soft layers |
| Big Rusty Drums | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.big-rusty-drums (f07ce00) | ride, crash, toms |
| Black And Green Guitars (green Gretsch) | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.black-and-green-guitars (b3b3249) | twinkle guitar |
| Fashionbass | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.fashionbass (0703973) | bass guitar |
| Meatbass | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.meatbass (ac9e859) | double bass |
| Versilian Community Sample Library (VCSL) | Versilian Studios, S. Gossner | https://github.com/sgossner/VCSL (c1ea7bc) | TX81Z FM Piano, vibraphone, glockenspiel, marimba, kalimba, upright piano |

## Five-minute listening guide

Open the page over http (`python3 -m http.server` in `tools/jam`, then the local address), press Play, and give the sounds about ten seconds to load.

1. **Minute 1, seed `harbor-po`** (the default hook). Listen on **Sampled sounds** first. Then solo **Drums** and flip to **Synth sounds** and back, with the same seed running. Write what changed: "kick has body", "snare sounds real", "hats too bright".
2. **Minute 2, solo Keys, then Twinkle**, flipping synth and sampled. In Twinkle, open the instrument menu and try guitar, then vibraphone, then kalimba. Rate which is the best color for this seed.
3. **Minute 3, seed `ember-ja`** (jazz). Solo Bass and Drums. You should hear the jazz kit and the double bass. Turn **Mix chain** off and on once, with all layers playing, and note whether the off version sounds flatter, muddier or louder.
4. **Minute 4, seed `808` or `fjord-pu`** (punk). Listen for the bass guitar in the choruses and the kick pumping the pads. Turn on **Switch between synth and sampled every 8 bars** and let it alternate through one cycle.
5. **Minute 5, riffs and MIDI.** Move the **Tapping riffs** slider to 1 on `303`, listen to the hammer-on guitar, then press **Export MIDI**, unzip it, drag the `.mid` into GarageBand and give each track a good instrument of your own. If the notes sound good there, the music is fine and sounds are the only open question.

For ratings, a few words per layer works best: which switch you preferred ("sampled"), and for each layer one word ("drums: great", "keys: thin", "twinkle: vibes too long"). Mention the instrument menu choice if you changed it; the rating already records it.
