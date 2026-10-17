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
    position: fixed; inset: 0; z-index: 80; display: none; flex-direction: column; gap: 8px; padding: 10px 12px 8px; color: var(--ink); background: radial-gradient(120% 100% at 50% 0%, #0a2530 0%, var(--bg) 62%);
    font: 13.5px/1.35 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .04em; user-select: none; overflow: hidden; }
  #gridPanel.open { display: flex; }
  /* while the panel is up the rest of the game's controls (buildings, transport, speed, monitor, logs) step out of the way, so nothing sits over it */
  html.gp-open body > *:not(#gridPanel):not(#view):not(script):not(style):not(link):not(#tvStatic):not(#tvFlash) { visibility: hidden !important; }
  #gridPanel * { box-sizing: border-box; }
  #gridPanel::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background: repeating-linear-gradient(0deg, rgba(95,216,222,.035) 0 1px, transparent 1px 3px); }
  #gridPanel > * { position: relative; z-index: 1; }
  #gridPanel .gtop, #gridPanel .gbot { display: flex; align-items: center; gap: 6px; flex: none; white-space: nowrap; overflow: hidden; }
  #gridPanel .gtop { border-bottom: 1px solid var(--faint); padding-bottom: 6px; }
  #gridPanel .gbot { border-top: 1px solid var(--faint); padding-top: 6px; color: var(--dim); font-size: 13px; gap: 14px; }
  #gridPanel .gbot b { color: var(--cy2); font-weight: 400; margin-left: 5px; }
  #gridPanel .gchip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border: 1px solid var(--faint); background: rgba(5,18,23,.8); color: var(--cy2); font-size: 13px; letter-spacing: .08em; }
  #gridPanel .gchip i { width: 6px; height: 6px; background: var(--cy); display: inline-block; }
  #gridPanel .gchip.mg i { background: var(--mg); } #gridPanel .gchip.yl i { background: var(--yl); } #gridPanel .gchip.mg { color: #ff9fd6; } #gridPanel .gchip.yl { color: var(--yl); }
  #gridPanel .gchip.live i { animation: gpBlink 1.2s steps(2) infinite; } @keyframes gpBlink { 50% { opacity: .2; } }
  #gridPanel .gname { margin-left: auto; font: 600 15.5px 'Chakra Petch', sans-serif; letter-spacing: .26em; color: var(--cy2); padding-right: 10px; }
  #gridPanel .gx { font: 600 13.5px 'Chakra Petch', sans-serif; letter-spacing: .22em; color: var(--ink); background: transparent; border: 1px solid var(--line); padding: 5px 12px; cursor: pointer; border-radius: 0; }
  #gridPanel .gx:hover, #gridPanel .gx:focus-visible { background: var(--cy); color: var(--bg); outline: none; }
  /* the console: four columns and three rows that fill the screen, like a lab rig (no scrolling on a desktop screen) */
  #gridPanel .gmain { flex: 1; min-height: 0; display: grid; gap: 10px; padding: 4px 2px 6px;
    grid-template-columns: minmax(250px, 1fr) minmax(0, 1.3fr) minmax(0, 1.3fr) minmax(250px, 1fr);
    grid-template-rows: minmax(0, .9fr) minmax(0, 1.1fr) minmax(0, auto);
    grid-template-areas: "clock signal signal prog" "clock chart chart prog" "carrier mixer mixer ping"; }
  #gridPanel .a-clock { grid-area: clock; } #gridPanel .a-signal { grid-area: signal; } #gridPanel .a-prog { grid-area: prog; }
  #gridPanel .a-chart { grid-area: chart; } #gridPanel .a-carrier { grid-area: carrier; } #gridPanel .a-mixer { grid-area: mixer; } #gridPanel .a-ping { grid-area: ping; }
  #gridPanel .gp { min-height: 0; min-width: 0; overflow: auto; scrollbar-width: none; display: flex; flex-direction: column; }
  #gridPanel .gp::-webkit-scrollbar { display: none; }
  /* a smaller screen: the panels flow into columns and the page scrolls */
  @media (max-width: 1100px), (max-height: 780px) {
    #gridPanel .gmain { overflow: auto; grid-template-columns: repeat(auto-fit, minmax(min(330px, 100%), 1fr)); grid-template-rows: none; grid-template-areas: none; align-items: start; }
    #gridPanel .gmain > .gp { grid-area: auto; overflow: visible; min-height: auto; }
    #gridPanel .a-signal canvas { flex: none; }
    #gridPanel .ghint { display: none; }
    #gridPanel .a-mixer .gmix { grid-template-columns: minmax(0, 1fr); }
  }
  /* a panel: corner brackets, a bracketed title on top, a code at the foot */
  #gridPanel .gp { position: relative; padding: 30px 16px 26px; background-color: var(--pn);
    --b: var(--line);
    background-image:
      linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)),
      linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b));
    background-size: 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px;
    background-position: 0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%; background-repeat: no-repeat; }
  #gridPanel .gp > h3 { position: absolute; left: 20px; top: 5px; margin: 0; font: 400 12.5px 'JetBrains Mono', monospace; letter-spacing: .18em; color: var(--cy); text-transform: uppercase; white-space: nowrap; }
  #gridPanel .gp > h3::before { content: '[ '; color: var(--dim); } #gridPanel .gp > h3::after { content: ' ]'; color: var(--dim); }
  #gridPanel .gp > .gcode { position: absolute; left: 20px; bottom: 5px; font-size: 11px; letter-spacing: .16em; color: var(--dim); }
  #gridPanel .gp > .gcode::before { content: '[ '; } #gridPanel .gp > .gcode::after { content: ' ]'; }
  #gridPanel .gp > .gtag { position: absolute; right: 20px; top: 6px; font-size: 11px; letter-spacing: .14em; color: var(--dim); }
  #gridPanel .gp.hot { --b: var(--mg); }
  @media (max-width: 640px) { #gridPanel .gname { display: none; } }
  #gridPanel .gnote { color: var(--dim); font-size: 12.5px; line-height: 1.4; margin: 0 0 8px; letter-spacing: .03em; }
  /* a slider: name, hairline track filled in cyan, a square handle, the value */
  #gridPanel .gs { display: grid; grid-template-columns: minmax(132px, 1fr) minmax(80px, 1.7fr) 48px; align-items: center; gap: 10px; margin: 0 0 6px; padding: 2px 4px; cursor: default; }
  #gridPanel .gs > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: .07em; }
  #gridPanel .gs:hover { background: rgba(95,216,222,.06); } #gridPanel .gs:hover > span { color: var(--ink); }
  #gridPanel .gs > span { color: var(--cy2); font-size: 12.5px; letter-spacing: .1em; text-transform: uppercase; line-height: 1.2; }
  #gridPanel .gs > output { text-align: right; color: var(--yl); font-size: 13px; letter-spacing: .04em; white-space: nowrap; }
  #gridPanel input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 24px; margin: 0; background: transparent; cursor: ew-resize; --p: 50%; }
  #gridPanel input[type=range]::-webkit-slider-runnable-track { height: 6px; background: linear-gradient(90deg, rgba(95,216,222,.85) var(--p), rgba(23,65,74,.9) var(--p)); box-shadow: inset 0 0 0 1px rgba(44,139,146,.35); }
  #gridPanel input[type=range]::-moz-range-track { height: 6px; background: linear-gradient(90deg, rgba(95,216,222,.85) var(--p), rgba(23,65,74,.9) var(--p)); }
  #gridPanel input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 20px; margin-top: -7px; background: var(--ink); border: 0; border-radius: 0; box-shadow: 0 0 6px rgba(95,216,222,.7); transition: transform .12s, box-shadow .12s; }
  #gridPanel input[type=range]::-moz-range-thumb { width: 10px; height: 20px; background: var(--ink); border: 0; border-radius: 0; }
  #gridPanel input[type=range]:hover::-webkit-slider-thumb { transform: scaleY(1.15); box-shadow: 0 0 12px rgba(95,216,222,1); }
  #gridPanel input[type=range]:active::-webkit-slider-thumb { background: var(--yl); box-shadow: 0 0 14px rgba(232,213,83,.9); }
  #gridPanel input[type=range]:focus-visible { outline: 1px solid var(--cy); outline-offset: 2px; }
  /* buttons: stacked bars like a selector list, the live one filled */
  #gridPanel .gb { display: block; width: 100%; padding: 6px 10px; margin: 0 0 5px; font: 400 13px 'JetBrains Mono', monospace; letter-spacing: .2em; text-align: center; text-transform: uppercase; color: var(--cy2); background: rgba(5,22,29,.85); border: 1px solid var(--faint); border-radius: 0; cursor: pointer; }
  #gridPanel .gb { transition: background .12s, border-color .12s, transform .06s; }
  #gridPanel .gb:hover { border-color: var(--cy); background: rgba(95,216,222,.1); } #gridPanel .gb:active { transform: translateY(1px) scale(.985); } #gridPanel .gb:focus-visible { outline: 1px solid var(--cy); outline-offset: 1px; }
  #gridPanel .gb.on, #gridPanel .gb.on:hover { background: var(--cy); color: var(--bg); border-color: var(--cy); font-weight: 600; }
  #gridPanel .gb.mg.on { background: var(--mg); border-color: var(--mg); color: #fff; }
  #gridPanel .gb small { display: block; margin-top: 2px; font-size: 11px; letter-spacing: .1em; opacity: .75; text-transform: none; }
  #gridPanel .grow { display: flex; gap: 5px; margin: 0 0 8px; } #gridPanel .grow .gb { margin: 0; flex: 1; padding: 6px 4px; letter-spacing: .1em; }
  #gridPanel .glbl { color: var(--dim); font-size: 11.5px; letter-spacing: .18em; margin: 8px 0 5px; text-transform: uppercase; }
  #gridPanel select { width: 100%; margin: 0 0 8px; padding: 6px 8px; font: 400 13px 'JetBrains Mono', monospace; letter-spacing: .06em; color: var(--cy2); background: rgba(5,22,29,.95); border: 1px solid var(--line); border-radius: 0; }
  #gridPanel select:focus-visible { outline: 1px solid var(--cy); }
  #gridPanel .gst { color: var(--yl); font-size: 12.5px; letter-spacing: .06em; min-height: 13px; margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #gridPanel .gst.dim { color: var(--dim); }
  /* the clock: a ring with the tempo in it */
  #gridPanel .gring { position: relative; width: 150px; height: 150px; margin: 0 auto 8px; }
  #gridPanel .gring svg { width: 100%; height: 100%; } #gridPanel .gring circle { fill: none; stroke-width: 5; }
  #gridPanel .gring .bg { stroke: var(--faint); } #gridPanel .gring .fg { stroke: var(--cy); stroke-dasharray: 289; stroke-dashoffset: 289; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset .3s; }
  #gridPanel .gring div { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; text-align: center; }
  #gridPanel .gring b { font: 600 34px 'Chakra Petch', sans-serif; color: var(--ink); letter-spacing: .02em; } #gridPanel .gring small { display: block; max-width: 96px; color: var(--dim); font-size: 10.5px; letter-spacing: .08em; line-height: 1.1; }
  #gridPanel .gbeat { position: absolute; right: 18px; top: 24px; color: var(--mg); font-size: 14.5px; }
  /* the pad grid: one tile per chord of the carrier pattern */
  #gridPanel .gpads { flex: 1 1 auto; min-height: 90px; display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: minmax(40px, 1fr); gap: 6px; overflow: auto; margin-bottom: 8px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  #gridPanel .gpad { position: relative; overflow: hidden; text-align: left; padding: 6px 7px 9px; min-height: 0; color: #bfeef0; background: rgba(48,150,158,.5); border: 0; border-radius: 0; cursor: pointer; font: 400 13px 'JetBrains Mono', monospace; }
  #gridPanel .gpad small { display: block; font-size: 10.5px; color: rgba(5,15,20,.7); letter-spacing: .12em; } #gridPanel .gpad b { display: block; font-weight: 600; color: #04161b; font-size: 13.5px; margin-top: 2px; letter-spacing: 0; word-break: break-word; }
  #gridPanel .gpad i { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--ink); }
  #gridPanel .gpad { transition: filter .12s, transform .06s; } #gridPanel .gpad:hover { filter: brightness(1.25); } #gridPanel .gpad:active { transform: scale(.97); } #gridPanel .gpad:focus-visible { outline: 1px solid var(--ink); }
  #gridPanel .gpad.cur { background: var(--yl); } #gridPanel .gpad.cur b, #gridPanel .gpad.cur small { color: #1d1a02; }
  #gridPanel .gpills { display: flex; flex-wrap: wrap; gap: 4px; }
  #gridPanel .gpill { padding: 3px 7px; font: 400 13px 'JetBrains Mono', monospace; color: var(--cy2); background: rgba(5,22,29,.9); border: 1px solid var(--line); border-radius: 0; cursor: pointer; }
  #gridPanel .gpill.ext { color: #ff9fd6; border-color: var(--mg); } #gridPanel .gpill:hover { background: var(--cy); color: var(--bg); }
  #gridPanel .gchord { display: flex; align-items: baseline; gap: 10px; margin: 0 0 8px; }
  #gridPanel .gchord b { font: 600 28.5px 'Chakra Petch', sans-serif; color: var(--yl); letter-spacing: .02em; } #gridPanel .gchord span { color: var(--cy2); font-size: 13px; letter-spacing: .1em; }
  #gridPanel canvas { display: block; width: 100%; max-width: 100%; background: rgba(3,12,16,.8); border: 1px solid var(--faint); }
  #gridPanel .gled { display: inline-block; width: 7px; height: 7px; margin-right: 7px; background: var(--faint); vertical-align: 1px; } #gridPanel .gled.on-emerald { background: var(--cy); box-shadow: 0 0 6px var(--cy); }
  #gridPanel .gled.on-cyan { background: var(--cy); } #gridPanel .gled.on-rose, #gridPanel .gled.on-amber { background: var(--mg); }

  #gridPanel .gmix { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 26px; }
  #gridPanel .gmix > div > .glbl:first-child { margin-top: 0; }
  #gridPanel .gmix .glbl { display: flex; align-items: center; gap: 8px; } #gridPanel .gmix .glbl::after { content: ''; flex: 1; height: 1px; background: var(--faint); }
  #gridPanel .gtrig { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 8px; }
  #gridPanel .gtrig .gb { margin: 0; min-height: 62px; display: grid; place-items: center; font-size: 13.5px; letter-spacing: .18em; background: rgba(229,55,159,.12); border-color: rgba(229,55,159,.55); color: #ffb3dd; }
  #gridPanel .gtrig .gb:hover { background: rgba(229,55,159,.28); border-color: var(--mg); }
  #gridPanel .gtrig .gb:active { background: var(--mg); color: #fff; }
  #gridPanel .gprogs .gb { text-align: left; padding: 7px 10px; letter-spacing: .14em; }
  #gridPanel .gprogs .gb small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #gridPanel .glayers { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; } #gridPanel .glayers .gb { margin: 0; padding: 8px 4px; font-size: 12px; letter-spacing: .12em; }
  #gridPanel .a-signal canvas { flex: 1; min-height: 40px; }
  #gridPanel .a-clock .gring { width: min(150px, 52%); height: auto; aspect-ratio: 1; }
  #gridPanel .ghint { color: var(--dim); font-size: 11px; letter-spacing: .08em; }

  /* opening: the city glitches, a curtain of falling glyphs closes over it, then the panel's blocks come up one by one */
  #view.gp-glitch { animation: gpGl .6s steps(2) 1; }
  @keyframes gpGl { 0% { transform: translate(0); } 18% { transform: translate(-7px, 2px); filter: hue-rotate(50deg) contrast(1.35); } 38% { transform: translate(6px, -3px); filter: saturate(2.2); }
    58% { transform: translate(-3px, 1px); filter: hue-rotate(-40deg); } 100% { transform: none; filter: none; } }
  #gridPanel.boot .gtop, #gridPanel.boot .gbot { animation: gpBoot .5s ease-out both; }
  #gridPanel.boot .gp { animation: gpBoot .62s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i, 0) * 70ms + 120ms); }
  @keyframes gpBoot { 0% { opacity: 0; clip-path: inset(0 100% 0 0); filter: brightness(2.4) saturate(1.6); } 55% { opacity: 1; filter: brightness(1.6); } 100% { opacity: 1; clip-path: inset(0 0 0 0); filter: none; } }
  @media (prefers-reduced-motion: reduce) { #view.gp-glitch, #gridPanel.boot .gtop, #gridPanel.boot .gbot, #gridPanel.boot .gp { animation: none; } }
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
    <section class="gp a-clock"><h3>Circadian clock</h3><span class="gtag" id="g-beatCounterBadge">1/4</span>
      <div class="gring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" id="gpRing" cx="50" cy="50" r="46"/></svg><div><b id="g-bpmReadout">82</b><small>CYCLES<br>PER MIN</small></div></div>
      ${slider('bpmSlider', 'Clock rate', 55, 140, 1, 82, "Sets the metabolic pacing of the sector's population.").replace('<output id="g-bpmVal"></output>', '<output></output>')}
      <button class="gb" id="g-tapTempoBtn" title="Tap the pulse and the whole district falls in step">Pulse sync (tap)</button>
      <div class="glbl">Footfall cadence</div>
      <div class="grow" title="How finely each beat is cut: the rhythm of the footsteps the broadcast matches.">
        <button class="gb subdiv-btn" data-subdiv="1/4">1/4</button><button class="gb subdiv-btn" data-subdiv="1/8.">1/8.</button><button class="gb subdiv-btn on" data-subdiv="1/8">1/8</button><button class="gb subdiv-btn" data-subdiv="1/8T">1/8T</button><button class="gb subdiv-btn" data-subdiv="1/16">1/16</button>
      </div>
      <button class="gb on" id="g-quantizeToggleBtn" title="Melodic pings snap to the cadence so they land with the crowd's footsteps"><span>Grid lock: </span><span id="g-quantizeStateText">ON (GRID)</span></button>
      <div class="gst dim" id="g-delaySyncReadout"></div><div class="gst dim" id="g-subdivRatioLabel"></div>
      <span class="gcode">A1</span></section>
    <section class="gp a-signal"><h3>Signal</h3><span class="gtag">LIVE SPECTRUM</span>
      <canvas id="gpCurve" height="86"></canvas><div style="height:8px;flex:none"></div><canvas id="gpBars" height="104"></canvas>
      <span class="gcode">B1</span></section>
    <section class="gp a-prog"><h3>Broadcast programs</h3>
      <div class="gprogs" id="gpPrograms" title="What the grid is broadcasting: pick a program, or mix your own"></div>
      <div class="glbl">Layers</div>
      <div class="glayers">
        <button class="gb" id="g-leadLoopBtn" title="A neuro-phrase that improvises over the carrier without stopping">Neuro-phrase</button>
        <button class="gb on" id="g-autopilotBtn" title="Lets the grid steer its own clock, cadence, dispersion mode and sliders as the mood changes">Auto-governor</button>
        <button class="gb" id="g-ambientBtn" title="Slow, soft pads in place of the heavy drone">Sedation bed</button>
        <button class="gb" id="g-engageSwitch" title="Hold or resume the whole broadcast"><span class="gled" id="g-engageLed"></span>Hold</button>
      </div>
      <div class="gst dim" id="g-engageStatusText"></div>
      <span class="gcode">D1</span></section>
    <section class="gp a-chart"><h3>District carrier chart</h3><span class="gtag">TAP A PAD TO JUMP</span>
      <div class="gchord"><b id="g-activeChordBadge">Fmaj9</b><span id="g-activeMoodTag"></span></div>
      <div class="gpads" id="g-chordTimelineGrid"></div>
      <div class="glbl">Harmonic stack</div>
      <div class="gpills" id="g-voicingPillsContainer"></div>
      <span class="gcode">B2</span></section>
    <section class="gp a-carrier"><h3>Carrier wave</h3>
      <div class="glbl" style="margin-top:0">District carrier pattern</div>
      <select id="g-progressionSelect" title="Which carrier pattern the planners are running through the district"></select>
      <button class="gb" id="g-freezeSwitch" title="Suspends the current acoustic atmosphere in a localized time-loop"><span class="gled" id="g-freezeLed"></span>Stasis field<small id="g-freezeStatusText">STASIS FIELD: OFF</small></button>
      <button class="gb" id="g-markovToggleBtn" title="Lets the carrier wander to neighboring chords instead of marching in order"><span>Drift: </span><span id="g-markovStateText">ORDERED</span></button>
      <span class="gcode">C1</span></section>
    <section class="gp a-mixer"><h3>Mixing desk</h3><span class="gtag ghint">SCROLL OVER A FADER TO NUDGE · DOUBLE-CLICK TO RESET</span>
      <div class="gmix">
        <div>
          <div class="glbl">Carrier wave harmonics</div>
          ${slider('droneLevelSlider', 'Carrier output', 0.1, 1, 0.02, 0.8, 'How loud the carrier wave rides under everything else.')}
          ${slider('subAnchorSlider', 'Foundation hum', 0, 1, 0.02, 0.65, 'The sub-audible weight that the megablocks sit on.')}
          ${slider('chordHoldSlider', 'Hold time', 5, 24, 1, 10, 'How long a carrier chord holds before the planners change it. Some change fast, some are held for a long while.')}
          <div class="glbl">Atmosphere</div>
          ${slider('warmthFilterSlider', 'Smog filter', 600, 5800, 50, 2500, 'A high-cut that dampens harsh industrial frequencies. Lower values simulate heavy acid rain and fog.')}
          ${slider('spaceReverbSlider', 'Canyon reverb', 0.1, 1, 0.02, 0.84, 'Acoustic reflection depth across the vertical shafts of the city.')}
          <div class="gst" id="g-spaceWarmthVal"></div>
        </div>
        <div>
          <div class="glbl">Aerosol dispersion</div>
          <div class="grow"><button class="gb micro-mode-btn on" data-mode="MOSAIC" title="Tiled echoes of the melody an octave up">Mosaic</button><button class="gb micro-mode-btn" data-mode="HAZE" title="Long soft clouds that bloom out of held notes">Haze</button><button class="gb micro-mode-btn" data-mode="ARP" title="Short stuttering ratchets on strong beats">Glitch-arp</button></div>
          ${slider('granularMixSlider', 'Density', 0, 1, 0.02, 0.62, 'Density of micro-acoustic scattering across upper-level walkways.')}
          ${slider('lofiTextureSlider', 'Rain static', 0, 1, 0.02, 0.38, 'Hiss and dust: the sound of acid rain on the vents.')}
          <div class="gst dim" id="g-granularSyncTelemetry"></div>
          <div class="glbl">Dopamine ping</div>
          ${slider('motifSparsitySlider', 'Ping rate', 0.05, 0.95, 0.05, 0.45, 'How often melodic neuro-triggers fire. Higher means more frequent.')}
          ${slider('motifLevelSlider', 'Trigger depth', 0, 1, 0.02, 0.68, 'How strongly each ping is felt: its level in the broadcast.')}
        </div>
      </div>
      <span class="gcode">M1</span></section>
    <section class="gp hot a-ping"><h3>Dopamine ping</h3>
      <div class="gtrig"><button class="gb mg" id="g-manualMotifBtn" title="Fire one ping now">Fire ping</button><button class="gb mg" id="g-manualBellBtn" title="A cluster of high resonant tones, like harmonics rung on the lamp posts">Lamp chimes</button></div>
      <div class="glbl">Trigger pattern</div>
      <select id="g-motifStyleSelect" title="The shape of the soothing neural phrase"></select>
      <div class="gst" id="g-motifStatusText">PING STANDBY</div><span class="gled" id="g-motifLed" style="display:none"></span>
      <span class="gcode">C2</span></section>
  </div>
  <div class="gbot"><span>FRQ<b id="gpFrq">0</b></span><span>AMP<b id="gpAmp">0.00</b></span><span>CLK<b id="gpClk">82</b></span><span>CAD<b id="gpCad">1/8</b></span><span>MOD<b id="gpMod">MOSAIC</b></span><span>STASIS<b id="gpSt">OFF</b></span><span style="margin-left:auto">GRID V1 · SECTOR BROADCAST · CITY PLANNING OFFICE</span></div>`;

  function build(){
    if (P.el) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'gridPanel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Acoustic Panel'); el.innerHTML = html; document.body.appendChild(el);
    P.el = el;
    // the two pick lists: the same sets the engine knows (it relabels the progressions for its major starts when it starts)
    const prog = el.querySelector('#g-progressionSelect');
    ['Sector 01 // Shift change dusk', 'Sector 02 // Archive hall murmur', 'Sector 03 // Billboard haze', 'Sector 04 // Rail yard static', 'Sector 05 // Night school hum', 'Sector 06 // Skyline lull', 'Sector 07 // Rooftop garden calm', 'Sector 08 // Vent chorus', 'Sector 09 // Greenhouse sunrise', 'Sector 10 // Stairwell light loop', 'Sector 11 // Full sector sweep']
      .forEach((t, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = t; prog.appendChild(o); });
    const sty = el.querySelector('#g-motifStyleSelect');
    [['MIXED', 'Auto-mixed'], ['TAPPED', 'Tapped cascade'], ['HAMMER', 'Pull-off triplet'], ['BELLS', 'Lamp-post harmonics'], ['DOUBLESTOP', 'Double-stops'], ['LEAD', 'Lead riff'], ['HOMEBOUND', 'Homebound run']]
      .forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sty.appendChild(o); });
    // the track fill follows the handle
    const fill = r => { const lo = +r.min, hi = +r.max; r.style.setProperty('--p', (hi > lo ? (+r.value - lo)/(hi - lo)*100 : 0) + '%'); };
    el.addEventListener('input', e => { if (e.target.type === 'range') fill(e.target); }, true);
    el.querySelectorAll('input[type=range]').forEach(r => { fill(r); r.dataset.def = r.value; });
    const set = (r, v) => { const st = +r.step || 1, lo = +r.min, hi = +r.max; v = Math.min(hi, Math.max(lo, Math.round((v - lo)/st)*st + lo));
      if (+r.value === v) return; r.value = String(+v.toFixed(4)); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); };
    el.addEventListener('wheel', e => { const r = e.target.closest && e.target.closest('.gs') && e.target.closest('.gs').querySelector('input[type=range]'); if (!r) return;
      e.preventDefault(); const st = +r.step || 1, n = Math.max(1, Math.round((+r.max - +r.min)/st/50)); set(r, +r.value + (e.deltaY < 0 ? 1 : -1)*st*n*(e.shiftKey ? 4 : 1)); }, { passive: false });
    el.addEventListener('dblclick', e => { const r = e.target.closest && e.target.closest('.gs') && e.target.closest('.gs').querySelector('input[type=range]'); if (r && r.dataset.def !== undefined) set(r, +r.dataset.def); });
    return el;
  }
  P.build = build; P.fill = r => { const lo = +r.min, hi = +r.max; r.style.setProperty('--p', (hi > lo ? (+r.value - lo)/(hi - lo)*100 : 0) + '%'); };
  return P;
})();
GRIDPANEL.build();
