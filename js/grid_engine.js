// Neon Terrarium: the Psycho-Acoustic Grid's sound engine.
// The city planners' broadcast: a generator that makes the whole district's music as it goes, from rules (no recordings).
// Slow carrier chords (the drone), an ambient bed of soft pads, melodic neuro-triggers (motifs and a lead loop that
// improvises over the chords), grain clouds (mosaic, haze and glitch-arp) and tape and rain texture, all through one
// master gain the game controls (volume, fades, the Overseer's hold). It is the Microcosm generator, kept in one sealed
// function so nothing here can collide with the game's own names (every value it needs from the page is looked up through
// $g, by an id starting with g-, from the Acoustic Panel in grid_panel.js).
// Loaded after grid_panel.js (which builds the panel it reads from) and before grid.js (which drives it).
// Plain, non-strict script on purpose (it was written as one).
const GRID_ENGINE = (() => {
const _gstub = {};
// a control that isn't on the panel gets a quiet stand-in, so the engine never trips over a missing one
const $g = id => document.getElementById('g-' + id) || (_gstub[id] || (_gstub[id] = Object.assign(document.createElement('input'), { value: '0' })));

const SEMI_MAP = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: -1, Fb: 4, 'E#': 5, 'B#': 12 };   // Cb, Fb, E# and B# spell the notes of a few chords (Abm11 has a Cb)

function n2f(noteStr) {
  const match = /^([A-G][b#]?)(-?\d+)$/.exec(noteStr.trim());
  if (!match) return 220;
  const semitone = SEMI_MAP[match[1]];
  const octave = parseInt(match[2], 10);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 8 Curated 8-Chord Progressions with Deep Drone Voicings & High FACGCE / Lo-Fi Motif Extensions
const PROGRESSIONS = [
  {
    title: 'Midwest Sunset (FACGCE Open)',
    chords: [
      { name: 'Fmaj9', mood: 'Warm Open Twinkle', notes: ['F2', 'C3', 'A3', 'E4', 'G4'], motif: ['A4', 'C5', 'E5', 'G5'] },
      { name: 'C6/9', mood: 'Nostalgic Ring', notes: ['C2', 'G2', 'E3', 'A3', 'D4'], motif: ['G4', 'A4', 'C5', 'E5'] },
      { name: 'Dm11', mood: 'Wistful Suspension', notes: ['D2', 'A2', 'F3', 'C4', 'G4'], motif: ['A4', 'C5', 'F5', 'G5'] },
      { name: 'Bbmaj7#11', mood: 'Lydian Horizon', notes: ['Bb1', 'F2', 'D3', 'A3', 'E4'], motif: ['A4', 'C5', 'D5', 'E5'] },
      { name: 'Am11', mood: 'Reflective Dusk', notes: ['A1', 'E2', 'G3', 'C4', 'D4'], motif: ['G4', 'C5', 'D5', 'E5'] },
      { name: 'Gm9', mood: 'Velvet Drift', notes: ['G1', 'D2', 'Bb2', 'F3', 'A3'], motif: ['F4', 'A4', 'C5', 'D5'] },
      { name: 'Csus4/9', mood: 'Airy Resolve', notes: ['C2', 'G2', 'F3', 'D4', 'E4'], motif: ['G4', 'C5', 'D5', 'F5'] },
      { name: 'Fmaj13', mood: 'Golden Afterglow', notes: ['F2', 'A2', 'D3', 'G3', 'E4'], motif: ['A4', 'D5', 'E5', 'G5'] }
    ]
  },
  {
    title: 'Tape Memories (Nostalgic Lo-Fi)',
    chords: [
      { name: 'Ebmaj9', mood: 'Dusty Cassette Glow', notes: ['Eb2', 'Bb2', 'G3', 'D4', 'F4'], motif: ['G4', 'Bb4', 'D5', 'F5'] },
      { name: 'Dm7b5', mood: 'Bittersweet Memory', notes: ['D2', 'Ab2', 'C3', 'F3', 'C4'], motif: ['F4', 'Ab4', 'C5', 'D5'] },
      { name: 'Cm11', mood: 'Rain on Glass', notes: ['C2', 'G2', 'Eb3', 'Bb3', 'F4'], motif: ['G4', 'Bb4', 'D5', 'Eb5'] },
      { name: 'Bbmaj13', mood: 'Warm Lamp Light', notes: ['Bb1', 'F2', 'D3', 'G3', 'C4'], motif: ['F4', 'A4', 'C5', 'D5'] },
      { name: 'Abmaj9', mood: 'Floating Polaroid', notes: ['Ab1', 'Eb2', 'C3', 'G3', 'Bb3'], motif: ['G4', 'Bb4', 'C5', 'Eb5'] },
      { name: 'Gm11', mood: 'Quiet Porch', notes: ['G1', 'D2', 'Bb2', 'F3', 'C4'], motif: ['F4', 'A4', 'Bb4', 'D5'] },
      { name: 'Fm9', mood: 'Late Night Vinyl', notes: ['F1', 'C2', 'Ab2', 'Eb3', 'G3'], motif: ['Eb4', 'G4', 'Ab4', 'C5'] },
      { name: 'Bb13sus4', mood: 'Gentle Exhale', notes: ['Bb1', 'F2', 'Eb3', 'Ab3', 'C4'], motif: ['F4', 'G4', 'C5', 'Eb5'] }
    ]
  },
  {
    title: 'Holographic Drift (Lydian Space)',
    chords: [
      { name: 'Dmaj9#11', mood: 'Zero-Gravity Bloom', notes: ['D2', 'A2', 'F#3', 'C#4', 'G#4'], motif: ['A4', 'C#5', 'E5', 'G#5'] },
      { name: 'Aadd9/C#', mood: 'Starlight Glide', notes: ['C#2', 'A2', 'E3', 'B3', 'C#4'], motif: ['A4', 'B4', 'C#5', 'E5'] },
      { name: 'Bm11', mood: 'Deep Nebula', notes: ['B1', 'F#2', 'D3', 'A3', 'E4'], motif: ['F#4', 'A4', 'D5', 'E5'] },
      { name: 'Gmaj13#11', mood: 'Prism Aurora', notes: ['G1', 'D2', 'B2', 'F#3', 'C#4'], motif: ['F#4', 'A4', 'B4', 'E5'] },
      { name: 'Em9', mood: 'Orbital Solitude', notes: ['E2', 'B2', 'G3', 'D4', 'F#4'], motif: ['G4', 'B4', 'D5', 'F#5'] },
      { name: 'F#m11', mood: 'Crystalline Tail', notes: ['F#2', 'C#3', 'A3', 'E4', 'B4'], motif: ['A4', 'C#5', 'E5', 'F#5'] },
      { name: 'Cmaj9#11', mood: 'Solar Wind', notes: ['C2', 'G2', 'E3', 'B3', 'F#4'], motif: ['G4', 'B4', 'D5', 'F#5'] },
      { name: 'Asus2/13', mood: 'Docking Calm', notes: ['A1', 'E2', 'B2', 'F#3', 'C#4'], motif: ['E4', 'A4', 'B4', 'F#5'] }
    ]
  },
  {
    title: 'Autumn in Minnesota (Math-Rock)',
    chords: [
      { name: 'Am11', mood: 'Crisp October Air', notes: ['A1', 'E2', 'C3', 'G3', 'D4'], motif: ['G4', 'A4', 'C5', 'E5'] },
      { name: 'Fmaj9#11', mood: 'Amber Leaves', notes: ['F2', 'C3', 'A3', 'E4', 'B4'], motif: ['A4', 'B4', 'C5', 'E5'] },
      { name: 'Cmaj9/G', mood: 'Open Highway', notes: ['G1', 'C2', 'E3', 'B3', 'D4'], motif: ['G4', 'B4', 'C5', 'E5'] },
      { name: 'Em7add11', mood: 'Pine Canopy', notes: ['E2', 'B2', 'G3', 'A3', 'D4'], motif: ['G4', 'A4', 'B4', 'D5'] },
      { name: 'Dm9', mood: 'Fading Daylight', notes: ['D2', 'A2', 'F3', 'C4', 'E4'], motif: ['A4', 'C5', 'D5', 'F5'] },
      { name: 'G6/9', mood: 'Distant Train', notes: ['G1', 'D2', 'B2', 'E3', 'A3'], motif: ['G4', 'A4', 'B4', 'E5'] },
      { name: 'F6add9', mood: 'Campfire Ember', notes: ['F2', 'C3', 'A3', 'D4', 'G4'], motif: ['A4', 'C5', 'D5', 'G5'] },
      { name: 'Esus4/7', mood: 'Starlit Return', notes: ['E2', 'B2', 'D3', 'A3', 'E4'], motif: ['A4', 'B4', 'D5', 'E5'] }
    ]
  },
  {
    title: 'Midnight Study Session (Jazz-Hop)',
    chords: [
      { name: 'Fm9', mood: 'Espresso Steam', notes: ['F2', 'C3', 'Ab3', 'Eb4', 'G4'], motif: ['Ab4', 'C5', 'Eb5', 'G5'] },
      { name: 'Bb13sus4', mood: 'Vinyl Groove', notes: ['Bb1', 'F2', 'Ab3', 'C4', 'G4'], motif: ['F4', 'Ab4', 'C5', 'D5'] },
      { name: 'Ebmaj9', mood: 'Warm Rhodes', notes: ['Eb2', 'Bb2', 'G3', 'D4', 'F4'], motif: ['G4', 'Bb4', 'D5', 'F5'] },
      { name: 'Cm9', mood: 'City Lights', notes: ['C2', 'G2', 'Eb3', 'Bb3', 'D4'], motif: ['G4', 'Bb4', 'C5', 'Eb5'] },
      { name: 'Dbmaj9#11', mood: 'Lo-Fi Daydream', notes: ['Db2', 'Ab2', 'F3', 'C4', 'G4'], motif: ['F4', 'Ab4', 'C5', 'Eb5'] },
      { name: 'Bbm11', mood: 'Page Turn', notes: ['Bb1', 'F2', 'Db3', 'Ab3', 'Eb4'], motif: ['F4', 'Ab4', 'Db5', 'Eb5'] },
      { name: 'Gm7b5', mood: 'Subtle Tension', notes: ['G1', 'Db2', 'F2', 'Bb2', 'F3'], motif: ['F4', 'Bb4', 'Db5', 'F5'] },
      { name: 'C7b9#5', mood: 'Velvet Turnaround', notes: ['C2', 'E2', 'Ab2', 'Bb2', 'Db3'], motif: ['E4', 'Ab4', 'Bb4', 'Db5'] }
    ]
  },
  {
    title: 'Starlight Cascades (Dream-Pop)',
    chords: [
      { name: 'Gbmaj9', mood: 'Celestial Veil', notes: ['Gb2', 'Db3', 'Bb3', 'F4', 'Ab4'], motif: ['Bb4', 'Db5', 'F5', 'Ab5'] },
      { name: 'Fm11', mood: 'Silver Comet', notes: ['F2', 'C3', 'Ab3', 'Eb4', 'Bb4'], motif: ['Ab4', 'C5', 'Eb5', 'F5'] },
      { name: 'Ebm11', mood: 'Nocturnal Tide', notes: ['Eb2', 'Bb2', 'Gb3', 'Db4', 'Ab4'], motif: ['Gb4', 'Bb4', 'Db5', 'F5'] },
      { name: 'Dbmaj9', mood: 'Warm Sanctuary', notes: ['Db2', 'Ab2', 'F3', 'C4', 'Eb4'], motif: ['F4', 'Ab4', 'C5', 'Eb5'] },
      { name: 'Bmaj9#11', mood: 'Mirage Shimmer', notes: ['B1', 'F#2', 'D#3', 'A#3', 'F4'], motif: ['F#4', 'A#4', 'C#5', 'D#5'] },
      { name: 'Bbm7add11', mood: 'Drifting Feather', notes: ['Bb1', 'F2', 'Db3', 'Ab3', 'Eb4'], motif: ['F4', 'Ab4', 'C5', 'Db5'] },
      { name: 'Abm11', mood: 'Deep Lagoon', notes: ['Ab1', 'Eb2', 'Cb3', 'Gb3', 'Db4'], motif: ['Gb4', 'Ab4', 'Bb4', 'Db5'] },
      { name: 'Db13sus4', mood: 'Horizon Glow', notes: ['Db2', 'Ab2', 'Gb3', 'B3', 'Eb4'], motif: ['F4', 'Ab4', 'Bb4', 'Eb5'] }
    ]
  },
  {
    title: 'Suburban Stargazing (Midwest Emo II)',
    chords: [
      { name: 'Cmaj9', mood: 'Rooftop Telescope', notes: ['C2', 'G2', 'E3', 'B3', 'D4'], motif: ['G4', 'B4', 'C5', 'E5'] },
      { name: 'Am11', mood: 'Streetlight Halo', notes: ['A1', 'E2', 'C3', 'G3', 'D4'], motif: ['A4', 'C5', 'D5', 'E5'] },
      { name: 'Fmaj7#11', mood: 'Meteor Trail', notes: ['F2', 'C3', 'A3', 'E4', 'B4'], motif: ['A4', 'B4', 'C5', 'G5'] },
      { name: 'G6add9', mood: 'Summer Breeze', notes: ['G1', 'D2', 'B2', 'E3', 'A3'], motif: ['G4', 'A4', 'B4', 'D5'] },
      { name: 'Em11', mood: 'Quiet Cul-De-Sac', notes: ['E2', 'B2', 'G3', 'D4', 'A4'], motif: ['G4', 'A4', 'B4', 'E5'] },
      { name: 'Dm11', mood: 'Long Shadow', notes: ['D2', 'A2', 'F3', 'C4', 'G4'], motif: ['F4', 'A4', 'C5', 'E5'] },
      { name: 'Bbadd9', mood: 'Wistful Lift', notes: ['Bb1', 'F2', 'D3', 'C4', 'F4'], motif: ['F4', 'A4', 'C5', 'D5'] },
      { name: 'Gsus4/13', mood: 'Homeward Resolve', notes: ['G1', 'D2', 'C3', 'E3', 'A3'], motif: ['G4', 'A4', 'C5', 'E5'] }
    ]
  },
  {
    title: 'Cassette Nebula (Ambient Drone)',
    chords: [
      { name: 'Bmaj9#11', mood: 'Deep Space Cathedral', notes: ['B1', 'F#2', 'D#3', 'A#3', 'F4'], motif: ['F#4', 'A#4', 'C#5', 'D#5'] },
      { name: 'F#add9/A#', mood: 'Slow Pulsar', notes: ['A#1', 'F#2', 'C#3', 'G#3', 'A#3'], motif: ['F#4', 'G#4', 'A#4', 'C#5'] },
      { name: 'G#m11', mood: 'Interstellar Dust', notes: ['G#1', 'D#2', 'B2', 'F#3', 'C#4'], motif: ['F#4', 'G#4', 'B4', 'D#5'] },
      { name: 'Emaj9#11', mood: 'Ion Tail', notes: ['E2', 'B2', 'G#3', 'D#4', 'A#4'], motif: ['G#4', 'B4', 'D#5', 'F#5'] },
      { name: 'C#m11', mood: 'Frozen Orbit', notes: ['C#2', 'G#2', 'E3', 'B3', 'F#4'], motif: ['E4', 'G#4', 'B4', 'C#5'] },
      { name: 'D#m7b5', mood: 'Event Reflection', notes: ['D#2', 'A2', 'C#3', 'F#3', 'C#4'], motif: ['F#4', 'A4', 'C#5', 'D#5'] },
      { name: 'Emaj13', mood: 'Radiant Halo', notes: ['E2', 'B2', 'G#3', 'C#4', 'F#4'], motif: ['G#4', 'B4', 'C#5', 'E5'] },
      { name: 'F#13sus4', mood: 'Eternal Drift', notes: ['F#1', 'C#2', 'B2', 'E3', 'D#4'], motif: ['F#4', 'G#4', 'B4', 'D#5'] }
    ]
  },
  {
    title: 'Solar Canopy (Neon Garden)',
    chords: [
      { name: 'Amaj9', mood: 'Greenhouse Sunrise', notes: ['A1', 'E2', 'C#3', 'G#3', 'B3'], motif: ['B4', 'C#5', 'E5', 'G#5'] },
      { name: 'F#m9', mood: 'Rooftop Garden', notes: ['F#1', 'C#2', 'A2', 'E3', 'G#3'], motif: ['A4', 'C#5', 'E5', 'G#5'] },
      { name: 'Dmaj7#11', mood: 'Solar Panel Shimmer', notes: ['D2', 'A2', 'F#3', 'C#4', 'G#4'], motif: ['A4', 'C#5', 'F#5', 'G#5'] },
      { name: 'E6/9', mood: 'Wind Turbine Hum', notes: ['E2', 'B2', 'G#3', 'C#4', 'F#4'], motif: ['G#4', 'B4', 'C#5', 'F#5'] },
      { name: 'Amaj7/C#', mood: 'Canopy Light', notes: ['C#2', 'A2', 'E3', 'G#3', 'B3'], motif: ['G#4', 'B4', 'C#5', 'E5'] },
      { name: 'B6/9', mood: 'Drone Pollinators', notes: ['B1', 'F#2', 'G#3', 'C#4', 'D#4'], motif: ['G#4', 'C#5', 'D#5', 'F#5'] },
      { name: 'Dmaj9', mood: 'Vertical Farm Glow', notes: ['D2', 'A2', 'F#3', 'C#4', 'E4'], motif: ['A4', 'C#5', 'E5', 'F#5'] },
      { name: 'Esus4/9', mood: 'Open Skyline', notes: ['E2', 'B2', 'A3', 'F#4', 'B4'], motif: ['A4', 'B4', 'E5', 'F#5'] }
    ]
  },
  {
    title: 'Porch Light Loop (Math-Rock Emo)',
    chords: [
      { name: 'Gmaj9', mood: 'Porch Light On', notes: ['G1', 'D2', 'B2', 'F#3', 'A3'], motif: ['B4', 'D5', 'F#5', 'A5'] },
      { name: 'Em9', mood: 'Screen Door Summer', notes: ['E2', 'B2', 'G3', 'D4', 'F#4'], motif: ['G4', 'B4', 'D5', 'F#5'] },
      { name: 'Cmaj9', mood: 'Basement Show Glow', notes: ['C2', 'G2', 'E3', 'B3', 'D4'], motif: ['G4', 'B4', 'D5', 'E5'] },
      { name: 'D6/9', mood: 'Parking Lot Sunrise', notes: ['D2', 'A2', 'F#3', 'B3', 'E4'], motif: ['F#4', 'A4', 'B4', 'E5'] },
      { name: 'Bm11', mood: 'Long Drive Home', notes: ['B1', 'F#2', 'D3', 'A3', 'E4'], motif: ['F#4', 'A4', 'D5', 'E5'] },
      { name: 'Am9', mood: 'Kitchen Table Chords', notes: ['A1', 'E2', 'C3', 'G3', 'B3'], motif: ['G4', 'B4', 'C5', 'E5'] },
      { name: 'Cmaj7#11', mood: 'Skylight Lift', notes: ['C2', 'G2', 'E3', 'B3', 'F#4'], motif: ['G4', 'B4', 'E5', 'F#5'] },
      { name: 'Dadd9', mood: 'Last Song Of The Night', notes: ['D2', 'A2', 'F#3', 'A3', 'E4'], motif: ['F#4', 'A4', 'D5', 'E5'] }
    ]
  }
];

// --- MOTIF-TO-DRONE VOICE FITTING ---
// The motif arrays were written by hand. For every chord, re-pick the four motif notes from the pitch
// classes the drone itself is sounding, staying as close to the original notes as possible, so a plucked
// note always lands on a tone the pad already holds. Close semitone and ninth rubs against the upper drone
// voices are avoided, and the two double-stop pairs (1st+3rd, 2nd+4th) are kept consonant.
function noteToMidi(noteStr) {
  const m = /^([A-G][b#]?)(-?\d+)$/.exec(noteStr.trim());
  return m ? (parseInt(m[2], 10) + 1) * 12 + SEMI_MAP[m[1]] : 69;
}
function midiToNoteName(m, useSharps) {
  const names = useSharps ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] : ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
function fitMotifToDrone(chord) {
  const drone = chord.notes.map(noteToMidi);
  const pcs = new Set(drone.map(m => ((m % 12) + 12) % 12));
  const upper = drone.filter(m => m >= 48);
  const orig = chord.motif.map(noteToMidi);
  const cands = orig.map(o => {
    const arr = [];
    for (let m = Math.max(64, o - 8); m <= Math.min(84, o + 8); m++) if (pcs.has(m % 12)) arr.push(m);
    return arr.length ? arr : [o];
  });
  const bad = [1, 2, 6, 10, 11];
  let best = null, bestCost = Infinity;
  const pick = [];
  const search = distinct => (function walk(i, cost) {
    if (cost >= bestCost) return;
    if (i === cands.length) {
      if (bad.includes((pick[2] - pick[0]) % 12)) cost += 4;
      if (bad.includes((pick[3] - pick[1]) % 12)) cost += 4;
      if (cost < bestCost) { bestCost = cost; best = pick.slice(); }
      return;
    }
    for (const m of cands[i]) {
      if (distinct ? pick.slice(0, i).some(p => p % 12 === m % 12) : (i > 0 && m % 12 === pick[i - 1] % 12)) continue;
      let c = cost + Math.abs(m - orig[i]);
      upper.forEach(d => {
        const gap = Math.abs(m - d);
        if (gap === 1 || gap === 11 || gap === 13) c += 5;
        else if (gap === 6 || gap === 18) c += 1;
      });
      pick[i] = m; walk(i + 1, c);
    }
  })(0, 0);
  search(true);
  if (!best) search(false);
  const sharps = chord.notes.some(n => n.includes('#'));
  return best ? best.map(m => midiToNoteName(m, sharps)) : chord.motif.slice();
}
PROGRESSIONS.forEach(p => p.chords.forEach(c => { c.fit = fitMotifToDrone(c); }));

// Every progression opens on a major chord: one that starts on a minor or suspended chord is turned (same chords, same
// order around the loop) so it begins on its first major chord.
const isMajorChord = c => /^[A-G][b#]?(maj|6|add)/.test(c.name);
PROGRESSIONS.forEach(p => {
  if (!isMajorChord(p.chords[0])) { const k = p.chords.findIndex(isMajorChord); if (k > 0) p.chords = p.chords.slice(k).concat(p.chords.slice(0, k)); }
});

// GRAND TOUR: every chord from every progression in one loop, ordered so each move changes as little as possible.
// The distance between two chords is how far their pitch classes have to travel (both ways) plus a little for the root;
// the order is a nearest-neighbor walk from a major chord, tightened by 2-opt so the whole loop is smooth, including its return.
(function buildGrandTour() {
  const seen = new Set(), all = [];
  PROGRESSIONS.forEach(p => p.chords.forEach(c => { const k = c.name + '|' + c.notes.join(','); if (!seen.has(k)) { seen.add(k); all.push(c); } }));
  const pc = n => ((noteToMidi(n) % 12) + 12) % 12, circ = (a, b) => { const x = Math.abs(a - b) % 12; return Math.min(x, 12 - x); };
  const sets = all.map(c => Array.from(new Set(c.notes.map(pc)))), roots = all.map(c => pc(c.notes[0]));
  const half = (X, Y) => X.reduce((sum, x) => sum + Math.min(...Y.map(y => circ(x, y))), 0);
  const D = all.map((_, i) => all.map((__, j) => half(sets[i], sets[j]) + half(sets[j], sets[i]) + 0.35 * circ(roots[i], roots[j])));
  let start = all.findIndex(c => c.name === 'Fmaj9'); if (start < 0) start = all.findIndex(isMajorChord);
  const order = [start], left = new Set(all.map((_, i) => i)); left.delete(start);
  while (left.size) {
    const last = order[order.length - 1]; let best = -1, bd = Infinity;
    left.forEach(j => { if (D[last][j] < bd) { bd = D[last][j]; best = j; } });
    order.push(best); left.delete(best);
  }
  const n = order.length, edge = (a, b) => D[order[a % n]][order[b % n]];
  for (let pass = 0, improved = true; improved && pass < 30; pass++) {
    improved = false;
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const before = edge(i - 1, i) + edge(j, j + 1), after = D[order[i - 1]][order[j]] + D[order[i]][order[(j + 1) % n]];
      if (after < before - 1e-9) { order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse()); improved = true; }
    }
  }
  PROGRESSIONS.push({ title: 'Grand Tour (Every Chord, Smoothly Linked)', chords: order.map(i => all[i]) });
})();



// --- 2. GLOBAL ENGINE STATE ---
let ctx = null;
let isPlaying = false;
let isFrozen = false;
let markovDrift = false;
let microcosmMode = 'MOSAIC'; // 'MOSAIC' | 'HAZE' | 'ARP'

// Master Tempo (BPM) & Subdivision Clock State
let masterBpm = 82;
let currentSubdiv = '1/8'; // '1/4' | '1/8.' | '1/8' | '1/8T' | '1/16'
let quantizeMotifs = true;
let tapTimes = [];
let beatStepCount = 0; // Counts sixteenth-note ticks (16 per 4/4 bar)
let nextTickTime = 0;
let masterClockTimer = null;
let lastBeatPulseAlpha = 0;
let lastBeatIsDownbeat = false;
let queuedMotifRequest = null;
let lastChordChangeAt = 0;

let currentProgIdx = 0;
let currentChordIdx = 0;
let activeChordOverride = null;   // the chord that is actually sounding while a transition is running
let transition = null;            // { plan, i, beatsLeft, landed } while bridge chords connect two progressions
const getActiveChord = () => activeChordOverride || PROGRESSIONS[currentProgIdx].chords[currentChordIdx];

// Audio Buses & Master Nodes
let masterCompressor, warmthFilter, tapeDelayNode, wowLFO, wowGain;
let droneMasterBus, motifMasterBus, granularBus, reverbConvolver, reverbWetGain, crossDelayL, crossDelayR, delayFeedbackGain;
let hazePanLFO, hazeFilterLFO, hazeFilterNode;
let vinylNoiseNode, vinylGainNode, analyser, gridOut = null, gridVol = 0;

// Active Drone Voice Tracking (for smooth 4-second crossfades)
let activeDronePatch = null;

// Timers
let chordCycleInterval = null;
let chordElapsedSeconds = 0;
let motifSchedulerTimeout = null;
let dustPopTimeout = null;

// Subdivision Multipliers relative to 1 Quarter Note (60 / BPM)
const SUBDIV_FACTORS = {
  '1/4':  { primary: 1.0,      secondary: 1.5,     label: '1/4 + DOTTED 1/4' },
  '1/8.': { primary: 0.75,     secondary: 0.5,     label: 'DOTTED 1/8 + 1/8' },
  '1/8':  { primary: 0.5,      secondary: 0.75,    label: '1/8 NOTE + DOTTED' },
  '1/8T': { primary: 1 / 3,    secondary: 2 / 3,   label: '1/8 TRIPLET + 1/4T' },
  '1/16': { primary: 0.25,     secondary: 1 / 3,   label: '1/16 + 1/8 TRIPLET' }
};

// Visualizer Entities
const constellationNodes = [];
const granularHalos = [];
const vinylDustSpecs = [];
for (let i = 0; i < 55; i++) {
  vinylDustSpecs.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.6 + 0.4,
    vx: (Math.random() - 0.5) * 0.25,
    vy: -Math.random() * 0.35 - 0.1,
    alpha: Math.random() * 0.45 + 0.1
  });
}

// --- 2B. TEMPO & SUBDIVISION TIMING CALCULATOR ---
function getQuarterNoteSec() {
  return 60.0 / masterBpm;
}

function getSubdivSeconds(subdivKey = currentSubdiv) {
  const q = getQuarterNoteSec();
  const entry = SUBDIV_FACTORS[subdivKey] || SUBDIV_FACTORS['1/8'];
  return {
    quarter: q,
    primary: q * entry.primary,
    secondary: q * entry.secondary,
    triplet8: q / 3,
    sixteenth: q * 0.25,
    thirtySecond: q * 0.125,
    half: q * 2.0,
    whole: q * 4.0,
    dottedQuarter: q * 1.5
  };
}

function syncAudioNodesToTempo() {
  const times = getSubdivSeconds(currentSubdiv);
  const entry = SUBDIV_FACTORS[currentSubdiv] || SUBDIV_FACTORS['1/8'];

  const msL = Math.round(times.primary * 1000);
  const msR = Math.round(times.secondary * 1000);
  const delayReadout = $g('delaySyncReadout');
  if (delayReadout) {
    delayReadout.textContent = `L: ${msL}ms · R: ${msR}ms`;
  }
  const ratioLabel = $g('subdivRatioLabel');
  if (ratioLabel) {
    ratioLabel.textContent = entry.label;
  }

  updateGranularTelemetryBanner();

  if (!ctx) return;
  const now = ctx.currentTime;

  if (crossDelayL && crossDelayR) {
    const clampedL = Math.min(3.8, Math.max(0.04, times.primary));
    const clampedR = Math.min(3.8, Math.max(0.04, times.secondary));
    crossDelayL.delayTime.setTargetAtTime(clampedL, now, 0.06);
    crossDelayR.delayTime.setTargetAtTime(clampedR, now, 0.06);
  }

  if (hazeFilterLFO && hazePanLFO) {
    hazeFilterLFO.frequency.setTargetAtTime(1.0 / times.whole, now, 0.1);
    hazePanLFO.frequency.setTargetAtTime(1.0 / times.half, now, 0.1);
  }

  if (activeDronePatch && activeDronePatch.breathLFOs) {
    activeDronePatch.breathLFOs.forEach((lfo, idx) => {
      const cycleBeats = [4, 6, 8, 3, 12][idx % 5];
      const freqHz = 1.0 / (times.quarter * cycleBeats);
      lfo.frequency.setTargetAtTime(freqHz, now, 0.15);
    });
  }
}

function updateGranularTelemetryBanner() {
  const el = $g('granularSyncTelemetry');
  if (!el) return;
  if (microcosmMode === 'MOSAIC') {
    el.textContent = `MOSAIC: ${currentSubdiv} + 1/8T OCTAVE CASCADE (${masterBpm} BPM)`;
  } else if (microcosmMode === 'HAZE') {
    el.textContent = `HAZE: 1/2 BAR SWELL + 1/8T CLOUD (${masterBpm} BPM)`;
  } else {
    el.textContent = `GLITCH-ARP: ${currentSubdiv} + 1/32 RATCHET GRID (${masterBpm} BPM)`;
  }
}

// --- 3. WEB AUDIO API INITIALIZATION ---
function initAudio() {
  padRig = null; padFilter = null; activeDronePatch = null;
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  masterCompressor = ctx.createDynamicsCompressor();
  masterCompressor.threshold.value = -16;
  masterCompressor.knee.value = 18;
  masterCompressor.ratio.value = 3.5;
  masterCompressor.attack.value = 0.015;
  masterCompressor.release.value = 0.25;

  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;

  // Tape Wow & Flutter Pitch Warble Delay Line
  tapeDelayNode = ctx.createDelay(0.2);
  tapeDelayNode.delayTime.value = 0.015;

  wowLFO = ctx.createOscillator();
  wowGain = ctx.createGain();
  wowLFO.type = 'sine';
  wowLFO.frequency.value = 0.55;
  const lofiAmt = parseFloat($g('lofiTextureSlider').value);
  wowGain.gain.value = lofiAmt * 0.0022;
  wowLFO.connect(wowGain);
  wowGain.connect(tapeDelayNode.delayTime);
  wowLFO.start();

  // Warmth Low-Pass Filter
  warmthFilter = ctx.createBiquadFilter();
  warmthFilter.type = 'lowpass';
  warmthFilter.frequency.value = parseFloat($g('warmthFilterSlider').value);
  warmthFilter.Q.value = 0.85;

  // Primary Layer Buses
  droneMasterBus = ctx.createGain();
  droneMasterBus.gain.value = parseFloat($g('droneLevelSlider').value);

  motifMasterBus = ctx.createGain();
  motifMasterBus.gain.value = parseFloat($g('motifLevelSlider').value);

  granularBus = ctx.createGain();
  granularBus.gain.value = parseFloat($g('granularMixSlider').value);

  // Tempo-Synced HAZE Modulation Filter & Stereo Drift
  const times = getSubdivSeconds(currentSubdiv);
  hazeFilterNode = ctx.createBiquadFilter();
  hazeFilterNode.type = 'lowpass';
  hazeFilterNode.frequency.value = 2600;
  hazeFilterNode.Q.value = 1.2;

  hazeFilterLFO = ctx.createOscillator();
  const hazeFilterDepth = ctx.createGain();
  hazeFilterLFO.type = 'sine';
  hazeFilterLFO.frequency.value = 1.0 / times.whole;
  hazeFilterDepth.gain.value = 900;
  hazeFilterLFO.connect(hazeFilterDepth);
  hazeFilterDepth.connect(hazeFilterNode.frequency);
  hazeFilterLFO.start();

  hazePanLFO = ctx.createOscillator();
  hazePanLFO.type = 'triangle';
  hazePanLFO.frequency.value = 1.0 / times.half;
  hazePanLFO.start();

  // Tempo-Synced Polyrhythmic Cross-Feedback Stereo Delay Network
  crossDelayL = ctx.createDelay(5.0);
  crossDelayR = ctx.createDelay(5.0);
  crossDelayL.delayTime.value = Math.min(3.8, times.primary);
  crossDelayR.delayTime.value = Math.min(3.8, times.secondary);

  const spaceVal = parseFloat($g('spaceReverbSlider').value);
  delayFeedbackGain = ctx.createGain();
  delayFeedbackGain.gain.value = Math.min(0.86, spaceVal * 0.88);

  crossDelayL.connect(crossDelayR);
  crossDelayR.connect(delayFeedbackGain);
  delayFeedbackGain.connect(crossDelayL);

  // 7-Second Stereo Algorithmic Space Reverb
  reverbConvolver = ctx.createConvolver();
  reverbConvolver.buffer = createLushReverbBuffer(7.0, 2.3);

  reverbWetGain = ctx.createGain();
  reverbWetGain.gain.value = spaceVal;

  // Routing Architecture
  droneMasterBus.connect(warmthFilter);
  droneMasterBus.connect(reverbConvolver);

  motifMasterBus.connect(warmthFilter);
  motifMasterBus.connect(crossDelayL);

  granularBus.connect(hazeFilterNode);
  hazeFilterNode.connect(crossDelayL);
  hazeFilterNode.connect(reverbConvolver);
  hazeFilterNode.connect(warmthFilter);

  crossDelayL.connect(warmthFilter);
  crossDelayR.connect(warmthFilter);
  crossDelayR.connect(reverbConvolver);

  reverbConvolver.connect(reverbWetGain);
  reverbWetGain.connect(warmthFilter);

  warmthFilter.connect(tapeDelayNode);
  tapeDelayNode.connect(masterCompressor);

  setupLoFiVinylHiss(lofiAmt);

  masterCompressor.connect(analyser);
  gridOut = ctx.createGain(); gridOut.gain.value = gridVol;   // the game's volume, hold and fades
  analyser.connect(gridOut);
  gridOut.connect(ctx.destination);

  syncAudioNodesToTempo();
}

// --- 3B. PRECISION MASTER TEMPO CLOCK & BEAT SCHEDULER ---
function startMasterClock() {
  stopMasterClock();
  if (!ctx) return;
  beatStepCount = 0;
  nextTickTime = ctx.currentTime + 0.05;

  masterClockTimer = setInterval(() => {
    if (!isPlaying || !ctx) return;
    const lookahead = 0.12;
    while (nextTickTime < ctx.currentTime + lookahead) {
      const stepIndex = beatStepCount % 16;
      const scheduledTime = nextTickTime;

      if (stepIndex % 4 === 0) {
        const beatNumber = Math.floor(stepIndex / 4) + 1;
        const delayMs = Math.max(0, (scheduledTime - ctx.currentTime) * 1000);
        setTimeout(() => {
          triggerBeatLedPulse(beatNumber);
        }, delayMs);
      }

      const isSubdivBoundary = checkStepMatchesSubdiv(stepIndex);
      if (queuedMotifRequest && isSubdivBoundary && (!leadLoopOn || stepIndex % 4 === 0)) {
        const styleToFire = queuedMotifRequest.style;
        queuedMotifRequest = null;
        triggerMelodicMotifPhrase(styleToFire, scheduledTime);
      }

      if (stepIndex === 0 && !leadLoopOn) padSwellTick(scheduledTime);   // the pad opens and closes on a slow 32-bar swell
      if (transition && stepIndex % 4 === 0) tickTransition(scheduledTime, stepIndex);
      if (chordAdvancePending && stepIndex === 0 && !transition && !isFrozen) advanceChordNow();
      if (leadLoopOn || soloBars > 0 || leadScript.size) leadLoopStep(beatStepCount, scheduledTime);

      if (stepIndex === 0 || (stepIndex === 8 && Math.random() < 0.65)) {
        const chord = getActiveChord();
        const anchorNote = chord.notes[(stepIndex === 0 ? 2 : 3) % chord.notes.length];
        spawnMicrocosmCloud(n2f(anchorNote), scheduledTime, chord, 0.65);
      }

      const sixteenthSec = getQuarterNoteSec() * 0.25;
      nextTickTime += sixteenthSec;
      beatStepCount++;
    }
  }, 25);
}

function stopMasterClock() {
  if (masterClockTimer) {
    clearInterval(masterClockTimer);
    masterClockTimer = null;
  }
}

function checkStepMatchesSubdiv(stepIndex) {
  if (currentSubdiv === '1/4') return stepIndex % 4 === 0;
  if (currentSubdiv === '1/8.') return stepIndex % 3 === 0;
  if (currentSubdiv === '1/8') return stepIndex % 2 === 0;
  if (currentSubdiv === '1/8T') return stepIndex % 2 === 0;
  return true;
}

function triggerBeatLedPulse(beatNumber) {
  if (!isPlaying) return;
  const led = $g('tempoSyncLed');
  const badge = $g('beatCounterBadge');
  if (!led || !badge) return;

  badge.textContent = `${beatNumber}/4`;
  lastBeatIsDownbeat = (beatNumber === 1);
  lastBeatPulseAlpha = 1.0;

  if (beatNumber === 1) {
    led.classList.add('on-rose');
    led.classList.remove('on-cyan');
  } else {
    led.classList.add('on-cyan');
    led.classList.remove('on-rose');
  }

  setTimeout(() => {
    led.classList.remove('on-rose', 'on-cyan');
  }, 130);
}

// Synthesize 7-Second Lush Stereo Impulse Response
function createLushReverbBuffer(duration, decay) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buffer = ctx.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = i / length;
    const env = Math.pow(1 - n, decay) * Math.min(1, i / (rate * 0.04));
    left[i] = (Math.random() * 2 - 1) * env;
    right[i] = (Math.random() * 2 - 1) * env;
  }
  return buffer;
}

// Continuous Warm Pink-Filtered Tape Hiss + Vinyl Crackle Generator
function setupLoFiVinylHiss(lofiAmt) {
  const bufSize = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;

  for (let i = 0; i < bufSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + white * 0.029;
    b1 = 0.985 * b1 + white * 0.032;
    b2 = 0.950 * b2 + white * 0.048;
    data[i] = (b0 + b1 + b2) * 0.16;
  }

  vinylNoiseNode = ctx.createBufferSource();
  vinylNoiseNode.buffer = buffer;
  vinylNoiseNode.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1350;
  bandpass.Q.value = 0.7;

  vinylGainNode = ctx.createGain();
  vinylGainNode.gain.value = lofiAmt * 0.035;

  vinylNoiseNode.connect(bandpass);
  bandpass.connect(vinylGainNode);
  vinylGainNode.connect(masterCompressor);
  vinylNoiseNode.start();
}

function scheduleVinylDustPops() {
  if (!isPlaying || !ctx) return;
  clearTimeout(dustPopTimeout);

  const lofiAmt = parseFloat($g('lofiTextureSlider').value);
  if (lofiAmt > 0.06 && Math.random() < lofiAmt * 0.85) {
    const now = ctx.currentTime;
    const popOsc = ctx.createOscillator();
    const popFilter = ctx.createBiquadFilter();
    const popGain = ctx.createGain();

    popOsc.type = 'triangle';
    popOsc.frequency.setValueAtTime(1600 + Math.random() * 2400, now);

    popFilter.type = 'highpass';
    popFilter.frequency.value = 1100;

    const peak = lofiAmt * 0.028 * (0.4 + Math.random() * 0.6);
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.linearRampToValueAtTime(peak, now + 0.002);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    popOsc.connect(popFilter);
    popFilter.connect(popGain);
    popGain.connect(masterCompressor);

    popOsc.start(now);
    popOsc.stop(now + 0.022);
  }

  dustPopTimeout = setTimeout(scheduleVinylDustPops, 180 + Math.random() * 450);
}

// --- 4. PRIMARY LAYER: CONTINUOUS OVERLAPPING CHORD DRONES ---
// The drone is the pad from the Homebound generator, applied to whichever chord is sounding: one set of held voices
// (five per chord, each a detuned pair: a sawtooth or triangle plus a triangle, 0.3 percent either side of the note),
// a sine sub on the root, and one shared low-pass filter. The voices are never replaced. When the chord changes, each
// one glides to its new note in about a third of a second (setTargetAtTime, time constant 0.3), so a change is a
// morph, not a crossfade between two chords. The filter swells from 600 Hz up to 3000 Hz and back with the energy of
// the music (the idea's arc while the lead loop runs, a slow 32-bar swell otherwise).
const PAD_GLIDE = 0.3;
let padRig = null, padFilter = null, padBarCount = 0;

function ensurePadRig(chordObj, now) {
  if (padRig) return;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(ambientOn ? 0.0001 : PAD_LEVEL, now + 3.0);
  out.connect(droneMasterBus);
  padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 1400;
  padFilter.connect(out);

  const sub = ctx.createOscillator(), subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.value = subFreqFor(chordObj);
  subGain.gain.value = subLevel();
  sub.connect(subGain); subGain.connect(out);
  sub.start(now);

  const voices = [];
  for (let i = 0; i < 5; i++) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
    o2.type = 'triangle';
    const f = n2f(chordObj.notes[i] || chordObj.notes[chordObj.notes.length - 1]);
    o1.frequency.value = f * 0.997; o2.frequency.value = f * 1.003;
    g.gain.value = 0.025;
    o1.connect(g); o2.connect(g); g.connect(padFilter);
    o1.start(now); o2.start(now);
    voices.push({ o1, o2 });
  }
  padRig = { out, sub, subGain, voices };
  activeDronePatch = padRig;
}
const PAD_LEVEL = 1.1;   // the drone sits clearly under everything (the old crossfading patch matched about 0.6)
function subFreqFor(chordObj) { const r = n2f(chordObj.notes[0]); return r > 95 ? r * 0.5 : r; }
function subLevel() { return 0.14 * (0.4 + parseFloat($g('subAnchorSlider').value) * 0.6) / 0.79; }

// --- AMBIENT MODE: slow, soft, calming chords instead of the drone ---
// The drone's sawtooth voices, sub and filter swells step aside. Each chord blooms in as a round pad (a sine with a faintly
// detuned triangle on every tone, spread in an open voicing that keeps the middle register and leaves the low end empty),
// takes a few seconds to fade in, and melts into the next chord while the last one is still ringing out into the reverb.
// The motifs, the lead loop and the autopilot can play over it: the lead pools are fitted to the pad's own voicing, the
// pad lets go of the old chord quickly while a lead is playing, and the autopilot keeps everything calm and slow.
let ambientOn = false, ambBus = null, ambFilter = null, ambVoices = [];
function ambientVoicing(chord) {
  const seen = new Set(), out = [];
  const root = noteToMidi(chord.notes[0]);
  const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };
  out.push(fold(root, 40, 52));                                   // a soft root, no sub
  seen.add(((root % 12) + 12) % 12);
  chord.notes.slice(1).forEach(nm => {
    const m = noteToMidi(nm), pc = ((m % 12) + 12) % 12;
    if (seen.has(pc)) return;
    seen.add(pc); out.push(fold(m, 55, 76));
  });
  // a gentle top octave of the fifth or third keeps the chord airy
  if (out.length > 2) out.push(fold(out[2] + 12, 67, 79));
  return [...new Set(out)].sort((a, b) => a - b).slice(0, 7);
}
function ambientChord(chord, now) {
  if (!ctx || !droneMasterBus) return;
  if (!ambBus) {
    ambBus = ctx.createGain(); ambBus.gain.value = 1;
    ambFilter = ctx.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 1700; ambFilter.Q.value = 0.4;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.06; lg.gain.value = 420; lfo.connect(lg); lg.connect(ambFilter.frequency); lfo.start();
    const send = ctx.createGain(); send.gain.value = 0.55;
    ambBus.connect(ambFilter); ambFilter.connect(droneMasterBus);
    if (reverbConvolver) { ambFilter.connect(send); send.connect(reverbConvolver); }
  }
  ambVoices.forEach(v => {                                       // the old chord melts away
    v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0.0001, now, leadLoopOn ? 0.9 : 1.8);
    v.nodes.forEach(n => { try { n.stop(now + 11); } catch (e) {} });
  });
  const notes = ambientVoicing(chord), per = 0.13 / Math.sqrt(notes.length);
  ambVoices = notes.map((m, i) => {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const g = ctx.createGain(), pan = ctx.createStereoPanner();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o1.type = 'sine'; o1.frequency.value = f;
    o2.type = 'triangle'; o2.frequency.value = f * 1.0025; g2.gain.value = 0.28;
    pan.pan.value = notes.length > 1 ? (i / (notes.length - 1) - 0.5) * 0.9 : 0;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.setTargetAtTime(per * (m < 55 ? 1.15 : 1), now + (leadLoopOn ? 0.05 : 0.15) * i, leadLoopOn ? 0.6 : 1.1);   // upper voices bloom a touch later
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(pan); pan.connect(ambBus);
    o1.start(now); o2.start(now);
    return { g, nodes: [o1, o2] };
  });
}
function setAmbient(on) {
  if (on && !ctx) initAudio();
  ambientOn = on;
  const btn = $g('ambientBtn');
  btn.classList.toggle('on', on);
  leadLoopPoolChord = null;                                       // the lead pools are rebuilt around the pad voicing
  if (!ctx) return;
  const now = ctx.currentTime;
  if (padRig) padRig.out.gain.setTargetAtTime(on ? 0.0001 : PAD_LEVEL, now, on ? 1.4 : 2.0);
  if (on) {
    if (!leadLoopOn) $g('motifStatusText').textContent = 'AMBIENT: SOFT CHORDS, SPARSE MOTIFS';
    if (isPlaying) ambientChord(getActiveChord(), now);
  } else {
    ambVoices.forEach(v => { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0.0001, now, 1.5); v.nodes.forEach(n => { try { n.stop(now + 8); } catch (e) {} }); });
    ambVoices = [];
    if (isPlaying) $g('motifStatusText').textContent = 'MOTIF: BREATHING SPACE...';
  }
}

// the filter opens and closes with the energy of the music
function padSwell(build, time) {
  if (ambientOn && ambFilter && ctx) ambFilter.frequency.setTargetAtTime(1200 + leadClamp(build, 0, 1) * 1300, Math.max(ctx.currentTime, time), 1.5);
  if (!padFilter || !ctx) return;
  padFilter.frequency.setTargetAtTime(600 + leadClamp(build, 0, 1) * 2400, Math.max(ctx.currentTime, time), 0.8);
}
function padSwellTick(time) {
  const build = leadClamp(Math.sin(((padBarCount++ % 32) / 32) * Math.PI), 0.12, 0.95);
  padSwell(build, time);
}

function crossfadeToChordDrone(progIdx, chordIdx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  lastChordChangeAt = now;
  const chordObj = activeChordOverride || PROGRESSIONS[progIdx].chords[chordIdx];
  const times = getSubdivSeconds(currentSubdiv);

  if (!padRig) ensurePadRig(chordObj, now);
  else {
    padRig.sub.frequency.setTargetAtTime(subFreqFor(chordObj), now, PAD_GLIDE);
    padRig.voices.forEach((v, i) => {
      const f = n2f(chordObj.notes[i] || chordObj.notes[chordObj.notes.length - 1]);
      v.o1.frequency.setTargetAtTime(f * 0.997, now, PAD_GLIDE);
      v.o2.frequency.setTargetAtTime(f * 1.003, now, PAD_GLIDE);
    });
  }

  if (ambientOn) ambientChord(chordObj, now);
  spawnMicrocosmCloud(n2f(chordObj.notes[2]), now + times.primary, chordObj, 1.0);
  updateChordUI(progIdx, chordIdx);
}

// --- 5. SECONDARY LAYER: SPARSE FACGCE MATH-ROCK & LO-FI MELODIC MOTIFS ---
// Soft plucked string (Karplus-Strong with a tuned allpass). A damped noise burst circulates through a short
// delay line, so the top partials die first and the tone stays round: a nylon or clean-guitar pluck with no
// held oscillator pitch. "soft" is the hammered or pulled-off note: darker, no pick attack.
function makePluckBuffer(freq, seconds, soft) {
  const sr = ctx.sampleRate;
  const total = Math.max(512, Math.floor(seconds * sr));
  const period = sr / freq;
  const D = period - 1.0;   // the three-point damping filter below delays the loop by one sample
  let L = Math.floor(D), frac = D - L;
  if (frac < 0.1) { L -= 1; frac += 1; }
  const apA = (1 - frac) / (1 + frac);
  const line = new Float32Array(L);
  const k = soft ? 0.05 : 0.08;   // low = a dark, rounded pluck
  let lp = 0, mean = 0;
  for (let i = 0; i < L; i++) { lp += ((Math.random() * 2 - 1) - lp) * k; line[i] = lp; mean += lp; }
  mean /= L;
  const pk = Math.max(1, Math.floor(L * 0.14));
  const ex = new Float32Array(L);
  let peak = 1e-6;
  for (let i = 0; i < L; i++) { ex[i] = (line[i] - mean) - 0.3 * (line[(i - pk + L) % L] - mean); peak = Math.max(peak, Math.abs(ex[i])); }
  for (let i = 0; i < L; i++) line[i] = ex[i] / peak;
  const t60 = seconds * 0.9;
  const g = Math.pow(10, -3 * (period / sr) / t60);
  const out = new Float32Array(total);
  let idx = 0, prev = 0, prev2 = 0, apx = 0, apy = 0;
  for (let n = 0; n < total; n++) {
    const x = line[idx];
    const y = (0.25 * x + 0.5 * prev + 0.25 * prev2) * g;
    prev2 = prev; prev = x;
    const w = apA * y + apx - apA * apy;
    apx = y; apy = w;
    line[idx] = w;
    out[n] = x;
    if (++idx >= L) idx = 0;
  }
  const buf = ctx.createBuffer(1, total, sr);
  buf.getChannelData(0).set(out);
  return buf;
}

function playPluckNote(freq, safeTime, duration, velocity, pan, soft, dest, minRing) {
  const ringTime = Math.max(minRing || 0.5, duration * 1.1);
  const src = ctx.createBufferSource();
  src.buffer = makePluckBuffer(freq, ringTime + 0.2, soft);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(soft ? 1000 : 1400, safeTime);
  tone.frequency.exponentialRampToValueAtTime(450, safeTime + ringTime);
  tone.Q.value = 0.3;
  const env = ctx.createGain();
  const peak = velocity * (soft ? 1.5 : 1.85);
  env.gain.setValueAtTime(0.0001, safeTime);
  env.gain.linearRampToValueAtTime(peak, safeTime + (soft ? 0.01 : 0.005));
  env.gain.setTargetAtTime(0.0001, safeTime + duration, 0.09);
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), safeTime);
  src.connect(tone); tone.connect(env); env.connect(panner); panner.connect(dest || motifMasterBus);
  src.start(safeTime);
  src.stop(safeTime + ringTime + 0.3);
}

function playExpressiveMotifNote(freq, startTime, duration, options = {}) {
  if (!ctx) return;
  const {
    velocity = 0.2,
    pan = 0,
    slideFromFreq = null,
    isBell = false,
    noteLabel = ''
  } = options;

  const safeTime = Math.max(ctx.currentTime, startTime);
  if (!isBell) {
    // legato notes (hammer-ons, pull-offs, the upper double-stop note) are played softer with no pitch swoop
    playPluckNote(freq, safeTime, duration, velocity, pan, !!slideFromFreq);
    queueConstellationNode(freq, safeTime, pan, false, noteLabel);
    return;
  }
  const bodyOsc = ctx.createOscillator();
  const overtoneOsc = ctx.createOscillator();
  const overtoneGain = ctx.createGain();
  const noteFilter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  const panner = ctx.createStereoPanner();

  bodyOsc.type = isBell ? 'sine' : 'triangle';
  overtoneOsc.type = 'sine';

  if (slideFromFreq) {
    bodyOsc.frequency.setValueAtTime(slideFromFreq, safeTime);
    bodyOsc.frequency.exponentialRampToValueAtTime(freq, safeTime + 0.045);
  } else {
    bodyOsc.frequency.setValueAtTime(freq, safeTime);
  }

  overtoneOsc.frequency.setValueAtTime(freq * (isBell ? 2.0 : 3.0), safeTime);
  overtoneGain.gain.setValueAtTime(velocity * (isBell ? 0.35 : 0.14), safeTime);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, safeTime + (isBell ? duration * 0.7 : 0.14));

  noteFilter.type = 'lowpass';
  noteFilter.frequency.setValueAtTime(isBell ? 4800 : 2900, safeTime);
  noteFilter.frequency.exponentialRampToValueAtTime(750, safeTime + duration);

  env.gain.setValueAtTime(0.0001, safeTime);
  env.gain.linearRampToValueAtTime(velocity, safeTime + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, safeTime + duration);

  panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), safeTime);

  bodyOsc.connect(noteFilter);
  overtoneOsc.connect(overtoneGain);
  overtoneGain.connect(noteFilter);

  noteFilter.connect(env);
  env.connect(panner);
  panner.connect(motifMasterBus);

  bodyOsc.start(safeTime);
  overtoneOsc.start(safeTime);
  bodyOsc.stop(safeTime + duration + 0.05);
  overtoneOsc.stop(safeTime + duration + 0.05);

  queueConstellationNode(freq, safeTime, pan, isBell, noteLabel);
}

function queueConstellationNode() {}   // (the standalone version drew each note as a star; the game's player shows the spectrum)

// Lead riff voice: one soft monosynth voice per riff (sine plus a little triangle through a gentle low-pass).
// Each note is struck cleanly at its own pitch; there are no slides.
// Synth voices (the lead, Homebound, the riff voice) stay on the bassy side: nothing above about C5, higher tones fold down
// an octave, and the filters close off the top.
const SYNTH_CEIL_MIDI = 72, SYNTH_CEIL_HZ = 440 * Math.pow(2, (SYNTH_CEIL_MIDI - 69) / 12);
const foldSynthMidi = m => { while (m > SYNTH_CEIL_MIDI) m -= 12; return m; };
const foldSynthHz = f => { while (f > SYNTH_CEIL_HZ * 1.001) f *= 0.5; return f; };
function playLeadRiff(events, pan, dest) {
  if (!events.length) return;
  events = events.map(e => ({ ...e, freq: foldSynthHz(e.freq) }));
  const t0 = events[0].time;
  const last = events[events.length - 1];
  const tEnd = last.time + last.dur;

  const oscA = ctx.createOscillator(), oscB = ctx.createOscillator();
  const mixB = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  const env = ctx.createGain();
  const panner = ctx.createStereoPanner();
  oscA.type = 'sine'; oscB.type = 'triangle';
  oscB.detune.value = 5; mixB.gain.value = 0.28;
  tone.type = 'lowpass'; tone.Q.value = 0.5;
  tone.frequency.setValueAtTime(1150, t0);
  panner.pan.setValueAtTime(pan, t0);

  // vibrato that starts late in each note, the way a held guitar or voice note blooms
  const vib = ctx.createOscillator(), vibDepth = ctx.createGain();
  vib.type = 'sine'; vib.frequency.value = 5.2;
  vibDepth.gain.setValueAtTime(0, t0);
  vib.connect(vibDepth); vibDepth.connect(oscA.detune); vibDepth.connect(oscB.detune);

  env.gain.setValueAtTime(0.0001, t0);
  events.forEach((ev, i) => {
    const t = ev.time, end = t + ev.dur;
    oscA.frequency.setValueAtTime(ev.freq, t);
    oscB.frequency.setValueAtTime(ev.freq, t);
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(Math.max(0.0001, i === 0 ? 0.0001 : 0.02), t);
    env.gain.linearRampToValueAtTime(ev.vel, t + 0.03);
    // each note settles a little, then the sound breathes out before the next one
    env.gain.setTargetAtTime(ev.vel * 0.55, t + 0.12, 0.35);
    tone.frequency.setValueAtTime(1500, t);
    tone.frequency.setTargetAtTime(900, t + 0.05, 0.25);
    const bloom = Math.max(0, ev.dur - 0.25);
    vibDepth.gain.setValueAtTime(0, t);
    if (bloom > 0.1) vibDepth.gain.linearRampToValueAtTime(9, t + ev.dur * 0.9);
    env.gain.setTargetAtTime(0.0001, end - 0.02, 0.07);
  });

  oscA.connect(tone); oscB.connect(mixB); mixB.connect(tone);
  tone.connect(env); env.connect(panner); panner.connect(dest || motifMasterBus);
  const stopAt = tEnd + 0.9;
  oscA.start(t0); oscB.start(t0); vib.start(t0);
  oscA.stop(stopAt); oscB.stop(stopAt); vib.stop(stopAt);
  events.forEach(ev => queueConstellationNode(ev.freq, ev.time, pan, false, ev.label || ''));
}

// --- CONTINUOUS LEAD LOOP (WARM, MELODIC BIO-AMBIENT LEAD) ---
// A lead that is always singing, built the way the Homebound generator builds its lead: a handful of short, sparse riffs
// (written as scale degrees over 16 sixteenths, one bar each) that come back bar after bar over whatever chord is
// sounding. Because the riff is the same shape every time, it reads as a hook, and the chord underneath is what
// changes its colour. The degrees index a small pool of notes the drone is actually holding (kept clear of semitone
// rubs), so every note is a chord tone. The pool and the chord change on the bar line. Now and then the riff is
// swapped, one note is varied, or a bar is left empty to breathe, and a slow swell over 32 bars opens the tone and
// the dynamics. Phrases always start on beats of the master clock. To keep the busy layers from piling up, the lead
// has its own bus with a reverb send and no feed into the cross-feedback delays, the micro-loop clouds drop to about
// a third, and the delay feedback is held back. The harmonic chimes keep arriving on their own in between.
let leadLoopOn = false, leadLoopBus = null, leadLoopPool = [], leadLoopPoolChord = null;
let leadScript = new Map(), leadPlannedBar = -1;
let soloBars = 0;   // AUTO-MIXED with the lead loop off: the conductor plays this many bars (a call and its answer), then rests

const leadPick = arr => arr[Math.floor(Math.random() * arr.length)];
const leadClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function ensureLeadLoopBus() {
  if (leadLoopBus || !ctx) return;
  leadLoopBus = ctx.createGain();
  const leadTone = ctx.createBiquadFilter();
  leadTone.type = 'lowpass'; leadTone.frequency.value = 3600; leadTone.Q.value = 0.3;
  leadLoopBus.connect(leadTone);
  leadTone.connect(warmthFilter);
  const send = ctx.createGain();
  send.gain.value = 0.15;
  leadTone.connect(send);
  send.connect(reverbConvolver);
  ensureBassBus();
  applyLeadLoopMix();
}

let bassBus = null;
function ensureBassBus() {
  if (bassBus || !ctx) return;
  bassBus = ctx.createGain();
  bassBus.connect(warmthFilter);
  applyLeadLoopMix();
}
// a warm bass: a sine with a little triangle, closing a low-pass as it settles; it skips the reverb so it stays clear
function playBassNote(freq, t, dur, vel) {
  ensureBassBus();
  const end = t + Math.max(dur, 0.2);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o1.type = 'sine'; o2.type = 'triangle'; g2.gain.value = 0.35;
  o1.frequency.setValueAtTime(freq, t); o2.frequency.setValueAtTime(freq, t);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(520, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.25);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vel, t + 0.03);
  env.gain.setTargetAtTime(vel * 0.6, t + 0.03, 0.35);
  env.gain.setTargetAtTime(0.0001, end, 0.12);
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(env); env.connect(bassBus);
  o1.start(t); o2.start(t); o1.stop(end + 0.9); o2.stop(end + 0.9);
}

function applyLeadLoopMix() {
  if (!ctx || !motifMasterBus) return;
  const motifLevel = parseFloat($g('motifLevelSlider').value);
  const space = parseFloat($g('spaceReverbSlider').value);
  motifMasterBus.gain.setTargetAtTime(motifLevel * (leadLoopOn ? 0.85 : 1), ctx.currentTime, 0.12);
  if (leadLoopBus) leadLoopBus.gain.setTargetAtTime(motifLevel * 0.85, ctx.currentTime, 0.12);
  if (bassBus) bassBus.gain.setTargetAtTime(motifLevel * 0.85, ctx.currentTime, 0.12);
  if (delayFeedbackGain) delayFeedbackGain.gain.setTargetAtTime(Math.min(0.88, space * 0.88) * (leadLoopOn ? 0.6 : 1), ctx.currentTime, 0.2);
}

// Riffs from the Homebound generator, kept as written: numbers are degrees of the pool, -1 is a rest, one slot per sixteenth.
const LEAD_RIFFS = {
  JAZZ: [[-1, -1, 4, -1, -1, 5, -1, 3, -1, -1, 1, -1, -1, -1, -1, -1], [3, -1, -1, 4, -1, 2, -1, -1, 5, -1, -1, 3, -1, -1, -1, -1]],
  EMO:  [[3, 4, 6, 4, 2, -1, 4, -1, -1, 5, 4, 2, -1, -1, -1, -1], [2, 4, 5, 6, 5, 4, 2, 1, -1, -1, -1, -1, -1, -1, -1, -1]],
  LOFI: [[2, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1], [-1, -1, -1, -1, 3, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1]],
  ROCK: [[0, 0, -1, 0, 2, 2, -1, 2, 4, 4, -1, 4, -1, -1, -1, -1], [4, -1, 4, -1, 4, 2, 0, -1, 4, -1, 4, -1, 4, 2, 0, -1]]
};
const LEAD_STYLE_WEIGHTS = [['JAZZ', 4], ['EMO', 3], ['LOFI', 2], ['ROCK', 1]];

// Lead voice measured from a reference recording (the user's own "Homebound" lead, drums removed). The drone was
// subtracted out and 20 clean lead notes were analyzed. The tone is a strong fundamental with an almost equal
// second harmonic, a flat shelf of partials 3 to 7 about 14 dB down (with a small bump at 5 and 6), and a steep
// roll-off above the 8th. Each note starts with a fast attack (about 20 ms), is brightest in its first 150 ms, then
// settles into a steady plateau that is about 5 dB quieter and darker, with no vibrato, and it is cut off in about
// 100 ms at its end. It sits close to the center of the stereo field. The two tables are the measured harmonic
// levels (dB, harmonics 1 to 12) early in the note and late in the note. The voice plays the late spectrum as a
// steady tone and adds the difference as a bright layer that fades with a 0.14 s time constant.
const HB_EARLY_DB = [0, -2.4, -13.7, -17.3, -9.4, -10.7, -14, -17.2, -21.3, -30.4, -38, -46];
const HB_LATE_DB = [-1.7, -7.9, -17.4, -20.5, -18.6, -19.2, -19.7, -25.1, -32.1, -47.4, -55, -65];
// The measured shelf and the 5th/6th-partial bump read as nasal, so the spectrum is pulled part of the way toward the
// chime tone (a sine with a soft octave and almost nothing above). LEAD_CHIME_BLEND: 0 = the measured tone, 1 = chime.
const CHIME_EARLY_DB = [0, -9, -30, -40, -50, -55, -60, -65, -70, -75, -80, -85];
const CHIME_LATE_DB = [-1.7, -12, -32, -42, -52, -57, -62, -67, -72, -77, -82, -87];
const LEAD_CHIME_BLEND = 0.4;
let leadWaveCtx = null, leadWaveSus = null, leadWaveBright = null;
function leadWaves() {
  if (leadWaveCtx === ctx && leadWaveSus) return;
  const n = HB_EARLY_DB.length + 1;
  const zero = new Float32Array(n), a = new Float32Array(n), b = new Float32Array(n);
  for (let h = 1; h < n; h++) {
    const k = LEAD_CHIME_BLEND;
    const e = Math.pow(10, (HB_EARLY_DB[h - 1] * (1 - k) + CHIME_EARLY_DB[h - 1] * k) / 20);
    const l = Math.pow(10, (HB_LATE_DB[h - 1] * (1 - k) + CHIME_LATE_DB[h - 1] * k) / 20);
    a[h] = l; b[h] = Math.max(0, e - l);
  }
  leadWaveSus = ctx.createPeriodicWave(zero, a, { disableNormalization: true });
  leadWaveBright = ctx.createPeriodicWave(zero, b, { disableNormalization: true });
  leadWaveCtx = ctx;
}

function playLeadVoice(freq, t, dur, vel, pan, dest, bright, soft) {
  leadWaves();
  const end = t + Math.max(dur, 0.12);
  const stopAt = end + 0.6;
  const peak = vel * LEAD_VOICE_GAIN;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.022);
  env.gain.setTargetAtTime(peak * 0.7, t + 0.022, 0.3);
  env.gain.setTargetAtTime(0.0001, end, 0.06);

  const tone = ctx.createBiquadFilter();   // the recording has almost nothing above about 4 kHz
  tone.type = 'lowpass'; tone.frequency.value = 1900; tone.Q.value = 0.4;

  const sus = ctx.createOscillator(), br = ctx.createOscillator(), brGain = ctx.createGain();
  sus.setPeriodicWave(leadWaveSus); br.setPeriodicWave(leadWaveBright);
  sus.frequency.setValueAtTime(freq, t); br.frequency.setValueAtTime(freq, t);
  brGain.gain.setValueAtTime((soft ? 0.6 : 1) * (0.85 + 0.3 * bright), t);
  brGain.gain.setTargetAtTime(0, t, 0.14);
  sus.connect(tone); br.connect(brGain); brGain.connect(tone);
  sus.start(t); br.start(t); sus.stop(stopAt); br.stop(stopAt);

  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(leadClamp(pan, -0.9, 0.9), t);
  tone.connect(env); env.connect(panner); panner.connect(dest || motifMasterBus);
}
const LEAD_VOICE_GAIN = 0.42;

// Jazz fusion lead voice (matches the JAZZ FUSION lead of the Homebound generator): a triangle through a lowpass that starts
// at 1200 to 2200 Hz and closes to 500 Hz over 0.3 s, 40 ms attack, 0.8 s decay (2.5 s on held notes), plus a dotted stereo delay.
const JAZZ_LEAD_GAIN = 0.5;
let jazzDelayL = null, jazzDelayR = null;
function ensureJazzDelay() {
  if (jazzDelayL || !ctx || !leadLoopBus) return;
  const send = ctx.createGain(); send.gain.value = 0.12;
  const fb = ctx.createGain(); fb.gain.value = 0.2;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
  const merger = ctx.createChannelMerger(2);
  jazzDelayL = ctx.createDelay(2.0); jazzDelayR = ctx.createDelay(2.0);
  leadLoopBus.connect(send);
  send.connect(jazzDelayL); send.connect(jazzDelayR);
  jazzDelayL.connect(lp); jazzDelayR.connect(lp);
  lp.connect(fb); fb.connect(jazzDelayL); fb.connect(jazzDelayR);
  jazzDelayL.connect(merger, 0, 0); jazzDelayR.connect(merger, 0, 1);
  merger.connect(leadLoopBus);
}
function playJazzLeadVoice(freq, t, dur, vel, dest, bright, body = 0) {
  ensureJazzDelay();
  if (jazzDelayL) {
    const q = getQuarterNoteSec();
    jazzDelayL.delayTime.setTargetAtTime(q * 0.375, t, 0.05);
    jazzDelayR.delayTime.setTargetAtTime(q * 0.5, t, 0.05);
  }
  const held = dur >= getQuarterNoteSec() * 0.75;
  const decay = held ? 2.5 : 0.8;
  const peak = JAZZ_LEAD_GAIN * Math.max(0.35, Math.min(1.6, vel / 0.3));
  const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 0.7;
  const cutoff = Math.min((850 + 650 * (bright == null ? 0.5 : bright)) * (1 - 0.3 * body), Math.max(480, freq * 3.2));   // the higher the note, the rounder it gets
  filt.frequency.setValueAtTime(cutoff, t);
  filt.frequency.exponentialRampToValueAtTime(Math.min(400, cutoff), t + 0.3);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.04);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.04 + decay);
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime((Math.random() - 0.5) * 0.4, t);
  osc.connect(filt); filt.connect(env); env.connect(panner); panner.connect(dest || motifMasterBus);
  osc.start(t); osc.stop(t + 0.04 + decay + 0.1);
  if (body > 0) {                       // a round sine an octave down: the bassy, un-whistly part of the tone
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(freq * 0.5, t);
    const sg = ctx.createGain(); sg.gain.value = 0.55 * body;
    sub.connect(sg); sg.connect(env);
    sub.start(t); sub.stop(t + 0.04 + decay + 0.1);
  }
}

// the notes the drone holds, in a register, as a short ascending pool: no note a semitone or ninth from the
// upper drone, and no two neighbours a semitone apart
// Each chord (and the progression it belongs to) carries its own register. The lead pools slide up or down so the line
// sits where that chord's voicing sings, instead of one fixed window for everything.
let regBase = null;
const chordMotifMean = c => { const m = (c.motif || c.notes.slice(-4)).map(noteToMidi); return m.reduce((a, b) => a + b, 0) / m.length; };
function registerShift(chord) {
  if (regBase == null) {
    const all = []; PROGRESSIONS.forEach(pr => pr.chords.forEach(c => all.push(chordMotifMean(c))));
    regBase = all.reduce((a, b) => a + b, 0) / all.length;
  }
  const prog = PROGRESSIONS[currentProgIdx], pm = prog ? prog.chords.reduce((a, c) => a + chordMotifMean(c), 0) / prog.chords.length : regBase;
  return leadClamp(Math.round(0.7 * (chordMotifMean(chord) - regBase) + 0.3 * (pm - regBase)), -5, 5);
}
function buildLeadPool(chord, lo = 65, hi = 84, maxN = 8) {
  const drone = ambientOn ? ambientVoicing(chord) : chord.notes.map(noteToMidi);   // in ambient the pad's own voicing is what sounds
  const pcs = new Set(drone.map(m => ((m % 12) + 12) % 12));
  const upper = drone.filter(m => m >= 48);
  const make = (a, b, strict) => {
    let pool = [];
    for (let m = a; m <= b; m++) {
      if (!pcs.has(m % 12)) continue;
      if (strict && upper.some(d => { const g = Math.abs(m - d); return g === 1 || g === 11 || g === 13; })) continue;
      if (pool.length && m - pool[pool.length - 1] === 1) continue;
      pool.push(m);
    }
    return pool;
  };
  let pool = make(lo, hi, true);
  if (pool.length < 7) pool = make(lo - 3, hi + 5, true);
  if (pool.length < 7) pool = make(lo - 3, hi + 5, false);
  return pool.slice(0, maxN);
}

// the tones that feel finished (root and fifth), as indices into a pool
function stableIdxs(pool, chord) {
  const root = ((noteToMidi(chord.notes[0]) % 12) + 12) % 12;
  const st = [];
  pool.forEach((m, i) => { const pc = m % 12; if (pc === root || pc === (root + 7) % 12) st.push(i); });
  if (st.length < 2 && chord.fit) chord.fit.forEach(f => {
    const pc = ((noteToMidi(f) % 12) + 12) % 12, i = pool.findIndex(m => m % 12 === pc);
    if (i >= 0 && !st.includes(i)) st.push(i);
  });
  if (!st.length) st.push(0);
  return st.sort((a, b) => a - b);
}
const nearestOf = (arr, v) => arr.reduce((b, x) => Math.abs(x - v) < Math.abs(b - v) ? x : b, arr[0]);

function pickLeadStyle(not) {
  const total = LEAD_STYLE_WEIGHTS.reduce((a, w) => a + (w[0] === not ? 0 : w[1]), 0);
  let r = Math.random() * total;
  for (const [k, w] of LEAD_STYLE_WEIGHTS) { if (k === not) continue; if ((r -= w) < 0) return k; }
  return 'JAZZ';
}

// --- THE CONDUCTOR ---
// While the lead loop runs, every part is played by one conductor that thinks in bars of the master clock and shares
// the note pools, so nothing can clash or pile up. An "idea" is sixteen bars with a shape of its own: a BEGINNING
// (bells state the chord, then a thinned and a full call), a VERSE (call and response trade bars, then a second
// musician takes the idea into another idiom) and an END (the call thins and lands on the root, bells close on a
// cadence). Three bars are bridges: each starts on the last note the previous part played, walks the pool to a note
// shared by the current and the next chord, and arrives before the next part begins, so the pull-offs or double stops
// are the hinge between the parts around them.
//
// Every idea begins with a randomly generated PREMISE: a scene, a twist and a mood ("walking down the aisle under
// drifting holo-lanterns, as petals of light fall, tender"). The scene picks two genres, the mood sets how much is
// going on, and the arc sets how the idea swells and settles. The genres decide how call and response work, so the
// answer is an answer: a tapped, interleaved math-rock line is answered by open chords built around the call's last
// note; a syncopated jazz riff by short comping stabs; a processional bell theme by a swelling open chord; and so on.
// While a part plays, quieter layers from other motifs can join in the gaps, but only on notes that are consonant with
// everything sounding nearby. A bass voice supports every part that sits in the high register.
const IDEA_PLAN = ['open', 'call-thin', 'call', 'call', 'resp-1', 'call', 'resp-2', 'bridge-0',
                   'call-dev', 'resp-1', 'call-dev', 'resp-2', 'bridge-1', 'call-end', 'close', 'bridge-2'];
// An idea takes one of four forms. EXCHANGE is call and response; the others are a slow DRIFT of held notes, a GROOVE built
// on a repeating cell that evolves, and a BUILD that fills in bar by bar before it arrives.
const FORM_PLANS = {
  EXCHANGE: IDEA_PLAN,
  DRIFT:  ['open', 'drift', 'drift', 'breath', 'drift', 'drift', 'swell', 'bridge-0', 'drift', 'drift', 'breath', 'drift', 'swell', 'bridge-1', 'drift', 'close'],
  GROOVE: ['open', 'cell', 'cell', 'cell-var', 'cell', 'cell', 'cell-var', 'bridge-0', 'cell', 'cell-var', 'cell', 'cell', 'cell-var', 'bridge-1', 'cell', 'close'],
  BUILD:  ['open', 'drift', 'drift', 'build-1', 'build-2', 'build-3', 'build-4', 'bridge-0', 'call', 'resp-1', 'call-dev', 'drift', 'swell', 'bridge-1', 'drift', 'close']
};
const FORM_LABELS = { EXCHANGE: 'CALL AND RESPONSE', DRIFT: 'DRIFT', GROOVE: 'GROOVE', BUILD: 'BUILD' };
let cd = null;
let leadLoopPoolWide = [], leadLoopPoolMid = [], leadLoopPoolLow = [];

const PREMISE_SCENES = [
  { t: 'walking down the aisle under drifting holo-lanterns', g: ['PROCESSIONAL', 'LOFI'], arc: 'rise', moods: ['tender', 'hopeful'] },
  { t: 'the last night train gliding over a sleeping neon city', g: ['POSTROCK', 'EMO'], arc: 'wave', moods: ['wistful', 'serene'] },
  { t: 'first light on a rooftop garden while the drones water the tomatoes', g: ['LOFI', 'HOMEBOUND'], arc: 'rise', moods: ['serene', 'curious'] },
  { t: 'two old friends spotting each other across the crowded docks', g: ['MATHROCK', 'HOMEBOUND'], arc: 'burst', moods: ['giddy', 'tender'] },
  { t: 'a night market haggle that turns into a dance', g: ['JAZZ', 'MATHROCK'], arc: 'wave', moods: ['playful', 'giddy'] },
  { t: 'launching a kite made of solar film from the old freeway', g: ['HOMEBOUND', 'EMO'], arc: 'rise', moods: ['giddy', 'curious'] },
  { t: 'a quiet goodbye at the arrivals gate with hope on the departure board', g: ['EMO', 'PROCESSIONAL'], arc: 'ebb', moods: ['wistful', 'tender'] },
  { t: 'rain tapping on the greenhouse glass while someone hums', g: ['LOFI', 'POSTROCK'], arc: 'plateau', moods: ['serene', 'tender'] },
  { t: 'a street musician and a hacker trading riffs under a flickering sign', g: ['JAZZ', 'EMO'], arc: 'wave', moods: ['playful', 'curious'] },
  { t: 'the first bike ride through the car-free district', g: ['HOMEBOUND', 'MATHROCK'], arc: 'burst', moods: ['giddy', 'triumphant'] },
  { t: 'carrying a seedling through the tunnels to the new orchard', g: ['PROCESSIONAL', 'POSTROCK'], arc: 'rise', moods: ['hopeful', 'resolve'] },
  { t: 'the whole block waking up for the sunrise festival', g: ['POSTROCK', 'JAZZ'], arc: 'rise', moods: ['triumphant', 'giddy'] },
  { t: 'a lullaby drifting through the intercom of the sleeping arcology', g: ['LOFI', 'PROCESSIONAL'], arc: 'ebb', moods: ['tender', 'serene'] },
  { t: 'solving a puzzle with a stranger and slowly becoming friends', g: ['MATHROCK', 'JAZZ'], arc: 'wave', moods: ['curious', 'playful'] },
  { t: 'the elevator ride up to the first sunrise garden in the sky', g: ['POSTROCK', 'PROCESSIONAL'], arc: 'rise', moods: ['hopeful', 'serene'] },
  { t: 'a long-awaited letter arriving by drone at a quiet window', g: ['EMO', 'LOFI'], arc: 'burst', moods: ['wistful', 'hopeful'] }
];
const PREMISE_TWISTS = ['as petals of light fall', 'with the rain just clearing', 'while a distant choir of drones hums along', 'in the warm glow of the signs',
  'with the whole city holding its breath', 'as the sun clears the towers', 'while the wind turbines turn slowly', 'with steam rising off the canals',
  'as the street lights blink awake', 'while somebody laughs two floors down'];
// An emotion wheel (valence, arousal). An idea can move through one to five moods; each hop stays short on the wheel,
// so a happy idea that ends sad passes through the feelings in between (nostalgic, bittersweet, melancholic).
const WHEEL = {
  giddy: [0.85, 0.92], triumphant: [0.8, 0.9], joyful: [0.9, 0.72], playful: [0.7, 0.78], mischievous: [0.45, 0.76],
  proud: [0.65, 0.6], hopeful: [0.6, 0.5], awestruck: [0.5, 0.55], curious: [0.4, 0.6], resolve: [0.3, 0.68],
  grateful: [0.7, 0.35], relieved: [0.5, 0.3], tender: [0.55, 0.2], content: [0.6, 0.18], serene: [0.5, 0.05],
  dreamy: [0.3, 0.08], reverent: [0.25, 0.2], nostalgic: [0.12, 0.25], pensive: [0.0, 0.14], wistful: [-0.08, 0.26],
  bittersweet: [0.0, 0.38], longing: [-0.22, 0.42], melancholic: [-0.45, 0.2], lonely: [-0.55, 0.1], sorrowful: [-0.7, 0.18],
  restless: [-0.12, 0.66], uneasy: [-0.3, 0.55], tense: [-0.4, 0.72], defiant: [-0.15, 0.82]
};
const MOOD_NAMES = Object.keys(WHEEL);
const moodEnergy = m => 0.28 + 0.7 * WHEEL[m][1];
const moodUnity = m => leadClamp(0.35 + 0.35 * (1 - WHEEL[m][1]) + 0.1 * WHEEL[m][0], 0.2, 0.8);
const moodDist = (a, b) => Math.hypot(WHEEL[a][0] - WHEEL[b][0], WHEEL[a][1] - WHEEL[b][1]);
// from one mood toward another in n moods, each hop at most about half a unit on the wheel
function moodPath(from, to, n) {
  const HOP = 0.5;
  if (n <= 1) return [from];
  const f = WHEEL[from], t = WHEEL[to];
  let d = moodDist(from, to), dx = t[0] - f[0], dy = t[1] - f[1];
  if (d < 0.05) { const a = Math.random() * 6.283; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
  const reach = Math.min(HOP * (n - 1), Math.max(d, 0.3 * (n - 1)));
  const path = [from];
  for (let k = 1; k < n; k++) {
    const fr = reach * k / (n - 1) / d, px = f[0] + dx * fr, py = f[1] + dy * fr;
    let best = null, bd = 9;
    MOOD_NAMES.forEach(m => {
      if (path.includes(m)) return;
      const dd = Math.hypot(WHEEL[m][0] - px, WHEEL[m][1] - py);
      if (dd < bd) { bd = dd; best = m; }
    });
    path.push(best);
  }
  return path;
}
const MOOD_BOUNDS = { 1: [0], 2: [0, 8], 3: [0, 5, 11], 4: [0, 4, 8, 12], 5: [0, 3, 6, 10, 13] };
// which mood the idea is in at bar pos, easing toward the next mood across a segment's last bar
function moodState(P, pos) {
  const b = MOOD_BOUNDS[P.moods.length], n = b.length;
  let i = 0; while (i + 1 < n && pos >= b[i + 1]) i++;
  const end = i + 1 < n ? b[i + 1] : 16, m = P.moods[i];
  let e = moodEnergy(m), u = moodUnity(m);
  if (i + 1 < n && pos === end - 1) { const m2 = P.moods[i + 1]; e = (e + moodEnergy(m2)) / 2; u = (u + moodUnity(m2)) / 2; }
  return { name: m, i, n, energy: e, unity: leadClamp(u + P.unityJit, 0.12, 0.88) };
}

const ARCS = {
  rise:    [.2, .25, .3, .35, .4, .45, .5, .6, .65, .7, .8, .9, .9, .6, .4, .3],
  wave:    [.3, .35, .45, .6, .7, .55, .4, .35, .45, .6, .8, .9, .7, .5, .4, .3],
  burst:   [.2, .2, .25, .25, .3, .3, .35, .4, .8, .9, .95, .95, .8, .55, .4, .3],
  ebb:     [.8, .78, .74, .7, .66, .62, .58, .54, .5, .45, .4, .35, .3, .25, .2, .15],
  plateau: [.4, .45, .45, .5, .5, .5, .55, .5, .5, .55, .55, .5, .5, .45, .4, .3]
};
const PROC_THEMES = [[0, 1, 2, 1], [2, 3, 4, 3], [4, 3, 2, 1], [0, 2, 1, 3], [3, 2, 1, 0], [1, 2, 4, 2]];
const GENRE_FRIENDS = {
  MATHROCK: ['JAZZ', 'EMO', 'HOMEBOUND'], JAZZ: ['LOFI', 'MATHROCK', 'EMO'], EMO: ['POSTROCK', 'MATHROCK', 'LOFI'],
  LOFI: ['JAZZ', 'EMO', 'PROCESSIONAL'], PROCESSIONAL: ['POSTROCK', 'LOFI', 'HOMEBOUND'],
  POSTROCK: ['PROCESSIONAL', 'EMO', 'HOMEBOUND'], HOMEBOUND: ['MATHROCK', 'PROCESSIONAL', 'POSTROCK']
};
// which idiom plays at a bar: one palette entry keeps the whole idea, two split it, three take the opening, middle and end
const genreAt = (P, pos) => {
  const pal = P.palette;
  if (pal.length === 1) return pal[0];
  if (pal.length === 2) return pos >= 8 && pos < 12 ? pal[1] : pal[0];
  return pos < 6 ? pal[0] : (pos < 12 ? pal[1] : pal[2]);
};
const FAVOR_GENRE = { TAPPED: 'EMO', HOMEBOUND: 'HOMEBOUND', BELLS: 'PROCESSIONAL', LEAD: 'JAZZ' };

function pickRiffs() {
  const out = {};
  ['JAZZ', 'EMO', 'LOFI'].forEach(st => {
    const all = LEAD_RIFFS[st].concat(MORE_RIFFS[st]);
    const a = leadPick(all); let b = leadPick(all); if (b === a) b = leadPick(all);
    out[st] = a.slice(); out[st + '2'] = b.slice();
  });
  return out;
}

// a fresh premise: never one of the last few scenes, with the two genres in a random order
function newPremise(prev) {
  const sel = $g('motifStyleSelect').value;
  const recent = cd.recent;
  let pool = PREMISE_SCENES.filter(s => !recent.includes(s.t));
  if (!pool.length) pool = PREMISE_SCENES;
  const scene = leadPick(pool);
  recent.push(scene.t); while (recent.length > 5) recent.shift();
  // one to five moods: the scene's own pair sets the start and the direction, the wheel supplies what lies between
  const nMoods = leadPick([1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
  const start = Math.random() < 0.8 ? scene.moods[0] : leadPick(MOOD_NAMES);
  const moods = moodPath(start, scene.moods[1], nMoods);
  const mood = moods[0];
  const twist = leadPick(PREMISE_TWISTS);
  const en0 = moodEnergy(start);
  let g = scene.g.slice(); if (Math.random() < 0.5) g.reverse();
  if (FAVOR_GENRE[sel] && !g.includes(FAVOR_GENRE[sel])) g[0] = FAVOR_GENRE[sel];
  else if (FAVOR_GENRE[sel]) g = [FAVOR_GENRE[sel], g.find(x => x !== FAVOR_GENRE[sel])];
  // the form of the idea: calm moods drift, lively ones groove or build, and call and response is always a common choice
  const fw = ambientOn ? { EXCHANGE: 0.35, DRIFT: 0.55, GROOVE: 0.05, BUILD: 0.05 } : { EXCHANGE: 0.3, DRIFT: 0.1 + 0.35 * (1 - en0), GROOVE: 0.15 + 0.25 * en0, BUILD: 0.2 };
  let fr = Math.random() * Object.values(fw).reduce((a, b) => a + b, 0), form = 'EXCHANGE';
  for (const k of Object.keys(fw)) { if ((fr -= fw[k]) < 0) { form = k; break; } }
  // The idea's palette: one to three motifs (idioms) and nothing else. A calm idea tends to keep to one or two, a lively
  // one reaches for three; a third is always a close friend of the first two so the set stays together.
  const en = moodEnergy(start), p1 = 0.5 - 0.3 * en, p3 = 0.15 + 0.3 * en, rr = Math.random();
  const nPal = rr < p1 ? 1 : (rr < 1 - p3 ? 2 : 3);
  let palette = [g[0]];
  if (nPal >= 2) palette.push(g[1] !== g[0] ? g[1] : leadPick(GENRE_FRIENDS[g[0]]));
  if (nPal >= 3) {
    const both = GENRE_FRIENDS[palette[0]].filter(x => GENRE_FRIENDS[palette[1]].includes(x) && !palette.includes(x));
    const pool3 = both.length ? both : GENRE_FRIENDS[palette[0]].filter(x => !palette.includes(x));
    if (pool3.length) palette.push(leadPick(pool3));
  }
  const bridgeKind = noHammer => { const t = [['HAMMER', 2], ['DOUBLESTOP', 2.5], ['WALK', 2.5], ['SWELL', 2], ['ROLL', 1]].filter(x => !(noHammer && x[0] === 'HAMMER')); let r = Math.random() * t.reduce((a, x) => a + x[1], 0); for (const [k, w] of t) { if ((r -= w) < 0) return k; } return 'WALK'; };
  // two kinds of bridge at most, reused through the idea
  const bA = bridgeKind(false); let bB = bridgeKind(false); if (bB === bA) bB = bridgeKind(false);
  let bridges = [bA, bB, bA === 'HAMMER' ? bB : bA];
  if (bridges[2] === 'HAMMER') bridges[2] = bA === 'HAMMER' ? 'WALK' : bA;
  if (sel === 'DOUBLESTOP' || sel === 'HAMMER') bridges = [sel, sel, sel];
  return {
    title: scene.t + ', ' + twist, mood, moods, energy: moodEnergy(mood), arc: ARCS[scene.arc], arcName: scene.arc, form, plan: FORM_PLANS[form], palette, gA: palette[0], gB: palette[1] || palette[0], bridges,
    layerChance: leadPick([0, 0.5, 0.5, 0.8, 1]),
    riffs: pickRiffs(),
    unityJit: (Math.random() - 0.5) * 0.3,
    theme: leadPick(PROC_THEMES).slice()
  };
}

// The conductor's notes lock to the selected subdivision (the same grid the delay and grains use). Structural notes land
// on the subdivision itself; short passing notes land on the next finer grid; ornaments stay as pickups before their note.
// [structural, passing] in sixteenths
const SUBDIV_GRID = { '1/4': [4, 2], '1/8.': [3, 1.5], '1/8': [2, 1], '1/8T': [4 / 3, 2 / 3], '1/16': [1, 1] };
const snapToGrid = (p, L) => Math.floor(p / L + 0.5 - 1e-9) * L;
function addEv(step, ev) {
  ev.src = getActiveChord();                      // the chord this note was written against
  if (!ev.q && cd && ev.kind !== 'cloud') {
    const g = SUBDIV_GRID[currentSubdiv] || SUBDIV_GRID['1/8'];
    const q = getQuarterNoteSec();
    const anchor = ev.anch != null ? ev.anch : (ev.kind === 'bass' || ev.d >= 2 || ev.dur >= q * 0.75);
    const rel = step - cd.barStart, L = anchor ? g[0] : g[1];
    let sp = snapToGrid(rel, L); if (sp > 15.001) sp -= L; if (sp < 0) sp = 0;
    const whole = Math.floor(sp + 1e-6);
    step = cd.barStart + whole; ev.nudge = (ev.nudge || 0) + (sp - whole) * sixteenthSec();
  }
  if (!leadScript.has(step)) leadScript.set(step, []);
  leadScript.get(step).push(ev);
  if (cd && cd.barEvs) cd.barEvs.push({ step: step - cd.barStart, ev });
}
const poolAt = (pool, i) => pool[leadClamp(i, 0, pool.length - 1)];
const idxNear = (pool, m) => pool.indexOf(nearestOf(pool, m == null ? pool[Math.floor(pool.length / 2)] : m));
const setMemo = m => { cd.memo = m; cd.lastMidi = m; };

function peekNextChordObj() {
  if (transition) {
    const nxt = transition.plan[transition.i + 1];
    if (transition.i < 0) return transition.plan[0].chord;
    if (nxt && transition.beatsLeft <= 4) return nxt.chord;
    if (!nxt && transition.beatsLeft <= 4) return PROGRESSIONS[currentProgIdx].chords[currentChordIdx];
    return getActiveChord();
  }
  const chords = PROGRESSIONS[currentProgIdx].chords;
  const hold = holdSecondsFor(currentChordIdx) + 0.3;
  const barSec = getQuarterNoteSec() * 4;
  const due = chordAdvancePending || (chordElapsedSeconds + barSec >= hold - 0.3);
  if (!due || isFrozen || markovDrift) return getActiveChord();
  return chords[(currentChordIdx + 1) % chords.length];
}

function bellsPart(barStart, kind) {
  const pool = leadLoopPool, n = pool.length, chord = getActiveChord();
  const D = i => pool[Math.min(Math.max(i, 0), n - 1)];
  const q = getQuarterNoteSec();
  if (kind === 'statement') {
    [[4, 0, -0.5], [6, 4, 0], [5, 8, 0.5]].forEach(([deg, step, pan]) =>
      addEv(barStart + step, { kind: 'bell', midi: D(deg), dur: q * 2.6, vel: 0.18, pan }));
    addEv(barStart + 4, { kind: 'cloud', midi: D(3), scale: 0.8 });
    setMemo(D(5));
  } else {
    const st = stableIdxs(pool, chord).slice().reverse();      // highest first
    const pick = k => pool[st[Math.min(k, st.length - 1)]];
    [[0, 0, 0.4], [1, 4, 0], [2, 8, -0.4]].forEach(([k, step, pan]) =>
      addEv(barStart + step, { kind: 'bell', midi: pick(k), dur: q * 2.8, vel: 0.16 - 0.015 * k, pan }));
    const low = pool[st[st.length - 1]];
    addEv(barStart + 12, { kind: 'bell', midi: low, dur: q * 4, vel: 0.14, pan: 0 });
    setMemo(low);
  }
}

function tappedPart(barStart, shift) {
  const pool = leadLoopPool, n = pool.length, chord = getActiveChord(), q = getQuarterNoteSec();
  const seq = shift ? [1, 3, 2, 4, 3, 2] : [0, 2, 1, 3, 2, 4];
  const stable = stableIdxs(pool, chord);
  seq[5] = nearestOf(stable, seq[5]);
  seq.forEach((deg, k) => {
    const idx = leadClamp(deg, 0, n - 1);
    addEv(barStart + k * 2, { kind: 'pluck', midi: pool[idx], dur: k === 5 ? q * 2 : q * 1.1, vel: 0.22 - k * 0.012, pan: k % 2 === 0 ? -0.38 : 0.38 });
    setMemo(pool[idx]);
  });
  addEv(barStart + 4, { kind: 'cloud', midi: pool[Math.min(2, n - 1)], scale: 0.6 });
}

function homeboundPart(barStart) {
  const pool = leadLoopPoolWide, n = pool.length, chord = getActiveChord();
  const stable = stableIdxs(pool, chord);
  let step = 0, last = Math.floor(n * 0.5), prev = null, lastEv = null, count = 0;
  while (count < 3) {
    const fits = HB_CELLS.filter(c => c !== prev && step + c.durs.reduce((a, b) => a + b, 0) <= 13);
    if (!fits.length) break;
    const cell = leadPick(fits); prev = cell; count++;
    const lo = -Math.min(...cell.steps), hi = n - 1 - Math.max(...cell.steps);
    const s = lo > hi ? lo : leadClamp(last + leadPick([-1, 0, 1]), lo, hi);
    cell.steps.forEach((st, k) => {
      const idx = leadClamp(s + st, 0, n - 1);
      const leap = k === 0 || Math.abs(st - cell.steps[k - 1]) >= 3;
      const wob = k > 0 && Math.abs(st - cell.steps[k - 1]) <= 1 && cell.durs[k] <= 2;
      lastEv = { kind: 'hb', midi: pool[idx], idx, d: cell.durs[k], vel: 0.27 * (leap ? 1.15 : (wob ? 0.85 : 1)) * (0.92 + Math.random() * 0.16), soft: wob, pan: (Math.random() - 0.5) * 0.24, nudge: k === 0 ? 0 : (Math.random() - 0.5) * 0.012 };
      addEv(barStart + step, lastEv);
      step += cell.durs[k];
    });
    last = leadClamp(s + cell.steps[cell.steps.length - 1], 0, n - 1);
    step += leadPick([1, 2]);
    if (step > 11) break;
  }
  if (lastEv) {                                   // the run ends on a tone that rests, and rings
    const ni = nearestOf(stable, lastEv.idx);
    lastEv.midi = pool[ni]; lastEv.d = 4; setMemo(lastEv.midi);
  }
}

function bridgePart(barStart, style, soft, nextDeg) {
  const pool = leadLoopPool, n = pool.length, q = getQuarterNoteSec();
  const nxt = peekNextChordObj();
  const nxtSh = registerShift(nxt);
  const nxtPool = buildLeadPool(nxt, 65 + nxtSh, 84 + nxtSh);
  const nextFirst = nxtPool[Math.min(nextDeg, nxtPool.length - 1)];
  const nxtPcs = new Set(nxt.notes.map(x => ((noteToMidi(x) % 12) + 12) % 12));
  let cands = pool.filter(m => nxtPcs.has(m % 12));
  if (!cands.length) cands = pool;
  const target = nearestOf(cands, nextFirst);
  const iTo = pool.indexOf(target);
  let iFrom = pool.indexOf(nearestOf(pool, cd.lastMidi == null ? pool[Math.floor(n / 2)] : cd.lastMidi));
  let seq = [];
  const dir = iTo >= iFrom ? 1 : -1;
  for (let i = iFrom; ; i += dir) { seq.push(i); if (i === iTo) break; }
  if (seq.length > 5) seq = seq.slice(-5);
  if (seq.length === 1) { const alt = iTo + 1 < n ? iTo + 1 : iTo - 1; seq = [iTo, alt, iTo]; }
  else if (seq.length === 2) seq.unshift(leadClamp(seq[0] - dir, 0, n - 1));
  const g = soft ? 0.75 : 1;
  const L = seq.length;
  const cv = cd.callVoice;
  if (style === 'WALK') {                      // a stepwise walk in the idea's own voice, one note every other sixteenth
    seq.forEach((i, k) => {
      const pos = 12 - 2 * (L - 1 - k), last = k === L - 1;
      if (cv && cv.kind === 'lead') addEv(barStart + pos, { kind: 'lead', midi: pool[i], d: last ? 4 : 2, vel: (0.11 + 0.02 * k) * g, bright: 0.5, nudge: 0, body: cv.body || 0 });
      else addEv(barStart + pos, { kind: 'pluck', midi: pool[i], dur: last ? q * 1.8 : q * 0.5, vel: 0.17 * g, pan: k % 2 ? 0.25 : -0.25 });
    });
    setMemo(target); return;
  }
  if (style === 'SWELL') {                     // one held note that grows into the next, a crescendo into the target
    addEv(barStart, { kind: 'lead', midi: pool[seq[0]], d: 8, vel: 0.08 * g, bright: 0.3, nudge: 0, body: 0.6 });
    addEv(barStart + 8, { kind: 'lead', midi: target, d: 8, vel: 0.14 * g, bright: 0.9, nudge: 0, body: 0.6 });
    setMemo(target); return;
  }
  if (style === 'ROLL') {                      // a quick rolled run up the chord tones that lands on the target
    const idxs = [iTo - 3, iTo - 2, iTo - 1, iTo].map(i => leadClamp(i, 0, n - 1));
    idxs.forEach((i, k) => addEv(barStart + 9 + k, { kind: 'pluck', midi: pool[i], dur: k === 3 ? q * 2 : q * 0.5, vel: (0.13 + 0.025 * k) * g, pan: k % 2 ? 0.25 : -0.25, soft: k > 0 }));
    setMemo(target); return;
  }
  seq.forEach((i, k) => {
    const pos = 12 - 3 * (L - 1 - k), isLast = k === L - 1;
    const pan = k % 2 === 0 ? -0.3 : 0.3;
    const dur = isLast ? q * 1.8 : q * 0.9;
    if (style === 'DOUBLESTOP') {
      const top = pool[i];
      let partner = null;
      for (const off of [2, 3, 1]) {
        const j = i - off; if (j < 0) continue;
        const iv = top - pool[j];
        if (iv >= 3 && ![11, 13, 14].includes(iv)) { partner = pool[j]; break; }
      }
      if (partner != null) addEv(barStart + pos, { kind: 'pluck', midi: partner, dur, vel: 0.19 * g, pan: -0.2, nudge: 0 });
      addEv(barStart + pos, { kind: 'pluck', midi: top, dur, vel: 0.2 * g, pan: 0.2, nudge: partner != null ? 0.018 : 0, soft: partner != null });
    } else {
      const j = i > 0 ? i - 1 : i + 1;
      const j2 = Math.abs(pool[j] - pool[i]) < 3 && i > 1 ? i - 2 : j;
      addEv(barStart + pos, { kind: 'pluck', midi: pool[j2], dur: q * 0.5, vel: 0.2 * g, pan });
      addEv(barStart + pos, { kind: 'pluck', midi: pool[i], dur, vel: 0.2 * g, pan: -pan, nudge: getQuarterNoteSec() * 0.25 * 0.5, soft: true });
    }
  });
  setMemo(target);
}

function leadPart(barStart, riffArr, build, o = {}) {
  const pool = o.pool || leadLoopPool, n = pool.length, chord = getActiveChord();
  let riff = riffArr.slice();
  const hits = riff.map((v, i) => v >= 0 ? i : -1).filter(i => i >= 0);
  if (o.thin) hits.forEach((i, k) => { if (k % 2 === 1 && k !== hits.length - 1) riff[i] = -1; });
  if (o.vary && Math.random() < 0.4 && hits.length > 2) {
    const i = leadPick(hits.slice(1, -1)); riff[i] = leadClamp(riff[i] + leadPick([-1, 1]), 0, 6);
  }
  const last = riff.map((v, i) => v >= 0 ? i : -1).filter(i => i >= 0).pop();
  const stable = stableIdxs(pool, chord);
  riff.forEach((deg, step) => {
    if (deg < 0) return;
    let idx = deg % n;
    if (o.end && step === last) idx = nearestOf(stable, idx);          // the closing bar lands on the root or fifth
    const isLong = step === riff.lastIndexOf(deg);
    const vel = (0.12 + 0.05 * build) * (isLong ? 1.08 : 1) * (0.93 + Math.random() * 0.14);
    addEv(barStart + step, { kind: 'lead', midi: pool[idx], d: isLong ? 4 : 2, vel, bright: build, nudge: step === 0 ? 0 : (Math.random() - 0.5) * 0.012, idx, body: o.body || 0 });
    setMemo(pool[idx]);
  });
}


// ---------- phrases: one way to write, vary and play every line ----------
// A phrase is a list of notes { s: start in sixteenths (fractions allowed, so 32nds and triplets work), deg: index into
// a pool, d: length in sixteenths, lane: which pool, vel: relative loudness, off: semitone offset for approach notes }.
// A voice says how a phrase is played: { kind: 'lead' | 'pluck' | 'bell' | 'hb', pool, body }.
const G_POOLS = () => ({ hi: leadLoopPool, mid: leadLoopPoolMid, low: leadLoopPoolLow, wide: leadLoopPoolWide });
const sixteenthSec = () => getQuarterNoteSec() * 0.25;
// 0 at 118 BPM and above, 1 at 68 BPM and below: how much extra movement the music needs to feel as busy as it does fast
const slowness = () => leadClamp((118 - masterBpm) / 50, 0, 1);

// PACE: how busy the line is, as one curve per idea that can only move a little each bar. A faster passage is built toward
// over several bars (the curve ramps up before a peak) and slowed out of the same way, instead of changing bar by bar at random.
const PACE_STEP = 0.17;
function buildPaceCurve(P, start) {
  const sl = slowness(), c = [];
  for (let i = 0; i < 16; i++) {
    const ms = moodState(P, i), E = leadClamp(P.arc[i] * (0.5 + 0.6 * ms.energy), 0.12, 0.95);
    c.push(leadClamp(E * 0.85 + 0.3 * sl, 0.05, 1));
  }
  for (let i = 14; i >= 0; i--) c[i] = leadClamp(c[i], c[i + 1] - PACE_STEP, c[i + 1] + PACE_STEP);      // ramp up to peaks
  if (start != null) c[0] = leadClamp(c[0], start - PACE_STEP, start + PACE_STEP);
  for (let i = 1; i < 16; i++) c[i] = leadClamp(c[i], c[i - 1] - PACE_STEP, c[i - 1] + PACE_STEP);      // and ease out of them
  return c;
}
const canDouble = () => sixteenthSec() >= 0.115;                        // 130 BPM and under
const paceOrn = pc => leadClamp((0.04 + 0.7 * Math.pow(pc, 1.6)) * leadClamp(sixteenthSec() / 0.13, 0.35, 1), 0, 0.85);
const thinPhrase = (ph, drop) => ph.filter((n, i) => i === 0 || i === ph.length - 1 || n.d >= 2 || Math.random() > drop);

function riffToPhrase(riff, lane) {
  const hits = []; riff.forEach((deg, s) => { if (deg >= 0) hits.push({ s, deg }); });
  return hits.map((h, k) => ({ s: h.s, deg: h.deg, d: Math.min(4, k + 1 < hits.length ? hits[k + 1].s - h.s : 4), lane }));
}
function walkDegs(len, start, lo, hi) {
  const out = []; let d = start;
  for (let i = 0; i < len; i++) { out.push(d); d = leadClamp(d + leadPick([-2, -1, -1, 1, 1, 2]), lo, hi); }
  return out;
}
const cumSteps = (groups, from = 0) => { const out = []; let s = from; groups.forEach(g => { out.push(s); s += g; }); return out.filter(x => x < 16); };

// 32nd runs, triplet turns, chromatic approaches and double hits placed just before notes; more of them the slower the tempo
function ornamentPhrase(ph, prob, color, slope = 0) {
  const out = [];
  ph.forEach((nt, k) => {
    const prev = ph[k - 1];
    if (k > 0 && nt.s - prev.s >= 2 && Math.random() < prob * (1 + slope * (nt.s / 8 - 1))) {
      const r = Math.random(), lane = nt.lane;
      if (r < 0.4) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        out.push({ s: nt.s - 1, deg: nt.deg - 2 * dir, d: 0.5, vel: 0.5, lane, orn: 1, host: nt }, { s: nt.s - 0.5, deg: nt.deg - dir, d: 0.5, vel: 0.6, lane, orn: 1, host: nt });
      } else if (r < 0.65) {
        out.push({ s: nt.s - 1, deg: nt.deg + 1, d: 0.33, vel: 0.45, lane, orn: 1, host: nt }, { s: nt.s - 0.67, deg: nt.deg, d: 0.33, vel: 0.5, lane, orn: 1, host: nt }, { s: nt.s - 0.33, deg: nt.deg - 1, d: 0.33, vel: 0.55, lane, orn: 1, host: nt });
      } else if (color && r < 0.85) {
        out.push({ s: nt.s - 0.5, deg: nt.deg, off: -1, d: 0.5, vel: 0.55, lane, orn: 1, host: nt });
      } else {
        out.push({ s: nt.s - 0.5, deg: nt.deg, d: 0.5, vel: 0.5, lane, orn: 1, host: nt });
      }
    }
    out.push(nt);
  });
  return out;
}
// play the line twice in the bar at double speed, the second time bent a little: same bar, twice the movement
function doubleTimePhrase(ph) {
  const shift = leadPick([1, 2, -1]);
  const a = ph.map(n => ({ ...n, s: n.s * 0.5, d: Math.max(0.5, n.d * 0.5) }));
  const b = ph.map((n, i) => ({ ...n, s: 8 + n.s * 0.5, d: i === ph.length - 1 ? 4 : Math.max(0.5, n.d * 0.5), deg: i === ph.length - 1 ? n.deg : n.deg + (i % 2 ? shift : 0) }));
  return a.concat(b);
}
function compressPhrase(ph, base) { return ph.map(n => ({ ...n, s: base + n.s * 0.5, d: Math.max(0.5, n.d * 0.5) })); }

// the answer in the caller's own voice: the same line turned upside down, lifted, reversed or dropped, landing home
function transformPhrase(ph, voice, kind) {
  const pools = G_POOLS(), chord = getActiveChord();
  const out = ph.map(x => ({ ...x }));
  const byLane = {};
  out.forEach(x => { const k = x.lane || voice.pool; (byLane[k] = byLane[k] || []).push(x); });
  Object.keys(byLane).forEach(k => {
    const pool = pools[k], n = pool.length, arr = byLane[k], first = arr[0].deg;
    const degs = arr.map(x => x.deg);
    arr.forEach((x, i) => {
      if (kind === 'invert') x.deg = 2 * first - x.deg + 1;
      else if (kind === 'lift') x.deg = x.deg + 2;
      else if (kind === 'fall') x.deg = x.deg - 2;
      else x.deg = degs[degs.length - 1 - i];            // reverse
      x.deg = leadClamp(x.deg, 0, n - 1);
    });
    const last = arr[arr.length - 1];
    last.deg = nearestOf(stableIdxs(pool, chord), last.deg); last.d = Math.max(last.d, 4);
  });
  if (Math.random() < 0.4) out.forEach(x => { x.s += 2; });
  return out.filter(x => x.s <= 15);
}

function emitNote(step0, voice, midi, d, E, vmul, nudge, pan) {
  const q = getQuarterNoteSec();
  const step = step0;
  const A = (s, ev) => addEv(s, Object.assign(ev, { q: true }));
  if (voice.kind === 'lead') A(step, { kind: 'lead', midi, d, vel: (0.12 + 0.05 * E) * vmul * (0.93 + Math.random() * 0.14), bright: E, nudge, body: voice.body || 0 });
  else if (voice.kind === 'pluck') A(step, { kind: 'pluck', midi, dur: q * (0.35 + 0.1 * d), vel: (0.11 + 0.08 * E) * vmul, pan: pan != null ? pan : (Math.random() - 0.5) * 0.5, nudge });
  else if (voice.kind === 'bell') A(step, { kind: 'bell', midi, dur: q * (1.2 + 0.15 * d), vel: (0.12 + 0.05 * E) * vmul, pan: pan != null ? pan : (Math.random() - 0.5) * 0.6, nudge });
  else A(step, { kind: 'hb', midi, d: Math.max(1, d), vel: 0.25 * vmul * (0.92 + Math.random() * 0.16), soft: d <= 2, pan: (Math.random() - 0.5) * 0.24, nudge });
}
function renderPhrase(bs, ph, voice, E, o = {}) {
  const pools = G_POOLS(), u = sixteenthSec();
  // lock the line to the subdivision: structural notes to the grid, short ones to the finer grid, ornaments ride with their note
  const cp = new Map(); ph.forEach(n => cp.set(n, { ...n, _s: n.s }));
  const sorted = Array.from(cp.values()).sort((a, b) => a.s - b.s);
  const g = SUBDIV_GRID[currentSubdiv] || SUBDIV_GRID['1/8'], occ = new Set();
  sorted.forEach(nt => {
    if (nt.orn) return;
    const L = nt.d >= 2 ? g[0] : g[1], lane = nt.lane || voice.pool, key = c => lane + '|' + Math.round(c * 12);
    let c = snapToGrid(nt._s, L);
    if (c < 0) c += L;
    if (c > 15.001 || occ.has(key(c))) { const alt = c + (c < nt._s ? L : -L); c = (alt >= 0 && alt <= 15.001 && !occ.has(key(alt))) ? alt : (occ.has(key(nt._s)) ? c : nt._s); }
    nt.s = c; occ.add(key(c));
  });
  sorted.forEach(nt => { if (nt.orn && nt.host && cp.get(nt.host)) { const h = cp.get(nt.host); nt.s = Math.max(0, h.s - (h._s - nt._s)); } });
  sorted.sort((a, b) => a.s - b.s);
  sorted.forEach(nt => {
    const pool = pools[nt.lane || voice.pool];
    if (!pool || !pool.length) return;
    const idx = leadClamp(Math.round(nt.deg), 0, pool.length - 1);
    const midi = pool[idx] + (nt.off || 0);
    const st = Math.floor(nt.s + 1e-6), nudge = (nt.s - st) * u + (nt.s % 1 === 0 && st > 0 ? (Math.random() - 0.5) * 0.01 : 0);
    if (st < 0 || st > 15) return;
    emitNote(bs + st, voice, midi, nt.d, E, nt.vel || 1, nudge, nt.pan);
    // a second voice a third or so below: harmony, only on notes long enough to carry it
    if (o.harm && nt.d >= 2 && !nt.off && st < 14) {
      const j = idx - 2;
      if (j >= 0) {
        const iv = pool[idx] - pool[j];
        if (iv >= 3 && ![11, 13, 14].includes(iv)) emitNote(bs + st, voice, pool[j], nt.d, E, (nt.vel || 1) * 0.55, nudge + 0.008, nt.pan);
      }
    }
  });
  const lastNote = sorted[sorted.length - 1];
  if (lastNote) { const pool = pools[lastNote.lane || voice.pool]; cd.memo = pool[leadClamp(Math.round(lastNote.deg), 0, pool.length - 1)]; cd.lastMidi = cd.memo; }
}

// ---------- genre licks: what each idiom plays when it calls ----------
const MORE_RIFFS = {
  JAZZ: [[2, -1, 3, 4, -1, -1, 5, -1, 4, -1, 2, 3, -1, -1, 1, -1], [-1, 4, -1, 5, 3, -1, -1, 4, -1, 2, -1, -1, 3, 1, -1, -1], [4, -1, -1, 5, -1, 3, -1, -1, 6, -1, 4, -1, 2, -1, -1, -1]],
  EMO:  [[4, 2, 3, -1, 4, 5, -1, 3, -1, 2, -1, -1, 0, 2, -1, -1], [0, 2, 4, 2, 0, 2, 4, -1, 5, 4, 2, -1, -1, -1, -1, -1], [3, -1, 4, -1, 5, -1, 4, 3, -1, 2, -1, -1, 3, -1, -1, -1]],
  LOFI: [[3, -1, -1, 2, -1, -1, 0, -1, -1, -1, 2, -1, 3, -1, -1, -1], [-1, 0, -1, -1, 2, -1, 3, -1, -1, -1, 4, -1, 3, -1, 2, -1], [2, -1, -1, -1, 4, -1, 3, -1, -1, -1, 2, -1, -1, 0, -1, -1]]
};
const RHYTHM_THEMES = [[0, 4, 8, 12], [0, 6, 8, 14], [0, 4, 8, 10, 12], [0, 8, 12], [0, 3, 6, 8, 12]];

// each returns { ph, voice }
const GENRE_LICKS = {
  MATHROCK(E, o) {
    const groups = leadPick([[3, 3, 3, 3, 2, 2], [3, 3, 2, 3, 3, 2], [5, 5, 3, 3], [2, 3, 3, 3, 3, 2], [3, 3, 3, 3, 4]]);
    const low = cumSteps(groups), off = leadPick([1, 1, 2]);
    const high = low.map(s => s + off).filter(s => s < 16);
    const use = o.thin ? 4 : 99;
    const ld = walkDegs(low.length, 1, 0, 4), hd = walkDegs(high.length, 4, 2, 6);
    const ph = [];
    low.slice(0, use).forEach((s, i) => ph.push({ s, deg: ld[i], d: 2, lane: 'mid', pan: -0.32, vel: i === 0 ? 1.15 : 1 }));
    high.slice(0, use).forEach((s, i) => ph.push({ s, deg: hd[i], d: 2, lane: 'hi', pan: 0.32 }));
    return { ph, voice: { kind: 'pluck', pool: 'mid' } };
  },
  JAZZ(E, o) {
    const riff = o.dev ? cd.prem.riffs.JAZZ2 : cd.prem.riffs.JAZZ;
    return { ph: riffToPhrase(riff, 'mid'), voice: { kind: 'lead', pool: 'mid', body: 0.45 } };
  },
  EMO(E, o) {
    const riff = o.dev ? cd.prem.riffs.EMO2 : cd.prem.riffs.EMO;
    return { ph: riffToPhrase(riff, 'low'), voice: { kind: 'lead', pool: 'low', body: 1 } };
  },
  LOFI(E, o) {
    const riff = o.dev ? cd.prem.riffs.LOFI2 : cd.prem.riffs.LOFI;
    return { ph: riffToPhrase(riff, 'mid'), voice: { kind: 'lead', pool: 'mid', body: 0.8 } };
  },
  PROCESSIONAL(E, o) {
    const th = cd.prem.theme, rh = leadPick(RHYTHM_THEMES), shift = 2 + (cd.callN % 2);
    const ph = rh.map((s, i) => ({ s, deg: th[i % th.length] + shift + (i >= th.length ? 1 : 0), d: i === rh.length - 1 ? 6 : 4, lane: 'hi' }));
    return { ph: o.thin ? ph.slice(0, 2) : ph, voice: { kind: 'bell', pool: 'hi' } };
  },
  POSTROCK(E, o) {
    const len = leadPick([3, 3, 4, 5]), cell = walkDegs(len, 0, 0, 5);
    const n = o.thin ? 4 : 8, base = cd.callN % 2;
    const ph = []; for (let k = 0; k < n; k++) ph.push({ s: k * 2, deg: cell[k % len] + base, d: 2, lane: 'mid', vel: k % len === 0 ? 1.2 : 1, pan: k % 2 ? 0.25 : -0.25 });
    return { ph, voice: { kind: 'pluck', pool: 'mid' } };
  },
  HOMEBOUND(E, o) {
    const pool = leadLoopPoolMid, n = pool.length;
    const ph = []; let step = 0, last = Math.floor(n * 0.5), prev = null, count = 0;
    while (count < 3) {
      const fits = HB_CELLS.filter(c => c !== prev && step + c.durs.reduce((a, b) => a + b, 0) <= 13);
      if (!fits.length) break;
      const cell = leadPick(fits); prev = cell; count++;
      const lo = -Math.min(...cell.steps), hi = n - 1 - Math.max(...cell.steps);
      const s0 = lo > hi ? lo : leadClamp(last + leadPick([-1, 0, 1]), lo, hi);
      cell.steps.forEach((st, k) => { ph.push({ s: step, deg: leadClamp(s0 + st, 0, n - 1), d: cell.durs[k], lane: 'mid' }); step += cell.durs[k]; });
      last = leadClamp(s0 + cell.steps[cell.steps.length - 1], 0, n - 1);
      step += leadPick([1, 2]);
      if (step > 11) break;
    }
    const lastN = ph[ph.length - 1];
    if (lastN) { lastN.deg = nearestOf(stableIdxs(pool, getActiveChord()), lastN.deg); lastN.d = 4; }
    return { ph, voice: { kind: 'hb', pool: 'mid' } };
  }
};

// the contrasting answers (chords, stabs, swells) keep their own voices; tapped cascade is the emo answer

function respOpen(bs, E, o) {
  const { wide } = G_POOLS(), q = getQuarterNoteSec(), n = wide.length;
  const anchor = idxNear(wide, cd.memo);
  const b = leadClamp(anchor - 3 + (o.variant ? 1 : 0), 0, Math.max(0, n - 6));
  const idxs = [b, b + 2, b + 3, b + 5].map(i => leadClamp(i, 0, n - 1));
  [0, leadPick([6, 8, 10])].forEach((step, s) => idxs.forEach((i, k) =>
    addEv(bs + step, { kind: 'pluck', midi: wide[i], dur: q * 2.4, vel: (0.14 + 0.07 * E) * (s ? 0.8 : 1) * (1 - 0.04 * k), pan: k % 2 ? 0.28 : -0.28, nudge: k * 0.03 })));
  setMemo(wide[idxs[3]]);
}

function respComp(bs, E, o) {
  const { mid } = G_POOLS(), q = getQuarterNoteSec(), n = mid.length;
  const anchor = idxNear(mid, cd.memo);
  const stabs = leadPick([[3, 6, 10, 13], [2, 5, 9, 12], [3, 7, 11], [2, 6, 8, 13], [0, 3, 6, 10, 13]]);
  let top = cd.memo;
  stabs.forEach((st, k) => {
    const b = leadClamp(anchor - 2 + (k === 2 ? 1 : 0), 0, Math.max(0, n - 5));
    [b, b + 2, b + 4].forEach((i, j) => addEv(bs + st, { kind: 'pluck', midi: poolAt(mid, i), dur: q * 0.4, vel: (0.14 + 0.06 * E) * (1 - 0.05 * j), pan: j % 2 ? 0.2 : -0.2, nudge: j * 0.012 }));
    top = poolAt(mid, b + 4);
  });
  setMemo(top);
}

function respLofi(bs, E, o) {
  const { mid } = G_POOLS(), q = getQuarterNoteSec(), n = mid.length;
  const anchor = idxNear(mid, cd.memo);
  addEv(bs, { kind: 'pluck', midi: poolAt(mid, anchor - 1), dur: q * 0.4, vel: 0.16, pan: -0.15 });
  addEv(bs, { kind: 'pluck', midi: poolAt(mid, anchor), dur: q * 1.2, vel: 0.16, pan: 0.15, nudge: q * 0.125, soft: true });
  const b = leadClamp(anchor - 1, 0, Math.max(0, n - 5));
  [b, b + 2, b + 4].forEach((i, k) => addEv(bs + 4, { kind: 'pluck', midi: poolAt(mid, i), dur: q * 2.2, vel: (0.14 + 0.05 * E) * (1 - 0.05 * k), pan: k % 2 ? 0.25 : -0.25, nudge: k * 0.035 }));
  addEv(bs + 12, { kind: 'pluck', midi: poolAt(mid, b + 2), dur: q * 1.6, vel: 0.1, pan: 0, soft: true });
  setMemo(poolAt(mid, b + 4));
}

function respProc(bs, E, o) {
  const { wide, mid } = G_POOLS(), q = getQuarterNoteSec(), n = wide.length;
  const anchor = idxNear(wide, cd.memo);
  const b = leadClamp(anchor - 4, 0, Math.max(0, n - 5));
  [b, b + 2, b + 4].forEach((i, k) => addEv(bs, { kind: 'pluck', midi: wide[leadClamp(i, 0, n - 1)], dur: q * 3.4, vel: (0.14 + 0.06 * E) * (1 - 0.05 * k), pan: k % 2 ? 0.25 : -0.25, nudge: k * 0.06 }));
  const held = poolAt(mid, idxNear(mid, cd.memo) + (o.variant ? 1 : 0));
  addEv(bs + 8, { kind: 'lead', midi: held, d: 6, vel: 0.1 + 0.04 * E, bright: E * 0.7, nudge: 0, body: 0.6 });
  setMemo(held);
}

function respPost(bs, E, o) {
  const { mid } = G_POOLS();
  const a = idxNear(mid, cd.memo);
  addEv(bs, { kind: 'lead', midi: poolAt(mid, a + 1), d: 8, vel: 0.1 + 0.05 * E, bright: E, nudge: 0, body: 0.5 });
  addEv(bs + 8, { kind: 'lead', midi: poolAt(mid, a + (o.variant ? 3 : 2)), d: 8, vel: 0.11 + 0.06 * E, bright: Math.min(1, E + 0.1), nudge: 0, body: 0.5 });
  setMemo(poolAt(mid, a + (o.variant ? 3 : 2)));
}


// ---------- openings, closings, calls and answers ----------
// a rolled chord in the genre's own plucked voice
function chordPart(bs, kind) {
  const pool = leadLoopPoolMid, n = pool.length, chord = getActiveChord(), q = getQuarterNoteSec();
  const st = stableIdxs(pool, chord);
  if (kind === 'open') {
    const b = leadClamp(st[0], 0, Math.max(0, n - 6));
    const idxs = [b, b + 2, b + 3, b + 5].map(i => leadClamp(i, 0, n - 1));
    [[0, 1], [8, 0.75]].forEach(([step, g]) => idxs.forEach((i, k) =>
      addEv(bs + step, { kind: 'pluck', midi: pool[i], dur: q * 3, vel: 0.15 * g * (1 - 0.05 * k), pan: k % 2 ? 0.25 : -0.25, nudge: k * 0.04 })));
    setMemo(pool[idxs[3]]);
  } else {
    const picks = st.slice(-3);
    picks.forEach((i, k) => addEv(bs, { kind: 'pluck', midi: pool[i], dur: q * 4.5, vel: 0.13 * (1 - 0.06 * k), pan: k % 2 ? 0.2 : -0.2, nudge: k * 0.06 }));
    const rootI = st[0];
    addEv(bs + 4, { kind: 'lead', midi: pool[rootI], d: 12, vel: 0.1, bright: 0.2, nudge: 0, body: 0.6 });
    setMemo(pool[rootI]);
  }
}
function openPart(bs, G) {
  if (G.open === 'bells') bellsPart(bs, 'statement');
  else if (G.open === 'tapped') tappedPart(bs, 0);
  else chordPart(bs, 'open');
}
function closePart(bs, G) {
  if (G.close === 'bells') bellsPart(bs, 'cadence');
  else chordPart(bs, 'close');
}

// the call: the genre's lick, with runs and a double-time pass added in proportion to how slow the tempo is
function playCall(bs, E, G, o) {
  const pc = cd.paceNow, slope = cd.paceSlope;
  let { ph: base, voice } = G.lick(E, o);
  if (pc < 0.3 && !o.thin) base = thinPhrase(base, 0.5);                // a slow passage leaves space
  if (microcosmMode === 'HAZE' && !o.thin) base = thinPhrase(base, 0.25).map(n => ({ ...n, d: Math.min(8, n.d * 1.4) }));   // haze: fewer, longer notes
  const dbl = !o.thin && canDouble() && pc > 0.6;
  let ph = dbl ? doubleTimePhrase(base) : base;
  ph = ornamentPhrase(ph, paceOrn(pc), G.color, slope);
  renderPhrase(bs, ph, voice, E, { harm: Math.random() < 0.12 + 0.3 * E });
  cd.callPh = base; cd.callVoice = voice; cd.callDbl = dbl; cd.callN++;
  return dbl ? 'DOUBLE TIME' : '';
}

// the answer: in the caller's own voice (a turned-around version of the line) or in contrast (the genre's chords or stabs)
function playResponse(bs, E, G, o) {
  const haveCall = cd.callPh && cd.callVoice, pc = cd.paceNow;
  // a busy passage keeps moving through the answer instead of dropping to a few chords
  if (haveCall && Math.random() < leadClamp(cd.ms.unity + (pc > 0.55 ? 0.3 : 0), 0, 0.95)) {
    const kind = leadPick(['invert', 'lift', 'fall', 'reverse']);
    let ph = transformPhrase(cd.callPh, cd.callVoice, kind);
    if (canDouble() && pc > 0.6) ph = doubleTimePhrase(ph);
    ph = ornamentPhrase(ph, paceOrn(pc * 0.9), G.color, cd.paceSlope);
    renderPhrase(bs, ph, cd.callVoice, E * 0.9, { harm: Math.random() < 0.25 });
    return 'SAME VOICE (' + kind + ')';
  }
  G.contrast(bs, E, o);
  return 'CONTRAST';
}

// when the pace is high at a slow tempo a call and its answer share one bar, a half bar each
function playTrade(bs, E, G, o) {
  const { ph: base, voice } = G.lick(E, o);
  const kind = leadPick(['invert', 'lift', 'fall', 'reverse']);
  const callH = compressPhrase(base, 0), ansH = compressPhrase(transformPhrase(base, voice, kind), 8);
  const p = paceOrn(cd.paceNow);
  renderPhrase(bs, ornamentPhrase(callH, p, G.color), voice, E, { harm: Math.random() < 0.2 });
  renderPhrase(bs, ornamentPhrase(ansH, p, G.color), voice, E * 0.9, { harm: Math.random() < 0.3 });
  cd.callPh = base; cd.callVoice = voice; cd.callDbl = false; cd.callN++;
}

const GENRES = {
  MATHROCK:     { label: 'MATH ROCK',    lick: GENRE_LICKS.MATHROCK,     contrast: respOpen, bass: 'pulse', open: 'tapped', close: 'chord', layer: 'counter', color: true },
  JAZZ:         { label: 'JAZZ FUSION',  lick: GENRE_LICKS.JAZZ,         contrast: respComp, bass: 'walk',  open: 'chord',  close: 'chord', layer: 'both',    color: true },
  EMO:          { label: 'MIDWEST EMO',  lick: GENRE_LICKS.EMO,          contrast: (bs, E, o) => tappedPart(bs, o.variant ? 1 : 0), bass: 'half', open: 'tapped', close: 'chord', layer: 'counter', color: true },
  LOFI:         { label: 'LO-FI',        lick: GENRE_LICKS.LOFI,         contrast: respLofi, bass: 'lofi',  open: 'chord',  close: 'chord', layer: 'counter' },
  PROCESSIONAL: { label: 'PROCESSIONAL', lick: GENRE_LICKS.PROCESSIONAL, contrast: respProc, bass: 'pedal', open: 'bells',  close: 'bells', layer: 'shimmer' },
  POSTROCK:     { label: 'POST-ROCK',    lick: GENRE_LICKS.POSTROCK,     contrast: respPost, bass: 'pedal', open: 'bells',  close: 'bells', layer: 'shimmer' },
  HOMEBOUND:    { label: 'HOMEBOUND',    lick: GENRE_LICKS.HOMEBOUND,    contrast: respOpen, bass: 'half',  open: 'bells',  close: 'bells', layer: 'both' }
};

// ---------- bass: a warm line under anything that sits high ----------
const BASS_PATTERNS = {
  pedal: [[0, 'R', 14, 1], [8, '5', 8, 0.6]],
  half:  [[0, 'R', 8, 1], [8, '5', 8, 0.8]],
  pulse: [[0, 'R', 3, 1], [3, 'R', 3, 0.7], [6, '5', 2, 0.8], [8, 'R', 3, 1], [11, '5', 3, 0.7], [14, 'R', 2, 0.8]],
  walk:  [[0, 'R', 4, 1], [4, '5', 4, 0.8], [8, '8', 4, 0.9], [12, '5', 4, 0.8]],
  lofi:  [[0, 'R', 6, 1], [7, 'R', 2, 0.5], [8, '5', 4, 0.8], [11, 'R', 4, 0.7]]
};
const bassRootMidi = chord => { const pc = ((noteToMidi(chord.notes[0]) % 12) + 12) % 12; return 43 + (((pc - 43) % 12) + 12) % 12; };

function bassPart(bs, patKey, E) {
  const chord = getActiveChord(), root = bassRootMidi(chord);
  const nxt = peekNextChordObj();
  const nextRoot = nxt !== chord ? bassRootMidi(nxt) : null;
  const pat = BASS_PATTERNS[patKey] || BASS_PATTERNS.half;
  pat.forEach(([step, deg, d, g], k) => {
    let m = deg === 'R' ? root : (deg === '5' ? root + 7 : root + 12);
    if (m > 57) m -= 12;
    if (nextRoot != null && k === pat.length - 1 && step >= 8) m = nextRoot;     // lean into the next chord on the last hit
    addEv(bs + step, { kind: 'bass', midi: m, d, vel: (0.07 + 0.04 * E) * g, nudge: 0 });
  });
}

// ---------- layers: other motifs joining in the gaps, only on notes that fit everything nearby ----------
const CONSONANT = [0, 3, 4, 5, 7, 8, 9];
function layerPart(bs, E, role, G) {
  if (role.startsWith('bridge') || role === 'open' || role === 'close' || role === 'breath') return;
  const prob = Math.min(0.95, (role.startsWith('call') ? 0.65 : 0.4) * (0.4 + 0.8 * cd.ms.energy) * (1 + 1.2 * heldLong()) * cd.prem.layerChance);   // layers join more the longer a chord stays; some ideas have none
  if (Math.random() > prob) return;
  const fg = cd.barEvs.filter(e => e.ev.kind !== 'cloud' && e.ev.kind !== 'bass');
  if (!fg.length) return;
  const mids = fg.map(e => e.ev.midi).sort((a, b) => a - b);
  const median = mids[Math.floor(mids.length / 2)], lowest = mids[0], highest = mids[mids.length - 1];
  const occupied = new Set();
  fg.forEach(e => { occupied.add(e.step - 1); occupied.add(e.step); occupied.add(e.step + 1); });
  const free = []; for (let s = 0; s < 16; s++) if (!occupied.has(s)) free.push(s);
  if (free.length < 2) return;
  const fits = (m, s) => fg.every(e => {
    if (Math.abs(e.step - s) > 6) return true;
    const iv = Math.abs(m - e.ev.midi);
    return iv >= 5 && CONSONANT.includes(iv % 12);
  });
  const q = getQuarterNoteSec();
  const wide = leadLoopPoolWide;
  const kind = G && G.layer !== 'both' ? G.layer : (median >= 72 ? leadPick(['counter', 'counter', 'shimmer']) : leadPick(['shimmer', 'shimmer', 'counter']));
  if (kind === 'shimmer') {
    const cands = wide.filter(m => m >= Math.max(76, highest + 5));
    const steps = free.filter(s => s >= 6);
    if (!cands.length || !steps.length) return;
    const s = leadPick(steps), m = leadPick(cands.filter(c => fits(c, s)).concat([]));
    if (m == null) return;
    addEv(bs + s, { kind: 'bell', midi: m, dur: q * 2.4, vel: 0.1 + 0.03 * E, pan: s % 2 ? 0.45 : -0.45 });
  } else {
    const cands = wide.filter(m => m <= lowest - 5 && m >= 50);
    if (!cands.length) return;
    const picks = free.filter((s, i) => i % 2 === 0).slice(0, 3);
    picks.forEach((s, k) => {
      const ok = cands.filter(c => fits(c, s));
      if (ok.length) addEv(bs + s, { kind: 'pluck', midi: ok[(k + Math.floor(Math.random() * ok.length)) % ok.length], dur: q * 0.8, vel: 0.085 + 0.03 * E, pan: k % 2 ? 0.3 : -0.3 });
    });
  }
}

function sectionName(pos) { return pos < 4 ? 'BEGINNING' : (pos < 12 ? 'VERSE' : 'END'); }

// ---------- the other forms: held drifting notes, a repeating cell, a build ----------
// notes placed on the subdivision grid (structural) with the fractional part carried as a nudge
function placeNote(bs, s, voice, midi, d, E, vmul = 1) {
  const g = SUBDIV_GRID[currentSubdiv] || SUBDIV_GRID['1/8'];
  let sp = snapToGrid(s, g[0]); if (sp > 15.001) sp -= g[0]; if (sp < 0) sp = 0;
  const whole = Math.floor(sp + 1e-6);
  emitNote(bs + whole, voice, midi, d, E, vmul, (sp - whole) * sixteenthSec());
}
function sustainVoice(G) { return G.open === 'bells' ? { kind: 'bell', pool: 'mid' } : { kind: 'lead', pool: 'mid', body: 1 }; }
function cellVoice(gName) {
  if (gName === 'PROCESSIONAL' || gName === 'POSTROCK' || gName === 'MATHROCK') return { kind: 'pluck', pool: 'mid' };
  if (gName === 'HOMEBOUND') return { kind: 'hb', pool: 'mid' };
  return { kind: 'lead', pool: 'mid', body: 0.7 };
}
// a few long notes moving by step through the chord's tones, ending on a stable one
function driftPart(bs, E, G) {
  const pool = leadLoopPoolMid, n = pool.length, chord = getActiveChord(), st = stableIdxs(pool, chord), vc = sustainVoice(G);
  const steps = leadPick([[0, 8], [0, 6, 11], [0, 8, 12], [2, 10], [0, 5, 10]]);
  let i = idxNear(pool, cd.memo);
  steps.forEach((s, k) => {
    i = leadClamp(i + leadPick([-2, -1, 1, 1, 2]), 0, n - 1);
    if (k === steps.length - 1) i = nearestOf(st, i);
    const d = Math.min(12, (k + 1 < steps.length ? steps[k + 1] : 16) - s);
    placeNote(bs, s, vc, pool[i], d, E, 0.9);
    if (k === 0 && Math.random() < 0.6) addEv(bs + 2, { kind: 'cloud', midi: pool[i], scale: 0.8 });
  });
  setMemo(pool[i]);
}
// a short cell repeated through the bar; the bars that follow bend it a little
function cellPart(bs, E, G, gName, variant) {
  const pool = leadLoopPoolMid, n = pool.length, vc = cellVoice(gName);
  if (!cd.cell) { const len = leadPick([3, 4, 5]); cd.cell = { degs: walkDegs(len, 2, 0, Math.min(5, n - 1)), sp: leadPick([2, 2, 3]), rep: 0 }; }
  const c = cd.cell, len = c.degs.length;
  const shift = variant ? leadPick([1, 2, -1]) : 0;
  c.rep++;
  const st = stableIdxs(pool, getActiveChord());
  let k = 0;
  for (let s = 0; s < 16; s += c.sp, k++) {
    const last = s + c.sp >= 16;
    let deg = c.degs[k % len] + (k >= len ? shift : 0) + (variant && k % len === len - 1 ? 1 : 0);
    deg = leadClamp(deg, 0, n - 1);
    if (last) deg = nearestOf(st, deg);
    placeNote(bs, s, vc, pool[deg], last ? 4 : c.sp, E, k % len === 0 ? 1.15 : 0.95);
    cd.memo = pool[deg]; cd.lastMidi = cd.memo;
  }
}
// a rising run that fills the bar a little more each time
function buildPart(bs, E, G, gName, k) {
  const pool = leadLoopPoolMid, n = pool.length, vc = cellVoice(gName), st = stableIdxs(pool, getActiveChord());
  const spots = [[0, 8], [0, 4, 8, 12], [0, 2, 4, 6, 8, 10, 12, 14], [0, 2, 4, 6, 8, 10, 12, 13, 14, 15]][k - 1];
  const climb = (n - 1) / spots.length * (0.5 + 0.2 * k);
  const deg = leadClamp(Math.round(1 + (k - 1) * 0.6), 0, n - 1);
  spots.forEach((s, j) => {
    const d = leadClamp(Math.round(deg + j * climb), 0, n - 1), last = j === spots.length - 1;
    placeNote(bs, s, vc, last ? nearestOf(pool.filter((_, ix) => st.includes(ix)), pool[d]) : pool[d], k === 1 ? 6 : 2, E, 0.8 + 0.1 * k + j * 0.01);
  });
  const lastD = pool[leadClamp(Math.round(deg + (spots.length - 1) * climb), 0, n - 1)];
  cd.memo = nearestOf(pool.filter((_, ix) => st.includes(ix)), lastD); cd.lastMidi = cd.memo;
}
function breathPart(bs, E, G) {
  const pool = leadLoopPoolMid, st = stableIdxs(pool, getActiveChord());
  if (Math.random() < 0.6) placeNote(bs, leadPick([0, 4]), sustainVoice(G), pool[leadPick(st)], 12, E, 0.6);
  addEv(bs + 4, { kind: 'cloud', midi: pool[leadPick(st)], scale: 0.9 });
}

// ---------- AUTOPILOT: the lead loop steers the engine ----------
// While the lead loop plays it moves tempo, subdivision, grain mode and the sliders along with the idea: a build quickens and
// brightens, a drift slows, opens the reverb and lets the grains lead, every idea slows into its close. Changes are small steps
// each bar. Anything you touch yourself is left alone for 45 seconds, and your tempo becomes the new home tempo.
const AUTO = { on: true, hold: {}, anchor: null };
const AUTO_HOLD_MS = 45000;
document.addEventListener('input', e => {
  if (!e.isTrusted || !e.target || !e.target.id || e.target.id.indexOf('g-') !== 0) return;
  const id = e.target.id.slice(2);
  AUTO.hold[id] = performance.now() + AUTO_HOLD_MS;
  if (id === 'bpmSlider') AUTO.anchor = parseFloat(e.target.value);
}, true);
document.addEventListener('click', e => {
  if (!e.isTrusted || !e.target || !e.target.closest || !e.target.closest('#gridPanel')) return;
  if (e.target.closest('.micro-mode-btn')) AUTO.hold.mode = performance.now() + AUTO_HOLD_MS;
  if (e.target.closest('.subdiv-btn')) AUTO.hold.subdiv = performance.now() + AUTO_HOLD_MS;
  if (e.target.closest('#g-tapTempoBtn')) { AUTO.hold.bpmSlider = performance.now() + AUTO_HOLD_MS; setTimeout(() => { AUTO.anchor = masterBpm; }, 50); }
}, true);
function autoSlide(id, target, maxStep) {
  if (AUTO.hold[id] > performance.now()) return;
  const el = $g(id); if (!el) return;
  const lo = parseFloat(el.min), hi = parseFloat(el.max), step = parseFloat(el.step) || 0.01;
  const cur = parseFloat(el.value), tgt = leadClamp(target, lo, hi);
  let next = cur + leadClamp(tgt - cur, -maxStep, maxStep);
  next = Math.round(next / step) * step;
  if (Math.abs(next - cur) < step * 0.5) return;
  el.value = next; el.dispatchEvent(new Event('input'));
}
function autopilot(P, pos, ms, E) {
  if (!AUTO.on || !leadLoopOn || !ctx) return;
  const now = performance.now(), free = k => !(AUTO.hold[k] > now);
  const arc = P.arc[pos], en = ms.energy, form = P.form;
  // tempo: a home tempo, and a gentle shape around it
  if (AUTO.anchor == null) AUTO.anchor = masterBpm;
  if (free('bpmSlider')) {
    let f;
    if (form === 'BUILD') f = pos < 8 ? 0.1 * (pos / 8) : 0.1 - 0.12 * ((pos - 8) / 8);
    else if (form === 'DRIFT') f = -0.06 + 0.03 * Math.sin(pos / 16 * 6.283);
    else if (form === 'GROOVE') f = 0.02 * Math.sin(pos / 16 * 12.566);
    else f = 0.05 * (arc - 0.5);
    if (pos >= 13) f -= 0.04 * ((pos - 12) / 3);                              // every idea eases into its close
    const target = leadClamp(AUTO.anchor * (1 + f), AUTO.anchor * 0.88, AUTO.anchor * 1.1);
    const step = Math.round(leadClamp(target - masterBpm, -2, 2));
    if (step) setMasterBpm(masterBpm + step);
  }
  // subdivision follows the mood, changed twice per idea
  if (free('subdiv') && (pos === 0 || pos === 8)) {
    const want = ambientOn ? leadPick(['1/8.', '1/8', '1/8']) : en < 0.4 ? leadPick(['1/8.', '1/8', '1/8']) : en > 0.75 ? leadPick(['1/16', '1/8T', '1/8']) : leadPick(['1/8', '1/8', '1/8T', '1/8.']);
    if (want !== currentSubdiv) { const b = document.querySelector(`.subdiv-btn[data-subdiv="${want}"]`); if (b) b.click(); }
  }
  // grain mode: haze for calm and drifting, mosaic for the middle, glitch-arp only at lively peaks
  if (free('mode') && pos % 4 === 0) {
    const want = (ambientOn || form === 'DRIFT' || en < 0.4) ? (ambientOn && form === 'GROOVE' ? 'MOSAIC' : 'HAZE') : (en > 0.78 && arc > 0.6 ? 'ARP' : (form === 'GROOVE' ? 'MOSAIC' : leadPick(['MOSAIC', 'MOSAIC', 'HAZE'])));
    if (want !== microcosmMode) { const b = document.querySelector(`.micro-mode-btn[data-mode="${want}"]`); if (b) b.click(); }
  }
  const val = WHEEL[ms.name] ? WHEEL[ms.name][0] : 0.4;
  autoSlide('granularMixSlider', 0.35 + 0.45 * arc + (form === 'DRIFT' ? 0.15 : 0), 0.06);              // shimmer
  autoSlide('motifLevelSlider', ambientOn ? 0.4 + 0.25 * E : 0.5 + 0.35 * E, 0.04);                                                    // expression
  autoSlide('droneLevelSlider', ambientOn ? 0.8 + 0.1 * (1 - arc) : 0.7 + 0.2 * (1 - arc), 0.03);
  autoSlide('spaceReverbSlider', (ambientOn ? 0.8 : 0.7) + 0.1 * (1 - arc) + (form === 'DRIFT' ? 0.12 : 0), 0.03);
  autoSlide('warmthFilterSlider', ambientOn ? 1500 + 1500 * arc : 1800 + 2400 * arc, 250);
  autoSlide('lofiTextureSlider', val < 0.3 ? 0.45 : 0.3, 0.03);
  autoSlide('subAnchorSlider', 0.55 + 0.25 * arc, 0.04);
  if (pos === 0 && free('chordHoldSlider')) autoSlide('chordHoldSlider', (ambientOn ? 1.4 : 1) * { DRIFT: 16, BUILD: 8, GROOVE: 12, EXCHANGE: 10 }[form] + Math.round((Math.random() - 0.5) * 4), 24);
}
function releaseTempo() {
  if (AUTO.anchor != null && !(AUTO.hold.bpmSlider > performance.now()) && isPlaying) setMasterBpm(AUTO.anchor);
}
$g('autopilotBtn').addEventListener('click', () => {
  AUTO.on = !AUTO.on;
  AUTO.anchor = masterBpm;
  const b = $g('autopilotBtn');
  b.classList.toggle('on', AUTO.on);
});

// ---------- the grain modes colour the lead ----------
// Every melodic note can leave a trace in the granular engine, always on tones of the sounding chord: MOSAIC answers with
// quiet octave echoes on the subdivision, HAZE blooms long notes into a soft cloud, ARP (glitch) gives strong-beat notes
// a short ratchet. The Granular Shimmer slider is their level.
function lensEcho(ev, midi, when) {
  if (!ctx || !granularBus || !cd) return;
  const chord = getActiveChord(), times = getSubdivSeconds(currentSubdiv), E = cd.lastE || 0.5;
  const f = 440 * Math.pow(2, (midi - 69) / 12), sf = x => snapFreqToChord(Math.min(x, 1800), chord);
  const long = (ev.d || 0) >= 2 || (ev.dur || 0) >= getQuarterNoteSec() * 0.75, pan = (Math.random() - 0.5) * 1.2;
  if (microcosmMode === 'MOSAIC') {
    if (Math.random() < 0.35 * (0.6 + E)) {
      triggerGrain(sf(f * 2), when + times.primary, Math.max(0.12, times.primary * 0.8), pan, 'sine', 0.045, false);
      if (long && Math.random() < 0.5) triggerGrain(sf(f), when + times.secondary, Math.max(0.12, times.primary), -pan, 'triangle', 0.035, false);
    }
  } else if (microcosmMode === 'HAZE') {
    if (long && Math.random() < 0.55) triggerGrain(sf(f), when + 0.03, Math.min(2.4, times.half * 1.6), pan * 0.6, 'triangle', 0.05, true);
  } else if (microcosmMode === 'ARP') {
    if (long && Math.random() < 0.3 * (0.6 + E)) {
      const gap = getQuarterNoteSec() * 0.125;
      for (let r = 1; r <= 3; r++) triggerGrain(sf(r === 3 ? f * 1.5 : f), when + r * gap, gap * 0.8, r % 2 ? pan : -pan, 'sine', 0.05 - r * 0.01, false);
    }
  }
}

function conductBar(barStart) {
  if (!cd) { cd = { bar: 0, prem: null, next: null, no: 1, lastMidi: null, memo: null, over: {}, recent: [], callN: 0, barEvs: [], barStart: 0, forceRoles: [] }; cd.prem = newPremise(null); }
  const pos = cd.bar % 16;
  if (pos === 0 && cd.bar > 0) { cd.prem = cd.next || newPremise(cd.prem); cd.next = null; cd.no++; cd.callN = 0; cd.cell = null; }
  if (pos === 8 && !cd.next) cd.next = newPremise(cd.prem);
  const P = cd.prem;
  cd.barEvs = []; cd.barStart = barStart;
  let role = cd.forceRoles && cd.forceRoles.length ? cd.forceRoles.shift() : P.plan[pos];
  const gName = genreAt(P, pos);
  const G = GENRES[gName];
  if (pos === 0 || !cd.pace) { cd.pace = buildPaceCurve(P, cd.endPace); cd.endPace = cd.pace[15]; }
  cd.paceNow = cd.pace[pos];
  cd.paceSlope = leadClamp((cd.pace[Math.min(15, pos + 1)] - cd.pace[Math.max(0, pos - 1)]) * 2.5, -0.8, 0.8);
  const ms = cd.ms = moodState(P, pos);
  const E = leadClamp(P.arc[pos] * (0.5 + 0.6 * ms.energy), 0.12, 0.95);
  cd.lastE = E;
  autopilot(P, pos, ms, E);
  const nextRole = P.plan[(pos + 1) % 16];
  const nextDeg = nextRole === 'open' ? 4 : 3;

  // a motif asked for by hand takes the next free response bar or bridge
  if (role.startsWith('resp') && cd.over.answer) role = 'resp-x';
  if (role.startsWith('bridge') && cd.over.bridge) role = 'bridge-x';

  let label = '';
  if (role === 'open') { openPart(barStart, G); label = 'OPENING · ' + G.label; }
  else if (role === 'drift') { driftPart(barStart, E, G); label = 'DRIFT · ' + G.label; }
  else if (role === 'breath') { breathPart(barStart, 0.2, G); label = 'BREATH'; }
  else if (role === 'swell') { bridgePart(barStart, 'SWELL', false, nextDeg); label = 'SWELL'; }
  else if (role === 'cell' || role === 'cell-var') { cellPart(barStart, E, G, gName, role === 'cell-var'); label = (role === 'cell' ? 'CELL' : 'CELL, BENT') + ' · ' + G.label; }
  else if (role.startsWith('build-')) { buildPart(barStart, E, G, gName, parseInt(role.split('-')[1], 10)); label = 'BUILD ' + role.split('-')[1] + '/4 · ' + G.label; }
  else if (role === 'close') { closePart(barStart, G); label = 'CLOSING · ' + G.label; }
  else if (role.startsWith('call')) {
    const thin = role === 'call-thin' || role === 'call-end', dev = role === 'call-dev';
    if (!thin && canDouble() && cd.paceNow > 0.72 && slowness() > 0.4) { playTrade(barStart, E, G, { thin, dev }); label = 'CALL + ANSWER TRADED IN ONE BAR · ' + G.label; }
    else {
      const extra = playCall(barStart, E, G, { thin, dev, end: role === 'call-end' });
      label = (thin ? 'CALL (SKETCH)' : 'CALL') + (extra ? ' · ' + extra : '') + ' · ' + G.label;
    }
  } else if (role === 'resp-x') {
    const style = cd.over.answer; delete cd.over.answer;
    if (style === 'BELLS') bellsPart(barStart, 'statement'); else if (style === 'HOMEBOUND') homeboundPart(barStart); else tappedPart(barStart, 0);
    label = 'RESPONSE (YOURS): ' + style;
  } else if (role.startsWith('resp')) {
    const how = playResponse(barStart, E, G, { variant: role === 'resp-2' });
    label = 'RESPONSE · ' + how + ' · ' + G.label;
  } else {
    const bi = role === 'bridge-x' ? 0 : parseInt(role.split('-')[1], 10);
    const style = role === 'bridge-x' ? cd.over.bridge : P.bridges[bi];
    if (role === 'bridge-x') delete cd.over.bridge;
    bridgePart(barStart, style, bi === 2, nextDeg);
    const names = { DOUBLESTOP: 'DOUBLE STOPS', HAMMER: 'PULL-OFFS', WALK: 'A WALK', SWELL: 'A SWELL', ROLL: 'A ROLLED RUN' };
    label = 'BRIDGE: ' + names[style];
  }

  layerPart(barStart, E, role, G);
  // the bass joins whatever sits high, and always holds the opening and the close
  const fgMids = cd.barEvs.filter(e => e.ev.kind !== 'cloud' && e.ev.kind !== 'bass').map(e => e.ev.midi).sort((a, b) => a - b);
  const median = fgMids.length ? fgMids[Math.floor(fgMids.length / 2)] : 0;
  if (role === 'open' || role === 'close') bassPart(barStart, 'pedal', E);
  else if (median >= 69) bassPart(barStart, role.startsWith('bridge') ? 'half' : G.bass, E);

  const statusEl = $g('motifStatusText');
  if (statusEl) {
    const gs = P.palette.map(x => GENRES[x].label).join(' + ');
    statusEl.textContent = `IDEA ${cd.no} · "${P.title}" · ${ms.name.toUpperCase()}${ms.n > 1 ? ' (' + (ms.i + 1) + '/' + ms.n + ')' : ''} · ${FORM_LABELS[P.form]} · ${gs} · ${sectionName(pos)} ${pos + 1}/16 · PACE ${Math.round(cd.paceNow * 100)}% · ${label}`;
  }
  cd.bar++;
}

// a motif asked for by hand joins the structure at the next fitting bar instead of landing on top of it
function conductorRequest(style) {
  if (!cd || !style) return;
  if (style === 'TAPPED' || style === 'HOMEBOUND' || style === 'BELLS') cd.over.answer = style;
  else if (style === 'DOUBLESTOP' || style === 'HAMMER') cd.over.bridge = style;
}

// The pad glides to a new chord, so the first melodic notes after a change wait for it: up to 0.3 s late, easing back
// to on-time over the next 0.45 s (the order and spacing of notes is kept).
function settleAfterChange(when) {
  const x = when - lastChordChangeAt;
  return (lastChordChangeAt > 0 && x >= 0 && x < 0.45) ? when + 0.3 * (1 - x / 0.45) : when;
}
function playConductorEvent(ev, t, sixteenth) {
  const midi = (ev.kind === 'lead' || ev.kind === 'hb') ? foldSynthMidi(ev.midi) : ev.midi;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  let when = Math.max(ctx.currentTime, t + (ev.nudge || 0));
  if (ev.kind !== 'bass' && ev.kind !== 'cloud') when = settleAfterChange(when);
  if (ev.kind !== 'bass' && ev.kind !== 'cloud') lensEcho(ev, midi, when);
  if (ev.kind === 'lead') {
    playJazzLeadVoice(freq, when, sixteenth * ev.d, ev.vel, leadLoopBus, ev.bright, ev.body || 0);
    queueConstellationNode(freq, when, 0, false, '');
  } else if (ev.kind === 'hb') {
    playLeadVoice(freq, when, sixteenth * ev.d, ev.vel, ev.pan || 0, leadLoopBus, 0.4, ev.soft);
    queueConstellationNode(freq, when, ev.pan || 0, false, '');
  } else if (ev.kind === 'bell') {
    playExpressiveMotifNote(freq, when, ev.dur, { velocity: ev.vel, pan: ev.pan || 0, isBell: true, noteLabel: '' });
  } else if (ev.kind === 'pluck') {
    playExpressiveMotifNote(freq, when, ev.dur, { velocity: ev.vel, pan: ev.pan || 0, slideFromFreq: ev.soft ? freq : null, noteLabel: '' });
  } else if (ev.kind === 'bass') {
    playBassNote(freq, when, sixteenth * ev.d, ev.vel);
  } else if (ev.kind === 'cloud') {
    spawnMicrocosmCloud(freq, when, getActiveChord(), ev.scale || 0.8);
  }
}

// A note written against one chord can land after the chord has moved on (a transition inside the bar).
// If its pitch class doesn't belong to the chord sounding now, it slides to the nearest tone that does.
let snapPoolChord = null, snapPool = [], snapPcs = new Set();
function repitchToChord(ev, chord) {
  if (!ev.src || ev.src === chord || ev.kind === 'bass' || ev.kind === 'cloud') return ev;
  if (snapPoolChord !== chord) {
    snapPool = buildLeadPool(chord, 46, 90, 20); snapPoolChord = chord;
    snapPcs = new Set(snapPool.map(m => m % 12));
  }
  if (!snapPool.length || snapPcs.has(((ev.midi % 12) + 12) % 12)) return ev;
  if (cd) cd.snapped = (cd.snapped || 0) + 1;
  return Object.assign({}, ev, { midi: nearestOf(snapPool, ev.midi) });
}

function leadLoopStep(stepCount, t) {
  if (!ctx || !leadLoopBus) return;
  // the pools follow the chord on the next beat after it changes (changes land on the bar line)
  const chord = getActiveChord();
  const first = !leadLoopPoolChord;
  const changed = !first && leadLoopPoolChord.src !== chord && stepCount % 4 === 0;
  if (first || changed) {
    const sh = registerShift(chord);
    const pool = buildLeadPool(chord, 65 + sh, 84 + sh);
    if (pool.length >= 5) {
      leadLoopPool = pool; leadLoopPoolWide = buildLeadPool(chord, 58 + sh, 84 + sh, 12);
      leadLoopPoolMid = buildLeadPool(chord, 58 + sh, 77 + sh, 8); leadLoopPoolLow = buildLeadPool(chord, 46 + sh, 69 + sh, 9);
      leadLoopPoolChord = { src: chord };
    }
  }
  if (leadLoopPool.length < 5) return;

  const barIdx = Math.floor(stepCount / 16);
  if (barIdx !== leadPlannedBar) {
    leadPlannedBar = barIdx;
    if (stepCount % 16 === 0 && (leadLoopOn || soloBars > 0)) {                       // the conductor starts on a bar line; the pad swells with its arc
      conductBar(barIdx * 16);
      if (leadLoopOn) padSwell(cd.lastE, t); else soloBars--;
    }
  }
  const evs = leadScript.get(stepCount);
  if (!evs) return;
  leadScript.delete(stepCount);
  const sixteenth = getQuarterNoteSec() * 0.25;
  evs.forEach(ev => playConductorEvent(repitchToChord(ev, chord), t, sixteenth));
}

function setLeadLoop(on) {
  if (on && !ctx) initAudio();
  leadLoopOn = on;
  if (!on) releaseTempo();
  if (on) {
    AUTO.anchor = masterBpm;
    ensureLeadLoopBus();
    leadScript = new Map(); leadPlannedBar = -1; leadLoopPoolChord = null; cd = null;
  }
  applyLeadLoopMix();
  const btn = $g('leadLoopBtn');
  btn.classList.toggle('on', on);
  const statusEl = $g('motifStatusText');
  if (on) statusEl.textContent = 'LEAD LOOP: A NEW PREMISE STARTS ON THE NEXT BAR LINE';
  else if (isPlaying) statusEl.textContent = 'MOTIF: BREATHING SPACE...';
}

// --- HOMEBOUND RUN: MOTIFS FROM THE FIRST FIVE SECONDS OF A REFERENCE RECORDING ---
// The opening of the recording is a bouncy, mostly stepwise line in short notes (one sixteenth, some a little longer)
// that climbs, leaps, falls back with a small wobble, skips down into the low register and bounces back up, with
// brief breaths between the little figures. Each cell below is one of those figures, written as moves along the
// chord tones the drone is holding, so it always lands on notes that fit. A run strings two to four cells together
// and plays them with the measured lead voice. Accents fall on the first note and on notes reached by a leap.
const HB_CELLS = [
  { name: 'climb', steps: [0, 1, 2, 4], durs: [1, 1, 1, 2] },
  { name: 'wobble', steps: [0, -1, 0, -1], durs: [3, 3, 2, 2] },
  { name: 'low skip', steps: [0, 1, -3, -2, -3, -4, -2, -4], durs: [1, 1, 1, 2, 1, 1, 1, 1] },
  { name: 'bounce', steps: [0, -3, -3, -2, -6, -7, -4, -7, -6], durs: [2, 1, 1, 1, 1, 1, 1, 1, 1] },
  { name: 'rise and settle', steps: [0, 2, 3, 1, 2], durs: [2, 1, 1, 2, 3] }
];

// the same rub-safe pool the lead uses, one octave lower at the bottom: only notes the drone holds, none a semitone or
// ninth from it, none a semitone from its neighbour
function buildHomeboundPool(chord) {
  { const sh = registerShift(chord); return buildLeadPool(chord, 58 + sh, 84 + sh, 12); }
}

function planHomeboundRun(pool, start, u, chord) {
  const n = pool.length, events = [];
  let t = start, last = Math.floor(n * 0.5), prevCell = null;
  const cellCount = leadPick([2, 3, 3, 4]);
  for (let c = 0; c < cellCount && (t - start) / u < 24; c++) {   // about five seconds at most, like the recording's opening
    const cell = leadPick(HB_CELLS.filter(x => x !== prevCell));
    prevCell = cell;
    const lo = -Math.min(...cell.steps), hi = n - 1 - Math.max(...cell.steps);
    const s = lo > hi ? lo : leadClamp(last + leadPick([-2, -1, 0, 1, 2]), lo, hi);
    cell.steps.forEach((st, k) => {
      const idx = leadClamp(s + st, 0, n - 1);
      const leap = k === 0 || Math.abs(st - cell.steps[k - 1]) >= 3;
      const wob = k > 0 && Math.abs(st - cell.steps[k - 1]) <= 1 && cell.durs[k] <= 2;
      const dur = cell.durs[k] * u;
      events.push({
        time: t + (k === 0 ? 0 : (Math.random() - 0.5) * 0.016),
        dur: dur * 0.97, midi: pool[idx],
        vel: 0.27 * (leap ? 1.15 : (wob ? 0.85 : 1)) * (0.92 + Math.random() * 0.16),   // about 5 dB louder than the lead loop so the run cuts through the drone
        soft: wob
      });
      t += dur;
    });
    last = leadClamp(s + cell.steps[cell.steps.length - 1], 0, n - 1);
    t += leadPick([0, 1, 1, 2, 3]) * u;
  }
  // the run comes to rest on the root or fifth of the chord it is played over, never on a colour tone
  if (chord && events.length) {
    const lastEv = events[events.length - 1];
    const st = stableIdxs(pool, chord);
    lastEv.midi = pool[nearestOf(st, pool.indexOf(lastEv.midi))];
  }
  return events;
}

// AUTO-MIXED: instead of unrelated random motifs, each request is a short exchange from the same conductor the lead loop
// uses (a call and its answer in the idea's genre and mood), starting on the next bar line. Requests that arrive while
// one is still playing are dropped, so nothing ever overlaps.
function startSoloIdea() {
  if (!ctx) initAudio();
  if (soloBars > 0 || leadScript.size) return;
  ensureLeadLoopBus();
  if (!cd) { leadScript = new Map(); leadPlannedBar = -1; leadLoopPoolChord = null; cd = { bar: 0, prem: null, next: null, no: 1, lastMidi: null, memo: null, over: {}, recent: [], callN: 0, barEvs: [], barStart: 0, forceRoles: [] }; cd.prem = newPremise(null); }
  const pos = cd.bar % 16;
  const extended = heldLong() > 0.4 && pos > 0 && pos <= 8;       // a long hold gets a longer conversation: call, answer, a developed call, answer
  cd.forceRoles = pos === 0 ? ['open', 'call-thin'] : pos >= 14 ? ['call-end', 'close']
    : extended ? ['call', 'resp-1', 'call-dev', 'resp-2'] : [pos < 8 ? 'call' : 'call-dev', leadPick(['resp-1', 'resp-2'])];
  soloBars = cd.forceRoles.length;
  const st = $g('motifStatusText');
  if (st) st.textContent = 'AUTO-MIXED: A NEW EXCHANGE STARTS ON THE NEXT BAR LINE';
}

// The harmonic chimes (12th-fret harmonics) come from the drone itself: four tones spread across the harmonic register,
// all pitch classes the pad is holding and none a semitone or a ninth from its upper voices. (The motif notes written
// into the chord list are the original voicing, and a few of them sit outside the drone or rub against it.)
function chimeNotes(chord) {
  const ck = ambientOn ? '_chimeA' : '_chime';
  if (chord[ck]) return chord[ck];
  const sharps = chord.notes.some(n => n.includes('#'));
  let pool = buildLeadPool(chord, 69, 91, 8);
  if (pool.length < 4) pool = buildLeadPool(chord, 60, 91, 8);
  const n = pool.length, picks = [];
  [0, (n - 1) / 3, 2 * (n - 1) / 3, n - 1].forEach(x => { const m = pool[Math.round(x)]; if (m != null) picks.push(m); });
  for (let i = 0; picks.length < 4 && n; i++) picks.push(pool[i % n]);
  chord[ck] = picks.map(m => midiToNoteName(m, sharps));
  return chord[ck];
}

function requestMelodicMotif(forcedStyle = null, auto = false) {
  if (!ctx) initAudio();
  if (ctx.state === 'suspended') ctx.resume();
  if (leadLoopOn) { conductorRequest(forcedStyle || $g('motifStyleSelect').value); return; }   // the conductor places it
  if ((forcedStyle || $g('motifStyleSelect').value) === 'MIXED') { startSoloIdea(); return; }

  // a phrase that starts on its own waits until the previous chord has mostly faded out of the crossfade
  const settle = lastChordChangeAt + 1.0 - ctx.currentTime;
  if (auto && settle > 0) {
    setTimeout(() => { if (isPlaying) requestMelodicMotif(forcedStyle, false); }, settle * 1000);
    return;
  }

  if (isPlaying && quantizeMotifs && masterClockTimer) {
    queuedMotifRequest = { style: forcedStyle };
    const statusEl = $g('motifStatusText');
    if (statusEl) statusEl.textContent = `MOTIF: SYNCING TO ${currentSubdiv} GRID...`;
  } else {
    triggerMelodicMotifPhrase(forcedStyle, ctx.currentTime);
  }
}

function triggerMelodicMotifPhrase(forcedStyle = null, startTime = null) {
  if (!ctx) initAudio();
  if (ctx.state === 'suspended') ctx.resume();

  const chord = getActiveChord();
  const now = startTime !== null ? Math.max(ctx.currentTime, startTime) : ctx.currentTime;
  const times = getSubdivSeconds(currentSubdiv);

  let style = forcedStyle || $g('motifStyleSelect').value;
  if (style === 'MIXED') {
    const styles = ['TAPPED', 'HAMMER', 'BELLS', 'DOUBLESTOP', 'LEAD', 'HOMEBOUND'];
    style = styles[Math.floor(Math.random() * styles.length)];
  }
  // harmonics keep the original voicing; the picked and tapped phrases use notes re-voiced to the drone
  const motifNotes = style === 'BELLS' ? chimeNotes(chord) : chord.fit;

  const statusEl = $g('motifStatusText');
  const ledEl = $g('motifLed');
  ledEl.className = 'w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]';

  if (style === 'TAPPED') {
    statusEl.textContent = `MOTIF: TAPPED CASCADE (${currentSubdiv} @ ${masterBpm} BPM)`;
    const stepTime = Math.min(times.primary, times.quarter * 0.5);
    const count = 5;

    for (let i = 0; i < count; i++) {
      const order = [0, 2, 1, 3, 2];
      const noteName = motifNotes[order[i % order.length]];
      const prevName = motifNotes[order[Math.max(0, i - 1) % order.length]];
      const freq = n2f(noteName);
      playExpressiveMotifNote(freq, now + i * stepTime, times.half * 0.9, {
        velocity: 0.22 - (i * 0.015),
        pan: (i % 2 === 0 ? -0.38 : 0.38),
        slideFromFreq: i % 2 === 1 ? n2f(prevName) : null,
        noteLabel: noteName
      });
    }
    spawnMicrocosmCloud(n2f(motifNotes[2]), now + stepTime * 2, chord, 1.0);

  } else if (style === 'HAMMER') {
    statusEl.textContent = `MOTIF: PULL-OFF TRIPLET (${masterBpm} BPM)`;
    const n1 = motifNotes[1];
    const n2 = motifNotes[3];
    const n3 = motifNotes[2];
    const n0 = motifNotes[0];
    const tStep = times.triplet8 * 0.5;

    playExpressiveMotifNote(n2f(n1), now, times.quarter * 1.2, { velocity: 0.22, pan: -0.25, noteLabel: n1 });
    playExpressiveMotifNote(n2f(n2), now + tStep, times.quarter * 1.2, { velocity: 0.20, pan: 0.25, slideFromFreq: n2f(n1), noteLabel: n2 });
    playExpressiveMotifNote(n2f(n3), now + tStep * 2, times.quarter * 1.4, { velocity: 0.18, pan: -0.15, slideFromFreq: n2f(n2), noteLabel: n3 });
    playExpressiveMotifNote(n2f(n0), now + times.primary, times.half, { velocity: 0.21, pan: 0.1, slideFromFreq: n2f(n3), noteLabel: n0 });
    spawnMicrocosmCloud(n2f(n2), now + times.primary, chord, 1.0);

  } else if (style === 'BELLS') {
    statusEl.textContent = `MOTIF: HARMONIC CHIMES (${currentSubdiv} SYNC)`;
    const bellSpacing = leadLoopOn ? Math.max(times.sixteenth * 2, Math.round(times.primary / times.sixteenth) * times.sixteenth) : times.primary;
    for (let i = 0; i < 3; i++) {
      const noteName = motifNotes[(motifNotes.length - 1 - i) % motifNotes.length];
      const freq = n2f(noteName) * (i === 2 && n2f(noteName) < 1100 ? 2.0 : 1.0);   // the octave harmonic, kept below the shrill range
      playExpressiveMotifNote(freq, now + i * bellSpacing, times.half * 1.3, {
        velocity: 0.18,
        pan: (i - 1) * 0.5,
        isBell: true,
        noteLabel: noteName
      });
    }
    spawnMicrocosmCloud(n2f(motifNotes[3]), now + bellSpacing, chord, 1.0);

  } else if (style === 'DOUBLESTOP') {
    statusEl.textContent = `MOTIF: LO-FI DOUBLE-STOP (${masterBpm} BPM)`;
    const lowA = n2f(motifNotes[0]);
    const highA = n2f(motifNotes[2]);
    const lowB = n2f(motifNotes[1]);
    const highB = n2f(motifNotes[3]);
    const secondHitTime = now + times.secondary;

    playExpressiveMotifNote(lowA, now, times.half * 0.85, { velocity: 0.19, pan: -0.2, noteLabel: motifNotes[0] });
    playExpressiveMotifNote(highA, now + 0.018, times.half * 0.85, { velocity: 0.20, pan: 0.2, slideFromFreq: lowA, noteLabel: motifNotes[2] });

    playExpressiveMotifNote(lowB, secondHitTime, times.half, { velocity: 0.17, pan: -0.3, noteLabel: motifNotes[1] });
    playExpressiveMotifNote(highB, secondHitTime + 0.018, times.half, { velocity: 0.18, pan: 0.3, slideFromFreq: highA, noteLabel: motifNotes[3] });
    spawnMicrocosmCloud(highB, secondHitTime + times.primary, chord, 0.85);

  } else if (style === 'LEAD') {
    statusEl.textContent = `MOTIF: LEAD RIFF (${currentSubdiv} @ ${masterBpm} BPM)`;
    const u = times.primary;
    // simple riffs over the fitted chord tones. 'to' marks a note that can slide in from the one before.
    const RIFFS = [
      [{ n: 1, d: 1 }, { n: 2, d: 1 }, { n: 3, d: 1.5, to: true }, { n: 2, d: 0.5 }, { n: 1, d: 3, to: true }],
      [{ n: 0, d: 1.5 }, { n: 1, d: 0.5 }, { n: 2, d: 1 }, { n: 1, d: 1, to: true }, { n: 0, d: 3 }],
      [{ n: 2, d: 1 }, { n: 3, d: 2, to: true }, { n: 1, d: 1 }, { n: 2, d: 1, to: true }, { n: 0, d: 3, to: true }],
      [{ n: 1, d: 0.5 }, { n: 2, d: 0.5 }, { n: 1, d: 1 }, { n: 3, d: 2, to: true }, { n: 2, d: 3 }]
    ];
    const riff = RIFFS[Math.floor(Math.random() * RIFFS.length)];
    const events = [];
    let t = now;
    riff.forEach((step, i) => {
      const freq = n2f(motifNotes[step.n]);
      const dur = step.d * u * 1.0;
      events.push({ time: t, dur, freq, vel: 0.17 - i * 0.008, label: motifNotes[step.n] });
      t += dur;
    });
    playLeadRiff(events, 0.12);
    spawnMicrocosmCloud(n2f(motifNotes[2]), now + u * 2, chord, 0.7);
  } else if (style === 'HOMEBOUND') {
    statusEl.textContent = `MOTIF: HOMEBOUND RUN (16THS @ ${masterBpm} BPM)`;
    ensureLeadLoopBus();
    const u = getQuarterNoteSec() * 0.25;
    const events = planHomeboundRun(buildHomeboundPool(chord), now, u, chord);
    events.forEach(ev => {
      const freq = 440 * Math.pow(2, (foldSynthMidi(ev.midi) - 69) / 12);
      const pan = (Math.random() - 0.5) * 0.24;
      playLeadVoice(freq, ev.time, ev.dur, ev.vel, pan, leadLoopBus, 0.4, ev.soft);
      queueConstellationNode(freq, ev.time, pan, false, '');
    });
    const mid = events[Math.floor(events.length / 2)];
    spawnMicrocosmCloud(440 * Math.pow(2, (foldSynthMidi(mid.midi) - 69) / 12), now + u * 4, chord, 0.5);
  }

  setTimeout(() => {
    if (isPlaying) {
      statusEl.textContent = 'MOTIF: BREATHING SPACE...';
      ledEl.className = 'w-2 h-2 rounded-full bg-violet-400';
    }
  }, Math.max(1200, times.half * 1000));
}

// How long the current chord has been held, as 0 (just arrived) to 1 (a long hold: about 8 bars or more). The longer a chord
// stays, the more the motifs keep coming, so a long hold is a conversation and not one phrase followed by silence.
const heldLong = () => leadClamp((chordElapsedSeconds / (getQuarterNoteSec() * 4) - 2.5) / 6, 0, 1);

function scheduleNextMotif() {
  if (!isPlaying) return;
  clearTimeout(motifSchedulerTimeout);

  const sparsity = parseFloat($g('motifSparsitySlider').value);
  const barMs = getQuarterNoteSec() * 4 * 1000;
  const long = heldLong();
  const minWait = ((1.05 - sparsity) * (barMs * 1.6) + (barMs * 0.5)) * (1 - 0.55 * long);
  const jitter = Math.random() * (barMs * 0.5);

  motifSchedulerTimeout = setTimeout(() => {
    if (!isPlaying) return;
    if (leadLoopOn) { scheduleNextMotif(); return; }   // while the lead loop runs, the conductor plays every motif
    if (Math.random() <= Math.min(0.97, sparsity + 0.15 + 0.5 * heldLong())) {
      // the chimes keep coming when the lead riff or the Homebound run is the chosen motif
      const chosen = $g('motifStyleSelect').value;
      if ((chosen === 'LEAD' || chosen === 'HOMEBOUND') && Math.random() < 0.5) requestMelodicMotif('BELLS', true);
      else requestMelodicMotif(null, true);
    }
    scheduleNextMotif();
  }, minWait + jitter);
}

// --- 6. TEMPO-SYNCED HOLOGRAM MICROCOSM GRANULAR ENGINE (MOSAIC / HAZE / GLITCH-ARP) ---
let grainSnapChord = null, grainSnapPool = [];
function snapFreqToChord(f, chord) {
  if (!chord) return f;
  if (grainSnapChord !== chord) { grainSnapPool = buildLeadPool(chord, 36, 100, 40); grainSnapChord = chord; }
  if (!grainSnapPool.length) return f;
  const m = 69 + 12 * Math.log2(f / 440);
  return 440 * Math.pow(2, (nearestOf(grainSnapPool, m) - 69) / 12);
}
function spawnMicrocosmCloud(baseFreq, startTime, chord, intensityScale = 1.0) {
  if (!ctx) return;
  const times = getSubdivSeconds(currentSubdiv);
  const tg = (f, ...rest) => triggerGrain(snapFreqToChord(f, chord), ...rest);   // every grain is a tone of the sounding chord
  const safeStart = Math.max(ctx.currentTime, startTime);
  if (leadLoopOn) intensityScale *= 0.35;   // fewer micro-loop grains while the lead loop is running

  if (microcosmMode === 'MOSAIC') {
    const stepA = times.primary;
    const grainDurA = Math.max(0.12, stepA * 0.85);
    for (let i = 0; i < 6; i++) {
      const harmonicMult = (i % 2 === 0) ? 2.0 : (i === 3 ? 0.5 : 1.0);
      const noteFromChord = n2f(chord.motif[i % chord.motif.length]);
      const freq = Math.min(2600, (i % 3 === 0 ? baseFreq : noteFromChord) * harmonicMult);
      const gTime = safeStart + (i * stepA);
      const pan = (i % 2 === 0 ? -0.68 : 0.68);
      tg(freq, gTime, grainDurA, pan, 'sine', 0.08 * intensityScale, false);
    }

    const stepB = times.triplet8;
    for (let j = 0; j < 3; j++) {
      const freqB = Math.min(2800, baseFreq * (j === 1 ? 2.0 : 1.5));
      const gTimeB = safeStart + (j * stepB) + (stepB * 0.5);
      const panB = (j - 1) * 0.55;
      tg(freqB, gTimeB, stepB * 0.9, panB, 'triangle', 0.055 * intensityScale, false);
    }

  } else if (microcosmMode === 'HAZE') {
    const tripletSpacing = times.triplet8;
    const swellDur = times.half;
    const dottedDur = times.dottedQuarter;

    chord.motif.slice(0, 4).forEach((nStr, idx) => {
      const baseNoteFreq = n2f(nStr);
      const ratio = idx === 1 ? 1.5 : (idx === 3 ? 2.0 : 1.0);
      const gFreq = Math.min(2200, baseNoteFreq * ratio);
      const gTime = safeStart + (idx * tripletSpacing);
      const dur = (idx % 2 === 0) ? swellDur : dottedDur;
      const pan = ((idx / 3) * 1.4) - 0.7;
      tg(gFreq, gTime, dur, pan, 'triangle', 0.068 * intensityScale, true);
    });

  } else if (microcosmMode === 'ARP') {
    const ratchetStep = (currentSubdiv === '1/16' || currentSubdiv === '1/8T')
      ? times.thirtySecond
      : times.sixteenth;
    const ratchetCount = 4;
    for (let r = 0; r < ratchetCount; r++) {
      const rTime = safeStart + (r * ratchetStep);
      const rPan = (r % 2 === 0) ? -0.75 : 0.75;
      tg(
        baseFreq * (r === ratchetCount - 1 ? 2.0 : 1.0),
        rTime,
        ratchetStep * 0.82,
        rPan,
        'sine',
        (0.085 - r * 0.012) * intensityScale,
        false
      );
    }

    const arpStep = times.primary;
    const ratios = [1.0, 1.5, 2.0, 3.0, 2.0, 1.5];
    for (let step = 0; step < 6; step++) {
      const chordTone = n2f(chord.motif[step % chord.motif.length]);
      const ratio = ratios[step % ratios.length];
      const arpFreq = Math.min(3100, (step % 2 === 0 ? chordTone : baseFreq) * (ratio > 2.0 ? 2.0 : ratio));
      const arpTime = safeStart + (ratchetCount * ratchetStep) + (step * arpStep);
      const arpPan = (step % 2 === 0) ? -0.8 : 0.8;
      tg(
        arpFreq,
        arpTime,
        arpStep * 0.72,
        arpPan,
        step % 2 === 0 ? 'sine' : 'triangle',
        0.09 * intensityScale,
        false
      );
    }
  }
}

function triggerGrain(freq, time, duration, pan, type = 'sine', peak = 0.07, drift = false) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const panner = ctx.createStereoPanner();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (drift) {
    osc.frequency.linearRampToValueAtTime(freq * 1.004, time + duration * 0.5);
    osc.frequency.linearRampToValueAtTime(freq * 0.998, time + duration);
  }

  panner.pan.setValueAtTime(Math.max(-0.95, Math.min(0.95, pan)), time);

  const attackRatio = drift ? 0.42 : 0.22;
  env.gain.setValueAtTime(0.0001, time);
  env.gain.linearRampToValueAtTime(peak, time + duration * attackRatio);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc.connect(env);
  env.connect(panner);
  panner.connect(granularBus);

  osc.start(time);
  osc.stop(time + duration + 0.04);

  const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
  setTimeout(() => {
    granularHalos.push({
      x: (pan * 0.4 + 0.5) * window.innerWidth,
      y: (1 - Math.min(0.9, Math.max(0.15, (freq - 80) / 1600))) * window.innerHeight,
      r: drift ? 10 : 5,
      maxR: drift ? 165 : 85,
      alpha: 0.6,
      hue: microcosmMode === 'MOSAIC' ? 190 : (microcosmMode === 'HAZE' ? 275 : 42)
    });
  }, delayMs);
}

// --- 7. PROGRESSION CYCLE TIMER & MARKOV DRIFT ---
function startProgressionClock() {
  clearInterval(chordCycleInterval);
  chordElapsedSeconds = 0;

  chordCycleInterval = setInterval(() => {
    if (!isPlaying || isFrozen || transition) return;
    chordElapsedSeconds += 0.25;
    const holdTarget = holdSecondsFor(currentChordIdx);

    const activeBar = document.querySelector(`[data-chord-progress="${currentChordIdx}"]`);
    if (activeBar) {
      const pct = Math.min(100, (chordElapsedSeconds / holdTarget) * 100);
      activeBar.style.width = `${pct}%`;
    }

    if (chordElapsedSeconds >= holdTarget) {
      if (leadLoopOn && masterClockTimer) { chordAdvancePending = true; return; }   // wait for the next bar line
      advanceChordNow();
    }
  }, 250);
}
// Chords don't all stay the same length: a plan per pass through the progression mixes quick changes (one or two bars)
// that land on a chord which then stays for a while, steady holds, and long holds. The slider sets the typical length.
let holdPlan = [], holdPlanProg = -1;
function planHolds() {
  const n = PROGRESSIONS[currentProgIdx].chords.length, plan = [];
  const quick = () => ({ bars: leadPick([1, 1, 2]) }), long = () => ({ mult: 2.2 + Math.random() * 0.9 }), steady = () => ({ mult: 0.8 + Math.random() * 0.4 });
  while (plan.length < n) {
    const r = Math.random();
    if (r < 0.32) plan.push(quick(), quick(), quick(), long());
    else if (r < 0.5) plan.push(quick(), quick(), long());
    else if (r < 0.68) plan.push(long());
    else if (r < 0.82) plan.push(steady(), quick());
    else plan.push(steady(), steady());
  }
  holdPlan = plan.slice(0, n); holdPlanProg = currentProgIdx;
}
function holdSecondsFor(idx) {
  if (holdPlanProg !== currentProgIdx || holdPlan.length !== PROGRESSIONS[currentProgIdx].chords.length) planHolds();
  const base = parseFloat($g('chordHoldSlider').value), barSec = getQuarterNoteSec() * 4;
  const h = holdPlan[idx] || { mult: 1 };
  if (ambientOn) return Math.max(16, base * (h.bars ? 1.2 : h.mult * 1.5));   // ambient chords sit for a long, unhurried time
  const bars = h.bars || Math.max(1, Math.round(h.mult * base / barSec));
  return Math.max(barSec * 0.7, bars * barSec - 0.3);
}
let chordAdvancePending = false;
function advanceChordNow() {
  chordAdvancePending = false;
  {
    {
      chordElapsedSeconds = 0;
      const totalChords = PROGRESSIONS[currentProgIdx].chords.length;

      if (markovDrift) {
        const candidates = [
          (currentChordIdx + 1) % totalChords,
          (currentChordIdx + 2) % totalChords,
          (currentChordIdx + totalChords - 1) % totalChords,
          0
        ];
        currentChordIdx = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        currentChordIdx = (currentChordIdx + 1) % totalChords;
      }

      if (currentChordIdx === 0) planHolds();      // a new pass gets a new rhythm of changes
      crossfadeToChordDrone(currentProgIdx, currentChordIdx);
    }
  }
}


// --- 7b. TRANSITION CHORDS BETWEEN PROGRESSIONS ---
// Going from one progression to another used to jump straight into chords of the new key, so a major to minor switch
// was heard as a hard cut. Now the move is a glide through the notes the two chords have in common. The third is
// what makes a chord sound major or minor, so the bridges leave it out: the old chord first thins to a hollow sus
// voicing on its own root (same root, no third), then a pivot voicing is chosen by search to share as many notes as
// possible with both the old and the new chord, and last the new chord's own hollow voicing waits just below the
// real chord, so its third arrives as a resolution instead of a surprise. Bridges last whole bars (never under about
// 3.5 seconds, so the drone crossfade can be heard) and every change lands on the bar line of the master clock.
const TRANS_SHAPES = {
  sus2: [0, 7, 14, 19, 26],      // root, fifth, ninth: no third at all
  sus6: [0, 7, 14, 21, 26],      // adds a sixth, a warm open colour that is neither major nor minor
  sus4: [0, 7, 12, 17, 26],
  sus9: [0, 7, 17, 22, 26]
};
const TRANS_PCS = { sus2: [0, 2, 7], sus6: [0, 2, 7, 9], sus4: [0, 2, 5, 7], sus9: [0, 2, 5, 7, 10] };
const TRANS_SUFFIX = { sus2: 'sus2', sus6: '6sus2', sus4: 'sus4', sus9: 'sus9' };

function makeBridgeChord(pc, shape, sharps, mood) {
  let R = pc + 36; if (R > 45) R -= 12;
  const notes = TRANS_SHAPES[shape].map(i => midiToNoteName(R + i, sharps));
  const rootName = midiToNoteName(R, sharps).replace(/-?\d+$/, '');
  const motif = notes.slice(1).map(nm => { let m = noteToMidi(nm); while (m < 67) m += 12; while (m > 84) m -= 12; return midiToNoteName(m, sharps); });
  const c = { name: rootName + TRANS_SUFFIX[shape], mood, notes, motif, bridge: true };
  c.fit = fitMotifToDrone(c);
  return c;
}

function buildTransition(fromChord, toChord) {
  const pcsOf = c => new Set(c.notes.map(n => ((noteToMidi(n) % 12) + 12) % 12));
  const F = pcsOf(fromChord), T = pcsOf(toChord);
  const t = noteToMidi(toChord.notes[0]) % 12, s0 = noteToMidi(fromChord.notes[0]) % 12;
  const sharps = toChord.notes.some(n => n.includes('#'));
  const mk = (pc, shape, mood) => makeBridgeChord(((pc % 12) + 12) % 12, shape, sharps, mood);

  // pivot: the thirdless voicing that keeps the most notes from both sides and adds the fewest foreign ones
  let best = null, bestScore = -Infinity;
  for (let r = 0; r < 12; r++) {
    for (const shape of Object.keys(TRANS_PCS)) {
      const pcs = TRANS_PCS[shape].map(x => (x + r) % 12);
      let sc = 0;
      pcs.forEach(pc => {
        const inF = F.has(pc), inT = T.has(pc);
        if (inF && inT) sc += 3; else if (inF || inT) sc += 1; else sc -= 3;
      });
      if (r === s0 || r === t) sc -= 2;                      // a different root from the two ends, so the bass moves
      sc += Math.random() * 0.6;                              // so the same switch is not always bridged the same way
      if (sc > bestScore) { bestScore = sc; best = { r, shape }; }
    }
  }
  const hollowFrom = () => mk(s0, leadPick(['sus2', 'sus6']), 'Bridge: Dissolving');
  const pivot = () => mk(best.r, best.shape, 'Bridge: Common Ground');
  const hollowTo = () => mk(t, leadPick(['sus2', 'sus6']), 'Bridge: Opening');
  const r = Math.random();
  const plans = r < 0.25 ? [[pivot]] : (r < 0.65 ? [[hollowFrom, pivot], [pivot, hollowTo]] : [[hollowFrom, pivot, hollowTo]]);
  const beatSec = getQuarterNoteSec();
  const minBeats = Math.max(4, 4 * Math.ceil(3.5 / beatSec / 4));
  const plan = leadPick(plans).map(f => ({ chord: f(), beats: Math.max(minBeats, leadPick([4, 8, 8, 12])) }));
  let total = plan.reduce((a, p) => a + p.beats * beatSec, 0);
  for (let k = plan.length - 1; k >= 0 && total > 26; k--) { total -= (plan[k].beats - minBeats) * beatSec; plan[k].beats = minBeats; }
  return plan;
}

// called by the master clock on every beat while a transition is running
function tickTransition(scheduledTime, stepIndex) {
  const tr = transition;
  if (!tr || tr.landed || !ctx) return;
  if (tr.i < 0 && stepIndex !== 0) return;   // the first bridge starts on a bar line
  if (tr.i >= 0) { tr.beatsLeft--; if (tr.beatsLeft > 0) return; }
  tr.i++;
  const delayMs = Math.max(0, (scheduledTime - ctx.currentTime) * 1000);
  // the sounding chord changes right away (so the lead follows on this very bar line); the drone crossfade fires on the beat
  if (tr.i < tr.plan.length) {
    const seg = tr.plan[tr.i];
    tr.beatsLeft = seg.beats;
    activeChordOverride = seg.chord;
    setTimeout(() => {
      if (transition !== tr) return;
      crossfadeToChordDrone(currentProgIdx, currentChordIdx);
      updateChordUI(currentProgIdx, currentChordIdx);
    }, delayMs);
  } else {
    tr.landed = true;
    transition = null; activeChordOverride = null; chordElapsedSeconds = 0;
    setTimeout(() => {
      if (transition) return;
      crossfadeToChordDrone(currentProgIdx, currentChordIdx);
      updateChordUI(currentProgIdx, currentChordIdx);
    }, delayMs);
  }
}

// --- 8. UI RENDERING & INTERACTIVE EVENT BINDINGS ---
function renderProgressionTimeline(progIdx) {
  const container = $g('chordTimelineGrid');
  container.innerHTML = '';
  const chords = PROGRESSIONS[progIdx].chords;

  chords.forEach((c, idx) => {
    const btn = document.createElement('button');
    const isCurrent = !transition && idx === currentChordIdx;
    btn.className = 'gpad' + (isCurrent ? ' cur' : '');
    btn.title = c.name + ' (' + c.notes.slice(0, 4).join(' ') + ')';
    btn.innerHTML = `<small>${String.fromCharCode(65 + Math.floor(idx / 8) % 26)}${(idx % 8) + 1}</small><b>${c.name}</b><i data-chord-progress="${idx}" style="width: ${isCurrent ? '12%' : '0%'}"></i>`;

    btn.addEventListener('click', () => {
      transition = null; activeChordOverride = null;
      currentChordIdx = idx;
      chordElapsedSeconds = 0;
      if (!ctx) initAudio();
      if (!isPlaying) {
        toggleSoundscapeEngine();
      } else {
        crossfadeToChordDrone(currentProgIdx, currentChordIdx);
      }
    });

    container.appendChild(btn);
  });
  if (chords.length > 16 && progIdx === currentProgIdx && container.children[currentChordIdx]) {
    container.scrollTop = Math.max(0, container.children[currentChordIdx].offsetTop - container.children[0].offsetTop - 4);
  }
}

function updateChordUI(progIdx, chordIdx) {
  renderProgressionTimeline(progIdx);
  const chordObj = activeChordOverride || PROGRESSIONS[progIdx].chords[chordIdx];

  $g('activeChordBadge').textContent = chordObj.name;
  $g('activeMoodTag').textContent = chordObj.mood;

  const pillsContainer = $g('voicingPillsContainer');
  pillsContainer.innerHTML = '';

  const allVoicingNotes = [...chordObj.notes, ...chordObj.motif.slice(0, 2)];
  allVoicingNotes.forEach((nStr, i) => {
    const pill = document.createElement('button');
    const isMotifExt = i >= chordObj.notes.length;
    pill.className = 'gpill' + (isMotifExt ? ' ext' : '');
    pill.textContent = nStr;
    pill.title = 'Pluck this note through the carrier';
    pill.addEventListener('click', () => {
      if (!ctx) initAudio();
      if (ctx.state === 'suspended') ctx.resume();
      playExpressiveMotifNote(n2f(nStr), ctx.currentTime, 2.2, {
        velocity: 0.24,
        pan: (Math.random() - 0.5) * 0.6,
        isBell: isMotifExt,
        noteLabel: nStr
      });
    });
    pillsContainer.appendChild(pill);
  });
}

function toggleSoundscapeEngine() {
  if (!ctx) initAudio();
  const engageLed = $g('engageLed');
  const engageStatus = $g('engageStatusText');
  const pulseDot = $g('pulseDot');

  if (!isPlaying) {
    ctx.resume();
    isPlaying = true;
    engageLed.classList.add('on-emerald');
    pulseDot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping';
    engageStatus.textContent = `BROADCAST LIVE // CLOCK @ ${masterBpm} BPM`;

    syncAudioNodesToTempo();
    crossfadeToChordDrone(currentProgIdx, currentChordIdx);
    startMasterClock();
    startProgressionClock();
    scheduleNextMotif();
    scheduleVinylDustPops();
  } else {
    isPlaying = false;
    transition = null; activeChordOverride = null;
    stopMasterClock();
    clearInterval(chordCycleInterval);
    clearTimeout(motifSchedulerTimeout);
    clearTimeout(dustPopTimeout);
    if (ctx) ctx.suspend();

    engageLed.classList.remove('on-emerald');
    $g('tempoSyncLed').classList.remove('on-rose', 'on-cyan');
    pulseDot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-slate-600';
    engageStatus.textContent = 'BROADCAST HELD';
  }
}

function toggleFreezeChord() {
  isFrozen = !isFrozen;
  const freezeLed = $g('freezeLed');
  const freezeStatus = $g('freezeStatusText');

  if (isFrozen) {
    freezeLed.classList.add('on-cyan');
    freezeStatus.textContent = 'STASIS FIELD: ACTIVE';
  } else {
    freezeLed.classList.remove('on-cyan');
    freezeStatus.textContent = 'STASIS FIELD: OFF';
  }
}

// Wire DOM Event Listeners
$g('engageSwitch').addEventListener('click', toggleSoundscapeEngine);
$g('freezeSwitch').addEventListener('click', toggleFreezeChord);

$g('leadLoopBtn').addEventListener('click', () => setLeadLoop(!leadLoopOn));
$g('ambientBtn').addEventListener('click', () => setAmbient(!ambientOn));

$g('manualMotifBtn').addEventListener('click', () => {
  requestMelodicMotif();
});

$g('manualBellBtn').addEventListener('click', () => {
  requestMelodicMotif('BELLS');
});

$g('finishBtn').addEventListener('click', () => {
  $g('pedalChassis').classList.toggle('cream-edition');
});

// Master BPM Slider, Tap Tempo & Subdivision Listeners
function setMasterBpm(newBpm) {
  masterBpm = Math.max(55, Math.min(140, Math.round(newBpm)));
  $g('bpmSlider').value = masterBpm;
  $g('bpmReadout').textContent = masterBpm;
  if (isPlaying) {
    $g('engageStatusText').textContent = `BROADCAST LIVE // CLOCK @ ${masterBpm} BPM`;
  }
  syncAudioNodesToTempo();
}

$g('bpmSlider').addEventListener('input', (e) => {
  setMasterBpm(parseFloat(e.target.value));
});

function handleTapTempo() {
  const now = performance.now();
  if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2500) {
    tapTimes = [];
  }
  tapTimes.push(now);
  if (tapTimes.length > 4) {
    tapTimes.shift();
  }

  const led = $g('tempoSyncLed');
  led.classList.add('on-amber');
  setTimeout(() => led.classList.remove('on-amber'), 110);

  if (tapTimes.length >= 2) {
    let intervals = 0;
    for (let i = 1; i < tapTimes.length; i++) {
      intervals += (tapTimes[i] - tapTimes[i - 1]);
    }
    const avgMs = intervals / (tapTimes.length - 1);
    const calculatedBpm = 60000 / avgMs;
    setMasterBpm(calculatedBpm);
  }
}

$g('tapTempoBtn').addEventListener('click', handleTapTempo);

document.querySelectorAll('.subdiv-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSubdiv = btn.dataset.subdiv;
    document.querySelectorAll('.subdiv-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    syncAudioNodesToTempo();

    if (isPlaying && ctx) {
      const chord = getActiveChord();
      spawnMicrocosmCloud(n2f(chord.motif[1]), ctx.currentTime + 0.02, chord, 0.9);
    }
  });
});

$g('quantizeToggleBtn').addEventListener('click', () => {
  quantizeMotifs = !quantizeMotifs;
  const txt = $g('quantizeStateText');
  const btn = $g('quantizeToggleBtn');
  txt.textContent = quantizeMotifs ? 'ON (GRID)' : 'OFF (FREE)';
  btn.classList.toggle('on', quantizeMotifs);
});

// the chord lists in the menu follow any turning of a progression to a major start
Array.from($g('progressionSelect').options).forEach((o, i) => {
  const p = PROGRESSIONS[i]; if (!p || i > 9) return;
  o.textContent = o.textContent.replace(/·[^·]*\)$/, '· ' + p.chords.slice(0, 4).map(c => c.name).join(' → ') + ')');
});
$g('progressionSelect').addEventListener('change', (e) => {
  const fromChord = getActiveChord();
  currentProgIdx = parseInt(e.target.value, 10);
  currentChordIdx = 0;
  chordElapsedSeconds = 0;
  planHolds();
  if (isPlaying && ctx && masterClockTimer) {
    // keep the old chord sounding until the next beat, then walk through the bridge chords to the new first chord
    activeChordOverride = fromChord;
    transition = { plan: buildTransition(fromChord, PROGRESSIONS[currentProgIdx].chords[0]), i: -1, beatsLeft: 0, landed: false };
    renderProgressionTimeline(currentProgIdx);
  } else {
    transition = null; activeChordOverride = null;
    if (isPlaying) {
      crossfadeToChordDrone(currentProgIdx, currentChordIdx);
    } else {
      updateChordUI(currentProgIdx, currentChordIdx);
    }
  }
});

$g('markovToggleBtn').addEventListener('click', () => {
  markovDrift = !markovDrift;
  const stateText = $g('markovStateText');
  stateText.textContent = markovDrift ? 'DRIFTING' : 'ORDERED';
  $g('markovToggleBtn').classList.toggle('on', markovDrift);
});

document.querySelectorAll('.micro-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    microcosmMode = btn.dataset.mode;
    document.querySelectorAll('.micro-mode-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    updateGranularTelemetryBanner();

    if (isPlaying && ctx) {
      const chord = getActiveChord();
      spawnMicrocosmCloud(n2f(chord.motif[2]), ctx.currentTime + 0.03, chord, 1.0);
    }
  });
});

// Real-Time Slider Parameter Bindings
$g('droneLevelSlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  $g('droneLevelVal').textContent = `${Math.round(val * 100)}%`;
  if (droneMasterBus && ctx) droneMasterBus.gain.setTargetAtTime(val, ctx.currentTime, 0.08);
});

$g('subAnchorSlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  $g('subAnchorVal').textContent = `${Math.round(val * 100)}%`;
  if (padRig && ctx) padRig.subGain.gain.setTargetAtTime(subLevel(), ctx.currentTime, 0.1);
});

$g('chordHoldSlider').addEventListener('input', (e) => {
  $g('chordHoldVal').textContent = `${e.target.value}s`;
});

$g('motifSparsitySlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  $g('motifSparsityVal').textContent = `${Math.round(val * 100)}%`;
});

$g('motifLevelSlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  $g('motifLevelVal').textContent = `${Math.round(val * 100)}%`;
  if (motifMasterBus && ctx) applyLeadLoopMix();
});

$g('granularMixSlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  $g('granularMixVal').textContent = `${Math.round(val * 100)}%`;
  if (granularBus && ctx) granularBus.gain.setTargetAtTime(val, ctx.currentTime, 0.08);
});

$g('lofiTextureSlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  $g('lofiTextureVal').textContent = `${Math.round(val * 100)}%`;
  if (ctx) {
    wowGain.gain.setTargetAtTime(val * 0.0024, ctx.currentTime, 0.1);
    vinylGainNode.gain.setTargetAtTime(val * 0.038, ctx.currentTime, 0.1);
  }
});

function updateSpaceWarmthLabel() {
  const rev = Math.round(parseFloat($g('spaceReverbSlider').value) * 100);
  const cut = (parseFloat($g('warmthFilterSlider').value) / 1000).toFixed(1);
  $g('spaceWarmthVal').textContent = `${rev}% · ${cut}kHz`;
}

$g('spaceReverbSlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  updateSpaceWarmthLabel();
  if (ctx) {
    reverbWetGain.gain.setTargetAtTime(val, ctx.currentTime, 0.1);
    applyLeadLoopMix();
  }
});

$g('warmthFilterSlider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  updateSpaceWarmthLabel();
  if (warmthFilter && ctx) warmthFilter.frequency.setTargetAtTime(val, ctx.currentTime, 0.08);
});

function gridInit() {
  updateChordUI(currentProgIdx, currentChordIdx);
  syncAudioNodesToTempo();
}

return {
  init: gridInit,
  get ctx(){ return ctx; }, get analyser(){ return analyser; }, get out(){ return gridOut; },
  set volume(v){ gridVol = v; },
  get playing(){ return isPlaying; }, get frozen(){ return isFrozen; },
  get leadOn(){ return leadLoopOn; }, get ambientOn(){ return ambientOn; }, get autoOn(){ return AUTO.on; },
  get bpm(){ return masterBpm; }, get mode(){ return microcosmMode; }, get subdiv(){ return currentSubdiv; },
  get chord(){ return getActiveChord(); }, get progIdx(){ return currentProgIdx; }, get chordIdx(){ return currentChordIdx; },
  get mood(){ return (cd && cd.ms && cd.ms.name) || ''; }, get idea(){ return (cd && cd.prem && cd.prem.title) || ''; },
  toggle: toggleSoundscapeEngine, setLead: setLeadLoop, setAmbient, setAuto(on){ if (AUTO.on !== on) $g('autopilotBtn').click(); },
  initAudio, resume(){ if (ctx) ctx.resume(); },
};
})();
