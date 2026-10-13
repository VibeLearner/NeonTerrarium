#!/usr/bin/env python3
"""Stress test for the police cases and the storylets (Neon Terrarium).

Loads the game in a headless browser on a test city (tools/stress/city.json), adds the buildings every case needs (a square,
a bath house, a logistics hub, a market), then:

  A. the case simulation alone, many runs of every boss case: how they end, on what day, how often a cop is approached and
     what they do; the time one simulated hour takes.
  B. cases back to back, rivals kept: whether an escaped boss comes back.
  C. the whole game running fast for some days: a case in progress, the camera moved from person to person (cast and ordinary
     residents) so the storylet director works for many people. Every log line is checked (placeholders left in, "undefined",
     doubled words, em dashes), every moment's ending is counted (done, lost, stuck, no spot), errors are caught, and the frame
     time of the people, the stories and the cases is measured.

Writes a report to stress-report.txt (and .json) next to where it's run.

Run it from the repo:
    pip install playwright && python -m playwright install chromium
    python tools/stress/stress.py            # the default: 12 game days in part C
    python tools/stress/stress.py --days 30  # longer
    python tools/stress/stress.py --gpu      # use the GPU (faster on a desktop; the default is software rendering)
"""
import argparse, json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
ap = argparse.ArgumentParser()
ap.add_argument('--days', type=int, default=12, help='game days of the full run (part C)')
ap.add_argument('--runs', type=int, default=12, help='simulation runs per boss case and variant (part A)')
ap.add_argument('--port', type=int, default=8791)
ap.add_argument('--gpu', action='store_true')
ap.add_argument('--parts', default='ABC', help='which parts to run, e.g. AB')
ap.add_argument('--out', default='stress-report')
a = ap.parse_args()

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(a.port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
store = json.load(open(os.path.join(HERE, 'city.json'))); store['neonIsland.renderLines'] = '240'
report = {}; lines = []
def say(*x):
    s = ' '.join(str(v) for v in x); print(s, flush=True); lines.append(s)

try:
    with sync_playwright() as p:
        args = [] if a.gpu else ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
        b = p.chromium.launch(args=args)
        pg = b.new_page(viewport={'width': 480, 'height': 300}); errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') and any(k in m.text for k in ('story', 'case', 'scene', 'monitor', 'Error')) else None)
        pg.add_init_script('const S0 = ' + json.dumps(store) + '; if (!sessionStorage.getItem("seeded")){ localStorage.clear(); for (const k in S0) localStorage.setItem(k, S0[k]); sessionStorage.setItem("seeded","1"); }')
        t0 = time.time()
        pg.goto(f'http://localhost:{a.port}/index.html')
        pg.wait_for_function('typeof pplReady !== "undefined" && pplReady && STORY.on && CASES.on', timeout=300000)
        say('loaded in', round(time.time() - t0), 's')
        say(pg.evaluate('''() => { S.cycle = false; S.hour = 9; CASES.paused = true;
          const c = [...cells.values()].find(c => !c.mega && c.sections.length && Math.abs(c.i) < 3 && Math.abs(c.j) < 3) || [...cells.values()][0];
          const out = []; for (const k of ['square', 'bathhouse', 'logistics', 'market']) if (![...megas.values()].some(m => m.kind === k)){ const m = spawnMega(k, c); out.push(k + (m ? '' : ' (no room)')); }
          return 'added: ' + out.join(', '); }'''))
        pg.wait_for_function('''(() => { const sq = [...places.values()].find(pl => pl.mega && pl.mega.kind === "square" && pl.stalls && pl.stalls.size >= 3);
          return sq && [...people.values()].filter(p => p.job === sq.id).length >= 2; })()''', timeout=400000)
        pg.evaluate('''() => { window.requestAnimationFrame = () => 0; S.cycle = true;
          window.PERF_T = { people: 0, story: 0, n: 0, maxStory: 0, maxPeople: 0 };
          window.SIM = (n, stop) => { let t = window._t || performance.now();
            for (let i = 0; i < n; i++){ t += 50; if (S.cycle) S.hour = (S.hour + .05*24/3600*FF.clock) % 24; applyTime(); updateAnims(.05);
              const a = performance.now(); updatePeople(.05*FF.ppl, FF.peopleTime(.05, t/1000)); const b = performance.now(); STORY.tick(.05); const c = performance.now();
              if (c - b > 12 && window.SLOW) SLOW.push([+(c - b).toFixed(1), 'story', STORY.day() + 1, Math.floor(S.hour), (CASES.journal.slice(-1)[0] || '').slice(0, 90), STORY.dbg.why]);
              if (b - a > 25 && window.SLOW) SLOW.push([+(b - a).toFixed(1), 'people', STORY.day() + 1, Math.floor(S.hour)]);
              PERF_T.people += b - a; PERF_T.story += c - b; PERF_T.n++; PERF_T.maxPeople = Math.max(PERF_T.maxPeople, b - a); PERF_T.maxStory = Math.max(PERF_T.maxStory, c - b);
              if (stop && stop()){ window._t = t; return i; } }
            window._t = t; return n; };
          SIM(200); }''')

        # ---------- A: the simulation alone ----------
        if 'A' in a.parts:
            say('\n== A. the case simulation alone,', a.runs, 'runs per case and variant')
            A = pg.evaluate('''(R) => { const out = {}, ARCS = ['b1-long-queue', 'b2-door-work', 'b3-the-regular', 'b4-dead-drop-days', 'b5-last-train'];
              CASES.noStage = true; let hours = 0, ms = 0;
              for (const arc of ARCS) for (const v of ['careless', 'careful']){
                const key = arc + ' ' + v, row = out[key] = { why: null, endings: {}, days: {}, approached: 0, told: 0, refused: 0, turned: 0, flipped: 0, fired: 0, framed: 0, errors: 0 };
                for (let k = 0; k < R; k++){
                  try { CASES.stop(); CASES.rivals = []; const r = CASES.start(arc, { seed: 1000 + k*7919, variant: v }); if (!r){ row.why = CASES.dbg.why; break; }
                    const t = performance.now(); CASES.simFast(24*36); ms += performance.now() - t; hours += 24*36;
                    const S = CASES.sim(); row.endings[S.ending || 'none'] = (row.endings[S.ending || 'none'] || 0) + 1; (row.days[S.ending || 'none'] = row.days[S.ending || 'none'] || []).push(S.day);
                    if (S.approached){ row.approached++; const st = Object.values(CASES.run.sim.cops).find(c => c.id === CASES.run.cast[S.approached.who]); const x = st ? st.state : '';
                      if (x === 'told') row.told++; else if (x === 'turned' || x === 'flipped' || x === 'fired') row.turned++; else row.refused++; }
                    for (const c of Object.values(CASES.run.sim.cops)){ if (c.state === 'flipped') row.flipped++; if (c.state === 'fired') row.fired++; }
                    if (CASES.run.sim.framed) row.framed++;
                  } catch (e){ row.errors++; row.lastError = String(e).slice(0, 200); }
                }
              }
              CASES.stop(); CASES.noStage = false;
              return { out, msPerHour: hours ? ms/hours : 0 }; }''', a.runs)
            report['A'] = A
            for k, r in A['out'].items():
                if r['why']: say(f'  {k:30s} not run here: {r["why"]}'); continue
                ends = ', '.join(f'{e} {n} (days {min(r["days"][e])}-{max(r["days"][e])})' for e, n in r['endings'].items())
                say(f'  {k:30s} {ends} | approached {r["approached"]}: told {r["told"]}, refused {r["refused"]}, turned {r["turned"]} | flipped {r["flipped"]}, fired {r["fired"]}, framed {r["framed"]}' + (f' | ERRORS {r["errors"]}: {r.get("lastError")}' if r['errors'] else ''))
            say(f'  one simulated hour: {A["msPerHour"]:.3f} ms')

        # ---------- B: back to back, rivals kept ----------
        if 'B' in a.parts:
            say('\n== B. cases back to back, escaped bosses kept as rivals')
            B = pg.evaluate('''() => { const out = []; CASES.noStage = true; CASES.rivals = [];
              for (let k = 0; k < 16; k++){ CASES.stop(); const r = CASES.start('b1-long-queue', { seed: 5000 + k*104729, variant: k % 2 ? 'careful' : 'careless' }); if (!r){ out.push('no start: ' + CASES.dbg.why); break; }
                CASES.simFast(24*36); const S = CASES.sim(); out.push((CASES.run.sim.rival ? 'RIVAL BACK (' + (CASES.run.sim.boss.back || 1) + ') ' : '') + S.ending + ' day ' + S.day + ', rivals waiting ' + (CASES.rivals || []).length); }
              CASES.stop(); CASES.noStage = false; return out; }''')
            report['B'] = B
            for l in B: say('  ' + l)

        # ---------- C: the whole game, fast ----------
        if 'C' in a.parts:
            say('\n== C. the game at 60x for', a.days, 'game days, the camera moving from person to person')
            pg.evaluate('''() => { CASES.rivals = []; CASES.stop(); window.PERF_T = { people: 0, story: 0, n: 0, maxStory: 0, maxPeople: 0 };
              for (const k in STORY.endStats) delete STORY.endStats[k]; CASES.paused = false;
              const ok = ['b1-long-queue', 'b2-door-work', 'b3-the-regular', 'b4-dead-drop-days', 'b5-last-train'].find(x => CASES.start(x, { seed: 4242 })); window.CASE_ARC = ok || null;
              window.SEEN = new Map(); window.WATCHED = new Set(); window.SLOW = [];
          const ct = CASES.tick; window.CT = { max: 0, n: 0, sum: 0 }; CASES.tick = () => { const a = performance.now(); ct(); const d = performance.now() - a; CT.n++; CT.sum += d; CT.max = Math.max(CT.max, d); }; }''')
            say('  case:', pg.evaluate('() => CASE_ARC'))
            chunks = a.days   # (a game day each: 1200 small steps at 60x)
            for k in range(chunks):
                r = pg.evaluate('''(k) => {
                  // the camera: a case person every other time, else someone at random who's out and about
                  const run = CASES.run, cast = run ? Object.values(run.cast).filter(id => people.has(id)) : [];
                  const out = [...people.values()].filter(p => !p.visitor && (p.walk || p.spot));
                  const pick = (k % 2 && cast.length) ? cast[(k*7) % cast.length] : out.length ? out[(k*131) % out.length].id : null;
                  if (pick){ STORY.setWatch(pick); WATCHED.add(pick); }
                  FF.set(60); SIM(1200); FF.set(1);
                  const S = CASES.sim(); return { day: STORY.day() + 1, sim: S ? { day: S.day, heat: S.heat, ending: S.ending, queue: S.queue.length } : null, scenes: STORY.scenes.size }; }''', k)
                if k % 2 == 1: say(f'  day {r["day"]}: case {json.dumps(r["sim"])}, moments now {r["scenes"]}')
            C = pg.evaluate('''() => {
              const bad = [], seen = new Map(); let n = 0;
              const RE = [[/\\{[A-Za-z0-9.:\\/-]+\\}/, 'placeholder left in'], [/undefined|NaN|\\[object/, 'undefined'], [/\\b(\\w+) \\1\\b/i, 'doubled word'], [/\\u2014/, 'em dash'], [/Officer Officer/, 'Officer Officer'], [/\\bsomeone\\b/, 'someone (a role nobody played)']];
              for (const id of WATCHED) for (const e of STORY.log(id)){ n++; const t = STORY.render(e); seen.set(t, (seen.get(t) || 0) + 1);
                for (const [re, what] of RE) if (re.test(t) && !(what === 'doubled word' && /\\b(had|that) \\1\\b/i.test(t))) bad.push(what + ': ' + t); }
              const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
              const S = CASES.sim();
              return { lines: n, distinct: seen.size, watched: WATCHED.size, bad: [...new Set(bad)].slice(0, 60), badCount: bad.length, top, ends: STORY.endStats,
                perf: { people: PERF_T.people/PERF_T.n, story: PERF_T.story/PERF_T.n, maxPeople: PERF_T.maxPeople, maxStory: PERF_T.maxStory }, slow: SLOW.sort((a, b) => b[0] - a[0]).slice(0, 15), cases: { avg: CT.sum/Math.max(1, CT.n), max: CT.max },
                sim: S && { ending: S.ending, day: S.day, events: S.events.slice(-30) }, journal: CASES.journal.filter(l => / (sim wait|wait|lost|stuck) /.test(l)).slice(-25) }; }''')
            report['C'] = C
            say(f'  log lines checked: {C["lines"]} ({C["distinct"]} different) from {C["watched"]} people watched')
            say(f'  problems in lines: {C["badCount"]}')
            for l in C['bad']: say('    ' + l)
            say('  most repeated lines:')
            for t, n in C['top']: say(f'    {n:4d}x {t}')
            say('  how moments ended (kind and reason: count):')
            for k2, v in sorted(C['ends'].items(), key=lambda x: -x[1]): say(f'    {k2:28s} {v}')
            pf = C['perf']; say(f'  time per step: people {pf["people"]:.2f} ms (max {pf["maxPeople"]:.1f}), stories and cases {pf["story"]:.3f} ms (max {pf["maxStory"]:.1f})')
            say(f'  the cases alone: {C["cases"]["avg"]:.3f} ms a step (max {C["cases"]["max"]:.1f})')
            say('  the slowest steps (ms, what, day, hour, last case note, last director note):')
            for r in C['slow']: say('    ' + json.dumps(r))
            if C['sim']:
                say(f'  the case: {C["sim"]["ending"] or "still running"} on day {C["sim"]["day"]}; its last events:')
                for l in C['sim']['events']: say('    ' + l)
            say('  waits and interruptions (last 25):')
            for l in C['journal']: say('    ' + l)
        report['errors'] = errs[:80]
        say(f'\n== errors and warnings: {len(errs)}')
        for e in errs[:40]: say('  ' + e[:300])
        b.close()
finally:
    srv.terminate()
    open(a.out + '.txt', 'w').write('\n'.join(lines) + '\n')
    json.dump(report, open(a.out + '.json', 'w'), indent=1)
    print('\nreport written to', a.out + '.txt and', a.out + '.json')
