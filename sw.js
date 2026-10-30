/* Service Worker: Offline-Zwischenspeicher fuer die App-Dateien und die Daten.
   Daten und Seiten: erst Netz (mit kurzer Wartezeit), sonst gespeicherte Kopie.
   Versionierte Dateien (css/js mit ?v=N) und Symbole: aus dem Speicher, bei Bedarf nachgeladen. */
const CACHE = 'kinews-v6';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png?v=4', 'icons/icon.svg?v=4', 'icons/apple-touch-icon.png?v=4', 'js/vendor/fuse.min.js', 'content/glossar.json', 'content/modelle.json', 'data/recent.json'];
const NET_TIMEOUT = 8000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const add = (u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {});
    await Promise.all(CORE.map(add));
    try {
      // css und js mit der aktuellen Versionsnummer aus index.html
      const html = await (await fetch('index.html', { cache: 'reload' })).text();
      const assets = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.all(assets.map(add));
      // neuester Tag, damit das Briefing auch ohne Netz laeuft
      const idx = await (await fetch('data/recent.json', { cache: 'reload' })).json();
      const d = idx.items && idx.items[0] && idx.items[0].date;
      if (d) await add(`data/${d.slice(0, 4)}/${d.slice(5, 7)}/${d}.json`);
    } catch (e) { /* offline beim Installieren, wird beim ersten Besuch nachgeholt */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const stored = () => cache.match(request, { ignoreSearch: request.mode === 'navigate' }) || cache.match('index.html');
  // immer beim Server nachfragen (GitHub Pages erlaubt sonst bis zu 10 Minuten alte Kopien im Browser-Cache)
  const live = fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  });
  try {
    return await Promise.race([live, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NET_TIMEOUT))]);
  } catch (e) {
    const hit = await stored();
    if (hit) return hit;
    return live; // keine Kopie vorhanden: auf das Netz warten
  }
}

/* recent.json (Startdaten): sofort aus dem Speicher, im Hintergrund frisch holen; ist es neuer, bekommen die offenen Fenster Bescheid */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const live = fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })).then(async (res) => {
    if (res && res.ok) {
      let changed = !hit;
      if (hit) {
        try { const [a, b] = await Promise.all([hit.clone().json(), res.clone().json()]); changed = a.updated !== b.updated; } catch (e) { changed = true; }
      }
      await cache.put(request, res.clone());
      if (hit && changed) (await self.clients.matchAll()).forEach((c) => c.postMessage({ type: 'data-updated' }));
    }
    return res;
  });
  if (hit) { live.catch(() => {}); return hit; }
  return live;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  const dynamic = req.mode === 'navigate' || path.endsWith('.json') || path.endsWith('.webmanifest') || path.endsWith('/') || path.endsWith('index.html');
  if (path.endsWith('/data/recent.json')) { event.respondWith(staleWhileRevalidate(req)); return; }
  event.respondWith(dynamic ? networkFirst(req) : cacheFirst(req));
});
