# Round 4: tapping riffs

You asked for the feel of Tiny Moving Parts and Polyphia type riffs: fast, syncopated, two-hand tapping figures that run over the chords. I have not heard the result. Everything below is checked by numbers, and the patterns are written by hand from how tapping works on a guitar (nothing is taken from either band's recordings, and no model or table learned from music is used).

## What it does

A new slider, **Tapping riffs** (0 to 100, default 50, new composer only; 0 gives exactly the earlier sound).

- Some phrases become **riff phrases**. In bars 1 to 3 the twinkle layer plays a tapped figure and the lead rests. In bar 4 the lead states the cadence while the riff thins to the downbeats (the existing density budget does that), so it plays like call and response.
- Each figure is groups of three sixteenths: an **anchor** (accented), a **hammered** note and a **tapped** high note, all chord tones from the twinkle band. The group base moves along a hand-written contour (`RIFF_BASES`) so the figure climbs and falls over the bar. Four group shapes (`RIFF_OFFSETS`) and five rhythm templates (`RIFF_RHYTHMS`, including 3+3+3+3+2+2, syncopated gaps and 4+4+4+4) are picked once per section, so the riff is recognizable when it comes back. In odd meters the groups follow the meter. A figure never repeats the note it just played.
- A riff phrase is only used after the hook has been stated (phrase 3 or later in a drop or chorus, phrase 2 or later in a bridge), never in intro, build, swell, breakdown or outro, and never in a quiet bar.
- How likely it is: the slider times (0.6 + 0.5 Math + 0.3 Synth), a little higher in bridges. With the defaults about one phrase in eight is a riff phrase; at 90 with Math high it is about one bar in five.

## Checks

- Same lint, same rules. Five settings: zero violations on every rule. 200 random seeds: 0.3 clashes and 0.1 parallels per 100 bars, which is the same residual as before this round (see `NOTES2.md`). No cadence is missing.
- The tempo sweep (`node tempo.js`, `tempo_report.md`) is at zero violations at 70, 100, 130, 174 and 200 BPM with the riff layer in.
- Four settings with Tapping riffs at 90 (delta-ma, 303, birch-cy, ember-ja) each have 33 to 36 tapped bars in 180, with zero violations.
- A live browser run with Tapping riffs at 100 and Math at 80 shows "tapped riff" in the lead line, no console errors, scheduler slack steady.

## What I could not do

- I cannot hear it. The pluck is the same Karplus-Strong string as the rest of the twinkle, so a tapped note has a pick attack a real tapped note does not have. If it sounds too plucky, lowering the pluck `v` for `c.k === 2` in `twinkleFor` and using `variant` 1 for tapped notes is the first thing to try.
- There are no chromatic slides, bends, trap hat rolls or sweep picking. Those need new synth gestures (or 32nd-note drum events) and are the next round if you like the figures.
- The validator drops any riff note that clashes with another layer, so some bars have an extra gap. That reads as syncopation, but it is not designed.

## What to listen for

Try `303`, `birch-cy` or `delta-ma` from `SEEDS.md` with Tapping riffs at 90 and Math at 70 or more, at 130, 150 and 174 BPM. Do the figures feel like a riff or like an arpeggio? Do they get in the way of the lead's answer? Is one phrase in five too many?
