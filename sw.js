const CACHE_NAME = 'Beerdex-v86'; // Increment to trigger update
const ASSETS = [
    './index.html',
    './style.css',
    './style-museum.css',
    './js/app.js',
    './js/ui.js',
    './js/storage.js',
    './js/achievements.js',
    './js/data.js',
    './js/analytics.js',
    './js/api.js',
    './js/autoRarity.js',
    './js/bac.js',
    './js/event-system.js',
    './js/feedback.js',
    './js/fx.js',
    './js/map.js',
    './js/match.js',
    './js/off-api.js',
    './js/scanner.js',
    './js/share.js',
    './js/wrapped.js',
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

// Fetch Event — Stale-While-Revalidate for JS, Cache-First for assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const isJS = url.pathname.endsWith('.js');
    const isAppFile = ASSETS.some(a => url.pathname.endsWith(a.replace('./', '')));

    if (isJS && isAppFile) {
        // Stale-While-Revalidate: serve cached immediately, update in background
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => cachedResponse);

                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then(networkResponse => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME)
                    .then(cache => {
                        if (event.request.url.includes('/images/') || event.request.url.endsWith('.json')) {
                            cache.put(event.request, responseToCache);
                        }
                    });

                return networkResponse;
            }).catch(() => {
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
