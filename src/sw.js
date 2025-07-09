const CACHE_NAME = 'neighborhood-board-cache-v1';

const APP_SHELL_FILES = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Install');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching app shell');
                return cache.addAll(APP_SHELL_FILES);
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activate');
    event.waitUntil(self.clients.claim());
    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ 
            type: 'SW_STATUS', 
            payload: '✅ Offline Ready' 
        }));
    });
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    console.log(`[Service Worker] Returning from cache: ${event.request.url}`);
                    return response;
                }
                console.log(`[Service Worker] Fetching from network: ${event.request.url}`);
                return fetch(event.request);
            })
    );
});
