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
  mid:  { walls:[M.cream2,M.white2,M.concL,M.red2,M.teal2,M.concW], accent:[M.awn1,M.awn2,M.awn3,M.red2],
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
const litRoom = st => chance(st.lit) ? pick(LIT_ROOMS) : M.glassDark;

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
    else { const m=pick(st.neonMats); box(m,F,0,y0+1.06,.05,L*rnd(.35,.6),.14,.05); glow(F,0,y0+1.06,.2,NEON_GLOW.get(m),1.3); }
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
  box(M.neonAmber, F, 0, y0+.92, .07, .06, .06, .06); glow(F, 0, y0+.92, .17, 'amber', .8);
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
  const kind = pick(vertical ? GLYPH_V : GLYPH_H);
  const w = SPR.size[kind][0]/PX, h = SPR.size[kind][1]/PX, col = GLYPH_GLOW[kind];
  if (projecting){
    const Q = under(F, T(x, y, w/2+.1, PI/2));
    plant(kind, Q, 0, 0, 0, 1, 'c', true);
    box(M.metalDark, F, x, y+h/2+.03, w/2+.06, .04, .04, w+.14);
    glow(F, x, y, w/2+.1, col, .8+h*.8);
  } else {
    plant(kind, F, x, y, .07, 1, 'c', true);
    glow(F, x, y, .3, col, .8+Math.max(w,h)*.7);
  }
}

function faceExtras(st,F,L,h,lot,firstChunk){
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
  const run = 1.3, ang = Math.atan2(lift, run);
  box(M.concL, P0, W/2-.35, deckY+lift/2, (Dd+.3)/2+.25, .3, .06, Math.hypot(run, lift), ang);
  box(M.frame, P0, W/2-.5, deckY+lift/2+.28, (Dd+.3)/2+.25, .03, .03, Math.hypot(run, lift), ang);
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
function pipeRun(mat, P, pts, r, flanges = true){
  for (let k=0; k<pts.length - 1; k++){
    const [ax, ay, az] = pts[k], [bx, by, bz] = pts[k + 1];
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
function wordSign(F, kind, x, y, z, k, col){ box(M.frame, F, x, y, z - .03, SPR.size[kind][0]/PX*k + .06, SPR.size[kind][1]/PX*k + .06, MIN_T); plant(kind, F, x, y, z, k, 'c', true); glow(F, x, y, z + .25, col, 1.2 + k); }
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
  wordSign(under(Ff, T(-.1, 0, .02, 0)), 'sign_w_scrap', 0, 1.5, .1, 1.0, 'cyan');
  box(M.inShop2, Ff, -.45, 1.75, .03, .3, .25, MIN_T); box(M.frame, Ff, -.45, 1.75, .06, .32, .03, MIN_T);   // a small lit window up high
  wallLamp(Ff, .55, 1.25);
  // the roof: rusty corrugated, steep, overhanging
  gable(P, h, w, d, .85, M.inRust, .2);
  { const half = d/2 + .2, ang = Math.atan2(.85, half), L = Math.hypot(half, .85);   // ribs running down both slopes (the ridge runs along x)
    for (let x = -w/2 - .15; x <= w/2 + .16; x += .16) for (const s of [-1, 1]) box(M.inRust2, P, x, h + .425 + Math.cos(ang)*.02, s*half/2, MIN_T, MIN_T, L, 0, s*ang); }
  moss(P, -w/4, h + .5, rnd(-.5, .5), 4);
  if (!NO_ROOF){ for (const [x, z] of [[w*.2, -d*.25], [-w*.25, d*.15]]){ const ch = rnd(.6, 1.0); cyl(M.inRust2, P, x, h + .5 + ch/2, z, .07, ch); cyl(M.metalDark, P, x, h + .5 + ch, z, .09, .06); emitters.push(new THREE.Vector3(x, h + .6 + ch, z).applyMatrix4(P)); } }
  // a lean-to on the side, a ladder, a pipe down the wall, junk
  const lx = w/2 + .35;
  box(M.inCorr2, P, lx, .45, .2, .7, .9, 1.1); box(M.inRust, P, lx, .98, .2, .82, .04, 1.2, 0, 0, -.3);
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
  wordSign(Ff, 'sign_w_gear', w*.12, h + .24, .1, 1.0, 'orange');
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
  wordSign(Ff, 'sign_w_repairs', -.05, 1.42, .1, .9, 'cyan');
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
      pipeRun(pick([M.inPipe, M.inRust, M.inPipe2]), P, [[x0, y + .05, z0], [x0, y + up, z0], [x1*rnd(.2, .7), y + up, z0], [x1*rnd(.2, .7), y + up, z0 + rnd(-.2, .2)], [x1, y + up*.5, z0], [x1 + .15, y + up*.5, z0], [x1 + .15, rnd(.3, h - .2), z0]], r, true);
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
  wordSign(Ff, 'sign_w_parts', bx, h - .14, .1, .95, 'blue');
  wallLamp(Ff, -w/2 + .3, 1.1);
  // a conveyor hatch on one side (the belts between buildings come out of these)
  box(M.metalDark, P, w/2 + .03, 1.2, .3, MIN_T, .4, .5);
  // the sawtooth roof: three teeth, steep glazed faces lit from inside
  if (!NO_ROOF || true){
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
  Object.assign(lot, { height: h + .5, floors: 2, occupied: true });
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
  wordSign(Fs, 'sign_w_lube', 0, h - .33, .04, .8, 'amber');
  if (!NO_ROOF){ cyl(M.inRust2, P, w/2 - .25, h + .5, -d/2 + .25, .06, 1.1); cyl(M.metalDark, P, w/2 - .25, h + 1.06, -d/2 + .25, .08, .05); emitters.push(new THREE.Vector3(w/2 - .25, h + 1.15, -d/2 + .25).applyMatrix4(P)); }
  for (let k=0; k<irand(2, 3); k++) pottedPlant(P, w/2 + .1, d/2 - .2 - k*.3, rnd(.8, 1.1));
  if (chance(.6*S.green)) plant(pick(['bushFlower','fern']), P, -w/2 - .1, 0, d/2 - .1, .9);
  Object.assign(lot, { height: h + rise + .1, floors: 1, occupied: true });
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
