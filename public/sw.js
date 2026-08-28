const CACHE = 'showops-shell-v3';
const SHELL = ['./', './manifest.webmanifest', './favicon.svg', './og.png'];

async function cacheShell() {
  const cache = await caches.open(CACHE);
  const page = await fetch('./', { cache: 'reload' });
  if (!page.ok) throw new Error('Shell page unavailable');
  const html = await page.clone().text();
  const assets = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => new URL(match[1], self.location.href))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);
  await cache.put('./', page);
  await cache.addAll([...new Set([...SHELL.slice(1), ...assets])]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put('./', copy));
      return response;
    }).catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(event.request).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  }));
});
