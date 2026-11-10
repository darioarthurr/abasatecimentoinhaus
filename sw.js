/* Grupo GPS - Service Worker | PWA 1.0.2 */
const CACHE_NAME = 'gps-abastecimento-v1.0.2';
const APP_SHELL = [
  './index.html',
  './styles.css',
  './config.js',
  './app.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(async path => {
    const url = new URL(path, self.registration.scope);
    const request = new Request(url.toString(), { cache: 'reload' });
    const response = await fetch(request);
    if (!response || !response.ok) throw new Error(`Falha ao armazenar ${path} no cache do aplicativo.`);
    await cache.put(url.toString(), response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await cacheAppShell();
    // Na primeira instalação não há versão anterior controlando a página.
    // Em atualizações, aguardamos o usuário tocar em "Atualizar agora".
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GPS_SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('gps-abastecimento-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        }
        return response;
      })
      .catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
