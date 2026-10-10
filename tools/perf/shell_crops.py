#!/usr/bin/env python3
"""Baked far buildings, item 2: crops of the shell against the real plot, for the eye.

For each chosen plot, a row of panels from two directions (a quarter turn apart) at 35 degrees down:
   real: the plot's geometry grey, the triangles kept as real geometry (outside the shell by more than keepDist) orange, the boxes as red wire
   shell: what would be drawn: the boxes solid plus the kept triangles in orange
   both: the real plot faint with the boxes as translucent blue (a box poking out of the mass, or mass out of the boxes, shows here)
Written to tools/perf/baked/shell/<scene>_<kind>_<i>_<j>.png with the numbers in the file name.

   python3 tools/perf/shell_crops.py city --kinds low/1,mid/2+,pod,air,park --n 2
   python3 tools/perf/shell_crops.py megas --megas
   python3 tools/perf/shell_crops.py city --plots -1,1 0,0 --opts '{"keepDist":0.45}'
"""
import argparse, base64, io, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
import shell_probe as SPB

OUT = os.path.join(H.HERE, 'baked', 'shell')
SIZE = 360


def png(url):
    from PIL import Image
    return Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB')


def montage(rec_panels, label):
    from PIL import Image, ImageDraw
    rows = len(rec_panels); cols = len(rec_panels[0])
    im = Image.new('RGB', (cols*SIZE, rows*SIZE + 18), (27, 31, 39))
    for r, row in enumerate(rec_panels):
        for c, p in enumerate(row): im.paste(p, (c*SIZE, 18 + r*SIZE))
    ImageDraw.Draw(im).text((4, 3), label, fill=(230, 230, 230))
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('scene')
    ap.add_argument('--kinds', default='', help='comma list of plot kinds (see shell_probe.py output); default: a spread')
    ap.add_argument('--n', type=int, default=2, help='plots per kind')
    ap.add_argument('--builders', default='', help='comma list of builder names (buildTenement, glassTower, ...): the plots of those builders instead of the kinds')
    ap.add_argument('--plots', nargs='*', default=[], help='i,j pairs')
    ap.add_argument('--megas', action='store_true')
    ap.add_argument('--opts', default='{}')
    ap.add_argument('--seed', type=int, default=1234)
    ap.add_argument('--pods', type=int, default=4)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    opts = json.loads(a.opts); os.makedirs(OUT, exist_ok=True)
    srv = H.serve(); url = H.make_site('shellcrops', None)
    with sync_playwright() as pw:
        br, pg, errs = SPB.open_scene(pw, url, a.scene)
        pg.add_script_tag(path=os.path.join(H.HERE, 'shell_crops.js'))
        items = []
        if a.megas:
            for k in pg.evaluate('() => [...megas.values()].map(m => m.id)'): items.append({'mega': k})
        else:
            lst = SPB.plan(pg, 40, 2, a.pods, 2, True, a.seed, 250)
            want = [k for k in a.kinds.split(',') if k]
            wantb = [k for k in a.builders.split(',') if k]
            for it in lst:
                kind = it.get('kind', 'air' if it.get('air') else '?')
                if wantb:
                    if it.get('builder') in wantb: items.append(dict(it, kind=kind))
                    continue
                if a.plots: continue
                if (not want or kind in want) and sum(1 for q in items if q['kind'] == kind) < a.n: items.append(dict(it, kind=kind))
            for s in a.plots:
                i, j = map(int, s.split(',')); items.append({'i': i, 'j': j, 'kind': 'plot'})
        views = [(math.radians(30), math.radians(35)), (math.radians(120), math.radians(35))]
        for it in items:
            if 'mega' in it:
                rec = pg.evaluate('([id, o]) => { const m = megas.get(id); window.__rec = __sc.megaRec(m, o); return { stats: window.__rec.stats, kind: m.kind }; }', [it['mega'], opts])
                it['kind'] = 'mega-' + rec['kind']; it['i'] = str(it['mega']).replace('#', ''); it['j'] = 0
            else:
                rec = pg.evaluate('([it, s, o]) => { window.__rec = __sc.rec(it, s, o); return { stats: window.__rec.stats, builders: window.__rec.builders }; }', [it, a.seed, opts])
                if rec.get('builders'): it['kind'] = it['kind'] + '-' + '-'.join(rec['builders'][:2]).replace('+', 'p')
            st = rec['stats']
            rows = []
            for mode in ('real', 'shell', 'both'):
                rows.append([png(pg.evaluate('([m, y, p]) => __sc.draw(window.__rec, m, y, p, %d)' % SIZE, [mode, y, p])) for y, p in views])
            label = '%s %s,%s  boxes %d  shell tris %d  real tris %d  kept %d (%.0f%%)  cover %.0f%%' % (it['kind'], it['i'], it['j'], st['boxCount'], st['shellTris'], st['tris'], st['kept'], st['keptShare']*100, st['coverage']*100)
            name = '%s_%s_%s_%s.png' % (a.scene, it['kind'].replace('/', '-').replace('+', 'p'), str(it['i']).replace('-', 'm'), str(it['j']).replace('-', 'm'))
            montage(rows, label).save(os.path.join(OUT, name)); print(name, label, flush=True)
        print('page errors:', errs[:3]); br.close()
    srv.shutdown()
