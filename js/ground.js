// Neon Terrarium: Streets, sidewalks, bridges and cables between buildings.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- ground: streets, paved sidewalks and terraced elevation ---------- */
const G = {
  asph: toon(0x3e4148), asph2: toon(0x464952), line: toon(0xcfcab8), lineY: toon(0xd9b43a), grout: toon(0x2f3239),
  crack: toon(0x24262c), puddle: toon(0x2a3a55), manhole: toon(0x2c2f36), wall: toon(0x6e737b), wallDark: toon(0x565b63),
};
const TILES = {
  low:  [toon(0x6c6a6e), toon(0x77757a), toon(0x625f66), toon(0x7a6a5e)],
  mid:  [toon(0x8a8c94), toon(0x9a9ca3), toon(0x7f8189), toon(0xa0907c)],
  high: [toon(0xa4a8ae), toon(0xb3b7bc), toon(0x979ba2)],
  ind:  [toon(0x5a5d62), toon(0x64676c), toon(0x52555b)],
};
const SIDE = 2.6, CURB = .08;   // sidewalk size and height; the asphalt street runs in the band around it
// terraced hill: plots nearer a random hill centre sit higher, in steps of about half a floor
function planElevation(lots){
  const hx = rnd(-4,4), hz = rnd(-4,4);
  for (const l of lots){
    const d = Math.hypot(l.x-hx, l.z-hz);
    let e = Math.max(0, Math.round((1.45 - d*.22 + rnd(-.25,.25)) / .45)) * .45;
    if (l.cls === 'ind') e = Math.min(e, .45);
    if (l.plaza) e = 0;
    l.elev = Math.min(e, 1.35);
    l.deck = l.elev > 0 && chance(.35);
    l.base = l.elev + CURB;
  }
}
// a flight of steps running alongside a wall, from the top at one end down to the street
function stairFlight(P, side, top, mat){
  const n = Math.max(2, Math.ceil(top/.11)), run = .13, rise = top/(n+1);
  const Fq = under(P, T(side[0]*(SIDE/2+.16), 0, side[1]*(SIDE/2+.16), Math.atan2(side[0], side[1])));
  const x0 = SIDE/2 - .25;
  for (let i=0;i<n;i++){ const h = top - (i+1)*rise, x = x0 - (i+1)*run; box(mat, Fq, x, h/2, 0, run+.005, h, .3); }
  const len = n*run, ang = Math.atan2(top, len);
  box(M.frame, Fq, x0 - len/2, top/2 + .3, .14, Math.hypot(len, top), .03, .03, 0, 0, ang);
  box(mat, Fq, x0+.1, top/2, 0, .22, top, .3);   // top landing
}
function groundLot(lot){
  const P = T(lot.x, 0, lot.z), e = lot.elev, top = lot.base, tiles = TILES[lot.cls];
  // asphalt street band around the plot, with painted lines on two seams (neighbours paint the others)
  box(chance(.5) ? G.asph : G.asph2, P, 0, .012, 0, LOT, .025, LOT);
  const H2 = LOT/2, mid = (SIDE/2 + LOT/2)/2;
  const lineMat = lot.cls === 'ind' ? G.lineY : G.line;
  for (let t=-H2+.2; t<H2-.1; t+=.42){ box(lineMat, P, H2, .03, t, .045, .045, .2); box(lineMat, P, t, .03, H2, .2, .045, .045); }
  for (const s2 of [-1,1]){ box(lineMat, P, s2*(SIDE/2+.12), .03, 0, .045, .045, SIDE); box(lineMat, P, 0, .03, s2*(SIDE/2+.12), SIDE, .045, .045); }   // kerb-side lines
  if (chance(.35) && lot.cross !== false) for (let t=-.35; t<=.36; t+=.14) box(G.line, P, t, .037, H2, .08, .045, .5);   // crosswalk, only toward a neighbor (at an open edge it hung off the rim)
  if (chance(.6)) cyl(G.manhole, P, mid, .034, rnd(-1,1), .12, .045);
  for (let k=0;k<irand(1,3);k++){ const sx = pick([-1,1]), a = chance(.5); box(G.puddle, P, a?sx*rnd(SIDE/2+.2,H2):rnd(-1.4,1.4), .028, a?rnd(-1.4,1.4):sx*rnd(SIDE/2+.2,H2), rnd(.12,.3), .045, rnd(.1,.25), rnd(0,1)); }
  for (let k=0;k<irand(1,3);k++) box(G.crack, P, rnd(-H2,H2), .033, pick([-1,1])*rnd(SIDE/2+.15,H2), rnd(.2,.5), .045, .045, rnd(-.6,.6));
  // retaining walls or a column deck when the plot is raised
  if (e > 0){
    if (lot.deck){
      box(G.wall, P, 0, e-.06, 0, SIDE, .12, SIDE);
      for (const x of [-1,0,1]) for (const z of [-1,0,1]) if (x||z) box(G.wallDark, P, x*(SIDE/2-.12), (e-.12)/2, z*(SIDE/2-.12), .14, e-.12, .14);
      box(G.grout, P, 0, .03, 0, SIDE-.3, .03, SIDE-.3);
      for (let k=0;k<irand(1,3);k++) box(pick([M.crate, M.rustRed, M.corrBlue]), P, rnd(-.8,.8), .15, rnd(-.8,.8), .3, .3, .3, rnd(0,1));
      if (chance(.6)){ box(pick(LIT_ROOMS), P, rnd(-.5,.5), e*.4, -SIDE/2+.3, .8, e*.6, .05); glow(P, 0, e*.4, -SIDE/2+.4, 'warm', .9); }
    } else {
      box(chance(.5) ? G.wall : G.wallDark, P, 0, e/2, 0, SIDE, e, SIDE);
      for (const [sx,sz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const F = under(P, T(sx*SIDE/2, 0, sz*SIDE/2, Math.atan2(sx, sz)));
        for (let x=-SIDE/2+.1; x<=SIDE/2; x+=.52) box(G.wallDark, F, x, e/2, .04, .1, e, .08);   // pilasters
        if (chance(.5)) box(pick(st_ACC), F, rnd(-.8,.8), rnd(.15, e-.1), .02, rnd(.3,.6), rnd(.15,.3), .045);  // posters and patches
        if (chance(.5*S.green)) plant(hangKind(), F, rnd(-1,1), e+CURB, .05, rnd(.55,.8), 't', true);
        if (chance(.3)) cyl(M.metalDark, F, rnd(-1,1), e/2, .08, .04, e);
      }
    }
    // railing round the top edge, with a gap where the stairs arrive
    const stairSides = [pick([[1,0],[-1,0],[0,1],[0,-1]])];
    if (e > .5 && chance(.5)) stairSides.push(pick([[1,0],[-1,0],[0,1],[0,-1]]));
    for (const [sx,sz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const F = under(P, T(sx*(SIDE/2-.04), top, sz*(SIDE/2-.04), Math.atan2(sx, sz)));
      const gap = stairSides.some(s => s[0]===sx && s[1]===sz);
      const x1 = gap ? SIDE/2-.55 : SIDE/2;
      box(M.frame, F, (-SIDE/2+x1)/2, .3, 0, x1+SIDE/2, .035, .035);
      for (let x=-SIDE/2+.05; x<=x1; x+=.4) box(M.frame, F, x, .15, 0, .03, .3, .03);
    }
    for (const sd of stairSides) stairFlight(P, sd, top, chance(.5) ? G.wall : G.wallDark);
  }
  // raised sidewalk with a curb and a grid of paving tiles, some cracked or missing
  box(G.grout, P, 0, e+CURB/2, 0, SIDE, CURB, SIDE);
  box(M.concL, P, 0, top-.02, SIDE/2-.03, SIDE+.02, .045, .08); box(M.concL, P, 0, top-.02, -SIDE/2+.03, SIDE+.02, .045, .08);
  box(M.concL, P, SIDE/2-.03, top-.02, 0, .08, .045, SIDE+.02); box(M.concL, P, -SIDE/2+.03, top-.02, 0, .08, .045, SIDE+.02);
  const step = .51, n = Math.floor((SIDE-.1)/step);
  for (let i=0;i<n;i++) for (let j=0;j<n;j++){
    if (chance(.05)) continue;
    const tx = (i-(n-1)/2)*step, tz = (j-(n-1)/2)*step;
    box(pick(tiles), P, tx, top+.012+rnd(0,.006), tz, .44, .045, .44);
    if (chance(.08)) box(G.crack, P, tx, top+.04, tz, .3, .045, .045, rnd(0,PI));
  }
  if (chance(.4)) box(G.grout, P, pick([-1,1])*(SIDE/2-.15), top+.03, rnd(-1,1), .12, .045, .2);   // drain grate
  // the commercial streets are the lit ones: a soft warm wash over the street on every side (light only, no halo)
  if (lot.cls === 'mid') for (const [sx, sz] of SIDES4) if (chance(.5)){ const t = rnd(-.9, .9); glow(P, sx*mid + sz*t, rnd(.8, 1.0), sz*mid + sx*t, chance(.6) ? 'spill' : 'spill2', rnd(.75, 1.05)); }   // a pool here and there, not an even wash
  // tactile strip where the crosswalk meets the curb
  box(M.hazard, P, 0, top+.035, SIDE/2-.14, .55, .045, .12);
  // wet stains and moss in the tile gaps
  for (let k=0;k<irand(1,3);k++) box(pick([G.puddle, G.crack]), P, rnd(-1.2,1.2), top+.037, pick([-1,1])*rnd(1.1,1.25), rnd(.1,.25), .045, rnd(.06,.14), rnd(0,PI));
  // moss and weeds lying flat in the tile gaps, mostly toward the sidewalk edges, and now and then a strip of grass along a kerb
  for (let k=0;k<irand(2,4);k++){ const e = pick([-1,1])*rnd(.85,1.15), t = rnd(-1.1,1.1); chance(.5) ? floorSmall(P, e, top+.046, t, rnd(.6,.9)) : floorSmall(P, t, top+.046, e, rnd(.6,.9)); }
  if (chance(.35*S.green)){ const sd = pick(SIDES4); floorPatch(pick(FLOOR_FRINGE), under(P, T(sd[0]*(SIDE/2-.2), 0, sd[1]*(SIDE/2-.2), Math.atan2(sd[0], sd[1]))), rnd(-.6,.6), top+.047, 0, rnd(.75,.95), 0); }
  // street furniture on the sidewalk corners, which the buildings leave free
  for (const [sx,sz] of CORNERS){
    if (!chance(.55*S.clutter+.1)) continue;
    const Pc = under(P, T(sx*(SIDE/2-.17), top+.02, sz*(SIDE/2-.17), pick([0, PI/2])));
    const r = R();
    if (r < .2){ box(M.wood, Pc, 0, .14, 0, .4, .04, .14); box(M.frame, Pc, 0, .07, 0, .34, .14, .1); box(M.wood, Pc, 0, .24, -.06, .4, .12, .03); for (const sx of [-.1, .1]) spotAt(Pc, sx, .16, .01, 'seat', null, [0, 1]); }   // bench
    else if (r < .4){ box(M.concD, Pc, 0, .1, 0, .3, .2, .3); plant(pick(['bush','bushFlower','g_fern2','fern']), Pc, 0, .2, 0, rnd(.55,.75)); }  // planter
    else if (r < .55){ cyl(pick([M.corrBlue, M.teal2, M.frame]), Pc, 0, .13, 0, .08, .26); box(M.frame, Pc, 0, .27, 0, .18, .02, .18); }      // bin
    else if (r < .7){ for (const x of [-.12,0,.12]) box(M.metal, Pc, x, .1, 0, .03, .2, .2); }                                            // bike rack
    else if (r < .85){ for (const x of [-.15,.15]) cyl(M.hazard, Pc, x, .1, 0, .04, .2); }                                               // bollards
    else { box(G.grout, Pc, 0, .01, 0, .3, .045, .3); chance(.55) ? plant(pick(['bonsai','bamboo','bush']), Pc, 0, .02, 0, rnd(.75,.95)) : floorSmall(Pc, 0, .036, 0, .8); }   // tree pit, or one gone to moss
  }
  if (e > 0 && chance(.6*S.green)) for (const [sx,sz] of CORNERS) if (chance(.4)) plant(bigKind(), P, sx*(SIDE/2-.2), top+.03, sz*(SIDE/2-.2), rnd(.6,.8));
}
const st_ACC = [M.corrBlue, M.rustRed, M.hazard, M.cream2, M.teal2];

// island rim: a low railing with gaps, and scattered paving patches and cracks in the open ring
function buildPromenade(lots){
  const inLot = (x,z) => lots.some(l => Math.abs(x-l.x) < LOT/2+.05 && Math.abs(z-l.z) < LOT/2+.05);
  const shades = [TILES.mid[0], TILES.mid[1], TILES.low[3], TILES.mid[3]];
  // a tiled walkway ring around the island's edge, in a two-tone pattern
  for (let r = ISL_R-1.7, row = 0; r < ISL_R-.3; r += .5, row++){
    const n = Math.floor(TAU*r/.5);
    for (let k=0; k<n; k++){
      const a = (k + (row%2)*.5)/n*TAU, x = Math.cos(a)*r, z = Math.sin(a)*r;
      if (inLot(x,z) || chance(.04)) continue;
      box(shades[(k+row)%2 + (chance(.12)?2:0)], I4, x, .014, z, .44, .045, .44, -a);
    }
  }
  // benches, lamps, planters and bins along it, facing out to the view
  for (let a = 0; a < TAU; a += rnd(.18,.3)){
    const r = ISL_R-.95, x = Math.cos(a)*r, z = Math.sin(a)*r;
    if (inLot(x,z)) continue;
    const P = T(x, .04, z, Math.atan2(Math.cos(a), Math.sin(a)));
    const v = R();
    if (v < .3){ box(M.wood, P, 0, .14, 0, .5, .04, .15); box(M.frame, P, 0, .07, 0, .42, .14, .1); box(M.wood, P, 0, .25, -.07, .5, .12, .03); }
    else if (v < .5){ cyl(M.metalDark, P, 0, .6, 0, .03, 1.2); box(M.bulb, P, 0, 1.22, 0, .1, .06, .1); glow(P, 0, 1.18, 0, 'warm', 1.2); }
    else if (v < .75){ box(M.concD, P, 0, .12, 0, .5, .24, .3); for (let q=0;q<2;q++) plant(pick(['bush','bushFlower','g_spread1','g_fern3']), P, rnd(-.15,.15), .24, 0, rnd(.6,.8)); }
    else if (v < .87){ cyl(pick([M.corrBlue, M.teal2]), P, 0, .13, 0, .08, .26); }
    else { vending(P, 0, 0); }
  }
}
function buildRim(lots){
  const inLot = (x,z) => lots.some(l => Math.abs(x-l.x) < LOT/2+.05 && Math.abs(z-l.z) < LOT/2+.05);
  for (let a=0; a<TAU; a+=.12){
    if (chance(.15)) continue;
    const r = ISL_R-.18, x = Math.cos(a)*r, z = Math.sin(a)*r;
    cyl(M.frame, I4, x, .18, z, .025, .36);
    const a2 = a+.12, x2 = Math.cos(a2)*r, z2 = Math.sin(a2)*r;
    box(M.frame, I4, (x+x2)/2, .34, (z+z2)/2, Math.hypot(x2-x, z2-z)+.02, .035, .035, -Math.atan2(z2-z, x2-x));
  }
  for (let k=0;k<160;k++){
    const a = rnd(0,TAU), r = rnd(2, ISL_R-.5), x = Math.cos(a)*r, z = Math.sin(a)*r;
    if (inLot(x,z)) continue;
    const P = T(x,0,z, pick([0, PI/2]) + rnd(-.05,.05));
    if (chance(.7)) box(pick(TILES.mid.concat(TILES.low)), P, 0, .012, 0, .44, .045, .44);
    else box(G.crack, P, 0, .015, 0, rnd(.3,.7), .045, .045, rnd(0,PI));
  }
}

/* ---------- connections between buildings ---------- */
function neighbors(lots){
  const out = [];
  for (const a of lots) for (const b of lots){
    if ((Math.abs(b.x-a.x-LOT)<.01 && b.z===a.z) || (Math.abs(b.z-a.z-LOT)<.01 && b.x===a.x)) if (a.height-a.base>=1.2 && b.height-b.base>=1.2) out.push([a,b]);
  }
  return out;
}
function sagLine(Q,len,y,z,sag,mat,thick=.035){
  const segs = 8, pts = [];
  for (let s=0;s<=segs;s++){ const t=s/segs; pts.push({ x:-len/2+t*len, y:y-sag*Math.sin(PI*t) }); }
  for (let s=0;s<segs;s++){ const a=pts[s], b=pts[s+1];
    box(mat,Q,(a.x+b.x)/2,(a.y+b.y)/2,z,Math.hypot(b.x-a.x,b.y-a.y)+.01,thick,thick,0,0,Math.atan2(b.y-a.y,b.x-a.x)); }
  return pts;
}
const BRIDGE = {
  laundry(Q,len,y,z){
    const pts = sagLine(Q,len,y,z,rnd(.12,.3),M.metalDark);
    const slots = [1,2,3,4,5,6,7].filter(() => chance(.6*S.clutter+.1));
    for (const t of slots){ const p = pts[t]; plant(laundryKind(),Q,p.x+rnd(-.04,.04),p.y,z,.85,'t',true); }
  },
  tube(Q,len,y){
    put(roundedBox(len,.46,.58,.2), pick(D.high.walls), under(Q,T(0,y+.23,0)));
    box(M.winLit,Q,0,y+.27,.29,len*.82,.14,.02); box(M.winLit,Q,0,y+.27,-.29,len*.82,.14,.02);
    box(M.trimCyan,Q,0,y-.01,0,len*.9,.03,.2); glow(Q,-len/4,y-.08,0,'cyan',1); glow(Q,len/4,y-.08,0,'cyan',1);
  },
  covered(Q,len,y){
    box(D.mid.trim,Q,0,y,0,len,.08,.64);
    put(U.prism, pick(D.mid.accent), under(Q, T(0,y+.4,0,PI/2,.8,.3,len)));
    for (const sx of [-1,1]) for (const sz of [-1,1]) cyl(M.wood,Q,sx*len*.32,y+.2,sz*.28,.03,.4);
    for (const sz of [-1,1]) box(M.wood,Q,0,y+.17,sz*.3,len,.03,.03);
    for (const x of [-len/4,len/4]){ sph(M.bulb,Q,x,y+.3,0,.06); glow(Q,x,y+.3,0,'warm',.8); }
  },
  catwalk(Q,len,y){
    box(pick([M.rust,M.metalDark,D.low.accent[0]]),Q,0,y,0,len,.05,.5);
    const rail = pick([M.metal,M.rust,D.low.accent[1]]);
    for (const sz of [-1,1]){
      box(rail,Q,0,y+.3,sz*.24,len,.03,.03);
      for (let x=-len/2+.2; x<len/2; x+=.4) box(M.metalDark,Q,x,y+.15,sz*.24,.03,.3,.03);
    }
    if (chance(.6*S.green)) for (let k=0;k<3;k++) plant(pick(['fern','succulent','moss']),Q,rnd(-len/3,len/3),y+.025,rnd(-.15,.15),rnd(.5,.7));
    if (chance(.5*S.clutter)){ const n=irand(2,3); for (let k=0;k<n;k++) plant(laundryKind(),Q,-len/4+k*(len/2)/Math.max(1,n-1),y-.03,.26,.85,'t',true); }
    sph(M.bulb,Q,0,y-.12,0,.05); glow(Q,0,y-.12,0,'warm',.8);
    if (chance(.5*S.green)) plant(hangKind(),Q,rnd(-len/3,len/3),y-.02,(chance(.5)?1:-1)*.25,rnd(.5,.7),'t',true);
  },
  pipes(Q,len,y){
    box(M.metalDark,Q,0,y-.12,0,len,.04,.36);
    for (let i=0;i<irand(2,3);i++) cyl(pick([M.rust,D.ind.accent[0],M.metal]),Q,0,y+i*.19,rnd(-.14,.14),rnd(.07,.1),len,0,PI/2);
    box(M.neonAmber,Q,0,y-.17,0,.07,.07,.07); glow(Q,0,y-.2,0,'amber',.8);
  },
  // Industrial pipework between two works: one to three round pipes, each running straight across, looping up and
  // over, or jogging sideways, with elbows and flanges; a valve wheel on a loop now and then, the odd leak of steam
  pipework(Q,len,y){
    // Chunky industrial pipework between two works, after the overgrown-pipes reference: one to three pipes, each
    // straight across, looping up and over, or jogging sideways; many have glass sections full of glowing fluid. Copper
    // elbows and collars, valve wheels, a pressure gauge, steam leaks; moss on top, ferns sprouting, vines hanging.
    const zs = [-.3, 0, .3].sort(() => R() - .5), n = irand(1, 3);
    for (let i=0;i<n;i++){
      const z = zs[i], r = rnd(.1, .13), mat = pick([M.inPipe, M.inRust, M.inPipe2, M.rust]), yy = y + i*.08, shape = R(), a = rnd(.2, .42);
      let pts, top = yy;
      if (shape < .35) pts = [[-len/2, yy, z], [len/2, yy, z]];
      else if (shape < .75){ const up = rnd(.4, .75); top = yy + up; pts = [[-len/2, yy, z], [-a, yy, z], [-a, top, z], [a, top, z], [a, yy, z], [len/2, yy, z]]; }
      else { const z2 = Math.max(-.32, Math.min(.32, z + (z > 0 ? -1 : 1)*rnd(.2, .3))); pts = [[-len/2, yy, z], [-a, yy, z], [-a, yy, z2], [len/2, yy, z2]]; }
      pipeRun(mat, Q, pts, r, true, i === 0 ? .85 : .45);
      // a valve wheel on a stem, now and then a gauge
      if (chance(.55)){ const vx = rnd(-len/2 + .3, len/2 - .3), vy = shape >= .35 && shape < .75 && Math.abs(vx) < a ? top : yy;
        cyl(M.metalDark, Q, vx, vy + r + .07, z, .02, .14); put(U.torus, chance(.5) ? M.red2 : mat, under(Q, T(vx, vy + r + .15, z, 0, .26, .26, .26, PI/2)));
        if (chance(.5)){ cyl(M.metalDark, Q, vx + .18, vy + r + .06, z, .015, .12); put(U.cyl16, M.white2, under(Q, T(vx + .18, vy + r + .16, z, 0, .1, .03, .1, PI/2))); } }
      if (chance(.2)) emitters.push(new THREE.Vector3(rnd(-a, a), top + r, z).applyMatrix4(Q));
      // overgrowth: moss along the top, ferns sprouting, vines hanging off the run
      if (chance(.85*S.green)){
        for (let k=0; k<irand(2, 4); k++){ const mx = rnd(-len/2 + .2, len/2 - .2); blob(M.inMoss, Q, mx, yy + r*.85, z, rnd(.07, .11), .45); }
        if (chance(.6)) plant(pick(['fern','g_fern2','bush','succulent']), Q, rnd(-len/3, len/3), yy + r*.9, z, rnd(.5, .7));
        for (let k=0; k<irand(1, 3); k++) plant(pick(['vines','h_ivy','pothos','l_mossroots','h_vine3']), Q, rnd(-len/2 + .2, len/2 - .2), yy - r*.7, z + (z >= 0 ? 1 : -1)*r*.9, rnd(.55, .8), 't', true);
      }
    }
    for (const s of [-1, 1]) box(M.metalDark, Q, s*(len/2 - .3), y - .17, 0, .06, .05, .9);   // hanger straps where they leave the walls
  },
  // A conveyor belt between two works, high enough to walk under: a steel frame on a truss, the belt, side rails
  // in hazard stripes, rollers, a beacon. The crates on it move (see conveyors below); they come out of one wall and
  // go into the other.
  conveyor(Q,len,y){
    const W = .44;
    box(M.metalDark, Q, 0, y - .08, 0, len, .1, W);
    box(M.frame, Q, 0, y - .02, 0, len, .03, W - .1);
    for (const s of [-1, 1]){
      box(M.inRust2, Q, 0, y + .06, s*W/2, len, .06, .04);
      for (let x = -len/2 + .1; x < len/2; x += .3) box(chance(.5) ? M.hazard : M.frame, Q, x, y + .06, s*(W/2 + .005), .14, .065, .04);
    }
    for (let x = -len/2 + .1; x < len/2; x += .2) cyl(M.metal, Q, x, y - .06, 0, .03, W - .02, PI/2);
    for (let x = -len/2 + .15, k = 0; x < len/2 - .3; x += .32, k++) for (const s of [-1, 1]) strut(M.metalDark, Q, x, k % 2 ? y - .13 : y - .34, s*(W/2 - .02), x + .32, k % 2 ? y - .34 : y - .13, s*(W/2 - .02), .035);
    for (const s of [-1, 1]) box(M.metalDark, Q, 0, y - .34, s*(W/2 - .02), len, .04, .04);
    box(M.neonAmber, Q, 0, y + .12, W/2 + .02, .06, .06, .06); glow(Q, 0, y + .15, W/2 + .1, 'amber', .8);
    if (CONV_SINK){ const a = new THREE.Vector3(-len/2, y + .11, 0).applyMatrix4(Q), b = new THREE.Vector3(len/2, y + .11, 0).applyMatrix4(Q); CONV_SINK.push({ a, b, dir: chance(.5) ? 1 : -1, speed: rnd(.22, .34), gap: rnd(.5, .8) }); }
  },
  cables(Q,len,y,st){
    const n = irand(2,4);
    for (let i=0;i<n;i++){
      const yy = y+rnd(-.1,.35), zz = rnd(-.35,.35), sag = rnd(.2,.45);
      const pts = sagLine(Q,len,yy,zz,sag,M.metalDark);
      if (i===0) for (const t of [2,4,6]){ const p=pts[t]; sph(M.bulb,Q,p.x,p.y-.08,zz,.06); glow(Q,p.x,p.y-.08,zz,'warm',.7); }
      else if (i===1 && st.laundry) for (const t of [2,4,6]){ const p=pts[t]; plant(laundryKind(),Q,p.x,p.y,zz,.9,'t',true); }
      else if (i===1 && chance(.6*S.neon)){ const p=pts[4], m=pick(st.neonMats); box(M.metalDark,Q,p.x,p.y-.07,zz,.02,.14,.02); box(m,Q,p.x,p.y-.26,zz,.42,.24,.05); glow(Q,p.x,p.y-.26,zz+.1,NEON_GLOW.get(m),1.1); }
    }
  },
};
// Crates riding the conveyor belts: one instanced batch, moved every frame. Conveyors are noted while a pair is
// built (CONV_SINK); the list in use is rebuilt with the connections (see rebuildConnections in world.js).
let CONV_SINK = null, conveyors = [];
const CONV_MAX = 500, CONV_MESH = new THREE.InstancedMesh(U.box, M.crate, CONV_MAX);
CONV_MESH.count = 0; CONV_MESH.frustumCulled = false; CONV_MESH.receiveShadow = true; CONV_MESH.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(CONV_MESH);
const _cvM = new THREE.Matrix4(), _cvP = new THREE.Vector3(), _cvQ = new THREE.Quaternion(), _cvS = new THREE.Vector3(.22, .2, .24), _cvY = new THREE.Vector3(0, 1, 0);
function setConveyors(list){
  conveyors = list.map(c => { const len = c.a.distanceTo(c.b); return { ...c, len, n: Math.max(1, Math.floor(len/c.gap)), yaw: Math.atan2(-(c.b.z - c.a.z), c.b.x - c.a.x), ph: Math.random() }; });
}
function updateConveyors(t){
  let i = 0;
  for (const c of conveyors){
    _cvQ.setFromAxisAngle(_cvY, c.yaw);
    for (let k=0; k<c.n && i < CONV_MAX; k++){
      let u = ((t*c.speed/c.len + c.ph + k/c.n) % 1 + 1) % 1; if (c.dir < 0) u = 1 - u;
      _cvP.lerpVectors(c.a, c.b, u);
      CONV_MESH.setMatrixAt(i++, _cvM.compose(_cvP, _cvQ, _cvS));
    }
  }
  CONV_MESH.count = i; CONV_MESH.instanceMatrix.needsUpdate = true;
}
function buildConnections(lots){ for (const [a,b] of neighbors(lots)) connectPair(a, b); }
function connectPair(a, b){
  {
    R = mulberry32(hash('pair', Math.round(a.x*10), Math.round(a.z*10), Math.round(b.x*10), Math.round(b.z*10), Math.round(a.height*10), Math.round(b.height*10)));
    const along = b.x !== a.x, Q = T((a.x+b.x)/2, 0, (a.z+b.z)/2, along ? 0 : PI/2);
    const len = LOT-1, top = Math.min(a.height, b.height) - .5, base = Math.max(a.base, b.base);
    const kinds = new Set([a.cls, b.cls]);
    const st = STY[kinds.has('low') ? 'low' : kinds.has('mid') ? 'mid' : a.cls];
    const tries = chance(.4) ? 2 : 1, used = [];
    for (let t=0; t<tries; t++){
      if (!chance(.85)) continue;
      let y = top < base+1.2 ? base+1.1 : rnd(base+1.1, top);
      if (used.some(u => Math.abs(u-y) < .8)) y = used[0] + (used[0]+.9 < top ? .9 : -.9);
      if (y < base+1) continue;
      used.push(y);
      if (kinds.size === 1 && kinds.has('ind') && t === 0 && chance(.5) && top + .5 - base >= 1.9){ BRIDGE.conveyor(Q, len, base + rnd(1.4, Math.min(1.6, top + .05))); used[used.length - 1] = base + 1.45; }
      else if (a.yard || b.yard || kinds.has('ind')) BRIDGE.pipework(Q,len,y);
      else if (top < base+1.2) BRIDGE.cables(Q,len,y+.4,st);
      else if (kinds.has('high')) BRIDGE.tube(Q,len,y);
      else if (kinds.has('low')) (chance(.55) ? BRIDGE.catwalk : BRIDGE.cables)(Q,len,y,st);
      else (chance(.5) ? BRIDGE.covered : BRIDGE.cables)(Q,len,y,st);
    }
    // strings of lanterns across the commercial streets, like the ones round the town square: one to three between
    // two shops, at different heights, some running on a slant; the street under them gets a warm spill of light
    if (kinds.has('mid') && !kinds.has('high') && !kinds.has('ind') && !a.yard && !b.yard && typeof lanternString === 'function'){
      const hiY = Math.max(base + 1.7, Math.min(top + .3, base + 2.9)), n = irand(2, 3);
      for (let t=0; t<n; t++){
        for (let tries=0; tries<5; tries++){
          const y = rnd(base + 1.55, hiY);
          if (used.some(u => Math.abs(u-y) < .3)) continue;
          used.push(y);
          const za = rnd(-.55, .55), zb = chance(.5) ? za : rnd(-.55, .55);
          lanternString(Q, -len/2 - .1, y, za, len/2 + .1, y + rnd(-.15, .15), zb, rnd(.15, .32));
          if (t === 0 && chance(.5)) glow(Q, rnd(-.6, .6), y - .5, (za + zb)/2, 'spill', rnd(.9, 1.2));
          break;
        }
      }
    }
    // washing lines strung between homes: most tenement pairs, some market pairs
    const lines = kinds.has('high') || kinds.has('ind') || a.yard || b.yard ? 0
      : (kinds.has('low') ? irand(1,3) : chance(.3) ? 1 : 0);
    for (let t=0; t<lines; t++){
      if (!chance(.9*S.clutter)) continue;
      for (let tries=0; tries<5; tries++){
        const y = rnd(base+1.2, Math.max(base+1.3, top+.3));
        if (used.some(u => Math.abs(u-y) < .45)) continue;
        used.push(y); BRIDGE.laundry(Q, len+.3, y, rnd(-.35,.35)); break;
      }
    }
  }
}

/* ---------- streets ---------- */
function buildStreets(lots){
  const inLot = (x,z) => lots.some(l => l.occupied && Math.abs(x-l.x) < SIDE/2+.1 && Math.abs(z-l.z) < SIDE/2+.1);
  const nearest = (x,z) => lots.filter(l => l.height > 2.7).sort((a,b) => Math.hypot(a.x-x,a.z-z) - Math.hypot(b.x-x,b.z-z));
  const spots = [];
  for (let i=-3;i<=3;i++) for (let j=-3;j<=3;j++){
    spots.push([i*LOT, j*LOT, true]);                              // intersections
    spots.push([(i+.5)*LOT, j*LOT + pick([-1,1])*.3, false]);     // along streets running one way
    spots.push([i*LOT + pick([-1,1])*.3, (j+.5)*LOT, false]);     // and the other
  }
  for (const [x,z,corner] of spots){
    if (Math.hypot(x,z) > ISL_R-.9 || inLot(x,z)) continue;
    const P = T(x,0,z), roll = corner ? R() : .35 + R()*.65;      // power poles only at intersections
    if (roll < .3){
      // power pole with crossbars, a transformer, and cables sagging to the nearest buildings
      const H = 2.6;
      cyl(M.pole, P, 0, H/2, 0, .045, H);
      for (const [y,w] of [[H-.1,.7],[H-.4,.5]]){ box(M.frame, P, 0, y, 0, w, .05, .05); for (const s of [-1,1]) box(M.cream2, P, s*w/2.2, y+.06, 0, .04, .08, .04); }
      if (chance(.5)) box(M.metal, P, .1, H-.8, 0, .2, .3, .2);
      for (const l of nearest(x,z).slice(0,irand(1,2))){
        const dx = l.x-x, dz = l.z-z, len = Math.hypot(dx,dz);
        const Q = under(P, T(dx/2, 0, dz/2, Math.atan2(-dz, dx)));
        sagLine(Q, len, H-.15, 0, rnd(.3,.6), M.frame, .03);
      }
    } else if (roll < .6){
      // curved street lamp
      cyl(M.metalDark,P,0,.65,0,.03,1.3); box(M.metalDark,P,.12,1.3,0,.26,.03,.03);
      box(M.bulb,P,.24,1.26,0,.12,.05,.1); glow(P,.24,1.2,0,'warm',1.4);
    } else if (roll < .75){
      // standing street sign on a post
      cyl(M.frame,P,0,.55,0,.03,1.1);
      glyphSign(under(P,T(0,0,0,rnd(0,PI))), 0, 1.25, true, false);
    } else if (chance(.6*S.clutter)){
      for (let k=0;k<irand(1,3);k++) cyl(pick([M.rust,M.corrBlue,M.metal,M.hazard]),P,rnd(-.3,.3),.14,rnd(-.3,.3),.1,.28);
      if (chance(.4)) box(M.hazard, P, rnd(-.2,.2), .15, rnd(-.2,.2), .5, .06, .06, rnd(0,PI));
    }
  }
  for (let k=0;k<70;k++){
    const a=rnd(0,TAU), r=rnd(1,ISL_R-.5), x=Math.cos(a)*r, z=Math.sin(a)*r;
    if (inLot(x,z)) continue;
    const P = T(x,0,z,rnd(0,TAU)), roll = R();
    if (roll < .3*S.green){ plant(pick(['fern','succulent','fern','bush']),P,0,0,0,rnd(.75,1)); }
    else if (roll < .3*S.green + .25*S.clutter){ box(M.crate,P,0,.1,0,.22,.2,.22); if (chance(.5)) blob(pick(VEG),P,0,.23,0,.08); }
    else if (roll < .3*S.green + .32*S.clutter && r < ISL_R-1.5){ vending(P, 0, 0); }
    else if (roll < .75 && r > ISL_R-2.2 && chance(.7*S.green)){ for (let q=0;q<2;q++) plant(bigKind(),P,rnd(-.3,.3),0,rnd(-.3,.3),rnd(.8,1.05)); }
  }
}

/* ---------- generate ---------- */
function playgroundGenerate(){
  if (city){ scene.remove(city); city.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
  R = mulberry32(S.seed); buckets = new Map(); emitters = []; carPads = [];
  for (const k in SPR.size) FOL_LIST[k] = [];
  city = new THREE.Group(); glowGroup = new THREE.Group(); city.add(glowGroup);
  buildIsland();
  const lots = planLots();
  lots.forEach(buildLot);
  buildConnections(lots);
  buildRim(lots);
  buildPromenade(lots);
  buildDronePorts(lots);
  buildStreets(lots);
  for (const [mat, b] of buckets){
    const g = bucketGeometry(b);
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = !mat.userData.noCast; mesh.receiveShadow = true;
    city.add(mesh);
  }
  buildFoliage();
  scene.add(city);
  setupSteam();
  resetDrones();
  skyTop = Math.max(8, ...lots.map(l => l.height)) + 2.4;   // clear of rooftop rings, masts and billboards
  resetTrips();
  renderer.shadowMap.needsUpdate = true;
}
