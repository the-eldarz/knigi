/* Service Worker для «Книг»
   Кэширует оболочку приложения и pdf.js, чтобы всё работало офлайн.
   ПРИ ИЗМЕНЕНИИ index.html НУЖНО ПОДНИМАТЬ ВЕРСИЮ КЭША НИЖЕ! */

const CACHE = 'books-v3';   // ← поднимай при каждом обновлении

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return Promise.allSettled(ASSETS.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.startsWith('blob:') || req.url.startsWith('data:')) return;

  // ВАЖНО: index.html всегда пробуем с сети, кэш — только офлайн-фолбэк
  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML){
    event.respondWith(
      fetch(req).then((resp)=>{
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(()=>{});
        return resp;
      }).catch(()=> caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        const url = req.url;
        const isCacheable =
          resp && resp.status === 200 &&
          (url.includes('cdnjs.cloudflare.com') ||
           /\.(js|css|json|png|svg|woff2?|ttf)$/i.test(url));
        if (isCacheable) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});