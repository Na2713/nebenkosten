// Macht die App offline nutzbar. Mit Internet wird die neueste Version geladen,
// ohne Internet die zuletzt gespeicherte. Nutzerdaten laufen hier nicht durch.
const CACHE = 'nebenkosten-v1';
const WARTEZEIT_MS = 3000;
const DATEIEN = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/calc.js',
  './js/format.js',
  './js/model.js',
  './js/bericht.js',
  './js/export.js',
  './js/db.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './vendor/docx.iife.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function ausCache(anfrage) {
  const treffer = await caches.match(anfrage, { ignoreSearch: true });
  if (treffer) return treffer;
  if (anfrage.mode === 'navigate') return caches.match('./index.html');
  return undefined;
}

async function bearbeite(anfrage) {
  const netz = fetch(anfrage).then(async (antwort) => {
    if (antwort.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(anfrage, antwort.clone());
    }
    return antwort;
  });
  const zeitlimit = new Promise((resolve) => { setTimeout(() => resolve(null), WARTEZEIT_MS); });
  try {
    const antwort = await Promise.race([netz, zeitlimit]);
    if (antwort) return antwort;
  } catch { /* offline */ }
  const gespeichert = await ausCache(anfrage);
  return gespeichert || netz;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(bearbeite(e.request));
});
