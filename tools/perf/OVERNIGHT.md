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
pixels drawn, no extra plots past per-plot culling. Chosen over scissor + real-frustum culling because it is the same draw path as `SC.mode = 'off'`
(the view's own projection; not checked against a7b4449 pixel for pixel in this build, the camera is still pinned along the view while the cache is
on) and removes the margin cost outright. The cache's own draws and the harness's `oldview` reference mode still use the
widened projection. Residue against the widened reference on the 7 changing-frame captures: 46 to 807 px of 921,600; every in-use frame is identical.
(b) The composite's extra 1 to 3 ms with the cache: the harness (SwiftShader) cannot show GPU timing. Built a switch that draws the cache copy
as a full-screen pass instead of blitting ("copy the cache by drawing, not blitting"; also `window.__COPY_DRAW = true`): same pictures as the
blit (checked on the cache steps; same 7 changing-frame captures differ, none new). If the composite is the same with it on and off, the cause
is not the blit's state; then the pinned camera's depth (wet-ground search, shimmer tiles) or `pxK` is next, which need the owner's GPU to measure.

**5. Fewer triangles: investigated; nothing shipped (details below).**
- Headroom (tools/perf/visprobe.py: triangle ids rendered from 12 turns x 3 tilts at zoom 30 around a mid-city point, ~6,800 triangles): of the
  triangles in the always-drawn and wall lists, 0.8% (A) and 5.3% (S) are never seen in those 36 views (front faces only, as the game draws them);
  sub-pixel ones (16% of S, 1.7% of A) can't be judged this way. The hidden segment H already holds 17 to 18% of all building triangles (166,726 of 949,000 in the city: undersides and
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

**6. Speed-based detail while turning: done, a cheat (flip test).**
- Per plot, on frames drawn the old way: its on-screen speed (render px a frame) around the pivot at the middle of the screen (turn, tilt and zoom;
  the plot's slowest part, so a big plot is as slow as its nearest edge). Triangles up to one or two size classes bigger than the usual cutoff go
  (SMALL_E doubles each class: at zoom 30, 1640 lines, class +1 drops edges under about 2 px, +2 under about 4); a fast spin gets one more class.
  A still view is never reduced (and the cache is always drawn at full detail); plots within 200 px of the cursor keep full detail whatever the speed;
  hysteresis of 25% round every threshold; a class comes back at most one a frame.
- Console variables, effective next frame: `SD.on`, `SD.v0` (10: px/frame where the first class goes), `SD.step` (2: next class at this multiple),
  `SD.max` (2), `SD.fast` (40: px/frame where a fast spin may drop `SD.fastMax` (1) more), `SD.cursorPx` (200), `SD.hys` (.25). Overlay test "no speed-based
  detail"; overlay line `speed-based detail: plots by extra classes +0: n +1: n ...  fastest N px/frame`.
- Decision: v0 = 10, not the 6 I first used. A keyboard turn (Q/E: 1.4 rad/s, .035 rad/frame at the M2's 40 FPS) at zoom 30 on 1640 lines moves a plot
  at 27 px/unit x .035 x its distance from the pivot: about 1 px/frame per unit of distance; with v0 = 6 and its margin (7.5) a normal keyboard turn would
  drop detail beyond 8 units, a quarter of the way to the edge of the screen; v0 = 10 (12.5) puts that at 13 units and a mouse drag turn (a few tenths of
  a radian a second) never reaches it. Tune by eye: raise `SD.v0` if you ever see detail drop, lower it for more speed.
- Check: standard script against the previous commit (still and eased frames must be identical): city 25, megas 15, dense 13 captures, 0 problems.
  Cache steps: a slow turn (+.12 rad, peaking at about .007 rad/frame) captured mid-turn: identical; a fast spin (+3 rad) and a quick zoom out
  captured while moving: 50,000 to 53,000 px differ (5% of 921,600; mostly fine detail: window bars, rails, small pieces; crop:
  tools/perf/overnight/item6_fast_spin_before_after.png, base left, new right). Those numbers are with v0 = 6; the speeds in those two captures were far above
  either threshold, so v0 = 10 changes them little (re-checked in the final run, see the table).
- Triangles drawn by the color pass during a fast spin (+3 rad, city, 1280x720): zoom 30: 35 to 49% fewer; zoom 15: 39 to 54% fewer (with v0 = 6).
  GPU time can only be read on the owner's machine: record a fast spin and a Q/E turn at zoom 30 with the test on and off.
