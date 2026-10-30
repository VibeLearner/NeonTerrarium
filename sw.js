// Neon Terrarium: the phone's own copy of the game's files (a service worker). Phones and tablets only: touch.js registers it, a computer never does.
// After the first visit the game's scripts and pictures come from the phone itself, so a returning player isn't waiting on the network.
//  - files with a version in their address (?v=...) never change, so the saved copy is used straight away.
//    When a file's version moves on, the old copy is dropped as the new one is saved.
//  - the pages themselves (m.html, index.html) are asked for fresh each time, so an update shows on the next visit; the saved copy is only for
//    when the network is down.
//  - anything else of the game's (no version in its address) is asked for fresh too, the saved copy only for when the network is down: a file
//    without a version could change with an update, and an old one next to new scripts could break something.
//  - the music (assets/audio), the save server and anything not the game's own (the 3D engine's site keeps its own long-lived copy) pass
//    straight through, never saved.
'use strict';
const CACHE = 'nt-files-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
const keyOf = u => u.origin + u.pathname;
async function put(req, res){
  if (!res || !res.ok || res.type === 'opaque') return;
  const c = await caches.open(CACHE), u = new URL(req.url);
  if (u.searchParams.has('v')) for (const r of await c.keys()){ const o = new URL(r.url); if (keyOf(o) === keyOf(u) && o.search !== u.search) c.delete(r); }
  await c.put(req, res);
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin) return;
  if ((u.pathname.includes('/assets/audio/') || u.searchParams.has('bench') || req.headers.has('range'))) return;
  // fresh first: the pages, and anything without a version
  if (req.mode === 'navigate' || !u.searchParams.has('v')){
    e.respondWith(fetch(req).then(res => { const cp = res.clone(); e.waitUntil(put(req, cp)); return res; }).catch(async () => (await caches.match(req)) || Response.error()));
    return;
  }
  // a version in the address: the saved copy if there is one
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const cp = res.clone(); e.waitUntil(put(req, cp)); return res; })));
});
