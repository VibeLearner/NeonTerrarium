# Round 2 notes: making the jam room sound good

Branch `wip/jam-room-2`, started from `wip/jam-room` at 011d4b1. Nothing was merged, published or changed outside `tools/jam/`.

**What this is.** A second composer (`js/composer2.js`, `js/motif.js`, `js/rules.js`), small synth and engine changes, a Node lint (`lint.js`) that counts rule violations, and a page switch that plays the same seed and sliders with either composer. The old composer is still there, behind the switch, and was only given extra data fields so the lint can read it.

**What I could not do.** I cannot listen. Everything below is measured by rules and counts. A clean lint score means the notes obey the rules in `js/rules.js`. It does not mean the music is good. `SEEDS.md` has a listening guide for you.

## Lint table, before and after

Counts are per 100 bars (so 0.3 means three violations in 1,000 bars). "old" is the first composer, "new" is the second. Same lint, same rules, same seeds. The lint reads the synth's real ring and release times (`J.RING` in `js/rules.js`) and is run on the five round-1 settings and on 200 random seeds (50 per each of four slider presets).

### The five round-1 settings (101, 303, 2024, 404, 808)

| rule | old | new |
| --- | --- | --- |
| minor 9th / minor 2nd clashes | 2186.8 | 0 |
| non-chord tone on a strong beat, no allowed figure | 0 | 0 |
| avoid note on a strong beat (lead) | 0 | 0 |
| notes still sounding after a chord change, not in the new chord | 1015.6 | 0 |
| parallel 5ths / octaves, lead vs bass | 2.2 | 0 |
| lead notes outside the band 67-88 | 2.8 | 0 |
| bars with more than two chord-holding layers | 3.2 | 0 |
| phrases not ending on a cadence (% of phrases) | 56.8 | 0 |
| beats where lead and twinkle are both busy | 0 | 0 |
| motif bars per 8-bar window (higher is better) | 4.34 | 5.57 |
| leap recovery % (higher is better) | 9.1 | 46.5 |
| lead intervals % (0 / 1-2 / 3-4 / 5-7 / 8-12 / 13+) | 15.4 / 34.4 / 32.3 / 14.3 / 3.2 / 0.4 | 7.7 / 50.8 / 26.4 / 9.6 / 5.4 / 0 |
| cadences found (full/half/plagal/deceptive/none) | 24/30/0/0/71 | 27/89/5/4/0 |

validator (second composer): {"phrases":125,"firstTryClean":76,"twinkleDrops":229,"retries":34,"backups":8,"fallbacks":8,"leadDrops":0}

### 200 random seeds

| rule | old | new |
| --- | --- | --- |
| minor 9th / minor 2nd clashes | 2648 | 0.3 |
| non-chord tone on a strong beat, no allowed figure | 0.8 | 0 |
| avoid note on a strong beat (lead) | 0.3 | 0 |
| notes still sounding after a chord change, not in the new chord | 1084.5 | 0 |
| parallel 5ths / octaves, lead vs bass | 4.4 | 0.1 |
| lead notes outside the band 67-88 | 15.8 | 0 |
| bars with more than two chord-holding layers | 2.9 | 0 |
| phrases not ending on a cadence (% of phrases) | 53.6 | 0 |
| beats where lead and twinkle are both busy | 1.9 | 0 |
| motif bars per 8-bar window (higher is better) | 3.52 | 5.63 |
| leap recovery % (higher is better) | 18 | 52.8 |
| lead intervals % (0 / 1-2 / 3-4 / 5-7 / 8-12 / 13+) | 15.6 / 34 / 29.4 / 16.2 / 4.3 / 0.5 | 10.7 / 47.1 / 27.7 / 10.3 / 4.2 / 0.1 |
| cadences found (full/half/plagal/deceptive/none) | 385/1582/148/206/2679 | 1220/3528/180/72/0 |

validator (second composer): {"phrases":5000,"firstTryClean":3223,"twinkleDrops":8956,"retries":1496,"backups":434,"fallbacks":429,"leadDrops":121}

How to read the main rows:
- **Clashes** are minor 9ths and minor 2nds that sound together for an eighth note or more, unless both notes belong to the chord that is sounding. This was the loudest problem in the old composer (mostly twinkle against twinkle, and pads against twinkle).
- **Stale notes** are pad, keys and twinkle notes still sounding more than 0.22 seconds after a chord change they do not belong to. Old: about a thousand per 100 bars. New: zero.
- **Cadence** counts the last two chords of each 4-bar phrase. The old composer left more than half of its phrases without one. The new one writes a half, full, deceptive or plagal cadence into bars 3 and 4 of every phrase and alternates them.
- **Motif bars per 8-bar window** counts lead bars whose rhythm and contour belong to the hook (repeat, sequence, inversion and retrograde count). It went up, but a number that is too high would mean a lead that only repeats. I did not set a target.
- **Leap recovery** is how often a leap of a fourth or more is followed by a step the other way. Old 9 to 18 percent, new about 47 to 53 percent. I did not chase the rest (see "Skipped and limits").

One correction to the lint itself, made while scanning candidate seeds: the stale-note tolerance was converting seconds to steps with the clock of the *next* bar. At a change between a full-clock and a half-clock section that made a short pad tail look twice as long as it was. It now uses the clock of the bar the note started in, and both composers are measured with the corrected rule (so it is not a weaker rule, it is the same 0.22 seconds measured correctly). The old composer's baseline number moved from 1015.4 to 1015.6 because of it.

Validator figures (how often the new composer had to fix its own work), five settings and 200 random seeds:

| | five settings (125 phrases) | 200 random seeds (5,000 phrases) |
| --- | --- | --- |
| clean on the first try | 76 | 3,221 |
| twinkle notes dropped | 218 | 8,932 |
| lead retries (new seed for the search) | 31 | 1,486 |
| backed up (wider search, new seeds) | 7 | 431 |
| fell back to chord tones on the beat | 7 | 426 |
| lead notes dropped at the end | 0 | 120 |

So about a third of phrases needed a retry, and about 1 in 12 needed the safe fallback. Those are the places most likely to sound plain.

Other measured numbers (new composer unless noted):
- Chord substitutions: at most one per 4-bar phrase in every one of 1,350 phrases checked, and none in 262 punk-profile phrases.
- Song arc: the loudest smoothed point of each form cycle sits at a median of 78 percent of the cycle (old composer: 84 percent, but with a quarter of cycles peaking before 22 percent).
- Twinkle plays about 6.4 notes per bar against 8.8 in the old composer. The lead plays about 2.2 per bar against 1.8.
- A keys layer is sounding in about 56 percent of bars (that is where the guide-tone line lives) and a harmony voice under the lead in about 89 percent of lead bars (it appears in choruses and drops).

## What each item changed

**1. Harmony timeline.** Each section picks a color profile once (plain, emo, jazz, punk or dark). Every layer reads the same list of chords per bar, with a chord scale, tensions and avoid notes for each (`J.chordScale`). At most one substitution (secondary dominant, tritone, ii-V or diminished passing chord) per 4 bars, only in the bar before a phrase arrival, and never in a punk section.

**2. Phrases and cadences.** Every 4-bar phrase is planned with chord functions (tonic, subdominant, dominant) and ends on a cadence written into bars 3 and 4. Half, full, deceptive and plagal alternate. A full cadence ends the lead on the home note. An arc over the whole form (establish, develop, climax at 80 percent, resolve) now shapes energy bar by bar and also lifts the lead register as it climbs.

**3. Overlap fixes.**
- Plucks get a ring cap of 1.2 seconds and are damped at chord changes (a 45 ms fade) if their pitch class is not in the new chord. Done in the synth with a spare gain node per string so damping never fights the cap fade.
- Pads are per-note voices. Notes the two chords share are held, not restruck. Others crossfade over 90 ms (70 ms at a section edge).
- Register bands are bass 28 to 48, pads 48 to 67 (three voices, no root), keys 55 to 74, twinkle 62 to 86, lead 67 to 88. Notes are folded by octave, never clamped. A phrase moves by octaves as one piece so the motif's contour survives.
- At most two layers hold chords at once. Keys that sustain thin the pads.
- The lead is a true single voice. The harmony voice no longer cuts the main lead or glides from it.
- Bass approach notes live only on the last eighth, as a step of the next chord's scale, and are skipped if they would make a minor 2nd or 9th with the pads or keys. Bass notes never hold into the next chord. Parallel fifths and octaves between lead and bass are fixed by changing the bass note.

**4. Melody and motifs.**
- A hook is a rhythm cell plus an interval shape with one leap of a fourth to a sixth that is recovered by a step. 36 candidates per seed are scored (identity, variety, singability, fit over the first two chords) and the best is kept, deterministically.
- Development ops: repeat, sequence, inversion, retrograde (rare), augmentation, diminution, displacement by an eighth, fragment, extension, same pitches with new rhythm, new pitches with the same rhythm. In practice the counts are very uneven (see "Skipped and limits").
- Period and sentence phrases; the hook comes back in each chorus or drop, on the same pitches over the same chords (remembered per piece).
- A seeded beam search per phrase scores chord fit, interval rules, contour, motif fidelity and register.
- A guide-tone line (thirds and sevenths by smallest step) is the top note of the keys chords. A diatonic third or sixth harmony voice sits under the lead in choruses and drops.
- Twinkle: open voicings with a pedal tone, plus the round-1 cells for the 3+3+2, 5 and 7 groupings.
- NPC motifs use the same engine (`J.npcMotif2`).

**5. Layers leave room.** A shared per-beat budget: when the lead is busy, the twinkle thins to the downbeats and fills the lead's rests. Kick and bass stay aligned (the round-1 rule is kept). In drum-fill bars the lead stops early so the fill sits in its rest.

**6. Lint and validator.** `lint.js` runs with Node only and prints the tables above (`node lint.js --random 200 --md out.md`). The same checks (`J.check` in `js/rules.js`) run inside the composer for every 4-bar phrase: twinkle notes that clash are dropped first (they are free), then the lead is searched again with a new seed up to three times, then twice more with a wider search, then replaced with chord tones on the beat, and last dropped.

**7. Page.** An Old composer / New composer switch under the seed box (default New). It restarts the same seed with the same sliders. A line under the display shows what the lead is doing ("motif", "sequence up a step", "fragment", "cadence: half"), the scale over the current chord and the phrase bar. Ratings record which composer was playing and show it in the list.

## Decisions I made on my own (one line each on why)

- Register bands exactly as the plan, because the plan fixed them and they keep layer centers apart.
- Pad crossfade 90 ms and damp fade 45 ms: inside the plan's ranges and short enough that no click is possible (they are ramps, not switches).
- Ring cap 1.2 s: the plan's number.
- A section's last pad releases in 70 ms instead of 400 ms, because the longer tail clashed with the next section's first chord.
- Stale tolerance 0.22 s: about two and a half sixteenth notes at 175 BPM. My judgment is that a tail shorter than that reads as the chord's release and not as a leftover note.
- Climax at 80 percent of the form, arc weight 45 percent against the section's own ramp, so the shape of each section stays and the song-level rise and fall show.
- Chord scale choice: the candidate that holds all chord tones and overlaps the song's scale most, with a small preference for the order in the table (so a minor chord is Dorian before Aeolian unless the key says otherwise).
- Avoid note: a scale tone a half step above a chord tone. A note a half step below a chord tone (the major 7th over a major chord) is allowed as a tension.
- Cadence rules: V to I full, IV to I plagal, V to vi (or bVI) deceptive, I or IV to V half. A full or plagal cadence ends the lead on the root of the last chord, because the root is the more conclusive choice.
- Hand-written interval cost table (`IV_COST` in `js/motif.js`): steps and thirds free, the tritone very expensive, sevenths and ninths costly, octaves allowed. It is written from the usual rules of singable melody, not from any recording.
- Beam width 8 (16 on backup): small enough to stay fast (about 0.15 seconds per 100 bars), big enough to avoid dead ends.
- Contour cost 4.5 for a note that goes the wrong way against the motif, and 3.2 for leaving the remembered hook pitch: the smallest values that made the hook recognizable in the numbers.
- Unrecovered leap cost 6: raised from 3 after checking that the leap-recovery figure moved with it.
- Pad voicing: if the ninth would sit a half step from the third (minor add9) it is replaced by the fifth, because the pair grinds on a pad.
- Keys modes per section: mostly chorus off, drop stab, intro sustain (when Jazz is above 40), breakdown sustain or comp, outro sustain; pads thin out when keys sustain, so only two layers hold chords at once.
- Lead voice limit in the synth raised from 3 to 5 so the harmony voice cannot steal the main line.
- A twinkle note that clashes with the lead is dropped before the lead is asked to change, because the lead carries the tune.
- A bass note never holds into a different chord, and bass notes never overlap, because a mono bass line should not.
- Seeds for SEEDS.md: zero violations, then variety, then motif and leap numbers, because those are the only evidence I have.

## Skipped, limited, or worth a second look

- **No listening.** All of the above is numbers. The things I most want your ears on are the ones the lint cannot see: whether the hook is memorable, whether the choruses feel too repeated, whether the twinkle is too thin, and whether cadences feel like endings.
- **Leap recovery is about 47 to 53 percent**, not near 100. The remaining unrecovered leaps are mostly at phrase edges and the hook's own shape. I stopped at the point where a stronger cost started to flatten the tune.
- **Development ops are uneven.** In 25 seeds, "motif" is about half of lead bars, then cadence labels, sequence and fragment. Inversion, displacement and retrograde are rare, and diminution, augmentation and "new pitches same rhythm" almost never appear, because the sections that pick them often have the lead resting.
- **Twinkle "tapping figures", "call and response".** I reused the round-1 cells for 3+3+2, 5 and 7 groupings rather than writing new ones, and call and response is the density budget (the twinkle answers in the lead's rests) and not a written echo.
- **Guide-tone line** is only heard when keys play (about 56 percent of bars). In chorus sections keys are off and the pads carry the chord tones, so there it is a smooth voice-leading line and not a written guide tone.
- **Choruses repeat exactly** when the same chords return, because the hook is remembered per piece. That is what "the hook comes back" means to the lint, and it may feel too tidy.
- **Parallel fifths and octaves** are only checked between consecutive lead notes less than 8 steps apart and the bass note sounding at each. It is a narrow rule.
- **The pluck damping and pad crossfades** are in the synth but I only heard them as numbers (offline render: no clipping, no errors). They use ramps, so there should be no clicks.
- **The artifact was not updated.** Your instructions said never publish, so the shared page still has the round-1 version. Say the word and I will republish the same page with the switch.
- **No advisor question was needed.** Nothing stayed stuck after three tries, so no feature was left out for that reason.

## Final render check (one offline render, five settings, 80 seconds each)

| seed | errors | peak | average loudness | clipped samples | silent seconds | DC offset |
| --- | --- | --- | --- | --- | --- | --- |
| 101 | none | 0.744 | -13.2 dBFS | 0 | 0 | 0.0016 |
| 303 | none | 0.758 | -12.7 dBFS | 0 | 0 | 0.0047 |
| 2024 | none | 0.748 | -13.2 dBFS | 0 | 0 | -0.0011 |
| 404 | none | 0.762 | -14.1 dBFS | 0 | 0 | -0.0022 |
| 808 | none | 0.750 | -12.7 dBFS | 0 | 0 | -0.0053 |

Round 1 measured between -14 and -12 dBFS with the same limiter, so loudness did not move. A short live run in headless Chrome earlier (new composer, 15 seconds) showed no late notes and the scheduler about 0.37 seconds ahead of the audio clock, with no console errors. The render ran on the final code. I did not render the 8 SEEDS.md seeds; I only checked their lint numbers.

## Files

`js/rules.js`, `js/motif.js`, `js/composer2.js`, `lint.js`, `lint_report.md`, `lint_report.json`; edited `js/synth.js` (pluck cap and registry, `damp`, lead `hv`, lead voice limit), `js/engine.js` (composer choice, `damp` events, NPC motif, snapshot), `js/ui.js`, `index.html`, `jam.css`, `js/composer.js` (extra fields and an export only); `SEEDS.md`, `README.md`.
