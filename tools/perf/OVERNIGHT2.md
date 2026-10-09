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
  thin plates 18%, main structure 13%, sticks 16%, glowing parts 6%, windows 5%; in 47% of the cases the covering face is parallel to the hidden one and faces the same way, in the rest at an angle (inside corners, behind posts).
  So these are faces behind other geometry of the same plot (interiors, the backs of fittings, the far sides of things), which touching-face rules like round 6's flat-face rule can't see.
- Ten examples with where they are and what hides them: tools/perf/overnight2/item2a_examples.png (each crop: the plot in grey from the allowed view that faces the target best, the target triangle drawn on top in red with a yellow outline,
  the triangle in front of it in blue; label: class, zone, world position, view, the hider's class, its gap and how parallel). All ten are kept by the current build (the flat-face rule never shipped).
- Why round 6's number was 5% (visprobe.py, 36 views at zoom 30 around a mid-city point, about 6,800 triangles): it measured another population with a coarser question. It was run on the `city` test scene; on the max city, the same
  probe, same default camera, radius 4, zoom 30, gives 16,642 triangles, of which in A 320 never seen (9%, with 1,066 too small to judge at that pixel size) and in S 1,561 (18%, with 1,686 too small). The small ones are
  a fifth to a third of the triangles at that zoom and are excluded from "never", and its views were 36 at one offset. Even so the max city shows 9 to 18%. The first number said "few percent" because the scene and the disc were mostly street furniture and low plots.
  Re-run on the owner's plots (visprobe `--at`) it also gives far more than 5%. A denser view set and finer pixels lower the share (25 to 22%), they never made it small.
- Merge numbers in the owner's probe (the `merge` part) were not used: the normal attribute layout has changed (signed bytes then); the visibility counts don't depend on it.

**2b. Removing the never-seen triangles safely: stopped by the ladder after three attempts; nothing shipped to the game.** The share is real (item 2a: about 22 to 25% of the drawn building triangles),
so I tried to find a view set whose result can be trusted. tools/perf/vis2b.js tests candidates against a denser reference on the owner's plots (same picks as geo20b.js; reference 96 turns x 14 tilts at pixel .0045, offset by half a step from the
candidates' turns; depth-tie triangles are never counted as removable). The closest zoom's pixel on the owner's 1640-line render is .0061, so the candidates sample at .006.
- Three plots (low 3.9, mid 7, high 17.6; 30,088 drawn triangles; the reference finds 7,523 never seen = 25.0%; 357 triangles are depth ties and are kept):
  attempt 1, 24 turns x 6 tilts x 2 offsets: removes 7,324, of which the reference sees 578 (7.9%); attempt 2, 48 x 8 x 2 offsets: removes 6,877, 280 seen (4.1%); attempt 3, 48 x 8 x 4 offsets: removes 6,757, 206 seen (3.0%).
- First plot alone (6,940 drawn): 199, 118 and 78 false removals of 1,348, 1,247 and 1,192; the false ones are spread over every size (10 of them triangles with an edge over .4, 30 between .05 and .1), so they are not just specks:
  they are faces that show through a narrow gap or at a grazing angle in a few views. Density and offsets reduce them but don't reach zero, and the reference is itself a sample, so zero against it would still not be proof.
- The bar was zero. A removal that is wrong shows as a missing speck of wall in a few views, and the harness's angle sweep would find some. So an exact version isn't available from sampling. Options for you, in order of effort:
  (1) leave it; (2) a cheat: remove what a dense sampled sweep never sees (about 20% of drawn triangles), accept the rare missing speck, test "draw never-seen faces too", crops; it needs the per-piece layout change (a second index
  order, never-seen triangles moved to H, the old order restorable for the test), a GPU pass that accumulates per-triangle visibility over the views with max blending and one read-back per plot, run in idle frames, region re-merges batched (the design is worked out;
  I did not build it because it is a cheat that needs your approval first and a day of work); (3) an exact rule from geometry only (a face behind a parallel solid face that covers its whole footprint with margin) covers about half of the cases (47% of the hiders are parallel, same-facing faces) but needs the plot's solid shell, which the kit doesn't record.
