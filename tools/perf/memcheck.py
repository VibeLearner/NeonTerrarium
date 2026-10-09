#!/usr/bin/env python3
"""Memory: JS heap (after a forced collection) and a count of the bytes the page asked the graphics API to hold, right after load and
through simulated play (pans, turns, zooms, edits, the day going round).
   python3 tools/perf/memcheck.py maxcity --ref a7b4449 [--rounds 30] [--zoom 30]   (--ref: a git ref; default the working tree)
Graphics bytes are counted from the calls (texStorage2D/texImage2D/renderbufferStorage/bufferData minus what was deleted), not read from the
card: an estimate of what the page allocates, without mip chains, driver padding or compression."""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

GL = r"""
(() => {
  const P = WebGL2RenderingContext.prototype, st = { tex: 0, buf: 0, rb: 0, bound: {}, sz: new WeakMap() };
  window.__GLMEM = st;
  const BPP = { 0x8058: 4, 0x881A: 8, 0x8814: 16, 0x81A6: 3, 0x81A7: 4, 0x81A5: 2, 0x8CAC: 4, 0x88F0: 4, 0x8051: 3, 0x8D48: 1, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4, 0x8235: 4, 0x8C43: 4, 0x8C41: 3, 0x8059: 4, 0x8056: 2, 0x8D62: 2, 0x8C3A: 4, 0x8DAD: 8, 0x8226: 1, 0x822E: 4, 0x8230: 8, 0x8815: 12, 0x881B: 6, 0x8D7C: 4 };
  const TYP = { 0x1401: 4, 0x140B: 8, 0x1406: 16, 0x8D61: 8 };
  const bpp = (f, t) => f === 0x1908 || f === 0x1907 || f === 0x1903 || f === 0x8227 || f === 0x1902 ? (TYP[t] || 4) * (f === 0x1903 ? .25 : f === 0x8227 ? .5 : 1) : (BPP[f] || 4);
  const put = (key, obj, bytes) => { const old = st.sz.get(obj) || 0; st[key] += bytes - old; st.sz.set(obj, bytes); };
  const bindT = P.bindTexture; P.bindTexture = function(t, o){ st.bound[t] = o; return bindT.call(this, t, o); };
  const bindB = P.bindBuffer; P.bindBuffer = function(t, o){ st.bound[t] = o; return bindB.call(this, t, o); };
  const bindR = P.bindRenderbuffer; P.bindRenderbuffer = function(t, o){ st.bound[t] = o; return bindR.call(this, t, o); };
  const ts = P.texStorage2D; P.texStorage2D = function(t, l, f, w, h){ const o = st.bound[t]; if (o) put('tex', o, w*h*(BPP[f] || 4)*(l > 1 ? 1.34 : 1)); return ts.apply(this, arguments); };
  const ti = P.texImage2D; P.texImage2D = function(t, l, f, w, h){ if (l === 0 && typeof w === 'number' && typeof h === 'number' && arguments.length >= 9){ const o = st.bound[t]; if (o) put('tex', o, w*h*bpp(f, arguments[7])*1.34); } else if (l === 0 && arguments.length <= 6){ const img = arguments[5]; if (img && img.width){ const o = st.bound[t]; if (o) put('tex', o, img.width*img.height*4*1.34); } } return ti.apply(this, arguments); };
  const rs = P.renderbufferStorage; P.renderbufferStorage = function(t, f, w, h){ const o = st.bound[t]; if (o) put('rb', o, w*h*(BPP[f] || 4)); return rs.apply(this, arguments); };
  const rm = P.renderbufferStorageMultisample; P.renderbufferStorageMultisample = function(t, n, f, w, h){ const o = st.bound[t]; if (o) put('rb', o, n*w*h*(BPP[f] || 4)); return rm.apply(this, arguments); };
  const bd = P.bufferData; P.bufferData = function(t, d){ const o = st.bound[t]; if (o){ const n = typeof d === 'number' ? d : d.byteLength; put('buf', o, n); } return bd.apply(this, arguments); };
  const dt = P.deleteTexture; P.deleteTexture = function(o){ if (o) put('tex', o, 0); return dt.call(this, o); };
  const db = P.deleteBuffer; P.deleteBuffer = function(o){ if (o) put('buf', o, 0); return db.call(this, o); };
  const dr = P.deleteRenderbuffer; P.deleteRenderbuffer = function(o){ if (o) put('rb', o, 0); return dr.call(this, o); };
})();
"""

def read(pg, cdp):
    cdp.send('HeapProfiler.collectGarbage')
    r = pg.evaluate("""() => { const g = window.__GLMEM, m = performance.memory, i = renderer.info.memory;
        return { js: m.usedJSHeapSize/1048576, jsTotal: m.totalJSHeapSize/1048576, tex: g.tex/1048576, buf: g.buf/1048576, rb: g.rb/1048576, geoms: i.geometries, textures: i.textures,
                 people: typeof pplList !== 'undefined' ? pplList.length : 0, sc: typeof SC !== 'undefined' ? SC.line() : '' } }""")
    r['gfx'] = r['tex'] + r['buf'] + r['rb']
    return r

def fmt(tag, r):
    return '%-10s JS heap %7.1f MB (total %7.1f)   graphics est %7.1f MB (textures %6.1f, buffers %6.1f, renderbuffers %5.1f)   three: %d geometries %d textures' % (tag, r['js'], r['jsTotal'], r['gfx'], r['tex'], r['buf'], r['rb'], r['geoms'], r['textures'])

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--ref', default=None); ap.add_argument('--rounds', type=int, default=30); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--no-edits', action='store_true', help='leave the building action out of the cycle')
    ap.add_argument('--sim', type=int, default=1200, help='frames simulated per round (60 a second)'); ap.add_argument('--draw', type=int, default=6, help='of those, frames drawn')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('mem', a.ref); sc = H.load_scenes([a.scene])[0]
    ACTS = ['camGoal.x += 25', 'camGoal.z -= 25', 'yawT += 1.2', 'zoomT = 12', 'zoomT = %s' % a.zoom, 'camGoal.x -= 25; camGoal.z += 20', 'yawT -= 1.5', 'S.hour = (S.hour + 3) % 24',
            "const f = [...cells.values()].filter(c => c.sections.length && !c.mega).sort((x, y) => Math.hypot(x.x - camT.x, x.z - camT.z) - Math.hypot(y.x - camT.x, y.z - camT.z))[0]; if (f) addSection(f, 'mid');"]
    if a.no_edits: ACTS = ACTS[:-1]
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=GL)
        cdp = ctx.new_cdp_session(pg)
        pg.evaluate('z => { zoom = zoomT = z; }', a.zoom)
        pg.evaluate('n => __perf.cap(n, 3)', 10)
        print('ref', a.ref or 'working tree', 'scene', a.scene, 'viewport', H.VIEWPORTS[0], flush=True)
        print(fmt('load', read(pg, cdp)), flush=True)
        for k in range(a.rounds):
            pg.evaluate('e => { eval(e) }', ACTS[k % len(ACTS)])
            pg.evaluate('([n, d]) => __perf.cap(n, d)', [a.sim, a.draw])
            if (k + 1) % 5 == 0:
                r = read(pg, cdp); print(fmt('%d s' % ((k + 1)*a.sim//60), r), flush=True)
        print(fmt('end', read(pg, cdp)), 'people', read(pg, cdp)['people'], flush=True)
        print('SC:', pg.evaluate('() => typeof SC !== "undefined" ? SC.line() : "none"'), '| page errors', errs[:2], flush=True)
        br.close()
    srv.shutdown()
