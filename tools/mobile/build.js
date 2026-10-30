// Neon Terrarium: the phone page (m.html) and its smaller scripts (min/js/). Phones and tablets only: a computer never loads either.
// index.html sends a touch screen to m.html (the first lines of its head). m.html is index.html with every game script swapped for a
// copy in min/js/ with the comments and spaces taken out and the names inside functions shortened (terser). The code does the same
// thing; it's about a third smaller to download and quicker for the phone to read. The top-level names are kept, so the scripts still
// share one scope exactly as on the computer page.
//
// Run it after changing index.html or any script it loads:   npm i --no-save terser@5.51.2 && node tools/mobile/build.js
// (the "mobile build" GitHub Action runs it on every push to main and commits what changed, so a forgotten run is put right within a few minutes)
// Checking only (exit 1 when m.html or min/ is out of date):  node tools/mobile/build.js --check
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { minify } = require('terser');
const ROOT = path.resolve(__dirname, '../..'), CHECK = process.argv.includes('--check');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MARK = '<!-- phone page: made from index.html by tools/mobile/build.js; do not edit, edit index.html and run the build -->';
(async () => {
  let html = rd('index.html'), stale = [];
  const want = new Map();
  // every game script of the page: <script src="js/NAME.js?v=...">
  html = html.replace(/<script src="js\/([\w.-]+\.js)(\?v=[^"]*)?"><\/script>/g, (m, f, v) => { want.set(f, true); return '<script src="min/js/' + f + (v || '') + '"></script>'; });
  // the computer's way in: a computer that opens m.html goes back to index.html (the reverse of index.html's own first lines)
  html = html.replace(/<script>\/\* phone page \*\/[\s\S]*?<\/script>\n/, '');   // (index.html's way in: m.html is where every player plays)
  html = html.replace(/<!-- every player goes to m\.html[^>]*-->\n/, '');
  html = html.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n' + MARK + '\n');
  // the fonts' stylesheet doesn't hold up the first paint on a phone (it's on another site: on a slow first visit the page stayed blank waiting for it)
  html = html.replace(/<link href="(https:\/\/fonts\.googleapis\.com\/[^"]+)" rel="stylesheet">/, '<link href="$1" rel="stylesheet" media="print" onload="this.media=\'all\'">');
  // the phone page's own extra: the load timeline (js/loadtrace.js), straight after touch.js
  want.set('loadtrace.js', true);
  html = html.replace(/(<script src="min\/js\/touch\.js[^"]*"><\/script>)/, '$1\n<script src="min/js/loadtrace.js"></script>   <!-- how long this load took, stage by stage -->');
  const out = new Map([['m.html', html]]);
  for (const f of want.keys()){
    const src = rd('js/' + f);
    const r = await minify(src, { compress: false, mangle: { toplevel: false }, format: { comments: false, ascii_only: false } });
    if (!r.code) throw new Error('terser: nothing for ' + f);
    out.set('min/js/' + f, '/* ' + f + ', smaller (tools/mobile/build.js) */\n' + r.code + '\n');
  }
  // the plot worker: recipe.js starts it from its own address (recipe.js -> recipeworker.js, so min/js/recipeworker.js with recipe.js's ?v=).
  // Its fingerprint goes at the end of recipe.js, so a change to the worker alone still changes recipe.js's ?v=
  { const w = await minify(rd('js/recipeworker.js'), { compress: false, mangle: { toplevel: false }, format: { comments: false } });
    const ws = '/* recipeworker.js, smaller (tools/mobile/build.js) */\n' + w.code + '\n'; out.set('min/js/recipeworker.js', ws);
    out.set('min/js/recipe.js', out.get('min/js/recipe.js') + '/* worker ' + crypto.createHash('sha1').update(ws).digest('hex').slice(0, 10) + ' */\n'); }
  // each script's ?v= is its own content's fingerprint, so a phone (and its saved copy, sw.js) never keeps an old one, ?v bumped or not
  html = html.replace(/<script src="min\/js\/([\w.-]+\.js)(\?v=[^"]*)?"><\/script>/g, (m, f) => '<script src="min/js/' + f + '?v=' + crypto.createHash('sha1').update(out.get('min/js/' + f)).digest('hex').slice(0, 10) + '"></script>');
  html = html.replace('<html lang="en">', '<html lang="en" data-nscripts="' + (html.match(/<script src="min\/js\//g) || []).length + '">');
  out.set('m.html', html);
  // what's there now
  const dir = path.join(ROOT, 'min/js'), have = fs.existsSync(dir) ? fs.readdirSync(dir).map(n => 'min/js/' + n) : [];
  for (const [p, s] of out){ const at = path.join(ROOT, p); if (!fs.existsSync(at) || fs.readFileSync(at, 'utf8') !== s) stale.push(p); }
  const extra = have.filter(p => !out.has(p));
  if (CHECK){ if (stale.length || extra.length){ console.log('out of date:', stale.concat(extra.map(p => p + ' (no longer used)')).join(', ')); process.exit(1); } console.log('m.html and min/js are up to date'); return; }
  fs.mkdirSync(dir, { recursive: true });
  for (const p of stale) fs.writeFileSync(path.join(ROOT, p), out.get(p));
  for (const p of extra) fs.unlinkSync(path.join(ROOT, p));
  let a = 0, b = 0; for (const f of [...want.keys(), 'recipeworker.js']){ a += fs.statSync(path.join(ROOT, 'js/' + f)).size; b += Buffer.byteLength(out.get('min/js/' + f)); }
  console.log('m.html and ' + want.size + ' scripts: ' + (a/1e6).toFixed(2) + ' MB -> ' + (b/1e6).toFixed(2) + ' MB' + (stale.length ? ', ' + stale.length + ' written' : ', nothing changed') + (extra.length ? ', ' + extra.length + ' removed' : ''));
})().catch(e => { console.error(e); process.exit(1); });
