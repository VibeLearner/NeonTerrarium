#!/usr/bin/env python3
"""Pose checks for the character generator: contact strips of every action (6x, dark background) and numbers.
  python3 tools/peoplegen/poses_check.py [--out /tmp/pg_strips] [--shapes 0-9]
Prints, for the walk and run: each frame's foot x / lift and the planted-foot velocity against PG.STRIDE; then the key points outside the 12 x 16 cell and the drawn pixels lost off the cell edge."""
import argparse, glob, os, sys, base64
import numpy as np
from PIL import Image, ImageDraw
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ACT = [('walk', 0, 6), ('idle', 6, 4), ('gesture', 10, 6), ('sit', 16, 4), ('handheld', 20, 6), ('angry', 26, 6), ('run', 32, 6), ('uwalk', 38, 6), ('uidle', 44, 4), ('uopen', 48, 4)]
JS = r'''() => {
  const out = { rows: [], clip: {}, kp: [], stride: PG.STRIDE };
  const P = PG.poses, F = PG.F;
  for (let f = 0; f < F.N; f++){ const k = PG.skeleton(PG.shapes[0].body, P[f]); out.rows.push({ f, nf: k.nearFoot, ff: k.farFoot, nh: k.nearHand, fh: k.farHand, headTop: k.headTop, hx: k.hx }); }
  // key points outside the cell, every body of the shapes
  const bad = []; const pts = ['nearFoot','farFoot','nearKnee','farKnee','nearHand','farHand','nearElbow','farElbow','nearSh','farSh','hip'];
  for (let s = 0; s < PG.shapes.length; s++) for (let f = 0; f < F.N; f++){ const k = PG.skeleton(PG.shapes[s].body, P[f]);
    for (const n of pts){ const p = k[n]; const x = Math.round(p[0]), y = Math.round(p[1]); if (x < 0 || x > 10 && /Foot/.test(n) || x > 11 || y < 0 || y > 15) bad.push([s, f, n, x, y]); }
    if (k.hx < 0 || k.hx + 3 > 11 || k.headTop + k.nod < 0) bad.push([s, f, 'head', k.hx, k.headTop]); }
  out.kp = bad;
  // drawn pixels lost off the cell edge (counted per frame over all shapes): wrap Cell.set
  const lost = new Array(F.N).fill(0), lostBase = {}; let cur = -1, curS = -1; const set0 = PG.Cell.prototype.set;
  PG.Cell.prototype.set = function(x, y, c){ x = Math.round(x); y = Math.round(y); if (c && (x < 0 || y < 0 || x >= 12 || y >= 16)) lost[cur]++; return set0.call(this, x, y, c); };
  const per = {};
  for (let s = 0; s < PG.shapes.length; s++) for (let f = 0; f < F.N; f++){ cur = f; const b = new Uint8Array(12*16); const before = lost[f]; PG.drawFigure(new PG.Cell(b, 12, 0, 0), PG.skeleton(PG.shapes[s].body, P[f]), PG.shapes[s]); if (lost[f] > before) (per[s] = per[s] || []).push([f, lost[f] - before]); }
  PG.Cell.prototype.set = set0; out.lostPer = per;
  return out; }'''
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='/tmp/pg_strips'); ap.add_argument('--shapes', default='0-9'); a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    from playwright.sync_api import sync_playwright
    files = [os.path.join(ROOT, 'js/spritegen.js'), os.path.join(ROOT, 'js/peoplegen.js')] + sorted(glob.glob(os.path.join(ROOT, 'js/peoplegen_*.js')))
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.set_content('<html><body></body></html>')
        for f in files: pg.add_script_tag(content=open(f).read() + "\n;if (typeof PG !== 'undefined') window.PG = PG;")
        info = pg.evaluate('() => { PG.build(); return { rows: PG.ROWS, W: PG.W, H: PG.H, n: PG.shapes.length }; }')
        res = pg.evaluate(JS)
        raw = pg.evaluate('() => { const b = PG.indexBuf; let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); }')
        cols = {i: pg.evaluate('n => PG.colorsOfRow(n)', (i*7) % 3840) for i in range(info['n'])}
        b.close()
    if errs: print('PAGE ERRORS', errs)
    buf = np.frombuffer(base64.b64decode(raw), dtype=np.uint8).reshape(info['H'], info['W'])
    st = res['stride']; print('STRIDE', st)
    R = res['rows']
    for name, f0, n in (('walk', 0, 6), ('run', 32, 6)):
        print(name, 'frame: near foot (x,lift) far foot (x,lift) | head top, near hand')
        for k in range(n):
            r = R[f0 + k]; print('  %d  near (%d,%d) far (%d,%d)  spread %d width %d  headTop %d  hand n (%d,%d) f (%d,%d)' % (k, r['nf'][0], 15 - r['nf'][1], r['ff'][0], 15 - r['ff'][1], abs(r['nf'][0] - r['ff'][0]), abs(r['nf'][0] - r['ff'][0]) + 2, r['headTop'], *r['nh'], *r['fh']))
        # planted-foot velocity: frames where lift 0 on consecutive frames
        for key, lab in (('nf', 'near'), ('ff', 'far')):
            v = []
            for k in range(n):
                a_, b_ = R[f0 + k][key], R[f0 + (k + 1) % n][key]
                if a_[1] == 15 and b_[1] == 15 or (a_[1] == 15 and b_[1] == 15): v.append(b_[0] - a_[0])
            print('  %s planted step per frame %s -> ground speed %.2f px/frame, stride %.1f px/cycle (PG.STRIDE %.1f)' % (lab, v, -np.mean(v), -6*np.mean(v), st[name]))
        air = [k for k in range(n) if R[f0 + k]['nf'][1] < 15 and R[f0 + k]['ff'][1] < 15]; print('  both feet off the ground on frames', air)
    print('key points outside the cell:', res['kp'][:20], len(res['kp']))
    print('pixels lost off the cell edge (shape: [[frame, n]]):', {k: v for k, v in res['lostPer'].items()})
    S = 6; bg = (30, 34, 42)
    lo, hi = (a.shapes.split('-') + [a.shapes])[:2]; shapes = list(range(int(lo), min(int(hi), info['n'] - 1) + 1))
    def cell(i, f):
        c = buf[i*16:(i + 1)*16, f*12:(f + 1)*12]; out = np.zeros((16, 12, 3), np.uint8); out[...] = bg
        for v in range(1, 16): m = c == v; col = cols[i][v]; out[m] = ((col >> 16) & 255, (col >> 8) & 255, col & 255)
        return Image.fromarray(out).resize((12*S, 16*S), Image.NEAREST)
    for name, f0, n in ACT:
        img = Image.new('RGB', (n*(12*S + 4) + 4, len(shapes)*(16*S + 4) + 4), bg)
        for r, i in enumerate(shapes):
            for k in range(n): img.paste(cell(i, f0 + k), (4 + k*(12*S + 4), 4 + r*(16*S + 4)))
        img.save(os.path.join(a.out, 'strip_%s.png' % name))
    print('strips in', a.out)
main()
