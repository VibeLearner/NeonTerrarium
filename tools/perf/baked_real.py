#!/usr/bin/env python3
"""Round 10: the baked far buildings on the real page (the game's own frame loop and clock, the plot worker on, a small window because the software renderer draws every frame).
Round 9 passed the harness and still froze on the owner's machine, so this is the check the harness is not: a city loads from its recipes, the setting is switched on, the bake queue drains, zoom in and out,
the setting off and on again, a plot edited; at each point the page's lines (tiers, bakes, worker, plot arrays) and every page and console error. Counts and states, no timing.
   python3 tools/perf/baked_real.py city [--keep]            (PERF_PORT=... if the default port is taken)"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harness as H

def lines(pg):
    return pg.evaluate('() => ({ tier: TIER.line(), bk: BK.line(), rw: RW.line(), pm: PM.line(), zoom: +zoom.toFixed(1), plots: BAKE.stats().plots, ready: BAKE.stats().by.ready || 0, failed: BAKE.stats().by.failed || 0, pages: BK.pages.length, baked: [...solidRegions.values()].filter(r => r.tier === "baked").length, blocks: solidRegions.size, dirty: solidDirty.size, job: !!SOLID_JOB })')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene', nargs='?', default='island'); ap.add_argument('--out', default=None); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('breal', None); sc = H.load_scenes([a.scene])[0]; errs, cons, log = [], [], []
    def say(what, pg):
        d = lines(pg); d['what'] = what; log.append(d); print(json.dumps(d), flush=True)
    with sync_playwright() as pw:
        br = H.launch(pw); ctx = br.new_context(viewport={'width': 480, 'height': 270}, device_scale_factor=1); pg = ctx.new_page(); pg.set_default_timeout(1200000)
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: cons.append(m.text) if m.type == 'error' else None)
        pg.add_init_script('window.__uuidRand = Math.random;')
        pg.add_init_script('window.__PERF_SCENE = ' + json.dumps({'storage': sc.get('storage', {})}) + ';')
        pg.add_init_script('(() => { try { const s = window.__PERF_SCENE.storage || {}; localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem("neonIsland.autoPerf", "0"); localStorage.setItem("neonIsland.baked", "0"); } catch (e) {} })();')
        pg.goto('http://127.0.0.1:%d%s' % (H.PORT, url))
        pg.wait_for_function('() => document.readyState === "complete" && typeof frame === "function"'); pg.wait_for_function('() => [...document.images].every(i => i.complete)'); pg.wait_for_timeout(2500)
        pg.wait_for_function('() => cells.size > 3 && [...cells.values()].every(c => c.data) && SYNC_Q === null && !anims.length && !solidDirty.size', timeout=300000, polling=500); pg.wait_for_timeout(3000)
        pg.evaluate('() => { S.cycle = false; S.hour = 12; zoomT = 30; }'); pg.wait_for_function('() => Math.abs(zoom - 30) < .5', polling=300); pg.wait_for_timeout(8000); say('loaded, far, setting off', pg)
        pg.evaluate('() => { const b = document.getElementById("baked"); b.checked = true; b.dispatchEvent(new Event("change")); }'); say('setting on', pg)
        pg.wait_for_function('() => { const s = BAKE.stats(); return s.plots > 0 && (s.by.ready || 0) + (s.by.failed || 0) >= s.plots && !BAKE.job; }', timeout=1500000, polling=1000); say('every plot baked', pg)
        pg.wait_for_function('() => !solidDirty.size && !SOLID_JOB && !TIER.rush', timeout=600000, polling=500); pg.wait_for_timeout(5000); say('blocks swapped', pg)
        pg.evaluate('() => { zoomT = 12; }'); pg.wait_for_function('() => Math.abs(zoom - 12) < .5', polling=300); pg.wait_for_timeout(10000); say('zoomed in', pg)
        pg.evaluate('() => { zoomT = 30; }'); pg.wait_for_function('() => Math.abs(zoom - 30) < .5', polling=300); pg.wait_for_timeout(15000)
        pg.wait_for_function('() => !solidDirty.size && !SOLID_JOB', timeout=600000, polling=500); say('zoomed out again', pg)
        pg.evaluate('() => { const b = document.getElementById("baked"); b.checked = false; b.dispatchEvent(new Event("change")); }'); pg.wait_for_timeout(5000)
        pg.wait_for_function('() => !solidDirty.size && !SOLID_JOB && !TIER.rush', timeout=600000, polling=500); say('setting off again', pg)
        pg.evaluate('() => { const b = document.getElementById("baked"); b.checked = true; b.dispatchEvent(new Event("change")); }'); pg.wait_for_timeout(5000)
        pg.wait_for_function('() => !solidDirty.size && !SOLID_JOB && !TIER.rush', timeout=600000, polling=500); say('setting on again', pg)
        # an edit: a plot gets a section; its bake is dropped, made again, the block swaps back to baked
        pg.evaluate('() => { const c = [...cells.values()].find(c => !c.lift && c.data && c.data.rec && !c.mega); window.__edited = c.i + "," + c.j; addSection(c, c.sections[0] ? c.sections[0].zone : "low"); }')
        pg.wait_for_timeout(8000); say('edited a plot', pg)
        pg.wait_for_function('() => { const c = cells.get(__edited); return !c.animating && BAKE.state(c) === "ready"; }', timeout=900000, polling=1000)
        pg.wait_for_function('() => !solidDirty.size && !SOLID_JOB', timeout=600000, polling=500); pg.wait_for_timeout(5000); say('edit baked and swapped', pg)
        br.close()
    bad = [e for e in errs + cons if 'favicon' not in e]
    print('errors:', bad[:6]); print('OK' if not bad else 'ERRORS')
    if a.out: json.dump({ 'log': log, 'errors': bad }, open(a.out, 'w'), indent=1)
    srv.shutdown()
