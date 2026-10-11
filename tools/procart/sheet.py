#!/usr/bin/env python3
"""Comparison sheets, old art against new (procedural art plan, item 8).
  python3 tools/procart/sheet.py [--scene megas] [--stops signs,police,pond,airholo,airholo_hacked,wallholo,ads,drone,radio] [--zooms 8,15,30] [--hours 12,22] [--out tools/procart/sheets]
         [--no-dump] [--no-game]
1. per asset, old against new at 1x and a scale (and every frame of the animated ones): tools/procart/dump.py, images in OUT/dump/;
2. in-game crops of the same view, old art on the left, new on the right, both captured in ONE page: the view is captured with the code-drawn art, then window.__OLD_ART is set, the textures and the sprite
   atlas are repainted (ART.repaintAll, FOL_ATLAS.repaint: what the overlay test "old art (as before)" does) and the same frame is captured again. One image per stop, zoom and hour.
Each stop centres the camera on a place that has the thing in it, found by looking at the scene's own objects (signs: a sprite instance; police: the station; pond: a square with a pond; airholo: a big air hologram
quad (clean or, for airholo_hacked, with its hack cycle held at the hacked picture); wallholo: a wall hologram; ads: a hologram ad; drone: a delivery drone in flight; radio: the cassette in the page corner).
A stop whose thing is not in the scene is skipped with a note (use --scene maxcity or megas). Needs playwright, pillow, numpy (the perf harness's own setup)."""
import argparse, base64, io, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'perf'))
HOURS = {'12': 'S.cycle = false; S.rain = false; S.hour = 12', '22': 'S.cycle = false; S.rain = false; S.hour = 22'}
# JS that returns {x, z} (world) for each stop, or null
FIND = {
 'signs': """() => { const rects = {}; for (const k of ART.SIGNS){ const r = FOL_RECTS[k][0]; rects[r.join(',')] = k; }
   let best = null; scene.traverse(m => { if (best || !m.userData.fol || !m.geometry.attributes.aRect) return; const a = m.geometry.attributes.aRect.array, n = m.count !== undefined ? m.count : a.length/4;
     for (let i = 0; i < n; i++){ if (rects[a[i*4] + ',' + a[i*4+1] + ',' + a[i*4+2] + ',' + a[i*4+3]]){ const e = m.instanceMatrix.array, v = new THREE.Vector3(e[i*16+12], e[i*16+13], e[i*16+14]).applyMatrix4(m.matrixWorld); best = { x: v.x, z: v.z, y: v.y }; break; } } }); return best; }""",
 'police': "() => { const s = POLICE_STATIONS[0]; return s ? { x: s.m.x, z: s.m.z } : null; }",
 'pond': "() => { const m = megasOfKind('square').find(m => m.pond); return m ? { x: m.x, z: m.z } : null; }",
 'airholo': "() => holoAt(AIR_HOLO_MAT, 0, 3)", 'airholo_hacked': "() => holoAt(AIR_HOLO_MAT, 0, 3)", 'wallholo': "() => holoAt(AIR_HOLO_MAT, 3, 99)", 'ads': "() => holoAt(HOLO_MAT, 0, 99)",
 'drone': "() => { const g = ddMesh.geometry; if (!g.instanceCount) return null; const p = g.attributes.aPos.array; return { x: p[0], z: p[2] }; }",
 'radio': "() => ({ x: camT.x, z: camT.z })",
}
HOLO_JS = """window.holoAt = (mat, lo, hi) => { let found = null; scene.traverse(m => { if (found || !m.isMesh || m.material !== mat) return; const uv = m.geometry.attributes.uv.array, p = m.geometry.attributes.position.array;
  for (let q = 0; q + 5 < uv.length/2; q += 6){ const pr = Math.floor(uv[q*2 + 1] + 1e-4); if (mat === AIR_HOLO_MAT ? (pr >= lo && pr < hi) : true){ let x = 0, y = 0, z = 0; for (let k = 0; k < 6; k++){ x += p[(q + k)*3]; y += p[(q + k)*3 + 1]; z += p[(q + k)*3 + 2]; }
    const v = new THREE.Vector3(x/6, y/6, z/6).applyMatrix4(m.matrixWorld); found = { x: v.x, z: v.z, y: v.y, id: Math.floor(uv[q*2] + 1e-4) }; break; } } }); return found; };"""
def toimg(durl):
    from PIL import Image
    return Image.open(io.BytesIO(base64.b64decode(durl.split(',', 1)[1]))).convert('RGB')
def game(a):
    import harness as H
    from PIL import Image, ImageDraw
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('procart_sheet', None); sc = H.load_scenes([a.scene])[0]
    stops = a.stops.split(',')
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        pg.evaluate('() => { ' + HOLO_JS + ' }')
        for _ in range(20): pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }'); pg.wait_for_timeout(250)
        pg.evaluate('async () => { for (let i = 0; i < 200 && ART.later.length; i++) await new Promise(r => setTimeout(r, 50)); }')   # (the deferred boards drawn)
        for hour in a.hours.split(','):
            pg.evaluate('() => { ' + HOURS[hour] + ' }')
            for stop in stops:
                pos = pg.evaluate(FIND[stop])
                if not pos: print('skip %s: not in scene %s' % (stop, a.scene)); continue
                for z in [int(v) for v in a.zooms.split(',')]:
                    pg.evaluate('([p, z]) => { camGoal.set(p.x, camGoal.y, p.z); camT.copy(camGoal); zoom = zoomT = z; }', [pos, z])
                    if stop == 'airholo_hacked':   # hold the hack cycle at the hacked picture for this hologram: cyc = (time + id*23.7) mod 94.8 in 65..90
                        pg.evaluate('p => { const T = 75 - p.id*23.7; AIR_HOLO_MAT.uniforms.time = { value: ((T % 94.8) + 94.8) % 94.8 }; }', pos)
                    elif stop == 'airholo':
                        pg.evaluate('p => { const T = 20 - p.id*23.7; AIR_HOLO_MAT.uniforms.time = { value: ((T % 94.8) + 94.8) % 94.8 }; }', pos)
                    pair = []
                    for old in (True, False):
                        pg.evaluate('o => { window.__OLD_ART = o; FOL_ATLAS.repaint(); ART.repaintAll(); }', old); pg.wait_for_timeout(700)
                        pg.evaluate('async () => { for (let i = 0; i < 100 && ART.later.length; i++) await new Promise(r => setTimeout(r, 50)); }')
                        if stop == 'radio':
                            pg.evaluate("() => { const d = document.getElementById('tapedeck'); if (d) d.classList.add('live'); }"); pg.wait_for_timeout(500)
                            el = pg.locator('.tapedeck'); pair.append(Image.open(io.BytesIO(el.screenshot())).convert('RGB')); continue
                        pair.append(toimg(pg.evaluate('() => __perf.cap(6, 3)')['png']))
                    path = os.path.join(a.out, 'game_%s_%s_z%d_h%s.png' % (a.scene, stop, z, hour))
                    if stop == 'radio':
                        W = max(i.size[0] for i in pair); Hh = sum(i.size[1] for i in pair) + 40; t = Image.new('RGB', (W, Hh), (30, 30, 30)); d = ImageDraw.Draw(t)
                        d.text((4, 3), 'old art', fill=(255, 255, 255)); t.paste(pair[0], (0, 18)); d.text((4, pair[0].size[1] + 21), 'new art', fill=(255, 255, 255)); t.paste(pair[1], (0, pair[0].size[1] + 36)); t.save(path); print(path); break
                    Wd, Hh = pair[0].size; cw, ch = Wd//2, Hh//2; box = (Wd//4, Hh//4, Wd//4 + cw, Hh//4 + ch)
                    t = Image.new('RGB', (cw*2 + 8, ch + 18), (30, 30, 30)); d = ImageDraw.Draw(t)
                    t.paste(pair[0].crop(box), (0, 18)); t.paste(pair[1].crop(box), (cw + 8, 18)); d.text((4, 3), 'old art', fill=(255, 255, 255)); d.text((cw + 12, 3), 'new, drawn in code  (%s, zoom %d, %s:00)' % (stop, z, hour), fill=(255, 255, 255))
                    t.save(path); print(path)
                if stop in ('airholo', 'airholo_hacked'):
                    pg.evaluate('() => { AIR_HOLO_MAT.uniforms.time = FOL_UNI.time; }')
        if errs: print('PAGE ERRORS', errs[:5])
        br.close()
    srv.shutdown()
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scene', default='megas'); ap.add_argument('--stops', default='signs,police,pond,airholo,airholo_hacked,wallholo,ads,drone,radio')
    ap.add_argument('--zooms', default='8,15,30'); ap.add_argument('--hours', default='12,22'); ap.add_argument('--out', default=os.path.join(HERE, 'sheets')); ap.add_argument('--no-dump', action='store_true'); ap.add_argument('--no-game', action='store_true')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    if not a.no_dump:
        names = ['sign_ramen_pink', 'sign_coffee_cyan', 'sign_arcade_amber', 'sign_police', 'wanted', 'cassette', 'ddrone', 'koi', 'holo_ads', 'holo_pureair', 'holo_freeair', 'holo_aether', 'holo_sky', 'holo_synth', 'holo_watch', 'holo_walls'] + ['pbike_' + n for n in ('r1c1', 'r1c2', 'r1c3', 'r1c4', 'r2c1', 'r2c2', 'r2c3', 'r2c4')]
        subprocess.check_call([sys.executable, os.path.join(HERE, 'dump.py')] + names + ['--scale', '3', '--bg', 'black', '--out', os.path.join(a.out, 'dump')])
    if not a.no_game: game(a)
main()
