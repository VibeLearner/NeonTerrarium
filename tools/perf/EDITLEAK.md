# The edit leak: building in a session slowly costs frames

Branch `wip/editleak` (from main f4d3e32). Reproduce with `tools/perf/editleak.py`; measure on your own machine with `tools/perf/owner_editleak.js`.

## What was wrong

After building, the page held more on the graphics card than a fresh load of the same city. The extras were never drawn again, but they cost driver and memory work every frame and kept growing with the number of edits. A reload gets rid of them, which matches "close the tab and it is smooth".

Cause: a plot's own meshes are drawn before they are folded into a merged block (while an edit is shown, and while the block is made again). When the merge swaps in, the plot's meshes are hidden, but their geometry stayed on the card (buffers and one vertex array per program). A plot that is merged before its first frame, as in a fresh load, never uploads them. After an edit the merge swaps again, and the same happens each time.

Fix (`js/world.js`, `rebuildSolidGen`): when the merge hides a plot's meshes, their geometry is disposed. Three uploads it again if the mesh is ever drawn.

## Numbers (your Mac, `PERF_GPU=1 editleak.py city --n 100 --every 25`; counts of what three holds, one frame, cache in use, fresh load run for the same game time)

| after 100 edits | before the fix | after the fix | fresh load |
|---|---:|---:|---:|
| geometries on the card | 578 | 261 | 261 |
| GL buffers | 2,771 | 1,150 | 1,142 |
| vertex arrays | 755 | 299 | 321 |
| draw calls | 316 | 352 | 350 |
| texture MB | 133.8 | 133.8 | 133.8 |
| buffer MB | 61.1 | 31.3 | 49.4 |
| render buffer MB | 34.8 | 34.8 | 34.8 |
| textures | 49 | 49 | 43 |
| programs | 49 | 49 | 47 |

Geometries along the way, before the fix: 178 (load), 400, 466, 534, 578 at 25, 50, 75, 100 edits. After: 247, 261, 270, 261. It levels off at the fresh-load number and does not grow.

Draw calls vary a little from frame to frame (traffic and people), so they are not a precise signal; before the fix they were not the problem either.

Buffer MB is lower than a fresh load after the fix: a fresh load keeps the plots' own copies of what it drew while it was loading, the edited city frees them as blocks merge.

## What is left (and why it is not growth)

- Textures 49 against 43 and programs 49 against 47. They reach 49 by 50 edits and stay (49, 49, 49 at 50, 75, 100). They are one-time: the sweep materials and the megastructure the edit mix places and removes (its textures and shaders exist only after one stood). `editleak.py --no-mega` leaves the megastructure out to confirm.
- N = 300: to be run on your Mac (`--n 300`), before and after.

## What else is in the branch

- `tools/perf/editleak.py`: the repeatable run (edit mix, settle, fresh load at the same game time, geometries and GL objects by site, the scene by layer and material, the draw census by pass). `--no-mega`, `--n`, `--every`.
- `tools/perf/owner_editleak.js`: the two-phase script for your Chrome (frames a second before the edits, 150 scripted edits, after, after a reload), with a backup of your own save.
- The F3 overlay line: draws a frame, geometries, textures, programs and a GPU memory estimate (counted where the page asks the card for memory, never per draw).

## Checks

To run (see the commands in the last message): harness diff against f4d3e32 (city, dense, megas, max city two steps) with 0 problems; `recipe_proof.py city --worker`: 0 differing plots; `edit_frames.py city`: the same frames as before.
