/*
 * Service worker Mealing — socle PWA (Phase 1).
 * Objectif : l'app s'OUVRE hors-ligne (app-shell + dernière page vue en cache).
 * Stratégies :
 *   - assets statiques (/_next/static, polices, images, icônes) → cache-first ;
 *   - navigations (documents HTML) → network-first, repli cache puis /offline ;
 *   - autres origines (Supabase, USDA, OFF, Groq) et requêtes non-GET → réseau direct
 *     (JAMAIS mises en cache ici ; les données hors-ligne passeront par IndexedDB en Phase 2).
 */
const VERSION = 'mealing-v3';
const PRECACHE = `${VERSION}-precache`;
const RUNTIME = `${VERSION}-runtime`;
const APP_SHELL = ['/offline', '/logo.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static') ||
    /\.(?:css|js|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations (server actions POST) : réseau direct

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase/USDA/OFF/Groq : réseau direct

  // Assets statiques : cache-first (immuables, versionnés par Next).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations (documents) : network-first → permet l'ouverture hors-ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(RUNTIME);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(RUNTIME);
          const cached = await cache.match(req);
          if (cached) return cached;
          return (await caches.match('/offline')) || Response.error();
        }
      })(),
    );
  }
  // Le reste (fetch RSC/data même origine) : réseau direct (auth/données → Phase 2).
});

/* --------------------------- Notifications push (Phase B) --------------------------- */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Mealing';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'mealing-expiry',
    renotify: true,
    data: { url: data.url || '/stock' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/stock';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
