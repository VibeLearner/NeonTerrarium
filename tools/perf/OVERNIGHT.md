# Overnight report (round 6 and after)

(Being written as the work goes; the final version is at the end of the run.)

## Decisions made on my own
- Item 1 people rate: N from each person's own speed (rush, hurry included) with the frame time quantized to 1/240 s so N doesn't flap with jitter; N capped at 4; the cursor radius is 90 render pixels. Why: the plan leaves them open; these are conservative and keep a step under about .75 of a render pixel.
- Sprites of people skipped on a frame are drawn from what their last step left (including the emote bubble, hologram and picnic upkeep). Why: "drawn every frame", and holograms/picnics are fed by the people loop.
- The collision check runs every N-th frame for everyone (N = the typical walker's rate from the previous frame), not per subset. Why: pairs are only found when both walkers are in the pass, so a subset would find far fewer meetings; a meeting lasts many frames, so a whole pass every N frames finds them.

**2. Ring (wrap-around) cache: done.** The cache picture is addressed modulo its size; the copy to the frame is up to four blits; when the view
moves, only the strip that became needed is drawn (strip camera, viewport offset beyond the attachment, scissor), up to the margin's width.
Pins and view-left-the-cache still redraw whole. Overlay test "no ring: redraw the cache whole at the edge" restores the old behavior;
the cache line shows `ring strips N`. Check: cache steps incl. five long pans (c_ring1 to 5, forward, back, other axis) against the
build before the item, both drawn the old way for the reference: 0 state differences, 0 page errors, residue 20 to 3,300 px a capture (same range
as before the ring: 60 to 2,300; the largest is the capture after a 1,500-unit pan), no seam: no row or column of the diff holds more than 13 pixels.
Decision: the strip is extended to the full margin once less than half is left (fewer, wider strips beat many one-pixel ones), and a strip
wider than the margin falls back to a whole redraw ("pan too fast for the ring").

**3. Turn and zoom slowdown: done (a); (b) can only be told on the owner's GPU.**
(a) Frames drawn the old way (turning, zooming, lights changing) now use the view's own projection instead of the cache's widened one: no margin
pixels drawn, no extra plots past per-plot culling. Chosen over scissor + real-frustum culling because it is exactly the pre-cache picture
(no residue against a7b4449) and removes the margin cost outright. The cache's own draws and the harness's `oldview` reference mode still use the
widened projection. Residue against the widened reference on the 7 changing-frame captures: 46 to 807 px of 921,600; every in-use frame is identical.
(b) The composite's extra 1 to 3 ms with the cache: the harness (SwiftShader) cannot show GPU timing. Built a switch that draws the cache copy
as a full-screen pass instead of blitting ("copy the cache by drawing, not blitting"; also `window.__COPY_DRAW = true`): same pictures as the
blit (checked on the cache steps; same 7 changing-frame captures differ, none new). If the composite is the same with it on and off, the cause
is not the blit's state; then the pinned camera's depth (wet-ground search, shimmer tiles) or `pxK` is next, which need the owner's GPU to measure.

**5. Fewer triangles: investigated; nothing shipped (details below).**
- Headroom (tools/perf/visprobe.py: triangle ids rendered from 12 turns x 3 tilts at zoom 30 around a mid-city point, ~6,800 triangles): of the
  triangles in the always-drawn and wall lists, 1.1% (A) and 4.8% (S) are never seen in those 36 views; sub-pixel ones (about 13% of S, 1.4% of A) can't
  be judged this way. The hidden segment H already holds 17 to 18% of all building triangles (166,726 of 949,000 in the city: undersides and
  faces inside blocks). The owner's 25% "never visible" is therefore mostly already out of the camera passes; what is left is a few percent.
- 5a rule built and measured: a face lying flat against a block's face, turned into that block (back of a plate or pane on a wall, touching faces of two
  blocks), moved to H. Provably covered (the block is between it and any view), and cheap. It moves only 0.3% of drawn triangles in the city and dense scenes
  and 0.5% in island and megas (2,334 of 951,000; 4,585; 48; 2,945). The sweep (12 turns x 3 tilts x 3 zooms, quick third) against the previous commit: 6 of
  36 captures differ by 4 to 77 px, all at the edges of the covered face where the face and the block's own side tie in depth (crops looked at: a few pixels of
  a window sill and a bolt, brightness differences up to 184 at one pixel). Not exact, and the gain is under a tenth of a millisecond: reverted. The patch is
  kept as tools/perf/patches/hide_flat_faces.patch (apply to js/world.js; `window.__NO_HIDE_FLAT = true` before load turns it off) so it can be tried.
- 5b leaner sticks: not applicable. Each of a stick's five non-bottom faces is visible from some allowed angle (the sides from different turns, the top
  from any tilt), so none can be removed for good. Which sides face away in a given frame is already handled: walls go to the per-direction slices (W1b) and
  the graphics card drops back faces. Nothing to build.
