const CACHE_NAME = 'Beerdex-v94'; // Hardened Response logic
const ASSETS = [
    './index.html',
    './style.css',
    './style-museum.css',
    './js/app.js',
    './js/ui.js',
    './js/import-export.js',
    './js/storage.js',
    './js/achievements.js',
    './js/data.js',
    './js/env.js',
    './js/i18n.js',
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
    './js/vendor/lz-string.min.js',
    './js/vendor/qrcode.min.js',
    './js/vendor/html5-qrcode.min.js',
    './js/vendor/confetti.browser.min.js',
    './js/vendor/vanilla-tilt.min.js',
    './js/vendor/haptics-shim.js',
    './css/vendor/animate.min.css',
    './data/bac_rules.json',
    './event/events-config.json',
    './data/deutchbeer.json',
    './data/belgiumbeer.json',
    './data/frenchbeer.json',
    './data/nlbeer.json',
    './data/usbeer.json',
    './data/newbeer.json',
    './data/cobeer.json',
    './data/breweries.json',
    './data/locales/en.json',
    './data/locales/fr.json',
    './manifest.webmanifest',
    './icons/logo-bnr.png',
    './icons/192x192.png',
    './icons/512x512.png',
    './offline.html',
    './images/beer/FUT.jpg',
    './images/beer/default.png',
    './images/foam.png',
    './'
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
    const url = new URL(event.request.url);
    const isJS = url.pathname.endsWith('.js');
    const isCSS = url.pathname.endsWith('.css');
    const isJSON = url.pathname.endsWith('.json') || url.search.includes('.json');
    const isImage = url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i);
    const isAppFile = ASSETS.some(a => url.pathname.endsWith(a.replace('./', '')));
    const isRoot = url.pathname === '/' || url.pathname === '/index.html';
    const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

    // Strategy: Cache First, Fallback to Network, Fallback to Offline Page
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
            // 1. Serve from Cache if available
            if (cachedResponse) {
                return cachedResponse;
            }

            // 2. Special handling for Google Fonts (Cache on the fly)
            if (isGoogleFont) {
                return fetch(event.request).then(resp => {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return resp;
                }).catch(() => {
                    // Fail gracefully for fonts to avoid TypeError
                    return new Response('', { status: 404 });
                });
            }

            // 3. Fallback for Root to index.html
            if (isRoot) {
                return caches.match('./index.html').then(idx => {
                    return idx || fetch(event.request).catch(() => caches.match('./offline.html'));
                });
            }

            // 4. Fallback to Network
            return fetch(event.request).then(networkResponse => {
                // Cache valid responses on the fly for images and data we encounter
                if (networkResponse && networkResponse.status === 200 && (isImage || isJSON)) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                }
                return networkResponse;
            }).catch(err => {
                // 5. Final Fallback when truly offline
                if (event.request.mode === 'navigate' || isRoot) {
                    return caches.match('./offline.html').then(off => off || new Response('Offline', { status: 503 }));
                }
                
                // --- JSON Robustness ---
                if (isJSON) {
                    return new Response('{}', { 
                        status: 200, 
                        statusText: 'Offline Fallback',
                        headers: new Headers({ 'Content-Type': 'application/json' })
                    });
                }
                
                // Return a valid error response for other assets
                return new Response('Offline', { 
                    status: 503, 
                    statusText: 'Service Unavailable',
                    headers: new Headers({ 'Content-Type': 'text/plain' })
                });
            });
        }).catch(() => {
            // Ultimate fallback to prevent any 'Failed to convert value to Response'
            return new Response('Offline Error', { status: 503 });
        })
    );
});

// Listen for skipWaiting message
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
