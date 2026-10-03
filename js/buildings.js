// Neon Terrarium: District styles and every building type.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- district palettes and styles (from the style guide's class table) ---------- */
const ALLNEON = [M.neonPink, M.neonCyan, M.neonAmber];
// Cyberpunk kit colors: weathered concrete, painted panels, lit interiors
Object.assign(M, {
  concL: toon(0x9ea3a8), concM: toon(0x7d858e), concW: toon(0xa49c8e), concD: toon(0x50575f), concDD: toon(0x3c4450),
  corrBlue: toon(0x4f7fa3), rustRed: toon(0x9c3f35), teal2: toon(0x3f7f7a), cream2: toon(0xd8d0bc), white2: toon(0xe6e6e2),
  pole: toon(0x3a3028), red2: toon(0xb0453a), hazard: toon(0xd9b43a), orange: toon(0xd9722a), frame: toon(0x2a2f38), shutter: toon(0x8a9098),
  interiorCool: toon(0x2a4050,{em:0x5aa8e0, kind:'window'}), interiorPink: toon(0x40243a,{em:0xd870b0, kind:'window'}),
});
const LIT_ROOMS = [M.winLit, M.winLit, M.interiorCool, M.interiorPink];
const D = {
  low:  { walls:[M.concW,M.corrBlue,M.rustRed,M.cream2,M.teal2,M.concL], accent:[M.corrBlue,M.hazard,M.rustRed,M.teal2],
          ground:toon(0x5c5c64), trim:M.concD, roof:M.rustRed },
  mid:  { walls:[toon(0x4a3a30),toon(0x3a3846),toon(0x5a3e52),toon(0xb8a888),toon(0x2e4a52),toon(0x7a4a3a)], accent:[M.awn1,M.awn2,M.awn3,M.red2],   // dark wood, charcoal, plum, sandstone, deep teal, brick: nothing like the residential blocks
          ground:toon(0x7c7f88), trim:M.concD, roof:toon(0x3a3f48) },
  high: { walls:[M.concM,M.concD,M.concDD], accent:[M.glassTeal,toon(0x9fd8d0)], ground:toon(0x626874), trim:M.concD, roof:M.concD },
  ind:  { walls:[M.concL,M.concM,toon(0x6a7066),M.corrBlue], accent:[M.hazard,M.orange], ground:toon(0x4e5054), trim:M.frame, roof:toon(0x4a5058) },
};
const STY = {
  low:  { ...D.low, floors:[4,8], lit:.55, winSkip:.12, balcony:.4, ac:.45, bars:.3, potSill:.25, vines:.6, neon:.8, neonMats:ALLNEON,
          shop:.45, garage:.2, glyphs:3, strips:.25, vents:.3, cables:.6, laundry:true,
          roofN:3, roof:['shack','tank','antenna','dish','laundry','pots','billboard'], parapet:true, yaw:.22 },
  mid:  { ...D.mid, lit:.6, winSkip:.08, balcony:.35, ac:.35, potSill:.2, vines:.35, neon:.9, neonMats:ALLNEON, awn:D.mid.accent,
          shop:.9, garage:.25, glyphs:3, strips:.45, vents:.25, cables:.45,
          roofN:2, roof:['tank','antenna','billboard','ring','dish','pots'], parapet:true, yaw:.12 },
  high: { ...D.high, lit:.5, ribbon:true, vines:.1, neon:.5, neonMats:[M.neonCyan,M.neonPink], shop:.5, glyphs:2, strips:1, vents:.1,
          roofN:2, roof:['billboard','ring','pad','bonsai'], yaw:.1 },
  ind:  { ...D.ind, lit:.45, winSkip:.45, ac:.4, vines:.3, pipes:true, neon:.35, neonMats:[M.neonAmber,M.neonCyan], shop:0, garage:.7,
          glyphs:1, strips:.3, vents:.6, cables:.3, roofN:3, roof:['chimney','vent','tankSmall','chimney','billboard'], lights:true, yaw:.08 },
};
U.torus = new THREE.TorusGeometry(.5,.06,6,20).toNonIndexed();
for (const k in STY) STY[k].cls = k;
const FH = 0.95, ISL_R = 12.4;
const LOT = 3.8;   // plot spacing; the street is what's left between a plot's sidewalk and the next one
const CORNERS = [[1,1],[1,-1],[-1,1],[-1,-1]];
U.cyl16 = new THREE.CylinderGeometry(.5,.5,1,16).toNonIndexed();
U.cone = new THREE.CylinderGeometry(0,.5,1,12).toNonIndexed();
U.prism = (() => { const s = new THREE.Shape(); s.moveTo(-.5,0); s.lineTo(.5,0); s.lineTo(0,1); s.lineTo(-.5,0);
  const g = new THREE.ExtrudeGeometry(s, { depth:1, bevelEnabled:false }); g.translate(0,0,-.5); return g; })();

function faces(w,d){ return [
  {nx:0,nz:1,half:d/2,len:w,ry:0}, {nx:0,nz:-1,half:d/2,len:w,ry:PI},
  {nx:1,nz:0,half:w/2,len:d,ry:PI/2}, {nx:-1,nz:0,half:w/2,len:d,ry:-PI/2} ]; }

/* ---------- island ---------- */
function jitter(geo, amt, topY){
  const p = geo.attributes.position, seen = new Map();
  for (let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i), k=x.toFixed(2)+','+y.toFixed(2)+','+z.toFixed(2);
    let d = seen.get(k); if (!d){ d=[rnd(-amt,amt), rnd(-amt,amt)*.6, rnd(-amt,amt)]; seen.set(k,d); }
    if (y > topY) continue;
    p.setXYZ(i, x+d[0], y+d[1], z+d[2]);
  }
  return geo;
}
function buildIsland(){
  const top = new THREE.CylinderGeometry(ISL_R, ISL_R*.97, .7, 28, 1).toNonIndexed();
  put(top, M.rock, T(0,-.4,0)); top.dispose();
  const pave = new THREE.CylinderGeometry(ISL_R-.18, ISL_R-.18, .1, 28, 1).toNonIndexed();
  put(pave, M.paving, T(0,-.05,0)); pave.dispose();
  const under = jitter(new THREE.CylinderGeometry(ISL_R*.96, 1.2, 6.5, 14, 4), .55, 3.2).toNonIndexed();
  under.computeVertexNormals();
  put(under, M.rock, T(0,-.75-3.25,0)); under.dispose();
  const P = I4;
  // thrusters
  for (let i=0;i<3;i++){
    const a = i/3*TAU + .4, x=Math.cos(a)*3.2, z=Math.sin(a)*3.2;
    cyl(M.metalDark,P,x,-5.7,z,.55,.9); cyl(M.thruster,P,x,-6.2,z,.42,.16);
    glow(P,x,-6.7,z,'blue',3.4); glow(P,x,-7.6,z,'blue',2);
  }
  cyl(M.metalDark,P,0,-7.2,0,.75,.8); cyl(M.thruster,P,0,-7.65,0,.6,.14); glow(P,0,-8.2,0,'blue',4);
  // hanging cables and rock chunks
  for (let i=0;i<9;i++){
    const a=rnd(0,TAU), r=rnd(4.5,8.2), len=rnd(1,2.6), yTop = -.75 - (ISL_R*.96-r)/(ISL_R*.96-1.2)*6.5 + .3;
    cyl(M.metalDark,P,Math.cos(a)*r,yTop-len/2,Math.sin(a)*r,.04,len);
  }
  for (let i=0;i<10;i++){ const a=rnd(0,TAU); blob(M.rockDark,P,Math.cos(a)*(ISL_R-.3),rnd(-1.8,-.9),Math.sin(a)*(ISL_R-.3),rnd(.4,.8)); }
  // pipes around the rim
  for (let i=0;i<6;i++){ const a=i/6*TAU+rnd(0,.5); cyl(M.rust,P,Math.cos(a)*(ISL_R+.05),-.45,Math.sin(a)*(ISL_R+.05),.09,rnd(2,3.5),PI/2,0); }
  // rim greenery and vines falling off the edge
  for (let a=0; a<TAU; a+=.22){
    if (chance(.6*S.green)) plant(bigKind(),P,Math.cos(a)*(ISL_R-.5),0,Math.sin(a)*(ISL_R-.5),rnd(.8,1.05));
    const E = T(Math.cos(a)*(ISL_R+.03), 0, Math.sin(a)*(ISL_R+.03), Math.atan2(Math.cos(a), Math.sin(a)));
    if (chance(.4*S.green)) plant(hangKind(),E,0,.05,0,rnd(.8,1.15),'t',true);
    else if (chance(.25*S.green)) plant('l_mossroots',E,0,0,0,rnd(.8,1),undefined,true);
  }
}

/* ---------- lots ---------- */
function classFor(x,z,off){
  if (S.district !== 'mixed') return S.district;
  if (Math.hypot(x,z) < 3) return 'mid';
  const a = ((Math.atan2(z,x)+off)/TAU % 1 + 1) % 1;
  return ['low','high','ind','mid'][Math.floor(a*4)];
}
function planLots(){
  const lots = [], off = rnd(0,TAU);
  for (let i=-2.5;i<=2.5;i++) for (let j=-2.5;j<=2.5;j++){
    const x=i*LOT, z=j*LOT; if (Math.hypot(x,z) > ISL_R-2.2) continue;
    lots.push({x,z,cls:classFor(x,z,off),floors:0});
  }
  pick(lots.filter(l=>Math.abs(l.x)<LOT && Math.abs(l.z)<LOT)).plaza = true;
  planElevation(lots);
  for (const l of lots) l.padOK = (l.cls === 'mid' || l.cls === 'high' || l.cls === 'low') && chance(.4);
  return lots;
}


/* ---------- facade decoration ---------- */
const litRoom = st => chance(st.lit) ? pick(st.rooms || LIT_ROOMS) : M.glassDark;   // (the commercial quarter has its own, warmer rooms)

function decorateFloor(st,F,L,y0,floorIdx,lot){
  const ground = floorIdx === 0;
  if (ground && chance(st.shop*S.neon)){ shopfront(st,F,L,y0); return; }
  if (ground && chance(st.garage||0)){ garage(st,F,L,y0); return; }
  if (st.ribbon){
    // continuous glass band with mullions, the office-tower look
    const g = litRoom(st), band = L*.86;
    box(g, F, 0, y0+.5, 0, band, .44, .07);
    for (let x=-band/2; x<=band/2+.01; x+=.3) box(M.frame, F, x, y0+.5, .04, .04, .46, .04);
    box(st.trim, F, 0, y0+.26, .05, L*.92, .05, .12);
    if (chance(.2*S.green)) plant(pick(['moss','succulent']),F,rnd(-L*.35,L*.35),y0+.285,.1,rnd(.5,.7));
    return;
  }
  const count = Math.max(1, Math.floor((L-.2)/.5));
  for (let i=0;i<count;i++){
    if (chance(st.winSkip||0)){ if (chance((st.ac||0)*S.clutter)) acUnit(F, ((i+.5)/count-.5)*(L-.3), y0+.45); continue; }
    const x = ((i+.5)/count-.5)*(L-.3), g = litRoom(st), tall = chance(.3);
    const wh = tall ? .5 : .36, wy = y0 + (tall ? .5 : .54);
    box(M.frame, F, x, wy, .005, .32, wh+.06, .05);
    box(g, F, x, wy, .015, .25, wh, .07);
    if (g !== M.glassDark && chance(.35)) box(pick([M.cream2,M.white2,M.awn2]), F, x, wy+wh/2-.07, .053, .25, .12, .045);   // half-drawn blind
    if (chance(st.bars||0)) for (const bx of [-.08,0,.08]) box(M.frame, F, x+bx, wy, .08, .025, wh, .025);
    box(st.trim, F, x, wy-wh/2-.04, .04, .36, .05, .1);
    if (!ground && chance((st.balcony||0)*S.clutter)) balcony(st, F, x, y0);
    else if (chance((st.ac||0)*S.clutter)) acUnit(F, x+.26*(chance(.5)?1:-1), y0+.2);
    if (chance((st.potSill||0)*S.green)) plant('succulent',F,x,wy-wh/2-.015,.1,.75);
  }
}
function acUnit(F,x,y){
  box(M.cream2, F, x, y, .1, .24, .17, .18);
  box(M.frame, F, x-.03, y, .2, .12, .12, .02);
  if (chance(.5)) box(M.metalDark, F, x+.1, y-.3, .03, .03, .45, .03);   // drip pipe
}
function balcony(st,F,x,y0){
  box(st.trim,F,x,y0+.26,.18,.5,.05,.34);
  const rail = pick([M.frame,M.metalDark,M.rust]);
  box(rail,F,x,y0+.46,.34,.5,.03,.03);
  for (const px of [-.24,-.12,0,.12,.24]) box(rail,F,x+px,y0+.37,.34,.025,.18,.025);
  if (chance(.5*S.green)) plant(pick(['fern','succulent','bush']),F,x+rnd(-.12,.12),y0+.285,.2,rnd(.5,.7));
  if (st.laundry && chance(.35*S.clutter)) plant(laundryKind(),F,x+rnd(-.1,.1),y0+.47,.35,.8,'t',true);
  if (chance(.15*S.neon)) box(pick(st.neonMats),F,x,y0+.29,.35,.5,.025,.025);   // neon strip on the balcony edge
}
// roll-up shutter half open over a glowing shop, awning, sign
function shopfront(st,F,L,y0){
  const wdt = L*.72;
  box(M.frame, F, 0, y0+.45, 0, wdt+.08, .8, .05);
  box(pick(LIT_ROOMS), F, 0, y0+.3, .015, wdt, .52, .07);
  box(M.shutter, F, 0, y0+.68, .045, wdt, .26, .06);
  for (let k=0;k<3;k++) box(M.metalDark, F, 0, y0+.58+k*.08, .078, wdt, .02, .045);
  if (chance(.7)) box(pick(st.awn||AWN), F, 0, y0+.9, .2, L*.8, .05, .42, 0, .3);
  if (chance(.85*S.neon)){
    if (chance(.5)) glyphSign(F, rnd(-L/5,L/5), y0+1.08, false, false);
    else { const m=pick(st.neonMats); box(m,F,0,y0+1.06,.05,L*rnd(.35,.6),.14,.05); glow(F,0,y0+1.06,.08,NEON_GLOW.get(m),.8); }   // halos sit on what's lit (out in front they read as dots)
  }
  if (chance(.6*S.clutter)) for (let k=0;k<irand(1,3);k++){
    const x=rnd(-L/2+.2,L/2-.2), z=rnd(.35,.55);
    box(M.crate,F,x,.08,z,.2,.16,.16); if (chance(.6)) blob(pick(VEG),F,x,.19,z,.07);
  }
  if (chance(.35*S.clutter)) vending(F, L/2-.2, .45);
}
// big glowing garage opening with a shutter band and hazard frame
function garage(st,F,L,y0){
  const wdt = Math.min(L*.7, 1.1);
  box(pick([M.hazard,st.trim,M.frame]), F, 0, y0+.46, 0, wdt+.1, .84, .05);
  box(pick([M.interiorCool,M.interiorCool,M.winLit]), F, 0, y0+.34, .015, wdt, .6, .07);
  box(M.shutter, F, 0, y0+.74, .045, wdt, .18, .06);
  box(M.neonAmber, F, 0, y0+.92, .07, .06, .06, .06); glow(F, 0, y0+.92, .08, 'amber', .6);
  if (chance(.5*S.clutter)) for (const s of [-1,1]) box(pick([M.hazard,M.cloth2]), F, s*(wdt/2+.12), .12, .3, .08, .24, .08);   // bollards
}
function vending(F,x,z){
  box(M.white2, F, x, .3, z, .26, .6, .2);
  box(pick([M.interiorCool,M.winLit]), F, x, .36, z+.1, .2, .36, .02);
}
function roundVent(F,x,y,r=.24){
  cyl(M.frame, F, x, y, .04, r, .08, PI/2);
  cyl(M.metalDark, F, x, y, .06, r*.78, .06, PI/2);
  box(M.frame, F, x, y, .1, r*1.5, .04, .03); box(M.frame, F, x, y, .1, .04, r*1.5, .03);
}
function faceCables(F,L,h){
  const n = irand(1,3);
  for (let k=0;k<n;k++){
    const y = rnd(.4, h-.2), sag = rnd(.08,.25);
    const Q = under(F, T(0,0,.08));
    sagLine(Q, L*rnd(.5,.95), y, 0, sag, M.frame, .03);
  }
}

/* ---------- lit box signs with pixel lettering (drawn in code, see genGlyphSigns) ---------- */
function glyphSign(F,x,y,vertical,projecting){
  if (LUX) return;   // the luxury towers keep to their own gold and ivory lights
  const kind = pick(vertical ? GLYPH_V : GLYPH_H);
  const w = SPR.size[kind][0]/PX, h = SPR.size[kind][1]/PX, col = GLYPH_GLOW[kind];
  if (projecting){
    const Q = under(F, T(x, y, w/2+.1, PI/2));
    plant(kind, Q, 0, 0, 0, 1, 'c', true);
    box(M.metalDark, F, x, y+h/2+.03, w/2+.06, .04, .04, w+.14);
    glow(F, x, y, w/2+.1, col, .8+h*.8);
  } else {
    plant(kind, F, x, y, .07, 1, 'c', true);
    glow(F, x, y, .09, col, .5+Math.max(w,h)*.45);
  }
}

function faceExtras(st,F,L,h,lot,firstChunk){
  if (st.cls === 'mid' && firstChunk && L > .9 && chance(.22)) neonTag(F, L, h);   // neon graffiti on the commercial streets
  if (chance(st.vines*S.green)){
    for (let v=0; v<irand(1,3); v++){
      const x=rnd(-L/2+.1,L/2-.1), len=rnd(.3,Math.min(h,1.9));
      plant(hangKind(),F,x,h,.06,clamp(len/1.6,.55,1),'t',true);
    }
  }
  if (chance(.08*S.green)) plant('w_tangle',F,rnd(-L/3,L/3),rnd(.6,h-.4),.055,rnd(.6,.85),'c',true);
  // signs: blades on the corners, flat panels on the wall
  const nSigns = Math.round((st.glyphs||0)*S.neon*rnd(.4,1.2));
  for (let k=0; k<nSigns && lot.signs<7; k++){
    if (h < 1.3) break;
    lot.signs++;
    const r = R(), side = chance(.5)?1:-1;
    if (r < .45) glyphSign(F, side*(L/2-.2), rnd(1.1, h-.6), true, true);
    else if (r < .7 && L > 1.1) glyphSign(F, rnd(-L/3,L/3), rnd(1.1,h-.4), chance(.4), false);
    else if (L > 1.1) iconSign(st, F, rnd(-L/4,L/4), rnd(1.2,h-.45), chance(.4));
  }
  if (chance(st.strips||0)){
    const m = pick(st.neonMats);
    box(m, F, 0, h-.03, .07, L+.06, .035, .035);
    if (chance(.4)) box(m, F, (chance(.5)?1:-1)*(L/2+.02), h/2, .05, .035, h-.1, .035);
  }
  if (chance((st.vents||0)*S.clutter) && h > 1.2) roundVent(F, rnd(-L/3,L/3), rnd(.9,h-.4), rnd(.18,.3));
  if (chance((st.cables||0)*S.clutter)) faceCables(F, L, h);
  if (st.pipes && chance(.5)){
    cyl(pick([M.rust,st.accent[0]]),F,0,rnd(.6,h-.3),.1,.06,L+.1,0,PI/2);
    cyl(M.metal,F,rnd(-L/2+.2,L/2-.2),h/2,.1,.05,h);
  }
}

/* ---------- roofs ---------- */
const ROOF = {
  tank(P,spot){ const s=spot(.3); if(!s) return; const m=pick([M.metal,M.metalDark,M.concD]);
    for (const [dx,dz] of [[-.14,-.14],[.14,-.14],[-.14,.14],[.14,.14]]) cyl(M.metalDark,P,s.x+dx,.12,s.z+dz,.025,.24);
    cyl(m,P,s.x,.46,s.z,.23,.46); sph(m,P,s.x,.69,s.z,.23,.35); cyl(M.frame,P,s.x+.2,.55,s.z,.025,.5); },
  tankSmall(P,spot){ const s=spot(.38); if(!s) return;
    for (const [dx,dz] of [[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]]) cyl(M.metalDark,P,s.x+dx,.18,s.z+dz,.03,.36);
    sph(M.metal,P,s.x,.62,s.z,.34); cyl(M.hazard,P,s.x,.62,s.z,.35,.06); },
  antenna(P,spot){ const s=spot(.15); if(!s) return; const h=rnd(.8,1.6);
    cyl(M.metalDark,P,s.x,h/2,s.z,.02,h); box(M.metalDark,P,s.x,h*.75,s.z,.32,.02,.02,rnd(0,PI)); box(M.metalDark,P,s.x,h*.55,s.z,.22,.02,.02,rnd(0,PI));
    box(M.neonPink,P,s.x,h+.03,s.z,.05,.05,.05); glow(P,s.x,h+.05,s.z,'pink',.6); },
  dish(P,spot){ const s=spot(.25); if(!s) return;
    cyl(M.metalDark,P,s.x,.15,s.z,.03,.3); put(U.sph, M.white2, under(P, T(s.x,.33,s.z,rnd(0,TAU),.44,.12,.44,.7))); },
  shack(P,spot,st){ const s=spot(.45); if(!s) return; const ry=rnd(-.3,.3);
    box(pick([M.corrBlue,M.rustRed,st.walls[0]]),P,s.x,.3,s.z,.7,.6,.55,ry); box(pick([M.rust,M.corrBlue]),P,s.x,.64,s.z,.82,.05,.67,ry,.14);
    box(pick(LIT_ROOMS),P,s.x,.35,s.z+.28,.18,.16,.03,ry); },
  laundry(P,spot){ const s=spot(.45); if(!s) return; const Q = under(P, T(s.x,0,s.z,rnd(0,PI)));
    cyl(M.metalDark,Q,-.4,.3,0,.02,.6); cyl(M.metalDark,Q,.4,.3,0,.02,.6); box(M.metalDark,Q,0,.58,0,.8,.015,.015);
    const n=irand(2,3); for (let k=0;k<n;k++) plant(laundryKind(),Q,-.26+k*.52/Math.max(1,n-1),.575,0,.8,'t',true); },
  pots(P,spot){ const s=spot(.3); if(!s) return;
    for (let k=0;k<irand(2,4);k++) plant(pick(['fern','succulent','fern']),P,s.x+rnd(-.2,.2),0,s.z+rnd(-.2,.2),rnd(.65,.9)); },
  // big rooftop billboard on a frame
  billboard(P,spot,st){ const s=spot(.45); if(!s) return;
    const Q = under(P, T(s.x,0,s.z,rnd(0,PI)));
    for (const x of [-.32,.32]) cyl(M.frame,Q,x,.55,0,.03,1.1);
    box(M.frame,Q,0,.62,0,.8,.04,.05); box(M.frame,Q,0,.62,-.12,.03,.04,.25);
    if (chance(.5)) glyphSign(Q, 0, 1.0, false, false); else iconSign(st, Q, 0, 1.0, false, .7);
    for (const x of [-.25,.25]){ box(M.bulb,Q,x,.66,.1,.06,.04,.06); } },
  // glowing neon ring on a mast
  ring(P,spot,st){ const s=spot(.4); if(!s) return;
    const m = pick(st.neonMats), r = rnd(.35,.5), Q = under(P, T(s.x,0,s.z,rnd(0,PI)));
    cyl(M.frame,Q,0,.5,0,.035,1);
    put(U.torus, m, under(Q, T(0,1+r,0,0,2*r,2*r,2*r)));
    put(U.torus, m, under(Q, T(0,1+r,0,0,2*r*.7,2*r*.7,2*r*.7)));
    glow(Q,0,1+r,0,NEON_GLOW.get(m),2.4*r+1); },
  bonsai(P,spot){ const s=spot(.3); if(!s) return; bonsaiAt(P,s.x,0,s.z); },
  bamboo(P,spot){ const s=spot(.25); if(!s) return; bambooAt(P,s.x,0,s.z); },
  pad(P,spot){ const s=spot(.52); if(!s) return;
    cyl(M.trimCyan,P,s.x,.02,s.z,.52,.03); cyl(M.pad,P,s.x,.04,s.z,.46,.04); glow(P,s.x,.1,s.z,'cyan',.9); },
  chimney(P,spot){ const s=spot(.26); if(!s) return; chimneyAt(P,s.x,0,s.z); },
  vent(P,spot){ const s=spot(.3); if(!s) return;
    box(M.metal,P,s.x,.2,s.z,.4,.4,.4); box(M.metalDark,P,s.x,.44,s.z,.3,.08,.3); },
};
function bonsaiAt(P,x,y,z){ cyl(M.pot,P,x,y+.06,z,.12,.12); plant('bonsai',P,x,y+.1,z,rnd(.8,1.05)); }
function bambooAt(P,x,y,z){ plant('bamboo',P,x,y,z,rnd(.75,1.05)); }
function chimneyAt(P,x,y,z){
  const hc=rnd(1.4,2.6);
  cyl(pick([M.rust,M.concD,M.metal]),P,x,y+hc/2,z,.18,hc);
  cyl(M.hazard,P,x,y+hc*.8,z,.185,.12); cyl(M.metalDark,P,x,y+hc,z,.21,.1);
  box(M.neonAmber,P,x+.19,y+hc*.6,z,.05,.05,.05);
  emitters.push(new THREE.Vector3(x,y+hc+.1,z).applyMatrix4(P));
}
let carPads = [];
function buildCarPad(P, w, d){
  const pw = Math.min(w, d) - .12;
  box(M.concDD, P, 0, .05, 0, pw, .1, pw);
  box(M.hazard, P, 0, .11, 0, .05, .045, pw*.45); box(M.hazard, P, -pw*.14, .11, 0, .045, .045, pw*.45); box(M.hazard, P, pw*.14, .11, 0, .045, .045, pw*.45);   // H marking
  box(M.hazard, P, 0, .11, 0, pw*.28, .045, .045);
  for (const [sx,sz] of CORNERS){ box(M.neonCyan, P, sx*(pw/2-.06), .12, sz*(pw/2-.06), .06, .05, .06); glow(P, sx*(pw/2-.06), .16, sz*(pw/2-.06), 'cyan', .5); }
  for (let t=-pw/2+.25; t<pw/2-.15; t+=.3){ box(M.neonAmber, P, t, .115, pw/2-.05, .04, .03, .04); box(M.neonAmber, P, t, .115, -pw/2+.05, .04, .03, .04); }
  cyl(M.frame, P, pw/2-.08, .45, -pw/2+.08, .02, .7); box(CARM.tail, P, pw/2-.08, .82, -pw/2+.08, .05, .05, .05);
  carPads.push({ pos: new THREE.Vector3(0, .12, 0).applyMatrix4(P), busy:false });
}
let NO_ROOF = false;
function roofItems(st,P,w,d,lot){
  if (NO_ROOF) return;
  if (lot && lot.padOK && carPads.length < 4 && Math.min(w,d) > 1.35 && new THREE.Vector3().applyMatrix4(P).y > 3){
    lot.hasCarPad = true; buildCarPad(P, w, d); return;
  }
  const placed = [];
  const spot = r => { const lo=-w/2+r+.1, hx=w/2-r-.1, lz=-d/2+r+.1, hz=d/2-r-.1; if (hx<lo || hz<lz) return null;
    for (let t=0;t<12;t++){ const x=rnd(lo,hx), z=rnd(lz,hz); if (placed.every(p=>Math.hypot(p.x-x,p.z-z)>p.r+r)){ placed.push({x,z,r}); return {x,z}; } } return null; };
  if (st.parapet){ const t=.07,h=.16; box(st.trim,P,0,h/2,d/2-t/2,w-.1,h,t); box(st.trim,P,0,h/2,-d/2+t/2,w-.1,h,t); box(st.trim,P,w/2-t/2,h/2,0,t,h,d-.1); box(st.trim,P,-w/2+t/2,h/2,0,t,h,d-.1); }
  if (st.lights) for (const [sx,sz] of [[1,1],[-1,-1]]){ box(M.neonAmber,P,sx*(w/2-.1),.06,sz*(d/2-.1),.08,.08,.08); glow(P,sx*(w/2-.1),.12,sz*(d/2-.1),'amber',.8); }
  // AC units and ducts on almost every roof
  for (let k=0;k<irand(1,3)*S.clutter;k++){ const s=spot(.22); if (s){ box(M.cream2,P,s.x,.14,s.z,.3,.28,.3); box(M.frame,P,s.x,.29,s.z,.2,.02,.2); } }
  const n = Math.max(0, Math.round(st.roofN*S.clutter + rnd(-.5,1)));
  for (let k=0;k<n;k++) ROOF[pick(st.roof)](P,spot,st,lot);
}

/* ---------- building helpers ---------- */
// a chunk is one stacked block: {w,d,h,y,ox,oz,ry} in plot coordinates
function chunkBox(P0,c,mat,radius){
  const P = under(P0, T(c.ox, c.y + c.h/2, c.oz, c.ry));
  put(roundedBox(c.w,c.h,c.d,radius), mat, P);
  return P;
}
function decorateChunk(st,P,c,floorBase,lot,first){
  const out = [];
  const n = Math.max(1, Math.round(c.h/FH));
  for (const f of faces(c.w,c.d)){
    const F = under(P, T(f.nx*f.half, -c.h/2, f.nz*f.half, f.ry));
    for (let k=0;k<n;k++) decorateFloor(st, F, f.len, k*FH, floorBase+k, lot);
    faceExtras(st, F, f.len, c.h, lot, first);
    out.push({F, len:f.len});
  }
  return out;
}
// floor slab that overhangs the walls, optionally with a neon edge strip
function slab(st,P0,c,y,over,neonChance){
  put(roundedBox(c.w+over*2,.09,c.d+over*2,.03), st.trim, under(P0, T(c.ox,y,c.oz,c.ry)));
  if (chance(neonChance)){
    const m = pick(st.neonMats), Q = under(P0, T(c.ox,y,c.oz,c.ry)), W=c.w+over*2, Dd=c.d+over*2;
    box(m,Q,0,0,Dd/2+.015,W,.03,.03); box(m,Q,0,0,-Dd/2-.015,W,.03,.03);
    box(m,Q,W/2+.015,0,0,.03,.03,Dd); box(m,Q,-W/2-.015,0,0,.03,.03,Dd);
  }
}
function cornerOf(c,sx,sz){
  const lx=sx*(c.w/2-.08), lz=sz*(c.d/2-.08), cs=Math.cos(c.ry), sn=Math.sin(c.ry);
  return { x: c.ox + lx*cs + lz*sn, z: c.oz - lx*sn + lz*cs };
}
function insideChunk(x,z,c){
  const dx=x-c.ox, dz=z-c.oz, cs=Math.cos(c.ry), sn=Math.sin(c.ry);
  const lx = dx*cs - dz*sn, lz = dx*sn + dz*cs;
  return Math.abs(lx) < c.w/2 && Math.abs(lz) < c.d/2;
}
function annex(st,f,c){
  const aw=rnd(.5,.85), ah=rnd(.45,.75), ad=rnd(.35,.55);
  const x=rnd(-f.len/2+aw/2, Math.max(-f.len/2+aw/2+.01, f.len/2-aw/2)), yy=rnd(ah/2+.05, Math.max(ah/2+.06, c.h-ah/2));
  put(roundedBox(aw,ah,ad,.03), pick(st.walls.concat(st.accent)), under(f.F, T(x,yy,ad/2-.02)));
  box(pick(LIT_ROOMS), f.F, x, yy+.04, ad-.01, aw*.5, ah*.4, .04);
  box(pick([M.rust, M.corrBlue, st.accent[0]]), f.F, x, yy+ah/2+.03, ad/2, aw+.12, .04, ad+.14, 0, .15);
  for (const s of [-1,1]) box(M.metalDark, f.F, x+s*aw*.3, yy-ah/2-.12, ad*.35, .04, .34, .04, 0, -.75);
  if (chance(.4)) acUnit(f.F, x+aw/2+.14, yy);
}
function stairs(st,f,n){
  const L=f.len, run=L*.6, len=Math.hypot(run,FH), rail=pick([M.rust,M.frame,M.metal]);
  for (let k=0;k<n-1;k++){
    const dir = k%2 ? 1 : -1, ang = dir*Math.atan2(FH, run), cy = k*FH + FH/2 + .05;
    box(M.metalDark, f.F, 0, cy, .3, len, .05, .3, 0, 0, ang);
    box(rail, f.F, 0, cy+.25, .45, len, .03, .03, 0, 0, ang);
    box(M.metalDark, f.F, dir*run/2, (k+1)*FH+.05, .3, .34, .05, .32);
    box(rail, f.F, dir*(run/2+.16), (k+1)*FH+.2, .3, .03, .3, .32);
  }
}
// a room of glass: lit interior with a dark frame on every edge
function glassRoom(P0,c,mat){
  const P = under(P0, T(c.ox, c.y+c.h/2, c.oz, c.ry));
  box(mat, P, 0, 0, 0, c.w-.04, c.h-.04, c.d-.04);
  const w=c.w/2, h=c.h/2, d=c.d/2, t=.05;
  for (const sx of [-1,1]) for (const sz of [-1,1]) box(M.frame,P,sx*w,0,sz*d,t,c.h,t);
  for (const sy of [-1,1]){ box(M.frame,P,0,sy*h,d,c.w,t,t); box(M.frame,P,0,sy*h,-d,c.w,t,t); box(M.frame,P,w,sy*h,0,t,t,c.d); box(M.frame,P,-w,sy*h,0,t,t,c.d); }
  for (let x=-w+.3; x<w-.1; x+=.3){ box(M.frame,P,x,0,d,.03,c.h,.03); box(M.frame,P,x,0,-d,.03,c.h,.03); }
  if (chance(.4)) box(pick([M.cream2,M.frame]),P,0,-h+.12,0,c.w*.5,.2,c.d*.4);   // furniture silhouette inside
}


/* ---------- rounded pods: a capsule-shaped level with a big open window into a lit room ---------- */
// Built as a real recess, not a flat panel: rounded floor and roof, a solid back half (the core),
// and a room in front with a lit back wall, a floor, a bed, a lamp and a plant you look into.
// c = {w,d,h,y,ox,oz,ry}; opts.face turns the window to another side; opts.R sets how round it is.
function frameBox(P,x,y,z,w,h,d,t=.04){
  for (const sx of [-1,1]) for (const sz of [-1,1]) box(M.frame,P,x+sx*w/2,y,z+sz*d/2,t,h,t);
  for (const sy of [-1,1]){ box(M.frame,P,x,y+sy*h/2,z+d/2,w,t,t); box(M.frame,P,x,y+sy*h/2,z-d/2,w,t,t); box(M.frame,P,x+w/2,y+sy*h/2,z,t,t,d); box(M.frame,P,x-w/2,y+sy*h/2,z,t,t,d); }
}
function pod(st, P0, c, opts={}){
  const w=c.w, d=c.d, h=c.h;
  const rad = opts.R ?? rnd(.28, Math.min(w,d)*.46);
  const P = under(P0, T(c.ox, c.y, c.oz, c.ry + (opts.face||0)));
  const shell = opts.mat || pick([M.concD, M.concM, M.concDD, M.concL, ...st.walls]);
  put(roundedBox(w, .1, d, rad), shell, under(P, T(0,.05,0)));
  put(roundedBox(w+.06, .13, d+.06, rad+.03), pick([M.frame, M.concDD, shell]), under(P, T(0,h-.065,0)));
  const ch = h-.23, cy = .1+ch/2, wrap = chance(.45);
  const coreR = Math.min(rad, d*.24);
  put(roundedBox(w, ch, d*.5, coreR), shell, under(P, T(0,cy,-d/4)));
  let roomW = w, roomX = 0;
  if (wrap){ put(roundedBox(w*.45, ch, d*.5, coreR), shell, under(P, T(w*.275, cy, d/4))); roomW = w*.55; roomX = -w*.225; }
  const lit = opts.lit || (chance(.65) ? M.winLit : pick(LIT_ROOMS));
  box(lit, P, roomX, cy, .02, roomW-.14, ch-.04, .04);                       // lit back wall
  if (wrap) box(lit, P, roomX+roomW/2-.02, cy, d/4, .04, ch-.04, d/2-.14);   // lit side wall where it wraps
  box(pick([M.wood, M.cream2, M.teal2]), P, roomX, .115, d/4, roomW-.12, .03, d/2-.12);   // floor
  const bx = roomX - roomW*.12;
  box(M.white2, P, bx, .19, d*.17, .46, .1, .3); box(pick(CLOTH), P, bx+.08, .25, d*.17, .3, .03, .31); box(M.white2, P, bx-.17, .27, d*.17, .1, .05, .22);
  box(M.bulb, P, roomX+roomW/2-.18, .5, .1, .06, .09, .06); glow(P, roomX+roomW/2-.18, .5, .14, 'warm', .7);
  if (chance(.7*S.green)) plant(pick(['fern','bush','succulent']), P, roomX+roomW/2-.2, .13, d/2-.2, .7);
  box(M.frame, P, roomX, .1+ch*.45, d/2-.05, roomW-2*Math.min(rad,.3), .03, .03);   // window rail
  if (chance(.5)) box(M.frame, P, roomX, cy, d/2-.05, .035, ch, .035);                // mullion
  // a big round fan on the side of the core, like the reference
  roundVent(under(P, T(-w/2, 0, -d/4, -PI/2)), 0, cy, Math.min(.3, ch*.36));
  // roof: AC units, cables, sometimes a little greenhouse with trees or a lit sign
  const Pr = under(P, T(0,h,0)), roll = R();
  box(M.cream2, Pr, rnd(-w/4,w/4), .14, -d/4, .32, .28, .3); box(M.frame, Pr, 0, .02, -d/4, w*.5, .03, .03);
  if (roll < .45){
    const gw = w*.5, gd = d*.45, gx = -w/4+.05, gz = d/5;
    box(pick([M.metalDark, M.grass]), Pr, gx, .03, gz, gw, .05, gd);
    frameBox(Pr, gx, .33, gz, gw, .6, gd, .03);
    bonsaiAt(Pr, gx, .05, gz);
  } else if (roll < .7) glyphSign(Pr, w/4, .45, false, false);
  if (chance(.35*S.neon)) box(pick(st.neonMats), P, 0, h-.065, d/2+.045, Math.max(.2, w-2*rad), .03, .03);   // neon on the straight front edge
  return c.y + h;
}
// a small building: narrow shop on the ground, a wider rounded pod overhanging it, a pitched-roof side shed
function podHouse(lot, st, P0){
  const bw = rnd(1.3,1.65), bd = rnd(1.3,1.6);
  const base = { w:bw, d:bd, h:1.1, y:0, ox:rnd(-.2,.2), oz:rnd(-.2,.2), ry:0 };
  const P = chunkBox(P0, base, pick(st.walls), .04);
  faces(bw,bd).forEach((f,i) => { const F = under(P, T(f.nx*f.half, -base.h/2, f.nz*f.half, f.ry));
    if (i === 0) shopfront(st, F, f.len, 0); else decorateFloor({...st, shop:0, garage:0}, F, f.len, 0, 1, lot);
    if (i === 1 && chance(.6)) glyphSign(F, 0, .8, true, true); });
  // side shed with a tiled pitched roof and a warm window
  if (chance(.6)){
    const sx = base.ox + bw/2 + .35, P2 = T(sx, 0, base.oz+rnd(-.2,.2));
    box(pick([M.wood, M.concW, M.cream2]), under(P0,P2), 0, .38, 0, .7, .76, .8);
    put(U.prism, D.low.roof, under(P0, under(P2, T(0,.76,0,PI/2,.95,.32,.8))));
    box(M.winLit, under(P0,P2), .36, .42, 0, .03, .28, .32);
  }
  for (const [sx,sz] of CORNERS) if (chance(.5)) box(M.frame, P0, base.ox+sx*(bw/2+.25), .6, base.oz+sz*(bd/2+.2), .07, 1.2, .07);   // posts under the overhang
  const pc = { w:rnd(2.0,2.35), d:rnd(1.9,2.3), h:rnd(1.05,1.25), y:1.12, ox:base.ox+rnd(-.2,.2), oz:base.oz+rnd(-.2,.2), ry:rnd(-.15,.15) };
  let y = pod(st, P0, pc, { face: pick([0, PI/2, PI, -PI/2]) });
  if (chance(.3)){ y = pod(st, P0, { ...pc, w:pc.w*.8, d:pc.d*.8, y, ry:pc.ry+rnd(-.4,.4), ox:pc.ox+rnd(-.2,.2) }, { face: pick([0, PI/2, PI, -PI/2]) }); }
  Object.assign(lot, { height:y, floors:3, occupied:true });
}


/* ---------- extra shapes for the new building types ---------- */
U.cyl8 = new THREE.CylinderGeometry(.5,.5,1,8).toNonIndexed();
const shapeCache = new Map();
// a pie-slice of a cylinder (for curved balconies)
function wedgeGeo(r,h,th0,len){
  const k = ['w',r,h,th0,len].map(v=>(+v).toFixed(2)).join('_');
  if (!shapeCache.has(k)) shapeCache.set(k, new THREE.CylinderGeometry(r,r,h,14,1,false,th0,len).toNonIndexed());
  return shapeCache.get(k);
}
// a curved band: part of a ring between two radii, extruded upward (for the arc megablock)
function arcGeo(rIn,rOut,h,th0,len){
  const k = ['a',rIn,rOut,h,th0,len].map(v=>(+v).toFixed(2)).join('_');
  if (!shapeCache.has(k)){
    const s = new THREE.Shape();
    s.moveTo(Math.cos(th0)*rOut, Math.sin(th0)*rOut);
    s.absarc(0,0,rOut,th0,th0+len,false);
    s.lineTo(Math.cos(th0+len)*rIn, Math.sin(th0+len)*rIn);
    s.absarc(0,0,rIn,th0+len,th0,true);
    const g = new THREE.ExtrudeGeometry(s, { depth:h, bevelEnabled:false, curveSegments:18 });
    g.rotateX(-PI/2);
    shapeCache.set(k, g);
  }
  return shapeCache.get(k);
}
const M2 = { eco: toon(0xe9ece6), ecoGreen: toon(0x7f9f6a), octoTop: toon(0xb8a878), octoBase: toon(0x5a3f55), legBlue: toon(0x4f8fa8), door: toon(0x4f7f86) };

// Garden tower: a rounded white tower with curved planter balconies spiralling up it
function gardenTower(lot, st, P0){
  const floors = irand(7,11), w = rnd(1.6,1.85), rad = w*.3;
  let y = 0, ang = rnd(0,TAU);
  for (let fl=0; fl<floors; fl+=2){
    const n = Math.min(2, floors-fl), h = n*FH, c = { w, d:w, h, y, ox:0, oz:0, ry:0 };
    const P = chunkBox(P0, c, chance(.2) ? M2.ecoGreen : M2.eco, rad);
    // tall glass strips and green panels on each face
    for (const f of faces(w,w)){
      const F = under(P, T(f.nx*f.half, -h/2, f.nz*f.half, f.ry));
      box(M.frame, F, .04, h/2, .005, .4, h-.12, .05);
      box(chance(st.lit) ? pick([M.winLit,M.interiorCool]) : M.glassTeal, F, .04, h/2, .015, .32, h-.16, .07);
      box(M2.ecoGreen, F, -.26, h/2, .01, .09, h-.2, .05);
    }
    // a curved planter balcony wrapping part of the tower, stepping round a little each level
    const len = rnd(1.4, 2.6), R2 = w*.5+.42, yb = y + h - .04;
    put(wedgeGeo(R2, .1, ang, len), M2.eco, under(P0, T(0, yb, 0)));
    put(wedgeGeo(R2+.03, .04, ang, len), M2.ecoGreen, under(P0, T(0, yb+.06, 0)));
    for (let a = ang+.15; a < ang+len-.1; a += .32){
      const px = Math.sin(a)*(R2-.2), pz = Math.cos(a)*(R2-.2);
      if (chance(.85*S.green)) plant(pick(['bush','bushFlower','g_fern2','g_spread1','moss']), P0, px, yb+.05, pz, rnd(.55,.75));
      if (chance(.4*S.green)) plant(hangKind(), under(P0, T(Math.sin(a)*(R2+.02), yb-.04, Math.cos(a)*(R2+.02), a)), 0, 0, 0, rnd(.5,.75), 't', true);
    }
    ang += rnd(.8, 1.6); y += h;
  }
  put(roundedBox(w+.1, .12, w+.1, rad+.05), M2.eco, under(P0, T(0,y+.06,0)));
  box(M.grass, P0, 0, y+.15, 0, w*.6, .06, w*.6);
  for (let k=0;k<irand(2,4);k++) plant(pick(['bush','bushFlower','bonsai']), P0, rnd(-w*.25,w*.25), y+.18, rnd(-w*.25,w*.25), rnd(.6,.85));
  for (const s of [-1,1]){ cyl(M.metal, P0, s*w*.3, y+.8, -w*.3, .025, 1.3); sph(M.bulb, P0, s*w*.3, y+1.47, -w*.3, .05); glow(P0, s*w*.3, y+1.47, -w*.3, 'warm', .6); }
  for (const [sx,sz] of CORNERS) if (chance(.5)){ cyl(M.metalDark,P0,sx*1.1,.35,sz*1.1,.02,.7); box(M.bulb,P0,sx*1.1,.72,sz*1.1,.07,.05,.07); glow(P0,sx*1.1,.72,sz*1.1,'warm',.8); }
  Object.assign(lot, { height:y, floors, occupied:true });
}

// Octagon bar: an eight-sided upper floor overhanging a dark ground floor, slanted window, stairs to a landing, skylights
function octoFrames(P, r, y){
  const ap = r*Math.cos(PI/8), out = [];
  for (let k=0;k<8;k++){ const a = k*PI/4; out.push({ F: under(P, T(Math.sin(a)*ap, y, Math.cos(a)*ap, a)), len: 2*r*Math.sin(PI/8), a }); }
  return out;
}
function octoHouse(lot, st, P0){
  const rb = rnd(.85,.95), rt = rnd(1.1,1.2), hb = 1.0, ht = rnd(1.1,1.3), ox = rnd(-.15,.15);
  const P = under(P0, T(ox,0,0));
  put(U.cyl8, pick([M2.octoBase, M.rustRed, M.concDD]), under(P, T(0,hb/2,0,PI/8,2*rb,hb,2*rb)));
  const base = octoFrames(P, rb, 0);
  // front door with neon either side
  const fd = base[0].F;
  box(M.frame, fd, 0, .42, .01, .42, .8, .05); box(M.red2, fd, 0, .4, .03, .34, .74, .05);
  const nm = pick(st.neonMats);
  for (const s of [-1,1]) box(nm, fd, s*.25, .42, .05, .03, .78, .03);
  glow(fd, 0, .5, .2, NEON_GLOW.get(nm), 1.1);
  vending(base[1].F, 0, .15);
  glyphSign(base[7].F, 0, .6, true, false);
  cyl(M.metal, base[2].F, 0, .2, .25, .12, .4);
  // overhanging upper floor
  put(U.cyl8, M.frame, under(P, T(0,hb+.04,0,PI/8,2*rt+.06,.08,2*rt+.06)));
  put(U.cyl8, pick([M2.octoTop, M.concW, M.cream2, M.teal2]), under(P, T(0,hb+.08+ht/2,0,PI/8,2*rt,ht,2*rt)));
  put(U.cyl8, M.frame, under(P, T(0,hb+.08+ht+.04,0,PI/8,2*rt+.08,.08,2*rt+.08)));
  const top = octoFrames(P, rt, hb+.08);
  // big slanted window on a diagonal face, three panes
  const wf = top[7].F, wl = top[7].len;
  const Wn = under(wf, T(0, ht*.55, .08, 0, 1,1,1, -.18));
  box(M.frame, Wn, 0, 0, 0, wl*.95, ht*.78, .06);
  box(pick([M.winLit,M.winLit,M.interiorCool]), Wn, 0, 0, .03, wl*.85, ht*.68, .04);
  for (const s of [-1,1]) box(M.frame, Wn, s*wl*.14, 0, .06, .03, ht*.68, .03);
  // door with a lamp on the landing side, reached by stairs
  const df = top[1].F;
  box(M.frame, df, 0, .45, .01, .4, .82, .05); box(M2.door, df, 0, .43, .03, .32, .76, .05);
  box(M.bulb, df, 0, .9, .08, .06, .06, .06); glow(df, 0, .9, .14, 'warm', .7);
  box(M.cream2, top[2].F, -.1, .6, .03, .18, .28, .04);   // small keypad and signs
  for (const s of [-1,1]) box(pick(LIT_ROOMS), top[3].F, s*.13, .6, .02, .14, .3, .05);
  roundVent(top[3].F, -.1, .22, .09); roundVent(top[3].F, .12, .22, .09);
  // landing slab and stairs down
  const L = under(P, T(Math.sin(PI/4)*(rt+.25), hb+.02, Math.cos(PI/4)*(rt+.25), PI/4));
  box(M.concL, L, 0, 0, 0, 1.1, .1, .6); box(M.frame, L, 0, .22, .3, 1.1, .03, .03);
  box(M.concL, L, .95, -hb/2, .1, 1.35, .08, .4, 0, 0, -Math.atan2(hb, 1.2));
  box(M.frame, L, .95, -hb/2+.25, .3, 1.35, .03, .03, 0, 0, -Math.atan2(hb, 1.2));
  // blade sign stack of icons
  const bs = top[6].F;
  iconSign(st, bs, 0, .75, true, .55);
  // roof: skylights glowing cyan, ducts along the edge
  const yr = hb+.08+ht+.08;
  for (const [x,z] of [[0,0],[.45,-.35]]){ box(M.frame, P, x, yr+.12, z, .36, .2, .36); box(M.interiorCool, P, x, yr+.23, z, .28, .03, .28); glow(P, x, yr+.3, z, 'cyan', .8); }
  box(M.shutter, P, -.3, yr+.1, .5, 1.1, .16, .18); box(M.shutter, P, -.85, yr-.3, .5, .18, .8, .18);
  box(M.grass, P, 0, yr+.01, 0, rt*1.2, .03, rt*1.2);
  Object.assign(lot, { height: yr, floors:2, occupied:true });
}

// Stilt factory: a sloped-front hall lifted on angled legs, yellow pipes, catwalks, containers underneath
function stiltFactory(lot, st, P0){
  const w = rnd(2.2,2.45), d = rnd(1.6,1.9), lift = rnd(.9,1.15), h = rnd(1.3,1.6), mat = pick([M.concL, M.concM, M.shutter]);
  const P = under(P0, T(0, lift, 0));
  put(roundedBox(w, h, d, .03), mat, under(P, T(0, h/2, 0)));
  // sloped front: a leaning panel of glass bays
  const F = under(P, T(0, 0, d/2, 0));
  const lean = under(F, T(0, h/2, .18, 0, 1,1,1, -.28));
  box(mat, lean, 0, 0, 0, w*.96, h*1.02, .1);
  for (let x=-w/2+.35; x < w/2-.2; x += .42){ box(M.frame, lean, x, 0, .06, .36, h*.8, .03); box(chance(st.lit)?M.interiorCool:M.glassDark, lean, x, 0, .075, .3, h*.74, .02); }
  // side face details
  const Fs = under(P, T(w/2, 0, 0, PI/2));
  for (let x=-d/2+.3; x<d/2-.2; x+=.4) box(chance(st.lit)?M.winLit:M.glassDark, Fs, x, h*.7, .02, .22, .18, .05);
  glyphSign(Fs, 0, h*.35, false, false);
  // legs: angled pairs with feet
  for (const sx of [-.8,-.1,.6].map(v=>v*w/1.6)) for (const sz of [-1,1]){
    const lz = sz*(d/2-.25);
    cyl(M2.legBlue, P0, sx, lift/2, lz, .09, lift+.1, sz*.12, 0);
    box(M.concD, P0, sx, .06, lz+sz*.05, .3, .12, .3);
  }
  // yellow pipes: risers and a run along the side
  for (const x of [-w/2+.15, w/2-.2]){ cyl(M.hazard, P0, x, (lift+h)/2+.1, d/2+.12, .07, lift+h+.2); cyl(M.hazard, P0, x, lift+h+.2, d/4, .07, d/2+.3, PI/2, 0); }
  cyl(M.hazard, P, 0, h*.35, -d/2-.1, .06, w, 0, PI/2);
  // catwalk round the back with rails, and stairs down to the ground
  const C = under(P, T(0, 0, -d/2-.3, 0));
  box(M.frame, C, 0, 0, 0, w, .05, .5); box(M.hazard, C, 0, .3, -.24, w, .03, .03);
  for (let x=-w/2; x<=w/2; x+=.4) box(M.frame, C, x, .15, -.24, .03, .3, .03);
  box(M.frame, C, -w/2-.5, -lift/2, 0, Math.hypot(1, lift), .05, .4, 0, 0, Math.atan2(lift, 1));
  box(M.hazard, C, -w/2-.5, -lift/2+.25, -.2, Math.hypot(1, lift), .03, .03, 0, 0, Math.atan2(lift, 1));
  // roof: tilted panels on a frame, a lamp mast
  for (let x=-w/2+.4; x<w/2-.2; x+=.55){ box(M.frame, P, x, h+.15, 0, .04, .3, d*.7); box(M.corrBlue, P, x, h+.3, 0, .5, .03, d*.7, 0, .35); }
  cyl(M.frame, P, w/2-.2, h+.6, -d/2+.2, .025, 1.2); box(M.neonAmber, P, w/2-.2, h+1.22, -d/2+.2, .06, .06, .06); glow(P, w/2-.2, h+1.24, -d/2+.2, 'amber', .7);
  // containers and barrels underneath
  for (let k=0;k<irand(1,3);k++) box(pick([M.rustRed, M.corrBlue, M.teal2, M.orange]), P0, rnd(-.7,.7), .22, rnd(-.3,.3), .8, .44, .38, pick([0,PI/2]));
  for (let k=0;k<irand(1,3);k++) cyl(pick([M.hazard, M.metal]), P0, rnd(-1,1), .15, d/2+rnd(.2,.5), .1, .3);
  Object.assign(lot, { height: lift+h, floors:3, occupied:true });
}

// Arc megablock: a curved block of balcony bands and big screens, with a saw-tooth crown
function arcBuilding(lot, st, P0){
  const cx = -1.05, cz = -1.05, rIn = 1.15, rOut = 2.25, th0 = -PI/2, len = PI/2;
  const floors = irand(7,10), C = under(P0, T(cx, 0, cz));
  const mat = pick([M.concL, M.concM, M.white2]);
  put(arcGeo(rIn, rOut, floors*FH, th0, len), mat, C);
  for (let fl=0; fl<floors; fl++){
    const y = fl*FH;
    put(arcGeo(rOut-.01, rOut+.05, .36, th0, len), chance(st.lit) ? pick(LIT_ROOMS) : M.glassTeal, under(C, T(0, y+.36, 0)));
    put(arcGeo(rIn-.05, rIn+.01, .36, th0, len), chance(st.lit) ? M.winLit : M.glassDark, under(C, T(0, y+.36, 0)));
    if (fl > 0){
      put(arcGeo(rIn-.08, rOut+.22, .07, th0, len), st.trim, under(C, T(0, y, 0)));
      put(arcGeo(rOut+.19, rOut+.23, .22, th0, len), M.frame, under(C, T(0, y+.07, 0)));
    }
  }
  const H = floors*FH;
  // screens and signs mounted on the curve
  for (let k=0;k<irand(3,6)*S.neon;k++){
    const phi = rnd(.12, PI/2-.12), fy = irand(1, floors-2)*FH + .5;
    const Fr = under(C, T(Math.cos(phi)*(rOut+.25), fy, Math.sin(phi)*(rOut+.25), Math.atan2(Math.cos(phi), Math.sin(phi))));
    if (chance(.45)){ const m = pick(ALLNEON.concat([M.interiorCool,M.interiorPink])); box(M.frame, Fr, 0, 0, 0, .7, .45, .05); box(m, Fr, 0, 0, .03, .62, .37, .03); glow(Fr, 0, 0, .2, m===M.interiorCool?'cyan':m===M.interiorPink?'pink':NEON_GLOW.get(m)||'pink', 1.4); }
    else if (chance(.5)) glyphSign(Fr, 0, 0, false, false); else iconSign(st, Fr, 0, 0, false, .6);
  }
  // saw-tooth crown along the top
  // (few, large fins on a solid parapet: small teeth broke up into bright specks at this resolution)
  put(arcGeo(rOut-.12, rOut+.02, .22, th0, len), M.concDD, under(C, T(0, H, 0)));
  for (let phi = .12; phi < PI/2-.05; phi += .3){
    put(U.prism, M.concDD, under(C, T(Math.cos(phi)*(rOut-.2), H+.2, Math.sin(phi)*(rOut-.2), Math.atan2(Math.cos(phi), Math.sin(phi)), .55, .6, .35)));
  }
  put(arcGeo(rOut+.02, rOut+.05, .04, th0, len), pick(st.neonMats), under(C, T(0, H+.1, 0)));
  // a patch of scaffolding at one end
  const E = under(C, T(rIn+.55, 0, .05, PI));
  for (let x=-.45; x<=.45; x+=.3) box(M.hazard, E, x, H*.35, -.1, .03, H*.7, .03);
  for (let yy=.4; yy<H*.7; yy+=.45) box(M.hazard, E, 0, yy, -.1, 1, .03, .03);
  // trees in the courtyard inside the curve
  for (let k=0;k<3;k++) plant(pick(['bush','bushFlower','g_spread1','bonsai']), C, rnd(.2,.8), 0, rnd(.2,.8), rnd(.8,1.1));
  Object.assign(lot, { height:H, floors, occupied:true });
}


/* ---------- buildings with open space built in: deck house and platform tower ---------- */
const M3 = { greenLit: toon(0x2a4030,{em:0xc8ff8a, kind:'window'}), deckTile: toon(0x5a5f70), deckTile2: toon(0x4c5162) };
// a steel lattice column: two uprights with zig-zag bracing
function latticeColumn(P, x, z, h, ry=0){
  const Q = under(P, T(x, 0, z, ry));
  for (const s of [-.06, .06]) box(M.frame, Q, s, h/2, 0, .045, h, .045);
  const n = Math.max(2, Math.round(h/.3)), seg = h/n, ang = Math.atan2(seg, .12);
  for (let i=0;i<n;i++) box(M.frame, Q, 0, (i+.5)*seg, 0, Math.hypot(.12, seg), .025, .025, 0, 0, i%2 ? ang : -ang);
}
function railingRun(P, x0, x1, z, y, h=.3, ry=0){
  const Q = under(P, T(0, y, 0, ry)), len = x1 - x0;
  box(M.frame, Q, (x0+x1)/2, h, z, len, .035, .035);
  for (let x=x0; x<=x1+.01; x+=.35) box(M.frame, Q, x, h/2, z, .03, h, .03);
}
function tiledDeck(P, w, d, y, glow){
  box(M.concDD, P, 0, y-.06, 0, w, .12, d);
  const n = Math.floor(w/.45), m = Math.floor(d/.45);
  for (let i=0;i<n;i++) for (let j=0;j<m;j++) box((i+j)%2 ? M3.deckTile : M3.deckTile2, P, (i-(n-1)/2)*.45, y+.005, (j-(m-1)/2)*.45, .41, .045, .41);
  if (glow){ box(glow, P, 0, y-.1, d/2+.015, w, .04, .04); box(glow, P, 0, y-.1, -d/2-.015, w, .04, .04); box(glow, P, w/2+.015, y-.1, 0, .04, .04, d); box(glow, P, -w/2-.015, y-.1, 0, .04, .04, d); }
}
// a parked hover car, built from simple shapes
function parkedCar(P, x, y, z, ry){
  const Q = under(P, T(x, y, z, ry));
  put(U.sph, pick([M.white2, M.red2, M.corrBlue, M.hazard]), under(Q, T(0,.16,0,0,.55,.26,.95)));
  put(U.sph, M.glassDark, under(Q, T(0,.26,.02,0,.38,.18,.5)));
  box(M.thruster, Q, 0, .04, 0, .4, .03, .7); glow(Q, 0, 0, 0, 'blue', .9);
  box(M.bulb, Q, 0, .16, .46, .3, .04, .04);
}

// Deck house: an open tiled platform with a kiosk and arcade machines under a heavy block on lattice pillars
function deckHouse(lot, st, P0){
  const W = rnd(2.2,2.4), Dd = rnd(2.1,2.35), deckY = .14, lift = rnd(1.25,1.45);
  const neon = pick(st.neonMats);
  tiledDeck(P0, W, Dd, deckY, neon);
  // kiosk in a back corner: lit front, neon name band
  const kx = -W/2+.5, kz = -Dd/2+.45;
  box(pick([M.concD, M.red2, M.corrBlue]), P0, kx, deckY+.45, kz, .9, .9, .75);
  const Fk = under(P0, T(kx, deckY, kz+.375, 0));
  box(M.frame, Fk, 0, .42, 0, .8, .6, .05); box(pick(LIT_ROOMS), Fk, 0, .4, .015, .7, .5, .07);
  box(neon, Fk, 0, .82, .03, .86, .08, .05); glow(Fk, 0, .82, .15, NEON_GLOW.get(neon), 1.1);
  glyphSign(under(P0, T(kx+.45, deckY, kz, PI/2)), 0, .55, false, false);
  // arcade and vending machines along one side, a bench, a sign board
  for (let k=0;k<irand(2,3);k++){
    const Pm = under(P0, T(W/2-.25, deckY, -Dd/2+.4+k*.38, -PI/2));
    box(pick([M.frame, M.red2, M.corrBlue]), Pm, 0, .3, 0, .3, .6, .26);
    box(pick([M.interiorCool, M.interiorPink, M.winLit]), Pm, 0, .4, .135, .22, .2, .02);
  }
  box(M.wood, P0, 0, deckY+.14, Dd/2-.3, .5, .04, .15); box(M.frame, P0, 0, deckY+.07, Dd/2-.3, .42, .14, .1);
  if (chance(.7*S.green)) plant(pick(['fern','bush','g_fern2']), P0, -W/2+.25, deckY, Dd/2-.25, .75);
  // lattice pillars up to the block
  for (const [sx,sz] of CORNERS) latticeColumn(P0, sx*(W/2-.18), sz*(Dd/2-.18), lift, 0);
  // terrace slab with a railing round it, stairs up from the deck
  const tY = deckY + lift;
  put(roundedBox(W+.3, .12, Dd+.3, .05), M.concD, under(P0, T(0, tY+.06, 0)));
  box(neon, P0, 0, tY, (Dd+.3)/2+.015, W+.3, .03, .03);
  railingRun(P0, -(W+.3)/2+.05, (W+.3)/2-.6, (Dd+.3)/2-.05, tY+.12);
  railingRun(P0, -(W+.3)/2+.05, (W+.3)/2-.05, -(Dd+.3)/2+.05, tY+.12);
  railingRun(P0, -(Dd+.3)/2+.05, (Dd+.3)/2-.05, (W+.3)/2-.05, tY+.12, .3, PI/2);
  // the stair: a landing at the railing gap, then real steps running down along the front face to the ground,
  // carried on two stringers with a handrail and a post under the landing (it used to be one bare slab poking out)
  {
    const Q = under(P0, T(0, 0, (Dd+.3)/2 + .17, 0)), y1 = tY + .12, xt = (W+.3)/2 - .3;
    const n = 9, rise = y1/(n+1), run = .15, L = n*run, x0 = xt - .15, ang = Math.atan2(y1 - rise, L);
    box(M.concL, Q, xt, y1 - .03, 0, .3, .06, .32);                                      // landing
    box(M.frame, Q, xt, (y1 - .06)/2, .12, .05, y1 - .06, .05);                           // its post
    for (let i=0;i<n;i++) box(M.concL, Q, x0 - (i+.5)*run, y1 - (i+1)*rise - .02, 0, run + .01, .04, .3);   // treads
    const cx = x0 - L/2, cy = (y1 - rise)/2, len = Math.hypot(L, y1 - rise);
    for (const s of [-1,1]) box(M.frame, Q, cx, cy - .04, s*.16, len, .07, .03, 0, 0, ang);   // stringers
    box(M.frame, Q, cx, cy + .3, .16, len, .03, .03, 0, 0, ang);                             // handrail
    for (const u of [.15, .85]) box(M.frame, Q, x0 - u*L, (y1 - rise)*(1 - u) + .15, .16, .03, .3, .03);
    box(M.frame, Q, xt + .14, y1 + .15, .16, .03, .3, .03);
  }
  // the block: square body with beveled top edges carrying slanted glowing windows
  const bw = W-.4, bd = Dd-.4, bh = rnd(.75,.95), by = tY+.12;
  box(pick([M.concM, M.concDD, M.frame, st.walls[0]]), P0, 0, by+bh/2, 0, bw, bh, bd);
  box(M.concD, P0, 0, by+bh+.2, 0, bw-.7, .4, bd-.7);
  const litMat = chance(.5) ? M3.greenLit : pick([M.winLit, M.interiorCool]);
  for (const [nx,nz,len] of [[0,1,bw],[0,-1,bw],[1,0,bd],[-1,0,bd]]){
    const Q = under(P0, T(nx*(bw/2-.18), by+bh+.2, nz*(bd/2-.18), Math.atan2(nx,nz)));
    box(M.concDD, Q, 0, 0, 0, len-.36, .5, .08, 0, -.72);
    if (chance(.7)) for (let x=-len/2+.45; x<len/2-.4; x+=.42) box(litMat, Q, x, 0, .05, .34, .36, .02, 0, -.72);
  }
  // side windows, a door onto the terrace, vents on top
  const Fs = under(P0, T(0, by, bd/2, 0));
  box(M.frame, Fs, bw/2-.35, .35, .01, .34, .62, .04); box(M2.door, Fs, bw/2-.35, .33, .025, .28, .56, .04);
  for (const x of [-.3, 0]) box(pick(LIT_ROOMS), Fs, x, .45, .01, .2, .3, .045);
  roundVent(under(P0, T(-bw/2, by, 0, -PI/2)), 0, bh*.55, .16);
  for (const x of [-.25,.25]) box(M.shutter, P0, x, by+bh+.46, -.1, .3, .12, .5);
  Object.assign(lot, { height: by+bh+.45, floors:3, occupied:true });
}

// an open-air floor: slab, lit back wall, furniture, columns at the corners, a rail across the front
function openFloor(st, P0, c, face){
  const P = under(P0, T(c.ox, c.y, c.oz, c.ry + face));
  const w = c.w, d = c.d, h = c.h;
  box(pick(LIT_ROOMS), P, 0, h/2, -d/2+.04, w-.1, h-.1, .06);
  box(st.walls[0], P, -w/2+.04, h/2, 0, .06, h-.1, d);
  box(pick([M.wood, M.cream2, M3.deckTile]), P, 0, .03, 0, w, .05, d);
  box(M.cream2, P, rnd(-.3,.3), .2, -d/2+.3, .6, .3, .3);
  box(M.bulb, P, w/2-.25, h-.2, 0, .08, .06, .08); glow(P, w/2-.25, h-.24, 0, 'warm', .8);
  for (const sx of [-1,1]) box(st.trim, P, sx*(w/2-.05), h/2, d/2-.05, .1, h, .1);
  railingRun(P, -w/2+.1, w/2-.1, d/2-.05, .02);
  if (chance(.7*S.green)) plant(pick(['fern','bush','bamboo']), P, -w/2+.3, .05, d/2-.3, .75);
}
// Platform tower: open-air floors, a cantilevered landing pad with a parked hover car, a side volume, fire stairs, an open roof deck
function platformTower(lot, st, P0){
  const w = rnd(1.6,1.85), d = rnd(1.6,1.85), floors = irand(6,9), mat = pick(st.walls);
  const face = pick([0, PI/2, PI, -PI/2]);
  let y = 0; const F = [];
  for (let fl=0; fl<floors; fl++){
    const c = { w, d, h:FH, y, ox:0, oz:0, ry:0 };
    if (fl > 0 && fl < floors-1 && chance(.28)){ openFloor(st, P0, c, face); }
    else {
      const P = chunkBox(P0, c, mat, .03);
      const fs = decorateChunk(st, P, c, fl, lot, fl===0);
      if (fl === 1) F.push(...fs);
    }
    y += FH;
    if (fl < floors-1){ put(roundedBox(w+.14,.07,d+.14,.03), st.trim, under(P0, T(0,y,0))); if (chance(.4)) box(pick(st.neonMats), P0, 0, y, d/2+.085, w+.14, .03, .03); }
  }
  // side volume jutting out partway up
  const sy = irand(2, Math.max(2, floors-3))*FH, sf = Math.atan2(Math.sin(face+PI/2), Math.cos(face+PI/2));
  const sx = Math.sin(sf)*(w/2+.35), sz = Math.cos(sf)*(d/2+.35);
  const side = { w:.9, d:1.2, h:FH*2, y:sy, ox:sx, oz:sz, ry:sf };
  const Ps = chunkBox(P0, side, pick(st.walls), .03);
  decorateChunk(st, Ps, side, 2, lot, false);
  // cantilevered landing pad with guide lights, struts and a parked hover car
  const py = irand(3, floors-2)*FH + .02, pf = face + PI;
  const Pp = under(P0, T(Math.sin(pf)*(d/2+.7), py, Math.cos(pf)*(d/2+.7), pf));
  box(M.concD, Pp, 0, 0, 0, w+.3, .1, 1.4);
  box(M.neonCyan, Pp, 0, .03, .71, w+.3, .03, .03); box(M.neonCyan, Pp, (w+.3)/2+.015, .03, 0, .03, .03, 1.4); box(M.neonCyan, Pp, -(w+.3)/2-.015, .03, 0, .03, .03, 1.4);
  for (let z=-.5; z<=.55; z+=.25){ box(M.neonAmber, Pp, -.35, .06, z, .06, .02, .1); box(M.neonAmber, Pp, .35, .06, z, .06, .02, .1); }
  for (const s of [-1,1]) box(M.frame, Pp, s*(w/2-.1), -.45, -.35, .06, .06, 1.1, .7);
  parkedCar(Pp, 0, .05, .05, rnd(-.3,.3));
  railingRun(Pp, -(w+.3)/2+.05, (w+.3)/2-.05, .68, .05, .25);
  // fire escape up one face
  if (F.length) stairs(st, pick(F), Math.min(floors, 6));
  // open roof deck: railing, billboard, ring sign, antenna
  const Pr = under(P0, T(0, y, 0));
  box(st.trim, Pr, 0, .04, 0, w+.1, .08, d+.1);
  railingRun(Pr, -w/2, w/2, d/2-.02, .08); railingRun(Pr, -w/2, w/2, -d/2+.02, .08);
  if (chance(.5)) ROOF.billboard(Pr, () => ({x:-w/4, z:0}), st); else glyphSign(under(Pr, T(0,0,-d/2+.1,0)), 0, .6, false, false);
  ROOF.ring(Pr, () => ({x:w/4, z:d/4}), st);
  cyl(M.frame, Pr, -w/2+.15, .7, d/2-.15, .025, 1.4); box(M.neonPink, Pr, -w/2+.15, 1.42, d/2-.15, .05, .05, .05); glow(Pr, -w/2+.15, 1.44, d/2-.15, 'pink', .6);
  Object.assign(lot, { height:y, floors, occupied:true });
}


/* ---------- glass hotel: floor-to-ceiling glass lit from inside, often lifted on steel truss legs ---------- */
const M4 = { neonPurple: toon(0x3a2a60,{em:0x9b6bff, kind:'neon'}), neonBlue: toon(0x1a2a60,{em:0x4f7bff, kind:'neon'}), beacon: toon(0x401010,{em:0xff3030, kind:'neon'}),
             pool: toon(0x1a4050,{em:0x49d8ff, kind:'window'}), room: toon(0x5a4630,{em:0xffd89a, kind:'window'}) };
NEON_GLOW.set(M4.neonPurple, 'pink'); NEON_GLOW.set(M4.neonBlue, 'cyan');
NEON_NAME.set(M4.neonPurple, 'pink'); NEON_NAME.set(M4.neonBlue, 'cyan');
STY.mid.neonMats = [M.neonPink, M4.neonPurple, M4.neonPurple, M.neonAmber, M.neonCyan];   // the commercial quarter leans purple and warm
// a heavy truss leg: four uprights with X bracing on every side and red beacons climbing it
function trussLeg(P, x, z, h){
  const Q = under(P, T(x, 0, z)), a = .16;
  for (const [sx,sz] of CORNERS) box(M.frame, Q, sx*a, h/2, sz*a, .07, h, .07);
  const n = Math.max(2, Math.round(h/.45)), seg = h/n, diag = Math.hypot(2*a, seg), ang = Math.atan2(seg, 2*a);
  for (let i=0;i<n;i++){
    const yy = (i+.5)*seg, sg = i%2 ? 1 : -1;
    box(M.frame, Q, 0, yy, a, diag, .035, .035, 0, 0, sg*ang); box(M.frame, Q, 0, yy, -a, diag, .035, .035, 0, 0, -sg*ang);
    box(M.frame, Q, a, yy, 0, .035, .035, diag, 0, sg*ang, 0); box(M.frame, Q, -a, yy, 0, .035, .035, diag, 0, -sg*ang, 0);
  }
  for (let yy=.5; yy<h-.2; yy+=.9){ box(M4.beacon, Q, a+.04, yy, 0, .05, .05, .05); glow(Q, a+.1, yy, 0, 'pink', .45); }
}
function glassHotel(lot, st, P0, variant){
  const v = variant || pick(['stilts','stilts','podium','tower']);
  const tall = v === 'tower';
  const w = tall ? rnd(1.5,1.75) : rnd(1.9,2.25), d = tall ? rnd(1.5,1.75) : rnd(1.8,2.15);
  const floors = tall ? irand(7,10) : irand(3,5);
  const trim = pick([M4.neonPurple, M4.neonPurple, M4.neonBlue, M.neonCyan, M.neonPink]);
  let y = 0;
  if (v === 'stilts'){
    const lift = rnd(1.6,2.3);
    for (const [sx,sz] of CORNERS) trussLeg(P0, sx*(w/2-.05), sz*(d/2-.05), lift);
    for (const sz of [-1,1]) box(M.frame, P0, 0, lift*.55, sz*(d/2-.05), w, .06, .06);           // cross beams between legs
    for (const sx of [-1,1]) box(M.frame, P0, sx*(w/2-.05), lift*.55, 0, .06, .06, d);
    y = lift;
    lot.liftBase = lift;
  }
  // platform slab, wider than the building, with lights and plants round the rim
  const pw = w+.55, pd = d+.55;
  box(M.concDD, P0, 0, y+.12, 0, pw, .24, pd);
  box(trim, P0, 0, y+.02, pd/2+.015, pw, .03, .03); box(trim, P0, 0, y+.02, -pd/2-.015, pw, .03, .03);
  for (let x=-pw/2+.12; x<pw/2; x+=.3){ box(M.bulb, P0, x, y+.2, pd/2-.06, .05, .05, .05); box(M.bulb, P0, x, y+.2, -pd/2+.06, .05, .05, .05); }
  for (let k=0;k<8;k++) if (chance(.75*S.green)){ const e = pick(CORNERS); plant(pick(['bush','g_spread1','g_fern3','bushFlower']), P0, e[0]*rnd(.3,pw/2-.12), y+.24, e[1]*(pd/2-.14), rnd(.55,.75)); }
  railingRun(P0, -pw/2+.05, pw/2-.05, pd/2-.03, y+.24, .22);
  y += .24;
  // glass floors: a lit interior behind a grid of dark mullions, furniture silhouettes, some rooms curtained or dark
  for (let fl=0; fl<floors; fl++){
    const h = FH;
    box(M4.room, P0, 0, y+h/2, 0, w-.12, h-.08, d-.12);
    for (const f of faces(w,d)){
      const F = under(P0, T(f.nx*f.half, y, f.nz*f.half, f.ry));
      const cells = Math.max(2, Math.round(f.len/.42)), cw = f.len/cells;
      for (let i=0;i<=cells;i++) box(M.frame, F, -f.len/2 + i*cw, h/2, -.02, .07, h, .07);          // mullions
      for (let i=0;i<cells;i++){
        const x = -f.len/2 + (i+.5)*cw, r = R();
        if (r < .12) box(M.frame, F, x, h/2, -.04, cw-.07, h-.12, .02);                              // dark room
        else if (r < .3) box(pick([M.cream2, M.white2, M.awn2]), F, x, h*.62, -.04, cw-.1, h*.55, .02);   // curtains drawn
        else if (r < .55) box(M.frame, F, x + rnd(-.05,.05), .2, -.1, cw*.55, .16, .1);             // furniture against the light
        if (r > .8 && fl > 0 && chance(.6*S.green)) plant(pick(['fern','bonsai','bush']), F, x, .02, .1, .6);   // balcony plant
      }
    }
    y += h;
    // floor slab with a neon edge
    box(M.concDD, P0, 0, y, 0, w+.12, .07, d+.12);
    box(trim, P0, 0, y-.03, (d+.12)/2+.015, w+.12, .03, .03); box(trim, P0, 0, y-.03, -(d+.12)/2-.015, w+.12, .03, .03);
    box(trim, P0, (w+.12)/2+.015, y-.03, 0, .03, .03, d+.12); box(trim, P0, -(w+.12)/2-.015, y-.03, 0, .03, .03, d+.12);
    y += .035;
  }
  // tall glowing sign on a corner
  const cs = pick(CORNERS), Fsg = under(P0, T(cs[0]*(w/2+.12), y - floors*FH*.5, cs[1]*(d/2+.02), 0));
  box(M.frame, Fsg, 0, 0, 0, .24, Math.min(1.8, floors*FH*.7), .08);
  box(trim, Fsg, 0, 0, .05, .18, Math.min(1.7, floors*FH*.66), .02);
  glyphSign(Fsg, 0, 0, true, false);
  glow(Fsg, 0, 0, .2, NEON_GLOW.get(trim) || 'pink', 1.6);
  // roof terrace: deck, glowing pool, palms and plants, a cabana, lights round the edge
  const Pr = under(P0, T(0, y, 0));
  box(M3.deckTile, Pr, 0, .03, 0, w, .06, d);
  const plw = w*.45, pld = d*.35;
  box(M.frame, Pr, -w*.15, .07, 0, plw+.08, .06, pld+.08); box(M4.pool, Pr, -w*.15, .09, 0, plw, .04, pld); glow(Pr, -w*.15, .15, 0, 'cyan', 1.2);
  box(M.white2, Pr, w*.3, .18, -d*.25, .4, .3, .35); box(M4.room, Pr, w*.3, .2, -d*.25+.18, .3, .18, .02);
  for (let k=0;k<irand(3,6);k++) plant(pick(['bamboo','bonsai','bush','g_fern3','bushFlower']), Pr, rnd(-w/2+.15, w/2-.15), .06, pick([-1,1])*rnd(d*.28, d/2-.12), rnd(.6,.9));
  for (let x=-w/2+.1; x<w/2; x+=.3){ box(M.bulb, Pr, x, .1, d/2-.03, .04, .04, .04); box(M.bulb, Pr, x, .1, -d/2+.03, .04, .04, .04); }
  railingRun(Pr, -w/2+.02, w/2-.02, d/2-.02, .06, .22); railingRun(Pr, -w/2+.02, w/2-.02, -d/2+.02, .06, .22);
  cyl(M.frame, Pr, w/2-.15, .55, d/2-.15, .025, 1.1); box(M4.beacon, Pr, w/2-.15, 1.12, d/2-.15, .05, .05, .05); glow(Pr, w/2-.15, 1.14, d/2-.15, 'pink', .5);
  Object.assign(lot, { height:y+.1, floors, occupied:true });
}

/* ---------- luxury curves: white organic towers of glass, garden terraces and domes ---------- */
// After the garden-city reference: smooth white floor plates with rounded edges and a thin cyan light line, floors
// of glass lit warm from inside behind slim white mullions, terraces planted with trees, ponds with lily pads, glass
// railings, glass domes over gardens on the roofs, great white arches sweeping up and over, and sleek white hover
// cars parked on cantilevered pads.
Object.assign(M, {
  lxWhite: toon(0xf1f3f0), lxWhite2: toon(0xdde3e2), lxLine: toon(0x1c5050, { em:0x6ff2ee, kind:'trim' }),
  // warm rooms: golden by day; at night the glow is a deep orange, which the night boost lifts to a warm gold
  lxRoom: toon(0xd6a868, { em:0xd8843a, kind:'window' }), lxRoom2: toon(0xc89a66, { em:0xe0985a, kind:'window' }), lxRoom3: toon(0xb8925e, { em:0xc8702a, kind:'window' }),
  lxLeaf: toon(0x5a8a48, { flat:1 }), lxLeaf2: toon(0x7fa85a, { flat:1 }), lxBlossom: toon(0xe8eee4, { flat:1 }), lxBlossom2: toon(0xe0cce0, { flat:1 }),
  lxWater: toon(0x3f8a92, { em:0x163c44, kind:'trim' }), lxPad: toon(0x5f9a4a, { flat:1 }),
});
M.lxGlass = new THREE.MeshBasicMaterial({ color: 0xd8f2f4, transparent: true, opacity: .2, depthWrite: false }); M.lxGlass.userData.colorOnly = true;
const LX_ROOMS = [M.lxRoom, M.lxRoom, M.lxRoom2, M.lxRoom3];
// a flat plate with rounded corners (a disc when r is half the width), extruded from y 0 to 1; cached by size
const lxPlateCache = new Map();
function lxPlate(mat, P, x, y, z, w, d, r, h, ry = 0){
  r = Math.max(.01, Math.min(r, w/2, d/2));
  const key = [w, d, r].map(v => v.toFixed(2)).join(',');
  let g = lxPlateCache.get(key);
  if (!g){
    const s = new THREE.Shape(), hx = w/2 - r, hz = d/2 - r;
    s.moveTo(-hx, -d/2); s.lineTo(hx, -d/2); s.absarc(hx, -hz, r, -PI/2, 0, false); s.lineTo(w/2, hz); s.absarc(hx, hz, r, 0, PI/2, false);
    s.lineTo(-hx, d/2); s.absarc(-hx, hz, r, PI/2, PI, false); s.lineTo(-w/2, -hz); s.absarc(-hx, -hz, r, PI, 1.5*PI, false);
    g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 7 }); g.rotateX(PI/2); g.translate(0, 1, 0); if (g.index) g = g.toNonIndexed();
    lxPlateCache.set(key, g);
  }
  put(g, mat, under(P, T(x, y, z, ry, 1, h, 1)));
}
// points round a rounded rectangle, about `step` apart, each with the angle that turns local +z outward
function lxRing(w, d, r, step){
  r = Math.max(.01, Math.min(r, w/2, d/2));
  const hx = w/2 - r, hz = d/2 - r, pcs = [];
  const line = (x0, z0, x1, z1, nx, nz) => pcs.push({ len: Math.hypot(x1 - x0, z1 - z0), at: u => [x0 + (x1 - x0)*u, z0 + (z1 - z0)*u, nx, nz] });
  const arc = (cx, cz, a0, a1) => pcs.push({ len: Math.abs(a1 - a0)*r, at: u => { const a = a0 + (a1 - a0)*u; return [cx + Math.cos(a)*r, cz + Math.sin(a)*r, Math.cos(a), Math.sin(a)]; } });
  line(-hx, d/2, hx, d/2, 0, 1); arc(hx, hz, PI/2, 0); line(w/2, hz, w/2, -hz, 1, 0); arc(hx, -hz, 0, -PI/2);
  line(hx, -d/2, -hx, -d/2, 0, -1); arc(-hx, -hz, -PI/2, -PI); line(-w/2, -hz, -w/2, hz, -1, 0); arc(-hx, hz, PI, PI/2);
  const total = pcs.reduce((s, p) => s + p.len, 0), n = Math.max(6, Math.round(total/step)), out = [];
  for (let k=0; k<n; k++){
    let s = (k + .5)*total/n;
    for (const p of pcs){ if (s <= p.len || p === pcs[pcs.length - 1]){ const [x, z, nx, nz] = p.at(p.len ? Math.min(1, s/p.len) : 0); out.push({ x, z, ry: Math.atan2(nx, nz), seg: total/n }); break; } s -= p.len; }
  }
  return out;
}
// a floor plate: white, a hair of cyan light round its rim
function lxSlab(P, x, y, z, w, d, r, h = .12, line = true){
  lxPlate(M.lxWhite, P, x, y - h, z, w, d, r, h);
  if (line) lxPlate(M.lxLine, P, x, y - h*.62, z, w + .02, d + .02, r + .01, .03);
}
// a floor of glass: a warm lit room behind slim white mullions, a few things silhouetted against the light
function lxGlassFloor(P, x, y, z, w, d, r, h, filter, step = .34){
  lxPlate(pick(LX_ROOMS), P, x, y, z, w - .06, d - .06, Math.max(.02, r - .03), h);
  lxPlate(M.lxGlass, P, x, y + .01, z, w + .01, d + .01, r + .005, h - .02);   // the glass skin, a cool sheen over the warm rooms
  for (const p of lxRing(w, d, r, step)){
    if (filter && !filter(p.x + x, p.z + z)) continue;
    box(M.lxWhite2, P, x + p.x, y + h/2, z + p.z, .035, h, .035);
    const F = under(P, T(x + p.x, y, z + p.z, p.ry)), q = R();
    if (q < .12) box(pick([M.cream2, M.white2]), F, p.seg/2, h*.6, .005, p.seg*.8, h*.6, .015);          // curtains drawn
    else if (q < .3) box(M.frame, F, p.seg/2, .16, .01, p.seg*.6, .14, .02);                             // a sofa against the light
  }
}
// glass railing round (part of) a plate's edge
function lxRail(P, x, y, z, w, d, r, keep){
  for (const p of lxRing(w, d, r, .3)){
    if (keep && !keep(p.x + x, p.z + z)) continue;
    const F = under(P, T(x + p.x, y, z + p.z, p.ry));
    box(M.lxGlass, F, 0, .13, 0, p.seg + .01, .24, .015); box(M.lxWhite, F, 0, .26, 0, p.seg + .02, .025, .03);
  }
}
// a little tree: a thin trunk and a few rounded clumps of leaves (or blossom)
function lxTree(P, x, y, z, s = 1){
  const h = rnd(.35, .5)*s, mats = chance(.3) ? [M.lxBlossom, M.lxBlossom2, M.lxLeaf2] : [M.lxLeaf, M.lxLeaf2, M.lxLeaf];
  cyl(M.trunk, P, x, y + h/2, z, .025*s, h);
  for (let k=0; k<3 + (s > 1 ? 1 : 0); k++) blob(pick(mats), P, x + rnd(-.13, .13)*s, y + h + rnd(-.02, .14)*s, z + rnd(-.13, .13)*s, rnd(.13, .2)*s, .75);
}
// a pond with lily pads, set into a terrace
function lxPond(P, x, y, z, w, d){
  lxPlate(M.lxWhite2, P, x, y, z, w + .08, d + .08, Math.min(w, d)/2, .05);
  lxPlate(M.lxWater, P, x, y + .05, z, w, d, Math.min(w, d)/2 - .02, .012);
  for (let k=0; k<Math.round(w*d*14); k++){ const px = x + rnd(-w/2 + .06, w/2 - .06), pz = z + rnd(-d/2 + .06, d/2 - .06);
    put(U.cyl16, M.lxPad, under(P, T(px, y + .066, pz, 0, .07, .008, .07))); if (chance(.25)) box(pick([M.lxBlossom, M.cloth1]), P, px, y + .075, pz, .025, .02, .025); }
}
// a terrace garden scattered over an area: shrubs, a tree or two, flowers; skip(x, z) keeps clear what must stay clear
function lxGarden(P, y, pts, trees){
  pts.forEach(([x, z], k) => { if (k < trees && chance(.85*S.green)) lxTree(P, x, y, z, rnd(.8, 1.1)); else if (chance(.85*S.green)) plant(pick(['bush','bushFlower','g_fern2','fern','g_spread1','bonsai']), P, x, y, z, rnd(.55, .8)); });
}
// a sleek white hover car
function lxCar(P, x, y, z, ry){
  const Q = under(P, T(x, y, z, ry));
  put(U.sph, M.lxWhite, under(Q, T(0, .15, 0, 0, .34, .2, .78)));
  put(U.sph, M.glassDark, under(Q, T(0, .22, -.04, 0, .24, .13, .38)));
  box(M.lxLine, Q, 0, .1, 0, .3, .02, .62); glow(Q, 0, .05, 0, 'cyan', .7);
  for (const s of [-1, 1]) put(U.sph, M.lxWhite2, under(Q, T(s*.16, .1, .22, 0, .08, .08, .16)));
}
// a pad cantilevered from a floor, with guide lights and a car on it; local +z points away from the building
function lxCarPad(P, x, y, z, ry){
  const Q = under(P, T(x, y, z, ry));
  lxPlate(M.lxWhite2, Q, 0, -.07, .35, .62, .95, .12, .07);
  box(M.lxLine, Q, 0, -.04, .83, .5, .025, .02); for (const s of [-1, 1]) box(M.lxLine, Q, s*.315, -.04, .35, .02, .025, .8);
  box(M.frame, Q, 0, -.03, .35, .05, .01, .7);
  strut(M.lxWhite2, Q, 0, -.07, .7, 0, -.55, -.05, .06);
  lxCar(Q, 0, 0, .4, rnd(-.15, .15));
}
// a glass dome on a white ring, a garden under it
U.lxDome = new THREE.SphereGeometry(1, 16, 7, 0, TAU, 0, PI/2);
U.lxRib = new THREE.TorusGeometry(1, .02, 4, 18, PI);
U.lxHoop = new THREE.TorusGeometry(1, .02, 4, 28);
function lxDome(P, x, y, z, r){
  lxPlate(M.lxWhite, P, x, y, z, 2*r + .16, 2*r + .16, r + .08, .1);
  lxPlate(M.lxLine, P, x, y + .04, z, 2*r + .18, 2*r + .18, r + .09, .025);
  lxPlate(M.grass, P, x, y + .1, z, 2*r - .04, 2*r - .04, r - .02, .03);
  lxTree(P, x + rnd(-.1, .1), y + .12, z + rnd(-.1, .1), r*1.4);
  for (let k=0; k<4; k++){ const a = rnd(0, TAU), rr = rnd(.35, .75)*r; plant(pick(['bush','bushFlower','fern','g_fern2']), P, x + Math.sin(a)*rr, y + .13, z + Math.cos(a)*rr, rnd(.45, .65)); }
  glow(P, x, y + r*.5, z, 'warm', 1.0);
  put(U.lxDome, M.lxGlass, under(P, T(x, y + .1, z, 0, r, r, r)));
  for (let k=0; k<3; k++) put(U.lxRib, M.lxWhite, under(P, T(x, y + .1, z, k*PI/3, r, r, r)));
  put(U.lxHoop, M.lxWhite, under(P, T(x, y + .1 + r*.55, z, 0, r*.84, r*.84, r*.84, PI/2)));
}
// a white band following a curve in P's x-y plane (pts: [[x, y], ...]); width runs along z
const _lbx = new THREE.Vector3(), _lby = new THREE.Vector3(), _lbz = new THREE.Vector3(0, 0, 1), _lbs = new THREE.Vector3();
function lxBand(mat, P, pts, width, thick, z = 0){
  for (let k=0; k<pts.length - 1; k++){
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], len = Math.hypot(x1 - x0, y1 - y0); if (len < 1e-4) continue;
    _lbx.set((x1 - x0)/len, (y1 - y0)/len, 0); _lby.crossVectors(_lbz, _lbx);
    const m = new THREE.Matrix4().makeBasis(_lbx, _lby, _lbz).scale(_lbs.set(len + thick*.6, thick, width)).setPosition((x0 + x1)/2, (y0 + y1)/2, z);
    put(U.box, mat, under(P, m));
  }
}
// a curve offset outward from its own path (for the light line on the outside of a band)
function lxOffset(pts, o){
  return pts.map(([x, y], k) => { const [ax, ay] = pts[Math.max(0, k - 1)], [bx, by] = pts[Math.min(pts.length - 1, k + 1)], l = Math.hypot(bx - ax, by - ay) || 1; return [x + (by - ay)/l*o, y - (bx - ax)/l*o]; });
}

// Dome garden tower: round glass floors on white discs, planted terraces curving out from the front, a glass dome
// garden on the roof, and a great white arch rising behind it from the ground and over the top
function domeTower(lot, st, P0){
  lot.white = true;
  const r = rnd(.74, .84), floors = irand(4, 7), face = pick([0, PI/2, PI, -PI/2]), P = under(P0, T(0, 0, 0, face));
  lxPlate(M.lxWhite2, P, 0, 0, 0, 2*r + .5, 2*r + .5, r + .25, .06);                                   // the forecourt
  let y = .06, ang = rnd(-.6, .6);
  const pad = irand(1, floors - 2), padSide = pick([-1, 1]);
  for (let fl=0; fl<floors; fl++){
    const h = FH - .12;
    lxGlassFloor(P, 0, y, 0, 2*r, 2*r, r, h);
    y += h + .12;
    lxSlab(P, 0, y, 0, 2*r + .2, 2*r + .2, r + .1);
    if (fl < floors - 1 && fl !== pad && chance(.75)){   // a terrace curving out of the front, planted, with a glass rail
      const len = rnd(1.3, 2.2), th0 = ang - len/2, R2 = r + rnd(.42, .55);
      put(wedgeGeo(R2, .12, th0, len), M.lxWhite, under(P, T(0, y - .06, 0)));
      put(wedgeGeo(R2 + .01, .03, th0, len), M.lxLine, under(P, T(0, y - .07, 0)));
      const pts = []; for (let a = th0 + .2; a < th0 + len - .1; a += rnd(.32, .45)){ const rr = rnd(r + .14, R2 - .14); pts.push([Math.sin(a)*rr, Math.cos(a)*rr]); }
      lxGarden(P, y, pts, chance(.7) ? 1 : 0);
      if (chance(.3)){ const a = th0 + len*.5; lxPond(P, Math.sin(a)*(r + .25), y, Math.cos(a)*(r + .25), .32, .22); }
      for (let a = th0 + .08; a < th0 + len - .05; a += .3){ const F = under(P, T(Math.sin(a)*(R2 - .02), y, Math.cos(a)*(R2 - .02), a));
        box(M.lxGlass, F, 0, .13, 0, .3*R2 + .01, .24, .015); box(M.lxWhite, F, 0, .26, 0, .3*R2 + .02, .025, .03);
        if (chance(.35*S.green)) plant(hangKind(), under(F, T(0, 0, .02)), 0, -.12, 0, rnd(.45, .65), 't', true); }
      ang += rnd(-.9, .9); ang = Math.max(-.9, Math.min(.9, ang));
    }
    if (fl === pad) lxCarPad(P, padSide*(r + .12), y, .15, padSide*PI/2);
  }
  if (NO_ROOF){ Object.assign(lot, { height: y, floors, occupied: true }); return; }   // another section stands on this one
  // the dome garden on the roof
  lxDome(P, 0, y, 0, r - .08);
  const top = y + r;
  // the arch: from the ground on one side, up over the dome, down to the ground on the other, behind the floors
  const A = r + .42, B = top + .55, zb = -r - .12, pts = [];
  for (let k=0; k<=24; k++){ const t = k*PI/24; pts.push([Math.cos(t)*A, Math.pow(Math.sin(t), .6)*B]); }
  lxBand(M.lxWhite, P, pts, .28, .14, zb);
  lxBand(M.lxLine, P, lxOffset(pts, .075), .05, .02, zb);
  Object.assign(lot, { height: top, floors, occupied: true });
}

// Shell tower: stadium-shaped glass floors with balconies all round, wrapped by a white loop rising from the
// ground on both sides and arching over the top, a little dome under the arch, cars parked on pads front and back
function shellTower(lot, st, P0){
  lot.white = true;
  const w = rnd(1.4, 1.6), d = rnd(1.05, 1.25), floors = irand(6, 9), face = pick([0, PI/2, PI, -PI/2]), P = under(P0, T(0, 0, 0, face));
  const r = d/2;
  lxPlate(M.lxWhite2, P, 0, 0, 0, w + .45, d + .45, r + .2, .06);
  let y = .06;
  const pads = new Set([irand(2, floors - 2), irand(1, floors - 3)]);
  for (let fl=0; fl<floors; fl++){
    const h = FH - .12, inset = fl % 3 === 1 ? .18 : 0;   // every third floor steps in behind a wider balcony
    lxGlassFloor(P, 0, y, 0, w - inset, d - inset, r - inset/2, h);
    y += h + .12;
    lxSlab(P, 0, y, 0, w + .3, d + .3, r + .15);
    if (fl < floors - 1){
      lxRail(P, 0, y, 0, w + .24, d + .24, r + .12);
      if (chance(.55*S.green)) for (let k=0; k<3; k++){ const p = pick(lxRing(w + .12, d + .12, r + .06, .3)); plant(pick(['bush','bushFlower','fern','bonsai']), P, p.x, y, p.z, rnd(.5, .7)); }
      if (chance(.3*S.green)) for (const p of lxRing(w + .3, d + .3, r + .15, .45)) if (chance(.3)) plant(hangKind(), under(P, T(p.x, 0, p.z, p.ry)), 0, y - .12, .01, rnd(.45, .65), 't', true);
    }
    if (pads.has(fl)) lxCarPad(P, rnd(-.25, .25), y, (fl % 2 ? 1 : -1)*(r + .12), fl % 2 ? 0 : PI);
  }
  const H = y, X = w/2 + .3;
  if (NO_ROOF){   // another section stands on this one: the loop's two sides only
    for (const s of [-1, 1]){ lxBand(M.lxWhite, P, [[s*X, 0], [s*X, H]], .3, .14, 0); lxBand(M.lxLine, P, [[s*(X + .075), 0], [s*(X + .075), H]], .05, .02, 0); }
    Object.assign(lot, { height: H, floors, occupied: true }); return;
  }
  lxPlate(M.lxWhite, P, 0, H, 0, w + .1, d + .1, r + .05, .22);
  lxDome(P, 0, H + .22, 0, Math.min(.42, d*.36));
  // the loop: straight up both sides, a half circle over the top, through the middle of the floors
  const pts = [[-X, 0]];
  for (let k=0; k<=18; k++){ const t = PI - k*PI/18; pts.push([Math.cos(t)*X, H + .3 + Math.sin(t)*X*1.05]); }
  pts.push([X, 0]);
  lxBand(M.lxWhite, P, pts, .3, .14, 0);
  lxBand(M.lxLine, P, lxOffset(pts, -.075), .05, .02, 0);
  Object.assign(lot, { height: H + .3 + X*1.05, floors, occupied: true });
}

// Terrace cascade: wide rounded levels stepping back as they rise, each roof a garden of trees, ponds and flowers
// behind a glass rail; glass floors beneath; a white ribbon sweeping up the side and out over the top; a glass
// dome pavilion on the roof and a car parked on a pad
function cascadeTerraces(lot, st, P0){
  lot.white = true;
  const levels = irand(3, 4), face = pick([0, PI/2, PI, -PI/2]), P = under(P0, T(0, 0, 0, face));
  const W0 = rnd(2.3, 2.45), D0 = rnd(2.2, 2.35);
  let y = 0, prev = null;
  const L = [];
  const step = rnd(.42, .48);   // each level steps back this far at the front; the backs stay flush
  for (let k=0; k<levels; k++) L.push({ w: W0 - k*.2, d: D0 - k*step, oz: -k*step/2, ox: rnd(-.05, .05), r: rnd(.3, .5) });
  lxPlate(M.lxWhite2, P, 0, 0, 0, W0, D0, L[0].r, .08); y = .08;
  for (let k=0; k<levels; k++){
    const lv = L[k], h = FH - .1, rw = lv.w - .3, rd = lv.d - .45, rz = lv.oz - .12;
    lxGlassFloor(P, lv.ox, y, rz, rw, rd, Math.max(.1, lv.r - .15), h);
    y += h + .14;
    lxSlab(P, lv.ox, y, lv.oz, lv.w, lv.d, lv.r, .14);
    // the terrace in front of the next level up: a garden, maybe a pond, a glass rail round the open edge
    const nx = L[k + 1], frontZ = lv.oz + lv.d/2, backZ = nx ? nx.oz - .12 + (nx.d - .45)/2 : lv.oz - lv.d/2 + .3;
    if (nx){
      const pts = []; for (let x = -lv.w/2 + .3; x < lv.w/2 - .25; x += rnd(.32, .5)) pts.push([x, rnd(backZ + .12, frontZ - .14)]);
      lxGarden(P, y, pts, irand(1, 2));
      if (chance(.55)) lxPond(P, rnd(-lv.w*.25, lv.w*.25), y, (backZ + frontZ)/2, rnd(.4, .6), Math.max(.18, (frontZ - backZ)*.45));
      lxRail(P, lv.ox, y, lv.oz, lv.w - .06, lv.d - .06, lv.r - .03, (x, z) => z > backZ + .05);
      if (chance(.5*S.green)) for (const p of lxRing(lv.w, lv.d, lv.r, .4)) if (p.z > 0 && chance(.4)) plant(hangKind(), under(P, T(lv.ox + p.x, 0, lv.oz + p.z, p.ry)), 0, y - .14, .01, rnd(.5, .7), 't', true);
    }
    prev = lv;
  }
  if (NO_ROOF){ lxCarPad(P, -W0/2 + .02, FH*2 + .14 + .1, -.2, -PI/2); Object.assign(lot, { height: y, floors: levels, occupied: true }); return; }
  // the roof: a dome pavilion, a garden, a rail
  const top = L[levels - 1];
  lxRail(P, top.ox, y, top.oz, top.w - .06, top.d - .06, top.r - .03);
  const dr = Math.min(.45, top.d*.28);
  lxDome(P, top.ox - top.w*.18, y, top.oz - .05, dr);
  lxGarden(P, y, [[top.ox + top.w*.22, top.oz + .15], [top.ox + top.w*.3, top.oz - .3], [top.ox + .1, top.oz + top.d*.3]], 1);
  // the ribbon: up the side from the first terrace, curling back and out over the top
  const S2 = under(P, T(W0/2 + .1, 0, 0, -PI/2)), y1 = FH + .12, H = y;   // its curve runs along local z, front to back
  const pts = []; for (let k=0; k<=20; k++){ const t = k/20, u = 1 - t;
    const bx = u*u*u*(D0/2 - .2) + 3*u*u*t*(-.1) + 3*u*t*t*(.15) + t*t*t*(-D0/2 + .25), by = u*u*u*y1 + 3*u*u*t*(y1 + .1) + 3*u*t*t*(H + 1.15) + t*t*t*(H + .55);
    pts.push([bx, by]); }
  lxBand(M.lxWhite, S2, pts, .3, .12, 0);
  lxBand(M.lxLine, S2, lxOffset(pts, .065), .045, .02, 0);
  lxCarPad(P, -W0/2 + .02, FH*2 + .14 + .1, -.2, -PI/2);
  Object.assign(lot, { height: H + .8, floors: levels, occupied: true });
}

/* ---------- district builders ---------- */
// Low income: stacked boxes shifted and twisted, overhangs on stilts, bolted-on rooms, stairs, cables and signs everywhere
function buildTenement(lot, st, P0){
  const floors = irand(st.floors[0], st.floors[1]);
  const w0=rnd(1.5,2.0), d0=rnd(1.5,2.0);
  let y=0, fl=0, ox=0, oz=0, prev=null, stairsDone=false;
  while (fl < floors){
    const nn = Math.min((fl>0 && chance(.3)) ? 2 : 1, floors-fl);
    if (fl>0){ ox = clamp(ox+rnd(-.32,.32),-.38,.38); oz = clamp(oz+rnd(-.32,.32),-.38,.38); }
    const c = { w:clamp(w0+rnd(-.35,.5),1.2,2.2), d:clamp(d0+rnd(-.35,.5),1.2,2.2), h:nn*FH, y, ox, oz, ry: fl===0 ? rnd(-.06,.06) : rnd(-.3,.3) };
    const P = chunkBox(P0, c, pick(st.walls), rnd(.02,.06));
    if (fl>0 && chance(.6)) slab(st, P0, c, y, rnd(.04,.12), (st.strips||0)*.5);
    if (prev && y < 3.3) for (const [sx,sz] of CORNERS){
      const p = cornerOf(c,sx,sz);
      if (!insideChunk(p.x,p.z,prev) && chance(.8)) cyl(M.metalDark,P0,p.x,y/2,p.z,.04,y);
    }
    const F = decorateChunk(st,P,c,fl,lot,fl===0);
    for (const f of F) if (chance(.45)) box(pick(st.accent.concat(st.walls)), f.F, rnd(-f.len/3,f.len/3), rnd(.15,c.h-.2), .015, rnd(.25,.55), rnd(.2,.45), .03);
    if (fl>0 && chance(.5*S.clutter)) annex(st, pick(F), c);
    if (!stairsDone && fl===0 && floors>=4 && chance(.5)){ stairs(st, pick(F), Math.min(floors,4)); stairsDone=true; }
    prev = c; y += c.h; fl += nn;
  }
  if (chance(.3)){
    y = pod(st, P0, { w:clamp(prev.w+rnd(.1,.4),1.4,2.3), d:clamp(prev.d+rnd(.1,.4),1.4,2.3), h:rnd(1,1.15), y, ox:prev.ox+rnd(-.2,.2), oz:prev.oz+rnd(-.2,.2), ry:prev.ry+rnd(-.2,.2) }, { face: pick([0, PI/2, PI, -PI/2]) });
    Object.assign(lot, { height:y, floors, occupied:true });
    return;
  }
  Object.assign(lot, { height:y, floors, occupied:true });
  roofItems(st, under(P0, T(prev.ox, y, prev.oz, prev.ry)), prev.w, prev.d, lot);
}

// Middle income / commercial: shop floor with shutters and awnings, slabbed upper floors with balconies, glass rooms, rooftop signs
function buildShophouse(lot, st, P0){
  const floors = irand(3,6), w = rnd(1.9,2.3), d = rnd(1.9,2.3);
  const baseMat = pick(st.walls), upperMat = pick(st.walls.filter(m => m !== baseMat));
  const base = { w, d, h:1.15, y:0, ox:0, oz:0, ry:0 };
  const P = chunkBox(P0, base, baseMat, .04);
  const fs = faces(w,d);
  fs.forEach((f,i) => { const F = under(P, T(f.nx*f.half, -base.h/2, f.nz*f.half, f.ry));
    if (i < 2 || chance(.4)) (chance(.75) ? shopfront : garage)(st, F, f.len, 0);
    else { decorateFloor({...st, shop:0, garage:0}, F, f.len, 0, 1, lot); }
  });
  slab(st, P0, base, 1.15, rnd(.12,.25), st.strips);
  let y=1.2, fl=1, ox=0, oz=0, last=base;
  while (fl < floors){
    const nn = Math.min(floors-fl, irand(1,2)), top = fl+nn >= floors;
    ox = clamp(ox+rnd(-.2,.2),-.28,.28); oz = clamp(oz+rnd(-.2,.2),-.28,.28);
    const c = { w:clamp(w+rnd(-.4,.15),1.3,2.3), d:clamp(d+rnd(-.4,.15),1.3,2.3), h:nn*FH, y, ox, oz, ry:rnd(-.12,.12) };
    if (top && chance(.4)){ const pc = {...c, w:clamp(c.w+rnd(0,.3),1.5,2.35), d:clamp(c.d+rnd(0,.3),1.5,2.35), h:rnd(1.05,1.2)}; y = pod(st, P0, pc, { face: pick([0, PI/2, PI, -PI/2]) }); fl += 1; Object.assign(lot, { height:y, floors, occupied:true }); return; }
    if (top && chance(.3)){ glassRoom(P0, {...c, w:c.w*.8, d:c.d*.8, h:FH}, pick(LIT_ROOMS)); last = {...c, w:c.w*.8, d:c.d*.8, h:FH}; y += FH; fl += 1; break; }
    const Pc = chunkBox(P0, c, chance(.3) ? pick(st.walls) : upperMat, rnd(.03,.08));
    decorateChunk(st, Pc, c, fl, lot, fl===1);
    slab(st, P0, c, y+c.h, rnd(.06,.18), st.strips*.6);
    y += c.h+.05; fl += nn; last = c;
  }
  roofItems(st, under(P0, T(last.ox, y, last.oz, last.ry)), last.w, last.d, lot);
  Object.assign(lot, { height:y, floors, occupied:true });
}

// High income: slab towers with neon edges, recessed glass floors and platforms; plus round and twisting towers
function buildTower(lot, st, P0){
  const v = R();
  if (v < .08) return roundTower(lot, st, P0);
  if (v < .15) return twistTower(lot, st, P0);
  if (v < .26) return gardenTower(lot, st, P0);
  if (v < .35) return arcBuilding(lot, st, P0);
  if (v < .45) return platformTower(lot, st, P0);
  if (v < .63) return glassHotel(lot, st, P0);
  if (v < .73) return slabTower(lot, st, P0);
  if (v < .83) return domeTower(lot, st, P0);       // the curved white garden-city buildings
  if (v < .92) return shellTower(lot, st, P0);
  return cascadeTerraces(lot, st, P0);
}
function slabTower(lot, st, P0){
  let w=rnd(1.9,2.3), d=rnd(1.9,2.3), y=0, fl=0, last=null;
  const floors = irand(7,11), mat = pick(st.walls);
  // lobby: recessed glass floor under the first slab, on columns
  const lobby = { w:w-.5, d:d-.5, h:FH, y:0, ox:0, oz:0, ry:0 };
  glassRoom(P0, lobby, pick([M.interiorCool,M.winLit]));
  for (const [sx,sz] of CORNERS) box(st.trim, P0, sx*(w/2-.1), FH/2, sz*(d/2-.1), .14, FH, .14);
  y = FH; fl = 1;
  slab(st, P0, {...lobby, w, d}, y, .12, 1);
  y += .05;
  while (fl < floors){
    const n = Math.min(floors-fl, irand(1,3));
    const recessed = fl > 2 && fl+n < floors && chance(.3);
    const c = recessed ? { w:w-.5, d:d-.5, h:n*FH, y, ox:0, oz:0, ry:0 } : { w, d, h:n*FH, y, ox:rnd(-.1,.1), oz:rnd(-.1,.1), ry:0 };
    if (recessed){
      glassRoom(P0, c, pick(LIT_ROOMS));
      for (const [sx,sz] of CORNERS) box(st.trim, P0, sx*(w/2-.1), y+c.h/2, sz*(d/2-.1), .12, c.h, .12);
      if (chance(.5*S.green)) terracePlants(under(P0,T(0,y,0)), w, d);
    } else {
      const P = chunkBox(P0, c, chance(.3)?pick(st.walls):mat, .04);
      const F = decorateChunk(st, P, c, fl, lot, fl===1);
      if (fl > 2 && chance(.3)){   // a rounded pod cantilevered off the side
        const side = pick([0, PI/2, PI, -PI/2]), pw = rnd(1.3,1.7), pd = rnd(1.1,1.4);
        const out = (side===0||side===PI ? d : w)/2 + pd/2 - .35;
        pod(st, P0, { w:pw, d:pd, h:FH*1.1, y:y+.02, ox:Math.sin(side)*out, oz:Math.cos(side)*out, ry:0 }, { face: side, R: rnd(.4,.6) });
      } else if (chance(.35)){   // cantilevered platform with a parked car pad
        const f = pick(F);
        box(st.trim, f.F, 0, .05, .45, f.len*.6, .08, .9);
        box(M.neonCyan, f.F, 0, .05, .91, f.len*.6, .03, .03);
        for (const s of [-1,1]) box(M.frame, f.F, s*f.len*.3, .25, .9, .03, .35, .03);
      }
    }
    y += c.h;
    slab(st, P0, {w, d, ox:0, oz:0, ry:0}, y, rnd(.08,.16), .75);
    y += .05; fl += n; last = {w, d};
  }
  Object.assign(lot, { height:y, floors, occupied:true });
  const Pr = under(P0, T(0,y,0));
  roofItems(st, Pr, w, d, lot);
  if (chance(.6)){ cyl(M.frame,P0,w/2-.2,y+.9,d/2-.2,.03,1.8); box(M.neonPink,P0,w/2-.2,y+1.82,d/2-.2,.06,.06,.06); glow(P0,w/2-.2,y+1.84,d/2-.2,'pink',.7); }
}
function terracePlants(P,w,d){
  for (const [sx,sz] of CORNERS) if (chance(.6*S.green)){
    const x=sx*(w/2-.2), z=sz*(d/2-.2);
    if (chance(.5)) bonsaiAt(P,x,0,z); else bambooAt(P,x,0,z);
  }
}
function roundTower(lot, st, P0){
  const floors = irand(7,12), mat = pick(st.walls);
  let y=0, fl=0, r = rnd(.85,1.05), rr = r;
  while (fl < floors){
    const n = Math.min(floors-fl, irand(2,3)), h = n*FH;
    rr = clamp(r+rnd(-.18,.08), .7, 1.1);
    put(U.cyl16, chance(.3)?pick(st.walls):mat, under(P0, T(0,y+h/2,0,0,2*rr,h,2*rr)));
    for (let k=0;k<n;k++) put(U.cyl16, chance(st.lit)?pick(LIT_ROOMS):M.glassTeal, under(P0, T(0,y+k*FH+.52,0,0,2*rr+.04,.34,2*rr+.04)));
    put(U.cyl16, st.trim, under(P0, T(0,y,0,0,2*rr+.34,.08,2*rr+.34)));
    put(U.cyl16, pick(st.neonMats), under(P0, T(0,y+.045,0,0,2*rr+.38,.03,2*rr+.38)));
    if (chance(.45)){
      const a = rnd(0,TAU), yy = y+rnd(.4,h-.3);
      const Pp = under(P0, T(Math.cos(a)*(rr+.28), yy, -Math.sin(a)*(rr+.28), a));
      put(roundedBox(.9,.5,.62,.1), pick(st.walls), Pp);
      box(pick(LIT_ROOMS), Pp, .46, .02, 0, .02, .22, .42);
      box(M.neonCyan, Pp, 0, -.25, 0, .9, .03, .64);
    }
    y += h; fl += n;
  }
  const a = rnd(0,TAU), Q = under(P0, T(Math.cos(a)*(rr+.05), 0, -Math.sin(a)*(rr+.05), a+PI/2));
  glyphSign(Q, 0, rnd(1.5, y-1.2), true, false);
  put(U.cyl16, st.trim, under(P0, T(0,y+.05,0,0,2*rr+.2,.1,2*rr+.2)));
  ROOF.ring(under(P0,T(0,y,0)), () => ({x:0,z:0}), st);
  Object.assign(lot, { height:y, floors, occupied:true });
}
function twistTower(lot, st, P0){
  const floors = irand(7,11), w = rnd(1.5,1.85), d = rnd(1.5,1.85), twist = rnd(.1,.17)*(chance(.5)?1:-1);
  const mat = pick(st.walls), neon = pick(st.neonMats);
  let last = null;
  for (let fl=0; fl<floors; fl++){
    const c = { w, d, h:FH, y:fl*FH, ox:0, oz:0, ry:fl*twist };
    const P = chunkBox(P0, c, mat, .05);
    decorateChunk(st, P, c, fl, lot, fl===0);
    if (fl>0){
      const Q = under(P0, T(0,fl*FH,0,c.ry));
      put(roundedBox(w+.3,.07,d+.3,.05), st.trim, Q);
      box(neon,Q,0,0,(d+.3)/2+.015,w+.3,.03,.03); box(neon,Q,0,0,-(d+.3)/2-.015,w+.3,.03,.03);
    }
    last = c;
  }
  const y = floors*FH;
  Object.assign(lot, { height:y, floors, occupied:true });
  roofItems(st, under(P0, T(0,y,0,last.ry)), w, d, lot);
}

// Industrial: shuttered halls with sawtooth roofs, silo clusters and tank yards
/* ---------- the workshop yard: five small industrial buildings ---------- */
// After the reference: a rusty corrugated scrap shed, a red brick gear workshop under a tiled roof, a mossy
// concrete repair shop with pipes all over its roof, a blue corrugated parts warehouse with a sawtooth roof, and an
// open timber lube shed under a glass roof. Each has a big lit doorway and its own neon sign; all of them leak
// pipes, chimneys, crates, gas bottles, drums and potted plants.
Object.assign(M, {
  inRust: toon(0x8a4a2a), inRust2: toon(0x6a3a24), inCorr: toon(0x7a6656), inCorr2: toon(0x5e5046),
  inBlue: toon(0x4a6a9a), inBlue2: toon(0x3a5680), inBlueRib: toon(0x34496e),
  inBrick: toon(0x8e3a2e), inBrick2: toon(0x6e2e26), inMortar: toon(0xb09a88), inTile: toon(0xa4523a), inTile2: toon(0x84402c),
  inConc: toon(0x8f928a), inConc2: toon(0x767a72), inMoss: toon(0x5f7a3a, { flat:1 }),
  inWood: toon(0x7a5434), inWood2: toon(0x5e3f26),
  inShop: toon(0xb08550, { em:0xc8803a, kind:'window' }), inShop2: toon(0xa08458, { em:0xd8984a, kind:'window' }),
  inPipe: toon(0x7a4a32), inPipe2: toon(0x5c5a58), inGas: toon(0x5a8aa8), inGas2: toon(0xb8bcb8),
});
const IN_SHOP = [M.inShop, M.inShop2];
const SCRAP_ROOFS = [[M.inRust, M.inRust2], [toon(0x52677a), toon(0x3f5062)], [toon(0x6e7466), toon(0x565c50)]];   // rust, blue steel, galvanised
// a right-angled triangle, extruded (for sawtooth roof ends): the tall side at local +x
U.rtri = (() => { const s = new THREE.Shape(); s.moveTo(-.5, 0); s.lineTo(.5, 0); s.lineTo(.5, 1); s.lineTo(-.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -.5); return g; })();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pq = new THREE.Quaternion(), _pUp = new THREE.Vector3(0, 1, 0);
// a round pipe from a to b (in P's space)
function pipeSeg(mat, P, ax, ay, az, bx, by, bz, r){
  _pa.set(ax, ay, az); _pb.set(bx - ax, by - ay, bz - az);
  const len = _pb.length(); if (len < 1e-4) return;
  _pq.setFromUnitVectors(_pUp, _pb.divideScalar(len));
  put(U.cyl16, mat, under(P, new THREE.Matrix4().compose(_pa.addScaledVector(_pb, len/2), _pq, new THREE.Vector3(2*r, len, 2*r))));
}
// a pipe run through a list of points, with round elbows at the bends and flanges here and there
// Glowing fluid in glass pipes, faked cheaply: the core of a glass pipe is one shader material whose bright bands,
// ripples and bubbles slide along it over time. The pattern comes from each pixel's world position (x + y + z grows
// along any pipe, whichever way it runs), so nothing moves on the CPU and nothing is updated per frame; all the fluid
// in a region is a single draw. Brightness is stepped, so it stays pixel art.
// Three liquids: blue, dark green and brown. By day they're just coloured liquid; at night they glow softly, like
// something bioluminescent, with a slow breathing pulse and brighter surges (FLUID_NIGHT follows the hour).
const FLUID_NIGHT = { value: 0 };
function fluidMat(deep, mid, hi, glowC){
  return new THREE.ShaderMaterial({
    uniforms: { time: FOL_UNI.time, night: FLUID_NIGHT },
    vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float time; uniform float night; varying vec3 vW; varying vec3 vN;
      float h1(float n){ return fract(sin(n*12.9898)*43758.5453); }
      void main(){
        float s = vW.x + vW.y + vW.z, t = time;
        float band = .5 + .5*sin(s*7.0 - t*4.2);                       // slow surges
        float rip = .5 + .5*sin(s*19.0 - t*7.5 + sin(s*2.3 + t)*1.6);  // ripples riding on them
        float cell = floor(s*11.0 - t*6.5), bub = step(.86, h1(cell))*step(.35, fract(s*11.0 - t*6.5));   // bubbles
        float k = .12 + .42*band*band + .2*rip*band + .6*bub + .1*max(vN.y, 0.0);
        k = floor(k*5.0 + .5)/5.0;
        vec3 c = k < .5 ? mix(vec3${deep}, vec3${mid}, k*2.0) : mix(vec3${mid}, vec3${hi}, k*2.0 - 1.0);
        // night: a soft glow from within, breathing slowly, the surges lit up most
        float pulse = .85 + .15*sin(t*1.3 + s*.6);
        vec3 lit = c*(.75 + .55*k)*pulse + vec3${glowC}*(.18 + .35*band*band)*pulse;
        c = mix(c*.9, lit, night);
        gl_FragColor = vec4(floor(c*24.0 + .5)/24.0, 1.0);
      }`,
  });
}
const FLUIDS = [
  fluidMat('(.02, .14, .48)', '(.06, .5, .92)', '(.62, .97, 1.0)', '(.1, .5, .9)'),      // blue
  fluidMat('(.02, .12, .06)', '(.06, .32, .14)', '(.42, .78, .4)', '(.12, .55, .25)'),   // dark green
  fluidMat('(.12, .06, .02)', '(.34, .19, .07)', '(.74, .52, .26)', '(.5, .3, .1)'),     // brown
];
const FLUID_GLOW = ['cyan', 'green', 'amber'];
M.fluid = FLUIDS[0];
// a glass section of pipe: the glowing core, a glass sleeve, copper collars at the ends and along it
let FLUID_PICK = 0;   // which liquid the current pipe run carries (set per run in pipeRun)
function fluidSeg(mat, P, ax, ay, az, bx, by, bz, r){
  const len = Math.hypot(bx - ax, by - ay, bz - az), L = (u, q) => [ax + (bx - ax)*u, ay + (by - ay)*u, az + (bz - az)*u][q];
  pipeSeg(FLUIDS[FLUID_PICK], P, ax, ay, az, bx, by, bz, r*.8);
  pipeSeg(M.lxGlass, P, ax, ay, az, bx, by, bz, r*1.02);
  const n = Math.max(1, Math.round(len/1.0));
  for (let k=0; k<=n; k++){ const u = k/n, du = Math.min(.5, .05/len); const u0 = Math.max(0, u - du), u1 = Math.min(1, u + du);
    pipeSeg(k % n === 0 ? mat : M.inPipe2, P, L(u0, 0), L(u0, 1), L(u0, 2), L(u1, 0), L(u1, 1), L(u1, 2), r*1.32); }
  { const was = LUX; LUX = null;   // the liquids keep their own glow whatever the district's lights
    for (let u = .5/n; u < 1; u += 1/n) glow(P, L(u, 0), L(u, 1), L(u, 2), FLUID_GLOW[FLUID_PICK], .4 + r*2); LUX = was; }
}
function pipeRun(mat, P, pts, r, flanges = true, glass = 0){
  if (glass) FLUID_PICK = Math.floor(R()*FLUIDS.length);   // one liquid per run
  for (let k=0; k<pts.length - 1; k++){
    const [ax, ay, az] = pts[k], [bx, by, bz] = pts[k + 1];
    if (glass && Math.hypot(bx - ax, by - ay, bz - az) > .45 && chance(glass)){ fluidSeg(mat, P, ax, ay, az, bx, by, bz, r); if (k > 0) sph(mat, P, ax, ay, az, r*1.25); continue; }
    pipeSeg(mat, P, ax, ay, az, bx, by, bz, r);
    if (flanges && Math.hypot(bx - ax, by - ay, bz - az) > .6){ const u = .5; pipeSeg(M.inPipe2, P, ax + (bx - ax)*(u - .03), ay + (by - ay)*(u - .03), az + (bz - az)*(u - .03), ax + (bx - ax)*(u + .03), ay + (by - ay)*(u + .03), az + (bz - az)*(u + .03), r*1.35); }
    if (k > 0) sph(mat, P, ax, ay, az, r*1.18);
  }
}
// corrugation: vertical ribs over a wall face (F: local +z out, x along the face)
function corrRibs(F, len, y0, h, mat, step = .13){ for (let t = -len/2 + step/2; t < len/2; t += step) box(mat, F, t, y0 + h/2, .012, .045, h - .02, MIN_T); }
// a big doorway with a roll-up shutter partly up, a warm lit workshop inside (benches, tools, shelves of junk)
function workDoor(F, x, w, h, opts = {}){
  box(opts.frame || M.frame, F, x, h/2 + .02, .02, w + .12, h + .08, MIN_T);
  box(pick(IN_SHOP), F, x, h*.45, .03, w, h*.9 - .02, MIN_T);
  const shut = opts.shut ?? rnd(.15, .35);
  box(M.shutter, F, x, h - shut*h/2, .05, w, shut*h, MIN_T);
  for (let t = x - w/2 + .1; t < x + w/2; t += .2) box(M.frame, F, t, h*.3, .06, .08, rnd(.1, .3), MIN_T);   // benches and tools against the light
  box(M.frame, F, x + rnd(-w*.25, w*.25), h*.55, .06, rnd(.15, .3), rnd(.08, .18), MIN_T);
  glow(F, x, h*.45, .3, 'warm', .6 + w*.5);
}
function wallLamp(F, x, y){ box(M.frame, F, x, y, .06, .03, .03, .12); put(U.cone, M.metalDark, under(F, T(x, y - .02, .14, 0, .14, .07, .14))); box(M.bulb, F, x, y - .07, .14, .06, .03, .06); glow(F, x, y - .12, .2, 'warm', .8); }
function gasBottles(P, x, z, n = 2){ for (let k=0; k<n; k++){ const gx = x + k*.13; cyl(pick([M.inGas, M.inGas2, M.red2]), P, gx, .22, z + rnd(-.03, .03), .055, .44); sph(M.metalDark, P, gx, .46, z, .04); } }
function drum(P, x, z, mat){ put(U.cyl16, mat || pick([M.inRust, M.inBlue2, M.hazard, M.inPipe2]), under(P, T(x, .2, z, 0, .26, .4, .26))); put(U.cyl16, M.metalDark, under(P, T(x, .41, z, 0, .27, .02, .27))); }
function pottedPlant(P, x, z, s = 1){ put(U.cyl16, pick([M.pot, M.inBrick2, M.inConc2]), under(P, T(x, .08*s, z, 0, .18*s, .16*s, .18*s))); plant(pick(['fern','bush','succulent','bushFlower','g_fern2']), P, x, .16*s, z, rnd(.55, .8)*s); }
function crateAt(P, x, y, z, s = 1){ box(M.crate, P, x, y + .11*s, z, .24*s, .22*s, .24*s, rnd(-.3, .3)); box(M.inWood2, P, x, y + .11*s, z, .25*s, .03, .25*s); }
function moss(P, x, y, z, n = 3){ for (let k=0; k<n; k++) blob(M.inMoss, P, x + rnd(-.2, .2), y, z + rnd(-.2, .2), rnd(.06, .12), .4); }
// a neon word on a dark board, on a bracket or flat on the wall
function wordSign(F, kind, x, y, z, k, col, halo){ box(M.frame, F, x, y, z - .03, SPR.size[kind][0]/PX*k + .06, SPR.size[kind][1]/PX*k + .06, MIN_T); plant(kind, F, x, y, z, k, 'c', true); glow(F, x, y, z + .04, col, halo ?? .9 + .6*k); }   // the halo sits right on the board (out in front, the high camera saw it as a blob below the sign)
// a gabled roof along local x over a w x d box (ridge along x), with eaves; returns nothing
function gable(P, y, w, d, rise, mat, over = .15){ put(U.prism, mat, under(P, T(0, y, 0, PI/2, d + 2*over, rise, w + 2*over))); }

// Scrap shed: a tall, narrow corrugated shed in rusty patchwork, a lean-to on its side, chimneys, a ladder
function scrapShed(lot, st, P0){
  const w = rnd(1.55, 1.75), d = rnd(1.8, 2.05), h = rnd(2.0, 2.3), P = under(P0, T(-.15, 0, 0, pick([0, PI/2, PI, -PI/2])));
  box(M.inCorr, P, 0, h/2, 0, w, h, d);
  for (const f of faces(w, d)){
    const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
    corrRibs(F, f.len, 0, h, M.inCorr2);
    for (let k=0; k<irand(3, 5); k++){ const pw = rnd(.35, .7), ph = rnd(.4, .9); box(pick([M.inRust, M.inRust2, M.corrBlue, M.inCorr2]), F, rnd(-f.len/2 + pw/2, f.len/2 - pw/2), rnd(ph/2, h - ph/2), .03, pw, ph, MIN_T); }   // patched panels
  }
  const Ff = under(P, T(0, 0, d/2, 0));
  workDoor(Ff, .1, .75, 1.05, { frame: M.inRust2 });
  wordSign(under(Ff, T(-.1, 0, .02, 0)), 'sign_w_scrap', 0, 1.5, .1, 1.0, 'orange');
  box(M.inShop2, Ff, -.45, 1.75, .03, .3, .25, MIN_T); box(M.frame, Ff, -.45, 1.75, .06, .32, .03, MIN_T);   // a small lit window up high
  wallLamp(Ff, .55, 1.25);
  // the roof: corrugated, steep, overhanging, in one of three finishes: rust, weathered blue steel, or old
  // galvanised grey-green (sheet and rib colour), so whole yards of them aren't all orange
  const [roof, rib] = SCRAP_ROOFS[Math.floor(R()*SCRAP_ROOFS.length)];
  gable(P, h, w, d, .85, roof, .2);
  { const half = d/2 + .2, ang = Math.atan2(.85, half), L = Math.hypot(half, .85);   // ribs running down both slopes (the ridge runs along x)
    for (let x = -w/2 - .15; x <= w/2 + .16; x += .16) for (const s of [-1, 1]) box(rib, P, x, h + .425 + Math.cos(ang)*.02, s*half/2, MIN_T, MIN_T, L, 0, s*ang); }
  moss(P, -w/4, h + .5, rnd(-.5, .5), 4);
  if (!NO_ROOF){ for (const [x, z] of [[w*.2, -d*.25], [-w*.25, d*.15]]){ const ch = rnd(.6, 1.0); cyl(M.inRust2, P, x, h + .5 + ch/2, z, .07, ch); cyl(M.metalDark, P, x, h + .5 + ch, z, .09, .06); emitters.push(new THREE.Vector3(x, h + .6 + ch, z).applyMatrix4(P)); } }
  // a lean-to on the side, a ladder, a pipe down the wall, junk
  const lx = w/2 + .35;
  box(M.inCorr2, P, lx, .45, .2, .7, .9, 1.1); box(roof, P, lx, .98, .2, .82, .04, 1.2, 0, 0, -.3);
  box(pick(IN_SHOP), P, lx + .36, .4, .2, MIN_T, .45, .5);
  for (let y = .2; y < h - .1; y += .22) box(M.frame, P, -w/2 - .04, y, -d/2 + .35, MIN_T, .025, .3);
  for (const s of [-1, 1]) box(M.frame, P, -w/2 - .04, h/2, -d/2 + .35 + s*.15, MIN_T, h, .03);
  pipeRun(M.inPipe, P, [[-w/2 - .1, h - .3, d/2 - .3], [-w/2 - .1, .3, d/2 - .3], [-w/2 - .4, .3, d/2 - .3]], .06, false);
  for (let k=0; k<irand(3, 5); k++) blob(pick([M.inRust, M.metalDark, M.inPipe2, M.inRust2]), P, rnd(-w/2, w/2), .1, d/2 + rnd(.25, .5), rnd(.08, .16), .7);
  if (chance(.7)) crateAt(P, w/2 - .1, 0, d/2 + .35);
  for (let k=0; k<2; k++) if (chance(.6*S.green)) plant(pick(['vines','h_ivy','pothos']), under(P, T(-w/2, 0, rnd(-d/3, d/3), -PI/2)), 0, h - .1, .03, rnd(.8, 1.1), 't', true);
  Object.assign(lot, { height: h + .85, floors: 2, occupied: true });
}
// Gear workshop: red brick under a terracotta tiled roof, a lit multi-paned window, a half-open roller door
function gearWorkshop(lot, st, P0){
  const w = rnd(2.0, 2.2), d = rnd(1.7, 1.9), h = rnd(1.35, 1.5), P = under(P0, T(0, 0, .1, pick([0, PI/2, PI, -PI/2])));
  box(M.inConc2, P, 0, .08, 0, w + .1, .16, d + .1);   // a concrete plinth
  box(M.inBrick, P, 0, h/2 + .08, 0, w, h, d);
  for (const f of faces(w, d)){ const F = under(P, T(f.nx*f.half, .08, f.nz*f.half, f.ry));
    for (let y = .1, row = 0; y < h - .05; y += .1, row++){ box(M.inMortar, F, 0, y, .004, f.len - .02, .015, MIN_T*.5);   // mortar courses, and joints staggered course by course
      for (let t = -f.len/2 + (row % 2 ? .1 : .2); t < f.len/2 - .05; t += .2) box(M.inMortar, F, t, y + .05, .004, .015, .085, MIN_T*.5); }
    for (let k=0; k<irand(4, 7); k++) box(chance(.5) ? M.inBrick2 : M.inRust, F, rnd(-f.len/2 + .1, f.len/2 - .1), rnd(.1, h - .1), .012, .14, .06, MIN_T*.6);   // odd bricks
  }
  const Ff = under(P, T(0, .08, d/2, 0));
  workDoor(Ff, w*.2, .85, 1.0, { frame: M.inBrick2 });
  // the lit window: a grid of small panes
  const wx = -w*.27; box(M.inBrick2, Ff, wx, .62, .03, .72, .56, MIN_T); box(pick(IN_SHOP), Ff, wx, .62, .04, .62, .46, MIN_T);
  for (let t = -.31; t <= .32; t += .155) box(M.frame, Ff, wx + t, .62, .07, .025, .48, MIN_T); for (const y of [.47, .62, .77]) box(M.frame, Ff, wx, y, .07, .64, .025, MIN_T);
  box(M.inConc, Ff, wx, .33, .08, .8, .05, .12);   // sill
  glow(Ff, wx, .62, .3, 'warm', 1.0);
  // the gable end over the door, the sign and lamps
  const Q = under(P, T(0, .08 + h, 0));
  put(U.prism, M.inBrick, under(Q, T(0, 0, 0, 0, w, .7, d - .02)));   // gable wall infill (prism along z, matching the roof)
  put(U.prism, M.inTile, under(Q, T(0, 0, 0, 0, w + .36, .75, d + .3)));
  for (let t = -(d + .3)/2 + .06; t < (d + .3)/2; t += .12) for (const s of [-1, 1]) box(M.inTile2, Q, s*(w + .36)/4, .37, t, (w + .36)/2*1.12, .025, .04, 0, 0, s*-Math.atan2(.75, (w + .36)/2));   // tile courses
  box(M.inTile2, Q, 0, .76, 0, .1, .08, d + .32);   // ridge
  wordSign(Ff, 'sign_w_gear', w*.12, h + .24, .1, 1.0, 'orange');   // (halo colours match the letters, and aren't swapped by the district's palette)
  wallLamp(Ff, w*.2 + .58, .95); wallLamp(Ff, -w*.5 + .12, .95);
  pipeRun(M.inPipe, P, [[w/2 + .05, .08 + h, d/2 - .1], [w/2 + .05, .1, d/2 - .1]], .04, false);   // downpipe
  // out front: potted plants along the wall, gas bottles, crates, tools
  for (let k=0; k<irand(3, 5); k++) pottedPlant(P, wx + rnd(-.35, .35), d/2 + .2, rnd(.8, 1.1));
  gasBottles(P, w/2 - .25, d/2 + .2, irand(1, 3)); if (chance(.7)) crateAt(P, -w/2 + .1, 0, d/2 + .35);
  if (chance(.5)) box(M.metalDark, P, w*.2 + .45, .2, d/2 + .3, .2, .4, .2);   // a tool cabinet
  if (!NO_ROOF && chance(.6)){ cyl(M.inBrick2, P, -w*.3, .08 + h + .6, -d*.2, .1, .9); emitters.push(new THREE.Vector3(-w*.3, h + 1.1, -d*.2).applyMatrix4(P)); }
  Object.assign(lot, { height: .08 + h + .75, floors: 2, occupied: true });
}
// Repairs: a mossy concrete block, a wide lit roller door, a tangle of pipes and a machine on the flat roof
function repairsBlock(lot, st, P0){
  const w = rnd(2.0, 2.25), d = rnd(1.9, 2.15), h = rnd(1.6, 1.85), P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  box(M.inConc, P, 0, h/2, 0, w, h, d);
  box(M.inConc2, P, 0, h + .07, 0, w + .08, .14, d + .08);   // parapet cap
  for (const f of faces(w, d)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
    for (let k=0; k<irand(3, 6); k++){ const pw = rnd(.2, .6); box(chance(.5) ? M.inConc2 : M.inMoss, F, rnd(-f.len/2 + pw/2, f.len/2 - pw/2), rnd(.1, h - .1), .006 + .002*k, pw, rnd(.1, .4), MIN_T); }   // stains and moss
    if (chance(.5*S.green)) plant(pick(['vines','h_ivy','l_mossroots']), F, rnd(-f.len/3, f.len/3), h + .1, .04, rnd(.8, 1.1), 't', true);
  }
  const Ff = under(P, T(0, 0, d/2, 0));
  workDoor(Ff, -.05, 1.2, 1.15, { frame: M.inConc2, shut: rnd(.1, .2) });
  wordSign(Ff, 'sign_w_repairs', -.05, 1.42, .1, .9, 'sodium');
  wallLamp(Ff, w/2 - .2, 1.2);
  box(M.metalDark, Ff, -w/2 + .25, .9, .06, .25, .32, .1); box(M.inGas2, Ff, -w/2 + .25, .95, .12, .18, .06, MIN_T);   // a fuse box
  gasBottles(P, w/2 - .35, d/2 + .22, irand(2, 3)); drum(P, -w/2 + .3, d/2 + .3, M.inWood); if (chance(.7)) drum(P, -w/2 + .6, d/2 + .3);
  for (let k=0; k<irand(2, 4); k++) pottedPlant(P, rnd(-w/2 + .2, w/2 - .2), d/2 + rnd(.45, .6), rnd(.8, 1.0));
  if (!NO_ROOF){
    const y = h + .14;
    box(M.inConc2, P, rnd(-.2, .2), y + .2, rnd(-.3, .1), .6, .4, .5); box(M.metal, P, 0, y + .43, -.1, .3, .06, .3); put(U.cyl16, M.metalDark, under(P, T(0, y + .47, -.1, 0, .25, .02, .25)));   // the machine
    const n = irand(3, 5);
    for (let k=0; k<n; k++){   // pipes looping over the roof and down the walls
      const z0 = -d/2 + .25 + k*(d - .5)/Math.max(1, n - 1), x0 = -w/2 + .2, x1 = w/2 - .2, up = rnd(.25, .55), r = rnd(.045, .07);
      pipeRun(pick([M.inPipe, M.inRust, M.inPipe2]), P, [[x0, y + .05, z0], [x0, y + up, z0], [x1*rnd(.2, .7), y + up, z0], [x1*rnd(.2, .7), y + up, z0 + rnd(-.2, .2)], [x1, y + up*.5, z0], [x1 + .15, y + up*.5, z0], [x1 + .15, rnd(.3, h - .2), z0]], r, true, .25);
    }
    moss(P, rnd(-w/3, w/3), h + .16, rnd(-d/3, d/3), 5);
  }
  Object.assign(lot, { height: h + .14, floors: 2, occupied: true });
}
// Parts warehouse: blue corrugated walls, a sawtooth roof with lit glazing, pipes looping over it, an open bay of shelves
function partsWarehouse(lot, st, P0){
  const w = rnd(2.2, 2.4), d = rnd(2.0, 2.25), h = rnd(1.45, 1.65), P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  box(M.inBlue, P, 0, h/2, 0, w, h, d);
  for (const f of faces(w, d)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
    corrRibs(F, f.len, 0, h, M.inBlueRib, .12);
    for (let k=0; k<irand(2, 4); k++) box(M.inRust, F, rnd(-f.len/2 + .2, f.len/2 - .2), rnd(.3, h - .2), .035 + .002*k, rnd(.08, .2), rnd(.2, .6), MIN_T);   // rust runs
  }
  const Ff = under(P, T(0, 0, d/2, 0));
  // the open bay: shelving with boxes and crates inside, lit
  const bw = 1.15, bx = w*.15;
  box(M.frame, Ff, bx, .55, .02, bw + .1, 1.12, MIN_T); box(pick(IN_SHOP), Ff, bx, .5, .03, bw, 1.0, MIN_T);
  for (const y of [.25, .55, .82]){ box(M.inWood2, Ff, bx, y, .07, bw - .1, .03, MIN_T); for (let t = bx - bw/2 + .12; t < bx + bw/2 - .08; t += .15) if (chance(.75)) box(pick([M.crate, M.inBlue2, M.inGas2, M.hazard, M.inRust]), Ff, t, y + .07, .08, .1, rnd(.08, .13), MIN_T); }
  box(M.shutter, Ff, bx, 1.04, .06, bw, .12, MIN_T);
  glow(Ff, bx, .55, .3, 'warm', 1.2);
  wordSign(Ff, 'sign_w_parts', bx, h - .14, .1, .95, 'ember');
  wallLamp(Ff, -w/2 + .3, 1.1);
  // a conveyor hatch on one side (the belts between buildings come out of these)
  box(M.metalDark, P, w/2 + .03, 1.2, .3, MIN_T, .4, .5);
  // the sawtooth roof: three teeth, steep glazed faces lit from inside
  if (NO_ROOF){ box(M.inBlue2, P, 0, h + .04, 0, w + .06, .08, d + .06); }   // another building stands on it: a flat roof
  else {
    const n = 3, td = d/n, rise = .5;
    for (let k=0; k<n; k++){
      const z = -d/2 + td*(k + .5), Q = under(P, T(0, h, z));
      const slope = Math.atan2(rise, td);
      box(M.inBlue2, Q, 0, rise/2, -.02, w + .1, MIN_T, Math.hypot(td, rise), 0, -slope);   // the long slope, rising to the front
      box(M.frame, Q, 0, rise/2, td/2 - .02, w + .02, rise, MIN_T); box(pick(IN_SHOP), Q, 0, rise*.45, td/2 + .005, w - .2, rise*.7, MIN_T);   // the glazed face, lit
      for (let t = -w/2 + .25; t < w/2; t += .3) box(M.frame, Q, t, rise*.45, td/2 + .03, .025, rise*.75, MIN_T);
      for (const s of [-1, 1]) put(U.rtri, M.inBlue2, under(Q, T(s*(w/2 + .03), 0, 0, -PI/2, td, rise, MIN_T)));   // the tooth's end walls
    }
    if (!NO_ROOF) for (let k=0; k<irand(1, 3); k++){   // pipe loops over the teeth
      const x = rnd(-w/2 + .3, w/2 - .3), up = rnd(.7, 1.0);
      pipeRun(pick([M.inPipe, M.inRust]), P, [[x, h + .2, -d/2 + .2], [x, h + up, -d/2 + .2], [x, h + up, d*.1], [x + .3, h + up, d*.1], [x + .3, h + .4, d*.1]], rnd(.05, .08), true);
      if (chance(.5)) emitters.push(new THREE.Vector3(x, h + up + .1, -d/2 + .2).applyMatrix4(P));
    }
  }
  for (let k=0; k<irand(1, 3); k++) crateAt(P, rnd(-w/2 + .2, -.1), 0, d/2 + .3);
  if (chance(.7)) pottedPlant(P, w/2 - .2, d/2 + .25); if (chance(.6*S.green)) plant('fern', P, w/2 + .1, 0, d/2 - .2, 1.0);
  Object.assign(lot, { height: h + (NO_ROOF ? .08 : .5), floors: 2, occupied: true });
}
// Lube shed: an open-fronted timber shed under a glass roof, string lights, a workbench, drums of oil
function lubeShed(lot, st, P0){
  const w = rnd(1.9, 2.1), d = rnd(1.8, 2.0), h = rnd(1.3, 1.45), P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  box(M.inConc2, P, 0, .04, 0, w + .1, .08, d + .1);
  // back and side walls in planks, the front open
  box(M.inWood2, P, 0, h/2, -d/2 + .04, w, h, .08);
  for (const s of [-1, 1]) box(M.inWood2, P, s*(w/2 - .04), h/2, -.15, .08, h, d - .3);
  for (const F of [under(P, T(0, 0, -d/2, PI)), under(P, T(w/2, 0, -.15, PI/2)), under(P, T(-w/2, 0, -.15, -PI/2))]) for (let y = .12; y < h; y += .14) box(M.inWood, F, 0, y, .01, w - .1, .02, MIN_T);
  box(pick(IN_SHOP), P, 0, h*.5, -d/2 + .09, w - .3, h*.75, MIN_T);   // the lit back wall
  // posts and beams
  for (const [sx, sz] of CORNERS) box(M.inWood, P, sx*(w/2 - .05), h/2, sz*(d/2 - .05), .1, h, .1);
  box(M.inWood, P, 0, h, d/2 - .05, w, .12, .12); box(M.inWood, P, 0, h, -d/2 + .05, w, .12, .12);
  // the glass roof: two slopes of glass on timber rafters
  const rise = .5, slope = Math.atan2(rise, d/2 + .15), L = Math.hypot(d/2 + .15, rise);
  for (const s of [-1, 1]){
    box(M.lxGlass, P, 0, h + .06 + rise/2, s*(d/4 + .05), w + .2, .02, L, 0, s*slope);
    for (let x = -w/2 - .05; x <= w/2 + .06; x += .35) box(M.inWood, P, x, h + .08 + rise/2, s*(d/4 + .05), .05, .05, L, 0, s*slope);
  }
  box(M.inWood, P, 0, h + rise + .08, 0, w + .2, .07, .07);
  // inside: a workbench, drums, crates, a hanging lamp
  box(M.inWood, P, -.2, .42, -d/2 + .35, 1.0, .05, .4); for (const s of [-1, 1]) box(M.inWood2, P, -.2 + s*.45, .2, -d/2 + .35, .05, .4, .35);
  for (let k=0; k<4; k++) box(pick([M.metalDark, M.inGas2, M.hazard, M.red2]), P, -.6 + k*.25, .5, -d/2 + .3, .08, rnd(.08, .15), .08);
  drum(P, w/2 - .3, -d/2 + .35, M.hazard); drum(P, w/2 - .3, -d/2 + .65, M.inBlue2); if (chance(.6)) drum(P, w/2 - .6, -d/2 + .35, M.red2);
  crateAt(P, -w/2 + .3, 0, .1); if (chance(.6)) crateAt(P, -w/2 + .3, .22, .1, .85);
  cyl(M.frame, P, 0, h - .15, 0, .01, .3); box(M.bulb, P, 0, h - .32, 0, .1, .06, .1); glow(P, 0, h - .35, 0, 'warm', 1.2);
  // string lights along the front eave, the sign hanging under the front beam
  for (let x = -w/2 + .1; x < w/2; x += .18){ const sag = .06*Math.sin(PI*(x + w/2)/w); box(M.bulb, P, x, h - .1 - sag, d/2 + .02, .04, .05, .04); if (chance(.4)) glow(P, x, h - .14 - sag, d/2 + .05, 'warm', .4); }
  const Fs = under(P, T(0, 0, d/2 + .02, 0));
  for (const s of [-1, 1]) box(M.frame, Fs, s*.4, h - .14, 0, .015, .14, .015);
  wordSign(Fs, 'sign_w_lube', 0, h - .33, .04, .8, 'hazard');
  if (!NO_ROOF){ cyl(M.inRust2, P, w/2 - .25, h + .5, -d/2 + .25, .06, 1.1); cyl(M.metalDark, P, w/2 - .25, h + 1.06, -d/2 + .25, .08, .05); emitters.push(new THREE.Vector3(w/2 - .25, h + 1.15, -d/2 + .25).applyMatrix4(P)); }
  for (let k=0; k<irand(2, 3); k++) pottedPlant(P, w/2 + .1, d/2 - .2 - k*.3, rnd(.8, 1.1));
  if (chance(.6*S.green)) plant(pick(['bushFlower','fern']), P, -w/2 - .1, 0, d/2 - .1, .9);
  Object.assign(lot, { height: h + rise + .1, floors: 1, occupied: true });
}

/* ---------- taller industry ---------- */
Object.assign(M, {
  idGold: toon(0xc49a48), idGoldLit: toon(0xb8903a, { em:0x6a4a10, kind:'trim' }), idBrass: toon(0xa8823a),
  inNeon: toon(0x2a8a92, { em:0x52e6f2, kind:'lamp' }),   // steady cyan strip lighting, lit day and night
  btConc: toon(0x8a8e88), btConc2: toon(0x70746e), btConc3: toon(0x5c605a),
  btCyan: toon(0x5aa8b0, { em:0x5ad8e8, kind:'window' }), btWarm: toon(0xb8a070, { em:0xe8c070, kind:'window' }),
});
// Stacked yard: two or three of the yard's buildings piled up on concrete decks, an outside stair climbing them.
// The lower ones are flat-roofed (NO_ROOF); the top one keeps its roof, chimneys and pipes.
function stackedWorks(lot, st, P0){
  const lowers = [repairsBlock, partsWarehouse, hall], uppers = [scrapShed, gearWorkshop, repairsBlock, partsWarehouse, lubeShed, silos];
  const n = chance(.35) ? 3 : 2, stairSide = pick([0, PI/2, PI, -PI/2]);
  let y = 0, floors = 0;
  for (let k=0; k<n; k++){
    const last = k === n - 1, f = last ? pick(uppers) : pick(lowers), sub = { ...lot, height: 0, floors: 0 }, keep = NO_ROOF;
    if (!last) NO_ROOF = true;
    f(sub, st, under(P0, T(0, y, 0)));
    NO_ROOF = keep;
    const h = Math.max(sub.height, FH);
    if (!last){
      // the deck: a concrete slab with a hazard edge and a rail, the next building stands on it
      box(M.btConc2, P0, 0, y + h + .06, 0, 2.5, .12, 2.5); box(M.hazard, P0, 0, y + h + .01, 1.25, 2.5, .03, MIN_T);
      for (const [a, b, c2, d2] of [[-1.22, -1.22, 1.22, -1.22], [1.22, -1.22, 1.22, 1.22]]) { const len = Math.hypot(c2 - a, d2 - b); box(M.frame, P0, (a + c2)/2, y + h + .4, (b + d2)/2, a === c2 ? .03 : len, .03, a === c2 ? len : .03); }
      // an outside stair up to the deck
      const Q = under(P0, T(0, y, 0, stairSide)), run = 1.6, n2 = 8;
      for (let s = 0; s < n2; s++) box(M.metalDark, Q, -.8 + (s + .5)*run/n2, (s + 1)*(h + .1)/n2, 1.38, run/n2 + .01, .04, .32);
      strut(M.frame, Q, -.8, .35, 1.54, -.8 + run, h + .45, 1.54, .03);
      for (const x of [-.8, -.8 + run]) box(M.metalDark, Q, x, (x < 0 ? .1 : h)/2, 1.38, .05, x < 0 ? .1 : h, .05);
      y += h + .12;
    } else y += h;
    floors += sub.floors || 1;
  }
  Object.assign(lot, { height: y, floors, occupied: true });
}
// Terraced foundry: an art-deco brick ziggurat. Stepped tiers with rows of tall lit windows, gold zigzag friezes,
// cyan neon along every tier's edge, a tall central pier crowned with a gold fan, brass pipes, smokestacks.
function decoWorks(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2]))), tiers = irand(4, 5);
  let y = 0, w = rnd(2.3, 2.45), d = rnd(2.2, 2.35), oz = 0;
  const tops = [];
  for (let k=0; k<tiers; k++){
    const h = k === 0 ? rnd(1.15, 1.3) : rnd(.95, 1.15);
    box(M.inBrick, P, 0, y + h/2, oz, w, h, d);
    for (const f of faces(w, d)){
      const F = under(P, T(f.nx*f.half, y, oz + f.nz*f.half, f.ry));
      for (let yy = .2; yy < h - .25; yy += .2) box(M.inBrick2, F, 0, yy, .004, f.len - .04, .02, MIN_T*.5);   // brick courses
      const nWin = Math.max(2, Math.floor((f.len - .3)/.26));
      for (let i=0; i<nWin; i++){ const t = -f.len/2 + .15 + (i + .5)*(f.len - .3)/nWin; box(M.inBrick2, F, t, h*.42, .02, .14, h*.48, MIN_T); box(chance(.75) ? M.inShop : M.glassDark, F, t, h*.42, .03, .09, h*.42, MIN_T); }
      // the frieze under the cap: a dark band with a gold zigzag
      box(M.inBrick2, F, 0, h - .13, .035, f.len, .12, MIN_T);
      for (let t = -f.len/2 + .07, q = 0; t < f.len/2 - .05; t += .12, q++) box(M.idGold, F, t, h - .13, .06, .14, .025, MIN_T, 0, 0, q % 2 ? .6 : -.6);
      if (k === 0) for (let t = -f.len/2 + .55; t < f.len/2 - .4; t += 1.0){ strut(M.inNeon, F, t - .3, .62, .07, t, .2, .07, .04); strut(M.inNeon, F, t + .3, .62, .07, t, .2, .07, .04); glow(F, t, .4, .25, 'cyan', .7); }   // neon chevrons round the base
    }
    // the cap, with a cyan neon line along all four edges
    box(M.inBrick2, P, 0, y + h + .05, oz, w + .1, .1, d + .1);
    for (const [x, z, L, along] of [[0, d/2 + .06, w + .12, 1], [0, -d/2 - .06, w + .12, 1], [w/2 + .06, 0, d + .12, 0], [-w/2 - .06, 0, d + .12, 0]]) box(M.inNeon, P, x, y + h + .05, oz + z, along ? L : .04, .05, along ? .04 : L);
    for (const [sx, sz] of CORNERS) glow(P, sx*w/2, y + h + .05, oz + sz*d/2, 'cyan', .9);
    tops.push({ y: y + h + .1, w, d, oz });
    y += h + .1; w -= rnd(.3, .38); d -= rnd(.26, .32); oz -= .06;
  }
  // the terraces left on each step: vents, pipes, little planters
  for (let k=0; k<tops.length - 1; k++){ const t = tops[k], n = tops[k + 1];
    for (let q=0; q<2; q++){ const side = pick([-1, 1]), x = side*(n.w/2 + (t.w - n.w)/4); if (chance(.5)) box(M.metalDark, P, x, t.y + .12, t.oz + rnd(-t.d/3, t.d/3), .16, .22, .2); else { box(M.inBrick2, P, x, t.y + .08, t.oz + rnd(-t.d/3, t.d/3), .16, .14, .3); plant(pick(['bush','bonsai','fern']), P, x, t.y + .15, t.oz, .7); } } }
  // the central pier up the front, crowned with a gold fan
  const top = tops[tops.length - 1], pz = tops[0].d/2 + .1, ph = top.y + .7;
  box(M.inBrick2, P, 0, ph/2, pz - .1, .42, ph, .25);
  for (const x of [-.12, 0, .12]) box(M.idGoldLit, P, x, ph/2, pz + .03, .025, ph - .3, MIN_T);
  for (let a = -1.2; a <= 1.21; a += .4) strut(M.idGold, P, 0, ph - .1, pz + .05, Math.sin(a)*.32, ph - .1 + Math.cos(a)*.32, pz + .05, .035);
  box(M.idGold, P, 0, ph - .1, pz + .05, .5, .04, MIN_T);
  // the entrance at its foot: gold doors under a gold fan
  box(M.idBrass, P, 0, .38, pz + .06, .36, .76, MIN_T); box(M.frame, P, 0, .38, pz + .08, .02, .7, MIN_T);
  for (let a = -1.1; a <= 1.11; a += .37) strut(M.idGold, P, 0, .8, pz + .08, Math.sin(a)*.2, .8 + Math.cos(a)*.2, pz + .08, .025);
  glow(P, 0, .5, pz + .3, 'warm', 1.0);
  // brass pipes down the tiers, smokestacks on top
  for (let q=0; q<irand(2, 3); q++){ const s = pick([-1, 1]), t = tops[irand(1, tops.length - 1)], x = s*(t.w/2 + .08); pipeRun(M.idBrass, P, [[x*.7, t.y + .3, t.oz + rnd(-.3, .3)], [x, t.y + .3, t.oz], [x, .25, t.oz], [x + s*.15, .25, t.oz]], .045, true); }
  if (!NO_ROOF) for (let q=0; q<irand(2, 3); q++){
    const x = rnd(-top.w/2 + .2, top.w/2 - .2), z = top.oz + rnd(-top.d/2 + .2, top.d/2 - .2), sh = rnd(1.4, 2.4), r = rnd(.09, .13);
    put(U.cyl16, M.inBrick2, under(P, T(x, top.y + sh/2, z, 0, 2*r, sh, 2*r)));
    for (const u of [.35, .7, 1]) put(U.cyl16, M.idGold, under(P, T(x, top.y + sh*u, z, 0, 2*r + .04, .05, 2*r + .04)));
    emitters.push(new THREE.Vector3(x, top.y + sh + .1, z).applyMatrix4(P));
  }
  Object.assign(lot, { height: top.y, floors: tiers*2, occupied: true });
}
// Brutalist works tower: a mossy concrete block, offset in a few stacked chunks, grids of cyan and warm lit
// windows; a round concrete silo beside it with glowing portholes; rusty pipes wrapped round both; moss dripping
function brutalTower(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2]))), chunks = irand(3, 5);
  let y = 0; const bx = .3;
  const blocks = [];
  for (let k=0; k<chunks; k++){
    const w = rnd(1.55, 1.8), d = rnd(1.5, 1.75), h = rnd(1.0, 1.35), ox = bx + rnd(-.08, .08), oz = rnd(-.1, .1);
    box(M.btConc, P, ox, y + h/2, oz, w, h, d);
    for (const f of faces(w, d)){
      const F = under(P, T(ox + f.nx*f.half, y, oz + f.nz*f.half, f.ry));
      if (chance(.8)){   // a grid of windows in a recessed concrete frame
        const gw = f.len*.7, gh = h*.62, cols = Math.max(2, Math.round(gw/.22)), rows = 2, cw = gw/cols, rh = gh/rows;
        box(M.btConc3, F, 0, h*.5, .01, gw + .08, gh + .08, MIN_T);
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) box(chance(.6) ? M.btCyan : chance(.6) ? M.btWarm : M.glassDark, F, -gw/2 + (c + .5)*cw, h*.5 - gh/2 + (r + .5)*rh, .02, cw - .04, rh - .04, MIN_T);
      }
      for (let q=0; q<irand(2, 4); q++) box(chance(.5) ? M.inMoss : M.btConc2, F, rnd(-f.len/2 + .15, f.len/2 - .15), rnd(.1, h - .1), .006 + .002*q, rnd(.1, .35), rnd(.15, .5), MIN_T);   // stains and moss
    }
    box(M.btConc2, P, ox, y + h + .05, oz, w + .14, .1, d + .14);   // the ledge
    for (let q=0; q<irand(3, 6); q++){ const a = rnd(0, TAU), ex = ox + Math.cos(a)*(w/2 + .05), ez = oz + Math.sin(a)*(d/2 + .05); blob(M.inMoss, P, Math.max(ox - w/2, Math.min(ox + w/2, ex)), y + h + .1, Math.max(oz - d/2, Math.min(oz + d/2, ez)), rnd(.07, .13), .4); }
    for (const f of faces(w + .14, d + .14)) if (chance(.5*S.green)) plant(pick(['vines','l_mossroots','h_ivy','pothos']), under(P, T(ox + f.nx*f.half, 0, oz + f.nz*f.half, f.ry)), rnd(-f.len/3, f.len/3), y + h + .06, .02, rnd(.7, 1.0), 't', true);
    blocks.push({ ox, oz, w, d, y, h });
    y += h + .1;
  }
  const H = y;
  // the silo beside it: banded concrete, portholes lit cyan, a capped top with a rail
  const sx = bx - .95, sz = -.35, sr = rnd(.45, .52), sh = H + rnd(.4, .9);
  put(U.cyl16, M.btConc, under(P, T(sx, sh/2, sz, 0, 2*sr, sh, 2*sr)));
  for (let yy = 1.0; yy < sh - .3; yy += rnd(1.1, 1.5)) put(U.cyl16, M.btConc2, under(P, T(sx, yy, sz, 0, 2*sr + .06, .1, 2*sr + .06)));
  for (let yy = .7; yy < sh - .4; yy += .85) for (const a of [PI*.25, PI*.75, PI*1.25]){
    if (chance(.25)) continue;
    const Q = under(P, T(sx + Math.sin(a)*(sr - .01), yy, sz + Math.cos(a)*(sr - .01), a));
    put(U.cyl16, M.btConc3, under(Q, T(0, 0, .02, 0, .22, .06, .22, PI/2))); put(U.cyl16, M.btCyan, under(Q, T(0, 0, .04, 0, .15, .03, .15, PI/2))); glow(Q, 0, 0, .15, 'cyan', .5);
  }
  put(U.cyl16, M.btConc2, under(P, T(sx, sh + .05, sz, 0, 2*sr + .1, .1, 2*sr + .1)));
  if (!NO_ROOF){ box(M.btConc2, P, sx, sh + .25, sz, .35, .3, .35); for (let a = 0; a < TAU; a += .5) box(M.frame, P, sx + Math.sin(a)*(sr - .03), sh + .25, sz + Math.cos(a)*(sr - .03), .03, .3, .03); }
  moss(P, sx, sh + .12, sz, 3);
  // rusty pipes: down the faces, across between silo and block, round the corners
  for (let q=0; q<irand(4, 6); q++){
    const b = pick(blocks), side = pick([-1, 1]), r = rnd(.035, .06), mat = pick([M.inPipe, M.inRust, M.inPipe2, M.inRust2]);
    const x = b.ox + side*(b.w/2 + .07), z0 = b.oz + rnd(-b.d/3, b.d/3), y0 = b.y + b.h - .2, y1 = rnd(.2, Math.max(.3, b.y));
    pipeRun(mat, P, [[x - side*.1, y0 + .25, z0], [x, y0 + .25, z0], [x, y1, z0], [x, y1, z0 + rnd(-.3, .3)], [x + side*.12, y1 - .15, z0]], r*1.3, true, .35);
  }
  for (let q=0; q<irand(2, 3); q++){ const yy = rnd(.6, H - .4), mat = pick([M.inPipe, M.inRust]); pipeRun(mat, P, [[sx + sr, yy, sz + .1], [sx + sr + .3, yy, sz + .1], [sx + sr + .3, yy + rnd(-.3, .3), sz + .5], [bx - .5, yy, sz + .5]], rnd(.04, .06), true); }
  // the top: a smaller plant room with grilles and vents
  const tb = blocks[blocks.length - 1];
  if (!NO_ROOF){
    box(M.btConc2, P, tb.ox + rnd(-.2, .2), H + .25, tb.oz + rnd(-.2, .2), tb.w*.5, .5, tb.d*.5);
    for (let q=0; q<2; q++){ const gx = tb.ox + rnd(-tb.w/3, tb.w/3), gz = tb.oz + rnd(-tb.d/3, tb.d/3); box(M.btConc3, P, gx, H + .04, gz, .4, .08, .3); for (let t = -.15; t <= .16; t += .06) box(M.frame, P, gx + t, H + .09, gz, .02, .02, .26); }
    if (chance(.6)) emitters.push(new THREE.Vector3(tb.ox, H + .6, tb.oz).applyMatrix4(P));
  }
  // at the foot: puddles of runoff, rubble, ferns
  for (let q=0; q<irand(2, 4); q++){ const x = rnd(-1.1, 1.1), z = rnd(.8, 1.1), sc = rnd(.7, .95); chance(.5) ? plant(pick(['fern','g_fern2','bush']), P, x, 0, z, sc) : floorSmall(P, x, .046, z, sc + .1); }
  Object.assign(lot, { height: NO_ROOF ? H : Math.max(H, sh), floors: chunks*2, occupied: true });
}

/* ---------- the commercial strip's ramshackle shops: a container stack, a spiral tower and a corner market ---------- */
const MC = {
  teal: toon(0x4d7a76), teal2: toon(0x5f8a80), tealDark: toon(0x3b605e), patch: toon(0x8a7a5a), patch2: toon(0x6f6a7a),
  conRed: toon(0x8e3b30), conRed2: toon(0x6e2c24), conGreen: toon(0x3f6b4c), conGreen2: toon(0x2f5239),
  conYellow: toon(0xb38a34), conYellow2: toon(0x8a6826), conBlue: toon(0x3f6488), conBlue2: toon(0x2f4c68),
  conRust: toon(0x6e4a32), conRust2: toon(0x553826),
  tarp: toon(0x3d5f86), tarp2: toon(0x2f4a6a), tarpGreen: toon(0x4a5a3a),
  cabbage: toon(0x8fbf5a), daikon: toon(0xe8e6d6), tomato: toon(0xc8402e), lemon: toon(0xe8c840), chili: toon(0xb02a1e),
  potato: toon(0x9a7a4a), garlic: toon(0xe6dcc8), bottle: toon(0x9fd0e0), sack: toon(0xb89a6e), card: toon(0xb08a5a), card2: toon(0x9a7448),
  copper: toon(0x8a5a3a), paper: toon(0xe0d4b0), white: toon(0xe8e8e2), cross: toon(0xc0302a), board: toon(0x22262c), chalk: toon(0xd8d8cc),
  cushion: toon(0xb05a4a), cushion2: toon(0x5a7a9a), soup: toon(0xd8a050),
};
const CONT = [[MC.conRed, MC.conRed2], [MC.conGreen, MC.conGreen2], [MC.conYellow, MC.conYellow2], [MC.conBlue, MC.conBlue2], [MC.conRust, MC.conRust2]];
// a sagging wire with small warm bulbs
function bulbString(P, ax, ay, az, bx, by, bz, sag){
  const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay, bz - az)/.22));
  let px = ax, py = ay, pz = az;
  for (let k=1; k<=n; k++){
    const t = k/n, x = ax + (bx - ax)*t, y = ay + (by - ay)*t - sag*Math.sin(PI*t), z = az + (bz - az)*t;
    strut(M.frame, P, px, py, pz, x, y, z, .01);
    if (k < n){ box(M.bulb, P, x, y - .035, z, .045, .05, .045); if (k % 2) glow(P, x, y - .04, z, 'warm', .35); }
    px = x; py = y; pz = z;
  }
}
// a plain sagging cable
function sagCable(P, ax, ay, az, bx, by, bz, sag){
  const n = 6; let px = ax, py = ay, pz = az;
  for (let k=1; k<=n; k++){ const t = k/n, x = ax + (bx - ax)*t, y = ay + (by - ay)*t - sag*Math.sin(PI*t), z = az + (bz - az)*t; strut(M.frame, P, px, py, pz, x, y, z, .012); px = x; py = y; pz = z; }
}
// a tarp sloping out from a wall (local z out), ragged strips hanging off its low edge
function raggedTarp(F, x, y, w, depth, slope, mat){
  box(mat, F, x, y - Math.sin(slope)*depth/2, depth/2*Math.cos(slope), w, .03, depth, 0, slope);
  const ey = y - Math.sin(slope)*depth, ez = depth*Math.cos(slope);
  for (let t = x - w/2 + .06; t < x + w/2 - .03; t += rnd(.09, .16)){ const l = rnd(.04, .2); box(mat, F, t, ey - l/2, ez, rnd(.05, .1), l, MIN_T); }
}
function birdCage(P, x, y, z){
  box(M.frame, P, x, y + .14, z, .015, .1, .015);
  cyl(M.inRust2, P, x, y - .08, z, .075, .02); cyl(M.inRust2, P, x, y + .06, z, .06, .02); sph(M.inRust2, P, x, y + .07, z, .06, .5);
  for (let a = 0; a < 4; a++) box(M.inRust, P, x + Math.sin(a*PI/2)*.065, y - .01, z + Math.cos(a*PI/2)*.065, .012, .13, .012);
}
// produce in an open crate or a basket: a heap of round things on top
function produceCrate(P, x, y, z, mat, ry = 0, basket = false){
  if (basket) cyl(M.inWood, P, x, y + .06, z, .13, .12); else box(M.inWood, P, x, y + .07, z, .32, .14, .24, ry);
  const n = basket ? 4 : 6;
  for (let k=0; k<n; k++){ const a = k/n*TAU + rnd(0, .5), r = basket ? .06 : .08;
    if (mat === MC.daikon) box(mat, P, x + Math.cos(a)*r, y + .16, z + Math.sin(a)*r*.6, .2, .04, .04, ry + rnd(-.3, .3));
    else sph(mat, P, x + Math.cos(a)*r, y + .15 + rnd(0, .03), z + Math.sin(a)*r*.7, mat === MC.cabbage ? .06 : .04); }
  if (mat === MC.daikon) for (let k=0; k<3; k++) box(M.green2, P, x + .1, y + .17, z + rnd(-.06, .06), .1, .03, .05, ry);   // the leafy tops
}
function cardboard(P, x, z, n){ let y = 0; for (let k=0; k<n; k++){ const s = rnd(.2, .3); box(chance(.5) ? MC.card : MC.card2, P, x + rnd(-.03, .03), y + s/2, z + rnd(-.03, .03), s, s*.85, s, rnd(-.2, .2)); box(MC.paper, P, x, y + s*.85 - .01, z, .04, .02, s + .01); y += s*.85; } }
function stool(P, x, z){ cyl(chance(.5) ? M.red2 : MC.conBlue, P, x, .14, z, .08, .03); for (const s of [-1, 1]) box(M.frame, P, x + s*.05, .07, z, .02, .14, .02); }

// Container stack: shipping containers piled two deep, every floor a little shop with its long side cut open on a lit
// room and its neon name across the top; scaffolding and walkways up one side, awnings, sagging cables, a noodle bar
// at the bottom and a tea lounge under a tarp and string lights on the roof
function containerStack(lot, st, P0){
  const P = under(P0, T(-.15, 0, -.1, pick([0, PI/2, PI, -PI/2])));
  const CL = 2.0, CD = .86, CH = .95, n = irand(3, 4);
  const shops = [['sign_w_barber','pink',M.interiorPink], ['sign_w_meds','green',M3.greenLit], ['sign_w_fixit','amber',M.inShop], ['sign_w_stitch','cyan',M.interiorCool], ['sign_w_herbs','green',M3.greenLit]].sort(() => R() - .5);
  let prev = -1, crossed = false;
  const zF = CD/2 + .015, zB = -CD/2 - .015;
  for (let f=0; f<=n; f++){
    const y = f*CH;
    for (const z of [zB, zF]){
      let ci; do ci = Math.floor(R()*CONT.length); while (ci === prev); prev = ci;
      const [body, rib] = CONT[ci], ox = f ? rnd(-.1, .1) : 0, front = z === zF;
      box(body, P, ox, y + CH/2, z, CL, CH - .01, CD);
      for (const fc of faces(CL, CD)){
        const F = under(P, T(ox + fc.nx*fc.half, y, z + fc.nz*fc.half, fc.ry));
        if (front && fc.nz === 1){
          // the open side: a lit room behind the frame, with the shop's things against the light
          const shop = f ? shops[(f - 1) % shops.length] : null, room = shop ? shop[2] : M.inShop2;
          box(rib, F, 0, CH - .05, .01, fc.len, .1, .04); box(rib, F, 0, .04, .01, fc.len, .08, .04);
          box(room, F, 0, CH*.47, .02, fc.len - .16, CH - .2, MIN_T);
          for (let k=0; k<irand(3, 5); k++) box(M.frame, F, rnd(-fc.len/2 + .2, fc.len/2 - .2), rnd(.15, .3), .05, rnd(.12, .25), rnd(.1, .3), MIN_T);   // counters, chairs, crates
          box(M.frame, F, 0, CH*.62, .05, fc.len - .3, .025, MIN_T);   // a shelf
          for (let t = -fc.len/2 + .25; t < fc.len/2 - .2; t += .14) if (chance(.6)) box(pick([M.frame, MC.paper, M.red2, M.green2]), F, t, CH*.62 + .05, .05, .06, .08, MIN_T);
          // the signs are stacked close together here, so each gets a small, faint halo (full-size ones bloomed into one blur)
          if (shop) wordSign(F, shop[0], rnd(-.25, .25), CH - .2, .1, 1, shop[1], .7);
          else wordSign(F, 'sign_w_ramen', -.35, CH - .2, .1, 1, 'pink', .7);
        } else {
          corrRibs(F, fc.len, .04, CH - .1, rib, .11);
          if (fc.nx !== 0){   // the container doors: locking bars on the ends
            for (const t of [-.25, -.1, .1, .25]) box(M.metalDark, F, t*CD/.86, CH/2, .035, .025, CH - .14, .025);
            if (!crossed && f >= 1 && f <= 2 && fc.nx === -1 && !front){ crossed = true;   // a clinic's red cross
              box(MC.white, F, 0, CH/2, .05, .32, .32, MIN_T); box(MC.cross, F, 0, CH/2, .06, .2, .07, MIN_T); box(MC.cross, F, 0, CH/2, .06, .07, .2, MIN_T); }
          }
          for (let k=0; k<irand(0, 2); k++) box(pick([MC.paper, MC.conRust2, M.inRust]), F, rnd(-fc.len/2 + .2, fc.len/2 - .2), rnd(.2, CH - .2), .04, rnd(.12, .3), rnd(.12, .3), MIN_T);   // notices, patches
        }
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(M.frame, P, ox + sx*(CL/2 - .02), y + CH/2, z + sz*(CD/2 - .02), .05, CH, .05);   // corner posts
    }
    // a corrugated awning over the front on some floors
    if (f && chance(.3)) box(chance(.5) ? M.inRust : MC.conBlue2, P, chance(.5) ? -.6 : .6, y + CH*.55, zF + CD/2 + .14, rnd(.5, .7), .03, .3, 0, .32);   // a little tin hood over one end of the opening
  }
  const top = (n + 1)*CH;
  // the scaffold up the right side: posts, a plank walkway with a rail on every floor, a ladder
  const sx = CL/2 + .28;
  for (const z of [-CD - .1, 0, CD + .1]) box(M.inRust, P, sx + .15, top/2, z, .045, top, .045);
  for (const z of [-CD - .1, CD + .1]) box(M.inRust, P, sx - .17, top/2, z, .045, top, .045);
  for (let f=1; f<=n; f++){ const y = f*CH;
    box(M.inWood2, P, sx, y + .02, 0, .36, .035, 2*CD + .25);
    box(M.inRust, P, sx + .15, y + .3, 0, .03, .03, 2*CD + .25); box(M.inRust, P, sx + .15, y + .16, 0, .025, .025, 2*CD + .25);
    for (const s of [-1, 1]) strut(M.inRust, P, sx + .15, y - CH, s*(CD + .1), sx + .15, y, 0, .012);   // cross bracing
    const lz = (f % 2 ? -1 : 1)*(CD - .1);
    for (let yy = y - CH + .15; yy < y; yy += .16) box(M.frame, P, sx - .05, yy, lz, .025, .025, .22);   // ladder rungs
    for (const s of [-1, 1]) box(M.frame, P, sx - .05, y - CH/2, lz + s*.11, .025, CH, .025);
  }
  // cables sagging across the front and down the side
  for (let k=0; k<irand(2, 4); k++){ const y = rnd(.9, top - .3); sagCable(P, -CL/2 - .05, y, zF + CD/2 + .03, CL/2 + .4, y + rnd(-.2, .2), zF + CD/2 + .03, rnd(.08, .2)); }
  for (let k=0; k<2; k++) if (chance(.6*S.green)) plant(hangKind(), under(P, T(rnd(-CL/3, CL/3), 0, zF + CD/2 + .03)), 0, rnd(CH*2, top - .1), 0, rnd(.7, .95), 't', true);
  // the noodle bar at the bottom: a counter, woks steaming, chillies hanging, stools, gas, crates and rubbish bags
  const cz = zF + CD/2 + .32;
  box(M.inWood, P, -.2, .3, cz, 1.3, .6, .22); box(M.inWood2, P, -.2, .62, cz, 1.38, .04, .3);
  for (const x of [-.6, -.15]){ cyl(M.metalDark, P, x, .67, cz, .1, .04); cyl(MC.soup, P, x, .69, cz, .08, .015); }
  box(M.frame, P, -.2, .9, cz + .15, 1.2, .02, .02);
  for (let t = -.75; t < .35; t += .09) box(MC.chili, P, t, .82 + rnd(-.02, .02), cz + .15, .03, rnd(.08, .14), .03);
  box(M.inRust, P, -.2, CH + .02, cz + .05, 1.6, .03, .7, 0, .25);   // the stall's own tin awning
  for (const x of [-.75, -.2, .35]) stool(P, x, cz + .32);
  gasBottles(P, .55, cz, 1); crateAt(P, .75, 0, cz - .05); crateAt(P, -CL/2 - .1, 0, cz - .1);
  for (let k=0; k<irand(2, 4); k++) blob(pick([M.frame, MC.white, M.metalDark]), P, -CL/2 + rnd(-.25, .1), .1, rnd(-.4, .6), rnd(.08, .13), .8);
  cardboard(P, CL/2 + .1, zF + CD/2 + .25, irand(2, 3));
  // the roof: a tea lounge on planks under a tarp and string lights, cushions round low tables, plants, a water tank and an antenna
  if (!NO_ROOF){
    const R0 = under(P, T(0, top, 0));
    box(M.inWood2, R0, 0, .02, 0, CL - .1, .04, 2*CD - .1);
    for (const [x, z] of [[-CL/2 + .1, -CD + .1], [CL/2 - .1, -CD + .1], [-CL/2 + .1, CD - .1], [CL/2 - .1, CD - .1]]) box(M.frame, R0, x, .45, z, .04, .9, .04);
    box(MC.tarp, R0, -.1, .92, -.1, CL + .15, .03, 2*CD - .2, 0, .08, .05);
    for (const t of [-CL/2 + .15, .05, CL/2 - .3]) box(MC.tarp, R0, t, .82, CD - .12, rnd(.15, .3), rnd(.1, .2), MIN_T);   // ragged edge
    bulbString(R0, -CL/2 + .1, .85, CD - .1, CL/2 - .1, .85, CD - .1, .12);
    bulbString(R0, CL/2 - .1, .85, CD - .1, CL/2 - .1, .85, -CD + .1, .1);
    for (const x of [-.45, .35]){ box(M.inWood, R0, x, .14, .1, .4, .04, .3); for (const s of [-1, 1]) box(M.frame, R0, x, .07, .1 + s*.1, .36, .12, .03);
      for (const s of [-1, 1]) box(chance(.5) ? MC.cushion : MC.cushion2, R0, x + s*.3, .06, .1, .16, .08, .26);
      sph(MC.white, R0, x, .19, .1, .035); spotAt(R0, x + .3, .1, .1, 'seat', null, [-1, 0]); }
    for (let k=0; k<irand(2, 4); k++) pottedPlant(under(R0, T(0, .04, 0)), rnd(-CL/2 + .2, CL/2 - .2), -CD + .25, rnd(.8, 1.0));
    const tx = CL/2 - .35; put(U.cyl16, MC.white, under(R0, T(tx, .35, -CD + .35, 0, .4, .6, .4))); cyl(M.frame, R0, tx, .67, -CD + .35, .05, .05);
    cyl(M.metalDark, R0, -CL/2 + .2, .8, -CD + .2, .015, 1.5); for (const y of [1.2, 1.4]) box(M.metalDark, R0, -CL/2 + .2, y, -CD + .2, .4, .015, .015);
    sph(MC.white, R0, -CL/2 + .45, .35, -CD + .3, .14, .45);
    wordSign(under(R0, T(.2, 0, CD - .02)), 'sign_w_tea', 0, 1.18, .06, 1, 'cyan', 1.0);
  }
  Object.assign(lot, { height: top + (NO_ROOF ? 0 : 1.0), floors: n + 1, occupied: true });
}

// Spiral tower: a round patched tower ringed by balconies, a stair winding up the outside, lanterns, bird cages and
// laundry on every ring; a ramen bar with red lanterns and a blue tarp at the foot
function spiralTower(lot, st, P0){
  const P = under(P0, T(0, 0, 0, rnd(0, TAU)));
  const r = .7, n = irand(4, 6), H = n*FH, Rb = r + .4, Rs = Rb + .16;
  put(wedgeGeo(r, H, 0, TAU), pick([MC.teal, MC.teal2]), under(P, T(0, H/2, 0)));
  const atA = (a, rad, y) => under(P, T(Math.sin(a)*rad, y, Math.cos(a)*rad, a));   // a frame on the surface, z pointing out
  for (let k=0; k<n*7; k++){ const F = atA(rnd(0, TAU), r - .005, 0); box(pick([MC.patch, MC.patch2, MC.tealDark, M.inRust, MC.paper]), F, 0, rnd(.2, H - .2), .02, rnd(.2, .45), rnd(.18, .5), MIN_T); }
  for (let k=0; k<n*2; k++){ const F = atA(rnd(0, TAU), r - .005, 0); for (let t = -.12; t <= .12; t += .06) box(M.inCorr2, F, t, rnd(.6, H - .4), .03, .035, .4, MIN_T); }   // corrugated patches
  const a0 = rnd(0, TAU);   // where the stair starts, at the ground
  // the rings: a balcony slab, posts and rails, windows and doors behind, things on the walkway
  for (let f=1; f<n; f++){
    const y = f*FH;
    put(arcGeo(r - .02, Rb, .06, 0, TAU), M.inConc2, under(P, T(0, y - .03, 0)));
    const N = 16;
    for (let k=0; k<N; k++){ const a = k/N*TAU, b = (k + 1)/N*TAU, pr = Rb - .03;
      box(M.inRust, P, Math.sin(a)*pr, y + .17, Math.cos(a)*pr, .025, .3, .025);
      strut(M.inRust, P, Math.sin(a)*pr, y + .32, Math.cos(a)*pr, Math.sin(b)*pr, y + .32, Math.cos(b)*pr, .014); }
    for (let k=0; k<3; k++){ const F = atA(rnd(0, TAU), r, y);
      if (k === 0){ box(M2.door, F, 0, .33, .02, .26, .58, MIN_T); box(M.frame, F, 0, .33, .01, .32, .62, MIN_T); }
      else { box(M.frame, F, 0, .48, .01, .36, .34, MIN_T); box(pick(LIT_ROOMS), F, 0, .48, .025, .3, .28, MIN_T); glow(F, 0, .48, .05, 'warm', .4); } }
    for (let k=0; k<irand(3, 5); k++){ const a = rnd(0, TAU), x = Math.sin(a)*(r + .2), z = Math.cos(a)*(r + .2), q = R();
      if (q < .35) pottedPlant(under(P, T(0, y, 0)), x, z, rnd(.7, .9));
      else if (q < .55) crateAt(P, x, y, z, .8);
      else if (q < .75) birdCage(P, Math.sin(a)*(r + .3), y + FH - .3, Math.cos(a)*(r + .3));
      else { box(M.lantern, P, Math.sin(a)*(r + .3), y + FH - .25, Math.cos(a)*(r + .3), .1, .14, .1); glow(P, Math.sin(a)*(r + .3), y + FH - .25, Math.cos(a)*(r + .3), 'orange', .6); } }
    if (chance(.6*S.clutter)){ const a = rnd(0, TAU), F = atA(a, r + .3, y); box(M.frame, F, 0, .55, 0, .5, .012, .012); for (const t of [-.15, 0, .15]) if (chance(.8)) plant(laundryKind(), F, t, .54, 0, .8, 't', true); }
    if (chance(.6)){ const a = rnd(0, TAU); for (let k=0; k<3; k++){ const b = a + k*.7; bulbString(P, Math.sin(b)*(Rb - .05), y + FH - .1, Math.cos(b)*(Rb - .05), Math.sin(b + .7)*(Rb - .05), y + FH - .1, Math.cos(b + .7)*(Rb - .05), .06); } }
    if (chance(.5*S.green)) plant(hangKind(), atA(rnd(0, TAU), Rb, y), 0, -.02, .02, rnd(.7, .9), 't', true);
  }
  // the stair: treads on a helix outside the rings (once round every two floors), rails both sides, brackets back to the rings
  const steps = Math.round(n/2*30), rise = H/steps, da = TAU/30;
  let pi = null;
  for (let k=0; k<steps; k++){
    const a = a0 + k*da, y = (k + 1)*rise, F = atA(a, Rs, y);
    box(M.inWood, F, 0, -.02, 0, .13, .035, .3);
    const pts = [Math.sin(a), Math.cos(a)];
    const cur = [[pts[0]*(Rs - .15), y + .32, pts[1]*(Rs - .15)], [pts[0]*(Rs + .15), y + .32, pts[1]*(Rs + .15)]];
    if (pi){ for (const s of [0, 1]) strut(M.inRust, P, ...pi[s], ...cur[s], .014); }
    if (k % 3 === 0) box(M.inRust, F, 0, .15, .14, .02, .32, .02);
    if (k % 7 === 0){ strut(M.inRust, P, pts[0]*(Rs - .14), y - .03, pts[1]*(Rs - .14), pts[0]*(Rb - .05), Math.floor(y/FH)*FH - .03, pts[1]*(Rb - .05), .02); }   // bracket to the ring below
    pi = cur;
  }
  // the ramen bar at the foot, facing away from where the stair begins
  const as = a0 - PI*.62, Fs = atA(as, r, 0);
  box(M.frame, Fs, 0, .45, .01, 1.0, .82, MIN_T); box(M.inShop2, Fs, -.1, .4, .03, .62, .66, MIN_T); glow(Fs, -.1, .4, .06, 'warm', .7);
  box(M.inWood2, Fs, .35, .35, .03, .26, .62, MIN_T);   // a slatted side door
  for (let t = .26; t < .47; t += .05) box(M.inWood, Fs, t, .35, .045, .02, .6, MIN_T);
  box(M.inWood, Fs, -.1, .28, .2, .7, .05, .22); for (const x of [-.32, .12]) box(M.inWood2, Fs, x, .14, .2, .04, .28, .18);   // counter
  for (const x of [-.3, -.05]){ cyl(MC.white, Fs, x, .33, .2, .06, .04); emitters.push(new THREE.Vector3(x, .5, .2).applyMatrix4(Fs)); }
  box(MC.board, Fs, -.05, .98, .14, 2.0, .58, .05);
  wordSign(Fs, 'sign_w_noodles', -.05, .98, .18, 1, 'amber');
  for (const x of [-.75, .65]){ box(M.lantern, Fs, x, .75, .25, .14, .2, .14); box(M.frame, Fs, x, .88, .25, .03, .06, .03); glow(Fs, x, .75, .25, 'red', .5); noteLight(Fs, x, .75, .25, 0xff4030); }
  raggedTarp(atA(as + .9, r, 0), 0, .95, .8, .55, .35, MC.tarp);
  for (let k=0; k<3; k++){ const a = as + .9 + rnd(-.3, .3); produceCrate(P, Math.sin(a)*(r + .55), 0, Math.cos(a)*(r + .55), pick([MC.cabbage, MC.daikon, MC.potato]), a); }
  for (const x of [-.6, -.15, .3]) stool(Fs, x, .45);
  const Fb = atA(as - .1, r + .75, 0); box(MC.board, Fb, 0, .3, 0, .3, .42, .03, 0, -.15); for (let k=0; k<4; k++) box(MC.chalk, Fb, rnd(-.04, .02), .4 - k*.07, .02, rnd(.1, .2), .015, MIN_T, 0, -.15);   // the chalk menu
  for (let k=0; k<irand(2, 3); k++){ const a = as + rnd(-1.4, -.9); blob(pick([MC.white, M.frame]), P, Math.sin(a)*(r + .5), .1, Math.cos(a)*(r + .5), rnd(.08, .12), .8); }
  { const a = as + rnd(-1.2, -1.0); cyl(pick([MC.conBlue, M.green2, M.red2]), P, Math.sin(a)*(r + .35), .2, Math.cos(a)*(r + .35), .12, .4); }   // a bin
  // the roof: a cap with water tanks, a dish, antennas and a little shed
  put(wedgeGeo(r + .06, .08, 0, TAU), M.inConc2, under(P, T(0, H + .04, 0)));
  if (!NO_ROOF){
    put(U.cyl16, MC.white, under(P, T(.25, H + .35, -.15, 0, .32, .55, .32))); put(U.cyl16, M.inRust, under(P, T(-.2, H + .25, -.25, 0, .26, .35, .26)));
    sph(MC.white, P, -.15, H + .3, .3, .14, .45); cyl(M.metalDark, P, -.3, H + .7, .1, .015, 1.3);
    box(M.inCorr2, P, .2, H + .22, .3, .35, .36, .3);
    for (let k=0; k<2; k++){ const a = rnd(0, TAU); sagCable(P, 0, H + .9, 0, Math.sin(a)*1.4, H - .3, Math.cos(a)*1.4, .15); }
  }
  Object.assign(lot, { height: H + .08, floors: n, occupied: true });
}

// Corner market: a two-storey corrugated corner shop, its ground floor open on a lit market of produce crates, sacks,
// baskets and water; a wooden counter of bottles at the side under a ragged tarp, a neon sign on a plank above,
// pipes up the walls, a roller shutter and a pile of boxes round the corner
function cornerMarket(lot, st, P0){
  const P = under(P0, T(0, 0, -.05, pick([0, PI/2, PI, -PI/2])));
  const w = 2.0, d = 1.65, h1 = 1.0, h2 = .9, xr = .35, wall = pick([MC.tealDark, MC.conBlue2, M.inCorr]), rib = pick([M.inCorr2, MC.tealDark, MC.conBlue2]);
  // the closed right-hand block and the back wall of the market
  box(wall, P, (xr + w/2)/2, h1/2, 0, w/2 - xr, h1, d);
  box(M.inShop, P, (-w/2 + xr)/2, h1/2, -d/2 + .05, xr + w/2, h1, .1);
  box(M.inConc, P, (-w/2 + xr)/2, .02, 0, xr + w/2, .04, d);
  box(wall, P, -w/2 + .03, h1/2, -d/4, .06, h1, d/2);   // a short side wall at the back left
  for (const [x, z] of [[-w/2 + .05, d/2 - .05], [-w/2 + .05, 0], [xr - .05, d/2 - .05]]) cyl(M.inWood2, P, x, h1/2, z, .04, h1);
  // the upper floor, corrugated all round, a lit window, a green tarp hung over the front
  box(wall, P, 0, h1 + h2/2, 0, w, h2, d);
  for (const fc of faces(w, d)){ const F = under(P, T(fc.nx*fc.half, 0, fc.nz*fc.half, fc.ry));
    corrRibs(F, fc.len, h1, h2, rib, .12);
    if (fc.nz !== 1) corrRibs(F, fc.len, 0, h1, rib, .12);
    for (let k=0; k<irand(1, 3); k++) box(pick([MC.paper, M.inRust, MC.patch]), F, rnd(-fc.len/2 + .2, fc.len/2 - .2), rnd(.3, h1 + h2 - .2), .03, rnd(.12, .3), rnd(.15, .3), MIN_T); }
  const Fu = under(P, T(0, h1, d/2, 0));
  box(MC.tarpGreen, Fu, .35, h2*.55, .05, .7, h2*.8, .03, 0, -.08);
  for (let t = .05; t < .68; t += .1) box(MC.tarpGreen, Fu, t, h2*.12 - rnd(0, .12), .07, .06, rnd(.08, .2), MIN_T);
  { const Fx = under(P, T(w/2, h1, 0, PI/2)); box(M.frame, Fx, .2, .45, .01, .4, .34, MIN_T); box(pick(LIT_ROOMS), Fx, .2, .45, .025, .34, .28, MIN_T); glow(Fx, .2, .45, .05, 'warm', .4); }
  // the market inside: shelves of tins and jars at the back, string bulbs, a hanging lantern
  for (const y of [.45, .7]){ box(M.inWood2, P, (-w/2 + xr)/2, y, -d/2 + .16, xr + w/2 - .1, .03, .16);
    for (let x = -w/2 + .12; x < xr - .1; x += .09) if (chance(.75)) cyl(pick([MC.tomato, MC.lemon, MC.bottle, M.green2, MC.paper]), P, x, y + .06, -d/2 + .16, .03, .09); }
  bulbString(P, -w/2 + .08, h1 - .06, d/2 - .1, xr - .08, h1 - .06, d/2 - .1, .05);
  bulbString(P, -w/2 + .08, h1 - .06, 0, xr - .08, h1 - .06, 0, .05);
  box(M.lantern2, P, -.2, h1 - .2, .45, .1, .14, .1); glow(P, -.2, h1 - .2, .45, 'warm', .7); noteLight(P, -.2, h1 - .2, .45, 0xffc060);
  // produce spilling out the front: crates, baskets, sacks, packs of water, a scale on a stand
  const goods = [MC.cabbage, MC.daikon, MC.tomato, MC.lemon, MC.chili, MC.garlic, MC.potato];
  for (let i=0; i<3; i++) for (let j=0; j<3; j++){ const x = -w/2 + .3 + i*.38 + rnd(-.04, .04), z = -.15 + j*.42 + rnd(-.04, .04);
    if (j === 2 && i === 2) continue; produceCrate(P, x, 0, z, pick(goods), rnd(-.15, .15), chance(.3)); }
  for (let k=0; k<irand(2, 3); k++){ const x = -w/2 + rnd(.2, 1.1), z = d/2 + rnd(.2, .4); chance(.5) ? produceCrate(P, x, 0, z, pick(goods), 0, true) : blob(MC.sack, P, x, .12, z, .13, 1.1); }
  for (let i=0; i<3; i++) for (let j=0; j<2; j++) cyl(MC.bottle, P, xr - .3 + i*.08, .11, d/2 + .1 + j*.08, .035, .22);   // a pack of water
  box(M.frame, P, xr - .15, .45, .1, .04, .9, .04); cyl(M.metal, P, xr - .15, .9, .1, .1, .02); cyl(MC.white, P, xr - .15, .8, .1, .06, .12);   // the scale
  // the counter round the side: bottles, jars, folded cloths, a pot of chopsticks; a ragged tarp over it on a pole
  const cx = -w/2 - .22;
  box(M.inWood, P, cx, .32, .25, .3, .64, 1.2); box(M.inWood2, P, cx, .66, .25, .38, .04, 1.28);
  for (let t = -.25; t < .8; t += .07) box(M.inWood2, P, cx - .155, .32, t, MIN_T, .6, .03);
  for (let k=0; k<irand(5, 8); k++) cyl(pick([M.red2, MC.conRust, MC.lemon, MC.bottle, M.frame]), P, cx + rnd(-.08, .08), .76, rnd(-.3, .1), .025, rnd(.12, .22));
  box(MC.white, P, cx, .71, .55, .2, .06, .16); cyl(M.metal, P, cx + .05, .73, .75, .04, .12);
  { const Ft = under(P, T(-w/2, h1 + .05, .25, -PI/2)); raggedTarp(Ft, 0, 0, 1.5, .62, .32, MC.tarp); cyl(M.inWood2, P, -w/2 - .6, (h1 - .1)/2, .95, .03, h1 - .1); }
  raggedTarp(under(P, T((-w/2 + xr)/2, h1 + .06, d/2, 0)), 0, 0, xr + w/2 + .25, .5, .28, MC.tarp2);
  // the neon on a plank above the market, posters, lamps
  box(M.inWood2, Fu, -.35, .58, .07, 2.05, .6, .04); for (const x of [-.8, .1]) box(M.frame, Fu, x, .58, .05, .03, .45, .05);
  wordSign(Fu, 'sign_w_noodlesP', -.35, .58, .11, 1, 'pink');
  wallLamp(under(P, T(xr - .1, 0, d/2 + .01, 0)), 0, h1 - .2);
  // the right-hand block: a roller shutter on the front, a 'hot, cheap' sign and boxes stacked round the corner
  const Ff = under(P, T((xr + w/2)/2, 0, d/2, 0));
  box(M.frame, Ff, 0, .45, .015, w/2 - xr - .04, .9, MIN_T); box(M.shutter, Ff, 0, .42, .03, w/2 - xr - .14, .78, MIN_T);
  for (let y = .08; y < .8; y += .06) box(M.metalDark, Ff, 0, y, .045, w/2 - xr - .16, .012, MIN_T);
  if (chance(.5)) box(pick([M.red2, MC.conBlue, M.green2]), Ff, rnd(-.15, .15), .35, .05, .3, .18, MIN_T);   // graffiti tag
  const Fx = under(P, T(w/2, 0, 0, PI/2));
  wordSign(Fx, 'sign_w_hot', -.2, .72, .05, .85, 'amber'); box(MC.paper, Fx, .45, .5, .03, .22, .3, MIN_T);
  for (const z of [.4, .75]) cardboard(P, w/2 + .2, z - .2, irand(2, 3));
  cardboard(P, w/2 - .1, d/2 + .25, irand(1, 2));
  for (let k=0; k<irand(4, 7); k++) cyl(pick([M.red2, MC.lemon, MC.conBlue, M.green2, MC.copper]), P, w/2 + rnd(.05, .45), .06, d/2 + rnd(.05, .4), .04, .12);   // tins
  cyl(M.metal, P, w/2 + .4, .12, d/2 + .45, .1, .24);   // a bucket
  // pipes climbing the front, wires, a lean-to awning over the shutter
  pipeRun(MC.copper, P, [[w/2 - .08, .1, d/2 + .06], [w/2 - .08, h1 + h2 - .12, d/2 + .06], [.4, h1 + h2 - .12, d/2 + .06], [.4, h1 + h2 + .15, d/2 + .06]], .045, true);
  pipeRun(MC.copper, P, [[xr + .05, .05, d/2 + .08], [xr + .05, h1 + .55, d/2 + .08], [xr + .3, h1 + .55, d/2 + .08]], .035, true);
  box(M.inRust, P, (xr + w/2)/2 + .05, h1 + .03, d/2 + .2, w/2 - xr + .25, .03, .45, 0, .32);
  for (let k=0; k<2; k++) sagCable(P, -w/2, h1 + h2 - .1 - k*.15, d/2 + .1, w/2 + .1, h1 + h2 - .25 - k*.1, d/2 + .1, .12);
  if (chance(.6*S.green)) plant(hangKind(), Fu, rnd(-.8, -.2), h2 - .05, .04, rnd(.7, .9), 't', true);
  // the roof: a shallow tin slope with a patch of tarp, a vent and a chimney pipe
  if (!NO_ROOF){
    const y = h1 + h2;
    box(M.inRust2, P, 0, y + .1, 0, w + .2, .04, d + .2, 0, .1);
    for (let t = -w/2 - .05; t < w/2 + .1; t += .14) box(M.inRust, P, t, y + .13, 0, .03, .03, d + .2, 0, .1);
    box(MC.tarp2, P, rnd(-.4, .2), y + .16, rnd(-.3, .2), .7, .03, .6, rnd(-.3, .3), .1);
    cyl(M.metalDark, P, .6, y + .45, -.4, .06, .7); emitters.push(new THREE.Vector3(.6, y + .85, -.4).applyMatrix4(P));
    box(M.cream2, P, -.5, y + .3, -.3, .3, .26, .3);
  }
  Object.assign(lot, { height: h1 + h2 + (NO_ROOF ? 0 : .15), floors: 2, occupied: true });
}

/* ---------- the commercial quarter: a night market of shops, stalls and a glass-domed market hall ---------- */
// (The rainy night-market references.) Commercial buildings no longer share the residential tower types: their
// own walls are dark wood, plum, charcoal, deep teal, brick and warm sandstone, and everything leans on warm light
// (paper lanterns, lit shop interiors, string bulbs) set against purple, pink and cyan neon. Four builders:
//  - signShop: a narrow shop under a big neon name (PAWN, NOODLES, DRONES.REPAIR, TECH.PRINTS.3D, TEA.MATCHA,
//    RECORDS...), its whole front open and lit warm, goods out on a counter, a striped awning hung with lanterns
//  - tiledShop: a two-storey wooden shop with dark blue tiled eaves, lattice windows glowing, red lanterns, a noren
//  - domeMarket: a sandstone market hall with arched windows, a geodesic glass dome on the roof lit warm inside
//  - foodPlaza: an open plaza of food stalls (a noodle bar with stools, produce, a pawn and curio stall, a cart)
//    under strings of bulbs and coloured paper lanterns
// Halos sit on the lanterns and boards themselves (out in front, the high camera sees them as dots).
const COM = {
  walls: [toon(0x4a3a30), toon(0x3a3846), toon(0x5a3e52), toon(0xb8a888), toon(0x2e4a52), toon(0x7a4a3a)],
  wood: toon(0x5a3a28), wood2: toon(0x3e281c), stone: toon(0xc8b48e), stone2: toon(0xa8946e), stoneD: toon(0x7a6a50),
  tile: toon(0x2e3a52), tile2: toon(0x3a4a66), plaster: toon(0xe0d4b8), bronze: toon(0x8a6a3a),
  warm: toon(0x5a3a1c, { em:0xd8903a, kind:'window' }), warm2: toon(0x5a3018, { em:0xc8702a, kind:'window' }), shopLit: toon(0x6a3a1a, { em:0xff9a48, kind:'window' }),
  lanRed: toon(0x7a1e14, { em:0xff5a3a, kind:'bulb' }), lanTeal: toon(0x145a52, { em:0x3ae8c8, kind:'bulb' }), lanPurple: toon(0x3a1e5a, { em:0xb070ff, kind:'bulb' }), lanGold: toon(0x6a4a14, { em:0xffc04a, kind:'bulb' }),
  noren: toon(0x8a2a24), noren2: toon(0x2a3a5a), glass: null,
  stripes: [[0xc84a5a, 0xf0e4d0], [0x3a6a9a, 0xe8e0cc], [0x7a4aa0, 0xf0d8f0], [0x2a8a7a, 0xf0e8d8], [0xd0803a, 0x3a2a24]].map(p => p.map(h => toon(h))),
};
COM.glass = new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }); COM.glass.userData.colorOnly = true;
// the commercial quarter's light: warm rooms, and neon mostly pink and amber with purple (the references' contrast)
STY.mid.rooms = [COM.warm, COM.warm2, COM.shopLit, M.winLit, M.interiorPink, COM.warm];   // amber and orange rooms, the odd pink one STY.mid.lit = .72;
STY.mid.neonMats = [M.neonPink, M.neonPink, M4.neonPurple, M.neonAmber, M.neonAmber, M.neonCyan];
const LAN_GLOW = new Map([[COM.lanRed, 'orange'], [COM.lanTeal, 'cyan'], [COM.lanPurple, 'pink'], [COM.lanGold, 'warm']]);
const SHOP_SIGNS = [['sign_c_pawn', 'gold'], ['sign_c_noodles', 'amber'], ['sign_c_drones', 'cyan'], ['sign_c_prints', 'pink'], ['sign_c_tea', 'green'],
                    ['sign_c_records', 'platinum'], ['sign_c_cramen', 'pink'], ['sign_c_baropen', 'cyan'], ['sign_c_hotel', 'cyan'], ['sign_c_dataloan', 'pink'], ['sign_c_techparts', 'cyan']];
// a paper lantern hanging on a short cord, its halo hugging it
function paperLantern(P, x, y, z, mat, s = 1){
  mat = mat || pick([COM.lanRed, COM.lanRed, COM.lanTeal, COM.lanPurple, COM.lanGold]);
  cyl(M.frame, P, x, y + .07*s, z, .005, .1*s);
  sph(mat, P, x, y - .04*s, z, .065*s, 1.25); box(M.frame, P, x, y + .04*s, z, .06*s, .015, .06*s); box(M.frame, P, x, y - .12*s, z, .05*s, .015, .05*s);
  glow(P, x, y - .04*s, z, LAN_GLOW.get(mat) || 'warm', .38*s);
}
// a striped canvas awning sloping out from a wall (local +z out)
function stripedAwning(F, y, w, out, slope, pair){
  const n = Math.max(3, Math.round(w/.18)), sw = w/n;
  for (let k=0; k<n; k++) box(pair[k % 2], F, -w/2 + sw*(k + .5), y - Math.sin(slope)*out/2, Math.cos(slope)*out/2, sw + .002, .025, out, 0, slope);
  const ey = y - Math.sin(slope)*out, ez = Math.cos(slope)*out;
  for (let k=0; k<n; k++) box(pair[k % 2], F, -w/2 + sw*(k + .5), ey - .05, ez, sw + .002, .1, .02);   // the valance
  return [ey - .1, ez];
}
// a word sign sized to fit a width
function fitSign(F, kind, x, y, z, maxW, kMax, col){ const k = Math.min(kMax, maxW/(SPR.size[kind][0]/PX)); wordSign(F, kind, x, y, z, k, col, .35 + .35*k); return k; }
// goods out on a counter: jars, bowls, boxes, gadgets, depending on the shop
function counterGoods(F, x0, x1, y, z, kind){
  for (let x = x0; x < x1; x += rnd(.09, .14)){
    if (kind === 'food'){ chance(.5) ? cyl(pick([M.white2, M.awn3, M.pot]), F, x, y + .03, z + rnd(-.05, .05), .04, .05) : box(pick([MC.tomato, MC.lemon, MC.cabbage, MC.daikon, MC.chili]), F, x, y + .03, z + rnd(-.05, .05), .06, .05, .06); }
    else if (kind === 'tech'){ box(pick([M.metalDark, M.frame, M.metal, MC.board]), F, x, y + .03, z + rnd(-.05, .05), .07, .05, .06); if (chance(.3)) box(pick([M.neonCyan, M.neonPink]), F, x, y + .065, z, .03, .01, .02); }
    else { box(pick([MC.copper, M.gold || MC.lemon, MC.card, MC.paper, M.metal]), F, x, y + .03, z + rnd(-.05, .05), .05, rnd(.04, .1), .05); }
  }
}
function signShop(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  const w = rnd(1.95, 2.25), d = rnd(1.8, 2.1), floors = irand(2, 4), wall = pick(COM.walls), h0 = 1.2;
  const [sign, col] = pick(SHOP_SIGNS), goods = /noodle|ramen|tea|bar/.test(sign) ? 'food' : /drones|prints|tech|data/.test(sign) ? 'tech' : 'curio';
  // the shop floor: side and back walls, the front open onto a warm-lit room
  box(wall, P, 0, h0/2, -d/2 + .05, w, h0, .1); for (const s of [-1, 1]) box(wall, P, s*(w/2 - .05), h0/2, 0, .1, h0, d);
  for (const s of [-1, 1]) if (chance(.4)) neonTag(under(P, T(s*w/2, 0, 0, s*PI/2)), d, h0);   // tagged down the side
  box(COM.wood2, P, 0, .02, 0, w - .1, .04, d - .1);
  box(COM.shopLit, P, 0, h0/2, -d/2 + .11, w - .2, h0 - .1, .01);                                // the lit back wall
  for (let y = .35; y < h0 - .2; y += .3){ box(COM.wood, P, 0, y, -d/2 + .25, w - .3, .03, .25);    // shelves full of stock
    for (let x = -w/2 + .2; x < w/2 - .2; x += .1) if (chance(.7)) box(pick([MC.copper, MC.paper, M.red2, MC.lemon, M.metalDark, MC.bottle, MC.card]), P, x, y + .05, -d/2 + .25, .06, rnd(.05, .1), .1); }
  box(COM.wood, P, 0, .25, d/2 - .25, w - .5, .5, .3); box(COM.wood2, P, 0, .51, d/2 - .25, w - .4, .03, .36);   // the counter
  counterGoods(P, -w/2 + .35, w/2 - .35, .52, d/2 - .25, goods);
  if (chance(.7)) figureAt(P, rnd(-.4, .4), 0, -.1);   // the shopkeeper
  box(wall, P, 0, h0 - .07, d/2 - .05, w, .14, .1);                                                  // the lintel
  const F = under(P, T(0, 0, d/2, 0));
  const pair = pick(COM.stripes), [ly, lz] = stripedAwning(F, h0 - .08, w + .1, .55, .38, pair);
  for (let k=0; k<3; k++) paperLantern(F, -w/2 + .3 + k*(w - .6)/2, ly - .02, lz - .03);
  // the name in neon on a board over the awning, a lit sandwich board on the pavement
  box(M.frame, F, 0, h0 + .32, .05, w - .1, .46, .08);
  fitSign(F, sign, 0, h0 + .32, .1, w - .3, 1.25, col);
  box(M.frame, F, w/2 - .2, .22, .75, .26, .4, .04, 0, -.15); box(COM.shopLit, F, w/2 - .2, .26, .77, .2, .26, .01, 0, -.15);
  // the floors above: a block in the same paint, warm windows, a purple neon edge, a projecting glyph sign
  let y = h0, last = { w, d, ox: 0, oz: 0, ry: 0 };
  for (let fl = 1; fl < floors; fl++){
    const c = { w: clamp(w + rnd(-.25, .05), 1.5, 2.25), d: clamp(d + rnd(-.25, .05), 1.4, 2.1), h: FH, y, ox: rnd(-.08, .08), oz: rnd(-.08, .08), ry: 0 };
    const Pc = under(P, T(c.ox, y + c.h/2, c.oz, 0)); put(roundedBox(c.w, c.h, c.d, .03), fl % 2 ? wall : pick(COM.walls), Pc);
    for (const f of faces(c.w, c.d)){ const Ff = under(Pc, T(f.nx*f.half, -c.h/2, f.nz*f.half, f.ry));
      const n = Math.max(1, Math.floor(f.len/.55));
      for (let k=0; k<n; k++){ const x = -f.len/2 + (k + .5)*f.len/n; if (chance(.15)) continue;
        box(M.frame, Ff, x, .5, .01, .36, .42, .02); box(chance(.7) ? COM.warm : pick([COM.warm2, M.interiorPink, M.interiorCool]), Ff, x, .5, .02, .3, .36, .01);
        if (chance(.25)) box(pick(COM.stripes)[0], Ff, x, .76, .1, .4, .03, .18, 0, .3); }   // a little awning over a window
      if (f.nz === 1 && chance(.6)) acUnit(Ff, rnd(-f.len/3, f.len/3), .15);
      if (f.nx && fl === 1 && chance(.35)) neonTag(Ff, f.len, c.h); }
    box(M4.neonPurple, P, c.ox, y + .02, c.oz + c.d/2 + .01, c.w, .03, .02);
    y += c.h; last = c;
  }
  if (floors > 2 && chance(.7)){ const g = pick(GLYPH_V), Fg = under(P, T(w/2 - .14, 0, d/2 + .02, 0)); plant(g, Fg, 0, h0 + .95, .03, 1, 'c', true); glow(Fg, 0, h0 + .95, .05, GLYPH_GLOW[g], .5); }   // a vertical glyph sign up the corner
  bulbString(P, -w/2, h0 + .08, d/2 + .45, w/2, h0 + .08, d/2 + .45, .06);
  if (!NO_ROOF){ const Pr = under(P, T(last.ox, y, last.oz, 0)); box(COM.wood2, Pr, 0, .05, 0, last.w + .08, .1, last.d + .08); roofItems(st, Pr, last.w, last.d, lot); }
  Object.assign(lot, { height: y + (NO_ROOF ? 0 : .1), floors, occupied: true });
}
// a person drawn as boxes (shopkeepers behind counters)
function figureAt(P, x, y, z){ const c = pick([M.cloth1, M.cloth3, M.cloth4, M.awn2, M.red2, MC.tarp]); box(c, P, x, y + .11, z, .08, .22, .06); box(M.concDD, P, x, y + .26, z, .055, .06, .055); }
// a hip roof of dark blue tiles with turned-up corners, over a w x d block (local frame at the eave)
U.hip4 = (() => { const g = new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1).toNonIndexed(); g.rotateY(PI/4); g.computeVertexNormals(); return g; })();
function tileRoof(P, y, w, d, rise, mat){
  put(U.hip4, mat || COM.tile, under(P, T(0, y + rise/2, 0, 0, w, rise, d)));
  for (let t = -w/2; t <= w/2 + .001; t += .14) for (const s of [-1, 1]) box(COM.tile2, P, t, y + .02, s*d/2, .03, .04, .06);   // tile ends along the eaves
  for (const [sx, sz] of CORNERS){ box(COM.tile2, P, sx*w/2, y + .08, sz*d/2, .08, .05, .2, Math.atan2(sx, sz), .5); }      // the corners turn up
  box(COM.tile2, P, 0, y + rise + .03, 0, .1, .06, .1);
}
function tiledShop(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  const w = rnd(2.0, 2.25), d = rnd(1.7, 1.95), h0 = 1.0, h1 = .85;
  // the ground floor: dark timber, lattice windows lit warm, a noren over the door, a counter of food out front
  box(COM.wood, P, 0, h0/2, 0, w, h0, d);
  for (const [sx, sz] of CORNERS) box(COM.wood2, P, sx*(w/2 + .01), h0/2, sz*(d/2 + .01), .08, h0, .08);
  for (const f of faces(w, d)){ const Ff = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
    const front = f.nz === 1, n = front ? 2 : Math.max(1, Math.floor(f.len/.7));
    for (let k=0; k<n; k++){ const x = front ? (k ? .55 : -.55)*f.len/2 : -f.len/2 + (k + .5)*f.len/n;
      box(COM.warm, Ff, x, .5, .01, front ? .55 : .45, .5, .02);
      for (let q = -2; q <= 2; q++) box(COM.wood2, Ff, x + q*(front ? .11 : .09), .5, .025, .015, .5, .01);   // the lattice
      for (const yy of [.35, .5, .65]) box(COM.wood2, Ff, x, yy, .025, front ? .55 : .45, .012, .01); }
    if (front){ box(COM.warm2, Ff, 0, .38, .01, .45, .72, .02);   // the doorway, curtained with a noren
      const nm = pick([COM.noren, COM.noren2]); for (let q = -2; q <= 2; q++) box(nm, Ff, q*.09, .62, .05, .08, .28, .015);
      box(COM.wood, Ff, 0, .25, .38, w - .5, .5, .26); counterGoods(Ff, -w/2 + .4, w/2 - .4, .51, .38, 'food');
      for (const s of [-1, 1]) paperLantern(Ff, s*(w/2 - .18), h0 - .12, .12, COM.lanRed, 1.3); } }
  if (typeof steamPot === 'function') steamPot(under(P, T(0, 0, d/2, 0)), w/2 - .45, .51, .38);
  tileRoof(P, h0, w + .4, d + .4, .32, COM.tile);
  // the upper floor: pale plaster between dark posts, warm lattice windows, and the shop's name across it
  const Pu = under(P, T(0, h0 + .2, 0, 0)), uw = w - .35, ud = d - .35;
  box(COM.plaster, Pu, 0, h1/2, 0, uw, h1, ud);
  for (const f of faces(uw, ud)){ const Ff = under(Pu, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
    for (const x of [-f.len/2 + .03, f.len/2 - .03, 0]) box(COM.wood2, Ff, x, h1/2, .01, .06, h1, .02);
    for (const x of [-f.len/4, f.len/4]){ box(COM.warm, Ff, x, h1*.55, .015, f.len*.3, h1*.45, .01); for (let q = -1; q <= 1; q++) box(COM.wood2, Ff, x + q*.08, h1*.55, .022, .012, h1*.45, .01); } }
  const Fs = under(Pu, T(0, 0, ud/2 + .03, 0)), [kind, col] = pick([['sign_c_sushi', 'amber'], ['sign_c_noodles', 'amber'], ['sign_c_tea', 'green'], ['sign_c_cramen', 'pink'], ['sign_c_hotel', 'cyan']]);
  fitSign(Fs, kind, 0, h1 + .02, .04, uw - .1, 1.05, col);
  let top = h0 + .2 + h1;
  if (!NO_ROOF){ tileRoof(P, top, uw + .5, ud + .5, .55, COM.tile); top += .6; }
  else top += .02;
  if (chance(.6)) bulbString(P, -w/2 - .2, h0 + .05, d/2 + .35, w/2 + .2, h0 + .05, d/2 + .35, .06);
  Object.assign(lot, { height: top, floors: 2, occupied: true });
}
// a geodesic dome of glass on a bronze frame (rings of points zipped together, as the club's)
function geoDome(P, y0, R, H, frame, glass, node){
  const rings = [[16, 0], [16, .38], [11, .76], [6, 1.12]], pts = [], ri = [];
  rings.forEach(([n, e], k) => { const off = (k % 2)*PI/n, idx = []; for (let q=0; q<n; q++){ const a = off + q*TAU/n; idx.push(pts.length); pts.push([R*Math.cos(e)*Math.cos(a), H*Math.sin(e), R*Math.cos(e)*Math.sin(a)]); } ri.push({ idx, off, n }); });
  const apex = pts.length; pts.push([0, H, 0]);
  const tris = [];
  for (let k=0; k<ri.length - 1; k++){ const A = ri[k], B = ri[k + 1];
    const sb = Math.ceil((B.off - A.off)/(TAU/B.n) - 1e-9), bi = q => B.idx[(((q - sb) % B.n) + B.n) % B.n];
    const angA = q => A.off + q*TAU/A.n, angB = q => B.off + (q - sb)*TAU/B.n; let i = 0, j = 0;
    while (i < A.n || j < B.n){ if (j >= B.n || (i < A.n && angA(i + 1) < angB(j + 1))){ tris.push([A.idx[i % A.n], bi(j), A.idx[(i + 1) % A.n]]); i++; } else { tris.push([A.idx[i % A.n], bi(j), bi(j + 1)]); j++; } } }
  const T4 = ri[ri.length - 1]; for (let q=0; q<T4.n; q++) tris.push([T4.idx[q], T4.idx[(q + 1) % T4.n], apex]);
  const pos = []; for (const t of tris) for (const q of t){ const p = pts[q]; pos.push(p[0], p[1] + y0, p[2]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); put(g, glass, P); g.dispose();
  const seen = new Set();
  for (const t of tris) for (let e=0; e<3; e++){ const a = t[e], b = t[(e + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b); if (seen.has(key)) continue; seen.add(key);
    strut(frame, P, pts[a][0], pts[a][1] + y0, pts[a][2], pts[b][0], pts[b][1] + y0, pts[b][2], .035); }
  for (const p of pts) sph(node, P, p[0], p[1] + y0, p[2], .045);
}
// Glass-dome markets, in four kinds so a street of them doesn't repeat, all in quiet colours (weathered stone or dark
// steel, clear glass, a frame of dark bronze or graphite) so the warm light inside does the talking:
//  hall: a stone market hall with arched windows, a modest dome on a drum on its roof
//  geodesic: the dome itself is the market, standing on the street on a low ring wall, an arched way in, stalls inside
//  bios: a botanical dome full of greenery on a dark podium, its BIOS DOME sign in pale teal
//  skylight: a plain shop block with a low glass dome let into its flat roof
COM.domeGlass = new THREE.MeshBasicMaterial({ color: 0xe8eef0, transparent: true, opacity: .11, depthWrite: false, side: THREE.DoubleSide }); COM.domeGlass.userData.colorOnly = true;
COM.bioGlass = new THREE.MeshBasicMaterial({ color: 0xc8f0e0, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }); COM.bioGlass.userData.colorOnly = true;
COM.frameD = toon(0x3a3a3c); COM.frameB = toon(0x5a4a36); COM.stoneG = toon(0x9a968c); COM.stoneG2 = toon(0x7e7a72); COM.inside = toon(0x4a3a24, { em:0x9a6a30, kind:'window' });
let DOME_FORCE = null;   // (testing)
function domeMarket(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  const kind = NO_ROOF ? 'hall' : (DOME_FORCE || pick(['hall', 'geodesic', 'bios', 'skylight'])), frame = pick([COM.frameD, COM.frameB]);
  const stone = pick([COM.stoneG, COM.stone2, COM.stoneG2]), stoneD = pick([COM.stoneD, COM.stoneG2, COM.conc3]);
  // stalls and greenery under a dome, seen through the glass
  const inside = (y, r) => { put(U.cyl16, COM.inside, under(P, T(0, y, 0, 0, 2*r*.95, .01, 2*r*.95)));
    for (let k=0; k<6; k++){ const a = k*TAU/6 + .3, rr = r*.55; box(pick(COM.stripes)[0], P, Math.cos(a)*rr, y + .08, Math.sin(a)*rr, .2, .14, .14, -a); }
    plant(pick(['bonsai', 'bamboo', 'fern']), P, 0, y, 0, .9); };
  let top;
  if (kind === 'geodesic'){
    const R0 = 1.12, H0 = 1.25;
    put(U.cyl16, stoneD, under(P, T(0, .12, 0, 0, 2*R0 + .1, .24, 2*R0 + .1)));
    inside(.25, R0); for (let k=0; k<5; k++) figureAt(P, rnd(-.6, .6), .25, rnd(-.6, .4));
    geoDome(P, .24, R0, H0, frame, COM.domeGlass, frame);
    const F = under(P, T(0, 0, R0 - .1, 0));   // the arched way in, a little porch with the sign over it
    box(stone, F, 0, .45, .15, .8, .9, .35); box(COM.shopLit, F, 0, .38, .33, .42, .62, .01); put(U.cyl16, COM.shopLit, under(F, T(0, .69, .33, 0, .42, .01, .42, PI/2)));
    box(stoneD, F, 0, .95, .32, 1.1, .22, .04); fitSign(under(F, T(0, 0, .35, 0)), 'sign_c_geomarket', 0, .95, 0, 1.0, .6, 'warm');
    for (const s of [-1, 1]) paperLantern(F, s*.48, .78, .36, COM.lanGold, 1.0);
    glow(P, 0, .7, 0, 'warm', .7);
    top = .24 + H0;
  } else if (kind === 'bios'){
    const pw = 2.2, ph = .85, R0 = 1.0, H0 = 1.05;
    box(COM.conc3, P, 0, ph/2, 0, pw, ph, pw); box(COM.conc2, P, 0, ph + .03, 0, pw + .08, .06, pw + .08);
    for (const f of faces(pw, pw)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
      for (let x = -f.len/2 + .25; x < f.len/2 - .15; x += .4) box(chance(.6) ? COM.glassLit : M.glassDark, F, x, ph*.5, .01, .25, ph*.45, .01);
      if (f.nz === 1){ box(M.frame, F, 0, ph*.5, .02, 1.2, .26, .03); fitSign(under(F, T(0, 0, .04, 0)), 'sign_c_bios', 0, ph*.5, 0, 1.1, .7, 'cyan'); } }
    put(U.cyl16, COM.moss, under(P, T(0, ph + .07, 0, 0, 2*R0*.95, .02, 2*R0*.95)));
    for (let k=0; k<9; k++){ const a = rnd(0, TAU), r = rnd(.1, R0*.7); plant(pick(['bamboo', 'fern', 'bush', 'g_fern3', 'bonsai']), P, Math.cos(a)*r, ph + .08, Math.sin(a)*r, rnd(.8, 1.15)); }
    geoDome(P, ph + .06, R0, H0, frame, COM.bioGlass, frame);
    top = ph + .06 + H0;
  } else if (kind === 'skylight'){
    const w = 2.15, d = 2.0, h = 1.25;
    box(stone, P, 0, h/2, 0, w, h, d); box(stoneD, P, 0, h + .04, 0, w + .1, .08, d + .1);
    for (const f of faces(w, d)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
      if (f.nz === 1){ box(COM.shopLit, F, 0, .45, .01, w - .4, .7, .02); stripedAwning(F, .92, w - .2, .4, .35, pick(COM.stripes)); counterGoods(F, -w/2 + .3, w/2 - .3, .3, .3, pick(['food', 'curio'])); box(COM.wood, F, 0, .15, .3, w - .5, .3, .2);
        fitSign(F, pick(['sign_c_geomarket', 'sign_c_dome']), 0, 1.1, .05, w - .4, .8, 'warm'); }
      else { for (let x = -f.len/3; x <= f.len/3 + .01; x += f.len/3) box(COM.inside, F, x, .7, .01, .3, .4, .01); if (f.nx && chance(.5)) neonTag(F, f.len, h); } }
    if (!NO_ROOF){ inside(h + .09, .7); geoDome(P, h + .08, .75, .5, frame, COM.domeGlass, frame); }
    top = h + .1 + .5;
  } else {   // the hall
    const w = 2.3, d = 2.2, h = 1.5;
    box(stoneD, P, 0, .08, 0, w + .1, .16, d + .1);
    box(stone, P, 0, h/2, 0, w, h, d);
    box(stoneD, P, 0, h - .04, 0, w + .14, .1, d + .14);
    for (const f of faces(w, d)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
      for (const x of [-f.len/2 + .06, -f.len/6, f.len/6, f.len/2 - .06]) box(stoneD, F, x, h/2, .03, .1, h - .1, .05);
      const front = f.nz === 1;
      for (const x of front ? [-f.len/3, f.len/3] : [-f.len/3, 0, f.len/3]){
        box(COM.inside, F, x, .7, .01, .3, .58, .02); put(U.cyl16, COM.inside, under(F, T(x, .99, .01, 0, .3, .02, .3, PI/2)));
        box(frame, F, x, .7, .025, .02, .58, .01); }
      if (front){ box(COM.shopLit, F, 0, .52, .01, .48, .85, .02); put(U.cyl16, COM.shopLit, under(F, T(0, .95, .01, 0, .48, .02, .48, PI/2)));
        fitSign(F, 'sign_c_dome', 0, h + .2, .05, w - .3, 1.0, 'warm'); box(stoneD, F, 0, h + .2, .02, w - .1, .3, .04);
        for (const s of [-1, 1]) paperLantern(F, s*.4, .92, .14, COM.lanGold, 1.1); } }
    top = h + .02;
    if (!NO_ROOF){ put(U.cyl16, stoneD, under(P, T(0, top + .1, 0, 0, 1.7, .2, 1.7))); inside(top + .21, .8); geoDome(P, top + .2, .82, .7, frame, COM.domeGlass, frame); top += .95; }
  }
  Object.assign(lot, { height: top, floors: 2, occupied: true });
}
function foodPlaza(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2]))), S2 = SIDE - .1;
  // wet stone paving across the plot
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) box(pick([COM.stoneD, COM.stone2, M.concD, COM.stoneD]), P, -S2/2 + (a + .5)*S2/6, .015, -S2/2 + (b + .5)*S2/6, S2/6 - .03, .03, S2/6 - .03);
  // the noodle bar along the back: a long counter, stools, steaming pots, lanterns, its sign on a beam
  const Fb = under(P, T(0, 0, -S2/2 + .25, 0));
  box(COM.wood, Fb, 0, .3, 0, 1.7, .6, .45); box(COM.wood2, Fb, 0, .61, .05, 1.8, .03, .55);
  for (const x of [-.55, 0, .55]) if (typeof steamPot === 'function') steamPot(Fb, x, .62, -.05);
  for (let x = -.75; x <= .75; x += .5) if (typeof foodBowl === 'function') foodBowl(Fb, x + .12, .62, .15, .05);
  for (const s of [-1, 1]) cyl(COM.wood2, Fb, s*.88, .75, -.1, .04, 1.5);
  box(COM.wood2, Fb, 0, 1.45, -.1, 1.9, .06, .08);
  stripedAwning(under(Fb, T(0, 0, -.1, 0)), 1.4, 1.95, .6, .3, pick(COM.stripes));
  fitSign(under(Fb, T(0, 0, -.06, 0)), pick(['sign_c_noodles', 'sign_c_cramen', 'sign_c_sushi']), 0, 1.62, 0, 1.7, .9, 'amber');
  for (let k=0; k<4; k++) paperLantern(Fb, -.75 + k*.5, 1.08, .4, null, 1.1);
  figureAt(Fb, -.3, 0, -.35); figureAt(Fb, .35, 0, -.35);
  for (let k=0; k<4; k++){ const x = -.65 + k*.43; stool(Fb, x, .45); spotAt(Fb, x, .16, .45, 'seat', null, [0, -1]); }
  // a produce stand down one side, a pawn and curio stall down the other
  const Fl = under(P, T(-S2/2 + .25, 0, .25, PI/2));
  box(COM.wood2, Fl, 0, .25, 0, 1.3, .5, .4);
  for (let k=0; k<4; k++) produceCrate(Fl, -.45 + k*.3, .5, 0, pick([MC.cabbage, MC.tomato, MC.lemon, MC.chili, MC.daikon, MC.potato]), rnd(-.1, .1), chance(.4));
  raggedTarp(under(Fl, T(0, 0, -.2, 0)), 0, 1.15, 1.4, .6, .35, pick([MC.tarp, MC.tarpGreen, M.tarp1 || MC.tarp]));
  for (const s of [-1, 1]) cyl(COM.wood2, Fl, s*.62, .55, .35, .03, 1.1);
  paperLantern(Fl, 0, .95, .3, COM.lanRed);
  const Fr = under(P, T(S2/2 - .25, 0, .25, -PI/2));
  box(COM.wood, Fr, 0, .3, 0, 1.2, .6, .4); counterGoods(Fr, -.5, .5, .6, 0, chance(.5) ? 'tech' : 'curio');
  box(COM.wood2, Fr, 0, .95, -.15, 1.2, .7, .05); for (const yy of [.8, 1.05]) box(COM.wood, Fr, 0, yy, -.08, 1.15, .02, .12);
  for (let x = -.5; x <= .5; x += .1) if (chance(.7)) box(pick([MC.copper, M.metal, MC.paper, MC.lemon]), Fr, x, 1.11, -.08, .05, .08, .05);
  for (let k=0; k<3; k++) sph(COM.lanGold, Fr, -.15 + k*.15, 1.45 - (k === 1 ? .12 : 0), .05, .06);   // the pawnbroker's three balls
  fitSign(Fr, 'sign_c_pawn', 0, 1.3, .02, 1.0, .8, 'gold');
  // a hand cart under an umbrella in the middle, strings of bulbs and lanterns overhead
  const cx = rnd(-.2, .2), cz = .55;
  box(COM.wood, P, cx, .35, cz, .55, .08, .35); for (const s of [-1, 1]) put(U.cyl16, M.frame, under(P, T(cx + s*.3, .14, cz, 0, .26, .03, .26, 0, PI/2)));
  for (let k=0; k<4; k++) box(pick([MC.tomato, MC.lemon, M.white2, MC.daikon]), P, cx - .18 + k*.12, .42, cz, .08, .05, .08);
  cyl(M.frame, P, cx, .7, cz, .015, .7); put(U.cone, pick(COM.stripes)[0], under(P, T(cx, 1.1, cz, 0, .9, .2, .9)));
  for (const [sx, sz] of CORNERS) cyl(M.frame, P, sx*(S2/2 - .05), .8, sz*(S2/2 - .05), .02, 1.6);
  bulbString(P, -S2/2 + .05, 1.55, -S2/2 + .05, S2/2 - .05, 1.55, S2/2 - .05, .2);
  bulbString(P, S2/2 - .05, 1.55, -S2/2 + .05, -S2/2 + .05, 1.55, S2/2 - .05, .2);
  for (let k=0; k<5; k++){ const u = (k + 1)/6, x = -S2/2 + .05 + (S2 - .1)*u, z = -S2/2 + .05 + (S2 - .1)*u, sag = .2*Math.sin(PI*u); paperLantern(P, x, 1.47 - sag, z, null, 1.1); }
  Object.assign(lot, { height: 1.7, floors: 1, occupied: true });
}

// neon graffiti sprayed on a wall: a tag or doodle somewhere low on the face (it's what people can reach)
function neonTag(F, L, h, n = 1){
  for (let k=0; k<n; k++){ const kind = pick(NEON_GRAF), w = SPR.size[kind][0]/PX*.9;
    if (w > L - .2) continue;
    plant(kind, F, rnd(-L/2 + w/2 + .08, L/2 - w/2 - .08), rnd(.32, Math.min(h - .2, 1.1)), .02, .9, 'c', true); }
}
// concrete, weathered: the brutalist towers of the commercial quarter (their own greys, not the factories')
COM.conc = toon(0x8e8c84); COM.conc2 = toon(0x74726a); COM.conc3 = toon(0x5a5852); COM.stain = toon(0x4a4a44); COM.moss = toon(0x5a7034, { flat:1 });
COM.glassT = toon(0x1c2a44); COM.glassLit = toon(0x2a4060, { em:0x3a6a9a, kind:'window' }); COM.glassWarm = toon(0x4a2e1a, { em:0xffa050, kind:'window' }); COM.mullion = toon(0x2a3242);
COM.pagodaRed = toon(0x8a2a22); COM.pagodaRoof = toon(0x7a2a1e); COM.pagodaRoof2 = toon(0x2a3448); COM.gold = toon(0xc49a3a, { em:0x5a3a10, kind:'trim' }); COM.pillar = toon(0x9a2a1e);
COM.corr = [toon(0x8a5a3a), toon(0x3e6a6a), toon(0x4a5a7a), toon(0xb07a3a), toon(0x6a6a6a), toon(0x5a3e5a)];
// ARCOLOGY-07: a brutalist tower of weathered concrete: two tall piers, blocks cantilevered off them at odd heights
// (each with slot windows, a rail, an AC unit), a heavy head block overhanging at the top with its name in purple
// neon, pipes and cables down the faces, moss spilling over every ledge, shops lit in under it at street level
function arcologyTower(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  const H = rnd(6.2, 8.4), pw = .78, pd = 1.5;
  // the base: a shop floor across the front, lit warm, its signs over it
  box(COM.conc3, P, 0, .55, 0, 2.2, 1.1, 1.9);
  const Fb = under(P, T(0, 0, .95, 0));
  box(COM.warm, Fb, -.45, .45, .01, .9, .7, .02); box(COM.shopLit, Fb, .55, .45, .01, .7, .7, .02);
  for (const x of [-.9, 0, .2, .9]) box(COM.conc2, Fb, x, .55, .03, .08, 1.1, .05);
  stripedAwning(Fb, .95, 1.0, .4, .35, pick(COM.stripes)); counterGoods(Fb, -.85, -.05, .3, .25, 'food');
  const [sa, ca] = pick([['sign_c_ramen', 'amber'], ['sign_c_robot', 'pink'], ['sign_c_mods', 'cyan']]), [sb, cb] = pick([['sign_c_open', 'pink'], ['sign_c_noodles', 'amber'], ['sign_c_gear', 'cyan']]);
  fitSign(Fb, sa, -.45, 1.22, .06, .95, .85, ca); fitSign(Fb, sb, .55, 1.0, .06, .8, .7, cb);
  // the piers
  for (const s of [-1, 1]){ const x = s*(pw/2 + .06);
    box(s < 0 ? COM.conc : COM.conc2, P, x, 1.1 + (H - 1.1)/2, 0, pw, H - 1.1, pd);
    for (const f of faces(pw, pd)){ const F = under(P, T(x + f.nx*f.half, 0, f.nz*f.half, f.ry));
      for (let y = 1.6; y < H - .4; y += .45) if (chance(.45)) box(chance(.6) ? COM.warm : chance(.5) ? COM.warm2 : M.glassDark, F, rnd(-f.len/2 + .12, f.len/2 - .12), y, .01, .08, .3, .01);   // slot windows
      for (let q=0; q<irand(2, 4); q++) box(chance(.5) ? COM.stain : COM.moss, F, rnd(-f.len/2 + .1, f.len/2 - .1), rnd(1.4, H - .3), .006 + q*.002, rnd(.08, .2), rnd(.4, 1.6), MIN_T); } }   // streaks down the concrete
  // cantilevered blocks
  for (let y = 1.4; y < H - 1.6; y += rnd(.85, 1.3)){
    const f = pick(faces(1.7, pd)), bw = rnd(.9, 1.4), bh = rnd(.55, .85), bd = rnd(.45, .75), along = rnd(-.3, .3);
    const F = under(P, T(f.nx*(f.half - .15) + (f.nz ? along : 0), 0, f.nz*(f.half - .15) + (f.nx ? along : 0), f.ry));
    box(pick([COM.conc, COM.conc2]), F, 0, y + bh/2, bd/2, bw, bh, bd);
    for (let x = -bw/2 + .15; x < bw/2 - .1; x += .22) if (chance(.7)) box(chance(.65) ? COM.warm : COM.glassLit, F, x, y + bh/2, bd + .01, .12, bh*.45, .01);
    box(COM.conc3, F, 0, y + bh + .03, bd/2, bw + .06, .06, bd + .06);
    if (chance(.6)) for (let x = -bw/2 + .05; x <= bw/2 - .05; x += .12) cyl(M.frame, F, x, y + bh + .14, bd + .02, .008, .2);   // a rail on its roof
    if (chance(.5)) acUnit(F, rnd(-bw/3, bw/3), y + .1);
    if (chance(.4)) box(M4.neonPurple, F, 0, y + .02, bd + .02, bw, .025, .02);
    for (let q=0; q<irand(1, 3); q++) blob(COM.moss, F, rnd(-bw/2 + .1, bw/2 - .1), y + bh + .07, rnd(.1, bd - .05), rnd(.06, .11), .5);
    if (chance(.5*S.green)) plant(pick(['vines', 'l_mossroots', 'h_ivy']), F, rnd(-bw/3, bw/3), y + bh, bd + .02, rnd(.6, .9), 't', true);
  }
  // the head: a heavier block overhanging the piers, its name in neon, moss pouring off its lip
  const hy = H, hh = rnd(1.1, 1.4), hw = 2.25, hd = 1.95;
  box(COM.conc, P, 0, hy + hh/2, 0, hw, hh, hd); box(COM.conc3, P, 0, hy - .05, 0, hw - .2, .1, hd - .2);
  for (const f of faces(hw, hd)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
    for (let x = -f.len/2 + .2; x < f.len/2 - .15; x += .3) if (chance(.6)) box(chance(.7) ? COM.warm : COM.glassLit, F, x, hy + hh*.45, .01, .1, hh*.35, .01);
    for (let q=0; q<irand(3, 6); q++) box(COM.moss, F, rnd(-f.len/2 + .1, f.len/2 - .1), hy + hh - rnd(.1, .5), .01, rnd(.1, .25), rnd(.2, .7), MIN_T);
    if (chance(.6*S.green)) plant(pick(['vines', 'l_mossroots', 'h_curtain1']), F, rnd(-f.len/3, f.len/3), hy + hh, .03, rnd(.7, 1.0), 't', true); }
  const Fh = under(P, T(0, 0, hd/2, 0)), [nm, nc] = pick([['sign_c_arcology', 'pink'], ['sign_c_block', 'orange'], ['sign_c_hab', 'amber']]);
  fitSign(Fh, nm, 0, hy + hh*.72, .04, hw - .3, 1.3, nc);
  // pipes down the faces and a cable or two
  for (let k=0; k<irand(2, 4); k++){ const s = chance(.5) ? -1 : 1, x = s*rnd(.2, .9), z = (chance(.5) ? 1 : -1)*(pd/2 + .06);
    const y0 = rnd(.6, 1.6), y1 = rnd(H*.5, H - .3); strut(M.metalDark, P, x, y0, z, x, y1, z, .07); strut(M.metalDark, P, x, y1, z, x + rnd(-.3, .3), y1 + .25, z*1.05, .07); }
  if (!NO_ROOF){ const Pr = under(P, T(0, hy + hh, 0)); for (let k=0; k<irand(2, 4); k++) blob(COM.moss, Pr, rnd(-.9, .9), .05, rnd(-.8, .8), rnd(.12, .22), .4);
    cyl(M.metalDark, Pr, .7, .5, -.5, .03, 1.0); if (typeof beaconLight === 'function') beaconLight(Pr, .7, 1.02, -.5, .06, .6); box(M.cream2, Pr, -.5, .15, .3, .35, .3, .35); }
  Object.assign(lot, { height: hy + hh + (NO_ROOF ? 0 : .1), floors: Math.round((hy + hh)/FH), occupied: true });
}
// a glass office tower: dark blue curtain wall over a stone podium, floors lit cool blue and the odd warm one,
// fine mullions, its name running up one corner in neon, a setback crown with a mast and red beacons
function glassTower(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  const w = rnd(1.6, 1.9), d = rnd(1.5, 1.75), floors = irand(7, 11), fh = .55, py = .9;
  box(COM.conc3, P, 0, py/2, 0, w + .2, py, d + .2);
  const Fp = under(P, T(0, 0, (d + .2)/2, 0)); box(COM.glassLit, Fp, 0, .4, .01, w - .3, .6, .02); for (let x = -w/2 + .2; x < w/2; x += .3) box(COM.mullion, Fp, x, .4, .02, .03, .62, .01);
  let y = py;
  const tint = pick([COM.glassT, toon(0x223048), toon(0x1e3036)]);
  box(tint, P, 0, y + floors*fh/2, 0, w, floors*fh, d);
  for (const f of faces(w, d)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry)), cols = Math.max(3, Math.round(f.len/.24));
    for (let k=0; k<floors; k++){ const fy = y + k*fh;
      box(COM.mullion, F, 0, fy + .02, .012, f.len, .04, .01);   // the floor line
      const run = chance(.35);   // a whole floor lit, or scattered offices
      for (let c=0; c<cols; c++){ if (!run && chance(.55)) continue; box(chance(.3) ? COM.glassLit : COM.glassWarm, F, -f.len/2 + (c + .5)*f.len/cols, fy + fh*.55, .01, f.len/cols - .03, fh*.6, .005); } }
    for (let c=0; c<=cols; c++) box(COM.mullion, F, -f.len/2 + c*f.len/cols, y + floors*fh/2, .015, .015, floors*fh, .01); }
  // the name up one corner, sideways, and neon edges
  const Fn = under(P, T(w/2 - .1, 0, d/2 + .02, 0)), [nm, nc] = pick([['sign_c_nexus', 'platinum'], ['sign_c_arakawa', 'cyan']]);
  const k = Math.min(1.1, (floors*fh - .4)/(SPR.size[nm][0]/PX));
  box(M.frame, Fn, 0, y + floors*fh/2, -.01, SPR.size[nm][1]/PX*k + .06, SPR.size[nm][0]/PX*k + .06, MIN_T);
  plant(nm, under(Fn, T(0, y + floors*fh/2, .01, 0, 1, 1, 1, 0, PI/2)), 0, 0, 0, k, 'c', true); glow(Fn, 0, y + floors*fh/2, .03, nc, .6);
  for (const [sx, sz] of [[-1, 1], [1, -1]]) box(chance(.5) ? M4.neonPurple : M.neonCyan, P, sx*(w/2 + .01), y + floors*fh/2, sz*(d/2 + .01), .03, floors*fh, .03);
  y += floors*fh;
  if (!NO_ROOF){
    const cw = w*.7, cd = d*.7; box(tint, P, 0, y + .35, 0, cw, .7, cd);
    for (const f of faces(cw, cd)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry)); box(COM.glassLit, F, 0, y + .4, .01, f.len - .1, .3, .005); }
    box(COM.mullion, P, 0, y + .74, 0, cw + .06, .06, cd + .06);
    cyl(M.metalDark, P, .15, y + 1.3, 0, .03, 1.1); cyl(M.metalDark, P, -.25, y + 1.05, .1, .02, .6);
    if (typeof beaconLight === 'function'){ beaconLight(P, .15, y + 1.88, 0, .07, .7); beaconLight(P, cw/2, y + .8, cd/2, .05, .5); beaconLight(P, -cw/2, y + .8, -cd/2, .05, .5); }
    y += .8;
  }
  Object.assign(lot, { height: y, floors: floors + 1, occupied: true });
}
// a three-tiered pagoda restaurant: red pillars and lattice walls lit warm, tiled roofs (red or dark blue) with gold
// trim and turned-up corners, a paper lantern hanging from every corner, the noodle bar's sign under the first eave
function pagodaHall(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2])));
  const roof = chance(.55) ? COM.pagodaRoof : COM.pagodaRoof2, tiers = NO_ROOF ? 2 : 3;
  box(COM.stoneD, P, 0, .1, 0, 2.35, .2, 2.15); for (let k=0; k<3; k++) box(COM.stone2, P, 0, .03 + k*.05, 1.1 + (2 - k)*.1, .8, .06, .12);   // the platform and its steps
  let y = .2, w = 1.95, d = 1.75;
  for (let t = 0; t < tiers; t++){
    const h = t ? .62 : .85;
    box(COM.wood2, P, 0, y + h/2, 0, w - .12, h, d - .12);
    for (const f of faces(w - .12, d - .12)){ const F = under(P, T(f.nx*f.half, 0, f.nz*f.half, f.ry));
      const n = Math.max(1, Math.round(f.len/.45));
      for (let q=0; q<n; q++){ const x = -f.len/2 + (q + .5)*f.len/n; box(COM.warm, F, x, y + h*.52, .01, f.len/n - .1, h*.6, .01); for (let l = -1; l <= 1; l++) box(COM.wood2, F, x + l*.08, y + h*.52, .018, .012, h*.6, .01); } }
    for (const [sx, sz] of CORNERS) cyl(COM.pillar, P, sx*(w/2 - .04), y + h/2, sz*(d/2 - .04), .045, h);
    box(COM.gold, P, 0, y + h - .02, d/2 - .02, w, .04, .03);
    tileRoof(P, y + h, w + .45, d + .45, t === tiers - 1 ? .55 : .3, roof);
    for (const s of [-1, 1]) box(COM.gold, P, 0, y + h + .02, s*(d + .45)/2, w + .45, .025, .03);
    for (const [sx, sz] of CORNERS) paperLantern(P, sx*(w + .3)/2, y + h - .05, sz*(d + .3)/2, t === 0 ? COM.lanGold : chance(.5) ? COM.lanGold : COM.lanRed, 1.25);
    if (t === 0){ const F = under(P, T(0, 0, (d - .12)/2, 0)); box(COM.warm2, F, 0, y + .32, .02, .5, .62, .01);
      const [kn, kc] = pick([['sign_c_noodlebar', 'pink'], ['sign_c_sushi', 'amber'], ['sign_c_ramen', 'amber']]);
      box(M.frame, F, 0, y + h + .2, .25, w - .2, .3, .05); fitSign(under(F, T(0, 0, .28, 0)), kn, 0, y + h + .2, 0, w - .35, .9, kc); }
    y += h + (t === tiers - 1 ? .55 : .3); w *= .74; d *= .74;
  }
  if (!NO_ROOF){ cyl(COM.gold, P, 0, y + .2, 0, .03, .4); sph(COM.gold, P, 0, y + .42, 0, .05); y += .45; }
  // a cherry tree in a planter by the steps
  if (chance(.6)){ const sx = chance(.5) ? -1 : 1, Q = under(P, T(sx*1.0, .2, .95)); box(COM.wood, Q, 0, .12, 0, .45, .24, .4);
    strut(M.trunk, Q, 0, .24, 0, sx*-.1, .7, 0, .06); for (let k=0; k<7; k++) blob(pick([M.sakura || COM.lanRed, M.sakura2 || COM.lanRed]), Q, rnd(-.25, .25) - sx*.1, rnd(.65, .9), rnd(-.2, .2), rnd(.1, .16), .7); }
  Object.assign(lot, { height: y, floors: tiers, occupied: true });
}
// a street of stalls: two rows of little stalls facing a lane down the middle, each under a corrugated roof (rusty,
// teal, blue, orange) or a tarp, tables piled with goods, chillies and lanterns hanging from the eaves, neon over a
// few of them, a wok steaming, stools in the lane; graffiti on the backs of the end stalls
function stallMarket(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2]))), S2 = SIDE - .1;
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) box(pick([COM.stoneD, M.concD, COM.stain, M.concD]), P, -S2/2 + (a + .5)*S2/6, .015, -S2/2 + (b + .5)*S2/6, S2/6 - .03, .03, S2/6 - .03);
  const signs = [['sign_c_pawntech', 'gold'], ['sign_c_open', 'pink'], ['sign_c_techmods', 'cyan'], ['sign_c_robot', 'pink'], ['sign_c_mods', 'cyan'], ['sign_c_ramen', 'amber']];
  for (const row of [-1, 1]) for (let k=0; k<3; k++){
    const sw = .76, sd = .72, x = -S2/2 + sw/2 + .05 + k*(sw + .04), z = row*(S2/2 - sd/2 - .04);
    const F = under(P, T(x, 0, z, row > 0 ? PI : 0));   // facing the lane (local +z)
    const goods = pick(['food', 'food', 'tech', 'curio']), corr = chance(.7), rm = pick(COM.corr);
    for (const [px, pz] of [[-sw/2 + .03, -sd/2 + .03], [sw/2 - .03, -sd/2 + .03], [-sw/2 + .03, sd/2 - .03], [sw/2 - .03, sd/2 - .03]]) cyl(M.frame, F, px, .55, pz, .015, 1.1);
    box(chance(.5) ? COM.wood : rm, F, 0, .55, -sd/2 + .02, sw, 1.1, .03);   // the back wall
    if (corr){ box(rm, F, 0, 1.14, 0, sw + .12, .03, sd + .1, 0, -.18); for (let t = -sw/2; t <= sw/2; t += .09) box(rm, F, t, 1.16, 0, .02, .02, sd + .1, 0, -.18); }
    else raggedTarp(under(F, T(0, 0, -sd/2, 0)), 0, 1.15, sw + .1, sd + .1, .25, pick([MC.tarp, MC.tarpGreen, M.tarp1 || MC.tarp, M.tarp2 || MC.tarp2]));
    box(COM.wood, F, 0, .25, sd/2 - .15, sw - .08, .5, .24); counterGoods(F, -sw/2 + .1, sw/2 - .1, .5, sd/2 - .15, goods);
    if (goods === 'food' && chance(.5)) for (let q=0; q<4; q++){ const hx = -sw/2 + .12 + q*.16; cyl(M.frame, F, hx, 1.0, sd/2 - .04, .004, .08); box(pick([MC.chili, MC.tomato, M.awn3]), F, hx, .9, sd/2 - .04, .035, .12, .035); }
    if (chance(.6)) paperLantern(F, rnd(-.2, .2), .96, sd/2 - .05, null, .9);
    if (chance(.45)){ const [sn, sc] = pick(signs); box(M.frame, F, 0, 1.25, sd/2, sw, .2, .03); fitSign(under(F, T(0, 0, sd/2 + .02, 0)), sn, 0, 1.25, 0, sw - .06, .55, sc); }
    if (goods === 'food' && chance(.4)){ cyl(M.metalDark, F, sw/2 - .15, .55, sd/2 - .12, .07, .06); emitters.push(new THREE.Vector3(sw/2 - .15, .68, sd/2 - .12).applyMatrix4(F)); }
    if (chance(.7)) figureAt(F, rnd(-.2, .2), 0, -.12);
    if (k === 0 || k === 2){ const side = k === 0 ? -1 : 1, Fs = under(F, T(side*sw/2, 0, 0, side*PI/2)); box(rm, Fs, 0, .55, -.01, sd, 1.1, .02); if (chance(.6)) neonTag(Fs, sd, 1.1); }
  }
  for (let k=0; k<3; k++){ const x = rnd(-.8, .8), z = rnd(-.15, .15); stool(P, x, z); spotAt(P, x, .16, z, 'seat', null, [0, chance(.5) ? 1 : -1]); }
  for (let k=0; k<2; k++) box(G.puddle, P, rnd(-.8, .8), .035, rnd(-.2, .2), rnd(.3, .6), .01, rnd(.15, .3));
  bulbString(P, -S2/2, 1.35, 0, S2/2, 1.35, 0, .1);
  Object.assign(lot, { height: 1.4, floors: 1, occupied: true });
}
// The food deck (the noodle-tower reference): a floor of food stalls open to the street on a concrete deck between
// steel posts, and stackable, so decks pile up into a tower of noodle bars with a stair zigzagging up the side. Each
// deck has two or three stalls (noren curtains, steaming pots and bowls, chillies drying, a neon name over each),
// stools along the counters, a rail round the open edges and paper lanterns strung along the front; the top deck
// gets a tarp canopy hung with lanterns. Lit warm all through, with the neon pink and purple over it.
const DECK_SIGNS = [['sign_c_noodles', 'amber'], ['sign_c_ramen', 'amber'], ['sign_c_cramen', 'pink'], ['sign_c_noodlebar', 'pink'], ['sign_c_sushi', 'amber'], ['sign_w_24h', 'pink'], ['sign_c_open', 'pink']];
function foodDeck(lot, st, P0, rot){
  const P = under(P0, T(0, 0, 0, rot !== undefined ? rot : pick([0, PI/2, PI, -PI/2]))), W = 2.35, D = 2.25, h = 1.2, upper = lot.base > CURB + .05;
  box(COM.conc3, P, 0, .05, 0, W, .1, D);                                     // the deck
  box(M4.neonPurple, P, 0, .03, D/2 + .005, W, .03, .02);
  for (const [sx, sz] of CORNERS) box(M.metalDark, P, sx*(W/2 - .06), h/2, sz*(D/2 - .06), .1, h, .1);
  box(M.metalDark, P, -W/2 + .06, h/2, 0, .08, h, .08);
  // the stalls: along the back, and down the left side
  const stall = (F, len) => {
    box(COM.wood, F, 0, .1 + .25, 0, len - .1, .5, .32); box(COM.wood2, F, 0, .61, .02, len, .03, .38);   // the counter
    box(COM.wood2, F, 0, .62, -.31, len - .1, .9, .02); box(COM.warm2, F, 0, .78, -.29, len - .3, .4, .01);   // the kitchen wall behind, a warm hatch in it
    for (let x = -len/2 + .2; x < len/2 - .1; x += .32){ if (typeof steamPot === 'function' && chance(.45)) steamPot(F, x, .62, -.05); else if (typeof foodBowl === 'function') foodBowl(F, x, .62, .06, .065); }
    const nm = pick([COM.noren, COM.noren2, toon(0x2a6a5a), toon(0xb0803a)]);
    for (let x = -len/2 + .08; x < len/2 - .05; x += .11) box(nm, F, x, h - .2, .14, .1, .22, .012);       // the noren
    if (chance(.6)) for (let q=0; q<5; q++){ const hx = -len/2 + .2 + q*.12; cyl(M.frame, F, hx, h - .1, .2, .004, .1); box(MC.chili, F, hx, h - .2, .2, .03, .12, .03); }
    const [sn, sc] = pick(DECK_SIGNS); box(M.frame, F, 0, h - .02, .2, Math.min(len - .1, 1.2), .2, .03); fitSign(under(F, T(0, 0, .22, 0)), sn, 0, h - .02, 0, Math.min(len - .2, 1.1), .6, sc);
    for (let x = -len/2 + .25; x < len/2 - .15; x += .4){ stool(F, x, .5); spotAt(F, x, .16, .5, 'seat', null, [0, -1]); }
    figureAt(F, rnd(-len/3, len/3), 0, -.18);
  };
  stall(under(P, T(.1, .1, -D/2 + .36, 0)), W - .4);
  if (chance(.75)) stall(under(P, T(-W/2 + .36, .1, .25, PI/2)), D - .9);
  // the rail round the open front and right side, lanterns strung along the front
  for (let x = -W/2 + .1; x <= W/2 - .1; x += .15) cyl(M.frame, P, x, .25, D/2 - .04, .008, .3);
  box(M.frame, P, 0, .4, D/2 - .04, W - .1, .02, .02);
  for (let k=0; k<6; k++){ const x = -W/2 + .2 + k*(W - .4)/5; paperLantern(P, x, h - .14 - .05*Math.sin(PI*k/5), D/2 - .02, k % 3 === 1 ? COM.lanGold : null, 1.05); }
  box(M.frame, P, 0, h - .05, D/2 - .04, W - .1, .02, .02);
  // the stair up the right side, deck to deck: two short flights with a landing
  const sx = W/2 - .2, steps = 7;
  for (let k=0; k<steps; k++){ const t = (k + .5)/steps; box(COM.conc2, P, sx, .1 + t*(h - .1), D/2 - .25 - t*(D - .7), .3, .04, .16); }
  strut(M.frame, P, sx + .16, .55, D/2 - .2, sx + .16, h + .4, -D/2 + .45, .015);
  // a bulb or two under the deck above (the light falls on the counters), halos tight on the bulbs
  for (const x of [-.5, .4]){ box(M.bulb, P, x, h - .06, -.2, .06, .05, .06); glow(P, x, h - .1, -.2, 'warm', .45); }
  if (!NO_ROOF){
    // the top deck's roof: a tarp canopy on the posts, lanterns along its edge
    box(pick([MC.tarp, MC.tarp2, M.tarp1 || MC.tarp]), P, 0, h + .1, 0, W + .1, .03, D + .1, 0, .08);
    for (const [cx, cz] of CORNERS) cyl(M.metalDark, P, cx*(W/2 - .06), h + .05, cz*(D/2 - .06), .03, .1);
    for (let k=0; k<4; k++) paperLantern(P, -W/2 + .35 + k*(W - .7)/3, h + .02, D/2 + .02, null, 1.0);
  } else box(COM.conc3, P, 0, h + .02, 0, W, .06, D);   // the floor of the deck above
  Object.assign(lot, { height: h + (NO_ROOF ? .05 : .15), floors: 1, occupied: true });
}
// A tower of food decks in one go: two or three decks stacked, all turned the same way so the stairs line up
function foodTower(lot, st, P0){
  const rot = pick([0, PI/2, PI, -PI/2]), n = irand(2, 3), keep = NO_ROOF;
  let y = 0;
  try {
    for (let k=0; k<n; k++){
      NO_ROOF = keep || k < n - 1;
      const L = { ...lot, base: lot.base + y };
      foodDeck(L, st, under(P0, T(0, y, 0)), rot);
      y += L.height;
    }
  } finally { NO_ROOF = keep; }
  Object.assign(lot, { height: y, floors: n, occupied: true });
}
// The market-stall base most commercial buildings stand on: a ring of little stalls round a podium, every one opening
// onto the street (a pinwheel, so each side of the plot has its own row), counters piled with goods, a lit hatch at the
// back, a striped awning or a corrugated roof out over the sidewalk, lanterns, a neon name on the fascia. Each stall
// throws a warm spill of light out across the street (a light-only glow: it lights the road, it draws no halo).
const STALL_BASE_H = 1.32;
const BASE_SIGNS = [['sign_c_noodles', 'amber'], ['sign_c_ramen', 'amber'], ['sign_c_open', 'pink'], ['sign_c_tea', 'green'], ['sign_c_pawn', 'gold'],
                    ['sign_c_mods', 'cyan'], ['sign_c_sushi', 'amber'], ['sign_c_techparts', 'cyan'], ['sign_c_gear', 'cyan'], ['sign_c_prints', 'pink']];
function stallBase(lot, st, P0){
  const B = 2.2, h = STALL_BASE_H, dep = .5;
  // the podium: a dark core (the stalls' back walls) under a slab with a lit fascia
  box(COM.wood2 || M.concDD, P0, 0, (h - .12)/2, 0, B - 2*dep + .04, h - .12, B - 2*dep + .04);
  box(M.concDD, P0, 0, h - .06, 0, B + .06, .12, B + .06);
  for (const [sx, sz] of CORNERS) box(M.metalDark, P0, sx*(B/2 - .04), (h - .12)/2, sz*(B/2 - .04), .08, h - .12, .08);
  for (let side = 0; side < 4; side++){
    const F = under(P0, T(0, 0, 0, side*PI/2));   // local +z faces this side's street
    const x0 = -B/2, x1 = B/2 - dep, n = 2, sw = (x1 - x0)/n, zf = B/2;
    box(M4.neonPurple, F, 0, h - .125, zf + .035, B, .025, .02);   // a thin neon line under the slab's edge
    for (let k=0; k<n; k++){
      const cx = x0 + sw*(k + .5), goods = pick(['food', 'food', 'food', 'tech', 'curio']);
      if (k) box(M.metalDark, F, x0 + sw*k, (h - .12)/2, zf - .04, .05, h - .12, .05);   // the post between stalls
      box(COM.shopLit, F, cx, .72, zf - dep + .025, sw - .2, .42, .01);               // the lit hatch at the back
      glow(F, cx, .74, zf - dep + .12, 'warm', .35);
      box(COM.wood, F, cx, .24, zf - .14, sw - .1, .48, .22); box(COM.wood2, F, cx, .49, zf - .12, sw - .04, .03, .28);   // the counter
      counterGoods(F, cx - sw/2 + .1, cx + sw/2 - .1, .5, zf - .14, goods);
      // the roof out over the sidewalk: a striped awning, or a corrugated sheet
      if (chance(.55)) stripedAwning(under(F, T(cx, 0, zf, 0)), 1.12, sw - .02, .34, .42, pick(COM.stripes));
      else { const rm = pick(COM.corr); box(rm, F, cx, 1.06, zf + .14, sw - .02, .025, .36, -.3); for (let t = cx - sw/2 + .05; t < cx + sw/2; t += .09) box(rm, F, t, 1.075, zf + .14, .02, .02, .36, -.3); }
      if (chance(.75)) paperLantern(F, cx + rnd(-.2, .2), .86, zf + .2, chance(.4) ? COM.lanGold : null, .9);
      if (goods === 'food' && chance(.45)) for (let q=0; q<4; q++){ const hx = cx - sw/2 + .14 + q*.15; cyl(M.frame, F, hx, .98, zf - .05, .004, .08); box(pick([MC.chili, MC.tomato, M.awn3]), F, hx, .88, zf - .05, .035, .12, .035); }
      if (goods === 'food' && chance(.35)){ cyl(M.metalDark, F, cx + sw/2 - .17, .55, zf - .2, .06, .06); emitters.push(new THREE.Vector3(cx + sw/2 - .17, .66, zf - .2).applyMatrix4(F)); }
      if (chance(.7)) figureAt(F, cx + rnd(-.15, .15), 0, zf - .36);
      if (chance(.6*S.neon)){ const [sn, sc] = pick(BASE_SIGNS); fitSign(under(F, T(0, 0, zf + .07, 0)), sn, cx, h - .05, 0, sw - .12, .5, sc); }
      // the warm spill: out over the street in front of the stall, lighting the road (no halo of its own)
      if (chance(.7)) glow(F, cx + rnd(-.2, .2), rnd(.45, .6), zf + rnd(.05, .2), chance(.65) ? 'spill' : 'spill2', rnd(1.4, 1.75));   // out of the stall at counter height, across the street
    }
    if (chance(.35)){ const x = rnd(x0 + .2, x1 - .2); stool(F, x, zf + .14); spotAt(F, x, .16, zf + .14, 'seat', null, [0, -1]); }
  }
  Object.assign(lot, { height: h, floors: 1, occupied: true });
}
// A billboard on a plot of its own: a big holographic board (or two, back to back) on a steel frame high above the
// street, a catwalk under it, and at its feet a kiosk with its shutter lit and a vending machine
function billboardLot(lot, st, P0){
  const P = under(P0, T(0, 0, 0, pick([0, PI/2, PI, -PI/2]))), lift = rnd(1.4, 2.4), twin = chance(.5);
  const hv = hash('lotboard', P0.elements[12].toFixed(2), P0.elements[14].toFixed(2), lot.base);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(M.metalDark, P, sx*.8, lift/2, sz*.35, .1, lift, .1);
  for (const sz of [-.35, .35]) for (let y = .4; y < lift; y += .5){ strut(M.frame, P, -.8, y, sz, .8, y + .45, sz, .025); }   // bracing
  box(M.metalDark, P, 0, lift, 0, 2.0, .08, .9); for (let x = -.95; x <= .95; x += .19) cyl(M.frame, P, x, lift + .18, .44, .008, .3);   // the catwalk
  holoBoard(under(P, T(0, lift, .1, 0)), 2, hv % 9, (hv >>> 6) % 211);
  if (twin) holoBoard(under(P, T(0, lift, -.1, PI)), 2, (hv >>> 3) % 9, (hv >>> 12) % 211);
  // the kiosk at its foot
  const Fk = under(P, T(.55, 0, .75, 0)); box(COM.wood, Fk, 0, .35, 0, .7, .7, .5); box(COM.shopLit, Fk, 0, .38, .26, .5, .4, .01);
  stripedAwning(under(Fk, T(0, 0, .25, 0)), .72, .8, .3, .4, pick(COM.stripes)); paperLantern(Fk, -.3, .62, .4, null, .9);
  if (typeof vending === 'function') vending(under(P, T(-.6, 0, .75, 0)), 0, 0);
  neonTag(under(P, T(.55, 0, .5, PI)), .7, .7);
  Object.assign(lot, { height: lift + (twin ? 2.6 : 2.6), floors: 1, occupied: true });
}
function buildFactory(lot, st, P0){
  const v = R();
  if (v < .2) return buildTankYard(lot, P0);
  if (v < .4) return silos(lot, st, P0);
  if (v < .7) return stiltFactory(lot, st, P0);
  return hall(lot, st, P0);
}
function hall(lot, st, P0){
  const c = { w:rnd(2.2,2.45), d:rnd(2,2.35), h:rnd(1.6,2), y:0, ox:0, oz:0, ry:0 };
  const P = chunkBox(P0, c, pick(st.walls), .03);
  const fs = faces(c.w,c.d), F = [];
  fs.forEach((f,i) => {
    const Ff = under(P, T(f.nx*f.half, -c.h/2, f.nz*f.half, f.ry));
    if (i === 0 || chance(.35)) garage(st, Ff, f.len, 0);
    else for (let k=0;k<2;k++) decorateFloor({...st, shop:0, garage:0}, Ff, f.len, k*FH, k+1, lot);
    faceExtras(st, Ff, f.len, c.h, lot, true);
    box(M.hazard, Ff, 0, .06, .02, f.len, .1, .04);
    F.push({F:Ff, len:f.len});
  });
  const Pr = under(P0, T(0, c.h, 0));
  if (NO_ROOF){ box(D[st.cls].roof, P0, 0, c.h + .03, 0, c.w + .06, .06, c.d + .06); if (chance(.6*S.clutter)) annex(st, pick(F), c); Object.assign(lot, { height:c.h, floors:2, occupied:true }); return; }   // another building stands on it: a flat roof
  for (let i=0;i<3;i++){
    const z = -c.d/2 + c.d/6 + i*c.d/3;
    put(U.prism, D[st.cls].roof, under(Pr, T(0,0,z,PI/2,c.d/3,.45,c.w)));
    box(pick([M.winLit,M.interiorCool]), Pr, 0, .2, z+c.d/12, c.w*.9, .03, c.d/7, 0, .95);
  }
  box(M.frame, Pr, 0, .5, 0, .06, .06, c.d);   // roof catwalk rail
  chimneyAt(P0, c.w/2-.3, c.h, -c.d/2+.3);
  if (chance(.5)) chimneyAt(P0, -c.w/2+.3, c.h, c.d/2-.3);
  if (chance(.6*S.clutter)) annex(st, pick(F), c);
  if (chance(.5)) stairs(st, pick(F), 2);
  Object.assign(lot, { height:c.h, floors:2, occupied:true });
}
function silos(lot, st, P0){
  const n = irand(3,4);
  let minH = 9;
  for (let i=0;i<n;i++){
    const a = i/n*TAU + rnd(-.2,.2), r = rnd(.38,.48), h = rnd(2.3,3.8), x = Math.cos(a)*.62, z = Math.sin(a)*.62;
    put(U.cyl16, pick([st.walls[0],st.walls[1],M.metal]), under(P0, T(x,h/2,z,0,2*r,h,2*r)));
    put(U.cyl16, M.hazard, under(P0, T(x,h*.3,z,0,2*r+.04,.1,2*r+.04)));
    put(U.cyl16, pick(st.neonMats), under(P0, T(x,h*.62,z,0,2*r+.04,.03,2*r+.04)));
    put(U.cone, D[st.cls].roof, under(P0, T(x,h+.2,z,0,2*r+.04,.4,2*r+.04)));
    box(M.metalDark, P0, x+Math.cos(a)*(r+.03), h/2, z+Math.sin(a)*(r+.03), .08, h, .04, -a);
    minH = Math.min(minH, h);
  }
  const cy = minH - .15;
  box(M.metalDark, P0, 0, cy, 0, 1.7, .05, .3); box(M.metalDark, P0, 0, cy, 0, .3, .05, 1.7);
  box(M.hazard, P0, 0, cy+.25, .15, 1.7, .03, .03); box(M.hazard, P0, 0, cy+.25, -.15, 1.7, .03, .03);
  box(M.neonAmber, P0, 0, cy+.1, 0, .08, .08, .08); glow(P0, 0, cy+.15, 0, 'amber', 1);
  cyl(M.rust, P0, 0, .8, 1.05, .08, 1.9, 0, PI/2);
  Object.assign(lot, { height:minH, floors:3, occupied:true });
}
function buildTankYard(lot, P){
  box(M.metalDark,P,0,.04,0,2.3,.08,2.3);
  for (const sx of [-1,1]){
    const r=rnd(.55,.75), x=sx*.55, z=rnd(-.3,.3);
    for (const [dx,dz] of [[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3]]) cyl(M.metalDark,P,x+dx,.3,z+dz,.04,.6);
    sph(pick([M.metal,M.concL,M.hazard]),P,x,.6+r,z,r); cyl(M.rust,P,x,.6+r,z,r+.01,.06);
    box(M.neonAmber,P,x,.62+2*r,z,.08,.08,.08); glow(P,x,.7+2*r,z,'amber',.9);
  }
  cyl(M.rust,P,0,.9,0,.07,1.2,0,PI/2);
  cyl(M.metal,P,0,.35,.9,.06,2.1,0,PI/2);
  for (let k=0;k<irand(2,4);k++) box(M.crate,P,rnd(-.9,.9),.12,rnd(.8,1),.25,.22,.22,rnd(0,1));
  for (const s of [-1,1]) box(M.hazard,P,s*1.05,.2,-1.05,.08,.4,.08);
  Object.assign(lot, { height:1.3, floors:1, occupied:true, yard:true });
}
function buildPlaza(lot, P){
  box(M.grass,P,0,.03,0,2.3,.06,2.3);
  cyl(M.trunk,P,0,.7,0,.13,1.4);
  for (let k=0;k<5;k++) plant(pick(['bush','bushFlower']),P,rnd(-.45,.45),rnd(1.2,1.7),rnd(-.45,.45),rnd(1.2,1.5),'c');
  for (let k=0;k<5;k++) plant(bigKind(),P,rnd(-1,1),.06,rnd(-1,1),rnd(.7,.95));
  for (const [x,z,ry] of [[-.8,.9,0],[.8,-.9,0],[.95,.7,PI/2]]){ box(M.wood,P,x,.15,z,.6,.06,.2,ry); box(M.metalDark,P,x,.07,z,.5,.14,.12,ry); }
  for (const [x,z] of [[-1,-1],[1,1]]){ cyl(M.metalDark,P,x,.5,z,.03,1); sph(M.bulb,P,x,1.03,z,.08); glow(P,x,1.03,z,'warm',1.1); }
  // food cart with a glowing counter
  box(M.red2,P,-.8,.25,-.7,.6,.35,.35); box(M.awn1,P,-.8,.62,-.7,.72,.05,.46,0,.1);
  box(M.winLit,P,-.8,.3,-.52,.4,.14,.02);
  if (chance(.9*S.neon)){ box(M.neonPink,P,-.8,.75,-.7,.4,.12,.04); glow(P,-.8,.75,-.62,'pink',1); }
  vending(P, .9, -1.0);
  Object.assign(lot, { height:0, floors:0, occupied:true });
}

function buildLot(lot){
  const st = STY[lot.cls];
  Object.assign(lot, { signs:0, height:0, floors:0 });
  groundLot(lot);
  const P0 = T(lot.x+rnd(-.1,.1), lot.base, lot.z+rnd(-.1,.1), rnd(-st.yaw, st.yaw));
  (() => {
    if (lot.plaza) return buildPlaza(lot, P0);
    if (lot.cls === 'low'){ const v = R(); return v < .12 ? podHouse(lot, st, P0) : v < .22 ? octoHouse(lot, st, P0) : v < .34 ? deckHouse(lot, st, P0) : buildTenement(lot, st, P0); }
    if (lot.cls === 'mid'){ const v = R(); return v < .2 ? podHouse(lot, st, P0) : v < .35 ? octoHouse(lot, st, P0) : v < .55 ? deckHouse(lot, st, P0) : v < .68 ? platformTower(lot, st, P0) : buildShophouse(lot, st, P0); }
    if (lot.cls === 'high') return buildTower(lot, st, P0);
    return buildFactory(lot, st, P0);
  })();
  lot.height += lot.base;   // heights are measured from the ground from here on
  if (lot.liftBase) lot.base += lot.liftBase;   // nothing connects between the stilts
}

/* ---------- hologram billboards ---------- */
// Nine animated ads cut from the neon sheets (assets/sprites/holo_ads.png: a row per ad, a 64x48 cell per frame;
// the first six are portrait 40x46, the last three landscape 64x44). Each billboard is a projector (an emitter bar,
// on posts for the bigger ones) throwing a see-through, flickering hologram: scanlines, a bright band rolling up it,
// now and then a glitch that tears rows sideways, splits the colour and jumps frames. The bigger boards carry a
// strip of scrolling text under the picture. Like the screens, every hologram in the city is one material: a quad's
// uvs say which ad (and a seed), and whether it's the picture or the text strip. It comes on with the evening, as
// the other lights do, and stays faintly on by day.
// each board is tinted one of ten colours (from its seed), whatever colour the sheet drew the ad in
const HOLO_INK = [[1,.55,.12], [.25,.95,1], [1,.3,.85], [.45,1,.35], [1,.85,.2], [.65,.4,1], [1,.25,.22], [.3,.55,1], [.2,1,.75], [1,.6,.75]];
const HOLO_TEXT = ['ADVERTISING ROBOTS  *  THEY SMILE, THEY WAVE, THEY SELL  *  ', 'BOT SHOP  *  ROBOT REPAIR  *  FIXED WHILE YOU WAIT  *  ',
  'MEET YOUR NEW BEST FRIEND  *  ROBOTS FOR EVERY HOME  *  ', 'HOT RAMEN 24/7  *  EXTRA NOODLES, NO EXTRA CHARGE  *  ', 'LAUNDRY  *  SPIN CYCLE SPECIALS ALL NIGHT  *  ',
  'ARCADE  *  HIGH SCORES NIGHTLY  *  INSERT COIN  *  ', 'AIR FILTERS  *  BREATHE EASY ABOVE THE SMOG  *  ', 'MESSAGES TO GROUNDERS  *  BEAM ONE DOWN TONIGHT  *  ',
  'NEON CLUB  *  DANCE TILL DAWN  *  ']
const HOLO_TW = Array(9).fill(200);
const holoText = (() => {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const draw = () => { const g = cv.getContext('2d'); g.clearRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.textBaseline = 'top'; g.font = '8px Silkscreen, monospace';
    HOLO_TEXT.forEach((t, k) => { g.fillText(t, 0, k*12 + 2); HOLO_TW[k] = Math.min(512, Math.ceil(g.measureText(t).width)); });
    // the font is drawn soft at this size: threshold it back to hard pixels
    const d = g.getImageData(0, 0, 512, 128); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0; g.putImageData(d, 0, 0);
    tex.needsUpdate = true; if (HOLO_MAT) HOLO_MAT.uniforms.textW.value = HOLO_TW.slice(); };
  draw(); if (document.fonts && document.fonts.load) document.fonts.load('8px Silkscreen').then(draw).catch(() => {});
  return tex;
})();
const holoAds = new THREE.TextureLoader().load('assets/sprites/holo_ads.png'); holoAds.magFilter = holoAds.minFilter = THREE.NearestFilter; holoAds.generateMipmaps = false;
var HOLO_MAT = null;
HOLO_MAT = new THREE.ShaderMaterial({
  uniforms: { tAds: { value: holoAds }, tText: { value: holoText }, time: FOL_UNI.time, lightsOn: LIGHTS_ON, textW: { value: HOLO_TW.slice() },
    ink: { value: HOLO_INK.map(c => new THREE.Vector3(...c)) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tAds; uniform sampler2D tText; uniform float time; uniform float lightsOn; uniform float textW[9]; uniform vec3 ink[10];
    varying vec2 vUv;` + LIT_GLSL + `
    float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    vec3 inkOf(float a){ vec3 c = ink[0]; for (int i = 1; i < 10; i++) if (float(i) == a) c = ink[i]; return c; }
    float palOf(float s){ return mod(s*7.0 + floor(s/10.0), 10.0); }
    float twOf(float a){ float w = textW[0]; for (int i = 1; i < 9; i++) if (float(i) == a) w = textW[i]; return w; }
    void main(){
      float id = floor(vUv.x + 1e-4), kind = floor(vUv.y + 1e-4), ad = mod(id, 9.0), seed = floor(id/9.0);
      float u = vUv.x - id, v = vUv.y - kind;
      if (!gl_FrontFacing) u = 1.0 - u;                          // from behind it reads the right way round too
      float t = time + seed*3.71;
      vec3 c = inkOf(palOf(seed));
      // a glitch burst every so often: rows torn sideways, the colour split, the frame jumping
      float gl = step(.9, hh(vec2(floor(t*2.5), seed)))*step(.35, hh(vec2(floor(t*14.0), seed + 1.0)));
      float band = floor(v*9.0);
      if (hh(vec2(band, floor(t*18.0) + seed)) < gl*.6) u += (hh(vec2(band, floor(t*30.0))) - .5)*.22;
      if (hh(vec2(floor(v*46.0), floor(t*6.0) + seed)) > .985) u += .03;   // the odd jittering line, even when calm
      vec3 col;
      if (kind < .5){
        bool port = ad < 5.5; vec2 cs = port ? vec2(40.0, 46.0) : vec2(64.0, 44.0);
        float nF = port ? 6.0 : 4.0, fr = mod(floor(t*4.0 + seed), nF);
        if (gl > .5) fr = floor(hh(vec2(floor(t*12.0), seed))*nF);
        if (u < 0.0 || u > 1.0){ discard; }
        vec2 p = vec2(fr*64.0 + floor(u*cs.x), ad*48.0 + floor((1.0 - v)*cs.y));
        vec2 W = vec2(384.0, 432.0);
        vec3 s = texture2D(tAds, (p + .5)/W*vec2(1.0, -1.0) + vec2(0.0, 1.0)).rgb;
        if (gl > .5){ s.g = texture2D(tAds, (p + vec2(2.0, 0.0) + .5)/W*vec2(1.0, -1.0) + vec2(0.0, 1.0)).r; }
        col = c*max(s.r, max(s.g, s.b))*1.9 + c*.07;               // the ad in the board's colour, on a faint sheet of light
        float lines = .72 + .28*step(.5, fract(v*cs.y*.5));        // scanlines
        col *= lines;
      } else {
        // the text strip: the slogan scrolling past, in the ad's colour
        float tw = twOf(ad), x = mod(floor(u*120.0 + t*16.0), tw), y = floor((1.0 - v)*12.0);
        if (u < 0.0 || u > 1.0){ discard; }
        float a = texture2D(tText, vec2((x + .5)/512.0, 1.0 - (ad*12.0 + y + .5)/128.0)).a;
        col = c*(a*1.6 + .06);
        col *= .8 + .2*step(.5, fract(v*6.0));
      }
      col += c*.35*exp(-pow((fract(v*.6 - t*.35) - .5)*9.0, 2.0));   // a bright band rolling up
      float fl = .86 + .14*sin(t*41.0)*sin(t*13.0);
      if (hh(vec2(floor(t*11.0), seed + 5.0)) > .975) fl *= .25;     // drop-outs
      float on = litOn(.18 + .7*fract(seed*.618 + ad*.13), lightsOn, time);
      gl_FragColor = vec4(col*fl*mix(.6, 1.0, on), 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
HOLO_MAT.userData.colorOnly = true; HOLO_MAT.userData.noCast = true;
// a hologram quad in the buckets (F: local z out of its face): kind 0 the picture, 1 the text strip
const _hq = new THREE.Vector3();
function holoQuad(F, x, y, z, w, h, ad, seed, kind){
  let b = buckets.get(HOLO_MAT); if (!b){ b = { p: [], n: [], d: [], f: null, u: [] }; buckets.set(HOLO_MAT, b); }
  const id = ad + 9*seed, C = [[-w/2, -h/2, 0, 0], [w/2, -h/2, .999, 0], [w/2, h/2, .999, .999], [-w/2, h/2, 0, .999]];
  for (const k of [0, 1, 2, 0, 2, 3]){ const [cx, cy, u, v] = C[k]; _hq.set(x + cx, y + cy, z).applyMatrix4(F); b.p.push(_hq.x, _hq.y, _hq.z); b.n.push(0, 1, 0); b.u.push(id + u, kind + v); b.d.push(0); }
}
/* ---------- the air-filter hologram ---------- */
// A huge hologram (three plots wide) thrown out in front of a tall commercial tower from a projector on its top floor:
// Caelum-Sol's pure-air ad for a minute, then it glitches, gets "hacked" and the free-air protest sign takes over for
// half a minute, then glitches back, and round again. Additive, so the dark of the sign is see-through; scanlines, a
// rolling band, flicker; torn rows, split colour and static in the glitches. A faint beam fans out from the lens.
// two pairs: Caelum-Sol's pure air hacked by "breathe for free", Aether-Vane's Platform 9 recruitment hacked by "the sky belongs to no one"
const AIR_A = new THREE.TextureLoader().load('assets/sprites/holo_pureair.png'), AIR_B = new THREE.TextureLoader().load('assets/sprites/holo_freeair.png');
const AIR_A2 = new THREE.TextureLoader().load('assets/sprites/holo_aether.png'), AIR_B2 = new THREE.TextureLoader().load('assets/sprites/holo_sky.png');
const AIR_A3 = new THREE.TextureLoader().load('assets/sprites/holo_synth.png'), AIR_B3 = new THREE.TextureLoader().load('assets/sprites/holo_watch.png');   // and Synth Corp's security, hacked by "Big Brother is watching"
// and two plain ads (no hack) for the wall holograms: Robo-Repair and PureFlow air filters. Each is an atlas of five
// portrait versions of the ad (see tools/make_tall_holo_ads.sh), so a hologram can run the height of a building without
// stretching the picture: WALL_ASPECT is each version's height over width, WALL_CELLS where it sits in the atlas.
const AIR_W1 = new THREE.TextureLoader().load('assets/sprites/holo_robo_tall.png'), AIR_W2 = new THREE.TextureLoader().load('assets/sprites/holo_pureflow_tall.png');
const WALL_ASPECT = [1.05, 1.5, 2.1, 3.0, 4.2];
const WALL_ATLAS = [1024, 3225], WALL_CELLS = [[512, 2304, 538], [512, 1536, 768], [0, 2150, 1075], [512, 0, 1536], [0, 0, 2150]];   // x, y from the top, height (all 512 wide)
const AIR_ASPECT = [.75, 440/512, .75, .75, .75];   // height over width of each pair's pictures
for (const t of [AIR_A, AIR_B, AIR_A2, AIR_B2, AIR_A3, AIR_B3, AIR_W1, AIR_W2]){ t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }
const AIR_CYCLE = [60, 2.4, 30, 2.4];   // ad, glitch, hacked, glitch back (seconds)
const AIR_HOLO_MAT = new THREE.ShaderMaterial({
  uniforms: { tA: { value: AIR_A }, tB: { value: AIR_B }, tA2: { value: AIR_A2 }, tB2: { value: AIR_B2 }, tA3: { value: AIR_A3 }, tB3: { value: AIR_B3 }, tW1: { value: AIR_W1 }, tW2: { value: AIR_W2 }, time: FOL_UNI.time, lightsOn: LIGHTS_ON },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tA2; uniform sampler2D tB2; uniform sampler2D tA3; uniform sampler2D tB3; uniform sampler2D tW1; uniform sampler2D tW2; uniform float time; uniform float lightsOn; varying vec2 vUv;` + LIT_GLSL + `
    float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    float pr = 0.0;
    vec3 wall(vec2 q){ float w = pr - 3.0, ad = mod(w, 2.0), vr = floor(w*.5 + .01); vec3 c = ${WALL_CELLS.map((c, k) => `vr < ${k}.5 ? vec3(${c[0]}.0, ${c[1]}.0, ${c[2]}.0)`).join(' : ')} : vec3(0.0);
      vec2 a = vec2(${WALL_ATLAS[0]}.0, ${WALL_ATLAS[1]}.0), uv = vec2((c.x + .5 + q.x*511.0)/a.x, 1.0 - (c.y + .5 + (1.0 - q.y)*(c.z - 1.0))/a.y); return ad > .5 ? texture2D(tW2, uv).rgb : texture2D(tW1, uv).rgb; }
    vec3 smp(float b, vec2 q){ q = clamp(q, 0.0, 1.0); if (pr > 2.5) return wall(q); if (pr > 1.5) return b > .5 ? texture2D(tB3, q).rgb : texture2D(tA3, q).rgb; if (pr > .5) return b > .5 ? texture2D(tB2, q).rgb : texture2D(tA2, q).rgb; return b > .5 ? texture2D(tB, q).rgb : texture2D(tA, q).rgb; }
    void main(){
      pr = floor(vUv.y + 1e-4);
      float id = floor(vUv.x + 1e-4), u = vUv.x - id, v = vUv.y - pr;
      if (!gl_FrontFacing) u = 1.0 - u;
      float t = time + id*23.7, cyc = mod(t, ${AIR_CYCLE.reduce((a, b) => a + b).toFixed(1)});
      float e1 = ${AIR_CYCLE[0].toFixed(1)}, e2 = e1 + ${AIR_CYCLE[1].toFixed(1)}, e3 = e2 + ${AIR_CYCLE[2].toFixed(1)};
      float g = 0.0, useB = 0.0, band = floor(v*28.0), slab = floor(v*7.0);
      if (cyc < e1) useB = 0.0;
      else if (cyc < e2){ float k = (cyc - e1)/(e2 - e1); g = 1.0; useB = step(hh(vec2(band, floor(t*9.0))), k*k*1.15); }       // hacked: rows flip over to the protest
      else if (cyc < e3) useB = 1.0;
      else { float k = (cyc - e3)/(${AIR_CYCLE[3].toFixed(1)}); g = 1.0; useB = 1.0 - step(hh(vec2(band, floor(t*9.0) + 3.0)), k*k*1.15); }   // and taken back
      if (pr > 2.5){ g = 0.0; useB = 0.0; }   // the wall ads: never hacked, only the odd small glitch
      // the odd small glitch while it plays (more often on the hacked sign)
      float small = step(useB > .5 ? .86 : .95, hh(vec2(floor(t*3.0), id)))*step(.5, hh(vec2(floor(t*16.0), id + 2.0)));
      g = max(g, small*.45);
      if (g > 0.0){
        u += (hh(vec2(band, floor(t*24.0))) - .5)*.18*g;
        u += (hh(vec2(slab, floor(t*7.0) + 9.0)) - .5)*.06*g;
      }
      u += (hh(vec2(floor(v*90.0), floor(t*5.0))) > .992 ? .012 : 0.0);   // a line jittering now and then
      if (u < 0.0 || u > 1.0) discard;
      vec2 q = vec2(u, v);
      vec3 col = smp(useB, q);
      if (g > 0.0){ col.r = smp(useB, q + vec2(.012*g, 0.0)).r; col.b = smp(useB, q - vec2(.012*g, 0.0)).b; }   // split colour
      float st = hh(vec2(floor(u*120.0), floor(v*90.0) + floor(t*30.0)));
      if (g > .9 && st > .9) col = mix(col, vec3(st)*vec3(.7, .9, 1.0), .6);   // static
      if (g > .9 && hh(vec2(slab, floor(t*12.0))) > .8) col *= .15;           // whole slabs dropping out
      vec3 tint = useB > .5 ? vec3(.3, .9, 1.0) : vec3(.35, .75, 1.0);
      col = col*1.05 + tint*.035;                                              // the sign on a faint sheet of light
      col *= .74 + .26*step(.5, fract(v*170.0));                              // scanlines
      col += tint*.12*exp(-pow((fract(v*.5 - t*.22) - .5)*10.0, 2.0));       // a band rolling up
      float edge = smoothstep(0.0, .03, u)*smoothstep(1.0, .97, u)*smoothstep(0.0, .03, v)*smoothstep(1.0, .97, v);
      float fl = .9 + .1*sin(t*37.0)*sin(t*11.0);
      if (hh(vec2(floor(t*9.0), id + 5.0)) > .985) fl *= .35;
      float on = litOn(.3, lightsOn, time);
      gl_FragColor = vec4(col*edge*fl*mix(.4, .8, on), 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
AIR_HOLO_MAT.userData.colorOnly = true; AIR_HOLO_MAT.userData.noCast = true;
// the beam: faint light fanning from the lens to the picture, fading out as it goes, with streaks running along it
const AIR_BEAM_MAT = new THREE.ShaderMaterial({
  uniforms: { time: FOL_UNI.time, lightsOn: LIGHTS_ON },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float time; uniform float lightsOn; varying vec2 vUv;` + LIT_GLSL + `
    void main(){
      float a = (1.0 - vUv.y)*(1.0 - vUv.y)*.09 + vUv.y*.012;
      a *= .7 + .3*sin(vUv.x*40.0 + time*2.0)*sin(vUv.x*13.0 - time*1.3);
      gl_FragColor = vec4(vec3(.35, .8, 1.0)*a*mix(.35, 1.0, litOn(.3, lightsOn, time)), 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
AIR_BEAM_MAT.userData.colorOnly = true; AIR_BEAM_MAT.userData.noCast = true;
const _aq = new THREE.Vector3();
function uvBucket(mat){ let b = buckets.get(mat); if (!b){ b = { p: [], n: [], d: [], f: null, u: [] }; buckets.set(mat, b); } return b; }
// the projector on a wall at P (local +z out of the wall, origin at the lens height), throwing the picture D out
// A wall hologram: pictures as wide as the building's face, floating just off it (inside the plot), with a thin
// emitter bar on the wall under them. P is at the bottom (the top of the ground floor) and H is the height up to
// the roofline. The ad is never stretched to fit: a tall wall takes a stack of N pictures, each cut from the atlas
// version whose proportions are closest to H/N (the nearest is at most about 20% off). ad 0 Robo-Repair, 1 PureFlow.
function wallHologram(P, W, H, id, ad){
  box(M.metalDark, P, 0, -.05, -.02, W*.92, .07, .1); box(M.neonCyan, P, 0, -.015, .035, W*.86, .015, .015);
  for (const sx of [-1, 1]) glow(P, sx*W*.3, 0, .06, 'cyan', .3);
  const n = Math.max(1, Math.round(H/W/3)), h = H/n, a = h/W;
  let vr = 0; for (let k = 1; k < WALL_ASPECT.length; k++) if (Math.abs(Math.log(WALL_ASPECT[k]/a)) < Math.abs(Math.log(WALL_ASPECT[vr]/a))) vr = k;
  const b = uvBucket(AIR_HOLO_MAT), pair = 3 + ad + 2*vr;
  for (let t = 0; t < n; t++){
    const y0 = t*h + .02, C = [[-W/2, y0, 0, 0], [W/2, y0, .999, 0], [W/2, y0 + h - .02, .999, .999], [-W/2, y0 + h - .02, 0, .999]];
    for (const k of [0, 1, 2, 0, 2, 3]){ const [cx, cy, u, v] = C[k]; _aq.set(cx, cy, .08).applyMatrix4(P); b.p.push(_aq.x, _aq.y, _aq.z); b.n.push(0, 1, 0); b.u.push(id + t*7 + u, pair + v); b.d.push(0); }
  }
}
function airHologram(P, W, H, D, id, pair = 0){
  // the projector: a housing on brackets, a lens ring, a lit lens
  box(M.metalDark, P, 0, 0, .22, .7, .36, .44); box(M.frame, P, 0, .2, .22, .74, .04, .48);
  for (const sx of [-.25, .25]) box(M.metalDark, P, sx, -.24, .12, .06, .2, .24);
  cyl(M.frame, P, 0, 0, .46, .13, .06, PI/2); cyl(M.neonCyan, P, 0, 0, .49, .09, .02, PI/2); glow(P, 0, 0, .52, 'cyan', .45);
  box(M.neonCyan, P, -.24, .1, .445, .1, .03, .01); box(M.neonPink, P, .22, .1, .445, .06, .03, .01);
  // the picture
  const b = uvBucket(AIR_HOLO_MAT), C = [[-W/2, -H/2, 0, 0], [W/2, -H/2, .999, 0], [W/2, H/2, .999, .999], [-W/2, H/2, 0, .999]];
  for (const k of [0, 1, 2, 0, 2, 3]){ const [cx, cy, u, v] = C[k]; _aq.set(cx, cy, D).applyMatrix4(P); b.p.push(_aq.x, _aq.y, _aq.z); b.n.push(0, 1, 0); b.u.push(id + u, pair + v); b.d.push(0); }
  // the beam: four faces from the lens to the picture's edges
  const bb = uvBucket(AIR_BEAM_MAT), L = [0, 0, .5], E = [[-W/2, -H/2], [W/2, -H/2], [W/2, H/2], [-W/2, H/2]];
  for (let k=0; k<4; k++){
    const a = E[k], c = E[(k + 1) % 4];
    for (const [x, y, z, u, v] of [[L[0], L[1], L[2], .5, 0], [a[0], a[1], D, 0, 1], [c[0], c[1], D, 1, 1]]){ _aq.set(x, y, z).applyMatrix4(P); bb.p.push(_aq.x, _aq.y, _aq.z); bb.n.push(0, 1, 0); bb.u.push(u + k, v); bb.d.push(0); }
  }
}
M.holoBlue = toon(0x1a2a50, { em: 0x3a7aff, kind: 'neon' });
const holoNeon = (c, k) => [toon(new THREE.Color(...c.map(v => v*.25)).getHex(), { em: new THREE.Color(...c).getHex(), kind: 'neon' }), k];
const HOLO_EMIT = [holoNeon(HOLO_INK[0], 'orange'), [M.neonCyan, 'cyan'], [M.neonPink, 'pink'], holoNeon(HOLO_INK[3], 'green'), [M.neonAmber, 'amber'],
  holoNeon(HOLO_INK[5], 'pink'), holoNeon(HOLO_INK[6], 'red'), [M.holoBlue, 'blue'], holoNeon(HOLO_INK[8], 'cyan'), holoNeon(HOLO_INK[9], 'pink')];
const holoPal = seed => (seed*7 + Math.floor(seed/10)) % 10;   // same as palOf in the shader
// A billboard standing at P (its base, facing +z). size 0 small (a rooftop stand), 1 medium, 2 large (on posts,
// with the text strip).
function holoBoard(P, size, ad, seed){
  const port = ad < 6, H = port ? [1.0, 1.6, 2.3][size] : [.85, 1.35, 1.95][size], w = port ? H*40/46 : H*64/44;
  const band = size ? [0, .3, .4][size] : 0, lift = size ? .35 : .22, [emit, gk] = HOLO_EMIT[holoPal(seed)];
  const y0 = lift + .12 + (band ? band + .06 : 0);
  // the projector: a dark bar with the emitter strip along its top
  box(M.metalDark, P, 0, lift, 0, w + .16, .12, .2);
  box(emit, P, 0, lift + .065, 0, w, .02, .05);
  for (let k = 0; k < 3; k++) glow(P, (k - 1)*w*.35, lift + .1, 0, gk, .5 + size*.15);
  if (size === 0){ for (const sx of [-1, 1]) box(M.frame, P, sx*w*.35, lift/2, 0, .05, lift, .05); }
  else {
    const top = y0 + H + .06;
    for (const sx of [-1, 1]){ box(M.metalDark, P, sx*(w/2 + .1), top/2, 0, .08, top, .08); box(M.frame, P, sx*(w/2 + .1), top + .03, 0, .12, .06, .12); }
    box(M.metalDark, P, 0, top, 0, w + .28, .06, .1); box(emit, P, 0, top - .035, 0, w, .02, .04);   // a second emitter above
    if (size === 2) for (const sx of [-1, 1]) strut(M.frame, P, sx*(w/2 + .1), 0, -.35, sx*(w/2 + .1), top*.6, 0, .03);   // braces behind
    holoQuad(P, 0, lift + .12 + band/2, 0, w, band, ad, seed, 1);
  }
  holoQuad(P, 0, y0 + H/2, 0, w, H, ad, seed, 0);
}

/* ---------- luxury lighting ---------- */
// The luxury towers have their own lights, in colours no other district uses: gold, ivory white, lemon yellow, rose
// gold and a pale platinum lilac. Each section takes two of them (from its seed); while it's generated, every neon
// strip and trim it lays down, and every halo, is swapped for its luxury twin (see LUX in put and glow).
const LUX_COLS = [['gold', 0xffc24a, 0x5a4214], ['ivory', 0xfff3dc, 0x5a5448], ['lemon', 0xfff25a, 0x5a5418], ['rosegold', 0xffaa80, 0x5a3a2c], ['platinum', 0xe2d6ff, 0x4a4458]]
  .map(([k, em, base]) => ({ k, neon: toon(em, { em, kind: 'neon' }), trim: toon(em, { em, kind: 'neon' }) }));   // lit colour all through, and the trims as bright as the neon
// the cool blue and pink rooms of the other districts become warm champagne and rose-gold rooms here
const LUX_ROOM = [toon(0x5a4c30, { em: 0xf2dca0, kind: 'window' }), toon(0x5a3a30, { em: 0xf0b08a, kind: 'window' })];
function luxPalette(h){   // from its own hash, so the towers' own layouts (drawn from R) are untouched
  const n = LUX_COLS.length, a = LUX_COLS[h % n], b = LUX_COLS[(h % n + 1 + (h >>> 8) % (n - 1)) % n];
  const mats = new Map([[M.neonCyan, a.neon], [M.neonPink, b.neon], [M.neonAmber, a.neon], [M4.neonPurple, b.neon], [M4.neonBlue, a.neon], [M.holoBlue, a.neon],
    [M.trimCyan, a.trim], [M.lxLine, a.trim], [M.interiorCool, LUX_ROOM[0]], [M.interiorPink, LUX_ROOM[1]], [M4.pool, LUX_ROOM[0]]].filter(([s2]) => s2));
  // pale gold and ivory bloom less than saturated pink and cyan (and the lit facades round them take the bloom's
  // edge off), so the luxury halos are drawn bigger and the strips brighter to keep their glow
  const kOf = new Map(); for (const c of LUX_COLS) kOf.set(c.neon, c.k);   // neon strips only: the trim lines round every slab would ring the whole tower in glow
  // and every strip gets a soft halo of its own, sized to it (the old pink and cyan ones had few)
  const halo = (mat, m) => { const k = kOf.get(mat); if (!k || !glowList) return; const e = m.elements;
    const L = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    if (L < .25 || posHash(e[12], e[13], e[14]) < 55) return;   /* about every other strip */ (glowList[k] || (glowList[k] = [])).push(e[12], e[13], e[14], Math.min(1.0, .3 + L*.25)); };
  return { mats, glows: { cyan: a.k, pink: b.k, amber: a.k, blue: a.k, orange: b.k, green: a.k }, haloK: 1.2, halo };
}

/* ---------- industrial lighting ---------- */
// The industrial zone burns in the colours of a works at night: sodium orange, ember red, hazard yellow, hot
// orange, welding-arc white, safety green and toxic lime. Each section takes three (from its own hash); its neon, trims, strip lamps and cool-lit rooms are swapped
// for these while it's generated, the same way the luxury towers get their gold (the glowing pipe liquids keep
// their own colours).
function dimHex(hex, k){ return new THREE.Color(hex).multiplyScalar(k).getHex(); }
// The works glow in reds: every front light (neon, trim, strip lamps, lit shopfronts and windows, and their halos)
// is one of six reds, from deep blood red through scarlet and crimson to a rose red and a red-orange
const IND_COLS = [['ember', 0xff4a2a, 0x5a1e14], ['crimson', 0xff1a3a, 0x5a0c16], ['scarlet', 0xff2a1a, 0x5a1010], ['rosered', 0xff3a5a, 0x5a1420],
  ['blood', 0xc8101c, 0x4a0a10], ['redorange', 0xff5230, 0x5a2010]]
  .map(([k, em, base]) => ({ k, neon: toon(base, { em, kind: 'neon' }), trim: toon(base, { em, kind: 'trim' }), lamp: toon(base, { em: dimHex(em, .55), kind: 'lamp' }) }));   // the strip lamps burn at full strength: kept dim so the works don't bloom
const IND_ROOM = [toon(0x5a2420, { em: 0xb83a2c, kind: 'window' }), toon(0x5a1a1e, { em: 0xa82434, kind: 'window' }), toon(0x5a2a1a, { em: 0xb84a2e, kind: 'window' })];
// the works' lit shopfronts and windows: red, and a step dimmer than elsewhere (their big lit panels bloomed)
const IND_DIM_HEX = [0xb83a2c, 0xa82434, 0xc04a30, 0x9a1c24];
const IND_DIM = [M.inShop, M.inShop2, M.winLit, M.bulb].filter(Boolean).map((m, i) => [m, toon(m.color.getHex(), { em: IND_DIM_HEX[i % 4], kind: m.userData.glow })]);
// any other light on the works (a warm window, a gold trim) turns to one of the reds, about as bright as it was; the
// liquid in the glass pipes is its own shader and keeps its blue, green and brown (see fluidSeg)
const IND_AUTO = new Map();
function indRed(mat){
  if (mat.userData.glow === 'blink') return null;
  let r = IND_AUTO.get(mat);
  if (!r){
    const e = mat.emissive, lum = Math.max(e.r, e.g, e.b), base = IND_COLS[mat.id % IND_COLS.length];
    const em = new THREE.Color(IND_DIM_HEX[mat.id % IND_DIM_HEX.length]).multiplyScalar(Math.min(1.1, lum/.75));
    r = toon(new THREE.Color(mat.color).multiplyScalar(.6).lerp(new THREE.Color(0x5a1a18), .5).getHex(), { em: em.getHex(), kind: mat.userData.glow });
    IND_AUTO.set(mat, r);
  }
  return r;
}
function indPalette(h){
  // three different reds per section, so one building already mixes, say, crimson trim, scarlet strips and a rose-red sign
  const n = IND_COLS.length, j0 = h % n, j1 = (j0 + 1 + (h >>> 5) % (n - 1)) % n;
  let j2 = (j0 + 1 + (h >>> 9) % (n - 1)) % n; if (j2 === j1) j2 = (j2 + 1) % n; if (j2 === j0) j2 = (j2 + 1) % n;
  const a = IND_COLS[j0], b = IND_COLS[j1], c = IND_COLS[j2];
  const mats = new Map([[M.neonCyan, a.neon], [M.neonPink, b.neon], [M.neonAmber, c.neon], [M4.neonPurple, b.neon], [M4.neonBlue, c.neon], [M.holoBlue, a.neon],
    [M.trimCyan, c.trim], [M.inNeon, b.lamp], [M.interiorCool, IND_ROOM[0]], [M.interiorPink, IND_ROOM[1]], [M.btCyan, IND_ROOM[2]]].filter(([s2]) => s2));
  for (const [m, d] of IND_DIM) if (!mats.has(m)) mats.set(m, d);
  // every halo on the fronts turns red too
  const glows = { cyan: a.k, pink: b.k, amber: c.k, warm: c.k, orange: b.k, sodium: a.k, gold: c.k, green: b.k, blue: a.k, lemon: c.k, hazard: a.k, ivory: c.k };
  return { mats, glows, haloAll: .6, auto: indRed };
}
