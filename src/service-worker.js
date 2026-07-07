// ── TripNow Service Worker — PWA Offline Support ──────────────────────────────
// Strategia di caching:
//   • Cache First  → asset statici (CSS, JS, immagini)
//   • Network First → chiamate API, dati real-time
//   • Navigate     → Network First con fallback offline.html
//
// Lifecycle: install → activate → fetch
// Questo file è discusso nel capitolo "Architetture Web Moderne" della tesi.

const CACHE_NAME   = 'tripnow-v5';
const GLB_CACHE    = 'tripnow-3d-v1';    // Cache separata per modelli .glb (pesanti)
const OFFLINE_URL  = '/src/html/offline.html';

// Asset critici pre-caricati al primo avvio (evento install)
const STATIC_ASSETS = [
    '/src/html/offline.html',
    '/src/html/homepage.html',
    '/src/html/destinazioni.html',
    '/src/html/Roma.html',
    '/src/html/Parigi.html',
    '/src/html/Istanbul.html',
    '/src/html/Il_Cairo.html',
    '/src/html/New_York.html',
    '/src/html/San_Francisco.html',
    '/src/html/rio_de_janeiro.html',
    '/src/html/Petra.html',
    '/src/html/Cuzco.html',
    '/src/css/homepage/general_styles.css',
    '/src/css/homepage/header.css',
    '/src/css/homepage/loading_screen.css',
    '/src/css/homepage/hero_searchbar.css',
    '/src/css/homepage/footer.css',
    '/src/css/homepage/extras.css',
    '/src/js/common.js',
    '/src/js/config.js',
    '/src/js/extras.js',
    '/media/foto/logo.png',
];

// ── INSTALL: pre-cache degli asset statici critici ────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // addAll() è atomico: se un asset fallisce, l'intera installazione fallisce
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Alcuni asset non caricati in cache:', err);
            });
        })
    );
    // skipWaiting() attiva immediatamente il nuovo SW senza aspettare
    // che le vecchie tab vengano chiuse
    self.skipWaiting();
});

// ── ACTIVATE: pulizia delle cache obsolete ────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== GLB_CACHE)
                    .map((name) => {
                        console.log('[SW] Rimozione cache obsoleta:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // clients.claim() permette al SW appena attivato di controllare
    // immediatamente le tab aperte senza bisogno di refresh
    self.clients.claim();
});

// ── FETCH: intercetta tutte le richieste di rete ──────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 0. Modelli 3D .glb → Cache First dedicata (GLB_CACHE)
    //    I .glb non cambiano frequentemente; la cache separata permette
    //    di svuotarla indipendentemente dal resto senza invalidare gli asset HTML/CSS.
    //    NON sono in addAll() per non bloccare l'installazione del SW.
    if (url.pathname.endsWith('.glb') || url.pathname.includes('/media/3d/')) {
        event.respondWith(glbCacheFirst(request));
        return;
    }

    // 1. Richieste al backend Express (porta 8080) → Network First
    //    I dati API sono real-time: meteo, auth, preferiti
    if (url.port === '8080' || url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 2. Risorse cross-origin (CDN: FontAwesome, Google Fonts) → Network First
    //    con fallback cache se offline
    if (url.origin !== self.location.origin) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 3. Navigazione HTML → Network First con fallback offline.html
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // 4. Asset statici (CSS, JS, immagini, font locali) → Cache First
    //    Il browser riceve la risposta dalla cache istantaneamente,
    //    poi aggiorna la cache in background per la prossima visita
    event.respondWith(cacheFirst(request));
});

// ── STRATEGIE DI CACHING ──────────────────────────────────────────────────────

/**
 * Cache First: serve dalla cache, scarica dalla rete solo se assente.
 * Ideale per asset statici che cambiano raramente (CSS, JS, immagini).
 * Complessità: O(1) per cache hit, O(network) per cache miss.
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok && response.status < 400) {
            const cache = await caches.open(CACHE_NAME);
            // clone() perché Response è uno stream a lettura singola
            cache.put(request, response.clone());
        }
        return response;
    } catch (_) {
        return new Response('Risorsa non disponibile offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

/**
 * GLB Cache First: serve dalla cache dedicata GLB_CACHE, scarica on-demand.
 * I modelli .glb vengono caricati solo alla prima visita della pagina destinazione.
 * Secondo accesso: istantaneo da cache (utile per demo offline in presentazione tesi).
 * Cache separata da CACHE_NAME per evitare di saturare il cache generale con file grandi.
 */
async function glbCacheFirst(request) {
    const cache  = await caches.open(GLB_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (_) {
        return new Response('', { status: 503 });
    }
}

/**
 * Network First: tenta sempre la rete, usa la cache come fallback.
 * Ideale per API e dati dinamici che devono essere aggiornati.
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (request.method === 'GET' && response.ok && response.status < 400) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (_) {
        const cached = await caches.match(request);
        return cached || new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
