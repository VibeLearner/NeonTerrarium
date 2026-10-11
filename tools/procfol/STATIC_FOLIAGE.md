Item 6.2: sway that can't be seen goes into the static cache. Notes (plain text).

WHAT IT DOES
- buildFoliage (js/sprites.js) makes the swaying plants (everything but lit signs and glyphs) and the lit signs separate meshes; the signs mesh
  exists only if signs do (no extra draw otherwise). Sway meshes carry userData.swayed; folSettings (used by folMesh and by mergeLeaves in world.js)
  puts them on layer 4 (live) or STATIC_BIT (static cache) as FOLST says. Signs always stay live (switch-on, flicker).
- FOLST.update(wind) runs each frame in main.js. On: MRT and the cache in 'reuse' mode, not foliageStaticOff / foliageLodOff / noStatic /
  window.__FOL_LOD_OFF, and the sway peak is under the tolerance. FOLST.on is part of the cache's HARD key (scHard), so a flip is a cache redraw exactly as a zoom change is
  (strips in the background, the old way draws meanwhile). FOL_FAR.lawn (lawn far swap) is in the HARD key too.
- The cache draws plants at rest: scAtRest sets FOL_UNI.wind = 0 and FOL_UNI.res = the cache target's size (the plants snap to whole pixels of res, as in the
  live pass). Time needs no holding (the sway is wind times a wave; the lawn lean too). The tint is now part of the lights a draw holds (scLightSnap,
  scLightPut, the background job in scBand), so a strip or rectangle drawn later gets the tint of the lights its picture was drawn with.
- Edits: flushSuper swaps a super-region's joined plant mesh. While plants are static the add/remove is noted quietly and folDiffNote notes the boxes of the
  regions whose plant geometry is in only the old or only the new joined mesh (userData.parts shares each region's geometry), so an edit redraws a rectangle
  (scEditRect) rather than the whole picture. Bridges and walkways in a 'c' group are noted piece by piece.
- Overlay test foliageStaticOff (PH.tests, setTest): plants always live. window.__FOL_LOD_OFF and foliageLodOff also keep them live.
  window.__FOL_TOL sets the tolerance (pixels) for trying.

THE ZOOM, ZF, AND ITS FORMULA
- Sway shifts whole texel rows. Peak amplitude at wind 1 in texels (sum of the two sine terms at the tip): laundry 1.75, hanging greenery 2.1,
  standing plants 1.3, lawn lean .95 (0.0525 world units). A = the largest present (2.1). The biggest shift is n = floor(A*wind + .5) texels (0 = never moves).
- One texel is texelPx = H/(2*zoom*PX) screen pixels, PX = 18, H the render height (480 lines: H = 480*min(max(1, zoom/13.2), 1.6)).
- Static when n*texelPx < TOL (TOL = .5 pixel, in at 85% of it, out at 115%). ZF = H*n/(2*PX*TOL) = H*n/18 for TOL .5.
- At the defaults (wind 1, 480 lines, n = 2): H tops out at 768 on a 1280x720 screen's cap, 576 on the 1024x576 render the harness uses; texelPx at zoom 30 is
  .53, so the peak is 1.07 px; ZF would be 64 (H = 576, zoom 30 is the game's maximum). So at the default wind the half-pixel rule never fires inside the zoom range.
  It fires when n = 0 (wind under .24: every zoom) and on a smaller render size (240 lines, n = 1 under wind .69: texelPx .36 at zoom 30).
  Wind is read every frame (rain adds half again), the render size from H, so both are followed.
- Decision: TOL stays .5 (the task's rule). So with default settings the feature is inert except calm wind and low render size, and the target
  (plant triangles at zoom 30 on the max city down by half) is NOT met by 6.2 alone. What freezing about one pixel of sway would buy is measured with
  window.__FOL_TOL = 1.4 (labeled so below); the owner decides whether she accepts a sway frozen at rest where it would have moved by up to 1 px.

NUMBERS (counts only; tools/procfol/count_static.py, json in tools/procfol/measure/static.*.json)
Plant triangles drawn live per frame, still view, cache on, maxcity, 1280x720 viewport (renders H 360, 405, 576):
                         zoom 8     zoom 15    zoom 30
  before (wip/procfol)   142,550    177,212    185,206
  now, default TOL .5    164,088 *  186,368 *  189,560 *      (* plants still live, same as before; the differences are plot and lawn state noise between runs)
  now, TOL 1.4 (labeled) 164,088    186,368    15,670 (signs only), down 91.5%
  the static pass draws the plants once per cache redraw instead (about 6,510 on the small city scene, 43k per frame in the 4 frames after the zoom
  while the 8-strip background job runs on maxcity).
city scene: 7,286 live at every zoom with plants live, 776 at zoom 30 with TOL 1.4.

WHAT IT DOES TO THE CACHE'S REDRAWS (scripted: still 30 frames, slow pan, fast pan, rest, turn, rest, pan, rest; zoom 30, all counts equal with plants live and plants static)
  maxcity: whole swaps 0, ring strips 1, edit rectangles 19, background-job bands 106, rect draws 20 (before, plants live with TOL 1.4 but off, and plants static: identical).
  city: whole swaps 1, ring strips 2, edit rectangles 15, bands 8, rect draws 17 (identical with and without).
  The number of redraws does not change; each redraw now carries the plants in its area (cache plant triangles in the script: 21.9M on maxcity, 163k on city),
  and the flip itself (zoom across ZF, wind across a step of n) is one redraw as any zoom change is. A turn is not drawn from the cache (old path), so plants draw live
  during turns as before. "Nothing per frame while still" holds: the 43k per frame above is the background job after a zoom change, and the edit rectangles
  during the load of maxcity; the equal counts show the plants add none.

FLIP TESTS (harness diff --base wip/procfol --quick --only city, pixel for pixel)
- default settings: noon_f1, night_zoom_out (zoom 30), edit1, zoom 8, 15, 30 at noon: 0 differing pixels, 6 of 6 (live path, as before).
- TOL 1.4: zoom 8 and 15 and noon_f1, edit1: 0 (below ZF, plants live). Zoom 30 and night_zoom_out: 16,391 and 13,476 pixels (1.5 percent), all on plant-covered
  areas (vines and laundry; crops show the same picture with leaf rows shifted by a texel). That is the sway.
- Wind 0 (static at every zoom, nothing should differ): zoom 8: 0; zoom 15: 9 pixels; zoom 30: 51 to 60 pixels of 921,600. Each cluster is a pixel or two
  where a different texel of the same sprite is chosen. With plants live in the same build (__FOL_LOD_OFF) the diff is 0, so it comes from drawing them
  in the cache. Not explained for sure: the likely cause is a sampling tie at a texel edge, whose interpolated uv differs in the last bits between the live pass
  (viewport shifted by M) and the cache (viewport at 0). Not depth-sort order: drawing plants after every other static (renderOrder) changed nothing, and it was dropped.
  A rectangle redraw vs a whole redraw of the cache: tools/perf/cache_compare.py city --at r_sun2 r_place_mid r_place_end r_demo_mid r_wrap_mid with wind 0 and
  plants static: 73, 18, 3, 12, 8 pixels differ (normals 0); with plants live: 73, 31, 10, 19, 8. The same pixels recur with plants live, so that
  noise is not the plants'.
- recipe_proof.py --worker city: 0 of 227 plots differ. Page errors empty in every run.
- Real page (real clock, 1280x720, software GL): zoom 13, 30, 8, turn and pan, wind .2 and 1, TOL default and 1.4, foliageStaticOff toggled: no errors,
  FOLST flips as the formula says (wind .2 at zoom 30: static; wind 1: live; TOL 1.4: static at 30, live at 8). The cache itself reported 'off' in every sample (the
  software renderer is too slow for it to stay in use), so the real page check covers errors and the switch, not the cached picture.

RISKS
- At TOL .5 nothing changes for most players; a larger TOL trades a frozen sway for triangles. If TOL is raised the pop on crossing ZF is a one-texel
  shift of the top rows, hidden by the strip redraw's cross-over only in the sense that the old path draws live plants until the new cache is ready.
- The tiny texel ties above (about 0.005 percent of pixels) are the one place the static path is not bit for bit.
- Plants made by the legacy ground builder (ground.js buildFoliage then scene.add(city)) never tell the cache anything; they take the state's layer when built
  and are re-listed on each flip, but an edit there would not note boxes (the legacy path is not used by the city).
- A per-sway-type split (standing plants and lawn, n = 1, going static earlier than hanging greenery and laundry) was not done.
