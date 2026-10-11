#!/usr/bin/env python3
"""Count the plants of a scene: instances and triangles per kind, per family, per super-region, how many are in the camera's view,
what share of the frame's triangles they are (static cache off), and how many the vertex shader thins away, at each zoom.
COUNTS ONLY: the harness runs a software renderer, so nothing here is timed (the owner's script, owner_foliage.js, times on a real card).

  PERF_PORT=8934 python3 tools/procfol/measure_foliage.py maxcity --zooms 8 15 30 --tag before --ref 2709cbf
  (--ref: a commit to measure, default the working tree; --tag: the output is tools/procfol/measure/<scene>.<tag>.json)
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H

LODS = [0.25, 0.5, 0.75, 1.0]


def settle(pg, limit_s=600):
    """Step frames (not drawn) and wait for the worker, until nothing is loading, merging or building."""
    t0 = time.time(); prev = None; stable = 0
    while time.time() - t0 < limit_s:
        pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }')
        pg.wait_for_timeout(150)
        s = pg.evaluate('() => __fol.settled()')
        done = (not s['loading']) and s['cool'] == 0 and s['superDirty'] == 0 and s['dirtyRegions'] == 0 and s['inflight'] == 0
        stable = stable + 1 if (done and prev == s['instances']) else 0
        prev = s['instances']
        if stable >= 3:
            return s, time.time() - t0
    raise RuntimeError('scene did not settle: %s' % s)


def summarize(scan, share, view):
    fams = {}
    for k, v in scan['kinds'].items():
        f = fams.setdefault(v['family'], {'instances': 0, 'triangles': 0, 'inView': 0, 'thinNow': 0, 'thinAt': [0] * len(LODS), 'kinds': 0})
        f['instances'] += v['instances']; f['inView'] += v['inView']; f['thinNow'] += v['thinNow']; f['kinds'] += 1
        for i, t in enumerate(v['thinAt']): f['thinAt'][i] += t
    for f in fams.values(): f['triangles'] = f['instances'] * 2
    return fams


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene', nargs='?'); ap.add_argument('--markdown', metavar='JSON', help='print the tables of a saved result as Markdown and exit')
    ap.add_argument('--zooms', nargs='*', type=float, default=[8, 15, 30])
    ap.add_argument('--tag', default='now'); ap.add_argument('--ref', default=os.environ.get('REF') or None)
    ap.add_argument('--draw', action='store_true', help='really rasterize the frames (software renderer: minutes a frame on the max city); the default turns the draw calls into no-ops, since only counts are wanted')
    ap.add_argument('--lawns', action='store_true', help='first lay every empty plot to lawn (green = "grass", the plot menu lawn setting), to measure what a lawn plot costs: the stock scenes have none')
    ap.add_argument('--no-share', action='store_true', help='skip the frame-share frames (each is a whole frame in the software renderer)')
    a = ap.parse_args()
    if a.markdown:
        return markdown(json.load(open(a.markdown)))
    if not a.scene: ap.error('a scene name is needed')
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('procfol_' + a.scene, a.ref); sc = H.load_scenes([a.scene])[0]
    out = {'scene': a.scene, 'ref': a.ref or 'working tree', 'tag': a.tag, 'viewport': H.VIEWPORTS[0], 'zooms': {}}
    with sync_playwright() as pw:
        br = H.launch(pw)
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_CPU = true;')
        pg.add_script_tag(path=os.path.join(HERE, 'measure_foliage.js'))
        if not a.draw: print('draw calls patched out:', pg.evaluate('() => __fol.noDraw()'))
        if a.lawns:
            n = pg.evaluate("() => { const e = [...cells.values()].filter(c => !c.mega && !c.sections.length); for (const c of e) c.green = 'grass'; refresh(e, []); return e.length; }")
            print('lawns: %d empty plots laid to lawn' % n, flush=True); out['lawnPlots'] = n
        st, secs = settle(pg); out['settled'] = st; out['settleSeconds'] = round(secs)
        print('%s settled after %.0fs: %d plant instances' % (a.scene, secs, st['instances']), flush=True)
        first = True
        for z in a.zooms:
            t0 = time.time()
            view = pg.evaluate('z => __fol.view(z)', z)
            scan = pg.evaluate('l => __fol.scan({ frustum: true, lod: l })', LODS)
            share = None if a.no_share else pg.evaluate('() => __fol.share()')
            if first:
                out['plots'] = scan['plots']; out['grassPlots'] = scan['grassPlots']; out['unknownRects'] = scan['unknownRects']; out['dupRects'] = scan['dupRects']; first = False
            for k in ('plots', 'grassPlots', 'unknownRects', 'dupRects'): scan.pop(k, None)
            scan['families'] = summarize(scan, share, view)
            if share:
                share['foliageShare'] = share['foliageTrisDrawn']/share['frameTris'] if share['frameTris'] else None
            out['zooms'][str(int(z) if z == int(z) else z)] = {'view': view, 'scan': scan, 'frame': share}
            print('  zoom %g: %d instances, %d in view, %.1fs' % (z, scan['total'], sum(f['inView'] for f in scan['families'].values()), time.time() - t0), flush=True)
        out['errors'] = errs[:5]
        br.close()
    srv.shutdown()
    os.makedirs(os.path.join(HERE, 'measure'), exist_ok=True)
    p = os.path.join(HERE, 'measure', '%s.%s.json' % (a.scene, a.tag))
    json.dump(out, open(p, 'w'), indent=1, sort_keys=True)
    print('wrote', p, 'page errors:', errs[:3])
    report(out)


def markdown(out):
    zs = sorted(out['zooms'], key=float)
    fams = ['grass', 'ground cover', 'ferns and bushes', 'hanging greenery', 'laundry', 'signs (not foliage)', 'other']
    print('#### %s (%s), settled with %d plant instances\n' % (out['scene'] + (' with every empty plot laid to lawn' if out.get('lawnPlots') else ''), out['tag'], out['settled']['instances']))
    print('Per family, all zoom levels (instances; a quad is 2 triangles; "in view" counts an instance whose quad touches the camera frustum):\n')
    print('| zoom | family | instances | triangles | in view | in view % | thinned by LOD | kinds |\n|---|---|---:|---:|---:|---:|---:|---:|')
    for z in zs:
        F = out['zooms'][z]['scan']['families']
        for f in fams:
            if f in F:
                x = F[f]; print('| %s | %s | %d | %d | %d | %.0f%% | %d | %d |' % (z, f, x['instances'], x['triangles'], x['inView'], 100*x['inView']/x['instances'], x['thinNow'], x['kinds']))
        tot = out['zooms'][z]['scan']['total']; iv = sum(x['inView'] for x in F.values()); th = sum(x['thinNow'] for x in F.values())
        fol = tot - F.get('signs (not foliage)', {'instances': 0})['instances']
        print('| %s | **all** | %d | %d | %d | %.0f%% | %d | |' % (z, tot, tot*2, iv, 100*iv/tot, th))
        print('| %s | **foliage only (no signs)** | %d | %d | | | | |' % (z, fol, fol*2))
    print('\nPer zoom: render size, LOD.plants value (what the vertex shader thins by), and the frame:\n')
    print('| zoom | render | LOD.plants | frame triangles | without foliage layer | foliage drawn (triangles) | share of frame | in view and not thinned (instances) |\n|---|---|---:|---:|---:|---:|---:|---:|')
    for z in zs:
        d = out['zooms'][z]; v = d['view']; f = d['frame']; sc = d['scan']
        live = sum(k['inView'] - k['thinNowInView'] for k in sc['kinds'].values())
        print('| %s | %dx%d | %.3f | %d | %d | %d | %.1f%% | %d |' % (z, v['renderW'], v['renderH'], v['lodPlants'], f['frameTris'], f['frameTrisNoFoliage'], f['foliageTrisDrawn'], 100*f['foliageShare'], live))
    z = zs[-1]; sc = out['zooms'][z]['scan']
    print('\nThinning (lodPlants) for other LOD values, at any zoom (instances thrown away of %d; signs are never thinned):\n' % sc['total'])
    print('| LOD.plants | ' + ' | '.join(str(x) for x in sc['lodAt']) + ' |\n|---|' + '---:|'*len(sc['lodAt']))
    print('| thinned | ' + ' | '.join('%d (%.0f%%)' % (sum(k['thinAt'][i] for k in sc['kinds'].values()), 100*sum(k['thinAt'][i] for k in sc['kinds'].values())/sc['total']) for i in range(len(sc['lodAt']))) + ' |')
    print('\nPer kind at zoom %s (instances, in view, thinned at this zoom\'s LOD):\n' % z)
    print('| kind | family | instances | triangles | in view | thinned |\n|---|---|---:|---:|---:|---:|')
    for k, v in sorted(sc['kinds'].items(), key=lambda kv: -kv[1]['instances']):
        print('| %s | %s | %d | %d | %d | %d |' % (k, v['family'], v['instances'], v['instances']*2, v['inView'], v['thinNow']))
    print('\nPer super-region (r = plots, c = bridges and walkways) at each zoom, instances in view; largest 8 of %d:\n' % len(sc['regions']))
    print('| region | instances | triangles | ' + ' | '.join('in view @%s' % q for q in zs) + ' |\n|---|---:|---:|' + '---:|'*len(zs))
    for k, v in sorted(sc['regions'].items(), key=lambda kv: -kv[1]['instances'])[:8]:
        print('| %s | %d | %d | %s |' % (k, v['instances'], v['instances']*2, ' | '.join(str(out['zooms'][q]['scan']['regions'][k]['inView']) for q in zs)))
    R = sorted(v['instances'] for v in sc['regions'].values()); import statistics
    print('\nSuper-regions: %d, instances min %d, median %d, max %d.' % (len(R), R[0], statistics.median(R), R[-1]))
    gp = out.get('grassPlots') or []
    if gp:
        T = [g['tufts'] for g in gp]; I = [g['instances'] for g in gp]
        print('\nGrass plots: %d, tufts (distinct points) per plot min %d, mean %.1f, max %d; instances per plot mean %.1f (two crossed quads a tuft); gt kinds used per plot: %s.' % (len(gp), min(T), statistics.mean(T), max(T), statistics.mean(I), sorted(set(g['kinds'] for g in gp))))
    pl = out['plots']; fam_per = {}
    for pk, kinds in pl.items():
        for k, n in kinds.items():
            fam_per.setdefault(k, []).append(n)
    print('\nPer plot (a plot is a LOT x LOT cell, %d with any plant instance): instances of each kind among the plots that have it:\n' % len(pl))
    print('| kind | plots with it | min | median | max |\n|---|---:|---:|---:|---:|')
    for k, v in sorted(fam_per.items(), key=lambda kv: -sum(kv[1]))[:14]:
        print('| %s | %d | %d | %d | %d |' % (k, len(v), min(v), statistics.median(v), max(v)))


def report(out):
    for z, d in out['zooms'].items():
        sc, fr, v = d['scan'], d['frame'], d['view']
        print('\n== %s zoom %s  (render %dx%d, LOD.plants %.3f, thinning drops %d of %d at this LOD)' % (out['scene'], z, v['renderW'], v['renderH'], v['lodPlants'], sum(k['thinNow'] for k in sc['kinds'].values()), sc['total']))
        print('  %-22s %10s %10s %10s %10s %10s' % ('family', 'instances', 'triangles', 'in view', 'thinned', 'kinds'))
        for f, x in sorted(sc['families'].items(), key=lambda kv: -kv[1]['instances']):
            print('  %-22s %10d %10d %10d %10d %10d' % (f, x['instances'], x['triangles'], x['inView'], x['thinNow'], x['kinds']))
        if fr:
            print('  frame: %d triangles (mean of 3), %d with the foliage layer hidden (mean of 2); foliage drawn %d = %.1f%% of the frame (by difference: %d)' % (fr['frameTris'], fr['frameTrisNoFoliage'], fr['foliageTrisDrawn'], 100*(fr['foliageShare'] or 0), fr['foliageTrisByDifference']))


if __name__ == '__main__':
    sys.exit(main())
