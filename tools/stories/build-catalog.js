#!/usr/bin/env node
'use strict';
// Builds tools/stories/catalog.html from data/stories/*.json.
// One self-contained file: the data is embedded, so it opens straight from disk (file://).
// Usage: node tools/stories/build-catalog.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const dataDir = path.join(root, 'data', 'stories');
const vocab = JSON.parse(fs.readFileSync(path.join(dataDir, 'vocab.json'), 'utf8'));

const files = fs.readdirSync(dataDir).filter(f => /^\d\d-.*\.json$/.test(f)).sort();
const cats = files.map(f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')));

const newActions = Object.keys(vocab.actions).filter(a => vocab.actions[a].status === 'new');
const flagKey = f => { const [sc, name] = f.split(':'); return (sc === 'city' ? 'city' : sc === 'world' ? 'world' : sc.includes('+') ? 'pair' : 'single') + ':' + name; };

// flatten with defaults
const all = [];
for (const c of cats) {
  for (const s of c.storylets) {
    const when = Object.assign({ weight: 5 }, s.when || {});
    all.push(Object.assign({}, s, { category: c.category, when, unwatched: !!s.unwatched }));
  }
}
const byId = new Map(all.map(s => [s.id, s]));

// chain edges: A sets a flag that B requires; fairPlay setup -> its reveals
const setters = new Map(); // key -> [ids]
const addSet = (k, id) => { if (!setters.has(k)) setters.set(k, new Set()); setters.get(k).add(id); };
for (const s of all) {
  const n = s.next || {};
  for (const f of n.sets || []) addSet(flagKey(f), s.id);
  for (const b of n.branches || []) for (const f of b.sets || []) addSet(flagKey(f), s.id);
  for (const f of (s.effects && s.effects.flags) || []) addSet(flagKey(f), s.id);
}
const edges = []; // [from, to, label]
const seen = new Set();
const addEdge = (a, b, l) => { const k = a + '>' + b; if (a !== b && !seen.has(k)) { seen.add(k); edges.push([a, b, l]); } };
for (const s of all) {
  for (const f of (s.when && s.when.requires) || []) {
    const k = flagKey(f);
    for (const from of setters.get(k) || []) addEdge(from, s.id, f.split(':')[1]);
  }
  if (s.fairPlay && s.fairPlay.truths) for (const [truth, id] of Object.entries(s.fairPlay.truths)) if (byId.has(id)) addEdge(s.id, id, truth);
}

// connected components of the edge graph, laid out in layers
const adj = new Map();
const nodes = new Set();
for (const [a, b] of edges) { nodes.add(a); nodes.add(b); }
for (const n of nodes) adj.set(n, new Set());
for (const [a, b] of edges) { adj.get(a).add(b); adj.get(b).add(a); }
const comps = [];
const visited = new Set();
for (const n of [...nodes].sort()) {
  if (visited.has(n)) continue;
  const comp = [];
  const st = [n]; visited.add(n);
  while (st.length) { const x = st.pop(); comp.push(x); for (const y of adj.get(x)) if (!visited.has(y)) { visited.add(y); st.push(y); } }
  comps.push(comp.sort());
}
const chains = comps.map(comp => {
  const set = new Set(comp);
  const es = edges.filter(e => set.has(e[0]) && set.has(e[1]));
  // longest-path layering (graph is a DAG in practice; guard against cycles)
  const layer = {};
  comp.forEach(n => { layer[n] = 0; });
  for (let i = 0; i < comp.length + 1; i++) {
    let ch = false;
    for (const [a, b] of es) if (layer[b] < layer[a] + 1 && layer[a] + 1 <= comp.length) { layer[b] = layer[a] + 1; ch = true; }
    if (!ch) break;
  }
  return { nodes: comp, layer, edges: es, size: comp.length };
}).sort((a, b) => b.size - a.size || a.nodes[0].localeCompare(b.nodes[0]));

const data = {
  cats: cats.map(c => ({ id: c.category, title: c.title, theme: c.theme })),
  prefixes: Object.fromEntries(vocab.categories.map(c => [c.id, c.prefix])),
  tiers: vocab.tiers,
  newActions,
  actionStatus: Object.fromEntries(Object.entries(vocab.actions).map(([k, v]) => [k, v.status])),
  storylets: all,
  chains,
  generated: 'from data/stories/*.json'
};

const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Storylet catalog</title>
<style>
:root{--bg:#0e1116;--panel:#171b22;--panel2:#1d222b;--line:#2a313c;--ink:#e6e9ef;--dim:#9aa4b2;--acc:#5ce1e6;--pink:#ff5fa2;--amber:#ffc857;--green:#6ee7a0;--red:#ff6b6b;--violet:#a78bfa}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--acc)}
header{position:sticky;top:0;z-index:5;background:rgba(14,17,22,.96);border-bottom:1px solid var(--line);padding:10px 20px}
h1{margin:0 0 6px;font-size:20px;letter-spacing:.02em}
.stats{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--dim);font-size:13px;margin-bottom:8px}
.stats b{color:var(--ink)}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.controls input[type=search]{background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:7px 10px;border-radius:8px;min-width:240px}
.controls select{background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:7px 8px;border-radius:8px}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:6px 11px;border-radius:999px;cursor:pointer;font-size:13px}
.btn.on{background:var(--acc);color:#04181a;border-color:var(--acc)}
.tabs{display:flex;gap:6px;margin-left:auto}
main{max-width:1200px;margin:0 auto;padding:16px 20px 80px}
.cat{margin:28px 0 8px}
.cat h2{margin:0;font-size:22px}
.cat .theme{color:var(--dim);margin:2px 0 6px}
.cat .counts{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px;margin-top:10px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.card h3{margin:0 0 2px;font-size:16px}
.id{font:12px ui-monospace,Menlo,monospace;color:var(--dim)}
.badge{display:inline-block;font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);margin-right:4px;color:var(--dim)}
.t-mundane{color:var(--green);border-color:#2c5a43}.t-texture{color:var(--acc);border-color:#255c5e}.t-notable{color:var(--amber);border-color:#6a5420}.t-dramatic{color:var(--pink);border-color:#6b2a48}
.b-new{color:var(--violet);border-color:#4b3f80}.b-unw{color:var(--amber)}.b-amb{color:var(--pink)}
.note{color:var(--dim);margin:6px 0;font-size:13px}
.sec{margin-top:8px}
.sec>summary{cursor:pointer;color:var(--acc);font-size:13px}
.beat{margin:4px 0;font-size:13px}
.beat .do{font:12px ui-monospace,Menlo,monospace;background:var(--panel2);padding:1px 6px;border-radius:5px}
.beat .do.new{background:#2a2250;color:#cdbfff}
.beat .ind{color:var(--amber);font-size:11px}
.lines{margin:2px 0 8px 18px;padding:0;color:#cfd6e0;font-size:13px}
.lines li{margin:2px 0}
.rev{font-size:13px;margin:4px 0}
.rev .ch{font:11px ui-monospace,monospace;padding:0 6px;border-radius:5px;background:var(--panel2)}
.ver{color:var(--green)}.unc{color:var(--amber)}
.kv{font-size:12px;color:var(--dim);margin-top:6px}
.kv code{background:var(--panel2);padding:0 5px;border-radius:4px;color:var(--ink)}
.hidden{display:none!important}
.chain{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin:14px 0;padding:12px 14px;overflow:auto}
.chain h3{margin:0 0 8px;font-size:15px}
svg text{font:12px ui-monospace,Menlo,monospace;fill:#e6e9ef}
svg .lbl{fill:#9aa4b2;font-size:11px}
.node{cursor:pointer}
.empty{color:var(--dim);padding:30px 0}
</style>
</head>
<body>
<header>
  <h1>Storylet catalog</h1>
  <div class="stats" id="stats"></div>
  <div class="controls">
    <input type="search" id="q" placeholder="Search titles, notes, ids, log lines">
    <select id="cat"><option value="">All categories</option></select>
    <span id="tiers"></span>
    <button class="btn" id="newonly" title="Only storylets that use actions the game does not have yet">New actions only</button>
    <button class="btn" id="expand">Expand all</button>
    <span class="tabs"><button class="btn on" id="tab-cat">Categories</button><button class="btn" id="tab-chain">Chains</button></span>
  </div>
</header>
<main>
  <div id="view-cat"></div>
  <div id="view-chain" class="hidden"></div>
</main>
<script id="data" type="application/json">${json}</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById('data').textContent);
  var S = D.storylets;
  var tierOn = {}; D.tiers.forEach(function(t){ tierOn[t] = true; });
  var newOnly = false, query = '', catSel = '';

  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function isNewBeat(b){ return D.actionStatus[b.do] === 'new'; }
  function usesNew(s){ return (s.beats||[]).some(isNewBeat); }
  function titleOf(c){ return c.title; }

  function countsByTier(list){ var o = {}; D.tiers.forEach(function(t){ o[t] = 0; }); list.forEach(function(s){ o[s.tier]++; }); return o; }

  function renderStats(){
    var st = document.getElementById('stats'); st.textContent = '';
    var t = countsByTier(S);
    var parts = ['<b>' + S.length + '</b> storylets', '<b>' + D.cats.length + '</b> categories'];
    D.tiers.forEach(function(x){ parts.push('<b>' + t[x] + '</b> ' + x); });
    parts.push('<b>' + S.filter(function(s){ return s.unwatched; }).length + '</b> unwatched (hearsay)');
    parts.push('<b>' + S.filter(usesNew).length + '</b> use new actions');
    parts.push('<b>' + D.chains.length + '</b> chains');
    st.innerHTML = parts.join(' · ');
  }

  function renderTierButtons(){
    var box = document.getElementById('tiers'); box.textContent = '';
    D.tiers.forEach(function(t){
      var b = el('button', 'btn on', t); b.dataset.t = t;
      b.onclick = function(){ tierOn[t] = !tierOn[t]; b.classList.toggle('on', tierOn[t]); renderCats(); };
      box.appendChild(b); box.appendChild(document.createTextNode(' '));
    });
  }

  function fillCatSelect(){
    var sel = document.getElementById('cat');
    D.cats.forEach(function(c){ var o = el('option', null, titleOf(c)); o.value = c.id; sel.appendChild(o); });
    sel.onchange = function(){ catSel = sel.value; renderCats(); };
  }

  function haystack(s){
    var parts = [s.id, s.title, s.note || ''];
    Object.keys(s.log||{}).forEach(function(k){ parts = parts.concat(s.log[k]); });
    (s.reveals||[]).forEach(function(r){ parts = parts.concat(r.log||[]); });
    if (s.hearsay) parts = parts.concat(s.hearsay.lines||[], s.hearsay.entry||[]);
    return parts.join(' \\n ').toLowerCase();
  }
  S.forEach(function(s){ s._h = haystack(s); });

  function matches(s){
    if (!tierOn[s.tier]) return false;
    if (catSel && s.category !== catSel) return false;
    if (newOnly && !usesNew(s)) return false;
    if (query && s._h.indexOf(query) < 0) return false;
    return true;
  }

  function whenText(w){
    var o = [];
    if (w.hours) o.push(w.hours[0] + ':00 to ' + w.hours[1] + ':00');
    if (w.days && w.days !== 'any') o.push(w.days);
    if (w.weather && w.weather !== 'any') o.push(w.weather);
    if (w.at) o.push('at ' + w.at.join(', '));
    o.push('weight ' + w.weight);
    return o.join(' · ');
  }

  function chip(label, val){ var s = el('span', 'badge'); s.textContent = label + ' ' + val; return s; }

  function card(s){
    var c = el('div', 'card'); c.id = s.id;
    var h = el('h3'); h.textContent = s.title; c.appendChild(h);
    var meta = el('div');
    var tb = el('span', 'badge t-' + s.tier, s.tier); meta.appendChild(tb);
    if (s.unwatched) meta.appendChild(el('span', 'badge b-unw', 'unwatched'));
    if (s.ambiguous) meta.appendChild(el('span', 'badge b-amb', 'ambiguous setup'));
    if (s.resolves) meta.appendChild(el('span', 'badge b-amb', 'reveals: ' + s.resolves.truth));
    if (usesNew(s)) meta.appendChild(el('span', 'badge b-new', 'new action'));
    var idl = el('span', 'id', s.id); meta.appendChild(idl);
    c.appendChild(meta);
    if (s.note) c.appendChild(el('div', 'note', s.note));

    var roles = Object.keys(s.roles||{}).map(function(r){ var x = s.roles[r]; return r + ': ' + (x.desc || '') + (x.rel ? ' (' + x.rel + ')' : ''); });
    var rd = el('div', 'kv'); rd.textContent = roles.join(' | '); c.appendChild(rd);
    var wd = el('div', 'kv'); wd.textContent = whenText(s.when); c.appendChild(wd);

    var d1 = el('details', 'sec'); d1.appendChild(el('summary', null, 'Beats and live log (' + (s.beats||[]).length + ' beats)'));
    (s.beats||[]).forEach(function(b){
      var row = el('div', 'beat');
      var who = [].concat(b.who).join('+') + (b.with ? ' with ' + b.with.join('+') : '');
      var doe = el('span', 'do' + (isNewBeat(b) ? ' new' : ''), b.do); row.appendChild(doe);
      row.appendChild(document.createTextNode(' ' + who + ' at ' + b.at + ' '));
      if (b.indoors) row.appendChild(el('span', 'ind', 'SIGNAL LOST'));
      d1.appendChild(row);
      var lines = (s.log||{})[b.id];
      if (lines && lines.length){ var ul = el('ul', 'lines'); lines.forEach(function(l){ ul.appendChild(el('li', null, l)); }); d1.appendChild(ul); }
    });
    c.appendChild(d1);

    if ((s.reveals||[]).length){
      var d2 = el('details', 'sec'); d2.appendChild(el('summary', null, 'Reveals (' + s.reveals.length + ')'));
      s.reveals.forEach(function(r){
        var row = el('div', 'rev');
        var verified = r.channel === 'document' || r.channel === 'introduction';
        row.appendChild(el('span', 'ch ' + (verified ? 'ver' : 'unc'), r.channel + (verified ? ' (verified)' : ' (unconfirmed)')));
        row.appendChild(document.createTextNode(' ' + r.fact + ' at ' + r.beat + ', chance ' + r.chance));
        d2.appendChild(row);
        var ul = el('ul', 'lines'); (r.log||[]).forEach(function(l){ ul.appendChild(el('li', null, l)); }); d2.appendChild(ul);
      });
      c.appendChild(d2);
    }
    if (s.hearsay){
      var d3 = el('details', 'sec'); d3.appendChild(el('summary', null, 'Hearsay (' + (s.hearsay.lines||[]).length + ' lines, ' + (s.hearsay.entry||[]).length + ' entries)'));
      d3.appendChild(el('div', 'kv', 'About ' + s.hearsay.about + ', told by ' + s.hearsay.speakers.join(', ')));
      var u1 = el('ul', 'lines'); (s.hearsay.lines||[]).forEach(function(l){ u1.appendChild(el('li', null, l)); }); d3.appendChild(u1);
      d3.appendChild(el('div', 'kv', 'Notebook entries on the absent person:'));
      var u2 = el('ul', 'lines'); (s.hearsay.entry||[]).forEach(function(l){ u2.appendChild(el('li', null, l)); }); d3.appendChild(u2);
      c.appendChild(d3);
    }
    var kv = el('div', 'kv'); var bits = [];
    if (s.when.requires) bits.push('needs <code>' + s.when.requires.join('</code> <code>') + '</code>');
    var n = s.next || {};
    var sets = (n.sets||[]).slice();
    (n.branches||[]).forEach(function(b){ if (b.fizzle) bits.push('fizzle: ' + b.label + ' (' + b.w + '%)'); else bits.push('branch: ' + b.label + ' (' + b.w + '%)' + ((b.sets||[]).length ? ' sets <code>' + b.sets.join('</code> <code>') + '</code>' : '')); });
    if (sets.length) bits.push('sets <code>' + sets.join('</code> <code>') + '</code>');
    if (s.effects && s.effects.life) bits.push('life change: <code>' + s.effects.life + '</code>');
    if (s.fairPlay) bits.push('truths: ' + Object.keys(s.fairPlay.truths).map(function(k){ return '<a href="#' + s.fairPlay.truths[k] + '">' + k + '</a>'; }).join(', '));
    if (s.resolves) bits.push('settles <a href="#' + s.resolves.setup + '">' + s.resolves.setup + '</a> as ' + s.resolves.truth);
    if (bits.length){ kv.innerHTML = bits.join('<br>'); c.appendChild(kv); }
    return c;
  }

  var allOpen = false;
  function renderCats(){
    var root = document.getElementById('view-cat'); root.textContent = '';
    var shown = 0;
    D.cats.forEach(function(cat){
      var list = S.filter(function(s){ return s.category === cat.id; });
      var vis = list.filter(matches);
      if (!vis.length) return;
      shown += vis.length;
      var sec = el('section', 'cat');
      sec.appendChild(el('h2', null, cat.title + ' (' + vis.length + (vis.length !== list.length ? ' of ' + list.length : '') + ')'));
      sec.appendChild(el('div', 'theme', cat.theme));
      var ct = countsByTier(list); var cc = el('div', 'counts');
      D.tiers.forEach(function(t){ cc.appendChild(el('span', 'badge t-' + t, t + ' ' + ct[t])); });
      cc.appendChild(el('span', 'badge', 'prefix ' + D.prefixes[cat.id]));
      sec.appendChild(cc);
      var g = el('div', 'grid'); vis.forEach(function(s){ g.appendChild(card(s)); }); sec.appendChild(g);
      root.appendChild(sec);
    });
    if (!shown) root.appendChild(el('div', 'empty', 'Nothing matches those filters.'));
    if (allOpen) Array.prototype.forEach.call(root.querySelectorAll('details'), function(d){ d.open = true; });
  }

  function chainView(){
    var root = document.getElementById('view-chain'); root.textContent = '';
    root.appendChild(el('p', 'note', 'Each box is a storylet. An arrow means the first sets a flag the second needs (or, for an ambiguous setup, the second settles one of its truths). Click a box to jump to its card.'));
    var byId = {}; S.forEach(function(s){ byId[s.id] = s; });
    D.chains.forEach(function(ch, i){
      var wrap = el('div', 'chain');
      var first = byId[ch.nodes[0]];
      wrap.appendChild(el('h3', null, 'Chain ' + (i + 1) + ': ' + ch.size + ' storylets'));
      var layers = {}; var maxL = 0;
      ch.nodes.forEach(function(n){ var l = ch.layer[n]; (layers[l] = layers[l] || []).push(n); if (l > maxL) maxL = l; });
      var colW = 250, rowH = 44, boxW = 220, boxH = 30, pad = 12;
      var maxRows = 0; Object.keys(layers).forEach(function(k){ if (layers[k].length > maxRows) maxRows = layers[k].length; });
      var W = (maxL + 1) * colW + pad, H = maxRows * rowH + pad * 2;
      var pos = {};
      Object.keys(layers).forEach(function(k){ layers[k].sort().forEach(function(n, r){ pos[n] = { x: pad + k * colW, y: pad + r * rowH }; }); });
      var ns = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H);
      var defs = document.createElementNS(ns, 'defs');
      defs.innerHTML = '<marker id="ar' + i + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5ce1e6"/></marker>';
      svg.appendChild(defs);
      ch.edges.forEach(function(e){
        var a = pos[e[0]], b = pos[e[1]];
        var x1 = a.x + boxW, y1 = a.y + boxH / 2, x2 = b.x, y2 = b.y + boxH / 2;
        var p = document.createElementNS(ns, 'path');
        p.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + (x1 + 20) + ',' + y1 + ' ' + (x2 - 20) + ',' + y2 + ' ' + x2 + ',' + y2);
        p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#5ce1e6'); p.setAttribute('stroke-width', '1.4'); p.setAttribute('marker-end', 'url(#ar' + i + ')');
        svg.appendChild(p);
        var t = document.createElementNS(ns, 'text'); t.setAttribute('class', 'lbl');
        t.setAttribute('x', (x1 + x2) / 2 - 10); t.setAttribute('y', (y1 + y2) / 2 - 4); t.textContent = e[2] || '';
        svg.appendChild(t);
      });
      var tierCol = { mundane: '#2c5a43', texture: '#255c5e', notable: '#6a5420', dramatic: '#6b2a48' };
      ch.nodes.forEach(function(n){
        var s = byId[n]; var p = pos[n];
        var g = document.createElementNS(ns, 'g'); g.setAttribute('class', 'node');
        var r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', p.x); r.setAttribute('y', p.y); r.setAttribute('width', boxW); r.setAttribute('height', boxH); r.setAttribute('rx', 7);
        r.setAttribute('fill', '#1d222b'); r.setAttribute('stroke', tierCol[s.tier] || '#2a313c'); r.setAttribute('stroke-width', '2');
        g.appendChild(r);
        var tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', p.x + 8); tx.setAttribute('y', p.y + 19);
        tx.textContent = s.id.length > 27 ? s.id.slice(0, 26) + '…' : s.id;
        g.appendChild(tx);
        var tt = document.createElementNS(ns, 'title'); tt.textContent = s.title + ' (' + s.tier + ')'; g.appendChild(tt);
        g.addEventListener('click', function(){ showTab('cat'); catSel = ''; document.getElementById('cat').value = ''; query = ''; document.getElementById('q').value = ''; renderCats(); var c = document.getElementById(n); if (c){ c.scrollIntoView({block: 'center'}); c.style.outline = '2px solid #5ce1e6'; } });
        svg.appendChild(g);
      });
      wrap.appendChild(svg);
      root.appendChild(wrap);
    });
    var inChain = {}; D.chains.forEach(function(ch){ ch.nodes.forEach(function(n){ inChain[n] = 1; }); });
    root.appendChild(el('p', 'note', S.length - Object.keys(inChain).length + ' storylets stand alone, with no flag in or out.'));
  }

  function showTab(w){
    document.getElementById('view-cat').classList.toggle('hidden', w !== 'cat');
    document.getElementById('view-chain').classList.toggle('hidden', w !== 'chain');
    document.getElementById('tab-cat').classList.toggle('on', w === 'cat');
    document.getElementById('tab-chain').classList.toggle('on', w === 'chain');
    if (w === 'chain' && !document.getElementById('view-chain').firstChild) chainView();
  }

  document.getElementById('q').addEventListener('input', function(e){ query = e.target.value.trim().toLowerCase(); renderCats(); });
  document.getElementById('newonly').onclick = function(){ newOnly = !newOnly; this.classList.toggle('on', newOnly); renderCats(); };
  document.getElementById('expand').onclick = function(){ allOpen = !allOpen; this.textContent = allOpen ? 'Collapse all' : 'Expand all'; Array.prototype.forEach.call(document.querySelectorAll('#view-cat details'), function(d){ d.open = allOpen; }); };
  document.getElementById('tab-cat').onclick = function(){ showTab('cat'); };
  document.getElementById('tab-chain').onclick = function(){ showTab('chain'); };

  renderStats(); renderTierButtons(); fillCatSelect(); renderCats();
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'catalog.html'), html);
console.log('wrote tools/stories/catalog.html: ' + all.length + ' storylets, ' + chains.length + ' chains, ' + (html.length / 1024).toFixed(0) + ' KB');
