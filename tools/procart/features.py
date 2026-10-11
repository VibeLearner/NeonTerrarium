#!/usr/bin/env python3
"""Which of this round's art each scene has: shop icon signs, police station (posters, bikes), a koi pond, hologram ads, air holograms, wall holograms, delivery drones in flight.
  python3 tools/procart/features.py city dense megas maxcity      (counts only, no drawing; about a minute a scene)"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H
from playwright.sync_api import sync_playwright
JS = """() => {
 const o = { signs: 0, police: typeof POLICE_STATIONS !== 'undefined' ? POLICE_STATIONS.length : 0, bikes: typeof POLICE_BIKES !== 'undefined' ? POLICE_BIKES.length : 0, ponds: 0, ads: 0, air: 0, wall: 0, drones: ddMesh.geometry.instanceCount || 0 };
 for (const m of megas.values()) if (m.pond) o.ponds++;
 const rects = {}; for (const k of ART.SIGNS){ const r = FOL_RECTS[k][0]; rects[r.join(',')] = 1; }
 scene.traverse(m => { if (m.userData.fol && m.geometry.attributes.aRect){ const a = m.geometry.attributes.aRect.array, n = a.length/4; for (let i = 0; i < n; i++) if (rects[a[i*4] + ',' + a[i*4+1] + ',' + a[i*4+2] + ',' + a[i*4+3]]) o.signs++; }
   if (m.isMesh && (m.material === HOLO_MAT || m.material === AIR_HOLO_MAT)){ const uv = m.geometry.attributes.uv.array; for (let q = 0; q + 5 < uv.length/2; q += 6){ if (m.material === HOLO_MAT) o.ads++; else if (Math.floor(uv[q*2+1] + 1e-4) >= 3) o.wall++; else o.air++; } } });
 return o; }"""
def main():
    scenes = sys.argv[1:] or ['city', 'dense', 'megas']
    srv = H.serve(); url = H.make_site('procart_feat', None); out = {}
    with sync_playwright() as pw:
        for name in scenes:
            br = H.launch(pw); sc = H.load_scenes([name])[0]; ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
            for _ in range(16): pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }'); pg.wait_for_timeout(250)
            r = pg.evaluate(JS)
            for _ in range(60):   # a delivery drone: step on until one flies (or give up)
                if r['drones']: break
                pg.evaluate('() => { __perf.skip = true; __step(60); __perf.skip = false; }'); r['drones'] = pg.evaluate('() => ddMesh.geometry.instanceCount || 0')
            out[name] = r; print(name, r, errs[:2], flush=True); br.close()
    srv.shutdown(); json.dump(out, open(os.path.join(HERE, 'features.json'), 'w'), indent=1)
main()
