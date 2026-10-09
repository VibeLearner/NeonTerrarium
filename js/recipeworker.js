// The plot worker (round 9, item 2): makes plots from their recipes (recipe.js) off the page's thread. It loads the game's own builder scripts, the same files in the same
// order as index.html (no second copy of any builder), with just enough stood in for the page (a document, a renderer, texture loading) for them to load. Nothing
// here draws. Messages in: init {urls}, world {hw, mt}, gen {id, r, far, rs}; out: ready {sig}, done {id, msg, calls, rs}, err {id, err}.
(() => {   // (in a function: the game's scripts declare names like world and post of their own, in the same global scope)
const mk = name => { const f = function(){ return mk(name + '()'); }; return new Proxy(f, { get(t, k){ if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; if (k === 'length') return 0; if (k === 'style') return {}; return mk(name + '.' + String(k)); }, set(){ return true; }, apply(){ return mk(name + '()'); }, construct(){ return mk('new ' + name); } }); };
const nativeRandom = Math.random; let rs = null, calls = 0;
self.__uuidRand = nativeRandom;
// (the page's tests seed Math.random; when a request carries a state, the stream is the page's own, so a test can compare byte for byte)
Math.random = () => { calls++; if (rs === null) return nativeRandom(); rs |= 0; rs = rs + 0x6D2B79F5 | 0; let t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
self.IN_RECIPE_WORKER = true;
self.window = self;
self.document = { getElementById: () => ({ getContext: () => null, addEventListener(){}, style: {}, width: 1, height: 1 }), createElement: t => t === 'canvas' ? new OffscreenCanvas(32, 32) : mk('el'), addEventListener(){}, body: mk('body'), documentElement: mk('de'), querySelector: () => mk('q'), querySelectorAll: () => [], currentScript: null, scripts: [] };
OffscreenCanvas.prototype.toDataURL = function(){ return 'data:,'; };
self.matchMedia = () => ({ matches: false, addEventListener(){} });
self.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
self.Image = function(){ return mk('img'); };
self.requestAnimationFrame = () => 0; self.devicePixelRatio = 1; self.innerWidth = 1280; self.innerHeight = 720;
self.PH = { tests: {} };   // (perfhud.js is the page's)
let world = null, rbKnown = new Set();
const post = (m, x) => self.postMessage(m, x || []);
self.onmessage = e => {
  const m = e.data;
  try {
    if (m.t === 'init'){
      importScripts(m.three);
      THREE.WebGLRenderer = function(){ new THREE.Material(); new THREE.Material(); return mk('renderer'); };   // (the real renderer makes its two shadow-pass materials, which take two of three's ids; builders use a material's id (industrial window colors), so the ids must agree)
      THREE.TextureLoader = class { load(){ return new THREE.Texture(); } };
      for (const u of m.urls) importScripts(u);
      post({ t: 'ready', sig: recipeMatSig() });
    } else if (m.t === 'world'){
      world = recipeWorldOf(m.hw, m.mt);
    } else if (m.t === 'gen'){
      PH.tests.leanRound = m.far.lean; PH.tests.thinSticks = m.far.sticks;
      for (const [k, e] of m.rb){ rbCache.set(k, rbUnpack(e)); rbKnown.add(k); }   // (the page's shapes win: see recipe.js)
      rs = m.rs === undefined ? null : m.rs; calls = 0;
      let out;
      try { out = recipePack(recipeGen(m.r, world), !!m.regen); } catch (err){ post({ t: 'err', id: m.id, err: String(err && err.message || err) }); return; }
      const end = rs; rs = null;
      const rb = []; for (const [k, g] of rbCache) if (!rbKnown.has(k)){ rbKnown.add(k); rb.push([k, rbPack(g, true)]); }
      post({ t: 'done', id: m.id, msg: out.msg, calls, rs: end, rb }, out.xfer.concat(rb.flatMap(([k, e]) => Object.values(e.a).map(x => x.a.buffer).concat(e.i ? [e.i.buffer] : []))));
    }
  } catch (err){ post({ t: 'err', id: m.id, err: String(err && err.stack || err) }); }
};
})();
