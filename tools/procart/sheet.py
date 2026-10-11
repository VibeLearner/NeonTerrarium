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
SCENE_OF = {'signs': 'city', 'ads': 'city', 'wallholo': 'city', 'drone': 'city', 'badge': 'megas', 'posters': 'megas', 'bikes': 'megas', 'pond': 'maxcity', 'airholo': 'maxcity', 'airholo_hacked': 'maxcity'}   # (a scene that has the thing: tools/procart/features.json)
HOURS = {'12': 'S.cycle = false; S.rain = false; S.hour = 12', '22': 'S.cycle = false; S.rain = false; S.hour = 22'}
# JS that returns {x, z} (world) for each stop, or null
FIND = {
 'signs': """() => { const rects = {}; for (const k of ART.SIGNS){ if (k === 'sign_police') continue; const r = FOL_RECTS[k][0]; rects[r.join(',')] = k; }
   let best = null; scene.traverse(m => { if (best || !m.userData.fol || !m.geometry.attributes.aRect) return; const a = m.geometry.attributes.aRect.array, n = m.count !== undefined ? m.count : a.length/4;
     for (let i = 0; i < n; i++){ if (rects[a[i*4] + ',' + a[i*4+1] + ',' + a[i*4+2] + ',' + a[i*4+3]]){ const e = m.instanceMatrix.array, v = new THREE.Vector3(e[i*16+12], e[i*16+13], e[i*16+14]).applyMatrix4(m.matrixWorld); best = { x: v.x, z: v.z, y: v.y }; break; } } }); return best; }""",
 'badge': """() => { const r = FOL_RECTS.sign_police[0]; let best = null; scene.traverse(m => { if (best || !m.userData.fol || !m.geometry.attributes.aRect) return; const a = m.geometry.attributes.aRect.array, n = a.length/4;
     for (let i = 0; i < n; i++){ if (a[i*4] === r[0] && a[i*4+1] === r[1] && a[i*4+2] === r[2] && a[i*4+3] === r[3]){ const e = m.instanceMatrix.array, v = new THREE.Vector3(e[i*16+12], e[i*16+13], e[i*16+14]).applyMatrix4(m.matrixWorld); best = { x: v.x, z: v.z, y: v.y }; break; } } }); return best; }""",
 'posters': "() => { const s = POLICE_STATIONS[0]; const sc = s && s.m.screens && s.m.screens[0]; return sc ? { x: sc.m[12], y: sc.m[13], z: sc.m[14] } : null; }",
 'bikes': "() => { const b = POLICE_BIKES[0]; return b ? { x: b.spr.position.x, y: b.spr.position.y, z: b.spr.position.z } : null; }",
 'pond': "() => { const m = megasOfKind('square').find(m => m.pond); return m ? { x: m.pond.x, y: m.pond.y, z: m.pond.z } : null; }",
 'airholo': "() => holoAt(AIR_HOLO_MAT, 0, 3)", 'airholo_hacked': "() => holoAt(AIR_HOLO_MAT, 0, 3)", 'wallholo': "() => holoAt(AIR_HOLO_MAT, 3, 99)", 'ads': "() => holoAt(HOLO_MAT, 0, 99)",
 'drone': "() => { const g = ddMesh.geometry; if (!g.instanceCount) return null; const p = g.attributes.aPos.array; return { x: p[0], y: p[1], z: p[2] }; }",
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
    srv = H.serve(); url = H.make_site('procart_sheet', None); sc = H.load_scenes([a.scene_run])[0]
    stops = a.stops_run.split(',')
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        pg.evaluate('() => { ' + HOLO_JS + ' }')
        for _ in range(20): pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }'); pg.wait_for_timeout(250)
        pg.evaluate('async () => { for (let i = 0; i < 200 && ART.later.length; i++) await new Promise(r => setTimeout(r, 50)); }')   # (the deferred boards drawn)
        for hour in a.hours.split(','):
            pg.evaluate('() => { ' + HOURS[hour] + ' }')
            for stop in stops:
                if stop == 'drone':   # a delivery drone in flight: step on until one is (they come and go)
                    for _ in range(60):
                        if pg.evaluate('() => ddMesh.geometry.instanceCount || 0'): break
                        pg.evaluate('() => { __perf.skip = true; __step(60); __perf.skip = false; }')
                pos = pg.evaluate(FIND[stop])
                if not pos: print('skip %s: not in scene %s' % (stop, a.scene_run)); continue
                for z in [int(v) for v in a.zooms.split(',')]:
                    pg.evaluate('([p, z]) => { camGoal.set(p.x, p.y === undefined ? camGoal.y : p.y, p.z); camT.copy(camGoal); zoom = zoomT = z; }', [pos, z])
                    if stop == 'airholo_hacked':   # hold the hack cycle at the hacked picture for this hologram: cyc = (time + id*23.7) mod 94.8 in 65..90
                        pg.evaluate('p => { const T = 75 - p.id*23.7; AIR_HOLO_MAT.uniforms.time = { value: ((T % 94.8) + 94.8) % 94.8 }; }', pos)
                    elif stop == 'airholo':
                        pg.evaluate('p => { const T = 20 - p.id*23.7; AIR_HOLO_MAT.uniforms.time = { value: ((T % 94.8) + 94.8) % 94.8 }; }', pos)
                    pg.evaluate('() => { __perf.skip = true; __step(3); __perf.skip = false; }')
                    scr = pg.evaluate('p => { const v = new THREE.Vector3(p.x, p.y === undefined ? 0 : p.y, p.z).project(cam); return [v.x*.5 + .5, 1 - (v.y*.5 + .5)]; }', pos)   # (where the thing is on the screen: the crop is centred there)
                    pair = []
                    for old in (True, False):
                        pg.evaluate('o => { window.__OLD_ART = o; FOL_ATLAS.repaint(); ART.repaintAll(); }', old); pg.wait_for_timeout(700)
                        pg.evaluate('async () => { for (let i = 0; i < 100 && ART.later.length; i++) await new Promise(r => setTimeout(r, 50)); }')
                        if stop == 'radio':   # the cassette on a plain overlay with the page's own .tape markup and CSS (the real deck only shows with the radio on)
                            pg.evaluate("""() => { let o = document.getElementById('pa_overlay'); if (!o){ o = document.createElement('div'); o.id = 'pa_overlay'; o.style.cssText = 'position:fixed;left:10px;top:10px;padding:14px;background:#0b0b14;z-index:99999';
                                o.innerHTML = '<span class="tape" style="display:block"><img alt="" width="118" height="88"><i class="reel l"></i><i class="reel r"></i></span>'; document.body.appendChild(o); }
                              o.querySelector('img').src = document.querySelector('.tape img').src; }"""); pg.wait_for_timeout(500)
                            pair.append(Image.open(io.BytesIO(pg.screenshot(clip={'x': 10, 'y': 10, 'width': 146, 'height': 116}))).convert('RGB')); continue
                        pair.append(toimg(pg.evaluate('() => __perf.cap(6, 3)')['png']))
                    path = os.path.join(a.out, 'game_%s_%s_z%d_h%s.png' % (a.scene_run, stop, z, hour))
                    if stop == 'radio':
                        W = max(i.size[0] for i in pair); Hh = sum(i.size[1] for i in pair) + 40; t = Image.new('RGB', (W, Hh), (30, 30, 30)); d = ImageDraw.Draw(t)
                        d.text((4, 3), 'old art', fill=(255, 255, 255)); t.paste(pair[0], (0, 18)); d.text((4, pair[0].size[1] + 21), 'new art', fill=(255, 255, 255)); t.paste(pair[1], (0, pair[0].size[1] + 36)); t.save(path); print(path); break
                    Wd, Hh = pair[0].size; cw, ch = Wd//2, Hh//2
                    sx, sy = scr; bx = int(min(max(sx*Wd - cw/2, 0), Wd - cw)); by = int(min(max(sy*Hh - ch/2, 0), Hh - ch)); box = (bx, by, bx + cw, by + ch)
                    t = Image.new('RGB', (cw*2 + 8, ch + 18), (30, 30, 30)); d = ImageDraw.Draw(t)
                    t.paste(pair[0].crop(box), (0, 18)); t.paste(pair[1].crop(box), (cw + 8, 18)); d.text((4, 3), 'old art', fill=(255, 255, 255)); d.text((cw + 12, 3), 'new, drawn in code  (%s, zoom %d, %s:00)' % (stop, z, hour), fill=(255, 255, 255))
                    t.save(path); print(path)
                if stop in ('airholo', 'airholo_hacked'):
                    pg.evaluate('() => { AIR_HOLO_MAT.uniforms.time = FOL_UNI.time; }')
        if errs: print('PAGE ERRORS', errs[:5])
        br.close()
    srv.shutdown(); srv.server_close()
def radio(out):
    out = os.path.abspath(out)
    """The cassette on a static page with the game's own CSS (the .tape box, the turning reels at 45 degrees too), old picture and new one side by side, at the size the page shows it (118 x 88) and 3x."""
    import glob
    from PIL import Image
    from playwright.sync_api import sync_playwright
    files = [os.path.join(ROOT, 'js/spritegen.js'), os.path.join(ROOT, 'js/artgen.js'), os.path.join(ROOT, 'js/artgen_tools.js'), os.path.join(ROOT, 'js/artgen_wanted.js')]
    with sync_playwright() as pw:
        b = pw.chromium.launch(); pg = b.new_page(); pg.set_content('<body></body>')
        pg.evaluate('() => { window.THREE = { Texture: function(){}, CanvasTexture: function(){}, TextureLoader: function(){ this.load = () => ({}); } }; }')
        for f in files: pg.add_script_tag(content=open(f).read() + "\n;if (typeof ART !== 'undefined') window.ART = ART; if (typeof SG !== 'undefined') window.SG = SG;")
        url = pg.evaluate("() => { const c = document.createElement('canvas'); c.width = 59; c.height = 44; ART.gens.cassette.fn(c.getContext('2d'), 59, 44, ART); return c.toDataURL(); }")
        html = '<html><head><link rel="stylesheet" href="file://%s/css/style.css"><style>body{background:#0b0b14;margin:0;padding:16px;display:flex;gap:40px;position:static}.t{position:relative}.t .tape{display:block}.reel{animation:none!important}.r45 .reel{transform:rotate(45deg)}</style></head><body>' % ROOT
        for lab, src, cls in (('old', 'file://%s/assets/ui/cassette.png' % ROOT, ''), ('new', url, ''), ('new, reels turned', url, 'r45')):
            html += '<div class="t %s"><span class="tape"><img src="%s" alt="" width="118" height="88"><i class="reel l"></i><i class="reel r"></i></span></div>' % (cls, src)
        html += '</body></html>'; path = os.path.join(out, 'radio_page.html'); open(path, 'w').write(html)
        pg2 = b.new_page(viewport={'width': 520, 'height': 130}); pg2.goto('file://' + path); pg2.wait_for_timeout(500)
        shot = os.path.join(out, 'radio_old_new.png'); pg2.screenshot(path=shot); b.close()
    im = Image.open(shot); im.resize((im.size[0]*2, im.size[1]*2), Image.NEAREST).save(shot); os.remove(path); print(shot)
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scene', default=None, help='default: a scene that has each thing (SCENE_OF)'); ap.add_argument('--stops', default='signs,badge,posters,bikes,pond,airholo,airholo_hacked,wallholo,ads,drone')
    ap.add_argument('--zooms', default='8,15,30'); ap.add_argument('--hours', default='12,22'); ap.add_argument('--out', default=os.path.join(HERE, 'sheets')); ap.add_argument('--no-dump', action='store_true'); ap.add_argument('--no-game', action='store_true')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    if not a.no_dump:
        names = ['sign_ramen_pink', 'sign_coffee_cyan', 'sign_arcade_amber', 'sign_police', 'wanted', 'cassette', 'ddrone', 'koi', 'holo_ads', 'holo_pureair', 'holo_freeair', 'holo_aether', 'holo_sky', 'holo_synth', 'holo_watch', 'holo_walls'] + ['pbike_' + n for n in ('r1c1', 'r1c2', 'r1c3', 'r1c4', 'r2c1', 'r2c2', 'r2c3', 'r2c4')]
        subprocess.check_call([sys.executable, os.path.join(HERE, 'dump.py')] + names + ['--scale', '2', '--bg', 'black', '--out', os.path.join(a.out, 'dump')])
    if not a.no_game:
        radio(a.out)
        by = {}
        for st in a.stops.split(','): by.setdefault(a.scene or SCENE_OF[st], []).append(st)
        for sc, sts in by.items(): a.scene_run = sc; a.stops_run = ','.join(sts); game(a)
main()
