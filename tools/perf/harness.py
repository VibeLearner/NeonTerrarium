#!/usr/bin/env python3
"""Neon Terrarium perf harness: proves an optimization changes nothing on screen or in the simulation, and times it.

  python3 tools/perf/harness.py scenes               build tools/perf/scenes/*.json with the working tree
  python3 tools/perf/harness.py diff [--base REF]    baseline (REF, default HEAD) vs the working tree: every capture must match
  python3 tools/perf/harness.py self                 the working tree against itself (the rig must be deterministic)
  python3 tools/perf/harness.py time [--ref REF]     per-system timings (REF, or the working tree when omitted)

Headless Chromium on SwiftShader, a scripted clock and seeded Math.random (shim.js). See README.md.
"""
import argparse, base64, functools, hashlib, http.server, io, json, os, shutil, subprocess, sys, tarfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, 'out')
SCENES = os.path.join(HERE, 'scenes')
PORT = int(os.environ.get('PERF_PORT', '8791'))
VIEWPORTS = [(1280, 720), (1920, 1080)]


def ensure_three():
    lib = os.path.join(CACHE, 'lib')
    if os.path.exists(os.path.join(lib, 'three.min.js')):
        return lib
    os.makedirs(lib, exist_ok=True)
    subprocess.run(['npm', 'pack', 'three@0.128.0', '--silent'], cwd=CACHE, check=True, stdout=subprocess.DEVNULL)
    with tarfile.open(os.path.join(CACHE, 'three-0.128.0.tgz')) as t:
        for src, dst in [('package/build/three.min.js', 'three.min.js'), ('package/examples/js/utils/BufferGeometryUtils.js', 'BufferGeometryUtils.js')]:
            with t.extractfile(src) as f, open(os.path.join(lib, dst), 'wb') as o:
                o.write(f.read())
    return lib


def make_site(name, ref=None):
    """A servable copy of the game: index.html pointed at the local three.js, js/css from REF (or the working tree)."""
    site = os.path.join(CACHE, 'sites', name)
    shutil.rmtree(site, ignore_errors=True)
    os.makedirs(site)
    if ref:
        data = subprocess.run(['git', 'archive', ref, 'index.html', 'js', 'css'], cwd=REPO, check=True, capture_output=True).stdout
        with tarfile.open(fileobj=io.BytesIO(data)) as t:
            t.extractall(site)
    else:
        shutil.copy(os.path.join(REPO, 'index.html'), site)
        shutil.copytree(os.path.join(REPO, 'js'), os.path.join(site, 'js'))
        shutil.copytree(os.path.join(REPO, 'css'), os.path.join(site, 'css'))
    os.symlink(os.path.join(REPO, 'assets'), os.path.join(site, 'assets'))
    p = os.path.join(site, 'index.html')
    html = open(p).read()
    import re
    html = re.sub(r'\?v=[^"\s]*"', '"', html)
    html = html.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', '/lib/three.min.js')
    html = html.replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js', '/lib/BufferGeometryUtils.js')
    open(p, 'w').write(html)
    return '/sites/' + name + '/index.html'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def serve():
    ensure_three()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=CACHE))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def launch(pw):
    return pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--autoplay-policy=user-gesture-required'])


def open_game(browser, url, scene, vp):
    ctx = browser.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.set_default_timeout(1800000)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script('window.__PERF_SCENE = ' + json.dumps({'storage': scene.get('storage', {})}) + ';')
    pg.add_init_script(path=os.path.join(HERE, 'shim.js'))
    pg.goto('http://127.0.0.1:%d%s' % (PORT, url))
    pg.wait_for_function('() => document.readyState === "complete" && typeof frame === "function"')
    # textures and sprite sheets load on their own; let them all arrive before the first frame is drawn
    pg.wait_for_function('() => [...document.images].every(i => i.complete)')
    pg.wait_for_timeout(2500)
    pg.add_script_tag(path=os.path.join(HERE, 'page.js'))
    pg.evaluate('sc => __perf.setup(sc)', scene)
    return ctx, pg, errs


def load_scenes(only=None):
    out = []
    for f in sorted(os.listdir(SCENES)):
        if f.endswith('.json'):
            sc = json.load(open(os.path.join(SCENES, f)))
            if not only or sc['name'] in only:
                out.append(sc)
    return out


# The script every scene runs, step by step: (label, frames to run, JS to run first). The same on both builds.
def steps(scene):
    s = [
        ('noon_f1', 1, None),
        ('noon_f30', 29, None),
        ('noon_f120', 90, None),
        ('dusk_19h', 60, 'S.hour = 19'),
        ('night_23h_rain', 60, 'S.hour = 23; S.rain = true'),
        ('night_zoom_out', 30, 'zoomT = 30'),
        ('night_zoom_in', 40, 'zoomT = 4.5'),
        ('night_pan', 40, 'camGoal.x += 6; camGoal.z -= 4; yawT += .9'),
        ('night_fx_off', 10, 'S.bloom = false; S.rays = false; S.ao = false; S.vclouds = false; S.outlines = false; S.palette = true; S.mist = false; S.wetOn = false; S.lights = false'),
        ('night_fx_on', 10, 'S.bloom = true; S.rays = true; S.ao = true; S.vclouds = true; S.outlines = true; S.palette = false; S.mist = true; S.wetOn = true; S.lights = true'),
        ('dawn_6h', 40, 'S.hour = 6; S.rain = false; zoomT = %s; yawT = %s' % (scene['cam']['zoom'], scene['cam']['yaw'])),
        ('morning_rays', 40, 'S.hour = 8.5; S.vclouds = false'),
    ]
    for k, e in enumerate(scene.get('edits', [])):
        s.append(('edit%d_mid' % k, 4, e))      # mid-animation: the build sweep and its outline pass
        s.append(('edit%d' % k, 41, None))
    if scene.get('rush'):   # a crowd at the stations: boarding, a full train, the lifts, impatience
        s += [('rush_a', 400, scene['rush'])] + [('rush_' + c, 400, None) for c in 'bcdef']
    s.append(('evening_cycle', 120, 'S.hour = 17.8; S.cycle = true; S.vclouds = true'))
    return s


def run_scene(browser, url, scene, vp, keep_png=True):
    ctx, pg, errs = open_game(browser, url, scene, vp)
    caps = []
    for label, n, js in steps(scene):
        if js:
            pg.evaluate('() => { ' + js + ' }')
        c = pg.evaluate('n => __perf.cap(n)', n)
        caps.append((label, c))
    ctx.close()
    return caps, errs


def png_bytes(durl):
    return base64.b64decode(durl.split(',', 1)[1])


def pixel_diff(a, b, path):
    from PIL import Image, ImageChops
    A = Image.open(io.BytesIO(a)).convert('RGBA'); B = Image.open(io.BytesIO(b)).convert('RGBA')
    if A.size != B.size:
        return 'size %s vs %s' % (A.size, B.size)
    d = ImageChops.difference(A, B)
    n = sum(1 for p in d.getdata() if p != (0, 0, 0, 0))
    d.point(lambda v: 255 if v else 0).save(path + '_diff.png'); A.save(path + '_base.png'); B.save(path + '_cand.png')
    return '%d pixels differ' % n


def first_state_diff(a, b):
    A, B = json.loads(a), json.loads(b)
    for k in A:
        if A[k] != B.get(k):
            return k
    return '?'


def cmd_diff(base_ref, cand_ref, only, quick):
    from playwright.sync_api import sync_playwright
    srv = serve()
    ub = make_site('base', base_ref)
    uc = make_site('cand', cand_ref)
    os.makedirs(OUT, exist_ok=True)
    fails, total, info_rows = [], 0, []
    vps = VIEWPORTS[:1] if quick else VIEWPORTS
    with sync_playwright() as pw:
        br = launch(pw)
        for sc in load_scenes(only):
            for vp in vps:
                tag = '%s_%dx%d' % (sc['name'], vp[0], vp[1])
                t0 = time.time()
                cb, eb = run_scene(br, ub, sc, vp)
                cc, ec = run_scene(br, uc, sc, vp)
                if eb or ec:
                    fails.append('%s page errors: base %s cand %s' % (tag, eb[:2], ec[:2]))
                for (lb, a), (lc, b) in zip(cb, cc):
                    total += 1
                    name = tag + '_' + lb
                    pa, pb = png_bytes(a['png']), png_bytes(b['png'])
                    if pa != pb:
                        fails.append('%s: pixels: %s' % (name, pixel_diff(pa, pb, os.path.join(OUT, name))))
                    if a['state'] != b['state']:
                        fails.append('%s: state differs first at "%s"' % (name, first_state_diff(a['state'], b['state'])))
                    ia, ib = a['info'], b['info']
                    if ib['calls'] > ia['calls'] or ib['tris'] > ia['tris'] or ib['geos'] != ia['geos'] or ib['tex'] != ia['tex']:
                        fails.append('%s: renderer.info base %s cand %s' % (name, ia, ib))
                    info_rows.append((name, ia, ib))
                print('%-26s %d captures  %.0fs' % (tag, len(cb), time.time() - t0), flush=True)
        br.close()
    srv.shutdown()
    with open(os.path.join(OUT, 'info.json'), 'w') as f:
        json.dump(info_rows, f, indent=1)
    print('\n%d captures compared, %d problems' % (total, len(fails)))
    for f in fails:
        print('  FAIL', f)
    return 1 if fails else 0


def cmd_time(ref, only, frames):
    from playwright.sync_api import sync_playwright
    srv = serve()
    url = make_site('time_' + (ref or 'working').replace('/', '_'), ref)
    res = {}
    views = [('noon', 'S.hour = 12; S.rain = false'), ('night rain', 'S.hour = 23; S.rain = true'),
             ('night zoomed out', 'S.hour = 23; S.rain = true; zoom = zoomT = 30'), ('night close', 'S.hour = 23; S.rain = true; zoom = zoomT = 4.5')]
    with sync_playwright() as pw:
        br = launch(pw)
        for sc in load_scenes(only):
            ctx, pg, errs = open_game(br, url, sc, VIEWPORTS[0])
            pg.evaluate('() => { __perf.skip = true; __step(120); __perf.skip = false; }')
            res['%s: CPU, %d frames simulated' % (sc['name'], frames)] = pg.evaluate('n => __perf.cpuTime(n)', frames)
            for name, js in views:
                pg.evaluate('() => { ' + js + '; __perf.skip = true; __step(30); __perf.skip = false; }')
                res['%s: GPU, %s' % (sc['name'], name)] = pg.evaluate('n => __perf.gpuTime(n)', 6)
            ctx.close()
        br.close()
    srv.shutdown()
    for k, rep in res.items():
        print('\n== %s (ms: mean, p95)' % k)
        for name, v in sorted(rep.items(), key=lambda kv: -kv[1]['mean']):
            print('  %-24s %8.3f %8.3f' % (name, v['mean'], v['p95']))
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'timing_%s.json' % (ref or 'working').replace('/', '_')), 'w') as f:
        json.dump(res, f, indent=1)


def cmd_scenes():
    """Build the scene saves with the working tree (deterministic: seeded Math.random)."""
    from playwright.sync_api import sync_playwright
    srv = serve()
    url = make_site('scenes', None)
    defs = json.load(open(os.path.join(HERE, 'scene_defs.json')))
    os.makedirs(SCENES, exist_ok=True)
    with sync_playwright() as pw:
        br = launch(pw)
        for d in defs:
            ctx, pg, errs = open_game(br, url, {'cam': d['cam']}, VIEWPORTS[0])
            log = pg.evaluate('() => { ' + d['build'] + ' }')
            pg.evaluate('() => { for (const a of [...anims]) finishAnimsOn(a.c); save(); }')
            storage = pg.evaluate('() => { const o = {}; for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k !== "neonIsland.autoPerf") o[k] = localStorage.getItem(k); } return o; }')
            sc = {'name': d['name'], 'cam': d['cam'], 'storage': storage, 'edits': d.get('edits', []), 'rush': d.get('rush')}
            json.dump(sc, open(os.path.join(SCENES, d['name'] + '.json'), 'w'), indent=1)
            print(d['name'], log, errs[:3])
            pg.screenshot(path=os.path.join(OUT, 'scene_' + d['name'] + '.png')) if os.makedirs(OUT, exist_ok=True) is None else None
            ctx.close()
        br.close()
    srv.shutdown()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['scenes', 'diff', 'self', 'time'])
    ap.add_argument('--base', default='HEAD')
    ap.add_argument('--ref', default=None)
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--quick', action='store_true', help='one viewport only')
    ap.add_argument('--frames', type=int, default=600)
    a = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True)
    if a.cmd == 'scenes':
        cmd_scenes()
    elif a.cmd == 'diff':
        sys.exit(cmd_diff(a.base, None, a.only, a.quick))
    elif a.cmd == 'self':
        sys.exit(cmd_diff(None, None, a.only, a.quick))
    else:
        cmd_time(a.ref, a.only, a.frames)
