#!/usr/bin/env python3
"""Baked far buildings, item 2: the shell builder (js/shell.js) run on plots of every kind, made through the game itself.

For each scene it makes plots from their recipes (recipeGen, as the plot worker does; megastructures through their own data), runs Shell.build on the
visible atlas triangles and prints per plot kind: plots, boxes, shell triangles (2 per visible face rectangle, bottoms and shared faces left out), real
triangles (visible, the starting point), kept triangles (outside the shell by more than keepDist: stay real) and the kept share, and the mass coverage.
Counts only: no rendering is timed. The voxel time is measured in node on the dumped geometry (--node).

   python3 tools/perf/shell_probe.py city dense --per-kind 8
   python3 tools/perf/shell_probe.py megas --opts '{"keepDist":0.45}'
   python3 tools/perf/shell_probe.py city --node          (also dumps the plots' geometry and runs tools/perf/shell_probe_node.js on it for the voxel time)
   python3 tools/perf/shell_probe.py city --json out.json
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


def plan(pg, per_kind, pods, air_n, greens):
    """The plots to examine: every kind the scene has, plus pods hung on a few plots, tall commercial plots forced to throw the air hologram, empty plots as
    platform (no greenery), lawn and park."""
    lst = pg.evaluate('([n]) => __sp.pick(n)', [per_kind])
    if pods:
        hung = pg.evaluate('n => __sp.hangPods(n)', pods)
        for i, j in hung: lst.append({'i': i, 'j': j, 'kind': 'pod'})
    if air_n:
        tall = pg.evaluate("""n => [...cells.values()].filter(c => !c.mega && !c.lift && c.sections.length && c.sections[0].zone === 'mid').sort((a, b) => b.height - a.height).slice(0, n * 3).map(c => [c.i, c.j])""", air_n)
        lst += [{'i': i, 'j': j, 'air': True} for i, j in tall]
    if greens:
        emp = pg.evaluate("() => [...cells.values()].filter(c => !c.mega && !c.sections.length && !c.lift).slice(0, 3).map(c => [c.i, c.j])")
        for i, j in emp:
            lst.append({'i': i, 'j': j, 'kind': 'platform', 'over': {'green': 'none', 'park': False}})
            lst.append({'i': i, 'j': j, 'kind': 'lawn', 'over': {'green': 'grass', 'park': False}})
            lst.append({'i': i, 'j': j, 'kind': 'park', 'over': {'green': 'grass', 'park': True}})
    return lst


def table(rows):
    kinds = {}
    for r in rows:
        if 'err' in r: continue
        kinds.setdefault(r['kind'], []).append(r)
    print('%-14s %5s %6s %6s %6s %8s %8s %8s %7s %7s %8s %8s' % ('kind', 'plots', 'boxes', 'bxMax', 'shell', 'real', 'kept', 'kept%', 'keptMd', 'cover', 'stand', 'extras'))
    tot = [0, 0, 0, 0]
    for k in sorted(kinds):
        l = kinds[k]; n = len(l)
        boxes = sum(len(r['boxes']) for r in l)/n
        bmax = max(len(r['boxes']) for r in l)
        shell = sum(r['shellTris'] for r in l)/n
        real = sum(r['tris'] for r in l)/n
        kept = sum(r['kept'] for r in l)/n
        share = sum(r['kept'] for r in l)/max(1, sum(r['tris'] for r in l))
        sh = sorted(r['keptShare'] for r in l); med = sh[len(sh)//2]
        cov = sum(r['coverage'] for r in l)/n
        stand = sum(r['stand'] for r in l)/n
        ex = sum(r['extras']['map'] + r['extras']['other'] for r in l)/n
        print('%-14s %5d %6.1f %6d %6.0f %8.0f %8.0f %7.1f%% %6.1f%% %6.0f%% %8.0f %8.0f' % (k, n, boxes, bmax, shell, real, kept, share*100, med*100, cov*100, stand, ex))
        tot[0] += n; tot[1] += sum(r['shellTris'] for r in l); tot[2] += sum(r['kept'] for r in l); tot[3] += sum(r['tris'] for r in l)
    print('(per plot means; real = visible triangles of the plot, stand = triangles of the stand-in tier, extras = textured/glow geometry outside the atlas, not in the shell)')
    return kinds


def dump_plots(pg, lst, seed):
    os.makedirs(DUMP, exist_ok=True)
    for f in os.listdir(DUMP): os.remove(os.path.join(DUMP, f))
    metas = []
    for n, it in enumerate(lst):
        d = pg.evaluate('([it, seed]) => { const c = cells.get(ckey(it.i, it.j)); if (it.air) window.AIR_FORCE = it.i + "," + it.j; const r = __sp.dump(c, seed + it.i*7 + it.j*13, it.over); window.AIR_FORCE = undefined; return r; }', [it, seed])
        write_dump(n, d['p'], d['i'], metas, it)
    return metas


def write_dump(n, p, i, metas, it):
    name = 'p%03d' % n
    with open(os.path.join(DUMP, name + '.bin'), 'wb') as f:
        f.write(struct.pack('<II', len(p), len(i))); f.write(struct.pack('<%df' % len(p), *p)); f.write(struct.pack('<%dI' % len(i), *i))
    metas.append({'file': name + '.bin', 'kind': it.get('kind', 'air' if it.get('air') else '?'), 'i': it.get('i'), 'j': it.get('j')})


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('scenes', nargs='+')
    ap.add_argument('--per-kind', type=int, default=6)
    ap.add_argument('--pods', type=int, default=6, help='hang this many pods first')
    ap.add_argument('--air', type=int, default=2, help='force this many tall commercial plots to try the air-filter hologram (only those that throw it count)')
    ap.add_argument('--no-greens', action='store_true')
    ap.add_argument('--no-megas', action='store_true')
    ap.add_argument('--opts', default='{}', help='Shell.build options as JSON, e.g. {"keepDist":0.45,"open":1}')
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
            print('== scene %s: %d plots' % (name, pg.evaluate('() => cells.size')), flush=True)
            lst = plan(pg, a.per_kind, a.pods, a.air, not a.no_greens)
            rows = pg.evaluate('([l, o, s]) => __sp.run(l, o, s)', [lst, opts, a.seed])
            if not a.no_megas:
                rows += pg.evaluate('o => __sp.runMegas(o)', opts)
            for r in rows: r['scene'] = name
            table(rows)
            if a.node:
                metas = dump_plots(pg, lst, a.seed)
                json.dump(metas, open(os.path.join(DUMP, 'index.json'), 'w'))
                subprocess.run(['node', os.path.join(H.HERE, 'shell_probe_node.js'), DUMP, json.dumps(opts)])
            allrows += rows
            print('page errors:', errs[:3], '| %.0f s' % (time.time() - t0), flush=True)
            br.close()
    if a.json: json.dump(allrows, open(a.json, 'w'))
    srv.shutdown()
