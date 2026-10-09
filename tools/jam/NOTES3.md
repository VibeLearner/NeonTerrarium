# Round 3: every slider follows the tempo

You asked for each slider to work in harmony with the tempo being set. I read that two ways and did both: the tempo can now be set by hand, and every slider's effect is scaled to whatever tempo is playing. I did not check by ear. The checks below are numbers.

## What changed

- **Tempo (BPM) slider** under Feel. Far left is Auto, which is exactly the old behavior (the Drum and bass slider picks 170 to 176). Otherwise it sets the base tempo from 60 to 200. It works while playing and takes hold at the next phrase, so a drag never cuts a phrase in two. Saved ratings keep the BPM. The old composer takes the same tempo.
- **Optional notes follow the tempo (new composer).** Density now scales with `J.paceM(bpm)`, the square root of 174 over the tempo, held between 0.75 and 1.5. Slower tempos get busier twinkle, comping and ghost notes per step, and faster tempos get fewer. At Auto the factor is about 1, so nothing there moved.
- **Gestures measured in seconds now stretch with the beat.** Strum spacing, the slow pad attacks in builds, and the keys tail. The keys tail stops earlier at fast tempos so it cannot ring into the next chord (that was the one rule that broke at 200 BPM, 16 clashes per 100 bars, and it is fixed).
- **Swing** eases off as the tempo rises, as a player's would (about 90 percent strength near 90 BPM, about 60 percent at 174).
- **Half-time** is only used when half the tempo is still at least 72 BPM. Under 144 BPM those sections stay in full time rather than crawl.

Not changed: the rule book, the lint rules, the old composer at Auto, the seeds in `SEEDS.md`.

## Checks (`node tempo.js`, report in `tempo_report.md`)

80 bars per run. The runs are the five SEEDS settings plus each of the ten sliders at 10 and at 90, at 70, 100, 130, 174 and 200 BPM.

- Rule violations are zero on every rule at every tempo.
- Notes per second for each layer rise smoothly with tempo (lead 0.75 at 70 BPM, 1.7 at 174, 1.9 at 200), so no layer turns into a wall of notes at a fast tempo or goes missing at a slow one. The busiest second for the lead is 10 notes at 200 BPM.
- Motif recurrence stays near 6 per 8-bar window and leap recovery between 55 and 65 percent at all tempos.
- The standard lint (five settings plus 200 random seeds) is unchanged to within rounding, and the old composer rows are identical.
- A live browser run toggled the slider between Auto, 100 and 200 while playing with no console errors and the scheduler's slack steady.

## What to listen for

At 80 BPM, then 130, then 200, with a seed you like. Do the sliders feel like they do at 174: Density still adds notes, Jazz still swings, Emo still strums? If a slow tempo feels too busy or a fast one too thin, change the exponent in `J.paceM` (`js/composer.js`).
