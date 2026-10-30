#!/usr/bin/env python3
"""Neon Terrarium: copy phone benchmark results (js/bench.js, ?bench) from the save server into a folder, with a readable report each.

    python3 tools/bench/collect.py OUT_DIR            # every run not already in OUT_DIR/results/
    python3 tools/bench/collect.py OUT_DIR --id RUNID # just that run (again, if it is there already)
    python3 tools/bench/collect.py --report FILE.json # print the report of a results file (a downloaded one too)

For each run: OUT_DIR/results/<id>.json (the raw numbers) and OUT_DIR/results/<id>.md (the report), and OUT_DIR/README.md lists them all.
The GitHub Action .github/workflows/bench-collect.yml runs this every hour into the bench-results branch.
Standard library only.
"""
import json, os, sys, urllib.request

SERVER = 'https://neon-terrarium-saves.ashley-jacob165.workers.dev'
USER = 'ntbench-results'


def get(path):
    req = urllib.request.Request(SERVER + path, headers={'User-Agent': 'neon-bench-collect'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def f(v, unit=''):
    return '-' if v is None else f'{v}{unit}'


LOAD_LABELS = [('scripts', 'Page and scripts read'), ('title', 'Title screen up'), ('worker', 'Plot worker ready'), ('firstPlot', 'First plot in'),
               ('allPlots', 'Every plot in'), ('people', 'People out'), ('open', 'Loading screen opened'), ('noTitle', 'Game shown (no title)')]


def load_report(R):
    """A load timeline from the phone page's ?loadtest (js/loadtrace.js)."""
    d, M, F = R.get('device', {}), R.get('marks', {}), R.get('files', {})
    c = d.get('connection') or {}
    L = [f"# Phone load {R.get('id')}", '', f"{R.get('started', '?')} on {R.get('page', '?')}, "
         + ('files from the phone\'s saved copy where it had them' if R.get('swControlled') else 'first visit (nothing saved on the phone)'), '',
         f"Device: {d.get('model') or '-'}, {d.get('gpu') or '-'}, {d.get('cores')} cores, {d.get('memGB')} GB, phone mode {d.get('phoneMode')}; "
         f"network {c.get('type')} {c.get('down')} Mbps, {c.get('rtt')} ms round trip. City: {R.get('city')}", '',
         '| stage | seconds from opening the address |', '|---|---|']
    L += [f"| {lab} | {M[k]/1000:.1f} |" for k, lab in LOAD_LABELS if M.get(k) is not None]
    L += ['', f"Downloaded {F.get('n')} files, {F.get('kb', 0)/1024:.1f} MB over the network ({F.get('fromPhone')} from the phone's saved copy). Page itself after {F.get('htmlMs')} ms.", '',
          '| biggest downloads | KB | ms |', '|---|---|---|'] + [f"| {b['u']} | {b['kb']} | {b['ms']} |" for b in F.get('big', [])]
    S = R.get('smooth')
    if S:
        L += ['', '## Smoothness after loading', '', f"{S.get('frames')} frames from the loading screen opening to 30 s after Continue; {S.get('over50')} slower than 50 ms, "
              f"{S.get('over100')} slower than 100 ms, worst {S.get('worst')} ms. Continue tapped at {(M.get('played') or 0)/1000:.1f} s.", '',
              '| at s | ms | title | loading | cool-down | merges | staged | people pending | Scan page | Scan warm | cache | scrolling |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
        L += [f"| {x['t']/1000:.1f} | {x['ms']} | {x['title']} | {x['loading']} | {x['cool']} | {x['merging']} | {x['stageQ']} | {x['people']} | {x['scan']} | {x['scanWarm']} | {x['cache']} | {x['scrolling']} |" for x in S.get('long', [])]
        sc = sorted((S.get('scripts') or {}).items(), key=lambda kv: -kv[1]['ms'])[:15]
        if sc:
            L += ['', '| script in slow frames | times | total ms | longest ms |', '|---|---|---|---|'] + [f"| {k} | {v['n']} | {v['ms']} | {v['max']} |" for k, v in sc]
        pt = sorted((S.get('partsTotal') or {}).items(), key=lambda kv: -kv[1])[:20]
        if pt:
            L += ['', '| part of the game, in slow frames (perfhud) | total ms |', '|---|---|'] + [f"| {k} | {v} |" for k, v in pt]
        for f in (S.get('parts') or [])[:15]:
            L.append(f"- {f['t']/1000:.1f} s, {f['gap']} ms (sent {f.get('up')} KB, {f.get('links')} shader links): " + ', '.join(f"{k.strip()} {v}" for k, v in f['laps']))
        fn = sorted((S.get('fn') or {}).items(), key=lambda kv: -kv[1]['ms'])
        if fn:
            L += ['', '| game step (includes what it calls) | calls | total ms | longest ms |', '|---|---|---|---|'] + [f"| {k} | {v['n']} | {v['ms']} | {v['max']} |" for k, v in fn]
        if S.get('slowCalls'):
            L += ['', 'Steps over 16 ms: ' + ', '.join(f"{t/1000:.1f}s {n} {ms}" for t, n, ms in S['slowCalls'])]
        L += ['', 'Frames per second, by second: ' + ' '.join(f"{t}:{n}" + (f"({w})" if w > 50 else '') for t, n, w in S.get('perSec', []))]
    return '\n'.join(L) + '\n'


def report(R):
    if R.get('kind') == 'load':
        return load_report(R)
    d = R.get('device', {})
    L = [f"# Phone benchmark {R.get('id')}", '']
    L.append(f"Run {R.get('started', '?')} to {R.get('ended', '?')} on {R.get('page', '?')}")
    L.append('')
    L.append('## Device')
    L.append('')
    rows = [
        ('Model', d.get('model') or '(not reported)'), ('OS', d.get('os') or d.get('platform')), ('Browser', d.get('browser') or d.get('ua')),
        ('Graphics', f"{d.get('gpu')} ({d.get('gpuVendor')})"), ('CPU cores', d.get('cores')), ('Memory', f(d.get('memGB'), ' GB (rounded by the browser)')),
        ('Screen', f"{d.get('inner')} CSS px at pixel ratio {d.get('dpr')}, {d.get('orientation')}"),
        ('WebGL', f"WebGL2 {d.get('webgl2')}, GPU timers {d.get('gpuTimers')}, float targets {d.get('floatRT')}, max texture {d.get('maxTex')}"),
        ('Touch layout', d.get('touchLayout')),
        ('Battery', f"start {d.get('battery')}, end {R.get('batteryEnd')}"),
    ]
    L += ['| | |', '|---|---|'] + [f'| {k} | {v} |' for k, v in rows]
    for it in R.get('items', []):
        L += ['', f"## {it.get('scene', '?')}" + (' (warm-up test)' if (it.get('plan') or {}).get('soak') else ''), '']
        if it.get('error'):
            L.append(f"**Error:** {it['error']}")
        if it.get('crashed'):
            L.append(f"**Crashed:** {it['crashed']}")
        if it.get('loadMs') is not None:
            L.append(f"Loaded in {it['loadMs']/1000:.1f} s from page start{' (TIMED OUT)' if it.get('loadTimeout') else ''}. {it.get('recipeLoad', '')}")
        if it.get('frameErrors'):
            L.append(f"Frame errors: {it['frameErrors']} (last: {it.get('lastFrameError', '')[:200]})")
        st = it.get('steps') or []
        if st:
            L += ['', '| step | fps | mean ms | p50 | p95 | p99 | worst | >33 ms | long tasks | render | people |', '|---|---|---|---|---|---|---|---|---|---|---|']
            for s in st:
                L.append(f"| {s['name']}{' (interrupted)' if s.get('interrupted') else ''} | {f(s.get('fps'))} | {f(s.get('mean'))} | {f(s.get('p50'))} | {f(s.get('p95'))} | {f(s.get('p99'))} | {f(s.get('worst'))} | {f(s.get('over33'), '%')} | {s.get('longTasks', 0)} ({s.get('longTaskMs', 0)} ms) | {s.get('render')} | {f(s.get('people'))} |")
        e = it.get('effects')
        if e:
            L += ['', f"Effects (baseline {e.get('baseline')} ms a frame; saves = ms a frame gained by turning it off):", '', '| off | mean ms | p95 | saves |', '|---|---|---|---|']
            for k, v in (e.get('off') or {}).items():
                L.append(f"| {k} | {v.get('mean')} | {v.get('p95')} | {v.get('saves')} |")
            if e.get('allOff'):
                L.append(f"| everything | {e['allOff'].get('mean')} | {e['allOff'].get('p95')} | {e['allOff'].get('saves')} |")
            for n in ('lines480', 'lines240'):
                if e.get(n):
                    L.append(f"| pixels {n[5:]}p ({e[n].get('render')}) | {e[n].get('mean')} | {e[n].get('p95')} | {e[n].get('saves')} |")
        sk = it.get('soak')
        if sk:
            L += ['', f"Warm-up test, slow turn (battery {sk.get('batteryStart')} to {sk.get('batteryEnd')}):", '', '| after s | fps | mean ms | p95 | >33 ms |', '|---|---|---|---|---|']
            for s in sk.get('slices', []):
                L.append(f"| {s['t']} | {s.get('fps')} | {s.get('mean')} | {s.get('p95')} | {s.get('over33')}% |")
        for b in it.get('breakdowns') or []:
            L += ['', f"<details><summary>Breakdown: {b.get('name')} (script {b.get('jsMs')} ms, graphics {b.get('gpuMs')} ms a frame)</summary>", '']
            if b.get('error'):
                L.append(f"Error: {b['error']}")
            for k in ('text', 'exactText'):
                if b.get(k):
                    L += ['```', b[k], '```']
            L.append('</details>')
    return '\n'.join(L) + '\n'


def index(out):
    rd = os.path.join(out, 'results')
    rows = []
    for fn in sorted(os.listdir(rd), reverse=True):
        if not fn.endswith('.json'):
            continue
        try:
            R = json.load(open(os.path.join(rd, fn)))
        except Exception:
            continue
        d = R.get('device', {})
        if R.get('kind') == 'load':
            o = (R.get('marks') or {}).get('open') or (R.get('marks') or {}).get('noTitle')
            rows.append(f"| [{R.get('id')}](results/{fn[:-5]}.md) | {R.get('started', '')[:16]} | {d.get('model') or '-'} | load test: open after {o/1000:.1f} s |  |  |" if o else f"| [{R.get('id')}](results/{fn[:-5]}.md) | {R.get('started', '')[:16]} | {d.get('model') or '-'} | load test |  |  |")
            continue
        city = next((it for it in R.get('items', []) if it.get('scene') == 'city' and it.get('steps')), None)
        slow = next((s for s in (city or {}).get('steps', []) if s['name'] == 'slow turn'), None) if city else None
        rows.append(f"| [{R.get('id')}](results/{fn[:-5]}.md) | {R.get('started', '')[:16]} | {d.get('model') or '-'} | {d.get('gpu')} | {slow.get('fps') if slow else '-'} | {slow.get('p95') if slow else '-'} |")
    open(os.path.join(out, 'README.md'), 'w').write('# Phone benchmark results\n\nCopied here from the save server by `.github/workflows/bench-collect.yml` on main (see `tools/bench/README.md`). Newest first.\n\n'
        '| run | started (UTC) | model | graphics | medium city slow turn fps | p95 ms |\n|---|---|---|---|---|---|\n' + '\n'.join(rows) + '\n')


def main():
    a = sys.argv[1:]
    if a and a[0] == '--report':
        print(report(json.load(open(a[1]))))
        return
    out = a[0]
    only = a[a.index('--id') + 1] if '--id' in a else None
    rd = os.path.join(out, 'results')
    os.makedirs(rd, exist_ok=True)
    ids = [only] if only else [x['slot'] for x in json.loads(get('/saves/' + USER))]
    new = 0
    for i in ids:
        p = os.path.join(rd, i + '.json')
        if os.path.exists(p) and not only:
            continue
        R = json.loads(get('/saves/' + USER + '/' + i))
        json.dump(R, open(p, 'w'), indent=1)
        open(os.path.join(rd, i + '.md'), 'w').write(report(R))
        new += 1
        print('copied', i)
    index(out)
    print(new, 'new run(s)')


if __name__ == '__main__':
    main()
