// The demo recorder's ears (tools/demo/record.py injects this in the audio pass, where the clip plays in real time). Everything the game
// sends to the speakers (the Grid and the Booth, the build sounds) is also sent to a recorder per audio context, started when the clip
// starts (demo.js calls window.__dmGo); window.__dmStop() hands back each recording and when it started.
(() => {
  if (window !== window.top) return;
  window.__DM_AUDIO = true;
  const taps = new Map(), recs = [], connect = AudioNode.prototype.connect;
  let t0 = null;
  function startRec(m){
    const parts = [], r = new MediaRecorder(m.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 320000 });
    r.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    r.start(250); recs.push({ r, parts, at: performance.now() - t0 });
  }
  AudioNode.prototype.connect = function (dest, ...a){
    const out = connect.call(this, dest, ...a);
    try {
      if (typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode){
        const ctx = dest.context; let m = taps.get(ctx);
        if (!m){ m = ctx.createMediaStreamDestination(); taps.set(ctx, m); if (t0 !== null) startRec(m); }
        connect.call(this, m);
      }
    } catch (e) {}
    return out;
  };
  window.__dmGo = () => {
    t0 = performance.now();
    for (const [ctx, m] of taps){ try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {} startRec(m); }
  };
  window.__dmStop = async () => {
    const read = b => new Promise(res => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1] || ''); f.readAsDataURL(b); });
    const out = [];
    for (const x of recs){
      await new Promise(res => { x.r.onstop = res; try { x.r.stop(); } catch (e) { res(); } });
      out.push({ at: x.at, data: await read(new Blob(x.parts, { type: 'audio/webm' })) });
    }
    return out;
  };
})();
