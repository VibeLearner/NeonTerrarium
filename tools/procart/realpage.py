#!/usr/bin/env python3
"""The real page, worker on: load a scene, zoom and turn, watch an air hologram go through its hack cycle, wait for a delivery drone, flip "old art (as before)" and back, and report page errors and failed requests.
  python3 tools/procart/realpage.py [maxcity]        (maxcity has a police station, a club, the pond and the air-filter tower; give it several minutes)"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H
from playwright.sync_api import sync_playwright
def main():
    scene = sys.argv[1] if len(sys.argv) > 1 else 'maxcity'
    srv = H.serve(); url = H.make_site('procart_real', None); sc = H.load_scenes([scene])[0]; bad = []
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__GEN_WORKER = true;')
        pg.on('requestfailed', lambda r: bad.append(('failed', r.url[-60:])))
        pg.on('response', lambda r: bad.append((r.status, r.url[-60:])) if r.status >= 400 else None)
        for i in range(40):
            pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }'); pg.wait_for_timeout(300)
        print('worker', pg.evaluate('() => RW.state'), 'megas', pg.evaluate("() => [...megas.values()].map(m => m.kind).join(',')")[:80], flush=True)
        for z in (8, 15, 30, 15):
            pg.evaluate('z => { zoom = zoomT = z; yaw = yawT = yaw + .4 }', z); pg.evaluate('() => __perf.cap(4, 2)')
        # a hack cycle: hold the air hologram uniform clock at the ad, the glitch, the hacked picture, and back
        if pg.evaluate('() => typeof AIR_HOLO_MAT !== "undefined"'):
            for t in (20, 61, 75, 93):
                pg.evaluate('t => { AIR_HOLO_MAT.uniforms.time = { value: t }; }', t); pg.evaluate('() => __perf.cap(2, 1)')
            pg.evaluate('() => { AIR_HOLO_MAT.uniforms.time = FOL_UNI.time; }')
        print('drones in flight', pg.evaluate('() => ddMesh.geometry.instanceCount || 0'), 'art drawn', pg.evaluate('() => ART.later.length === 0'), flush=True)
        for old in (True, False, True, False):
            pg.evaluate('o => { PH.tests.oldArt = o; window.__OLD_ART = o; FOL_ATLAS.repaint(); ART.repaintAll(); }', old); pg.wait_for_timeout(500); pg.evaluate('() => __perf.cap(4, 2)')
        print('page errors', errs[:5], '| failed requests', bad[:5]); br.close()
    srv.shutdown(); srv.server_close()
main()
