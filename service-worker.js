const CACHE_NAME = 'findit-shell-v10';
const BASE_URL = self.registration.scope;
const APP_SHELL_PATHS = [
  './',
  './index.html',
  './styles.css?v=33',
  './app.js?v=15',
  './owner-portal.js?v=8',
  './shared-config.js?v=1',
  './shared-backend.js?v=2',
  './pwa.js?v=2',
  './manifest.webmanifest',
  './assets/findit-app-icon.svg',
  './vendor/qrcodejs/qrcode.min.js'
];
const APP_SHELL = APP_SHELL_PATHS.map(path => new URL(path, BASE_URL).toString());
const INDEX_URL = new URL('./index.html', BASE_URL).toString();

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith('findit-shell-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(INDEX_URL, copy));
        }
        return response;
      }).catch(async () => {
        return (await caches.match(request)) ||
          (await caches.match(INDEX_URL)) ||
          Response.error();
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error())
  );
});
