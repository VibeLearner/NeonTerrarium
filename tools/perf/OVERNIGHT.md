# Overnight report (round 6 and after)

(Being written as the work goes; the final version is at the end of the run.)

## Decisions made on my own
- Item 1 people rate: N from each person's own speed (rush, hurry included) with the frame time quantized to 1/240 s so N doesn't flap with jitter; N capped at 4; the cursor radius is 90 render pixels. Why: the plan leaves them open; these are conservative and keep a step under about .75 of a render pixel.
- Sprites of people skipped on a frame are drawn from what their last step left (including the emote bubble, hologram and picnic upkeep). Why: "drawn every frame", and holograms/picnics are fed by the people loop.
- The collision check runs every N-th frame for everyone (N = the typical walker's rate from the previous frame), not per subset. Why: pairs are only found when both walkers are in the pass, so a subset would find far fewer meetings; a meeting lasts many frames, so a whole pass every N frames finds them.
