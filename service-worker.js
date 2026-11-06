const CACHE_NAME = 'findit-shell-v8';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css?v=32',
  '/app.js?v=14',
  '/owner-portal.js?v=7',
  '/shared-config.js?v=1',
  '/shared-backend.js?v=2',
  '/pwa.js?v=1',
  '/manifest.webmanifest',
  '/assets/findit-app-icon.svg',
  '/vendor/qrcodejs/qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('findit-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('/index.html'))));
    return;
  }

  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});
