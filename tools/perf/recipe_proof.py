#!/usr/bin/env python3
"""Round 9, item 1: every plot of a scene made twice, live and from its recipe alone, from the same place in the seeded random stream; everything that
comes out must be byte for byte the same (geometry attributes and indices, cut and far orders, plants, glows, emitters, pads, ports, spots, every field
generation wrote on the plot, and the count of Math.random calls). A difference is reported by part. Also lists which top-level globals changed while
generating (a cheap fingerprint), so every global write is known.
   python3 tools/perf/recipe_proof.py city [--max 400] [--seed 1234]      (--max: at most this many plots, evenly spread)"""
import argparse, glob, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

def top_names():
    names = set()
    for f in glob.glob(os.path.join(H.HERE, '..', '..', 'js', '*.js')):
        for m in re.finditer(r'^(?:const|let|var)\s+([A-Za-z_$][\w$]*)', open(f).read(), re.M): names.add(m.group(1))
    return sorted(names)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--max', type=int, default=400); ap.add_argument('--seed', type=int, default=1234)
    ap.add_argument('--control', action='store_true', help='negative control: flip one neighbor bit and one dark flag in the recipes; every plot with an edge there must then differ')
    ap.add_argument('--pods', type=int, default=0, help='hang this many pods (empty plots and over shorter buildings, beside taller ones) first and check those plots only')
    ap.add_argument('--reads', action='store_true', help='which globals do plots read: change each in turn, make a sample of plots (spread, plus those under highways or the metro) and see which change')
    ap.add_argument('--regen', action='store_true', help='each plot as it stands against the same plot made again from the recipe and random draws kept with it')
    ap.add_argument('--worker', action='store_true', help='make each plot in the real worker (not on the page) and compare that')
    ap.add_argument('--globals', type=int, default=25, help='plots to fingerprint the globals over (0: skip)')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('proof', None); sc = H.load_scenes([a.scene])[0]
    t0 = time.time(); bad = 0; errs_n = 0
    with sync_playwright() as pw:
        br = H.launch(pw)
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true; window.__GEN_WORKER = true;')
        pg.add_script_tag(path=os.path.join(H.HERE, 'recipe_proof.js'))
        if a.control: pg.evaluate('() => { const o = recipeOf; recipeOf = c => { const r = o(c); r.nb[0] ^= 1; return r; }; }')
        podset = None
        if a.pods:
            podset = pg.evaluate("""n => { const out = []; const tall = [...cells.values()].filter(c => !c.mega && c.sections.length && c.height > CURB + FH*3);
              for (const t of tall){ if (out.length >= n) break; for (const [a, b] of SIDES4){ const c = cells.get(ckey(t.i + a, t.j + b)); if (!c || c.mega || c.lift || hwAt(c.i, c.j).length || mtAt(c.i, c.j).length) continue;
                if (c.sections.length && t.height < c.height + FH*2) continue; const y = Math.min(t.height - 1.2, c.sections.length ? c.height + FH*2 : CURB + FH*2); if (addLift(c, y, 'mid')){ out.push([c.i, c.j]); break; } } }
              stageFinishAll(); return out; }""", a.pods)
            print('pods hung:', len(podset))
        n = pg.evaluate('() => cells.size')
        keys = pg.evaluate('() => [...cells.values()].map(c => [c.i, c.j])')
        step = max(1, len(keys) // a.max); pick = keys[::step][:a.max]
        if podset is not None: pick = podset
        print('scene %s: %d plots, checking %d' % (a.scene, n, len(pick)), flush=True)
        if a.globals:
            r = pg.evaluate("""([names, picks, seed]) => { const A = __proof.fp(names);
                for (const [i, j] of picks){ const c = cells.get(ckey(i, j)); const keep = {}; for (const k of Object.keys(c)) keep[k] = c[k]; __randSeed(seed); DARK = isDarkPlot(c); SIDE_SPLIT = true;
                  try { drain(collectGen(cellBody(c))); } finally { DARK = false; SIDE_SPLIT = false; } for (const k of Object.keys(c)) if (!(k in keep)) delete c[k]; Object.assign(c, keep); }
                const B = __proof.fp(names); const out = []; for (const k in A) if (A[k] !== B[k]) out.push(k + ': ' + A[k] + ' -> ' + B[k]); return out; }""", [top_names(), pick[:a.globals], a.seed])
            print('globals changed by generating %d plots (fingerprint):' % min(a.globals, len(pick)))
            for x in r: print('   ', x)
        if a.reads:
            r = pg.evaluate("""([picks, seed]) => {
              const all = [...cells.values()]; const hot = all.filter(c => hwAt(c.i, c.j).length || mtAt(c.i, c.j).length).slice(0, 25);
              const sample = picks.map(([i, j]) => cells.get(ckey(i, j))); for (const c of hot) if (!sample.includes(c)) sample.push(c);
              const hs = () => sample.map((c, n) => __proof.live(c, seed + n));
              const base = hs(), out = {}, was = {};
              const test = (name, change, undo) => { const before = JSON.stringify(base.length); change(); let h; try { h = hs(); } catch (e) { out[name] = 'THROWS ' + e.message; undo(); return; } undo(); const n = h.filter((x, q) => x !== base[q]).length; out[name] = n; };
              for (const k of Object.keys(S)){ const v = S[k]; if (typeof v === 'number') test('S.' + k, () => { S[k] = v + 1; }, () => { S[k] = v; }); else if (typeof v === 'boolean') test('S.' + k, () => { S[k] = !v; }, () => { S[k] = v; }); }
              for (const k of Object.keys(PH.tests || {})){ const v = PH.tests[k]; test('PH.tests.' + k, () => { PH.tests[k] = !v; }, () => { PH.tests[k] = v; }); }
              { const v = GREEN_DEFAULT; test('GREEN_DEFAULT', () => { GREEN_DEFAULT = 'none'; }, () => { GREEN_DEFAULT = v; }); }
              { const hi = hwIndex, mi = mtIndex; test('hwIndex empty', () => { hwIndex = new Map(); }, () => { hwIndex = hi; }); test('mtIndex empty', () => { mtIndex = new Map(); }, () => { mtIndex = mi; });
                const hl = highways, ml = metros; test('highways empty (list)', () => { highways = []; }, () => { highways = hl; }); test('metros empty (list)', () => { metros = []; }, () => { metros = ml; }); }
              { const keep = [...megas]; test('megas empty', () => { megas.clear(); }, () => { megas.clear(); for (const [k, v] of keep) megas.set(k, v); }); }
              { const keep = [...airCells]; test('airCells all in', () => { for (const c of cells.values()) airCells.add(c); }, () => { airCells.clear(); for (const c of keep) airCells.add(c); }); }
              for (const k of ['WALL_FORCE', 'AIR_FORCE', 'AIR_PAIR']){ const v = window[k]; test('window.' + k, () => { window[k] = v === undefined ? '0,0' : undefined; }, () => { window[k] = v; }); }
              out._sample = sample.length; out._underLines = hot.length; return out; }""", [pick[:60], a.seed])
            print('plots that change when a global is changed (of the sample):')
            for k, v in r.items(): print('   %-28s %s' % (k, v))
        if a.regen:
            res = pg.evaluate("""([picks]) => { const out = [], world = recipeWorld(); for (const [i, j] of picks){ const c = cells.get(ckey(i, j)); const r = __proof.regen(c, world); r.ij = [i, j]; r.kind = c.mega ? 'mega' : c.sections.length ? 'stack' + (c.lift ? '+lift' : '') + (c.below && c.below.length ? '+below' : '') : 'empty'; if (r.err || r.d.length) out.push(r); else out.push({ ij: r.ij, kind: r.kind, ok: 1 }); } return out; }""", [pick])
        elif a.worker:
            pg.wait_for_function('() => RW.state === "ready" || RW.state === "failed"', timeout=900000)
            print(pg.evaluate('() => RW.line()'))
            res = pg.evaluate("""async ([picks, seed]) => { const out = []; for (const [i, j] of picks){ const c = cells.get(ckey(i, j)); const r = await __proof.oneW(c, seed + i*7 + j*13); r.ij = [i, j]; r.kind = c.mega ? 'mega' : c.sections.length ? 'stack' + (c.lift ? '+lift' : '') + (c.below && c.below.length ? '+below' : '') : 'empty'; if (r.err || r.d.length) out.push(r); else out.push({ ij: r.ij, kind: r.kind, ok: 1, rand: r.rand }); } return out; }""", [pick, a.seed])
            print(pg.evaluate('() => RW.line()'))
        else:
          res = pg.evaluate("""([picks, seed]) => { const out = [], world = recipeWorld(); for (const [i, j] of picks){ const c = cells.get(ckey(i, j)); const r = __proof.one(c, seed + i*7 + j*13, world); r.ij = [i, j]; r.kind = c.mega ? 'mega' : c.sections.length ? 'stack' + (c.lift ? '+lift' : '') + (c.below && c.below.length ? '+below' : '') : 'empty'; if (r.err || r.d.length) out.push(r); else out.push({ ij: r.ij, kind: r.kind, ok: 1, rand: r.rand }); } return out; }""", [pick, a.seed])
        kinds = {}
        for r in res:
            k = kinds.setdefault(r['kind'], [0, 0]); k[0] += 1
            if 'ok' not in r:
                k[1] += 1; bad += 1
                if bad <= 12: print('DIFF', r['ij'], r['kind'], r.get('err') or r.get('d')[:6])
        print('kinds (checked, different):', kinds)
        print('random calls per plot: min %d max %d' % (min(r.get('rand', 0) for r in res if 'rand' in r), max(r.get('rand', 0) for r in res if 'rand' in r)) if any('rand' in r for r in res) else '')
        print('page errors', errs[:3], '| %d of %d plots differ | %.0f s' % (bad, len(res), time.time() - t0))
        br.close()
    srv.shutdown(); sys.exit(1 if bad else 0)
