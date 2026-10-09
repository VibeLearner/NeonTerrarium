# Overnight report 2 (round 7)

(Written as the work goes; the table, decisions, owner's list and measurement script are at the end of the run.)

## Details by item

**1. Copy the cache by drawing: done (commit "Round 7 item 1").** The default now draws the copy as a full-screen pass; the blit is behind the overlay test "copy the cache by blitting (not drawing)" and `window.__COPY_BLIT = true`.
Check: standard script city 25, megas 15, dense 13 captures and the cache steps on the city (70): 0 differences against b6d34e5.

**2a. "Never visible": the owner's probe is right. Done (measurement only).**
- Ran geo20b.js exactly as given (tools/perf/geo20b.js, loaded by tools/perf/one.py on the current tree, max city, hour 22, zoom 30): 274,250 triangles, 220,872 drawn today, 166,173 visible from some view,
  54,730 drawn but never seen (24.8%; 10 to 38% per plot): the same numbers as yours to the triangle.
- Is it converged or a sampling artifact? On 7 of the 20 plots: your settings 25.2% never seen; 3 times the views and twice the resolution (72 turns x 12 tilts, pixel .006) 22.1%. So 3% of the drawn triangles are seen
  only in the denser sweep (a removal rule must stay safe against that), and about 22% are hidden from every view tried.
- Is it depth ties (a face coplanar with another that wins the draw order)? No: 685 of 20,798 never-seen triangles (3.3%, mostly sticks) have a drawn same-facing triangle in the same plane holding their middle. Those must never be removed
  (whether a tie face shows depends on draw order, and the probe's order is not the game's).
- Is it real occlusion? 395 of 400 sampled never-seen triangles have the triangle that covers them at least .1 units in front of them (only 5 within .1). What covers them: other shapes 38% (the rounded boxes and custom shapes),
  thin plates 18%, main structure 13%, sticks 16%, glowing parts 6%, windows 5%; in 38% of the cases the covering face is parallel to the hidden one, in the rest at an angle (inside corners, behind posts).
  So these are faces behind other geometry of the same plot (interiors, the backs of fittings, the far sides of things), which touching-face rules like round 6's flat-face rule can't see.
- Ten examples with where they are and what hides them: tools/perf/overnight2/item2a_examples.png (each crop: the plot in grey from the allowed view that faces the target best, the target triangle drawn on top in red with a yellow outline,
  the triangle in front of it in blue; label: class, zone, world position, view, the hider's class, its gap and how parallel). All ten are kept by the current build (the flat-face rule never shipped).
- Why round 6's number was 5% (visprobe.py, 36 views at zoom 30 around a mid-city point, about 6,800 triangles): it measured another population with a coarser question. It was run on the `city` test scene; on the max city, the same
  probe, same default camera, radius 4, zoom 30, gives 16,642 triangles, of which in A 320 never seen (9%, with 1,066 too small to judge at that pixel size) and in S 1,561 (18%, with 1,686 too small). The small ones are
  a fifth to a third of the triangles at that zoom and are excluded from "never", and its views were 36 at one offset. Even so the max city shows 9 to 18%. The first number said "few percent" because the scene and the disc were mostly street furniture and low plots.
  Re-run on the owner's plots (visprobe `--at`) it also gives far more than 5%. A denser view set and finer pixels lower the share (25 to 22%), they never made it small.
- Merge numbers in the owner's probe (the `merge` part) were not used: the normal attribute layout has changed (signed bytes then); the visibility counts don't depend on it.
