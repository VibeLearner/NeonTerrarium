#!/usr/bin/env python3
"""Baked far buildings, item 2: the shell builder (js/shell.js) run on plots of every kind, made through the game itself.

For each scene it makes plots from their recipes (recipeGen, as the plot worker does; megastructures through their own data), runs Shell.build on the atlas
triangles and prints, per plot kind, per builder and per megastructure: boxes, shell triangles (2 per visible face rectangle, bottoms and shared faces left
out), real triangles (visible), kept triangles (outside the shell by more than keepDist: stay real) and the kept share, the mass the boxes cover, the phantom
share (box volume that may be air), and the totals real+x, stand-in+x and baked+x (x: textured, glow and shader geometry outside the atlas, which stays as it is).
Counts only: no rendering is timed. The voxel time is measured in node on the dumped geometry (--node).

   python3 tools/perf/shell_probe.py city dense --per-kind 8
   python3 tools/perf/shell_probe.py megas --opts '{"keepDist":0.45}' --mega-boxes 3
   python3 tools/perf/shell_probe.py city --node          (also dumps the geometry and runs tools/perf/shell_probe_node.js on it for the voxel time)
   python3 tools/perf/shell_probe.py city --json out.json
(PERF_PORT=8933 moves the local server off the harness's port when another check is running.)
"""
import argparse, json, os, struct, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

SHELL_JS = os.path.join(H.REPO, 'js', 'shell.js')
PROBE_JS = os.path.join(H.HERE, 'shell_probe.js')
DUMP = os.path.join(H.CACHE, 'shell_dump')


def open_scene(pw, url, name):
    sc = H.load_scenes([name])[0]
    br = H.launch(pw)
    ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true;')
    pg.add_script_tag(path=SHELL_JS)
    pg.add_script_tag(path=PROBE_JS)
    return br, pg, errs


def spread(l, n):
    if len(l) <= n: return l
    return [l[int(k*len(l)/n)] for k in range(n)]


def bkey(name):
    return name.replace('+balc', '') + ('+balc' if '+balc' in name else '')


def plan(pg, per_kind, per_builder, pods, air_n, greens, seed, scan_max):
    """The plots to examine: pods hung on a few plots first; then every plot (up to scan_max, evenly spread) is made once to learn its kind and builders, and a few
    of each kind and of each ground builder are picked; tall commercial plots forced to throw the air hologram; empty plots as platform, lawn and park."""
    if pods:
        pg.evaluate('n => __sp.hangPods(n)', pods)
    scan = pg.evaluate('([s, m]) => __sp.scan(s, m)', [seed, scan_max])
    lst = []; seen = {}
    def add(it):
        k = (it['i'], it['j'], json.dumps(it.get('over')), bool(it.get('air')))
        if k not in seen: seen[k] = it; lst.append(it)
        elif it.get('builder'): seen[k]['builder'] = it['builder']
    byk, byb = {}, {}
    for r in scan:
        byk.setdefault(r['kind'], []).append(r)
        if r['builders']: byb.setdefault(bkey(r['builders'][0]), []).append(r)
    for k, l in byk.items():
        for r in spread(l, per_kind): add({'i': r['i'], 'j': r['j'], 'kind': k})
    for k, l in byb.items():
        for r in spread(l, per_builder): add({'i': r['i'], 'j': r['j'], 'kind': r['kind'], 'builder': k})
    if air_n:
        tall = pg.evaluate("""n => [...cells.values()].filter(c => !c.mega && !c.lift && c.sections.length && c.sections[0].zone === 'mid').sort((a, b) => b.height - a.height).slice(0, n * 3).map(c => [c.i, c.j])""", air_n)
        for i, j in tall: add({'i': i, 'j': j, 'air': True})
    if greens:
        emp = pg.evaluate("() => [...cells.values()].filter(c => !c.mega && !c.sections.length && !c.lift).slice(0, 3).map(c => [c.i, c.j])")
        for i, j in emp:
            add({'i': i, 'j': j, 'kind': 'platform', 'over': {'green': 'none', 'park': False}})
            add({'i': i, 'j': j, 'kind': 'lawn', 'over': {'green': 'grass', 'park': False}})
            add({'i': i, 'j': j, 'kind': 'park', 'over': {'green': 'grass', 'park': True}})
    return lst


def table(rows, by, title):
    groups = {}
    for r in rows:
        if 'err' in r: continue
        k = by(r)
        if k: groups.setdefault(k, []).append(r)
    if not groups: return groups
    print('-- by %s' % title)
    print('%-22s %4s %5s %5s %6s %7s %6s %6s %6s %5s %5s %6s | %7s %7s %7s' % (title[:22], 'n', 'boxes', 'bxMax', 'shell', 'real', 'kept', 'kept%', 'keptMd', 'cover', 'phant', 'snapOut', 'real+x', 'stand+x', 'baked+x'))
    for k in sorted(groups):
        l = groups[k]; n = len(l)
        m = lambda f: sum(f(r) for r in l)/n
        share = sum(r['kept'] for r in l)/max(1, sum(r['tris'] for r in l))
        sh = sorted(r['keptShare'] for r in l)
        x = lambda r: r['extras']['map'] + r['extras']['other']
        print('%-22s %4d %5.1f %5d %6.0f %7.0f %6.0f %5.1f%% %5.1f%% %4.0f%% %4.0f%% %6.2f | %7.0f %7.0f %7.0f' % (k[:22], n, m(lambda r: len(r['boxes'])), max(len(r['boxes']) for r in l), m(lambda r: r['shellTris']), m(lambda r: r['tris']), m(lambda r: r['kept']),
              share*100, sh[len(sh)//2]*100, m(lambda r: r['coverage'])*100, m(lambda r: r['phantom'])*100, max(r['snapOutMax'] for r in l),
              m(lambda r: r['tris'] + x(r)), m(lambda r: r['stand'] + x(r)), m(lambda r: r['shellTris'] + r['kept'] + x(r))))
    return groups


def summary(rows):
    l = [r for r in rows if 'err' not in r]
    if not l: return
    ph = sorted(r['phantom'] for r in l); wb = max(r['phantomWorstBox'] for r in l)
    print('phantom (share of box voxels that are open air: reached from outside without sealing and 0.4 or more from any surface): mean %.1f%%, median %.1f%%, worst plot %.1f%%, worst single box %.0f%%' % (sum(ph)/len(ph)*100, ph[len(ph)//2]*100, ph[-1]*100, wb*100))
    sg = sorted(r['snapGrowth'] for r in l); print('snapping: volume change mean %+.1f%%, worst %+.1f%%; farthest a face moved outward %.2f' % (sum(sg)/len(sg)*100, sg[-1]*100, max(r['snapOutMax'] for r in l)))
    worst = max(l, key=lambda r: r['phantom']); print('worst phantom plot: %s %s,%s %s (%.1f%%)' % (worst['kind'], worst.get('i'), worst.get('j'), worst.get('builders'), worst['phantom']*100))
    print('(per plot means; real = visible triangles, kept = outside the shell by more than keepDist, stand = stand-in tier, x = textured/glow geometry outside the atlas (stays as it is), baked = shell + kept + x)')


def write_dump(n, d, metas, meta):
    p, i, vis = d['p'], d['i'], d['vis']
    name = 'p%04d.bin' % n
    with open(os.path.join(DUMP, name), 'wb') as f:
        f.write(struct.pack('<III', len(p), len(i), len(vis)))
        for a, b in vis: f.write(struct.pack('<II', int(a), int(b)))
        f.write(struct.pack('<%df' % len(p), *p)); f.write(struct.pack('<%dI' % len(i), *i))
    meta['file'] = name; metas.append(meta)


def dump_plots(pg, lst, seed):
    os.makedirs(DUMP, exist_ok=True)
    for f in os.listdir(DUMP): os.remove(os.path.join(DUMP, f))
    metas = []
    for n, it in enumerate(lst):
        d = pg.evaluate('([it, seed]) => { const c = cells.get(ckey(it.i, it.j)); if (it.air) window.AIR_FORCE = it.i + "," + it.j; const r = __sp.dump(c, seed + it.i*7 + it.j*13, it.over); window.AIR_FORCE = undefined; return r; }', [it, seed])
        write_dump(n, d, metas, {'kind': it.get('kind', 'air' if it.get('air') else '?'), 'i': it['i'], 'j': it['j']})
    for n, mid in enumerate(pg.evaluate('() => [...megas.values()].filter(m => m.data && m.data.geo).map(m => [m.id, m.kind])')):
        d = pg.evaluate('id => __sp.dumpMega(id)', mid[0])
        write_dump(1000 + n, d, metas, {'kind': 'mega:' + mid[1], 'i': 0, 'j': 0, 'cells': d['w']*d['h']})
    return metas


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('scenes', nargs='+')
    ap.add_argument('--per-kind', type=int, default=6)
    ap.add_argument('--per-builder', type=int, default=3)
    ap.add_argument('--scan', type=int, default=250, help='plots made once to learn their builders (evenly spread over the scene)')
    ap.add_argument('--pods', type=int, default=6, help='hang this many pods first')
    ap.add_argument('--air', type=int, default=2, help='force this many tall commercial plots to try the air-filter hologram (only those that throw it count)')
    ap.add_argument('--no-greens', action='store_true')
    ap.add_argument('--no-megas', action='store_true')
    ap.add_argument('--mega-boxes', type=float, default=0, help='megastructures: boxes per plot of footprint (at least maxBoxes); 0: the same maxBoxes as a plot')
    ap.add_argument('--opts', default='{}', help='Shell.build options as JSON, e.g. {"keepDist":0.45,"open":1,"vs":0.25}')
    ap.add_argument('--seed', type=int, default=1234)
    ap.add_argument('--node', action='store_true', help='dump the geometry and time the voxelizing in node')
    ap.add_argument('--json', help='write every row (with boxes) to this file')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    opts = json.loads(a.opts)
    srv = H.serve(); url = H.make_site('shellprobe', None)
    allrows = []
    with sync_playwright() as pw:
        for name in a.scenes:
            t0 = time.time()
            br, pg, errs = open_scene(pw, url, name)
            print('== scene %s: %d plots, options %s' % (name, pg.evaluate('() => cells.size'), opts or 'default'), flush=True)
            lst = plan(pg, a.per_kind, a.per_builder, a.pods, a.air, not a.no_greens, a.seed, a.scan)
            rows = pg.evaluate('([l, o, s]) => __sp.run(l, o, s)', [lst, opts, a.seed])
            if not a.no_megas:
                rows += pg.evaluate('([o, k]) => __sp.runMegas(o, k)', [opts, a.mega_boxes])
            for r in rows: r['scene'] = name
            table(rows, lambda r: r['kind'], 'plot kind')
            table(rows, lambda r: bkey(r['builders'][0]) if r.get('builders') and not r['kind'].startswith('mega') and r.get('secs', 1) == 1 else None, 'builder (1 section)')
            table(rows, lambda r: r['kind'] if r['kind'].startswith('mega') else None, 'megastructure')
            summary(rows)
            if a.node:
                metas = dump_plots(pg, lst, a.seed)
                json.dump(metas, open(os.path.join(DUMP, 'index.json'), 'w'))
                subprocess.run(['node', os.path.join(H.HERE, 'shell_probe_node.js'), DUMP, json.dumps(opts), str(a.mega_boxes)])
            allrows += rows
            print('page errors:', errs[:3], '| %.0f s' % (time.time() - t0), flush=True)
            br.close()
    if a.json: json.dump(allrows, open(a.json, 'w'))
    srv.shutdown()
