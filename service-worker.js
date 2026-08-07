const CACHE_VERSION = '2026.1.0';
const CACHE_NAME = `geniusmw-${CACHE_VERSION}`;
const CACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/style.css?v=2026.1.0',
    '/js/app.js?v=2026.1.0',
    '/js/advertising.js?v=2026.1.0',
    '/js/pwa-install.js?v=2026.1.0',
    '/js/version-check.js?v=2026.1.0',
    '/assets/Icon.png?v=2026.1.0',
    '/assets/Logo.png?v=2026.1.0'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
                return null;
            })
        ))
    );
    self.clients.claim();
});

function isNavigationRequest(request) {
    return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);
    const isVersionFile = requestUrl.pathname === '/version.json';
    const isServiceWorker = requestUrl.pathname.endsWith('/service-worker.js');

    if (isNavigationRequest(event.request) || isVersionFile || isServiceWorker) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                return cached;
            }
            return fetch(event.request)
                .then((response) => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    return response;
                })
                .catch(() => caches.match('/index.html'));
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
