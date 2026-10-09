# Eight seeds to try first, a listening guide, and what to tune next

**Read this first.** I cannot listen to audio. These eight seeds were chosen by numbers, not by ear. I scanned 53 candidate settings with `lint.js` (180 bars each), kept only the ones with zero rule violations, preferred high motif recurrence and leap recovery, and then picked eight that differ from each other in key, mode, form, meter and genre blend. A passing lint score means the notes follow the rules. It does not mean the music is good. Your Keep and Doesn't work ratings are the real selection.

To use one: type the seed, set the sliders as listed (values are 0 to 100 on the page), pick **New composer** or **Old composer** with the switch under the seed box, and press Restart. Game state stays at day, clear, street.

| # | Seed | Key, mode, tempo | Sliders | What it should show |
| --- | --- | --- | --- | --- |
| 1 | `harbor-po` | C minor (Aeolian), 168 | Energy 70, Jazz 30, Math 20, Emo 60, Punk 65, Drum and bass 55, Synth 50, Darkness 30, Tempo feel 20, Density 60 | The clearest hook (best motif and leap numbers of the eight). Pop punk and emo choruses, a minor-march progression, and 5/4 bars in the bridge. Start here for the old versus new comparison. |
| 2 | `ember-ja` | D major (Ionian), 173 | Energy 50, Jazz 85, Math 30, Emo 35, Punk 10, Drum and bass 50, Synth 50, Darkness 50, Tempo feel 55, Density 50 | The jazz one. The intro sustains electric piano chords and the half-time breakdown comps them, so the guide-tone line is easiest to hear here. ii-V and tritone substitution color before phrase endings. |
| 3 | `303` | F# minor (Dorian), 177 | Energy 65, Jazz 50, Math 40, Emo 40, Punk 20, Drum and bass 85, Synth 80, Darkness 80, Tempo feel 30, Density 65 | The cyberpunk one from round 1. Reese bass, a drum and bass pulse, and a 9/8 (2+2+2+3) bridge that returns to 4/4. |
| 4 | `delta-ma` | B minor (Dorian), 165 | Energy 60, Jazz 45, Math 85, Emo 70, Punk 20, Drum and bass 40, Synth 40, Darkness 60, Tempo feel 45, Density 55 | Math rock and midwest emo. Both 5/4 groupings (2+3+3+2 and 3+3+2+2), and a long 12-bar half-time breakdown. |
| 5 | `808` | Bb major (Ionian), 173 | Energy 85, Jazz 30, Math 30, Emo 40, Punk 80, Drum and bass 75, Synth 60, Darkness 45, Tempo feel 10, Density 80 | The loud, busy one from round 1. Major-key choruses and the highest Density and Punk settings, so it has the most chance of layers crowding each other. A good seed for hearing whether the density budget works. |
| 6 | `delta-po` | Db minor (Aeolian), 172 | Energy 70, Jazz 30, Math 20, Emo 60, Punk 65, Drum and bass 55, Synth 50, Darkness 30, Tempo feel 20, Density 60 | Same sliders as seed 1 on purpose: a different seed gives a different key, hook and Andalusian progression. Use it to judge whether two songs from the same settings feel like different songs. |
| 7 | `birch-cy` | F# minor (Phrygian), 177 | Energy 65, Jazz 50, Math 35, Emo 40, Punk 20, Drum and bass 85, Synth 80, Darkness 80, Tempo feel 30, Density 65 | The dark one. Phrygian color with a bII chord, 7/8 bars (2+2+3 and 3+2+2) in the bridge, then back to 4/4. Check that the flat second sounds colorful and not wrong. |
| 8 | `fjord-pu` | E minor (Aeolian), 174 | Energy 85, Jazz 25, Math 30, Emo 40, Punk 85, Drum and bass 70, Synth 60, Darkness 45, Tempo feel 10, Density 80 | Punk. Chord substitutions are never allowed in punk-profile sections, so the harmony stays plain. Three chorus sections in a row, so it is the best seed for "does the hook come back". |

Lint numbers for these eight at 180 bars each: zero violations on every rule. Motif recurrence per 8-bar window (new composer): 5.3 to 7.6. Leap recovery: 57 to 100 percent. (The old composer scores 4.3 and 9 percent on the five round-1 settings, see `NOTES2.md`.)

Seeds `101`, `2024` and `404` from round 1 still work and are still in the lint's five-setting set. `303` and `808` stayed in this list.

## Listening guide (about 10 minutes)

Use headphones, set Master so a chorus is comfortable, and leave the page at day, clear, street. The times below are approximate and count from pressing Restart. The line under the display ("Lead is doing") names what the lead is doing and the scale over the current chord, so you can look at it when something catches your ear.

**Minute 0 to 1: setup.** Type `harbor-po`, set the sliders from row 1, choose **New composer**, press Restart.

**Minutes 1 to 4: seed 1, `harbor-po`, new then old.** Listen from the start. The first chorus begins at about 23 seconds and runs about 23 seconds.
- *Hook that comes back:* the lead states a short tune at 23 s. It should return on the same pitches about 6 seconds later (bar 5 of the chorus). Watch the status line: "motif", then usually "sequence" or "fragment", then "motif" again, with a "cadence" label on the fourth bar of each phrase.
- *Cadences at phrase ends:* every four bars the line should settle. "cadence: half" should feel open, like a comma. "cadence: full" should feel closed, like a period, and should land on the home note.
- *Overlap at chord changes:* listen to the twinkle (the plucked notes) and the pads at each chord change. The old sound is notes ringing into the new chord. The new composer cuts those short and crossfades the pads.
- Now press **Old composer** (it restarts the same seed with the same sliders) and listen to the same first 45 seconds. Press **New composer** again if you want to compare a third time.

**Minutes 4 to 6: seed 2, `ember-ja`.** Jump to the breakdown at about 56 seconds.
- *Guide-tone line:* the electric piano plays chords. Listen to its top note. It should move by small steps from chord to chord (a third, then a seventh, then a third). If it sounds like a slow, singable line inside the chords, the guide tone works.
- Toggle Old composer on the same bars to hear the electric piano without that line.

**Minutes 6 to 8: seed 3, `303` (or `birch-cy`, seed 7).** Play the drop at about 22 seconds, then the odd-meter bridge at about 54 seconds.
- Does the 9/8 (or 7/8) bridge feel intentional, and does the hook still make sense in it? Does it land back in 4/4 cleanly?
- Listen to the bass on the last eighth of each bar. It should walk into the next chord's root as a half step or whole step, never colliding with the pads.

**Minutes 8 to 10: seed 8, `fjord-pu`.** Three choruses in a row.
- Does the hook in the second and third chorus feel like the same tune? Does it feel too repeated?
- Does the lead ever crowd the twinkle? (They share a budget now: when the lead is busy, the twinkle should thin out.)

**What to write in the rating notes.** Press **Keep** or **Doesn't work** while the composer you are judging is playing. The rating records which composer it was. Keep each note short and put the seed, the rough time and one fact in it:
- Say old or new, and one of: overlap, hook, cadence, guide line, lead range, twinkle busy, bass, mix, odd meter.
- Examples: `new: hook returns, loved the cadence at 0:46`, `new: pads still fight the twinkle at bar 5`, `new: lead too high in the chorus`, `old: more fun, newer feels too safe`.
- If the new composer feels too safe, too repeated, or too tidy, say so plainly. That is exactly the kind of thing the lint cannot see.

## What to tune next, after you rate some seeds

1. **Too repeated.** The hook returns on the same pitches every time over the same chords. If choruses feel static, loosen `pref` in `js/motif.js` (the 3.2 cost for leaving remembered pitches) or lower `tsign` strength.
2. **Too safe.** The validator drops or retries any note that breaks a rule, which can remove color. If the lead feels cautious, widen the beam (`width` in `composePhrase`) before touching the rules.
3. **Twinkle thinned.** The new composer plays about 6.4 twinkle notes per bar against 8.8 in the old one, because clashing notes are dropped. If it feels sparse, change the pedal and density gates in `twinkleFor` (`js/composer2.js`).
4. **Tempo range, jazz amount, odd meters, mix.** Same advice as round 1: the tempo range in `makeSong`, the jazz slider default in `style_defaults.js`, the odd-meter share, and the mix balance, none of which were set by ear.
5. **The "doesn't work" notes.** Short phrases like "bass too busy" or "bridge felt lost" are the most useful input. Group them by section, layer and slider position.
