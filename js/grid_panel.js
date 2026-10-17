// Neon Terrarium: the Acoustic Panel, the control room of the Psycho-Acoustic Grid.
// Click ACOUSTIC PANEL on the Grid's player, or double-click the Grid building, and a full-screen console opens over the
// city: the district's whole broadcast, one panel per layer, every control named the way the city planners would name it
// (the tempo is the circadian clock, the reverb is canyon resonance, the filter is smog attenuation). The design follows a
// lab console: near-black teal, corner brackets with panel codes, hairline tracks, cyan and magenta with a little yellow.
// This file only builds the markup and the look; the controls are read and written by the sound engine (grid_engine.js)
// through ids that start with g-, and the player and the opening and closing are in grid.js.
// Loads before grid_engine.js (the engine looks its controls up when it starts).
'use strict';
const GRIDPANEL = (() => {
  const P = { el: null, open: false };
  const css = `
  #gridPanel { --bg:#050f14; --pn:rgba(9,32,40,.62); --pn2:rgba(12,44,54,.7); --line:#2c8b92; --cy:#5fd8de; --cy2:#a6eef0; --dim:#4f8c94; --faint:#17414a; --mg:#e5379f; --yl:#e8d553; --ink:#d9f6f6;
    position: fixed; inset: 0; z-index: 58; display: none; flex-direction: column; gap: 8px; padding: 10px 12px 8px; color: var(--ink); background: radial-gradient(120% 100% at 50% 0%, #0a2530 0%, var(--bg) 62%);
    font: 10.5px/1.35 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .04em; user-select: none; overflow: hidden; }
  #gridPanel.open { display: flex; }
  #gridPanel * { box-sizing: border-box; }
  #gridPanel::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background: repeating-linear-gradient(0deg, rgba(95,216,222,.035) 0 1px, transparent 1px 3px); }
  #gridPanel > * { position: relative; z-index: 1; }
  #gridPanel .gtop, #gridPanel .gbot { display: flex; align-items: center; gap: 6px; flex: none; white-space: nowrap; overflow: hidden; }
  #gridPanel .gtop { border-bottom: 1px solid var(--faint); padding-bottom: 6px; }
  #gridPanel .gbot { border-top: 1px solid var(--faint); padding-top: 6px; color: var(--dim); font-size: 10px; gap: 14px; }
  #gridPanel .gbot b { color: var(--cy2); font-weight: 400; margin-left: 5px; }
  #gridPanel .gchip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border: 1px solid var(--faint); background: rgba(5,18,23,.8); color: var(--cy2); font-size: 10px; letter-spacing: .08em; }
  #gridPanel .gchip i { width: 6px; height: 6px; background: var(--cy); display: inline-block; }
  #gridPanel .gchip.mg i { background: var(--mg); } #gridPanel .gchip.yl i { background: var(--yl); } #gridPanel .gchip.mg { color: #ff9fd6; } #gridPanel .gchip.yl { color: var(--yl); }
  #gridPanel .gchip.live i { animation: gpBlink 1.2s steps(2) infinite; } @keyframes gpBlink { 50% { opacity: .2; } }
  #gridPanel .gname { margin-left: auto; font: 600 12px 'Chakra Petch', sans-serif; letter-spacing: .26em; color: var(--cy2); padding-right: 10px; }
  #gridPanel .gx { font: 600 10.5px 'Chakra Petch', sans-serif; letter-spacing: .22em; color: var(--ink); background: transparent; border: 1px solid var(--line); padding: 5px 12px; cursor: pointer; border-radius: 0; }
  #gridPanel .gx:hover, #gridPanel .gx:focus-visible { background: var(--cy); color: var(--bg); outline: none; }
  #gridPanel .gmain { flex: 1; min-height: 0; overflow: auto; display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(290px, 100%), 1fr)); align-items: start; padding: 4px 2px 8px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  /* a panel: corner brackets, a bracketed title on top, a code at the foot */
  #gridPanel .gp { position: relative; padding: 24px 14px 22px; background-color: var(--pn);
    --b: var(--line);
    background-image:
      linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)),
      linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b));
    background-size: 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px;
    background-position: 0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%; background-repeat: no-repeat; }
  #gridPanel .gp > h3 { position: absolute; left: 20px; top: 6px; margin: 0; font: 400 9.5px 'JetBrains Mono', monospace; letter-spacing: .18em; color: var(--cy); text-transform: uppercase; white-space: nowrap; }
  #gridPanel .gp > h3::before { content: '[ '; color: var(--dim); } #gridPanel .gp > h3::after { content: ' ]'; color: var(--dim); }
  #gridPanel .gp > .gcode { position: absolute; left: 20px; bottom: 5px; font-size: 8.5px; letter-spacing: .16em; color: var(--dim); }
  #gridPanel .gp > .gcode::before { content: '[ '; } #gridPanel .gp > .gcode::after { content: ' ]'; }
  #gridPanel .gp > .gtag { position: absolute; right: 20px; top: 6px; font-size: 8.5px; letter-spacing: .14em; color: var(--dim); }
  #gridPanel .gp.hot { --b: var(--mg); }
    #gridPanel .gcol { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-content: start; min-width: 0; }
  @media (max-width: 640px) { #gridPanel .gname { display: none; } }
  #gridPanel .gnote { color: var(--dim); font-size: 9.5px; line-height: 1.4; margin: 0 0 8px; letter-spacing: .03em; }
  /* a slider: name, hairline track filled in cyan, a square handle, the value */
  #gridPanel .gs { display: grid; grid-template-columns: minmax(96px, 1.1fr) minmax(70px, 1.5fr) 44px; align-items: center; gap: 9px; margin: 0 0 9px; cursor: default; }
  #gridPanel .gs > span { color: var(--cy2); font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; line-height: 1.2; }
  #gridPanel .gs > output { text-align: right; color: var(--yl); font-size: 10px; letter-spacing: .04em; white-space: nowrap; }
  #gridPanel input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 14px; margin: 0; background: transparent; cursor: pointer; --p: 50%; }
  #gridPanel input[type=range]::-webkit-slider-runnable-track { height: 3px; background: linear-gradient(90deg, var(--cy) var(--p), var(--faint) var(--p)); }
  #gridPanel input[type=range]::-moz-range-track { height: 3px; background: linear-gradient(90deg, var(--cy) var(--p), var(--faint) var(--p)); }
  #gridPanel input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 7px; height: 13px; margin-top: -5px; background: var(--ink); border: 0; border-radius: 0; box-shadow: 0 0 6px rgba(95,216,222,.7); }
  #gridPanel input[type=range]::-moz-range-thumb { width: 7px; height: 13px; background: var(--ink); border: 0; border-radius: 0; }
  #gridPanel input[type=range]:focus-visible { outline: 1px solid var(--cy); outline-offset: 2px; }
  /* buttons: stacked bars like a selector list, the live one filled */
  #gridPanel .gb { display: block; width: 100%; padding: 6px 10px; margin: 0 0 5px; font: 400 10px 'JetBrains Mono', monospace; letter-spacing: .2em; text-align: center; text-transform: uppercase; color: var(--cy2); background: rgba(5,22,29,.85); border: 1px solid var(--faint); border-radius: 0; cursor: pointer; }
  #gridPanel .gb:hover { border-color: var(--cy); } #gridPanel .gb:focus-visible { outline: 1px solid var(--cy); outline-offset: 1px; }
  #gridPanel .gb.on { background: var(--cy); color: var(--bg); border-color: var(--cy); font-weight: 600; }
  #gridPanel .gb.mg.on { background: var(--mg); border-color: var(--mg); color: #fff; }
  #gridPanel .gb small { display: block; margin-top: 2px; font-size: 8.5px; letter-spacing: .1em; opacity: .75; text-transform: none; }
  #gridPanel .grow { display: flex; gap: 5px; margin: 0 0 8px; } #gridPanel .grow .gb { margin: 0; flex: 1; padding: 6px 4px; letter-spacing: .1em; }
  #gridPanel .glbl { color: var(--dim); font-size: 9px; letter-spacing: .18em; margin: 8px 0 5px; text-transform: uppercase; }
  #gridPanel select { width: 100%; margin: 0 0 8px; padding: 6px 8px; font: 400 10px 'JetBrains Mono', monospace; letter-spacing: .06em; color: var(--cy2); background: rgba(5,22,29,.95); border: 1px solid var(--line); border-radius: 0; }
  #gridPanel select:focus-visible { outline: 1px solid var(--cy); }
  #gridPanel .gst { color: var(--yl); font-size: 9.5px; letter-spacing: .06em; min-height: 13px; margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #gridPanel .gst.dim { color: var(--dim); }
  /* the clock: a ring with the tempo in it */
  #gridPanel .gring { position: relative; width: 112px; height: 112px; margin: 0 auto 8px; }
  #gridPanel .gring svg { width: 100%; height: 100%; } #gridPanel .gring circle { fill: none; stroke-width: 5; }
  #gridPanel .gring .bg { stroke: var(--faint); } #gridPanel .gring .fg { stroke: var(--cy); stroke-dasharray: 289; stroke-dashoffset: 289; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset .3s; }
  #gridPanel .gring div { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; text-align: center; }
  #gridPanel .gring b { font: 600 26px 'Chakra Petch', sans-serif; color: var(--ink); letter-spacing: .02em; } #gridPanel .gring small { color: var(--dim); font-size: 8.5px; letter-spacing: .2em; }
  #gridPanel .gbeat { position: absolute; right: 18px; top: 24px; color: var(--mg); font-size: 11px; }
  /* the pad grid: one tile per chord of the carrier pattern */
  #gridPanel .gpads { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; max-height: 232px; overflow: auto; margin-bottom: 8px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  #gridPanel .gpad { position: relative; overflow: hidden; text-align: left; padding: 6px 7px 9px; min-height: 52px; color: #bfeef0; background: rgba(48,150,158,.5); border: 0; border-radius: 0; cursor: pointer; font: 400 10px 'JetBrains Mono', monospace; }
  #gridPanel .gpad small { display: block; font-size: 8px; color: rgba(5,15,20,.7); letter-spacing: .12em; } #gridPanel .gpad b { display: block; font-weight: 600; color: #04161b; font-size: 10.5px; margin-top: 2px; letter-spacing: 0; word-break: break-word; }
  #gridPanel .gpad i { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--ink); }
  #gridPanel .gpad:hover { filter: brightness(1.2); } #gridPanel .gpad:focus-visible { outline: 1px solid var(--ink); }
  #gridPanel .gpad.cur { background: var(--yl); } #gridPanel .gpad.cur b, #gridPanel .gpad.cur small { color: #1d1a02; }
  #gridPanel .gpills { display: flex; flex-wrap: wrap; gap: 4px; }
  #gridPanel .gpill { padding: 3px 7px; font: 400 10px 'JetBrains Mono', monospace; color: var(--cy2); background: rgba(5,22,29,.9); border: 1px solid var(--line); border-radius: 0; cursor: pointer; }
  #gridPanel .gpill.ext { color: #ff9fd6; border-color: var(--mg); } #gridPanel .gpill:hover { background: var(--cy); color: var(--bg); }
  #gridPanel .gchord { display: flex; align-items: baseline; gap: 10px; margin: 0 0 8px; }
  #gridPanel .gchord b { font: 600 22px 'Chakra Petch', sans-serif; color: var(--yl); letter-spacing: .02em; } #gridPanel .gchord span { color: var(--cy2); font-size: 10px; letter-spacing: .1em; }
  #gridPanel canvas { display: block; width: 100%; max-width: 100%; background: rgba(3,12,16,.8); border: 1px solid var(--faint); }
  #gridPanel .gled { display: inline-block; width: 7px; height: 7px; margin-right: 7px; background: var(--faint); vertical-align: 1px; } #gridPanel .gled.on-emerald { background: var(--cy); box-shadow: 0 0 6px var(--cy); }
  #gridPanel .gled.on-cyan { background: var(--cy); } #gridPanel .gled.on-rose, #gridPanel .gled.on-amber { background: var(--mg); }
  `;
  const slider = (id, name, min, max, step, val, tip) => `<label class="gs" title="${tip}"><span>${name}</span><input type="range" id="g-${id}" min="${min}" max="${max}" step="${step}" value="${val}"><output id="g-${id.replace(/Slider$/, '')}Val"></output></label>`;
  const html = `
  <div class="gtop">
    <span class="gchip live" id="gpLive"><i></i><span id="gpLiveT">BROADCAST LIVE</span></span>
    <span class="gchip mg"><i></i><span id="gpProg">PROGRAM</span></span>
    <span class="gchip yl"><i></i><span id="gpChord">CARRIER</span></span>
    <span class="gchip"><i></i><span id="gpMood">MOOD</span></span>
    <span class="gchip"><i></i><span id="gpClock">CLOCK</span></span>
    <span class="gname">PSYCHO-ACOUSTIC GRID</span>
    <button class="gx" id="gpClose" title="Close the panel (Esc)">CLOSE</button>
  </div>
  <div class="gmain">
    <div class="gcol">
    <section class="gp"><h3>Circadian clock</h3><span class="gtag" id="g-beatCounterBadge">1/4</span>
      <div class="gring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" id="gpRing" cx="50" cy="50" r="46"/></svg><div><b id="g-bpmReadout">82</b><small>CYCLES / MIN</small></div></div>
      ${slider('bpmSlider', 'Circadian clock rate', 55, 140, 1, 82, "Sets the metabolic pacing of the sector's population.").replace('<output id="g-bpmVal"></output>', '<output></output>')}
      <button class="gb" id="g-tapTempoBtn" title="Tap the pulse and the whole district falls in step">Pulse sync (tap)</button>
      <div class="glbl">Footfall cadence</div>
      <div class="grow" title="How finely each beat is cut: the rhythm of the footsteps the broadcast matches.">
        <button class="gb subdiv-btn" data-subdiv="1/4">1/4</button><button class="gb subdiv-btn" data-subdiv="1/8.">1/8.</button><button class="gb subdiv-btn on" data-subdiv="1/8">1/8</button><button class="gb subdiv-btn" data-subdiv="1/8T">1/8T</button><button class="gb subdiv-btn" data-subdiv="1/16">1/16</button>
      </div>
      <button class="gb on" id="g-quantizeToggleBtn" title="Melodic pings snap to the cadence so they land with the crowd's footsteps"><span>Grid lock: </span><span id="g-quantizeStateText">ON (GRID)</span></button>
      <div class="gst dim" id="g-delaySyncReadout"></div><div class="gst dim" id="g-subdivRatioLabel"></div>
      <span class="gcode">A1</span></section>
    <section class="gp"><h3>Atmosphere</h3>
      <p class="gnote">How the broadcast carries through the city's air.</p>
      ${slider('warmthFilterSlider', 'Smog attenuation', 600, 5800, 50, 2500, 'A high-cut that dampens harsh industrial frequencies. Lower values simulate heavy acid rain and fog.')}
      ${slider('spaceReverbSlider', 'Canyon resonance', 0.1, 1, 0.02, 0.84, 'Acoustic reflection depth across the vertical shafts of the city.')}
      <div class="gst" id="g-spaceWarmthVal"></div>
      <span class="gcode">D2</span></section>
    </div>
    <div class="gcol">
    <section class="gp"><h3>Carrier wave harmonics</h3>
      <p class="gnote">The baseline frequencies pumped through the district's foundations.</p>
      ${slider('droneLevelSlider', 'Carrier output', 0.1, 1, 0.02, 0.8, 'How loud the carrier wave rides under everything else.')}
      ${slider('subAnchorSlider', 'Foundation hum', 0, 1, 0.02, 0.65, 'The sub-audible weight that the megablocks sit on.')}
      ${slider('chordHoldSlider', 'Carrier hold time', 5, 24, 1, 10, 'How long a carrier chord holds before the planners change it. Some change fast, some are held for a long while.')}
      <div class="glbl">District carrier pattern</div>
      <select id="g-progressionSelect" title="Which set of chords the grid cycles through"></select>
      <button class="gb" id="g-freezeSwitch" title="Suspends the current acoustic atmosphere in a localized time-loop"><span class="gled" id="g-freezeLed"></span>Stasis field (cryo-loop)<small id="g-freezeStatusText">STASIS FIELD: OFF</small></button>
      <button class="gb" id="g-markovToggleBtn" title="Lets the carrier wander to neighboring chords instead of marching in order"><span>Carrier drift: </span><span id="g-markovStateText">ORDERED</span></button>
      <span class="gcode">C1</span></section>
    <section class="gp"><h3>Aerosol dispersion</h3>
      <p class="gnote">Micro-acoustic scattering across the upper-level walkways.</p>
      ${slider('granularMixSlider', 'Dispersion density', 0, 1, 0.02, 0.62, 'Density of micro-acoustic scattering across upper-level walkways.')}
      <div class="glbl">Dispersion mode</div>
      <div class="grow"><button class="gb micro-mode-btn on" data-mode="MOSAIC" title="Tiled echoes of the melody an octave up">Mosaic</button><button class="gb micro-mode-btn" data-mode="HAZE" title="Long soft clouds that bloom out of held notes">Haze</button><button class="gb micro-mode-btn" data-mode="ARP" title="Short stuttering ratchets on strong beats">Glitch-arp</button></div>
      <div class="gst dim" id="g-granularSyncTelemetry"></div>
      ${slider('lofiTextureSlider', 'Acid-rain static', 0, 1, 0.02, 0.38, 'Hiss and dust: the sound of acid rain on the vents.')}
      <span class="gcode">A2</span></section>
    </div>
    <div class="gcol">
    <section class="gp hot"><h3>Dopamine ping</h3>
      <p class="gnote">Melodic neuro-triggers fired to soothe citizen agitation.</p>
      ${slider('motifSparsitySlider', 'Ping rate', 0.05, 0.95, 0.05, 0.45, 'How often melodic neuro-triggers fire. Higher means more frequent.')}
      ${slider('motifLevelSlider', 'Trigger depth', 0, 1, 0.02, 0.68, 'How strongly each ping is felt: its level in the broadcast.')}
      <div class="glbl">Trigger pattern</div>
      <select id="g-motifStyleSelect" title="The shape of the soothing neural phrase"></select>
      <div class="grow"><button class="gb mg" id="g-manualMotifBtn" title="Fire one ping now">Fire ping</button><button class="gb mg" id="g-manualBellBtn" title="A cluster of high resonant tones, like harmonics rung on the lamp posts">Lamp chimes</button></div>
      <div class="gst" id="g-motifStatusText">PING STANDBY</div><span class="gled" id="g-motifLed" style="display:none"></span>
      <span class="gcode">C2</span></section>
    <section class="gp"><h3>Broadcast programs</h3>
      <p class="gnote">What the grid is broadcasting. Pick a program, or build your own below.</p>
      <div id="gpPrograms"></div>
      <div class="glbl">Layers</div>
      <button class="gb" id="g-leadLoopBtn" title="A neuro-phrase that improvises over the carrier without stopping">Neuro-phrase feed</button>
      <button class="gb on" id="g-autopilotBtn" title="Lets the grid steer its own clock, cadence, dispersion mode and sliders as the mood changes">Sector auto-governor</button>
      <button class="gb" id="g-ambientBtn" title="Slow, soft pads in place of the heavy drone">Sedation bed</button>
      <button class="gb" id="g-engageSwitch" title="Hold or resume the whole broadcast"><span class="gled" id="g-engageLed"></span>Broadcast hold</button>
      <div class="gst dim" id="g-engageStatusText"></div>
      <span class="gcode">D1</span></section>
    </div>
    <div class="gcol">
    <section class="gp"><h3>Carrier chart</h3>
      <div class="gchord"><b id="g-activeChordBadge">Fmaj9</b><span id="g-activeMoodTag"></span></div>
      <div class="gpads" id="g-chordTimelineGrid"></div>
      <div class="glbl">Voicing</div>
      <div class="gpills" id="g-voicingPillsContainer"></div>
      <span class="gcode">B2</span></section>
    <section class="gp"><h3>Signal</h3><span class="gtag">LIVE SPECTRUM</span>
      <canvas id="gpCurve" height="86"></canvas><div style="height:8px"></div><canvas id="gpBars" height="104"></canvas>
      <span class="gcode">B1</span></section>
    </div>
  </div>
  <div class="gbot"><span>FRQ<b id="gpFrq">0</b></span><span>AMP<b id="gpAmp">0.00</b></span><span>CLK<b id="gpClk">82</b></span><span>CAD<b id="gpCad">1/8</b></span><span>MOD<b id="gpMod">MOSAIC</b></span><span>STASIS<b id="gpSt">OFF</b></span><span style="margin-left:auto">GRID V1 · SECTOR BROADCAST · CITY PLANNING OFFICE</span></div>`;

  function build(){
    if (P.el) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'gridPanel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Acoustic Panel'); el.innerHTML = html; document.body.appendChild(el);
    P.el = el;
    // the two pick lists: the same sets the engine knows (it relabels the progressions for its major starts when it starts)
    const prog = el.querySelector('#g-progressionSelect');
    ['01 // Midwest Sunset (Fmaj9 > C6/9 > Dm11 > Bbmaj7#11)', '02 // Tape Memories (Ebmaj9 > Dm7b5 > Cm11 > Bbmaj13)', '03 // Holographic Drift (Dmaj9#11 > Aadd9/C# > Bm11 > Gmaj13#11)', '04 // Autumn Static (Am11 > Fmaj9#11 > Cmaj9/G > Em7add11)', '05 // Midnight Study (Fm9 > Bb13sus4 > Ebmaj9 > C7alt)', '06 // Starlight Cascades (Gbmaj9 > Fm11 > Ebm11 > Dbmaj9)', '07 // Suburban Stargazing (Cmaj9 > Am11 > Fmaj7#11 > G6add9)', '08 // Cassette Nebula (Bmaj9#11 > F#add9/A# > G#m11 > Emaj9#11)', '09 // Solar Canopy (Amaj9 > F#m9 > Dmaj7#11 > E6/9)', '10 // Porch Light Loop (Gmaj9 > Em9 > Cmaj9 > D6/9)', '11 // Grand Tour (every chord, linked by the smoothest voice-leading)']
      .forEach((t, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = t; prog.appendChild(o); });
    const sty = el.querySelector('#g-motifStyleSelect');
    [['MIXED', 'Auto-mixed'], ['TAPPED', 'Tapped cascade'], ['HAMMER', 'Pull-off triplet'], ['BELLS', 'Lamp-post harmonics'], ['DOUBLESTOP', 'Double-stops'], ['LEAD', 'Lead riff'], ['HOMEBOUND', 'Homebound run']]
      .forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sty.appendChild(o); });
    // the track fill follows the handle
    const fill = r => { const lo = +r.min, hi = +r.max; r.style.setProperty('--p', (hi > lo ? (+r.value - lo)/(hi - lo)*100 : 0) + '%'); };
    el.addEventListener('input', e => { if (e.target.type === 'range') fill(e.target); }, true);
    el.querySelectorAll('input[type=range]').forEach(fill);
    return el;
  }
  P.build = build; P.fill = r => { const lo = +r.min, hi = +r.max; r.style.setProperty('--p', (hi > lo ? (+r.value - lo)/(hi - lo)*100 : 0) + '%'); };
  return P;
})();
GRIDPANEL.build();
