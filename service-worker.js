[file content begin]
const CACHE_NAME = 'gamehub-v3.0.0'; // Suppression du cache dynamique

const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',         // Page de fallback hors ligne
  './manifest.json',
  './icons/192.png',
  './icons/512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Supprimer tous les caches sauf le cache statique actuel
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Stratégie réseau uniquement pour les appels API (pas de cache)
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkOnlyStrategy(event.request));
    return;
  }
  
  // Pour toutes les autres requêtes : cache-first, sans mise en cache dynamique
  event.respondWith(cacheOnlyStrategy(event.request));
});

async function cacheOnlyStrategy(request) {
  const url = new URL(request.url);
  
  // --- GESTION SPÉCIALE PAGES HTML (hors index.html et offline.html) ---
  // Ces pages sont toujours servies depuis le réseau, jamais mises en cache.
  // En cas d'échec réseau, on sert la page offline.html (depuis le cache statique).
  if (url.pathname.endsWith('.html') && 
      !url.pathname.endsWith('/index.html') && 
      !url.pathname.endsWith('/offline.html') && 
      url.origin === self.location.origin) {
    try {
      return await fetch(request);
    } catch (error) {
      const offlinePage = await caches.match('./offline.html');
      if (offlinePage) return offlinePage;
      // Fallback ultime
      const indexPage = await caches.match('./index.html');
      if (indexPage) return indexPage;
      return new Response('Connectivité réseau perdue', { status: 408 });
    }
  }
  
  // --- STRATÉGIE CACHE-ONLY : on sert depuis le cache statique ---
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Si pas dans le cache, on tente le réseau mais on ne met PAS en cache
  try {
    return await fetch(request);
  } catch (error) {
    // Fallback pour les requêtes HTML (cas non couvert ci-dessus)
    if (request.headers.get('accept').includes('text/html')) {
      const offlinePage = await caches.match('./offline.html');
      if (offlinePage) return offlinePage;
      const indexPage = await caches.match('./index.html');
      if (indexPage) return indexPage;
    }
    
    return new Response('Connectivité réseau perdue', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function networkOnlyStrategy(request) {
  // Pour les API : réseau uniquement, aucun cache
  try {
    return await fetch(request);
  } catch (error) {
    // En cas d'absence de réseau, retourner une erreur JSON
    return new Response(JSON.stringify({ error: 'Hors ligne' }), {
      status: 408,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
[file content end]