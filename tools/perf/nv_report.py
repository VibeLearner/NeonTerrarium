#!/usr/bin/env python3
"""Round 8 item 1: the never-seen faces, production view set against a dense reference, on plots of a scene.
For each plot: drawn triangles, removed by the production set, false removals (removed, but the dense reference sees them), and crops of the worst false removals
(the plot shaded flat from the view where the reference sees the triangle most: all faces | the faces the build keeps | difference x4).
   python3 tools/perf/nv_report.py dense --plots 0 1 2 --crops 6 [--prod 'yaws=48,np=8,px=.006'] [--ref 'yaws=96,np=14,px=.0045']"""
import argparse, base64, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'overnight3')
PICK = """([i]) => { const list = [...cells.values()].filter(c => nvNeeds(c) && c.sections && c.sections.length).sort((a, b) => a.data.geo.get(ATLAS).index.count - b.data.geo.get(ATLAS).index.count);
  return { n: list.length, sizes: list.map(c => c.data.geo.get(ATLAS).index.count/3) }; }"""
SAVE = r"""([idx, cfg]) => { const list = [...cells.values()].filter(c => nvNeeds(c) && c.sections && c.sections.length).sort((a, b) => a.data.geo.get(ATLAS).index.count - b.data.geo.get(ATLAS).index.count);
  const c = list[idx], r = NV.runSync(c, cfg), bits = new Uint8Array((r.T + 7) >> 3), tie = new Uint8Array((r.T + 7) >> 3); for (let t = 0; t < r.T; t++){ if (r.never[t]) bits[t >> 3] |= 1 << (t & 7); if (r.tie[t]) tie[t >> 3] |= 1 << (t & 7); }
  const b64 = a => btoa(String.fromCharCode.apply(null, a)); return { T: r.T, never: b64(bits), tie: b64(tie), zone: c.sections[0].zone, i: c.i, j: c.j }; }"""
RUN = r"""([idx, prod, ref, nCrops]) => {
  const list = [...cells.values()].filter(c => nvNeeds(c) && c.sections && c.sections.length).sort((a, b) => a.data.geo.get(ATLAS).index.count - b.data.geo.get(ATLAS).index.count);
  const c = list[idx]; const t0 = performance.now();
  const P = NV.runSync(c, prod), R = NV.runSync(c, ref);
  const T = P.T; let drawn = T, removed = 0, refNever = 0, falseN = 0, ties = 0; const bad = [];
  for (let t = 0; t < T; t++){ if (P.tie[t]) ties++; if (R.never[t]) refNever++; if (P.never[t]){ removed++; if (!R.never[t] && !P.tie[t]){ falseN++; bad.push(t); } } }
  const job = NV.prepared(c, ref), jp = job, pos = jp.pos, v = new THREE.Vector3();
  const area = t => { const o = t*9, ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2], bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2]; return .5*Math.hypot(ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx); };
  bad.sort((a, b) => area(b) - area(a));
  const worst = bad.slice(0, nCrops), crops = [];
  if (worst.length){
    // shaded copies of the plot: all faces, and without the removed ones
    const L = new THREE.Vector3(.45, .8, .35).normalize(), col = new Float32Array(T*9);
    for (let t = 0; t < T; t++){ const d = Math.max(0, jp.nor[t*3]*L.x + jp.nor[t*3 + 1]*L.y + jp.nor[t*3 + 2]*L.z), s = .3 + .7*d; for (let q = 0; q < 3; q++){ col[t*9 + q*3] = s; col[t*9 + q*3 + 1] = s*.97; col[t*9 + q*3 + 2] = s*.9; } }
    const mk = keep => { const idx = []; for (let t = 0; t < T; t++) if (keep(t)) idx.push(t); const p = new Float32Array(idx.length*9), cc = new Float32Array(idx.length*9); idx.forEach((t, k) => { p.set(pos.subarray(t*9, t*9 + 9), k*9); cc.set(col.subarray(t*9, t*9 + 9), k*9); });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); const sc = new THREE.Scene(), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide })); m.frustumCulled = false; sc.add(m); return sc; };
    const scA = mk(() => true), scB = mk(t => !P.never[t]);
    const views = job.views; const cam = _nvCam, tmp = document.createElement('canvas'), cx = tmp.getContext('2d');
    nvGuard(() => {
      for (const t of worst){
        // the view where the dense reference sees this triangle most (first 40 views with 6 pixels or more; else the best)
        let best = null, bestN = 0;
        for (let vi = 0; vi < views.length && bestN < 6; vi++){ const vw = views[vi]; nvView(job, vw[0], vw[1], vw[2], job.px);
          const rt = job.rtId, w = rt.viewport.width, h = rt.viewport.height, buf = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf); let n = 0, sx = 0, sy = 0;
          for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4){ if (buf[i + 3] < 128) continue; if ((buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16)) === t + 1){ n++; sx += x; sy += y; } }
          if (n > bestN){ bestN = n; best = { vi, x: sx/n, y: sy/n, w, h }; } }
        if (!best){ crops.push({ t, none: true }); continue; }
        const vw = views[best.vi]; nvView(job, vw[0], vw[1], vw[2], job.px);   // (leaves the camera set for this view)
        const half = 70, x0 = Math.max(0, Math.min(best.w - 2*half, Math.round(best.x) - half)), y0 = Math.max(0, Math.min(best.h - 2*half, Math.round(best.y) - half)), cw = Math.min(2*half, best.w), ch = Math.min(2*half, best.h);
        const shots = [scA, scB].map(sc => { const rt = job.rtId; renderer.setRenderTarget(rt); renderer.setClearColor(0xb8c8e8, 1); renderer.clear(); renderer.render(sc, cam);
          const buf = new Uint8Array(cw*ch*4); renderer.readRenderTargetPixels(rt, x0, y0, cw, ch, buf); return buf; });
        const S = 3; tmp.width = cw*S*3 + 8; tmp.height = ch*S; const put = (buf, ox, f) => { const im = cx.createImageData(cw, ch); for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++){ const s = ((ch - 1 - y)*cw + x)*4, d = (y*cw + x)*4; im.data[d] = f ? f(buf, s, 0) : buf[s]; im.data[d + 1] = f ? f(buf, s, 1) : buf[s + 1]; im.data[d + 2] = f ? f(buf, s, 2) : buf[s + 2]; im.data[d + 3] = 255; }
          const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch; c2.getContext('2d').putImageData(im, 0, 0); cx.imageSmoothingEnabled = false; cx.drawImage(c2, ox, 0, cw*S, ch*S); };
        put(shots[0], 0); put(shots[1], cw*S + 4);
        put(shots[0], 2*(cw*S + 4), (b, s, k) => Math.min(255, Math.abs(shots[0][s + k] - shots[1][s + k])*4));
        crops.push({ t, px: bestN, area: area(t), png: tmp.toDataURL('image/png'), at: [Math.round(job.ctr.x), Math.round(job.ctr.z)] });
      } });
  }
  nvFree(job);
  const z = c.sections[0].zone;
  return { zone: z, i: c.i, j: c.j, T, removed, refNever, falseN, ties, crops, secs: (performance.now() - t0)/1000, worstAreas: worst.map(area) };
}"""
CROPS = r"""([idx, ref, bad, neverArr, nCrops]) => {
  const list = [...cells.values()].filter(c => nvNeeds(c) && c.sections && c.sections.length).sort((a, b) => a.data.geo.get(ATLAS).index.count - b.data.geo.get(ATLAS).index.count);
  const c = list[idx], T = neverArr.length, P = { never: neverArr, tie: null };
  const job = NV.prepared(c, ref), jp = job, pos = jp.pos, v = new THREE.Vector3();
  const area = t => { const o = t*9, ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2], bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2]; return .5*Math.hypot(ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx); };
  bad.sort((a, b) => area(b) - area(a));
  const worst = bad.slice(0, nCrops), crops = [];
  if (worst.length){
    // shaded copies of the plot: all faces, and without the removed ones
    const L = new THREE.Vector3(.45, .8, .35).normalize(), col = new Float32Array(T*9);
    for (let t = 0; t < T; t++){ const d = Math.max(0, jp.nor[t*3]*L.x + jp.nor[t*3 + 1]*L.y + jp.nor[t*3 + 2]*L.z), s = .3 + .7*d; for (let q = 0; q < 3; q++){ col[t*9 + q*3] = s; col[t*9 + q*3 + 1] = s*.97; col[t*9 + q*3 + 2] = s*.9; } }
    const mk = keep => { const idx = []; for (let t = 0; t < T; t++) if (keep(t)) idx.push(t); const p = new Float32Array(idx.length*9), cc = new Float32Array(idx.length*9); idx.forEach((t, k) => { p.set(pos.subarray(t*9, t*9 + 9), k*9); cc.set(col.subarray(t*9, t*9 + 9), k*9); });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); const sc = new THREE.Scene(), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide })); m.frustumCulled = false; sc.add(m); return sc; };
    const scA = mk(() => true), scB = mk(t => !P.never[t]);
    const views = job.views; const cam = _nvCam, tmp = document.createElement('canvas'), cx = tmp.getContext('2d');
    // one pass over every view of the dense reference: for each of the worst triangles, the view that shows it in most pixels
    const bestOf = new Map(worst.map(t => [t, { n: 0 }])), ids = new Map(worst.map(t => [t + 1, t]));
    nvGuard(() => {
      for (let vi = 0; vi < views.length; vi++){ const vw = views[vi]; nvView(job, vw[0], vw[1], vw[2], job.px);
        const rt = job.rtId, w = rt.viewport.width, h = rt.viewport.height, buf = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf); const cnt = new Map(), sx = new Map(), sy = new Map();
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4){ if (buf[i + 3] < 128) continue; const id = buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16); const t = ids.get(id); if (t === undefined) continue; cnt.set(t, (cnt.get(t) || 0) + 1); sx.set(t, (sx.get(t) || 0) + x); sy.set(t, (sy.get(t) || 0) + y); }
        for (const [t, n] of cnt){ const bo = bestOf.get(t); if (n > bo.n){ bo.n = n; bo.vi = vi; bo.x = sx.get(t)/n; bo.y = sy.get(t)/n; bo.w = w; bo.h = h; } } }
      for (const t of worst){
        const bo = bestOf.get(t), best = bo.n ? bo : null, bestN = bo.n;
        if (!best){ crops.push({ t, none: true }); continue; }
        const vw = views[best.vi]; nvView(job, vw[0], vw[1], vw[2], job.px);   // (leaves the camera set for this view)
        const half = 70, x0 = Math.max(0, Math.min(best.w - 2*half, Math.round(best.x) - half)), y0 = Math.max(0, Math.min(best.h - 2*half, Math.round(best.y) - half)), cw = Math.min(2*half, best.w), ch = Math.min(2*half, best.h);
        const shots = [scA, scB].map(sc => { const rt = job.rtId; renderer.setRenderTarget(rt); renderer.setClearColor(0xb8c8e8, 1); renderer.clear(); renderer.render(sc, cam);
          const buf = new Uint8Array(cw*ch*4); renderer.readRenderTargetPixels(rt, x0, y0, cw, ch, buf); return buf; });
        const S = 3; tmp.width = cw*S*3 + 8; tmp.height = ch*S; const put = (buf, ox, f) => { const im = cx.createImageData(cw, ch); for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++){ const s = ((ch - 1 - y)*cw + x)*4, d = (y*cw + x)*4; im.data[d] = f ? f(buf, s, 0) : buf[s]; im.data[d + 1] = f ? f(buf, s, 1) : buf[s + 1]; im.data[d + 2] = f ? f(buf, s, 2) : buf[s + 2]; im.data[d + 3] = 255; }
          const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch; c2.getContext('2d').putImageData(im, 0, 0); cx.imageSmoothingEnabled = false; cx.drawImage(c2, ox, 0, cw*S, ch*S); };
        put(shots[0], 0); put(shots[1], cw*S + 4);
        put(shots[0], 2*(cw*S + 4), (b, s, k) => Math.min(255, Math.abs(shots[0][s + k] - shots[1][s + k])*4));
        crops.push({ t, px: bestN, area: area(t), png: tmp.toDataURL('image/png'), at: [Math.round(job.ctr.x), Math.round(job.ctr.z)] });
      } });
  }
  nvFree(job);
  return { crops };
}"""
def parse(s):
    return {k: (float(v)) for k, v in (x.split('=') for x in s.split(','))} if s else {}
def unb(b64, T):
    raw = base64.b64decode(b64); return [1 if raw[t >> 3] & (1 << (t & 7)) else 0 for t in range(T)]
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--mode', choices=['prod', 'ref', 'crops', 'list'], default='list'); ap.add_argument('--plot', type=int, default=0); ap.add_argument('--crops', type=int, default=6)
    ap.add_argument('--prod', default='yaws=96,np=14,px=.0045,yawOff=.5'); ap.add_argument('--ref', default='yaws=96,np=14,px=.0045,yawOff=.5'); ap.add_argument('--out', default='nv_report')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageDraw
    srv = H.serve(); url = H.make_site('nvr' + a.mode + str(a.plot), None); sc = H.load_scenes([a.scene])[0]
    prod = parse(a.prod); prod['jits'] = [[0, 0]] if prod.get('px') == .0045 else [[0, 0], [.5, .5], [.25, .75], [.75, .25]]
    ref = parse(a.ref); ref['jits'] = [[0, 0]]
    base = os.path.join(OUT, 'nv_%s_%d_' % (a.scene, a.plot))
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true; window.__KEEP_CPU = true;')
        pg.evaluate('() => { zoom = zoomT = 30; S.cycle = false; S.hour = 12; }'); pg.evaluate('() => __perf.cap(60, 2)')
        if a.mode == 'list':
            info = pg.evaluate(PICK, [0]); print('plots: %d; sizes (triangles drawn) smallest %d, median %d, largest %d' % (info['n'], info['sizes'][0], info['sizes'][len(info['sizes'])//2], info['sizes'][-1]))
        elif a.mode in ('prod', 'ref'):
            r = pg.evaluate(SAVE, [a.plot, prod if a.mode == 'prod' else ref]); json.dump(r, open(base + a.mode + '.json', 'w')); print(a.mode, 'plot', a.plot, r['zone'], 'T', r['T'], 'never', sum(unb(r['never'], r['T'])))
        else:
            P = json.load(open(base + 'prod.json')); R = json.load(open(base + 'ref.json')); T = P['T']; pn, rn, pt = unb(P['never'], T), unb(R['never'], T), unb(P['tie'], T)
            removed = sum(pn); fl = [t for t in range(T) if pn[t] and not rn[t] and not pt[t]]
            print('plot %d (%s at %d,%d): %d triangles drawn; the production set removes %d (%.1f%%); the dense reference never sees %d (%.1f%%); false removals %d (%.1f%% of removed, %.2f%% of drawn); %d depth ties kept' % (a.plot, P['zone'], P['i'], P['j'], T, removed, 100*removed/T, sum(rn), 100*sum(rn)/T, len(fl), 100*len(fl)/max(1, removed), 100*len(fl)/T, sum(pt)))
            r = pg.evaluate(CROPS, [a.plot, ref, fl, pn, a.crops]); tiles = []
            for cr in r['crops']:
                if cr.get('none'): continue
                im = Image.open(io.BytesIO(base64.b64decode(cr['png'].split(',')[1]))).convert('RGB'); d = ImageDraw.Draw(im); d.text((3, 3), 'plot %d  tri %d  area %.4f  seen %d px' % (a.plot, cr['t'], cr['area'], cr['px']), fill=(255, 0, 0)); tiles.append(im)
            if tiles:
                W = max(t.width for t in tiles); Hh = sum(t.height + 4 for t in tiles); m = Image.new('RGB', (W, Hh + 18), (30, 30, 30)); d = ImageDraw.Draw(m); d.text((3, 3), 'all faces | faces the build keeps | difference x4   (worst false removals by area; flat shading from the view where the dense reference sees the triangle most)', fill=(255, 255, 255))
                y = 18
                for t in tiles: m.paste(t, (0, y)); y += t.height + 4
                m.save(os.path.join(OUT, a.out + '.png')); print(os.path.join(OUT, a.out + '.png'))
        print(errs[:2]); br.close()
    srv.shutdown()
