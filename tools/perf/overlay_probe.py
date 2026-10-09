#!/usr/bin/env python3
"""How big the static cache's glow overlay is: its triangles (flickering and blinking lights, windows in the stutter band of LIGHTS_ON)
against the building (ATLAS) triangles in the world's visible meshes.   python3 tools/perf/overlay_probe.py maxcity [city ...]"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """() => {
  const vis = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  let atlas = 0, fb = 0, win = 0, n = 0, drawn = 0;
  const lv = LIGHTS_ON.value, lo = Math.max(0, Math.floor((lv - .04)*255) - 1), hi = Math.min(255, Math.ceil(lv*255) + 1);
  world.traverse(o => {
    if (!o.isMesh || !vis(o)) return;
    if (o.userData.isOv){ const u = o.userData.ovInfo; n++; fb += u.nFB/3; win += (o.geometry.index.count - u.nFB)/3; drawn += u.nFB/3 + (hi >= lo ? u.off[hi + 1] - u.off[lo] : 0); }
    else if (o.material === ATLAS){ const g = o.geometry, u = g.userData.cut; atlas += (u ? u.A + u.S : (g.userData.shown ?? g.index.count))/3; }
  });
  return { hour: S.hour, lights_on: lv, atlas_tris: atlas, overlay_meshes: n, flicker_blink_tris: fb, window_tris: win, overlay_drawn_per_frame: drawn, share_drawn: drawn/atlas, share_all: (fb + win)/atlas };
}"""
if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('probe', None)
    with sync_playwright() as pw:
        for name in sys.argv[1:]:
            sc = H.load_scenes([name])[0]
            br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
            for label, hour in (('noon', 12), ('night', 23), ('evening, held', 19.5)):
                pg.evaluate('h => { S.hour = h; }', hour); pg.evaluate('n => __perf.cap(n)', 700)
                print(name, label, json.dumps(pg.evaluate(JS)))
            print(errs[:2]); br.close()
    srv.shutdown()
