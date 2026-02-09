const CACHE_NAME = 'gamehub-v2.1.0';
const DYNAMIC_CACHE_NAME = 'gamehub-dynamic-v1';

// Fichiers à mettre en cache immédiatement (TOUTES LES PAGES CORRECTES)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/accueil.html',
  '/jeux.html',  // CORRECTION ICI : games.html → jeux.html
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation en cours...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Mise en cache des assets statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Installation terminée');
        return self.skipWaiting();
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation en cours...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[Service Worker] Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activation terminée');
      return self.clients.claim();
    })
  );
});

// Stratégie: Cache First, Network Fallback
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et certaines extensions
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Pour les API, utiliser Network First
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }
  
  // Pour les assets, utiliser Cache First
  event.respondWith(cacheFirstStrategy(event.request));
});

// Stratégie Cache First
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Mettre en cache les nouvelles ressources (sauf les erreurs)
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback pour les pages
    if (request.headers.get('accept').includes('text/html')) {
      // Essayer de renvoyer accueil.html si disponible
      const fallback = await caches.match('/accueil.html') || await caches.match('/index.html');
      if (fallback) return fallback;
    }
    
    return new Response('Connectivité réseau perdue', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Stratégie Network First (pour les données dynamiques)
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Mettre à jour le cache
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    cache.put(request, networkResponse.clone());
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response(JSON.stringify({ error: 'Hors ligne' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Gestion des messages (pour mise à jour)
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});