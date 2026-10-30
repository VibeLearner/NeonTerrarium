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
  /* the console: four columns and three rows that fill the screen, like a lab rig. Each setting has a shape (grid_viz.js)
     and a knob beside it; the district state in the middle shows all of it at once. */
  #gridPanel .gmain { flex: 1; min-height: 0; display: grid; gap: 10px; padding: 4px 2px 6px;
    grid-template-columns: minmax(250px, 1fr) minmax(0, 1.25fr) minmax(0, 1.25fr) minmax(250px, 1fr);
    grid-template-rows: repeat(3, minmax(0, 1fr));
    grid-template-areas: "clock state state prog" "atmos state state harm" "disp chart chart ping"; }
  #gridPanel .a-clock { grid-area: clock; } #gridPanel .a-state { grid-area: state; } #gridPanel .a-prog { grid-area: prog; } #gridPanel .a-atmos { grid-area: atmos; }
  #gridPanel .a-harm { grid-area: harm; } #gridPanel .a-disp { grid-area: disp; } #gridPanel .a-chart { grid-area: chart; } #gridPanel .a-ping { grid-area: ping; }
  #gridPanel .gp { min-height: 0; min-width: 0; overflow: auto; scrollbar-width: none; display: flex; flex-direction: column; gap: 6px; }
  #gridPanel .gp::-webkit-scrollbar { display: none; }
  #gridPanel .gv { flex: 1 1 0; min-height: 70px; width: 100%; display: block; background: rgba(3,12,16,.55); border: 1px solid var(--faint); }
  @media (max-width: 1100px), (max-height: 780px) {
    #gridPanel .gmain { overflow: auto; grid-template-columns: repeat(auto-fit, minmax(min(330px, 100%), 1fr)); grid-template-rows: none; grid-template-areas: none; align-items: stretch; }
    #gridPanel .gmain > .gp { grid-area: auto; overflow: visible; min-height: auto; }
    #gridPanel .gv { flex: none; height: 130px; } #gridPanel .a-state .gv { height: 260px; }
  }
  /* a panel: corner brackets, a bracketed title on top, a code at the foot */
  #gridPanel .gp { position: relative; padding: 28px 14px 14px; background-color: var(--pn);
    --b: var(--line);
    background-image:
      linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)),
      linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b)), linear-gradient(var(--b), var(--b));
    background-size: 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px;
    background-position: 0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%; background-repeat: no-repeat; }
  #gridPanel .gp > h3 { position: absolute; left: 20px; top: 5px; margin: 0; font: 400 12.5px 'JetBrains Mono', monospace; letter-spacing: .18em; color: var(--cy); text-transform: uppercase; white-space: nowrap; }
  #gridPanel .gp > h3::before { content: '[ '; color: var(--dim); } #gridPanel .gp > h3::after { content: ' ]'; color: var(--dim); }
  #gridPanel .gp > .gcode { display: none; position: absolute; left: 20px; bottom: 5px; font-size: 11px; letter-spacing: .16em; color: var(--dim); }
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

  /* a knob: a dial (drag up or down, wheel, double-click resets; the keys work on the hidden input), its value, its name */
  #gridPanel .gknobs { display: flex; align-items: flex-start; justify-content: space-around; gap: 6px; flex: none; }
  #gridPanel .gk { position: relative; display: grid; justify-items: center; gap: 1px; min-width: 64px; cursor: default; }
  #gridPanel .gk svg { width: 48px; height: 48px; cursor: ns-resize; touch-action: none; }
  #gridPanel .gk .kt { fill: none; stroke: var(--faint); stroke-width: 4; stroke-linecap: butt; }
  #gridPanel .gk .kv { fill: none; stroke: var(--cy); stroke-width: 4; filter: drop-shadow(0 0 3px rgba(95,216,222,.6)); }
  #gridPanel .gk .kc { fill: rgba(5,22,29,.95); stroke: var(--line); stroke-width: 1; }
  #gridPanel .gk .kp { stroke: var(--ink); stroke-width: 2.4; stroke-linecap: round; }
  #gridPanel .gk:hover .kc { stroke: var(--cy); } #gridPanel .gk:hover .kv { stroke: var(--cy2); }
  #gridPanel .gk.drag .kv, #gridPanel .gk:focus-within .kv { stroke: var(--yl); filter: drop-shadow(0 0 4px rgba(232,213,83,.7)); }
  #gridPanel .gk > input[type=range] { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  #gridPanel .gk > output { color: var(--yl); font-size: 13px; letter-spacing: .03em; line-height: 1.1; white-space: nowrap; }
  #gridPanel .gk > span { color: var(--cy2); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; text-align: center; line-height: 1.15; white-space: nowrap; }
  #gridPanel .gk.mg .kv { stroke: var(--mg); filter: drop-shadow(0 0 3px rgba(229,55,159,.6)); }
  #gridPanel .gtrig { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; }
  #gridPanel .gtrig .gb { margin: 0; min-height: 48px; display: grid; place-items: center; font-size: 12.5px; letter-spacing: .14em; background: rgba(229,55,159,.12); border-color: rgba(229,55,159,.55); color: #ffb3dd; }
  #gridPanel .gtrig .gb:hover { background: rgba(229,55,159,.28); border-color: var(--mg); }
  #gridPanel .gtrig .gb:active { background: var(--mg); color: #fff; }
  #gridPanel .gprogs .gb { text-align: left; padding: 7px 10px; margin: 0 0 4px; letter-spacing: .14em; } #gridPanel .gprogs .gb small { display: none; }
  #gridPanel .glayers { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; } #gridPanel .glayers .gb { margin: 0; padding: 7px 4px; font-size: 12px; letter-spacing: .1em; }
  #gridPanel .grow, #gridPanel .gb, #gridPanel select, #gridPanel .glbl { flex: none; }
  #gridPanel .grow, #gridPanel .gb, #gridPanel select { margin-bottom: 0; }
  #gridPanel .glbl { margin: 2px 0 0; }
  #gridPanel .gclock { display: flex; gap: 10px; align-items: center; flex: 1 1 0; min-height: 100px; }
  #gridPanel .gorb { position: relative; flex: 1 1 0; align-self: stretch; min-width: 0; }
  #gridPanel .gorb canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  #gridPanel .gorb > div { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; pointer-events: none; }
  #gridPanel .gorb b { font: 600 30px 'Chakra Petch', sans-serif; color: var(--ink); line-height: 1; } #gridPanel .gorb small { color: var(--dim); font-size: 10px; letter-spacing: .1em; }
  #gridPanel .gside { display: grid; gap: 6px; width: 46%; } #gridPanel .gside .gb { padding: 6px 4px; font-size: 11.5px; letter-spacing: .12em; }
  #gridPanel .gchartbar { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); gap: 6px; align-items: stretch; }
  #gridPanel .gchartbar .gb { padding: 5px 6px; font-size: 11.5px; letter-spacing: .1em; } #gridPanel .gchartbar .gb small { font-size: 10px; }
  #gridPanel .a-state .gcurve { flex: none; height: 46px; }
  #gridPanel .a-chart .gchord { margin: 0; } #gridPanel .a-chart .gchord b { font-size: 24px; }
  #gridPanel .a-chart .gpads { min-height: 70px; grid-auto-rows: minmax(30px, 1fr); margin-bottom: 0; }
  #gridPanel .gprogs .gb { padding: 4px 10px; margin-bottom: 3px; } #gridPanel .glayers .gb { padding: 4px 4px; } #gridPanel .a-prog { gap: 4px; }
  #gridPanel .gkey { flex: none; display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--dim); font-size: 11px; letter-spacing: .08em; }
  #gridPanel .gkey b { font-weight: 400; color: var(--cy2); }
  #gridPanel .gmini { display: flex; gap: 8px; align-items: center; flex: none; }

  /* a shelf loop on the broadcast: the note strip in the carrier chart, and the pop-up that asks how */
  #gridPanel .gstrip { display: flex; flex-direction: column; gap: 6px; flex: 1 1 0; min-height: 0; } #gridPanel .gstrip[hidden], #gridPanel .a-chart [hidden] { display: none; }
  #gridPanel .gstripbar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } #gridPanel .gstripbar b { color: var(--yl); font-weight: 400; letter-spacing: .12em; margin-right: auto; font-size: 12.5px; }
  #gridPanel .gstripbar .gb { width: auto; margin: 0; padding: 5px 9px; font-size: 11.5px; letter-spacing: .1em; }
  #gridPanel .gstripwrap { display: flex; gap: 6px; flex: 1 1 0; min-height: 110px; } #gridPanel .gstripwrap .gv { flex: 1 1 0; min-width: 0; height: auto; cursor: crosshair; }
  #gridPanel .gzoom { display: flex; flex-direction: column; gap: 4px; width: 38px; align-items: stretch; } #gridPanel .gzoom .gb { margin: 0; width: auto; padding: 4px 0; font-size: 15px; letter-spacing: 0; line-height: 1; }
  #gridPanel .gzoom #gZoomFit { font-size: 10.5px; letter-spacing: .06em; } #gridPanel .gzoom b { text-align: center; color: var(--yl); font-weight: 400; font-size: 11px; } #gridPanel .gzoom .gb:disabled { opacity: .35; cursor: default; }
  #gridPanel .gscroll { -webkit-appearance: none; appearance: none; width: calc(100% - 44px); height: 12px; margin: 0; background: rgba(5,22,29,.9); border: 1px solid var(--faint); }
  #gridPanel .gscroll[hidden] { display: none; }
  #gridPanel .gfeel { display: flex; gap: 8px; align-items: center; } #gridPanel .gfeel span { color: var(--cy2); font-size: 11.5px; letter-spacing: .14em; text-transform: uppercase; }
  #gridPanel .gfeel small { color: var(--faint2, #4f8c94); font-size: 11px; } #gridPanel .gfeel b { color: var(--yl); font-weight: 400; font-size: 11.5px; letter-spacing: .1em; min-width: 5.5em; }
  #gridPanel .gfeel .gact { flex: 1 1 auto; width: auto; min-width: 80px; } #gridPanel input.gscroll.gact::-webkit-slider-thumb { width: 18px; background: var(--cy); } #gridPanel input.gscroll.gact::-moz-range-thumb { width: 18px; background: var(--cy); }
  #gridPanel .gfeel .gb { width: auto; margin: 0 0 0 auto; padding: 5px 9px; font-size: 11.5px; letter-spacing: .1em; white-space: nowrap; } #gridPanel .gfeel .gb.on { background: rgba(229,55,159,.22); border-color: var(--mg); color: #ffd0ea; }
  #gridPanel input.gscroll::-webkit-slider-thumb { -webkit-appearance: none; width: 44px; height: 10px; margin-top: 0; background: var(--line); border: 0; border-radius: 0; box-shadow: none; cursor: grab; } #gridPanel input.gscroll::-moz-range-thumb { width: 44px; height: 10px; background: var(--line); border: 0; border-radius: 0; }
  #gridPanel input.gscroll::-webkit-slider-runnable-track { height: 10px; background: transparent; border: 0; }
  #gridPanel input.gscroll:hover::-webkit-slider-thumb { background: var(--cy); } #gridPanel .gstrip .ghint2 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #gridPanel .a-chart:has(.gstrip:not([hidden])) .gtag { visibility: hidden; }
  #gridPanel .gdlg { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; background: rgba(3,12,16,.72); }
  #gridPanel .gdlg[hidden] { display: none; }
  #gridPanel .gdlgbox { position: relative; width: min(560px, 92%); border: 1px solid var(--cy); background: #071a21; padding: 30px 20px 18px; display: grid; gap: 10px; box-shadow: 0 0 40px rgba(95,216,222,.18); }
  #gridPanel .gdlgbox .gtag { position: absolute; top: 9px; left: 20px; color: var(--mg); }
  #gridPanel .gdlgbox h4 { margin: 0 0 4px; font: 500 15px 'Chakra Petch', sans-serif; letter-spacing: .1em; color: var(--ink); text-transform: uppercase; } #gridPanel .gdlgbox h4 b { color: var(--yl); font-weight: 500; }
  #gridPanel .gdlgp { margin: 0 0 4px; color: var(--cy2); font-size: 12.5px; line-height: 1.5; }
  #gridPanel .gdlgopt { text-align: left; padding: 12px 14px; margin: 0; letter-spacing: .06em; text-transform: none; display: grid; gap: 4px; }
  #gridPanel .gdlgopt b { font: 500 14px 'Chakra Petch', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--cy); }
  #gridPanel .gxrow { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: start; }
  #gridPanel .gxrow .gb { margin: 0; padding: 6px 8px; font-size: 11.5px; letter-spacing: .06em; white-space: nowrap; background: rgba(229,55,159,.1); border-color: rgba(229,55,159,.5); color: #ffb3dd; }
  #gridPanel .gxrow .gb.on { background: rgba(229,55,159,.3); border-color: var(--mg); color: #fff; box-shadow: 0 0 10px rgba(229,55,159,.35); }
  #gridPanel .mall { display: grid; grid-template-columns: 1fr auto; gap: 6px; } #gridPanel .mall select, #gridPanel .mrow select { margin: 0; }
  #gridPanel .mall .gb { margin: 0; }
  #gridPanel .mrows { display: grid; gap: 5px; max-height: 46vh; overflow: auto; }
  #gridPanel .mrow { display: grid; grid-template-columns: 9.5em 1fr auto; gap: 6px; align-items: center; } #gridPanel .mrow span { color: var(--ink); font-size: 12.5px; letter-spacing: .06em; }
  #gridPanel .mrow .gb { margin: 0; padding: 5px 9px; }
  #gridPanel .mst { color: var(--yl); min-height: 1.5em; }
  #gridPanel .mfoot { display: grid; grid-template-columns: 1fr auto; gap: 8px; } #gridPanel .mfoot .gb { margin: 0; width: auto; padding-left: 18px; padding-right: 18px; }
  #gridPanel .gdlgopt small { color: var(--cy2); font-size: 12px; line-height: 1.45; } #gridPanel .gdlgopt:hover b { color: var(--yl); }
  #gridPanel .gchk { display: flex; align-items: center; gap: 7px; cursor: pointer; color: var(--cy2); font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; }
  #gridPanel .gchk input { appearance: none; width: 15px; height: 15px; margin: 0; border: 1px solid var(--line); background: rgba(5,22,29,.9); display: grid; place-items: center; cursor: pointer; }
  #gridPanel .gchk input:checked { background: var(--yl); border-color: var(--yl); } #gridPanel .gchk input:checked::after { content: ''; width: 7px; height: 4px; border: 2px solid #04141a; border-top: 0; border-right: 0; transform: rotate(-45deg) translate(1px, -1px); }
  #gridPanel .gchk input:focus-visible { outline: 2px solid var(--yl); outline-offset: 2px; }
  /* the mode tabs */
  #gridPanel .gtabs { display: flex; gap: 0; margin-left: 10px; border: 1px solid var(--line); }
  #gridPanel .gtab { background: none; border: 0; color: var(--cy2); font: inherit; font-size: 12.5px; letter-spacing: .2em; text-transform: uppercase; padding: 6px 14px; cursor: pointer; }
  #gridPanel .gtab:hover { background: rgba(95,216,222,.14); } #gridPanel .gtab.on { background: var(--cy); color: #04141a; }
  #gridPanel .gtab.beckon:not(.on) { animation: gtBeckon 2.4s ease-in-out infinite; }   /* the Booth tab, until the player first opens it */
  @keyframes gtBeckon { 0%, 100% { background: transparent; color: var(--cy2); box-shadow: none; } 50% { background: rgba(80,240,140,.28); color: #b8ffd2; box-shadow: 0 0 14px rgba(80,240,140,.55), inset 0 0 0 1px #5df09a; } }
  #gridPanel .gtab:focus-visible { outline: 2px solid var(--yl); outline-offset: -2px; }
  /* the Booth: setup on the left, the loop and the magic keys in the middle, the shelf on the right */
  #gridPanel .gbooth { flex: 1; min-height: 0; display: grid; gap: 10px; padding: 4px 2px 6px;
    grid-template-columns: minmax(250px, .8fr) minmax(0, 2.6fr) minmax(250px, .9fr); grid-template-rows: minmax(0, 1fr) minmax(0, auto);
    grid-template-areas: "setup roll shelf" "setup keys shelf"; }
  #gridPanel .gbooth[hidden], #gridPanel .gmain[hidden] { display: none; }
  #gridPanel .b-setup { grid-area: setup; } #gridPanel .b-roll { grid-area: roll; } #gridPanel .b-keys { grid-area: keys; } #gridPanel .b-shelf { grid-area: shelf; }
  #gridPanel .bsong { display: grid; gap: 5px; border: 1px dashed var(--line); padding: 7px; } #gridPanel .bsong .gb { margin: 0; }
  #gridPanel .bsongst { color: var(--cy2); font-size: 11.5px; line-height: 1.4; letter-spacing: .03em; }
  #gridPanel .bsonginfo { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 11.5px; }
  #gridPanel .bsonginfo dt { color: var(--dim); letter-spacing: .12em; text-transform: uppercase; font-size: 10.5px; align-self: center; }
  #gridPanel .bsonginfo dd { margin: 0; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #gridPanel .bsonginfo dd:first-of-type { color: var(--yl); }
  #gridPanel .bnudge[hidden], #gridPanel .bsonginfo[hidden], #gridPanel .bsongst[hidden] { display: none; }
  #gridPanel .bnudge { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; } #gridPanel .bnudge .gb { margin: 0; padding: 5px 4px; font-size: 10.5px; letter-spacing: .06em; white-space: normal; line-height: 1.25; }
  #gridPanel .bnudge #bSongBack { grid-column: 1 / -1; } #gridPanel .bnudge .gb:disabled { opacity: .4; cursor: default; }
  #gridPanel .gbooth .b-setup { scrollbar-width: thin; scrollbar-color: var(--line) transparent; } #gridPanel .gbooth .b-setup::-webkit-scrollbar { display: block; width: 6px; } #gridPanel .gbooth .b-setup::-webkit-scrollbar-thumb { background: var(--line); }
  #gridPanel .b-setup .gknobs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 4px; } #gridPanel .b-setup .gknobs .gk { min-width: 0; }
  #gridPanel .bvoices .gb.dis { opacity: .45; }
  #gridPanel .bvoices { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; } #gridPanel .bvoices .gb { margin: 0; text-align: left; padding: 5px 7px; font-size: 11.5px; letter-spacing: .08em; }
  #gridPanel .bvoices .gb small { display: block; color: var(--dim); font-size: 10px; line-height: 1.2; letter-spacing: .04em; text-transform: none; margin-top: 1px; } #gridPanel .bvoices .gb.on small { color: #0b3a40; }
  #gridPanel .btrans { display: flex; gap: 6px; flex-wrap: wrap; flex: none; } #gridPanel .btrans .gb { margin: 0; flex: 1 1 auto; width: auto; padding: 8px 10px; }
  #gridPanel .brec.armed { background: rgba(229,55,159,.3); border-color: var(--mg); color: #fff; } #gridPanel .brec.live { background: var(--mg); border-color: var(--mg); color: #fff; }
  #gridPanel .bap.on { background: var(--mg); border-color: var(--mg); color: #fff; }
  #gridPanel .b-roll .gv { flex: 1 1 0; min-height: 120px; }
  #gridPanel .bkeys { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px; height: 128px; }
  #gridPanel .bkey { position: relative; border: 1px solid var(--line); background: rgba(10,40,48,.75); color: var(--ink); cursor: pointer; display: grid; align-content: end; justify-items: center; padding: 6px 2px; font: inherit; touch-action: none; transition: background .08s, transform .05s; }
  #gridPanel .bkey b { font: 600 17px 'Chakra Petch', sans-serif; letter-spacing: .02em; } #gridPanel .bkey small { color: var(--dim); font-size: 11px; }
  #gridPanel .bkey.core { border-color: var(--cy); background: rgba(95,216,222,.16); }
  #gridPanel .bkey.root b { color: var(--yl); }
  #gridPanel .bkey:hover { background: rgba(95,216,222,.26); }
  #gridPanel .bkey.down { background: var(--cy); color: #04141a; transform: translateY(2px); } #gridPanel .bkey.down small { color: #0b3a40; }
  #gridPanel .bkey.ap { box-shadow: inset 0 0 0 2px var(--mg); } #gridPanel .bkey.pl { box-shadow: inset 0 -5px 0 var(--cy2); }
  #gridPanel .bkey.retune { animation: bRet .35s ease-out; } @keyframes bRet { 0% { filter: brightness(1.8); } 100% { filter: none; } }
  #gridPanel .bkey:focus-visible { outline: 2px solid var(--yl); outline-offset: 2px; }
  #gridPanel .ghint2 { color: var(--dim); font-size: 11.5px; letter-spacing: .04em; }
  #gridPanel .bsave { display: flex; gap: 6px; } #gridPanel .bsave input { flex: 1; min-width: 0; background: rgba(4,18,24,.9); border: 1px solid var(--line); color: var(--ink); font: inherit; padding: 7px 8px; }
  #gridPanel .bsave input:focus { outline: 2px solid var(--yl); outline-offset: 1px; } #gridPanel .bsave .gb { margin: 0; width: auto; }
  #gridPanel .blist { display: grid; gap: 6px; overflow: auto; min-height: 0; flex: 1; align-content: start; }
  #gridPanel .bitem { border: 1px solid var(--faint); background: rgba(6,24,30,.7); padding: 7px 8px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }
  #gridPanel .b-setup .grow .gb { letter-spacing: .1em; padding: 6px 4px; white-space: nowrap; }
  #gridPanel .bitem.on { border-color: var(--yl); }
  #gridPanel .bitem .bt { color: var(--ink); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #gridPanel .bitem .bm { color: var(--dim); font-size: 11px; }
  #gridPanel .bitem .br { display: flex; gap: 4px; flex-wrap: wrap; } #gridPanel .bitem .br .gb { margin: 0; width: auto; padding: 4px 7px; font-size: 11px; letter-spacing: .08em; }
  #gridPanel .bitem input { background: rgba(4,18,24,.9); border: 1px solid var(--yl); color: var(--ink); font: inherit; padding: 3px 6px; width: 100%; }
  #gridPanel .bempty { color: var(--dim); font-size: 12px; line-height: 1.5; }
  @media (max-width: 1100px), (max-height: 780px) {
    #gridPanel .gbooth { overflow: auto; grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "keys" "roll" "setup" "shelf"; align-items: start; }
    #gridPanel .gbooth > .gp { overflow: visible; min-height: auto; } #gridPanel .b-roll .gv { flex: none; height: 180px; }
    #gridPanel .bkeys { grid-template-columns: repeat(6, minmax(0, 1fr)); height: auto; } #gridPanel .bkey { min-height: 64px; }
  }

  /* opening: the city glitches, a curtain of falling glyphs closes over it, then the panel's blocks come up one by one */
  #view.gp-glitch { animation: gpGl .32s steps(2) 1; }
  @keyframes gpGl { 0% { transform: translate(0); } 18% { transform: translate(-7px, 2px); filter: hue-rotate(50deg) contrast(1.35); } 38% { transform: translate(6px, -3px); filter: saturate(2.2); }
    58% { transform: translate(-3px, 1px); filter: hue-rotate(-40deg); } 100% { transform: none; filter: none; } }
  #gridPanel.boot .gtop, #gridPanel.boot .gbot { animation: gpBoot .26s ease-out both; }
  #gridPanel.boot .gp { animation: gpBoot .32s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i, 0) * 30ms + 40ms); }
  @keyframes gpBoot { 0% { opacity: 0; clip-path: inset(0 100% 0 0); filter: brightness(2.4) saturate(1.6); } 55% { opacity: 1; filter: brightness(1.6); } 100% { opacity: 1; clip-path: inset(0 0 0 0); filter: none; } }
  /* the player's own Settings: reduce motion (nt-calm) or Clean signal (nt-clean) and the glitch, the boot, the blinking and the scanlines stay still.
     Off unless the player turns them on (grid.js skips the curtain and the decoding titles then too) */
  html.nt-calm #view.gp-glitch, html.nt-clean #view.gp-glitch, html.nt-calm #gridPanel.boot .gtop, html.nt-clean #gridPanel.boot .gtop, html.nt-calm #gridPanel.boot .gbot, html.nt-clean #gridPanel.boot .gbot,
  html.nt-calm #gridPanel.boot .gp, html.nt-clean #gridPanel.boot .gp, html.nt-calm #gridPanel .gchip.live i, html.nt-clean #gridPanel .gchip.live i, html.nt-calm #gridPanel .bkey.retune { animation: none; }
  html.nt-calm #gridPanel .gtab.beckon:not(.on), html.nt-clean #gridPanel .gtab.beckon:not(.on) { animation: none; color: #b8ffd2; box-shadow: inset 0 0 0 1px #5df09a; }
  html.nt-clean #gridPanel::before { display: none; }

  /* ---------- on a touch screen (html.touch, touch.js; css/style.css has the first pass: the top row, the 44 px buttons and bars) ----------
     The console splits into four sections that each fit a phone, a readout strip at the top shows the dial under the finger (never under the
     thumb), and a press and hold on anything opens a plate that says in plain words what it does. A mouse and keyboard see none of this. */
  #gridPanel .gsec, #gridPanel .gread, #gridPanel .gplate { display: none; }
  html.touch #gridPanel { -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
  html.touch #gridPanel button, html.touch #gridPanel .gk, html.touch #gridPanel select, html.touch #gridPanel .gchk, html.touch #gridPanel input[type=range] { touch-action: manipulation; }
  html.touch #gridPanel .gk svg { touch-action: none; }
  /* (whichever of the two is hidden stays hidden: the column rules in style.css would otherwise show the Console under the Booth) */
  html.touch #gridPanel .gmain[hidden], html.touch #gridPanel .gbooth[hidden] { display: none; }
  html.touch #gridPanel .gx { min-width: 64px; }
  /* (the chips always start a row of their own under the tabs and CLOSE, so CLOSE stays in the top right corner on a wide tablet too) */
  /*  Sideways on a phone there's no height to spare, so there they share the top row) */
  @media (min-height: 521px) { html.touch #gridPanel .gtop::before { content: ''; order: 0; flex: 0 0 100%; height: 0; } html.touch #gridPanel .gtop > .gchip { order: 1; } }
  /* the readout strip: the dial or bar being touched, its name and value, and where it sits in its range */
  html.touch #gridPanel .gread { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto 3px; align-items: center; column-gap: 10px; flex: none; min-height: 38px;
    padding: 5px 10px 0; background: rgba(3,14,18,.92); border: 1px solid var(--faint); color: var(--dim); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
  html.touch #gridPanel .gread .grn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  html.touch #gridPanel .gread .grv { font: 600 17px 'Chakra Petch', sans-serif; letter-spacing: .04em; color: var(--yl); white-space: nowrap; text-transform: none; }
  html.touch #gridPanel .gread .grbar { grid-column: 1 / -1; align-self: end; height: 2px; margin: 4px -10px 0; background: transparent; }
  html.touch #gridPanel .gread .grbar > i { display: block; height: 100%; width: 0; background: var(--yl); box-shadow: 0 0 6px rgba(232,213,83,.7); }
  html.touch #gridPanel .gread.live { border-color: var(--line); } html.touch #gridPanel .gread.live .grn { color: var(--ink); }
  html.touch #gridPanel .gread:not(.live) .grbar > i { width: 0 !important; }
  /* the explanation plate, dropped from the top of the panel (the control it explains gets a yellow frame) */
  html.touch #gridPanel .gplate:not([hidden]) { display: grid; gap: 8px; position: absolute; z-index: 6; left: max(12px, env(safe-area-inset-left,0px)); right: max(12px, env(safe-area-inset-right,0px)); top: calc(56px + env(safe-area-inset-top,0px));
    max-width: 460px; margin: 0 auto; padding: 14px 14px 12px; background: rgba(5,18,23,.97); border: 1px solid var(--cy); box-shadow: 0 0 0 1px rgba(3,12,16,.9), 0 0 30px rgba(95,216,222,.22), 0 12px 40px rgba(0,0,0,.6); }
  html.touch #gridPanel .gplate .gpn { font: 600 16px 'Chakra Petch', sans-serif; letter-spacing: .16em; color: var(--ink); text-transform: uppercase; }
  html.touch #gridPanel .gplate .gpn::before { content: '[ '; color: var(--dim); } html.touch #gridPanel .gplate .gpn::after { content: ' ]'; color: var(--dim); }
  html.touch #gridPanel .gplate .gpp { margin: 0; color: #eafcfc; font-size: 15px; line-height: 1.45; letter-spacing: .02em; }
  html.touch #gridPanel .gplate .gpl { margin: 0; color: var(--cy2); font-size: 13px; line-height: 1.45; letter-spacing: .02em; opacity: .85; }
  html.touch #gridPanel .gplate .gpl:empty { display: none; }
  html.touch #gridPanel .gplate .gpr { display: flex; gap: 8px; justify-content: flex-end; } html.touch #gridPanel .gplate .gpr .gb { width: auto; margin: 0; padding: 0 16px; font-size: 12px; }
  html.touch #gridPanel .gplate .gpr .gb[hidden] { display: none; }
  html.touch #gridPanel .gexp { outline: 2px solid var(--yl); outline-offset: 2px; }
  /* the sections bar: one tab a section, under the top row */
  html.touch #gridPanel .gsect { flex: 1 1 0; min-width: 0; min-height: 44px; padding: 0 4px; background: rgba(5,22,29,.85); border: 1px solid var(--faint); border-radius: 0; color: var(--cy2);
    font: 400 12px 'JetBrains Mono', monospace; letter-spacing: .04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  html.touch #gridPanel .gsect.on { background: rgba(95,216,222,.16); border-color: var(--cy); color: var(--ink); box-shadow: inset 0 -3px 0 var(--cy); }
  html.touch #gridPanel:has(.gmain[hidden]) .gsec { display: none !important; }
  @media (max-width: 1100px), (max-height: 780px) {
    html.touch #gridPanel .gsec { display: flex; gap: 4px; flex: none; }
    html.touch #gridPanel .gmain { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; overscroll-behavior: contain; grid-template-areas: none; }
    html.touch #gridPanel .gmain > .gp { flex: 1 0 auto; min-height: 0; overflow: visible; }
    html.touch #gridPanel .gmain > .gp:not(.sec-on) { display: none; }
    html.touch #gridPanel .gmain > .a-chart { order: -1; }   /* (the chart leads its section: the harmonics are its fine-tuning) */
    html.touch #gridPanel .gmain .gv { flex: 1 1 0; height: auto; min-height: 84px; }
    html.touch #gridPanel .gmain .a-state > .gv:not(.gcurve) { min-height: 200px; }
    html.touch #gridPanel .gmain .a-state .gcurve { flex: none; height: 46px; min-height: 0; }
    html.touch #gridPanel .gstripwrap { flex: none; min-height: 0; }
    html.touch #gridPanel .gmain .gstripwrap .gv { flex: 1 1 0; height: 184px; min-height: 0; }
    html.touch #gridPanel .gfeel { flex-wrap: wrap; row-gap: 4px; } html.touch #gridPanel .gfeel .gb { flex: 1 0 100%; margin: 0; }
    html.touch #gridPanel .gknobs, html.touch #gridPanel .gmini { flex-wrap: wrap; justify-content: space-around; }
  }
  /* sideways on a phone (wide and short): a section's two blocks side by side, each scrolling on its own */
  @media (max-height: 520px) and (min-width: 560px) {
    html.touch #gridPanel .gmain { flex-direction: row; overflow: hidden; }
    html.touch #gridPanel .gmain > .gp { flex: 1 1 0; min-width: 0; overflow-y: auto; overscroll-behavior: contain; }
    html.touch #gridPanel .gmain .a-state > .gv:not(.gcurve) { min-height: 120px; }
    html.touch #gridPanel .gread { position: absolute; z-index: 5; left: max(10px, env(safe-area-inset-left,0px)); right: max(10px, env(safe-area-inset-right,0px)); min-height: 44px; border-color: var(--cy); background: #04131a; }
    html.touch #gridPanel .gread:not(.live) { display: none; }
  }
  /* text no smaller than 12 px for the short capitals, 13 for sentences */
  html.touch #gridPanel .gk > span, html.touch #gridPanel .gkey, html.touch #gridPanel .glbl, html.touch #gridPanel .gpad small, html.touch #gridPanel .gorb small,
  html.touch #gridPanel .gring small, html.touch #gridPanel .gfeel span, html.touch #gridPanel .gfeel small, html.touch #gridPanel .gfeel b, html.touch #gridPanel .gzoom b,
  html.touch #gridPanel .gchk, html.touch #gridPanel .gb small, html.touch #gridPanel .gside .gb, html.touch #gridPanel .gchartbar .gb, html.touch #gridPanel .gstripbar .gb,
  html.touch #gridPanel .gxrow .gb, html.touch #gridPanel .glayers .gb, html.touch #gridPanel .bsonginfo, html.touch #gridPanel .bsonginfo dt, html.touch #gridPanel .bvoices .gb small { font-size: 12px; }
  html.touch #gridPanel .gnote, html.touch #gridPanel .ghint2, html.touch #gridPanel .bsongst, html.touch #gridPanel .bempty, html.touch #gridPanel .gdlgp { font-size: 13px; line-height: 1.45; }
  html.touch #gridPanel .gstrip .ghint2 { white-space: normal; }
  html.touch #gridPanel .gchk { min-height: 44px; } html.touch #gridPanel .gchk input { width: 20px; height: 20px; }
  html.touch #gridPanel select { min-height: 44px; font-size: 16px; }   /* (16 px: smaller and iOS zooms the page when it opens) */
  html.touch #gridPanel .gk > output { font-size: 13px; }
  /* a phone: the room goes to the controls. The status bar along the foot repeats what the chips, the clock and the switches already say, and
     two of the chips repeat the clock and the chart, so they step out; the chart picker gets a row of its own */
  @media (max-width: 760px) {
    html.touch #gridPanel .gbot { display: none; }
    html.touch #gridPanel .gchip:has(#gpMood), html.touch #gridPanel .gchip:has(#gpClock) { display: none; }
    html.touch #gridPanel .gchartbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } html.touch #gridPanel .gchartbar select { grid-column: 1 / -1; }
    html.touch #gridPanel .gmain .gv { min-height: 64px; }
  }
  /* the two bars under the strip: 44 px tall to the finger, the drawn bar stays thin */
  html.touch #gridPanel input.gscroll { height: 44px; background: transparent; border: 0; }
  html.touch #gridPanel input.gscroll::-webkit-slider-runnable-track { height: 12px; background: rgba(5,22,29,.9); box-shadow: inset 0 0 0 1px var(--faint); }
  html.touch #gridPanel input.gscroll::-webkit-slider-thumb { height: 12px; margin-top: 0; }
  html.touch #gridPanel input.gscroll::-moz-range-track { height: 12px; background: rgba(5,22,29,.9); }
  html.touch #gridPanel .gzoom { width: 48px; }
  html.touch #gridPanel .gstrip.rw #gStripCv { touch-action: none; }   /* (a rewired loop: the finger moves notes there, the page doesn't scroll under it) */
  /* the Booth: the pads show their place in the chord, not the computer keys; the loop's status and the chord stay in view; the shelf's buttons and the name box sized for a thumb */
  html.touch #gridPanel .bkey small { font-size: 13px; color: var(--cy2); letter-spacing: .04em; }
  html.touch #gridPanel .bkey.down small { color: #0b3a40; }
  html.touch #gridPanel .gbooth { overscroll-behavior: contain; }
  html.touch #gridPanel .gbooth .b-roll > .gtag, html.touch #gridPanel .gbooth .b-keys > .gtag { display: block; left: auto; right: 14px; top: 7px; max-width: calc(100% - 130px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--yl); }
  html.touch #gridPanel .bsave input, html.touch #gridPanel .bitem input { font-size: 16px; min-height: 44px; }
  html.touch #gridPanel .bitem .br .gb { min-height: 44px; padding: 0 12px; font-size: 12px; flex: 1 1 auto; }
  html.touch #gridPanel .bnudge .gb { font-size: 12px; }
  html.touch #gridPanel .bitem .bm { font-size: 12px; } html.touch #gridPanel .bitem .bt { font-size: 14px; }
  /* the DELETE chip over a held note (booth.js) */
  html.touch #gridPanel .gdel { position: absolute; z-index: 4; width: auto; min-height: 36px; margin: 0; padding: 0 14px; transform: translate(-50%, calc(-100% - 8px));
    font: 600 12.5px 'Chakra Petch', sans-serif; letter-spacing: .18em; color: #fff; background: rgba(120,14,70,.96); border: 1px solid var(--mg); box-shadow: 0 0 14px rgba(229,55,159,.55); }
  html.touch #gridPanel .gdel.below { transform: translate(-50%, 8px); }
  html.touch #gridPanel .gdel::before { content: ''; position: absolute; inset: -6px -4px; }   /* (44 px to the finger) */
  html.touch #gridPanel .gdel[hidden] { display: none; }
  `;
  const knob = (id, name, min, max, step, val, tip, cls = '', out = true) => `<label class="gk ${cls}" title="${tip} (drag up or down, scroll, double-click to reset)"><svg viewBox="0 0 48 48" aria-hidden="true"></svg><input type="range" id="g-${id}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${name}"><output${out ? ` id="g-${id.replace(/Slider$/, '')}Val"` : ''}></output><span>${name}</span></label>`;
  const html = `
  <div class="gtop">
    <span class="gchip live" id="gpLive"><i></i><span id="gpLiveT">BROADCAST LIVE</span></span>
    <span class="gchip mg"><i></i><span id="gpProg">PROGRAM</span></span>
    <span class="gchip yl"><i></i><span id="gpChord">CARRIER</span></span>
    <span class="gchip"><i></i><span id="gpMood">MOOD</span></span>
    <span class="gchip"><i></i><span id="gpClock">CLOCK</span></span>
    <span class="gtabs" role="tablist"><button class="gtab on" data-mode="console" role="tab" title="The broadcast's controls and shapes">Console</button><button class="gtab" data-mode="booth" role="tab" title="Play over a carrier pattern, record loops and keep them (the city's broadcast steps aside)">Booth</button></span>
    <span class="gname">PSYCHO-ACOUSTIC GRID</span>
    <button class="gx" id="gpClose" title="Close the panel (Esc)">CLOSE</button>
  </div>
  <div class="gsec" role="tablist" aria-label="Console sections"><button class="gsect" data-sec="cast" role="tab">Broadcast</button><button class="gsect" data-sec="clock" role="tab">Clock</button><button class="gsect" data-sec="carrier" role="tab">Carrier</button><button class="gsect" data-sec="air" role="tab">Air</button></div>
  <div class="gread" aria-live="polite"><span class="grn"></span><b class="grv"></b><i class="grbar"><i></i></i></div>
  <div class="gmain">
    <section class="gp a-clock"><h3>Circadian clock</h3><span class="gtag" id="g-beatCounterBadge">1/4</span><span id="g-tempoSyncLed" hidden></span>
      <div class="gclock">
        <div class="gorb" title="The dots ride round once a bar, as many as the footfall cadence; the beat flashes the ring"><canvas id="gvOrbit"></canvas><div><b id="g-bpmReadout">82</b><small>CYCLES/MIN</small></div></div>
        <div class="gside">
          ${knob('bpmSlider', 'Clock rate', 55, 140, 1, 82, "Sets the metabolic pacing of the sector's population.", '', false)}
          <button class="gb" id="g-tapTempoBtn" title="Tap the pulse and the whole district falls in step">Tap pulse</button>
          <label class="gchk" title="The auto-governor leaves the clock where it is (it still drifts everything else)"><input type="checkbox" id="g-tempoLock"><span>Lock tempo</span></label>
        </div>
      </div>
      <div class="grow" title="Footfall cadence: how finely each beat is cut, the rhythm of the footsteps the broadcast matches.">
        <button class="gb subdiv-btn" data-subdiv="1/4">1/4</button><button class="gb subdiv-btn" data-subdiv="1/8.">1/8.</button><button class="gb subdiv-btn on" data-subdiv="1/8">1/8</button><button class="gb subdiv-btn" data-subdiv="1/8T">1/8T</button><button class="gb subdiv-btn" data-subdiv="1/16">1/16</button>
      </div>
      <button class="gb on" id="g-quantizeToggleBtn" title="Melodic pings snap to the cadence so they land with the crowd's footsteps"><span>Grid lock: </span><span id="g-quantizeStateText">ON (GRID)</span></button>
      <div class="gst dim" id="g-delaySyncReadout"></div><div class="gst dim" id="g-subdivRatioLabel" hidden></div>
      <span class="gcode">A1</span></section>
    <section class="gp a-state"><h3>District state</h3><span class="gtag">THE WHOLE BROADCAST</span>
      <canvas class="gv" id="gvState" title="Everything at once: the chord's shape, the live spectrum as rays, echo rings from the resonance, a halo of grains"></canvas>
      <div class="gkey"><span><b>SHAPE</b> carrier chord</span><span><b>RAYS</b> live spectrum (warm = smog open)</span><span><b>RINGS</b> canyon resonance</span><span><b>HALO</b> dispersion</span><span><b>SPIN</b> clock</span></div>
      <canvas class="gv gcurve" id="gpCurve" height="46"></canvas>
      <span class="gcode">B1</span></section>
    <section class="gp a-prog"><h3>Broadcast programs</h3>
      <div class="gprogs" id="gpPrograms"></div>
      <div class="glbl">Layers</div>
      <div class="glayers">
        <button class="gb" id="g-leadLoopBtn" title="A neuro-phrase that improvises over the carrier without stopping">Neuro-phrase</button>
        <button class="gb on" id="g-autopilotBtn" title="Lets the grid steer its own clock, cadence, dispersion mode and knobs as the mood changes">Auto-governor</button>
        <button class="gb" id="g-ambientBtn" title="Slow, soft pads in place of the heavy drone">Sedation bed</button>
        <button class="gb" id="g-engageSwitch" title="Hold or resume the whole broadcast"><span class="gled" id="g-engageLed"></span>Hold</button>
      </div>
      <div class="gst dim" id="g-engageStatusText"></div>
      <span class="gcode">D1</span></section>
    <section class="gp a-atmos"><h3>Atmosphere</h3><span class="gtag" id="g-spaceWarmthVal"></span>
      <canvas class="gv" id="gvCoil" title="Canyon resonance loosens the coil and trails echoes; smog attenuation dims its upper rings into fog"></canvas>
      <div class="gknobs">
        ${knob('warmthFilterSlider', 'Smog', 600, 5800, 50, 2500, 'A high-cut that dampens harsh industrial frequencies. Lower values simulate heavy acid rain and fog.')}
        ${knob('spaceReverbSlider', 'Resonance', 0.1, 1, 0.02, 0.84, 'Acoustic reflection depth across the vertical shafts of the city.')}
      </div>
      <span class="gcode">D2</span></section>
    <section class="gp a-harm"><h3>Carrier harmonics</h3>
      <canvas class="gv" id="gvPoly" title="The chord's notes as points round a circle: output is how bold the shape is, the hum its glowing core, hold time how slowly it turns"></canvas>
      <div class="gknobs">
        ${knob('droneLevelSlider', 'Output', 0.1, 1, 0.02, 0.8, 'How loud the carrier wave rides under everything else.')}
        ${knob('subAnchorSlider', 'Hum', 0, 1, 0.02, 0.65, 'The sub-audible weight that the megablocks sit on.', 'mg')}
        ${knob('chordHoldSlider', 'Hold', 5, 24, 1, 10, 'How long a carrier chord holds before the planners change it.')}
      </div>
      <span class="gcode">C1</span></section>
    <section class="gp a-disp"><h3>Aerosol dispersion</h3>
      <div class="grow"><button class="gb micro-mode-btn on" data-mode="MOSAIC" title="Tiled echoes of the melody an octave up">Mosaic</button><button class="gb micro-mode-btn" data-mode="HAZE" title="Long soft clouds that bloom out of held notes">Haze</button><button class="gb micro-mode-btn" data-mode="ARP" title="Short stuttering ratchets on strong beats">Glitch</button></div>
      <canvas class="gv" id="gvCloud" title="Density is how many grains; the mode is how they move; static is the speckle and rain"></canvas>
      <div class="gknobs">
        ${knob('granularMixSlider', 'Density', 0, 1, 0.02, 0.62, 'Density of micro-acoustic scattering across upper-level walkways.')}
        ${knob('lofiTextureSlider', 'Static', 0, 1, 0.02, 0.38, 'Hiss and dust: the sound of acid rain on the vents.')}
      </div>
      <div class="gst dim" id="g-granularSyncTelemetry"></div>
      <span class="gcode">A2</span></section>
    <section class="gp a-chart"><h3>District carrier chart</h3><span class="gtag">TAP A PAD TO JUMP</span>
      <div class="gchartbar">
        <select id="g-progressionSelect" title="Which carrier pattern the planners are running through the district"></select>
        <button class="gb" id="g-freezeSwitch" title="Suspends the current acoustic atmosphere in a localized time-loop"><span class="gled" id="g-freezeLed"></span>Stasis<small id="g-freezeStatusText">STASIS FIELD: OFF</small></button>
        <button class="gb" id="g-markovToggleBtn" title="Lets the carrier wander to neighboring chords instead of marching in order"><span>Drift: </span><span id="g-markovStateText">ORDERED</span></button>
      </div>
      <div class="gchord"><b id="g-activeChordBadge">Fmaj9</b><span id="g-activeMoodTag"></span></div>
      <div class="gpads" id="g-chordTimelineGrid"></div>
      <div class="gpills" id="g-voicingPillsContainer" title="The notes of the chord now sounding"></div>
      <div class="gstrip" id="gStrip" hidden>
        <div class="gstripbar"><b id="gStripMode"></b><button class="gb" id="gStripSave" hidden title="Put this rewired version on the Booth shelf as a new loop (the original stays as it was)">Keep as a new loop</button><button class="gb" id="gStripEnd" title="Go back to the planners' carrier pattern">Back to the planners</button></div>
        <div class="gfeel"><span>Activity</span><small>Minimal</small><input type="range" class="gscroll gact" id="gAct" min="0" max="1" step="0.05" value="0.3" aria-label="How busy the loop is, from minimal to busy" title="Minimal leaves the chords room to breathe: fewer notes (yours too), fewer answers and echoes, now and then a bar for the chord alone. Busy plays more, but never piles notes up on each other."><small>Busy</small><b id="gActLbl"></b>
          <button class="gb" id="gPings" title="Now and then the autopilot plays a ping in this song's own voice, in tune with the loop's chords">Autopilot pings: on</button></div>
        <div class="gstripwrap"><canvas class="gv" id="gStripCv" title="The loop on the broadcast: chords along the top, its notes in cyan, the Grid's answers in pink"></canvas>
          <div class="gzoom"><button class="gb" id="gZoomIn" title="Zoom in (or Ctrl + scroll)">+</button><b id="gZoomLvl">1×</b><button class="gb" id="gZoomOut" title="Zoom out">−</button><button class="gb" id="gZoomFit" title="Show the whole loop">Fit</button></div></div>
        <input type="range" id="gStripScroll" class="gscroll" min="0" max="0" step="0.25" value="0" hidden aria-label="Move along the loop">
        <div class="ghint2" id="gStripHint"></div>
      </div>
      <span class="gcode">B2</span></section>
    <section class="gp hot a-ping"><h3>Dopamine ping</h3>
      <canvas class="gv" id="gvPing" title="Ticks: how often pings come round; a fired ping opens magenta rings (as big as its depth), lamp chimes small yellow ones"></canvas>
      <div class="gmini">
        ${knob('motifSparsitySlider', 'Rate', 0.05, 0.95, 0.05, 0.45, 'How often melodic neuro-triggers fire. Higher means more frequent.', 'mg')}
        ${knob('motifLevelSlider', 'Depth', 0, 1, 0.02, 0.68, 'How strongly each ping is felt: its level in the broadcast.', 'mg')}
        <div class="gtrig"><button class="gb mg" id="g-manualMotifBtn" title="Fire one ping now">Fire</button><button class="gb mg" id="g-manualBellBtn" title="A cluster of high resonant tones, like harmonics rung on the lamp posts">Chimes</button></div>
      </div>
      <div class="gxrow"><select id="g-motifStyleSelect" title="Trigger pattern: the shape of the soothing neural phrase"></select><button class="gb mg" id="g-motifXform">Transform</button></div>
      <div class="gst" id="g-motifStatusText">PING STANDBY</div><span class="gled" id="g-motifLed" style="display:none"></span>
      <span class="gcode">C2</span></section>
  </div>
  <div class="gbooth" id="gBooth" hidden>
    <section class="gp b-setup"><h3>Booth setup</h3>
      <div class="glbl">Carrier pattern</div>
      <select id="g-boothProg" title="The chords you'll play over: one chord a bar"></select>
      <div class="bsong"><button class="gb" id="bSongBtn" title="Pick a song from your computer (or drop it on the Booth). It's analyzed here and never leaves your computer.">Load a song</button><input type="file" id="bSongFile" accept="audio/*" hidden>
        <div class="bsongst" id="bSongSt"></div><dl class="bsonginfo" id="bSongInfo" hidden></dl>
        <div class="bnudge" id="bSongNudge" hidden title="Which part of the song the pattern and the chops come from, a bar at a time">
          <button class="gb" data-d="-1">◀ Sample an earlier section</button><button class="gb" data-d="1">Sample a later section ▶</button>
          <button class="gb" id="bSongBack" title="Back to the section the Booth picked when it listened">Return to the original sample</button></div>
</div>
      <div class="glbl">Length</div>
      <div class="grow" id="bLen"><button class="gb" data-len="4" title="The first four chords">4 bars</button><button class="gb on" data-len="8" title="All eight chords">8 bars</button></div>
      <div class="glbl">Voice</div>
      <div class="bvoices" id="bVoices"></div>
      <div class="gknobs">${knob('boothChopSlider', 'Song level', 0, 4, 0.05, 1, 'How loud the song sampler and the chops play, from silent to four times as loud.')}${knob('boothPadSlider', 'Chords', 0, 2, 0.05, 1, 'How loud the carrier chords under the loop play, from silent to twice as loud.')}${knob('boothBpmSlider', 'Clock', 60, 132, 1, 84, 'How fast the loop runs, in beats a minute.')}${knob('boothApSlider', 'Answer', 0, 1, 0.02, 0.55, 'How much the autopilot plays when it answers you.', 'mg')}</div>
      <div class="glbl">Tidy timing</div>
      <div class="grow" id="bTidy" title="How much recorded notes are pulled onto the beat grid (sixteenths)"><button class="gb" data-tidy="0">Off</button><button class="gb on" data-tidy="0.5">Gentle</button><button class="gb" data-tidy="1">Full</button></div>
      <div class="glbl">Click</div>
      <div class="grow" id="bClick" title="A soft tick on the beat"><button class="gb on" data-click="count">Count-in</button><button class="gb" data-click="all">Always</button><button class="gb" data-click="off">Off</button></div>
    </section>
    <section class="gp b-roll"><h3>Loop</h3><span class="gtag" id="bStatus">PRESS PLAY, THEN PLAY THE PADS</span>
      <div class="btrans">
        <button class="gb" id="bPlay" title="Start or stop the loop (Space)">Play</button>
        <button class="gb brec" id="bRec" title="Record one full pass of the loop, starting at the next bar (or after a bar of count-in when stopped) (Enter). Each take is a new layer on top.">Record</button>
        <button class="gb" id="bUndo" title="Take off the last layer you recorded">Undo layer</button>
        <button class="gb" id="bClear" title="Clear every layer">Clear</button>
        <button class="gb bap" id="bAuto" title="The autopilot takes your recording as its theme and plays along: answers in your gaps, echoes, harmonies under long notes. It never plays over your notes.">Autopilot</button>
      </div>
      <canvas class="gv" id="bRoll" title="The loop: chords along the top, your notes in cyan, the autopilot's in pink, the playhead in yellow. Right-click a note to delete it."></canvas>
      <div class="gkey"><span><b>CYAN</b> your layers</span><span><b>PINK</b> the autopilot</span><span><b>HIGHER</b> higher pads</span><span><b>RED</b> recording</span><span><b>RIGHT-CLICK</b> a note to delete it</span></div>
    </section>
    <section class="gp b-keys"><h3>Magic keys</h3><span class="gtag" id="bChordTag"></span>
      <div class="bkeys" id="bKeys"></div>
      <div class="ghint2">Every pad is a note that fits the chord playing now; they retune when the chord changes. Keys Q W E R T Y U I O P [ ] play them too.</div>
    </section>
    <section class="gp b-shelf"><h3>Loop shelf</h3><span class="gtag">THIS CITY</span>
      <div class="bsave"><input id="bName" maxlength="40" placeholder="Name this loop" aria-label="Loop name"><button class="gb" id="bSave" title="Keep the loop on the shelf: pattern, voice, clock, layers and autopilot">Save</button></div>
      <div class="blist" id="bList"></div>
    </section>
  </div>
  <div class="gdlg" id="bDlg" hidden role="dialog" aria-modal="true" aria-labelledby="bDlgT">
    <div class="gdlgbox"><span class="gtag">BOOTH // NEW SONG</span>
      <h4 id="bDlgT">Wipe the loop deck?</h4>
      <p class="gdlgp">A new song starts the Booth on a clean deck. Takes you haven't put on the shelf will be lost. Loops already on the shelf are safe.</p>
      <button class="gb gdlgopt" id="bSongClear"><b>Wipe the deck and load</b><small>Clear the unsaved takes and pick the new song.</small></button>
      <button class="gb" id="bSongKeep">Keep my takes (save them first)</button>
    </div>
  </div>
  <div class="gdlg" id="mDlg" hidden role="dialog" aria-modal="true" aria-labelledby="mDlgT">
    <div class="gdlgbox"><span class="gtag">DOPAMINE PING // TRANSFORM</span>
      <h4 id="mDlgT">Give the pings a song's voice</h4>
      <p class="gdlgp">The held notes the Booth sampled from your songs become the pings' instrument, played in tune with whatever chords are on: the planners' patterns or a Booth loop.</p>
      <div class="glbl">Every ping from one song</div>
      <div class="mall"><select id="mAll" aria-label="The song for every ping"></select><button class="gb mg" id="mAllGo">Transform all</button></div>
      <div class="glbl">Or mix and match, ping by ping</div>
      <div class="mrows" id="mRows"></div>
      <p class="gdlgp mst" id="mSt"></p>
      <div class="mfoot"><button class="gb" id="mRestore" title="Every ping back to its usual voice">Restore the planners' voices</button><button class="gb" id="mDone">Done</button></div>
    </div>
  </div>
  <div class="gdlg" id="gDlg" hidden role="dialog" aria-modal="true" aria-labelledby="gDlgT">
    <div class="gdlgbox"><span class="gtag">BOOTH SHELF // TAPE</span>
      <h4 id="gDlgT">Putting <b id="gDlgName"></b> on the broadcast</h4>
      <button class="gb gdlgopt" id="gDlgLogged"><b>Broadcast as logged</b><small>Your notes go out exactly as you recorded them. With the Neuro-phrase on, the Grid answers you, the way it does in the Booth.</small></button>
      <button class="gb gdlgopt" id="gDlgRewire"><b>Rewire the signal</b><small>A working copy on the carrier chart: move, stretch, add or delete notes, and the Grid drifts it somewhere new. The shelf copy stays as it was.</small></button>
      <button class="gb" id="gDlgCancel">Return to Console</button>
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
    ['Sector 01 // Shift change dusk', 'Sector 02 // Archive hall murmur', 'Sector 03 // Billboard haze', 'Sector 04 // Rail yard static', 'Sector 05 // Night school hum', 'Sector 06 // Skyline lull', 'Sector 07 // Rooftop garden calm', 'Sector 08 // Vent chorus', 'Sector 09 // Greenhouse sunrise', 'Sector 10 // Stairwell light loop', 'Sector 11 // Full sector sweep']
      .forEach((t, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = t; prog.appendChild(o); });
    const sty = el.querySelector('#g-motifStyleSelect');
    [['MIXED', "Planners' choice"], ['TAPPED', 'Gutter cascade'], ['HAMMER', 'Rivet triplet'], ['BELLS', 'Lamp-post chimes'], ['DOUBLESTOP', 'Twin neon'], ['LEAD', 'Busker riff'], ['HOMEBOUND', 'Last train home']]
      .forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sty.appendChild(o); });
    // the track fill follows the handle
    const fill = r => { const lo = +r.min, hi = +r.max; r.style.setProperty('--p', (hi > lo ? (+r.value - lo)/(hi - lo)*100 : 0) + '%'); };
    el.addEventListener('input', e => { if (e.target.type === 'range') fill(e.target); }, true);
    el.querySelectorAll('input[type=range]').forEach(r => { fill(r); r.dataset.def = r.value; });
    const set = (r, v) => { const st = +r.step || 1, lo = +r.min, hi = +r.max; v = Math.min(hi, Math.max(lo, Math.round((v - lo)/st)*st + lo));
      if (+r.value === v) return; r.value = String(+v.toFixed(4)); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); };
    el.addEventListener('wheel', e => { const r = e.target.closest && e.target.closest('.gs, .gk') && e.target.closest('.gs, .gk').querySelector('input[type=range]'); if (!r) return;
      e.preventDefault(); const st = +r.step || 1, n = Math.max(1, Math.round((+r.max - +r.min)/st/50)); set(r, +r.value + (e.deltaY < 0 ? 1 : -1)*st*n*(e.shiftKey ? 4 : 1)); }, { passive: false });
    el.addEventListener('dblclick', e => { const r = e.target.closest && e.target.closest('.gs, .gk') && e.target.closest('.gs, .gk').querySelector('input[type=range]'); if (r && r.dataset.def !== undefined) set(r, +r.dataset.def); });
    if (typeof TOUCH !== 'undefined' && TOUCH.on) touchUI(el, set);
    return el;
  }

  // ---------- on a touch screen ----------
  // What each control does, in plain words, for the press-and-hold plate. The panel keeps the planners' names as the labels (Clock rate,
  // Smog, Resonance); this is the one place that says tempo, filter, reverb. Anything not listed falls back to its own title.
  const PLAIN = {
    'g-bpmSlider': 'Tempo, in beats a minute. Drag the dial up or down; double tap it to put it back.',
    'g-tapTempoBtn': 'Tap tempo: tap it in time and the tempo follows your taps.',
    'g-tempoLock': 'Keeps the tempo where you set it while the auto-governor moves everything else.',
    subdiv: 'The beat grid: how finely each beat is cut for the echoes and the melody (quarters, eighths, triplets, sixteenths).',
    'g-quantizeToggleBtn': 'Quantize: melody notes snap onto that beat grid.',
    'g-leadLoopBtn': 'A melody layer: an improvised lead line over the chords.',
    'g-autopilotBtn': 'Automation: the Grid changes its own tempo, rhythm and dials as the mood shifts.',
    'g-ambientBtn': 'Ambient mode: soft pads in place of the heavy drone.',
    'g-engageSwitch': 'Pause or resume the whole broadcast.',
    prog: 'A preset: a starting mix of layers and settings for the broadcast.',
    'g-warmthFilterSlider': 'A filter that cuts the highs: lower is darker and more muffled.',
    'g-spaceReverbSlider': 'Reverb: how big and echoing the space sounds.',
    'g-droneLevelSlider': 'Drone volume: the held chord under everything.',
    'g-subAnchorSlider': 'Sub bass: the low weight under the drone.',
    'g-chordHoldSlider': 'Chord length: how long each chord lasts before the next.',
    'mode-MOSAIC': 'A style for the granular texture layer.',
    'mode-HAZE': 'A style for the granular texture layer.',
    'mode-ARP': 'A style for the granular texture layer.',
    'g-granularMixSlider': 'Granular texture: how many tiny grains of sound.',
    'g-lofiTextureSlider': 'Lo-fi noise: hiss and crackle.',
    'g-progressionSelect': 'The chord progression the broadcast plays.',
    'g-freezeSwitch': 'Freeze: holds the sound playing now in a loop until you let it go.',
    'g-markovToggleBtn': 'Chord order: in sequence, or wandering to related chords.',
    'g-chordTimelineGrid': 'The chords of the progression: tap one to jump to it.',
    'g-motifSparsitySlider': 'How often the melody pings play.',
    'g-motifLevelSlider': 'Melody ping volume.',
    'g-manualMotifBtn': 'Play one melody ping now.',
    'g-manualBellBtn': 'Play a cluster of bell tones now.',
    'g-motifStyleSelect': 'The melody style the pings use.',
    'g-motifXform': "Give the pings the sound of one of your songs.",
    gAct: 'How many notes the loop and its answers play, from sparse to busy.',
    'g-boothChopSlider': "Volume of your song's samples and chops.",
    'g-boothPadSlider': 'Volume of the backing chords.',
    'g-boothBpmSlider': 'Tempo of the loop, in beats a minute.',
    'g-boothApSlider': 'How much the autopilot plays back to you.',
    'g-boothProg': 'The chords you play over: one chord a bar.',
    'sec-cast': 'Presets, layers, and a picture of everything playing.',
    'sec-clock': 'Tempo, rhythm and the melody pings.',
    'sec-carrier': 'The chords: which progression, how it moves, and the drone under it.',
    'sec-air': 'Reverb, filter and texture.',
    'tab-console': "The broadcast's controls.",
    'tab-booth': 'Play over a chord pattern, record loops and keep them. The city broadcast steps aside while you play.',
  };
  // which section of the console each block belongs to
  const SEC = { 'a-state': 'cast', 'a-prog': 'cast', 'a-clock': 'clock', 'a-ping': 'clock', 'a-chart': 'carrier', 'a-harm': 'carrier', 'a-atmos': 'air', 'a-disp': 'air' };
  const SEC_KEY = 'neonIsland.gridSection';
  function touchUI(el, set){
    const $e = s => el.querySelector(s), words = s => (typeof TOUCH !== 'undefined' && TOUCH.words) ? TOUCH.words(s) : s;
    // the sections: a tab each, the last one picked comes back next time
    el.querySelectorAll('.gmain > .gp').forEach(g => { for (const c in SEC) if (g.classList.contains(c)) g.dataset.sec = SEC[c]; });
    const pick = s => {
      el.querySelectorAll('.gsect').forEach(b => { const on = b.dataset.sec === s; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      el.querySelectorAll('.gmain > .gp').forEach(g => g.classList.toggle('sec-on', g.dataset.sec === s));
      $e('.gmain').scrollTop = 0; try { localStorage.setItem(SEC_KEY, s); } catch (e){}
      el.dispatchEvent(new Event('gpsection'));   // (grid.js sizes the trace canvases that just came into view)
    };
    let s0 = 'cast'; try { const v = localStorage.getItem(SEC_KEY); if (v && Object.values(SEC).includes(v)) s0 = v; } catch (e){}
    pick(s0);
    el.querySelectorAll('.gsect').forEach(b => b.addEventListener('click', () => pick(b.dataset.sec)));

    // the readout strip: the dial or bar under the finger, by name, with its value, shown up here where the thumb isn't
    const rd = $e('.gread'), rn = rd.querySelector('.grn'), rv = rd.querySelector('.grv'), rb = rd.querySelector('.grbar > i');
    const IDLE = 'Hold a control to see what it does';
    const rangeOf = t => { const k = t.closest && t.closest('.gk'); if (k) return k.querySelector('input[type=range]'); return t.matches && t.matches('input[type=range]') ? t : null; };
    const nameOf = r => { const k = r.closest('.gk'); if (k) return k.querySelector('span').textContent;
      return { gAct: 'Activity', gStripScroll: 'Along the loop' }[r.id] || r.getAttribute('aria-label') || ''; };
    const valOf = r => { const k = r.closest('.gk'), o = k && k.querySelector('output');
      if (o && o.textContent.trim()) return o.textContent.trim();
      if (r.id === 'g-bpmSlider') return r.value + ' cycles/min';
      if (r.id === 'gAct'){ const l = $e('#gActLbl'); return l && l.textContent.trim() ? l.textContent.trim() : Math.round(+r.value*100) + '%'; }
      if (r.id === 'gStripScroll') return 'Beat ' + (Math.floor(+r.value) + 1);
      return String(+(+r.value).toFixed(2)); };
    let idleT = 0, cur = null, shown = null, pre = '', raf = 0;
    const idle = () => { rd.classList.remove('live'); rn.textContent = IDLE; rv.textContent = ''; shown = null; };
    const paint = () => { const r = shown; if (!r) return; const n = (pre ? pre + ' · ' : '') + nameOf(r), v = valOf(r);
      if (rn.textContent !== n) rn.textContent = n; if (rv.textContent !== v) rv.textContent = v;
      const lo = +r.min, hi = +r.max; rb.style.width = (hi > lo ? (+r.value - lo)/(hi - lo)*100 : 0) + '%'; };
    // (the dials' own numbers are written by the engine or by the shapes' frame (grid_viz.js), a moment after the value moves: so while the
    //  strip is lit it reads them again every frame, and stops when it goes back to the hint)
    const loop = () => { raf = 0; if (!shown || !P.open) return; paint(); raf = requestAnimationFrame(loop); };
    const show = (r, p) => { if (!r) return; clearTimeout(idleT);
      // (sideways the strip has no row of its own: it lies over the sections bar, or the top row's foot in the Booth, while a finger is on a dial)
      const s = $e('.gsec'), under = s.getBoundingClientRect().height > 0 ? s : $e('.gtop'); rd.style.top = (under === s ? s.offsetTop : under.offsetTop + under.offsetHeight - 44) + 'px';
      rd.classList.add('live'); shown = r; pre = p || ''; paint(); if (!raf) raf = requestAnimationFrame(loop); };
    const later = () => { clearTimeout(idleT); idleT = setTimeout(idle, 1800); };
    idle();

    // press and hold: the explanation plate (and Reset, for a dial or a bar); a double tap on a dial resets it too
    const plate = document.createElement('div'); plate.className = 'gplate'; plate.hidden = true; plate.setAttribute('role', 'dialog');
    plate.innerHTML = '<b class="gpn"></b><p class="gpp"></p><p class="gpl"></p><div class="gpr"><button class="gb" data-a="reset">Reset</button><button class="gb" data-a="ok">Got it</button></div>';
    el.appendChild(plate);
    const SKIP = '.bkey, #bRoll, #gStripCv, input[type=text], input:not([type]), .gplate, .gdel, .gdlg';
    const CTRL = '.gk, button, select, input[type=range], .gchk, canvas, .gchip, .gpills';
    const keyOf = c => (rangeOf(c) || c).id || (c.classList.contains('subdiv-btn') ? 'subdiv' : c.classList.contains('micro-mode-btn') ? 'mode-' + c.dataset.mode : c.closest('.gprogs') ? 'prog'
      : c.classList.contains('gsect') ? 'sec-' + c.dataset.sec : c.classList.contains('gtab') ? 'tab-' + c.dataset.mode : '');
    const labelOf = c => {
      if (c.classList.contains('gk')) return c.querySelector('span').textContent;
      if (c.matches('canvas, .gpills')){ const h = c.closest('.gp') && c.closest('.gp').querySelector('h3'); return h ? h.textContent : ''; }
      if (c.matches('select')){ const l = c.previousElementSibling; return l && l.classList.contains('glbl') ? l.textContent : (c.closest('.gp') && c.closest('.gp').querySelector('h3') || {}).textContent || ''; }
      if (c.classList.contains('gchk')) return c.textContent;
      const t = c.cloneNode(true); t.querySelectorAll('small, .gled').forEach(n => n.remove()); return t.textContent.replace(/\s+/g, ' ').trim();
    };
    let pl = null;   // { c (the control), r (its range, if it has one) }
    const closePlate = () => { if (!pl) return; pl.c.classList.remove('gexp'); plate.hidden = true; pl = null; };
    function openPlate(c){
      closePlate();
      const k = keyOf(c), ttl = (c.closest('[title]') || {}).title || '', r = rangeOf(c);
      // the title, as the plate's second line: the planners' wording, with the mouse's how-to taken out
      const lore = words(ttl.replace(/\s*\([^)]*\b(drag|scroll|click|Space|Enter|Esc|Ctrl)\b[^)]*\)/gi, '')).trim();
      const plain = PLAIN[k] || '';
      if (!plain && !lore) return false;
      plate.querySelector('.gpn').textContent = labelOf(c) || 'Control';
      plate.querySelector('.gpp').textContent = plain || lore;
      plate.querySelector('.gpl').textContent = plain && lore !== plain ? lore : '';
      const canReset = !!(r && r.dataset.def !== undefined && !(r.classList.contains('gscroll') && !r.classList.contains('gact')));
      const rs = plate.querySelector('[data-a=reset]'); rs.hidden = !canReset;
      // (just under the readout strip, so the dial's value stays in view above it)
      const above = [rd, $e('.gsec'), $e('.gtop')].find(n => n.getBoundingClientRect().height > 0 && getComputedStyle(n).position !== 'absolute');
      plate.style.top = Math.round(above.getBoundingClientRect().bottom - el.getBoundingClientRect().top + 6) + 'px';
      pl = { c, r }; c.classList.add('gexp'); plate.hidden = false;
      if (r) show(r);
      return true;
    }
    plate.addEventListener('click', e => { const a = e.target.dataset && e.target.dataset.a; if (!a || !pl) return;
      if (a === 'reset' && pl.r){ set(pl.r, +pl.r.dataset.def); show(pl.r, 'Reset'); later(); }
      closePlate(); });
    let lp = null, swallow = 0, lastType = 'mouse', tap = null, lastTap = null;
    P.lp = false;   // (true once a hold has opened the plate: the dial under the finger stops following it, grid_viz.js)
    el.addEventListener('pointerdown', e => {
      lastType = e.pointerType; if (e.pointerType === 'mouse') return;
      P.lp = false;
      if (pl && !plate.contains(e.target)){ closePlate(); swallow = performance.now(); e.stopPropagation(); return; }   // (a tap away from the plate only closes it)
      const r = rangeOf(e.target); if (r){ cur = r; show(r); }
      const dial = e.target.closest('.gk');
      tap = dial ? { k: dial, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
      const c = e.target.closest(CTRL); if (!c || !el.contains(c) || e.target.closest(SKIP)) return;
      lp = { c, x: e.clientX, y: e.clientY, id: e.pointerId, timer: setTimeout(() => { const ok = openPlate(lp.c); lp = null;
        if (ok){ P.lp = true; swallow = performance.now(); if (navigator.vibrate) try { navigator.vibrate(12); } catch (e){} } }, 500) };
    }, true);
    el.addEventListener('pointermove', e => {
      if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10){ clearTimeout(lp.timer); lp = null; }
      if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null;
    }, true);
    const up = e => {
      if (lp && e.pointerId === lp.id){ clearTimeout(lp.timer); lp = null; }
      if (e.pointerType !== 'mouse' && cur){ cur = null; later(); }
      // a double tap on a dial: back to where it started (the canvas's own dblclick doesn't come reliably from a finger)
      if (e.type === 'pointerup' && tap && e.pointerId === tap.id && !P.lp && performance.now() - tap.t < 300){
        const now = performance.now();
        if (lastTap && lastTap.k === tap.k && now - lastTap.t < 350){ const r = rangeOf(tap.k); if (r && r.dataset.def !== undefined){ set(r, +r.dataset.def); show(r, 'Reset'); later(); } lastTap = null; }
        else lastTap = { k: tap.k, t: now };
      }
      tap = null;
    };
    el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true);
    // the click that ends a hold (or a tap that only closed the plate) does nothing else
    el.addEventListener('click', e => { if (swallow && performance.now() - swallow < 900){ e.preventDefault(); e.stopPropagation(); swallow = 0; } }, true);
    // no browser menu or text callout from a held finger (a right-click with a mouse still gets through to the Booth's notes)
    el.addEventListener('contextmenu', e => { if (lastType !== 'mouse'){ e.preventDefault(); e.stopPropagation(); } }, true);
    el.addEventListener('keydown', e => { if (pl && e.key === 'Escape'){ e.stopPropagation(); closePlate(); } }, true);
    P.closePlate = closePlate;
  }
  P.build = build; P.fill = r => { const lo = +r.min, hi = +r.max; r.style.setProperty('--p', (hi > lo ? (+r.value - lo)/(hi - lo)*100 : 0) + '%'); };
  return P;
})();
GRIDPANEL.build();
