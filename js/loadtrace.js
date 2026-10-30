// Neon Terrarium: how long a phone's load took, stage by stage. Only on the phone page (m.html adds it: tools/mobile/build.js), never on a computer.
// Every load notes when each stage was reached, from the moment the address was opened: the page, the scripts, the title screen, the plot worker
// up, the first plot, every plot, the people, the loading screen opening. And what was downloaded: how many files, how many
// bytes, the biggest. The last five loads are kept in this browser (touch:nt.loadtrace).
// With ?loadtest in the address, once the loading screen has opened a card shows the numbers with a Send button, which puts them with the phone
// benchmark's results (the same save server and user, tools/bench/collect.py copies them into the repo).
'use strict';
(() => {
  if (typeof TOUCH === 'undefined' || !TOUCH.on) return;
  const SERVER = 'https://neon-terrarium-saves.ashley-jacob165.workers.dev', USER = 'ntbench-results', KEY = 'touch:nt.loadtrace';
  const TEST = /[?&]loadtest\b/.test(location.search);
  const now = () => Math.round(performance.now());
  const M = {}, at = k => { if (M[k] == null) M[k] = now(); };
  const R = { id: 'L' + new Date().toISOString().replace(/\D/g, '').slice(0, 12) + '-' + Math.random().toString(36).slice(2, 6), kind: 'load', started: new Date().toISOString(),
    page: location.origin + location.pathname, swControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller), marks: M };
  addEventListener('DOMContentLoaded', () => at('scripts'));
  addEventListener('load', () => at('allFiles'));
  const g = f => { try { return f(); } catch (e) { return undefined; } };
  let done = false;
  (function poll(){
    if (done) return;
    if (g(() => TITLE.on)) at('title');
    if (g(() => RW.state) === 'ready') at('worker');
    const fa = g(() => LOADP.firstAt), da = g(() => LOADP.doneAt);
    if (fa != null) M.firstPlot = M.firstPlot != null ? M.firstPlot : Math.round(fa);
    if (da != null) M.allPlots = M.allPlots != null ? M.allPlots : Math.round(da);
    if (g(() => pplReady)) at('people');
    const oa = g(() => TITLE.openAt); if (oa != null && M.open == null) M.open = Math.round(oa);
    if (M.title == null && M.scripts != null && now() - M.scripts > 3000 && !g(() => TITLE.on)) at('noTitle');
    if ((M.open != null || M.noTitle != null) && now() - (M.open || M.noTitle) > 3000) return finish();
    if (now() > 180000) return finish();
    setTimeout(poll, 100);
  })();
  // the loading screen open: what had been downloaded by then (and save the record early, in case the player leaves)
  let saved = false;
  function files(){
    const es = g(() => performance.getEntriesByType('resource')) || [], nav = g(() => performance.getEntriesByType('navigation')[0]);
    const by = {}; let bytes = 0, body = 0, fromPhone = 0;
    for (const e of es){ const t = e.initiatorType || 'other', b = e.transferSize || 0; (by[t] = by[t] || { n: 0, bytes: 0 }); by[t].n++; by[t].bytes += b; bytes += b; body += e.encodedBodySize || 0; if (!b && e.encodedBodySize) fromPhone++; }
    const big = es.map(e => ({ u: e.name.replace(location.origin, '').slice(0, 90), kb: Math.round((e.transferSize || 0)/1024), ms: Math.round(e.duration) })).sort((a, b) => b.kb - a.kb).slice(0, 10);
    return { n: es.length, kb: Math.round(bytes/1024), bodyKb: Math.round(body/1024), fromPhone, by, big, htmlMs: nav ? Math.round(nav.responseEnd) : null, redirectMs: nav ? Math.round(nav.redirectEnd) : null };
  }
  function device(){
    const c = navigator.connection || {};
    return { ua: navigator.userAgent, cores: navigator.hardwareConcurrency, memGB: navigator.deviceMemory, dpr: devicePixelRatio, inner: [innerWidth, innerHeight],
      gpu: g(() => PHONE.gpu) || null, phoneMode: g(() => PHONE.on), connection: { type: c.effectiveType, down: c.downlink, rtt: c.rtt, saveData: c.saveData } };
  }
  function store(){
    R.files = files(); R.device = device(); R.city = { plots: g(() => cells.size), built: g(() => [...cells.values()].filter(c => c.sections.length || c.mega).length) };
    try { const all = JSON.parse(localStorage.getItem(KEY) || '[]').filter(x => x.id !== R.id); all.unshift(R); localStorage.setItem(KEY, JSON.stringify(all.slice(0, 5))); } catch (e) {}
    saved = true;
  }
  function finish(){
    done = true; store();
    g(async () => { const d = navigator.userAgentData; if (d && d.getHighEntropyValues){ const h = await d.getHighEntropyValues(['model', 'platformVersion']); R.device.model = h.model; R.device.os = h.platformVersion; } });
    if (TEST) setTimeout(card, 800);
  }
  const iv = setInterval(() => { if (M.open != null && !saved){ store(); clearInterval(iv); } }, 500);

  // ?loadtest: the numbers, and Send
  const LABEL = [['scripts', 'Page and scripts read'], ['title', 'Title screen up'], ['worker', 'Plot worker ready'], ['firstPlot', 'First plot in'], ['allPlots', 'Every plot in'],
    ['people', 'People out'], ['open', 'Loading screen opened'], ['noTitle', 'Game shown (no title)']];
  function card(){
    const s = x => x == null ? '-' : (x/1000).toFixed(1) + ' s', F = R.files || {};
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top) + 12px);z-index:99999;background:rgba(6,9,20,.96);color:#cfe;border:1px solid #38e8e0;padding:12px 14px;font:13px/1.45 "JetBrains Mono",monospace;max-height:80vh;overflow:auto';
    el.innerHTML = '<b style="color:#38e8e0">LOAD TEST ' + R.id + '</b><br>' + (R.swControlled ? 'files from the phone\'s saved copy where it had them' : 'first visit (nothing saved on the phone yet)') + '<br><br>' +
      LABEL.filter(([k]) => M[k] != null).map(([k, l]) => l + ': <b>' + s(M[k]) + '</b>').join('<br>') +
      '<br><br>Downloaded ' + (F.n || 0) + ' files, ' + ((F.kb || 0)/1024).toFixed(1) + ' MB over the network' + (F.fromPhone ? ', ' + F.fromPhone + ' from the phone' : '') +
      '<br>Network: ' + (R.device.connection.type || '?') + ', ' + (R.device.connection.down || '?') + ' Mbps' +
      '<br><br><button type="button" data-a="send" style="padding:10px 16px;margin-right:8px">Send</button><button type="button" data-a="close" style="padding:10px 16px">Close</button><div data-a="st" style="margin-top:8px"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', async e => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'close') el.remove();
      if (a !== 'send') return;
      e.target.disabled = true; const st = el.querySelector('[data-a="st"]'); st.textContent = 'Sending…';
      try { const r = await fetch(SERVER + '/saves/' + USER + '/' + R.id, { method: 'PUT', body: JSON.stringify(R), headers: { 'Content-Type': 'application/json', 'X-Meta': JSON.stringify({ name: (R.device.model || 'phone').slice(0, 60), kind: 'load' }) } });
        st.textContent = r.ok ? 'Sent: ' + R.id : 'Not sent (server said ' + r.status + ')'; } catch (err) { st.textContent = 'Not sent: ' + err.message; e.target.disabled = false; }
    });
  }
})();
