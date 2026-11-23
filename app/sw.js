// Service worker aplikacji handlowca: sieć najpierw, przy braku sieci ostatnia zapisana kopia.
// Dzięki temu aplikacja otwiera się offline, a po aktualizacji zawsze pobiera nową wersję.
const CACHE = 'fieldcheck-app';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // kafelki mapy nie są zapisywane (za dużo danych)
  if (/tile\.openstreetmap|basemaps\.cartocdn|nominatim/.test(url.host)) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (res.ok || res.type === 'opaque') {
        const c = await caches.open(CACHE);
        c.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: url.pathname.endsWith('version.js') ? false : true });
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
