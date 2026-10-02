// Neon Terrarium: Sprites: plants, laundry and signs drawn as pixel billboards from one texture atlas, plus glows.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- foliage billboards (Retro Diffusion sprites, shrunk to true pixel size) ---------- */
// Sprite images live in assets/sprites/<name>.png (true pixel size). size is [width, height] in pixels;
// anchor is where the sprite hangs from: 0 bottom, 1 top, .5 centre.
const SPR = {"size":{"bush":[20,17],"bushFlower":[20,17],"moss":[16,13],"bonsai":[17,22],"bamboo":[13,35],"vines":[15,43],"pothos":[14,39],"fern":[20,18],"succulent":[8,11],"g_clover":[39,15],"h_ivy":[35,31],"w_tangle":[31,26],"g_fern2":[30,21],"g_moss2":[28,15],"g_fern3":[38,20],"g_cover":[42,14],"l_mossroots":[28,22],"h_vine3":[18,30],"h_curtain3":[31,31],"g_flowers":[41,15],"h_curtain1":[34,29],"g_spread1":[42,23],"g_spread2":[42,24],"h_heart":[36,28],"h_curtain2":[34,26],"sign_ramen_pink":[30,25],"sign_ramen_cyan":[30,25],"sign_ramen_amber":[30,25],"sign_coffee_pink":[30,24],"sign_coffee_cyan":[30,24],"sign_coffee_amber":[30,24],"sign_laundry_pink":[30,24],"sign_laundry_cyan":[30,24],"sign_laundry_amber":[30,24],"sign_noodles_pink":[30,25],"sign_noodles_cyan":[30,25],"sign_noodles_amber":[30,25],"sign_plant_pink":[30,25],"sign_plant_cyan":[30,25],"sign_plant_amber":[30,25],"sign_repair_pink":[30,23],"sign_repair_cyan":[30,23],"sign_repair_amber":[30,23],"sign_cocktail_pink":[30,28],"sign_cocktail_cyan":[30,28],"sign_cocktail_amber":[30,28],"sign_music_pink":[30,28],"sign_music_cyan":[30,28],"sign_music_amber":[30,28],"sign_arcade_pink":[30,29],"sign_arcade_cyan":[30,29],"sign_arcade_amber":[30,29],"sign_clinic_pink":[30,26],"sign_clinic_cyan":[30,26],"sign_clinic_amber":[30,26],"sign_books_pink":[30,23],"sign_books_cyan":[30,23],"sign_books_amber":[30,23],"sign_hotel_pink":[30,22],"sign_hotel_cyan":[30,22],"sign_hotel_amber":[30,22],"sign_records_pink":[30,28],"sign_records_cyan":[30,28],"sign_records_amber":[30,28],"sign_bakery_pink":[30,22],"sign_bakery_cyan":[30,22],"sign_bakery_amber":[30,22],"sign_games_pink":[30,22],"sign_games_cyan":[30,22],"sign_games_amber":[30,22],"l_tee_blue":[9,8],"l_tee_peach":[9,8],"l_tee_rose":[9,8],"l_tee_sage":[9,8],"l_tee_butter":[9,8],"l_tee_lilac":[9,8],"l_jeans":[8,10],"l_socks":[8,6],"l_towel_cream":[9,10],"l_towel_green":[10,9],"l_shirt_pink":[9,10],"l_shirt_blue":[9,10],"sign_police":[40,50]},"anchor":{"bush":0,"bushFlower":0,"moss":0,"bonsai":0,"bamboo":0,"vines":0,"pothos":0,"fern":0,"succulent":0,"g_clover":0,"h_ivy":1,"w_tangle":0.5,"g_fern2":0,"g_moss2":0,"g_fern3":0,"g_cover":0,"l_mossroots":0.55,"h_vine3":1,"h_curtain3":1,"g_flowers":0,"h_curtain1":1,"g_spread1":0,"g_spread2":0,"h_heart":1,"h_curtain2":1,"sign_ramen_pink":0.5,"sign_ramen_cyan":0.5,"sign_ramen_amber":0.5,"sign_coffee_pink":0.5,"sign_coffee_cyan":0.5,"sign_coffee_amber":0.5,"sign_laundry_pink":0.5,"sign_laundry_cyan":0.5,"sign_laundry_amber":0.5,"sign_noodles_pink":0.5,"sign_noodles_cyan":0.5,"sign_noodles_amber":0.5,"sign_plant_pink":0.5,"sign_plant_cyan":0.5,"sign_plant_amber":0.5,"sign_repair_pink":0.5,"sign_repair_cyan":0.5,"sign_repair_amber":0.5,"sign_cocktail_pink":0.5,"sign_cocktail_cyan":0.5,"sign_cocktail_amber":0.5,"sign_music_pink":0.5,"sign_music_cyan":0.5,"sign_music_amber":0.5,"sign_arcade_pink":0.5,"sign_arcade_cyan":0.5,"sign_arcade_amber":0.5,"sign_clinic_pink":0.5,"sign_clinic_cyan":0.5,"sign_clinic_amber":0.5,"sign_books_pink":0.5,"sign_books_cyan":0.5,"sign_books_amber":0.5,"sign_hotel_pink":0.5,"sign_hotel_cyan":0.5,"sign_hotel_amber":0.5,"sign_records_pink":0.5,"sign_records_cyan":0.5,"sign_records_amber":0.5,"sign_bakery_pink":0.5,"sign_bakery_cyan":0.5,"sign_bakery_amber":0.5,"sign_games_pink":0.5,"sign_games_cyan":0.5,"sign_games_amber":0.5,"l_tee_blue":1,"l_tee_peach":1,"l_tee_rose":1,"l_tee_sage":1,"l_tee_butter":1,"l_tee_lilac":1,"l_jeans":1,"l_socks":1,"l_towel_cream":1,"l_towel_green":1,"l_shirt_pink":1,"l_shirt_blue":1,"sign_police":0.5}};
SPR.img = {}; for (const k in SPR.size) SPR.img[k] = 'assets/sprites/' + k + '.png';
const PX = 18; // sprite pixels per world unit at the default 480p zoom, so one sprite pixel is about one screen pixel
const FOL_UNI = { tint:{ value:new THREE.Color(1,1,1) }, time:{ value:0 }, normalMode:{ value:0 }, neonI:{ value:1 }, res:{ value:new THREE.Vector2(480,270) }, wind:{ value:1 } };
const FOL_MAT = {}, FOL_LIST = {};
// Flickering lights: a few neon tubes, signs, lamps and windows are on their way out. Each has its own id; most
// of the time it burns steady, then every so often it stutters through a short episode of cutting out and
// half-dropping, at its own rhythm. Everything else (id 0) never flickers. Used by buildings, signs and glows.
const FLK_GLSL = `
  float flkH(float n){ return fract(fract(n*0.1031)*(n*0.1031 + 33.33)*(fract(n*0.1031) + 19.19)); }
  float flicker(float id, float t){
    if (id < 0.5) return 1.0;
    bool heavy = id > 199.5;                               // a dying light on a dark street
    float rate = heavy ? 0.2 + flkH(id*3.1)*0.25 : 0.04 + flkH(id*3.1)*0.09;   // how often its episodes come round
    float ep = fract(t*rate + flkH(id*7.7));
    float len = heavy ? 0.5 + flkH(id*5.3)*0.35 : 0.12 + flkH(id*5.3)*0.16;   // how much of the cycle it spends misbehaving
    if (ep > len) return heavy ? 0.75 : 1.0;
    float k = floor(t*(9.0 + flkH(id*1.9)*16.0));         // stutter speed
    float r = flkH(k*1.37 + id*11.0);
    if (heavy) return r < 0.55 ? 0.02 : (r < 0.7 ? 0.35 : 0.9);
    return r < 0.42 ? 0.1 : (r < 0.58 ? 0.5 : 1.0);
  }`;
const texLoader = new THREE.TextureLoader();
// how each sprite moves in the wind: 0 still, 1 laundry flapping from its line, 2 hanging greenery swinging from the top, 3 plants leaning at the tips
function swayTypeFor(kind){
  if (kind.startsWith('sign_') || kind.startsWith('glyph_') || kind.startsWith('graf_') || kind === 'w_tangle') return 0;
  if (kind.startsWith('l_') && kind !== 'l_mossroots') return 1;
  if (kind === 'vines' || kind === 'pothos' || kind === 'l_mossroots' || kind.startsWith('h_')) return 2;
  return 3;
}
// Lit box signs with blocky pixel lettering, drawn in code at true pixel size.
// Two styles: a lit panel with dark or white letters, and a dark panel with neon letters.
const GLYPH_V = [], GLYPH_H = [], GLYPH_GLOW = {};
(function genGlyphSigns(){
  const rr = mulberry32(4242);
  const LIT = [['#e8423a','#ffffff','pink'],['#ffd23f','#2a1a10','amber'],['#38e8e0','#0b1a2a','cyan'],['#ff4fa3','#ffffff','pink'],
               ['#f4f1ea','#d8323a','warm'],['#5ab8ff','#ffffff','cyan'],['#ffb347','#3a1a08','amber'],['#9dff6a','#10240a','cyan']];
  const NEON = [['#ff4fa3','pink'],['#38e8e0','cyan'],['#ffb347','amber'],['#ff6a5a','pink'],['#b18cff','pink']];
  function glyph(g, x0, y0, col){           // one 5x5 pseudo-character from a few strokes
    g.fillStyle = col;
    const strokes = 2 + Math.floor(rr()*3);
    for (let k=0;k<strokes;k++){
      const t = rr();
      if (t < .38) g.fillRect(x0, y0+Math.floor(rr()*5), 5, 1);
      else if (t < .76) g.fillRect(x0+Math.floor(rr()*5), y0, 1, 5);
      else if (t < .9) { g.fillRect(x0+1, y0+1, 3, 1); g.fillRect(x0+1, y0+3, 3, 1); g.fillRect(x0+2, y0+1, 1, 3); }
      else { g.fillRect(x0, y0, 5, 1); g.fillRect(x0, y0+4, 5, 1); g.fillRect(x0, y0, 1, 5); g.fillRect(x0+4, y0, 1, 5); }
    }
  }
  function make(vertical, i){
    const lit = rr() < .6, nGl = vertical ? 2+Math.floor(rr()*3) : 3+Math.floor(rr()*3);
    const w = vertical ? 7 : 2+nGl*6, h = vertical ? 2+nGl*6 : 7;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); let glowName;
    if (lit){
      const [bg, fg, gn] = LIT[Math.floor(rr()*LIT.length)]; glowName = gn;
      g.fillStyle = '#1c2029'; g.fillRect(0,0,w,h);
      g.fillStyle = bg; g.fillRect(1,1,w-2,h-2);
      for (let j=0;j<nGl;j++) vertical ? glyph(g, 1, 2+j*6, fg) : glyph(g, 2+j*6, 1, fg);
    } else {
      const [col, gn] = NEON[Math.floor(rr()*NEON.length)]; glowName = gn;
      g.fillStyle = '#141a30'; g.fillRect(0,0,w,h);
      g.fillStyle = col; g.fillRect(0,0,w,1); g.fillRect(0,h-1,w,1); g.fillRect(0,0,1,h); g.fillRect(w-1,0,1,h);
      for (let j=0;j<nGl;j++) vertical ? glyph(g, 1, 2+j*6, col) : glyph(g, 2+j*6, 1, col);
    }
    const kind = (vertical ? 'glyph_v' : 'glyph_h') + i;
    SPR.img[kind] = c.toDataURL(); SPR.size[kind] = [w,h]; SPR.anchor[kind] = .5;
    GLYPH_GLOW[kind] = glowName;
    (vertical ? GLYPH_V : GLYPH_H).push(kind);
  }
  for (let i=0;i<14;i++) make(true, i);
  for (let i=0;i<14;i++) make(false, i);
})();
// The radio station's red ON AIR sign, drawn in a 3x5 pixel font
(function onAirSign(){
  const F = { O:['111','101','101','101','111'], N:['1001','1101','1011','1001','1001'], A:['010','101','111','101','101'], I:['111','010','010','010','111'], R:['110','101','110','101','101'], ' ':['0','0','0','0','0'] };
  const text = 'ON AIR', w = 4 + [...text].reduce((s, ch) => s + F[ch][0].length + 1, -1), h = 9;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#1a0c12'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff3b3b'; g.fillRect(0,0,w,1); g.fillRect(0,h-1,w,1); g.fillRect(0,0,1,h); g.fillRect(w-1,0,1,h);
  g.fillStyle = '#ff5a4a'; let x = 2;
  for (const ch of text){ const rows = F[ch]; rows.forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') g.fillRect(x + xx, 2 + yy, 1, 1); })); x += rows[0].length + 1; }
  SPR.img.sign_onair = c.toDataURL(); SPR.size.sign_onair = [w, h]; SPR.anchor.sign_onair = .5;
})();
// POLICE in cold white-blue capitals for the station's fascia
(function policeSign(){
  const F = { P:['110','101','110','100','100'], O:['111','101','101','101','111'], L:['100','100','100','100','111'], I:['111','010','010','010','111'], C:['111','100','100','100','111'], E:['111','100','110','100','111'] };
  const text = 'POLICE', w = 4 + text.length*4 - 1, h = 9;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#0c1626'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4fb8ff'; g.fillRect(0,0,w,1); g.fillRect(0,h-1,w,1); g.fillRect(0,0,1,h); g.fillRect(w-1,0,1,h);
  g.fillStyle = '#e8f6ff';
  [...text].forEach((ch, k) => F[ch].forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') g.fillRect(2 + k*4 + xx, 2 + yy, 1, 1); })));
  SPR.img.sign_policetext = c.toDataURL(); SPR.size.sign_policetext = [w, h]; SPR.anchor.sign_policetext = .5;
})();
// The sky mall's tall sign: MALL stacked down a dark panel in warm amber, with a lit border
(function mallSign(){
  const F = { M:['10001','11011','10101','10001','10001'], A:['01110','10001','11111','10001','10001'], L:['10000','10000','10000','10000','11111'] };
  const text = 'MALL', w = 11, h = 4 + text.length*6 - 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#1c140c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffb347'; g.fillRect(0,0,w,1); g.fillRect(0,h-1,w,1); g.fillRect(0,0,1,h); g.fillRect(w-1,0,1,h);
  g.fillStyle = '#ffe2a8';
  [...text].forEach((ch, k) => F[ch].forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') g.fillRect(3 + xx, 2 + k*6 + yy, 1, 1); })));
  SPR.img.sign_mall = c.toDataURL(); SPR.size.sign_mall = [w, h]; SPR.anchor.sign_mall = .5;
})();
// The market mall's signs. Shop boards: painted boards in bright market colours with chunky pseudo-characters (a
// dot between words, now and then a price or 24H), some two lines deep. The rooftop sign: four big characters in
// rainbow colours over MALL, outlined in dark, with no board behind. And graffiti for its walls: bubble-letter
// tags with drips, in paint colours (these take the scene light: they're paint, not lights).
const MKT_SIGNS = [], MKT_GLOW = {}, MKT_GRAF = [];
(function marketSigns(){
  const rr = mulberry32(6061), ri = n => Math.floor(rr()*n);
  // a 7x7 pseudo-character, built like a real one: a radical beside a part, a roof over a part, or a frame round one
  function hanzi(set){
    const part = (x0, y0, w, h) => {
      const k = ri(4), mid = y0 + (h >> 1);
      if (k === 0){ for (let x=0;x<w;x++){ set(x0+x, y0); set(x0+x, y0+h-1); set(x0+x, mid); } for (let y=0;y<h;y++){ set(x0, y0+y); set(x0+w-1, y0+y); } }
      else if (k === 1){ for (let x=0;x<w;x++){ set(x0+x, y0); set(x0+x, mid); } for (let y=0;y<h;y++) set(x0+(w>>1), y0+y); set(x0, y0+h-1); set(x0+w-1, y0+h-1); }
      else if (k === 2){ for (let y=0;y<h;y++){ set(x0, y0+y); set(x0+w-1, y0+y); } for (let x=0;x<w;x++) set(x0+x, y0); for (let x=1;x<w-1;x++) set(x0+x, y0+h-2); }
      else { for (let x=0;x<w;x++){ set(x0+x, y0+1); set(x0+x, y0+h-1); } const v = x0 + 1 + ri(Math.max(1, w-2)); for (let y=0;y<h;y++) set(v, y0+y); set(x0, y0); }
    };
    const k = ri(5);
    if (k < 2){ for (let y=0;y<7;y++) set(1, y); set(0, 2); set(2, 2); rr() < .5 ? set(0, 5) : set(2, 4); part(3, 0, 4, 7); }   // radical and part
    else if (k < 4){ set(3, 0); for (let x=0;x<7;x++) set(x, 1); set(0, 2); set(6, 2); part(1, 3, 5, 4); }                      // roof over a part
    else { for (let q=0;q<7;q++){ set(0, q); set(6, q); set(q, 0); set(q, 6); } part(2, 2, 3, 3); }                             // a frame round a part
  }
  const DIG = { '2':['111','001','111','100','111'], '4':['101','101','111','001','001'], '5':['111','100','111','001','111'], '3':['111','001','111','001','111'], 'H':['101','101','111','101','101'] };
  // a line: groups of characters with dots between, and maybe a number on the end
  function lineSpec(){
    const groups = 1 + ri(3), out = [];
    for (let g = 0; g < groups; g++){ if (g) out.push('.'); for (let k = 0, n = groups > 1 ? 2 + ri(2) : 2 + ri(3); k < n; k++) out.push('c'); }
    if (rr() < .25) out.push(...pick2(['24H', '5', '3', '2']).split(''));
    return out;
  }
  const pick2 = a => a[ri(a.length)];
  const itemW = it => it === 'c' ? 8 : it === '.' ? 3 : 4;
  const BOARDS = [['#e0682c','#ffffff','orange'],['#2a9a86','#ffffff','cyan'],['#f2cf3a','#8a1a1a','amber'],['#d8407a','#ffffff','pink'],
                  ['#3aa65a','#ffffff','cyan'],['#c83a2a','#fff2c8','pink'],['#34b8c8','#ffffff','cyan'],['#2a5aa8','#ffe680','cyan']];
  function board(i, lines, spec, col){
    const L = []; for (let k=0;k<lines;k++) L.push(spec ? [...spec] : lineSpec());
    const lw = L.map(l => l.reduce((s, it) => s + itemW(it), -1));
    const w = Math.max(...lw) + 6, h = 4 + lines*8 + 1;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const [bg, fg, gn] = BOARDS[col ?? i % BOARDS.length];
    g.fillStyle = '#1a1418'; g.fillRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(1, 1, w-2, h-2);
    g.fillStyle = fg;
    L.forEach((l, li) => {
      let x = Math.floor((w - lw[li])/2); const y0 = 3 + li*8;
      for (const it of l){
        if (it === 'c') hanzi((px, py) => g.fillRect(x + px, y0 + py, 1, 1));
        else if (it === '.') g.fillRect(x + 1, y0 + 3, 1, 1);
        else DIG[it].forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') g.fillRect(x + xx, y0 + 1 + yy, 1, 1); }));
        x += itemW(it);
      }
    });
    const kind = 'sign_mkt' + i;
    SPR.img[kind] = c.toDataURL(); SPR.size[kind] = [w, h]; SPR.anchor[kind] = .5;
    MKT_GLOW[kind] = gn; MKT_SIGNS.push(kind);
  }
  for (let i=0;i<16;i++) board(i, i % 5 === 3 ? 2 : 1);
  board(16, 1, 'ccc', 0); board(17, 1, 'cccc', 0);   // the two big orange boards on the roof tower (小吃城, 手机维修)
  MKT_SIGNS.length = 16;                             // kept for the tower only
  // dark outline round whatever's painted, on a transparent canvas
  function outline(g, w, h, col){
    const d = g.getImageData(0, 0, w, h), a = d.data, o = new Uint8Array(w*h);
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (!a[(y*w + x)*4 + 3])
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){ const X = x+dx, Y = y+dy; if (X>=0 && Y>=0 && X<w && Y<h && a[(Y*w + X)*4 + 3] > 127) o[y*w + x] = 1; }
    g.fillStyle = col; for (let q=0;q<w*h;q++) if (o[q]) g.fillRect(q % w, Math.floor(q/w), 1, 1);
  }
  // the rooftop sign: 彩虹广场 (as four rainbow pseudo-characters, two pixels to a stroke) over a smaller MALL
  { const S = 2, w = 4*15 + 4, h = 15 + 2 + 11 + 2, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const cols = ['#ff5aa8', '#ff8a3a', '#5ae8c8', '#ffd23f'];
    for (let k=0;k<4;k++){ g.fillStyle = cols[k]; hanzi((px, py) => g.fillRect(2 + k*15 + px*S, 1 + py*S, S, S)); }
    const F = { M:['10001','11011','10101','10001','10001'], A:['01110','10001','11111','10001','10001'], L:['10000','10000','10000','10000','11111'] };
    g.fillStyle = '#e070ff'; let x = w - 2 - (5+1+5+1+5+1+5)*S;
    for (const ch of 'MALL'){ F[ch].forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') g.fillRect(x + xx*S, 17 + yy*S, S, S); })); x += 6*S; }
    outline(g, w, h, '#1a1026');
    SPR.img.sign_mktroof = c.toDataURL(); SPR.size.sign_mktroof = [w, h]; SPR.anchor.sign_mktroof = .5; }
  // graffiti: overlapping bubble letters, a highlight on each, a few drips, all outlined
  const PAINT = [['#ff5aa8','#ffc0dc'],['#ff8a3a','#ffd8a0'],['#a070f0','#e0c8ff'],['#ffd23f','#fff2b0'],['#3ad0e0','#c0f4ff'],['#6ad06a','#d0ffc0']];
  for (let i=0;i<8;i++){
    const w = 30 + ri(14), h = 16, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const [fill, hi] = PAINT[i % PAINT.length], n = 3 + ri(3), step = (w - 8)/n;
    g.fillStyle = fill;
    for (let k=0;k<n;k++){
      const cx = 4 + step*(k + .5) + rr()*2 - 1, cy = 7 + rr()*2 - 1, rx = step*.6 + 1, ry = 4 + rr()*2;
      for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (((x + .5 - cx)/rx)**2 + ((y + .5 - cy)/ry)**2 <= 1) g.fillRect(x, y, 1, 1);
      if (rr() < .5) g.fillRect(Math.round(cx), Math.round(cy + ry - 1), 1, 2 + ri(3));   // a drip
    }
    g.fillStyle = hi;
    for (let k=0;k<n;k++){ const cx = Math.round(4 + step*(k + .5)) - 1, cy = 5; g.fillRect(cx, cy, 2, 1); }
    outline(g, w, h, '#1c1424');
    const kind = 'graf_' + i;
    SPR.img[kind] = c.toDataURL(); SPR.size[kind] = [w, h]; SPR.anchor[kind] = .5;
    MKT_GRAF.push(kind);
  }
})();
// The workshop yard's neon words (industrial zone): bright letters in a 3x5 pixel font on a dark board with a
// border in the same colour
(function workshopSigns(){
  const F = { S:['111','100','111','001','111'], C:['111','100','100','100','111'], R:['110','101','110','101','101'], A:['010','101','111','101','101'],
              P:['110','101','110','100','100'], G:['111','100','101','101','111'], E:['111','100','110','100','111'], I:['111','010','010','010','111'],
              L:['100','100','100','100','111'], U:['101','101','101','101','111'], B:['110','101','110','101','110'], H:['101','101','111','101','101'],
              T:['111','010','010','010','010'], '2':['111','001','111','100','111'], '4':['101','101','111','001','001'], '.':['0','0','1','0','0'], ' ':['0','0','0','0','0'],
              N:['1001','1101','1011','1001','1001'], O:['111','101','101','101','111'], D:['110','101','101','101','110'], F:['111','100','110','100','100'],
              X:['101','101','010','101','101'], K:['101','101','110','101','101'], Y:['101','101','010','010','010'], '-':['000','000','111','000','000'],
              M:['10001','11011','10101','10001','10001'], W:['10001','10001','10101','11011','10001'], '1':['010','110','010','010','111'],
              '5':['111','100','111','001','111'], Z:['111','001','010','100','111'] };
  const make = (kind, text, col, deco) => {
    const ws = [...text].map(ch => F[ch][0].length), tw = ws.reduce((a, b) => a + b + 1, -1), pad = deco ? 5 : 3, w = tw + 2*pad, h = 9;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#12161c'; g.fillRect(0, 0, w, h);
    g.fillStyle = col; g.fillRect(1, 1, w - 2, 1); g.fillRect(1, h - 2, w - 2, 1); g.fillRect(1, 1, 1, h - 2); g.fillRect(w - 2, 1, 1, h - 2);
    if (deco){ g.fillRect(3, 4, 2, 1); g.fillRect(w - 5, 4, 2, 1); }   // little dashes either side, like the gear shop's sign
    let x = pad;
    [...text].forEach((ch, k) => { F[ch].forEach((r, yy) => [...r].forEach((b, xx) => { if (b === '1') g.fillRect(x + xx, 2 + yy, 1, 1); })); x += ws[k] + 1; });
    SPR.img[kind] = c.toDataURL(); SPR.size[kind] = [w, h]; SPR.anchor[kind] = .5;
  };
  make('sign_w_scrap', 'SCRAP', '#6aff8a'); make('sign_w_gear', 'GEAR', '#ff8a3a', true); make('sign_w_repairs', 'REPAIRS', '#5af0d0');
  make('sign_w_parts', 'PARTS', '#6ac8ff'); make('sign_w_lube', 'LUBE.24H', '#ffc060');
  // the commercial strip's shops: the container stack's floors, the spiral tower's ramen bar, the corner market
  make('sign_w_barber', 'BARBER', '#ff6ae0'); make('sign_w_meds', 'MEDS', '#7aff8a', true); make('sign_w_herbs', 'HERBS', '#9aff6a');
  make('sign_w_fixit', 'FIX-IT', '#ffe04a'); make('sign_w_stitch', 'STITCH', '#5ae8ff'); make('sign_w_tea', 'ROOF.TEA', '#5af0d0');
  make('sign_w_ramen', 'RAMEN', '#ff6a9a', true); make('sign_w_noodles', 'NOODLES', '#ffd060'); make('sign_w_noodlesP', 'NOODLES', '#ff7ab0');
  make('sign_w_hot', 'HOT.CHEAP', '#ffb04a'); make('sign_w_24h', '24H', '#ff5a8a', true);
  // the radio station's relay: equipment plates
  make('sign_w_satcom', 'SATCOM 12-A', '#ffd060'); make('sign_w_mlink', 'MLINK 5GHZ', '#5ae8ff'); make('sign_w_mw', 'MW 5GHZ', '#ff8a5a');
})();
// All sprites share one texture atlas and one material, so a whole region's plants, laundry and signs
// are a single instanced draw call. The layout is computed from the known sizes right away; each image is
// painted into its slot as soon as it has loaded.
const FOL_RECT = {};
const FOL_ATLAS = (() => {
  const AW = 512, kinds = Object.keys(SPR.img).sort((a,b) => SPR.size[b][1] - SPR.size[a][1]);
  let x = 1, y = 1, rowH = 0;
  const slots = {};
  for (const k of kinds){
    const [w,h] = SPR.size[k];
    if (x + w + 1 > AW){ x = 1; y += rowH + 1; rowH = 0; }
    slots[k] = [x, y]; x += w + 1; rowH = Math.max(rowH, h);
  }
  let AH = 64; while (AH < y + rowH + 1) AH *= 2;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  for (const k of kinds){
    const [w,h] = SPR.size[k], [cx,cy] = slots[k];
    FOL_RECT[k] = [cx, AH - cy - h, w, h];   // in texture space (flipped: v runs up from the canvas bottom)
    const img = new Image();
    img.onload = () => { g.drawImage(img, cx, cy, w, h); tex.needsUpdate = true; };
    img.src = SPR.img[k];
  }
  return { tex, size: new THREE.Vector2(AW, AH) };
})();
const FOL_SHADER = new THREE.ShaderMaterial({
    uniforms: { lightsOn: LIGHTS_ON, lodPlants: LOD.plants, map:{value:FOL_ATLAS.tex}, atlasSize:{value:FOL_ATLAS.size}, tint:FOL_UNI.tint, time:FOL_UNI.time, normalMode:FOL_UNI.normalMode, neonI:FOL_UNI.neonI, res:FOL_UNI.res, wind:FOL_UNI.wind },
    vertexShader: `uniform vec2 res; uniform float time; uniform float lodPlants; uniform float lightsOn; varying float vPhase; attribute vec4 aVar; attribute float aFixed; attribute vec4 aRect; attribute vec2 aKind; attribute float aOn;
      varying vec2 vUv; varying float vShade; varying vec4 vRect; varying vec2 vKind; varying float vFlk; varying float vOn;` + FLK_GLSL + LIT_GLSL + `
      void main(){
        vShade = aVar.z; vRect = aRect; vKind = aKind; vOn = aKind.y > 0.5 ? litOn(aOn, lightsOn, time) : 1.0;
        // about one lit sign in ten flickers (picked from its random phase)
        vFlk = aVar.w > 99.0 ? flicker(200.0 + floor(fract(aVar.w*7.13)*54.0), time) : (aKind.y > 0.5 && fract(aVar.w*3.71) < 0.1) ? flicker(1.0 + floor(fract(aVar.w*7.13)*198.0), time) : 1.0;
        vec2 texSize = aRect.zw; float swayType = aKind.x;
        vec2 local = vec2(position.x*aVar.y, position.y + 0.5 - aVar.x);
        // sway happens in the fragment shader by sliding whole texel rows, so the quad itself never bends.
        // Widen it by 3 texels on each side so the shifted rows have room.
        float pad = swayType > 0.5 ? (texSize.x + 6.0)/texSize.x : 1.0;
        local.x *= pad;
        vUv = vec2((uv.x - 0.5)*pad + 0.5, uv.y);
        vPhase = aVar.w;
        vec3 l3 = vec3(local, 0.0);
        if (aFixed > 0.5){
          // glued to a wall, edge or line: a flat plane in the surface's own orientation
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(l3, 1.0);
        } else {
          // free-standing: faces the camera, with its anchor and corners snapped to whole render pixels
          vec4 a = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
          vec2 ap = floor((a.xy*0.5 + 0.5)*res + 0.5);
          vec2 off = floor(vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * local * vec2(sx, sy) * 0.5 * res + 0.5);
          gl_Position = vec4((ap + off)/res*2.0 - 1.0, a.z, 1.0);
        }
        // zoomed out: thin the plants and laundry (small sprites go first); lit signs always stay
        float thin = lodPlants * (aRect.w < 24.0 ? 0.85 : 0.5);
        if (aKind.y < 0.5 && fract(aVar.w*5.17) < thin) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      }`,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    fragmentShader: `uniform sampler2D map; uniform vec2 atlasSize; uniform vec3 tint; uniform float normalMode; uniform float neonI;
      uniform float time; uniform float wind;
      varying vec2 vUv; varying float vShade; varying float vPhase; varying vec4 vRect; varying vec2 vKind; varying float vFlk; varying float vOn;
      void main(){
        vec2 texSize = floor(vRect.zw + 0.5); float swayType = vKind.x;
        vec2 tx = vUv * texSize;                 // position in texels
        float row = floor(tx.y);
        float fromTop = (texSize.y - row) / texSize.y, fromBottom = (row + 0.5) / texSize.y;
        float ph = vPhase, sh = 0.0;
        if (swayType > 0.5 && swayType < 1.5)       // laundry: hangs from the line, the hem swings furthest
          sh = wind*(1.3*sin(time*2.0 + ph - fromTop*1.4) + 0.45*sin(time*4.1 + ph*1.7))*fromTop;
        else if (swayType > 1.5 && swayType < 2.5)  // hanging vines: a slow wave travelling down to the tips
          sh = wind*(1.6*sin(time*1.3 + ph - fromTop*1.6) + 0.5*sin(time*2.9 + ph*2.0))*pow(fromTop, 1.4);
        else if (swayType > 2.5)                    // standing plants: tips lean with the breeze
          sh = wind*(1.0*sin(time*1.6 + ph) + 0.3*sin(time*3.3 + ph*1.3))*fromBottom*fromBottom;
        tx.x -= floor(sh + 0.5);                 // whole texels only, so pixels never break up
        if (tx.x < 0.0 || tx.x >= texSize.x || tx.y < 0.0 || tx.y >= texSize.y) discard;
        vec4 c = texture2D(map, (floor(vRect.xy + 0.5) + floor(tx) + 0.5) / atlasSize);
        if (c.a < 0.5) discard;
        vec3 col = c.rgb*tint*vShade;
        // neon tubes light themselves; the dark backing board takes the scene light
        if (vKind.y > 0.5 && dot(c.rgb, vec3(0.333)) > 0.35) col = mix(c.rgb*tint*vShade*.55, c.rgb*neonI*max(vFlk, 0.3), vOn);   // switched off: just painted letters
        gl_FragColor = normalMode > 0.5 ? vec4(0.5,0.5,1.0,1.0) : vec4(col, 1.0);
      }`,
});
// anchor: 'b' bottom sits on the point, 't' top hangs from it, 'c' centered
// fixed: lie flat in P's orientation (P's local z is the surface's outward direction).
// Otherwise the plant stands free: two copies crossed in an X, locked to the world at a random angle,
// so it never turns or slides as the camera moves and never shows up edge-on and paper-thin.
function plant(kind,P,x,y,z,k=1,anchor,fixed=false){
  const s = SPR.size[kind];
  const an = anchor===undefined ? SPR.anchor[kind] : anchor==='b' ? 0 : anchor==='t' ? 1 : anchor==='c' ? .5 : anchor;
  const scale = new THREE.Matrix4().makeScale(s[0]/PX*k, s[1]/PX*k, 1);
  const toss = chance(.5)?-1:1, shade = rnd(.85,1.05), phase = rnd(0,TAU);
  const flip = (kind.startsWith('sign_') || kind.startsWith('glyph_')) ? 1 : toss;   // lettering must read the right way round
  if (DARK && flip === 1 && kind.startsWith('sign_')){ _gv.set(x,y,z).applyMatrix4(P); if (posHash(_gv.x, _gv.y, _gv.z) < 70) return; }
  const ph = DARK && kind.startsWith('sign_') ? phase + 100 : phase;   // a sign on a dark street flickers hard
  if (fixed){
    FOL_LIST[kind].push({ m: under(P, T(x,y,z)).multiply(scale), an, flip, shade, phase: ph, fixed:1 });
  } else {
    const yaw = rnd(0,PI);
    FOL_LIST[kind].push({ m: under(P, T(x,y,z,yaw)).multiply(scale), an, flip, shade, phase, fixed:1 });
    FOL_LIST[kind].push({ m: under(P, T(x,y,z,yaw+PI/2)).multiply(scale), an, flip:-flip, shade:shade*.88, phase, fixed:1 });
  }
}
/* ---------- floor overgrowth: flat moss, vines and weeds painted onto the ground ---------- */
// Cut from the overgrown-tile sheets (stone keyed out, only the plant layer kept, shrunk to true pixel size).
// Unlike the plant billboards these lie flat and take the scene's light and shadow like the paving under them,
// so moss on the floor reads as moss, not as little shrubs. One small atlas, one material; they ride in the
// ordinary geometry buckets (with uvs), so a cell's floor decals cost no extra draw call per patch.
const FLOOR_SPR = { f_moss1:[15,15], f_moss2:[16,15], f_weeds:[21,20], f_crack:[22,22], f_vine:[24,23], f_mossmat:[22,22],
  f_sprouts:[20,19], f_seam:[22,21], f_ivy:[24,24], f_leaves:[20,20], f_grass1:[30,9], f_grass2:[30,9] };
const FLOOR_UV = {};
const FLOOR_MAT = (() => {
  const AW = 128; let x = 1, y = 1, rowH = 0; const slots = {};
  for (const k in FLOOR_SPR){ const [w,h] = FLOOR_SPR[k];
    if (x + w + 1 > AW){ x = 1; y += rowH + 1; rowH = 0; }
    slots[k] = [x, y]; x += w + 1; rowH = Math.max(rowH, h); }
  let AH = 16; while (AH < y + rowH + 1) AH *= 2;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  for (const k in FLOOR_SPR){
    const [w,h] = FLOOR_SPR[k], [cx,cy] = slots[k];
    FLOOR_UV[k] = [cx/AW, 1 - (cy + h)/AH, (cx + w)/AW, 1 - cy/AH];
    const img = new Image(); img.onload = () => { g.drawImage(img, cx, cy, w, h); tex.needsUpdate = true; }; img.src = 'assets/floor/' + k + '.png';
  }
  const m = toon(0xffffff); m.map = tex; m.alphaTest = .5; m.userData.noCast = true;
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
  return m;
})();
// which patches go where
const FLOOR_SMALL = ['f_moss1','f_moss2','f_crack','f_seam','f_sprouts','f_leaves'];             // tile gaps and sidewalk edges
const FLOOR_BIG = ['f_vine','f_mossmat','f_ivy','f_weeds','f_seam','f_sprouts','f_moss2','f_leaves'];   // open ground: plazas and yards
const FLOOR_FRINGE = ['f_grass1','f_grass2'];                                                         // grass along a kerb or wall foot
// a patch lying flat at (x,y,z) in P's frame; turned a random quarter and mirrored, so repeats don't line up.
// k scales it; ry turns it (strips use it to run along an edge)
const _fv = new THREE.Vector3();
function floorPatch(kind, P, x, y, z, k=1, ry){
  if (!chance(Math.min(1, .25 + .75*S.green))) return;
  const [w,h] = FLOOR_SPR[kind], hw = w/PX*k/2, hh = h/PX*k/2, uv = FLOOR_UV[kind];
  const m = under(P, T(x, y, z, ry === undefined ? irand(0,3)*PI/2 : ry));
  const flip = chance(.5), u0 = flip ? uv[2] : uv[0], u1 = flip ? uv[0] : uv[2];   // mirrored by the uvs, which keeps the winding facing up
  let b = buckets.get(FLOOR_MAT); if (!b){ b = { p: [], n: [], d: [], f: null, u: [] }; buckets.set(FLOOR_MAT, b); }
  const C = [[-hw,-hh,u0,uv[3]], [hw,-hh,u1,uv[3]], [hw,hh,u1,uv[1]], [-hw,hh,u0,uv[1]]];
  for (const q of [0,2,1, 0,3,2]){
    const [cx, cz, u, v] = C[q]; _fv.set(cx, 0, cz).applyMatrix4(m);
    b.p.push(_fv.x, _fv.y, _fv.z); b.n.push(0, 1, 0); b.u.push(u, v); b.d.push(0);
  }
}
// a patch now and then grows into a cluster: several overlapping pieces of the same family around the spot,
// so the floor has proper mossy stretches as well as single tufts
function floorGrow(list, P, x, y, z, k, spread){
  if (!chance(.3)){ floorPatch(pick(list), P, x, y, z, k); return; }
  const n = irand(3, 5);
  for (let i=0;i<n;i++){ const a = rnd(0, TAU), d = i ? rnd(.3, 1)*spread : 0;
    floorPatch(pick(list), P, x + Math.cos(a)*d, y + i*.0008, z + Math.sin(a)*d, k*rnd(.75, 1)); }   // tiny lifts stop overlaps fighting
}
const floorSmall = (P, x, y, z, k) => floorGrow(FLOOR_SMALL, P, x, y, z, k, .3);
const floorBig = (P, x, y, z, k) => floorGrow(FLOOR_BIG, P, x, y, z, k, .5);
// small plants for roofs, balconies and ledges; big spreading ones for open ground; hanging ones for walls and edges
const SMALL_GROUND = ['bush','bush','bushFlower','moss','g_moss2','g_fern2'];
const BIG_GROUND = ['g_clover','g_fern3','g_cover','g_flowers','g_spread1','g_spread2','g_fern2','g_moss2','bush','bushFlower'];
const HANGING = ['vines','pothos','h_ivy','h_vine3','h_curtain1','h_curtain2','h_curtain3','h_heart'];
const leafKind = () => pick(SMALL_GROUND);
// icon signs: which businesses show up in which district
const ICONS = {
  low:  ['ramen','noodles','laundry','repair','plant','cocktail','music','bakery','hotel'],
  mid:  ['coffee','ramen','bakery','books','music','records','arcade','games','cocktail','plant','clinic','noodles'],
  high: ['cocktail','music','books','clinic','hotel','coffee'],
  ind:  ['repair','noodles','coffee'],
};
const NEON_NAME = new Map([[M.neonPink,'pink'],[M.neonCyan,'cyan'],[M.neonAmber,'amber']]);
// flat: glued to the wall; projecting: a blade sign sticking out from the wall, readable from the side
function iconSign(st, F, x, y, projecting, k=.62){
  const color = NEON_NAME.get(pick(st.neonMats)), kind = `sign_${pick(ICONS[st.cls])}_${color}`;
  const w = SPR.size[kind][0]/PX*k;
  if (projecting){
    const Q = under(F, T(x, y, w/2+.08, PI/2));
    box(M.metalDark, F, x, y+SPR.size[kind][1]/PX*k/2+.03, w/2+.05, .04, .04, w+.12);
    plant(kind, Q, 0, 0, 0, k, 'c', true);
    glow(F, x, y, w/2+.08, color, 1.3+w);
  } else {
    plant(kind, F, x, y, .065, k, 'c', true);
    glow(F, x, y, .3, color, 1.2+w);
  }
}
const bigKind = () => pick(BIG_GROUND);
const LAUNDRY = Object.keys(SPR.size).filter(k => k.startsWith('l_') && k !== 'l_mossroots');
const laundryKind = () => pick(LAUNDRY);
const hangKind = () => pick(HANGING);
function buildFoliage(){
  let n = 0; for (const kind in FOL_LIST) n += FOL_LIST[kind].length;
  if (!n) return;
  const geo = new THREE.PlaneGeometry(1,1), attr = new Float32Array(n*4), fx = new Float32Array(n), rect = new Float32Array(n*4), kd = new Float32Array(n*2), ons = new Float32Array(n);
  const mesh = new THREE.InstancedMesh(geo, FOL_SHADER, n);
  let i = 0;
  for (const kind in FOL_LIST){
    const L = FOL_LIST[kind]; if (!L.length) continue;
    const r = FOL_RECT[kind], sw = swayTypeFor(kind), em = (kind.startsWith('sign_') || kind.startsWith('glyph_')) ? 1 : 0;
    for (const p of L){
      mesh.setMatrixAt(i, p.m);
      attr[i*4] = p.an; attr[i*4+1] = p.flip; attr[i*4+2] = p.shade; attr[i*4+3] = p.phase; fx[i] = p.fixed;
      rect.set(r, i*4); kd[i*2] = sw; kd[i*2+1] = em; ons[i] = em ? litOrder(p.m.elements[12], p.m.elements[13], p.m.elements[14])/255 : 0; i++;
    }
  }
  geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(attr,4));
  geo.setAttribute('aFixed', new THREE.InstancedBufferAttribute(fx,1));
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect,4));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kd,2)); geo.setAttribute('aOn', new THREE.InstancedBufferAttribute(ons,1));
  mesh.layers.set(2); mesh.frustumCulled = false;
  city.add(mesh);
}

// While a piece is being generated, glows are collected as plain numbers; the region then draws each colour
// as one batch of points. (Thousands of individual sprites used to cost one draw call each.)
let glowList = null;
const _gv = new THREE.Vector3();
function glow(P,x,y,z,kind,s=1){
  if (DARK && !KEEP_LIGHT && GLOW_FLK[kind]){ _gv.set(x,y,z).applyMatrix4(P); if (posHash(_gv.x, _gv.y, _gv.z) < 80) return; }
  if (DARK && GLOW_FLK[kind]) s = -s;   // marks a halo that flickers hard (see glowPoints)
  if (!glowList){ const sp = new THREE.Sprite(GLOW[kind]); sp.position.set(x,y,z).applyMatrix4(P); sp.scale.set(Math.abs(s),Math.abs(s),1); sp.layers.set(1); glowGroup.add(sp); return; }
  _gv.set(x,y,z).applyMatrix4(P); (glowList[kind] || (glowList[kind] = [])).push(_gv.x, _gv.y, _gv.z, s);
}
const GLOW_PTS_UNI = { scale:{ value: 20 } };
// every glow colour in one batch: each point carries its colour, and whether it brightens at night
const GLOW_NIGHT = { value: 1 };
const GLOW_PTS = new THREE.ShaderMaterial({
  uniforms: { map:{ value: glowTex }, nightOp: GLOW_NIGHT, scale: GLOW_PTS_UNI.scale, time: FOL_UNI.time, lightsOn: LIGHTS_ON },
  vertexShader: 'attribute float size; attribute vec4 aCol; attribute float aFlk; attribute float aOn; uniform float scale; uniform float nightOp; uniform float time; uniform float lightsOn; varying vec4 vCol;' + FLK_GLSL + BLINK_GLSL + LIT_GLSL + ' void main(){ float op = aCol.a < -1.5 ? mix(0.04, 1.0, blink(position.y, time)) : (aCol.a < 0.0 ? nightOp*litOn(aOn, lightsOn, time) : aCol.a); vCol = vec4(aCol.rgb, op * flicker(aFlk, time)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale; }',
  fragmentShader: 'uniform sampler2D map; varying vec4 vCol; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vCol.rgb, a * vCol.a); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const GLOW_FIXED = { red: .95, blue: .85 };
const GLOW_FLK = { pink: 'neon', cyan: 'neon', amber: 'neon', warm: 'bulb', orange: 'neon' };   // halos flicker at the same odds as their kind of light
function glowPoints(gl){
  let n = 0; for (const k in gl) n += gl[k].length/4;
  const pos = new Float32Array(n*3), size = new Float32Array(n), col = new Float32Array(n*4), flk = new Float32Array(n), ons = new Float32Array(n);
  let i = 0;
  for (const k in gl){
    const arr = gl[k], c = GLOW[k].color, op = k === 'blink' ? -2 : GLOW_FIXED[k] !== undefined ? GLOW_FIXED[k] : -1;
    for (let q=0;q<arr.length;q+=4, i++){
      pos[i*3] = arr[q]; pos[i*3+1] = arr[q+1]; pos[i*3+2] = arr[q+2]; size[i] = Math.abs(arr[q+3]);
      col[i*4] = c.r; col[i*4+1] = c.g; col[i*4+2] = c.b; col[i*4+3] = op;
      flk[i] = arr[q+3] < 0 ? heavyFlickerId() : flickerId(GLOW_FLK[k]); ons[i] = litOrder(arr[q], arr[q+1], arr[q+2])/255;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 4)); g.setAttribute('aFlk', new THREE.BufferAttribute(flk, 1)); g.setAttribute('aOn', new THREE.BufferAttribute(ons, 1));
  g.computeBoundingSphere();
  const pts = new THREE.Points(g, GLOW_PTS); pts.layers.set(1); pts.layers.enable(4); pts.frustumCulled = false; return pts;   // layer 4: the night-light pass (sky.js)
}
