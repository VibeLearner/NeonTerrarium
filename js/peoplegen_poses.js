// Neon Terrarium: the pose table of the character generator (peoplegen.js): a pose for every one of the 52 frames of a look. Replaces the first poses of the core (PG.poses[frame] = {...}); runs after
// peoplegen_parts.js and before peoplegen_roles.js. Everything is whole pixels. No Math.random, no Date.
//
// A pose (see PG.skeleton): bob (body down), up (upper body up), lean (upper body forward), headDx (the head shifted: a look up is back one), nearFoot / farFoot [dx from the centre column, lift],
// nearHand / farHand and nearElbow / farElbow [dx, dy] from that arm's shoulder, bend / kneeUp (the knees: forward, raised), nod (head down), swing (coat and hair trail: -1 back .. 1 forward; the
// run goes past -2), sit, extra (device: n on the handheld frames, hand: 'umbrella' on the umbrella frames).
// Feet are 2 wide (columns dx and dx + 1 from the centre column 5); the body's centre is column 4.5, so the feet are centred on it by taking the walk's dx about -0.5.
//
// THE WALK (6 frames: contact, down, pass, contact, down, pass). The planted foot moves back exactly 1 px a frame (the ground, in the sprite's frame), the swing foot goes forward 1 px a frame in the
// air: contact frames 0 and 3 have the feet 3 columns apart (5 wide with the shoes) and the body 1 down; frames 1, 2, 4, 5 have them 1 apart (3 wide) and the body up. STRIDE.walk is 6 px a cycle.
// THE RUN (6 frames): the planted foot moves back 2 px a frame over 2 frames of contact, then both feet are in the air (frames 2 and 5). STRIDE.run is 12 px a cycle.
(() => {
  const F = PG.F, poses = PG.poses;
  const ST = { nearFoot: [1, 0], farFoot: [-1, 0] };   // standing
  const mk = (base, over) => Object.assign({}, base, over);

  // ---------- walk ----------
  // near foot x (dx) and lift for frames 0..5; the far foot is the same half a cycle later
  const wNx = [1, 0, -1, -2, -1, 0], wNl = [0, 0, 0, 0, 1, 1];
  const wFx = [-2, -1, 0, 1, 0, -1], wFl = [0, 1, 1, 0, 0, 0];
  const wHx = [-2, -1, 1, 2, 1, -1];                     // the near hand swings opposite to the near foot (the far hand is the mirror)
  const wHy = k => (wHx[k] > 0 ? 2 : 3);                  // the forward hand is a little raised and the elbow bent
  const wEx = k => Math.round(wHx[k]*.5);
  for (let k = 0; k < 6; k++){
    poses[F.WALK + k] = {
      nearFoot: [wNx[k], wNl[k]], farFoot: [wFx[k], wFl[k]],
      nearHand: [wHx[k], wHy(k)], nearElbow: [wEx(k), 2], farHand: [-wHx[k], wHy((k + 3) % 6)], farElbow: [-wEx(k), 2],
      bob: (k % 3 === 0) ? 1 : 0,
      kneeUp: [wNl[k] ? 1 : 0, wFl[k] ? 1 : 0], bend: 0,
      swing: -Math.cos(2*Math.PI*(k - 1)/6)             // the hem and the hair trail a frame behind the legs
    };
  }

  // ---------- idle (4): a breath, a shift of weight ----------
  poses[F.IDLE + 0] = mk(ST, { nearHand: [0, 3], farHand: [0, 3] });
  poses[F.IDLE + 1] = mk(ST, { bob: 1, nearHand: [0, 3], farHand: [0, 3] });
  poses[F.IDLE + 2] = { nearFoot: [2, 0], farFoot: [-1, 0], bob: 1, nearHand: [1, 3], farHand: [0, 3], nod: 0 };
  poses[F.IDLE + 3] = { nearFoot: [2, 0], farFoot: [-1, 0], bob: 0, nearHand: [1, 3], farHand: [0, 3], nod: 1 };

  // ---------- gesture (6): a talking hand and a nod ----------
  const gx = [3, 3, 4, 3, 4, 3], gy = [1, 0, -1, 0, -1, 1];
  for (let k = 0; k < 6; k++)
    poses[F.SPEC + k] = { nearFoot: (k >= 3 ? [2, 0] : [1, 0]), farFoot: [-1, 0], nearHand: [gx[k], gy[k]], nearElbow: [1, 2], farHand: [0, 3], farElbow: [0, 2],
      nod: (k === 1 || k === 4) ? 1 : 0, bob: (k === 2 || k === 4) ? 0 : 1, lean: (k === 2 || k === 4) ? 1 : 0 };

  // ---------- sitting (4): hands on the knees, a breath (the head dips), a lean in ----------
  poses[F.SIT + 0] = { sit: true, nearHand: [3, 2], farHand: [2, 2] };
  poses[F.SIT + 1] = { sit: true, nod: 1, nearHand: [3, 3], farHand: [2, 3] };
  poses[F.SIT + 2] = { sit: true, nearHand: [3, 2], nearElbow: [2, 3], farHand: [2, 2], headDx: 0, nod: 0 };
  poses[F.SIT + 3] = { sit: true, headDx: 1, nearHand: [3, 2], farHand: [2, 2] };

  // ---------- using a handheld (6): the near arm out in front with the device (pose.extra.device = the frame number), the other hand at the belt ----------
  const uy = [1, 0, 0, 1, 2, 2], un = [0, 0, 0, 0, 1, 1];
  for (let k = 0; k < 6; k++)
    poses[F.USE + k] = { nearFoot: [1, 0], farFoot: [-1, 0], nearHand: [3, uy[k]], nearElbow: [1, 3], farHand: [0, 3], farElbow: [0, 2], nod: un[k], extra: { device: k, item: 'screen' } };

  // ---------- angry (6): both arms up, the fists shaking, leaning in ----------
  const angN = [[3, -3], [4, -2], [3, -3], [4, -2], [3, -3], [4, -2]], angF = [[3, -1], [2, -2], [3, -1], [2, -2], [3, -1], [2, -2]];
  for (let k = 0; k < 6; k++)
    poses[F.ANGRY + k] = { nearFoot: [2, 0], farFoot: [-1, 0], lean: 1, nod: 1, bob: k % 2, nearHand: angN[k], nearElbow: [3, 1], farHand: angF[k], farElbow: [2, 2] };

  // ---------- run (6): contact, push, air, contact, push, air ----------
  const rNx = [2, 0, -2, -3, -1, 1], rNl = [0, 0, 1, 2, 2, 1];
  const rBob = [2, 1, 0, 2, 1, 0];
  const rHx = [-2, -1, 1, 3, 1, -1], rHy = [2, 3, 2, 1, 2, 3], rEx = [-1, 0, 1, 1, 1, 0];   // the near arm: back at contact of the near foot, forward half a cycle later
  for (let k = 0; k < 6; k++){
    const j = (k + 3) % 6;
    poses[F.RUN + k] = {
      nearFoot: [rNx[k], rNl[k]], farFoot: [rNx[j], rNl[j]],
      nearHand: [rHx[k], rHy[k]], nearElbow: [rEx[k], 2], farHand: [rHx[j], rHy[j]], farElbow: [rEx[j], 2],
      lean: 1, bend: 1, kneeUp: [k >= 4 ? 1 : 0, (k >= 1 && k <= 2) ? 1 : 0],
      bob: rBob[k], swing: -2.6 - .5*Math.cos(2*Math.PI*k/6)
    };
  }

  // ---------- the umbrella: the near hand holds the shaft ----------
  // (Nothing rises above the standing height: a breath is the body going DOWN a pixel, so no hat or hair is clipped at the top of the cell.)
  // The hand is nearHand: the shaft is the vertical line through the hand's column (x = nearHand[0]); the hand grips it, the shaft goes 2 px below the hand and up past the head to the canopy.
  const UH = [3, -3], UE = [3, 0];           // held up: hand 3 forward and 3 up from the shoulder, the elbow out front at the shoulder's height
  for (let k = 0; k < 6; k++){
    const w = poses[F.WALK + k];
    poses[F.UWALK + k] = {
      nearFoot: w.nearFoot, farFoot: w.farFoot, farHand: w.farHand, farElbow: w.farElbow, kneeUp: w.kneeUp, bend: 0,
      bob: 0, nearHand: UH, nearElbow: UE, swing: w.swing*.5, nod: 0, extra: { hand: 'umbrella' }
    };
  }
  const up4 = [0, 1, 1, 0];
  for (let k = 0; k < 4; k++){
    const u = up4[k];
    poses[F.UIDLE + k] = { nearFoot: [1, 0], farFoot: [-1, 0], bob: u, nearHand: [UH[0], UH[1] - u], nearElbow: [UE[0], UE[1] - u], farHand: [0, 3], farElbow: [0, 2], extra: { hand: 'umbrella' } };
  }
  // opening: the arm lifts from the hip to the held position over 4 frames, the head tilts back (a look up) in the middle; the last frame is the held pose of UIDLE 0
  const oH = [[1, 2], [3, 0], [3, -2], UH], oE = [[0, 2], [2, 2], [3, 1], UE];
  for (let k = 0; k < 4; k++)
    poses[F.UOPEN + k] = { nearFoot: [1, 0], farFoot: [-1, 0], nearHand: oH[k], nearElbow: oE[k], farHand: [0, 3], farElbow: [0, 2], headDx: (k === 1 || k === 2) ? -1 : 0, nod: 0, extra: { hand: 'umbrella', open: k } };

  // ---------- the doing frames (see P.items in peoplegen.js for what's held) ----------
  // eating standing (4): the bowl at the chest in the far hand, the chopsticks dip and come up to the mouth
  const eN = [[2, 1], [2, 0], [1, -2], [2, 0]], eNod = [1, 0, 0, 0];
  for (let k = 0; k < 4; k++) poses[F.EAT + k] = { nearFoot: [1, 0], farFoot: [-1, 0], nearHand: eN[k], nearElbow: [1, 2], farHand: [2, 1], farElbow: [1, 2], nod: eNod[k], bob: k === 2 ? 1 : 0, extra: { item: 'bowl' } };
  // eating seated (4): the same, on a seat
  for (let k = 0; k < 4; k++) poses[F.SITEAT + k] = { sit: true, nearHand: eN[k], nearElbow: [1, 2], farHand: [2, 1], farElbow: [1, 2], nod: eNod[k], extra: { item: 'bowl' } };
  // crouching to pick something up (4): down, reach, the box in the hands, up again (played once, then CARRYIDLE)
  const cBob = [1, 2, 3, 2], cH = [[1, 4], [2, 5], [2, 5], [2, 3]];
  for (let k = 0; k < 4; k++) poses[F.CROUCH + k] = { nearFoot: [1, 0], farFoot: [-1, 0], bob: cBob[k], lean: 1, bend: k ? 1 : .5, nod: 1, nearHand: cH[k], nearElbow: [1, 2], farHand: [cH[k][0] - 1, cH[k][1]], farElbow: [0, 2],
    extra: null };   // (what comes up in the hands is drawn over them: peoplegen_held.js)
  // walking with a box held at the chest (6): the walk's legs, both hands on the box
  for (let k = 0; k < 6; k++){ const w = poses[F.WALK + k];
    poses[F.CARRY + k] = { nearFoot: w.nearFoot, farFoot: w.farFoot, kneeUp: w.kneeUp, bend: 0, bob: w.bob, swing: w.swing*.6, nearHand: [2, 1], nearElbow: [1, 2], farHand: [1, 1], farElbow: [0, 2] }; }
  for (let k = 0; k < 2; k++) poses[F.CARRYIDLE + k] = { nearFoot: [1, 0], farFoot: [-1, 0], bob: k, nearHand: [2, 1], nearElbow: [1, 2], farHand: [1, 1], farElbow: [0, 2] };
  // walking with something hanging from the lowered near hand (6) and standing with it (2): the near arm still, a little out from the side; the far arm swings
  for (let k = 0; k < 6; k++){ const w = poses[F.WALK + k];
    poses[F.SIDE + k] = Object.assign({}, w, { nearHand: [1, 3], nearElbow: [0, 2] }); }
  for (let k = 0; k < 2; k++) poses[F.SIDEIDLE + k] = { nearFoot: [1, 0], farFoot: [-1, 0], bob: k, nearHand: [1, 3], nearElbow: [0, 2], farHand: [0, 3] };
  // walking with something held up in front in one hand (6) and standing with it (2)
  for (let k = 0; k < 6; k++){ const w = poses[F.WALK + k];
    poses[F.HOLD + k] = Object.assign({}, w, { nearHand: [2, 1], nearElbow: [1, 2] }); }
  for (let k = 0; k < 2; k++) poses[F.HOLDIDLE + k] = { nearFoot: [1, 0], farFoot: [-1, 0], bob: k, nearHand: [2, 1], nearElbow: [1, 2], farHand: [0, 3] };
  // a call on the comm (4): the near hand at the side of the head, the other hand now and then talking
  const kF = [[0, 3], [0, 3], [2, 1], [0, 3]];
  for (let k = 0; k < 4; k++) poses[F.COMM + k] = { nearFoot: [1, 0], farFoot: [-1, 0], nearHand: [-1, -3], nearElbow: [1, 0], farHand: kF[k], farElbow: [0, 2], nod: k === 1 ? 1 : 0, bob: k === 3 ? 1 : 0, extra: { item: 'comm' } };
  // a wave (4): the near arm up, the hand going side to side
  const wv = [[2, -4], [3, -5], [2, -4], [1, -5]];
  for (let k = 0; k < 4; k++) poses[F.WAVE + k] = { nearFoot: [1, 0], farFoot: [-1, 0], nearHand: wv[k], nearElbow: [2, -1], farHand: [0, 3], farElbow: [0, 2] };
  // a hug (2): both arms forward round someone at shoulder height, leaning in
  for (let k = 0; k < 2; k++) poses[F.HUG + k] = { nearFoot: [2, 0], farFoot: [-1, 0], lean: 1, nod: k, nearHand: [3, 0], nearElbow: [2, 1], farHand: [3, -1], farElbow: [2, 0] };
  // handing something over (2): the near arm out with it
  for (let k = 0; k < 2; k++) poses[F.GIVE + k] = { nearFoot: [2, 0], farFoot: [-1, 0], nod: k, nearHand: [3, 1], nearElbow: [2, 1], farHand: [0, 3], farElbow: [0, 2] };
  // watering a plant (4): the can held out and tipped, the water falling on the last three
  for (let k = 0; k < 4; k++) poses[F.WATER + k] = { nearFoot: [1, 0], farFoot: [-1, 0], lean: 1, nod: 1, nearHand: [1, 2], nearElbow: [1, 2], farHand: [0, 3], farElbow: [0, 2], extra: { item: 'can', pour: k } };

  // ---------- STRIDE: how far a planted foot travels in the sprite's own frame over a full 6-frame cycle (measured on the poses above) ----------
  // For each foot, take the pairs of consecutive frames where it is on the ground (lift 0 in both): the foot moves back by (x[k] - x[k+1]); the stride is the mean step times 6.
  const stride = f0 => {
    let sum = 0, n = 0;
    for (let k = 0; k < 6; k++) for (const key of ['nearFoot', 'farFoot']){
      const a = poses[f0 + k][key], b = poses[f0 + (k + 1) % 6][key];
      if (a[1] === 0 && b[1] === 0){ sum += a[0] - b[0]; n++; } }
    return n ? 6*sum/n : 0;
  };
  PG.STRIDE = { walk: stride(F.WALK), run: stride(F.RUN) };
  // the two contact frames' spread (forward-to-back, in pixels) for people.js, if it wants it: the stride is twice the spread for the walk
  PG.GAIT = { walkCps: 1.5, bobWalk: 1, bobRun: 2 };
})();
