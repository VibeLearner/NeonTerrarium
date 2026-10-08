#!/usr/bin/env python3
"""Is the cache's picture what a whole redraw would give? Runs the cache steps and, after the named ones, reads the cache's color and normal targets,
draws the whole cache again with the lights as they are, reads that and compares them where the two cover the same pixels (in view coordinates).
   PERF_STEPS=c_settle,c_still,r_sun,r_wrap_mid python3 tools/perf/cache_compare.py city --at r_wrap_mid [r_place_mid ...]
Prints, per step, how many pixels differ, their bounding box, how many lie inside the last edit rectangle, and some of them."""
import argparse, json, os, sys
if not os.environ.get('PERF_CC_STANDARD'): os.environ['PERF_SC_STEPS'] = '1'   # (PERF_CC_STANDARD=1: the standard script's steps instead)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = r"""() => {
  const w = SC.w, h = SC.h, n = w*h*4, A = new Uint8Array(n), An = new Uint8Array(n), B = new Uint8Array(n), Bn = new Uint8Array(n);
  const px = Math.round(camPix.x), py = Math.round(camPix.y), mod = (a, m) => ((a % m) + m) % m;
  const R0 = Object.assign({}, SC.R), ox0 = SC.ox, oy0 = SC.oy, rl = SC.rectLast ? SC.rectLast.slice() : null;
  renderer.readRenderTargetPixels(SC.rtS, 0, 0, w, h, A); renderer.readRenderTargetPixels(SC.rtSN, 0, 0, w, h, An);
  const hard = SC.hard.slice(), soft = SC.soft.slice(), shk = SC.shk.slice();
  const keepLt = SC.lt, keepEd = SC.editsSeen;
  scFull(px, py, scHard([]), scSoft([]), scShadowKey([]), 'compare');
  renderer.readRenderTargetPixels(SC.rtS, 0, 0, w, h, B); renderer.readRenderTargetPixels(SC.rtSN, 0, 0, w, h, Bn);
  const R1 = SC.R, ox1 = SC.ox, oy1 = SC.oy, c0 = Math.max(R0.x0, R1.x0), c1 = Math.min(R0.x1, R1.x1), r0 = Math.max(R0.y0, R1.y0), r1 = Math.min(R0.y1, R1.y1);
  const base = scCol(px), baseR = scRow(py);
  let cnt = 0, nd = 0, bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, inRect = 0, maxd = 0; const pts = [];
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++){
    const ia = (mod(r - oy0, h)*w + mod(c - ox0, w))*4, ib = (mod(r - oy1, h)*w + mod(c - ox1, w))*4; cnt++;
    let d = 0, dn = 0; for (let k = 0; k < 4; k++){ d = Math.max(d, Math.abs(A[ia + k] - B[ib + k])); dn = Math.max(dn, Math.abs(An[ia + k] - Bn[ib + k])); }
    if (d || dn){ nd++; maxd = Math.max(maxd, d, dn); const x = c - base, y = r - baseR; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      if (rl && x >= rl[0] && x < rl[1] && y >= rl[2] && y < rl[3]) inRect++; if (pts.length < 12) pts.push([x, y, d, dn]); }
  }
  return { compared: cnt, differ: nd, maxDiff: maxd, box: nd ? [bx0, bx1, by0, by1] : null, inLastRect: inRect, lastRect: rl, sample: pts };
}"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--at', nargs='+', required=True); ap.add_argument('--size', type=int, default=0)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('cmp', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        for st in H.steps(sc):
            label, n, js = st[:3]; draw = st[3] if len(st) > 3 else 0
            if js: pg.evaluate('() => { ' + js + ' }')
            pg.evaluate('([n, d]) => __perf.cap(n, d)', [n, draw])
            if label in a.at: print(label, json.dumps(pg.evaluate(JS)), flush=True)
        print(errs[:2]); br.close()
    srv.shutdown()
