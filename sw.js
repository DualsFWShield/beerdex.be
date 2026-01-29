const CACHE_NAME = 'Beerdex-v80'; // Increment to trigger update
const ASSETS = [
    './index.html',
    './style.css',
    './js/app.js',
    './js/ui.js',
    './js/storage.js',
    './js/achievements.js',
    './js/data.js',
    './data/deutchbeer.json',
    './data/belgiumbeer.json',
    './data/frenchbeer.json',
    './data/nlbeer.json',
    './data/usbeer.json',
    './manifest.webmanifest',
    './images/beer/FUT.jpg',
    './images/beer/default.png',
    './icons/logo-bnr.png',
    './icons/192x192.png',
    './icons/512x512.png',
    './offline.html',
    './images/foam.png'
];

// Install Event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching App Shell');
                return cache.addAll(ASSETS);
            })
    );
});

// Activate Event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.map(key => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Clearing Old Cache');
                    return caches.delete(key);
                }
            }));
        })
    );
});

// Fetch Event
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
            // Cache Hit - Return response
            if (cachedResponse) {
                return cachedResponse;
            }

            // Network Request
            return fetch(event.request).then(networkResponse => {
                // Check if valid reference
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // Clone response for cache
                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME)
                    .then(cache => {
                        // Only cache images and data files dynamically
                        if (event.request.url.includes('/images/') || event.request.url.endsWith('.json')) {
                            cache.put(event.request, responseToCache);
                        }
                    });

                return networkResponse;
            }).catch(() => {
                // If offline and request is for a page, return offline.html
                if (event.request.mode === 'navigate') {
                    return caches.match('./offline.html');
                }
            });
        })
    );
});

// Listen for skipWaiting message
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
