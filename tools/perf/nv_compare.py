#!/usr/bin/env python3
"""Round 9, item 6: the never-seen job several ways on plots of each zone with a reduced set of views (the software renderer takes some 0.3 s a view; --yaws and --np say how many; the production set is
96 turns by 14 tilts): 'old' (round 8: whole boxes, every view, one scatter a view; test nvOld), 'view' (round 9 part 1: boxes shrunk to what can hold an undecided triangle, early stop; test nvPerView),
'new' (the shipped way: the box shrunk to blocks that can hold an undecided triangle, decided ids left out of the scatter) and 'multi' (several views in the tiles of one target, one scatter: not exact, test nvTiles). The removed sets must be the same,
triangle for triangle; the counts of pixels made, draws and scatters are reported for each. The old way's removed sets are kept in a file (--keep) so a later run does not make them again.
   python3 tools/perf/nv_compare.py dense [--per 5] [--yaws 12] [--np 4] [--shard 0/4] [--modes old,view,tiles] [--keep FILE] [--batch 8]"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
RUN = r"""
async ([per, yaws, np, shard, nshard, modes, skip, batch, mask, zones]) => {
  NV.mask = mask;
  const byZone = {}; for (const c of cells.values()){ if (!c.data || c.mega || c.lift || !c.sections.length || !c.data.geo.get(ATLAS)) continue; const z = c.sections[0].zone; (byZone[z] = byZone[z] || []).push(c); }
  const picks = []; for (const z of zones){ const L = (byZone[z] || []).sort((a, b) => a.sections[0].seed - b.sections[0].seed); for (let q = 0; q < per && L.length; q++) picks.push(L[Math.floor((q + .5)*L.length/per)]); }
  const cfg = { yaws, np, batch }, out = [];
  for (const [n, c] of picks.entries()){
    if (n % nshard !== shard) continue;
    const g = c.data.geo.get(ATLAS); if (c.data.pm && c.data.pm.out) pmRestoreSync(c.data.pm, 'nv');
    const row = { ij: [c.i, c.j], zone: c.sections[0].zone, res: {} };
    for (const m of modes){
      if (skip && skip[c.i + ',' + c.j] && m === 'old') continue;
      window.__NV_OLD = m === 'old'; window.__NV_PER_VIEW = m === 'view'; window.__NV_TILES = m === 'multi';
      const R = NV.runJob(c, cfg);
      row.T = R.T; row.views = R.views; row.res[m] = { never: Array.from(R.never).join(''), px: R.px, pxFull: R.pxFull, pxDraw: R.pxDraw, draws: R.draws, scatters: R.scatters, early: R.early, viewsDone: R.viewsDone };
    }
    window.__NV_OLD = false; window.__NV_PER_VIEW = false; window.__NV_TILES = false;
    out.push(row);
  }
  return out;
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--per', type=int, default=5); ap.add_argument('--yaws', type=int, default=12); ap.add_argument('--np', type=int, default=4)
    ap.add_argument('--shard', default='0/1'); ap.add_argument('--modes', default='old,view,new'); ap.add_argument('--keep', default=''); ap.add_argument('--batch', type=int, default=8); ap.add_argument('--nomask', action='store_true'); ap.add_argument('--zones', default='low,mid,high,ind')
    a = ap.parse_args(); shard, nshard = [int(x) for x in a.shard.split('/')]; modes = a.modes.split(',')
    keep = {}
    if a.keep and os.path.exists(a.keep): keep = json.load(open(a.keep))
    ck = '%s:%d:%d' % (a.scene, a.yaws, a.np)
    skip = {k: True for k in keep.get(ck, {})} if 'old' in modes else {}
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('nvc%d' % shard, None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_GEO = true; window.__NV_OFF = true;')
        # (no __perf.skip here: it turns every renderer.render into nothing, and the id pictures would be empty, every triangle 'never seen'; no frames run, only the jobs)
        rows = pg.evaluate(RUN, [a.per, a.yaws, a.np, shard, nshard, modes, skip, a.batch, not a.nomask, a.zones.split(',')]); br.close()
    srv.shutdown()
    bad = 0; tot = {m: [0, 0, 0, 0, 0] for m in modes}
    for r in rows:
        k = '%d,%d' % tuple(r['ij'])
        if 'old' in r['res']: keep.setdefault(ck, {})[k] = r['res']['old']['never']
        ref = r['res'].get('old', {}).get('never') or keep.get(ck, {}).get(k)
        line = '%-4s %-8s T %5d views %3d' % (r['zone'], r['ij'], r['T'], r['views'])
        for m in modes:
            x = r['res'][m]; d = sum(1 for p, q in zip(ref, x['never']) if p != q) if ref else -1; bad += max(d, 0)
            for i, key in enumerate(['px', 'pxDraw', 'draws', 'scatters', 'early']): tot[m][i] += x[key]
            line += '  | %s removed %d differ %d scatter-px %d draw-px %d draws %d scatters %d' % (m, x['never'].count('1'), d, x['px'], x['pxDraw'], x['draws'], x['scatters'])
        print(line)
    if a.keep: json.dump(keep, open(a.keep, 'w'))
    print('shard %d/%d: %d plots, %d views each; triangles that differ from the old way: %d' % (shard, nshard, len(rows), rows[0]['views'] if rows else 0, bad))
    for m in modes: print('  %-5s scatter pixels %d, drawn pixels %d, draws %d, scatters %d, early stops %d' % ((m,) + tuple(tot[m])))
    print('page errors', errs[:3])
    sys.exit(1 if bad else 0)
