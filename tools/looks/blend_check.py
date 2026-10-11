#!/usr/bin/env python3
"""Checks of the blending (no drawing): LK.lookAt over the whole day and the whole weather range. The weights must add up to one, never be
negative, involve few looks, and move smoothly (no hand-off is a jump). Also the seeded Auto weather: the same sequence every time, and how
much of the time each state lasts. Uses the perf harness's rig only to load the page.

  PERF_PORT=9650 python3 tools/looks/blend_check.py
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H

JS = '''() => {
  const res = { sum_error: 0, negative: 0, most_looks_at_once: 0, looks_over_5pct: 0, share_of_samples_with_looks: {}, max_step_L1_per_0_02h: 0, max_step_L1_per_0_01_weather: 0, hand_offs: {} };
  const L1 = (a, b) => { let s = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) s += Math.abs((a[k] || 0) - (b[k] || 0)); return s; };
  for (const [r, c] of [[0, 0], [0, 1], [1, 1], [.5, .5], [.3, .8], [0, .4]]){
    let prev = null;
    for (let h = 0; h <= 24.0001; h += .02){
      const w = LK.lookAt(h % 24, r, c); let s = 0, n = 0, n5 = 0;
      for (const k in w){ s += w[k]; if (w[k] < -1e-9) res.negative++; if (w[k] > .02) n++; if (w[k] > .05) n5++; }
      res.sum_error = Math.max(res.sum_error, Math.abs(s - 1)); res.most_looks_at_once = Math.max(res.most_looks_at_once, n); res.looks_over_5pct = Math.max(res.looks_over_5pct, n5); res.share_of_samples_with_looks[n5] = (res.share_of_samples_with_looks[n5] || 0) + 1; res.nSamples = (res.nSamples || 0) + 1;
      if (prev) res.max_step_L1_per_0_02h = Math.max(res.max_step_L1_per_0_02h, L1(w, prev));
      prev = w;
    }
  }
  for (const k in res.share_of_samples_with_looks) res.share_of_samples_with_looks[k] = +(res.share_of_samples_with_looks[k]/res.nSamples*100).toFixed(1);
  for (const h of [1, 4, 6, 8, 12, 14, 17.5, 19.2, 21, 23]){
    let prev = null;
    for (let r = 0; r <= 1.0001; r += .01) for (const c of [0, 1]){ const w = LK.lookAt(h, r, c); if (prev && c === 0) res.max_step_L1_per_0_01_weather = Math.max(res.max_step_L1_per_0_01_weather, L1(w, prev)); if (c === 0) prev = w; }
  }
  // which looks own each hour in Auto, clear weather (to the half hour)
  const own = []; for (let h = 0; h < 24; h += .5){ const w = LK.lookAt(h, 0, 0); const top = Object.keys(w).sort((a, b) => w[b] - w[a]).filter(k => w[k] > .02).map(k => k + ':' + Math.round(w[k]*100)); own.push(String(h) + ' ' + top.join(' ')); }
  res.clear_by_half_hour = own;
  // overlap of neighbors, in hours, where both are above 2%: around each boundary
  for (let i = 0; i < LK.auto.length; i++){ const a = LK.auto[i].id, b = LK.auto[(i + 1) % LK.auto.length].id, bd = LK.auto[(i + 1) % LK.auto.length].start; let lo = null, hi = null;
    for (let d = -2; d <= 2; d += .01){ const w = LK.lookAt(((bd + d) % 24 + 24) % 24, 0, 0); if ((w[a] || 0) > .02 && (w[b] || 0) > .02){ if (lo === null) lo = d; hi = d; } }
    res.hand_offs[a + ' to ' + b] = lo === null ? 0 : +(hi - lo).toFixed(2); }
  // Auto weather: the seeded sequence, twice (two fresh runs must agree), and the time each state holds in the first 8 real hours
  return res;
}'''

WX = '''() => {
  // the schedule is private to looks.js: run it through the public path in a fresh page-time: read what wx.set becomes as wx.t advances
  const seq = []; LK.setAutoWeather(true);
  let last = null, t0 = 0, t = 0; const dur = {}; const step = 1;
  const startNow = performance.now();
  for (t = 0; t < 8*3600; t += step){ LK.wx.t = t; LK.wx.mode = 'auto'; /* the state for this time */
    lkApply(); const s = LK.wx.set; dur[s] = (dur[s] || 0) + step; if (s !== last){ seq.push([Math.round(t), s]); last = s; } }
  return { first_changes: seq.slice(0, 14), seconds_per_state_in_8h: dur };
}'''


def main():
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('looks_blend'); sc = H.load_scenes(['city'])[0]
    with sync_playwright() as pw:
        br = H.launch(pw)
        out = []
        for run in range(2):
            ctx, pg, errs = H.open_game(br, url, sc, (640, 360))
            if run == 0: out.append(pg.evaluate(JS))
            out.append(pg.evaluate(WX)); out[-1]['errors'] = errs[:3]
            ctx.close()
        br.close()
    srv.shutdown()
    out[-1]['same_as_first_run'] = out[-1]['first_changes'] == out[-2]['first_changes']
    os.makedirs(os.path.join(HERE, 'results'), exist_ok=True)
    json.dump(out, open(os.path.join(HERE, 'results', 'blend_check.json'), 'w'), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
