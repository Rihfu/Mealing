/*
 * Service worker Mealing — socle PWA (Phase 1).
 * Objectif : l'app s'OUVRE hors-ligne (app-shell + dernière page vue en cache).
 * Stratégies :
 *   - assets statiques (/_next/static, polices, images, icônes) → cache-first ;
 *   - navigations (documents HTML) → network-first, repli cache puis /offline ;
 *   - autres origines (Supabase, USDA, OFF, Groq) et requêtes non-GET → réseau direct
 *     (JAMAIS mises en cache ici ; les données hors-ligne passeront par IndexedDB en Phase 2).
 */
const VERSION = 'mealing-v4';
const PRECACHE = `${VERSION}-precache`;
const RUNTIME = `${VERSION}-runtime`;
const APP_SHELL = ['/offline', '/logo.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      // allSettled (PAS addAll, atomique) : une icône qui échoue ne doit pas empêcher
      // /offline d'être pré-caché — c'est lui le filet des navigations sans réseau.
      .then((cache) => Promise.allSettled(APP_SHELL.map((u) => cache.add(u))))
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
      (async () => {
        try {
          const cache = await caches.open(RUNTIME);
          const cached = await cache.match(req);
          if (cached) return cached;
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          // Sous-ressource injoignable : échec propre (le document, lui, reste rendu).
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Navigations (documents) : network-first → permet l'ouverture hors-ligne.
  // GARANTIE : cette branche renvoie TOUJOURS une réponse. Un respondWith qui rejette
  // (ex-Response.error() final) = page d'erreur GÉNÉRIQUE du navigateur au premier
  // chargement (réseau pas encore prêt : VPN, réveil, cold start) — constaté en prod.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Ne mettre en cache que les réponses SAINES : un 500/502 de cold start
          // mis en cache serait resservi plus tard comme « dernière page vue ».
          if (res.ok) {
            const cache = await caches.open(RUNTIME);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          try {
            const cache = await caches.open(RUNTIME);
            const cached = await cache.match(req);
            if (cached) return cached;
            const offline = await caches.match('/offline');
            if (offline) return offline;
          } catch {
            /* caches inaccessibles → page de secours intégrée ci-dessous */
          }
          return offlineFallbackResponse();
        }
      })(),
    );
  }
  // Le reste (fetch RSC/data même origine) : réseau direct (auth/données → Phase 2).
});

/**
 * Page de secours INTÉGRÉE au service worker (aucune dépendance au cache) : dernier
 * filet quand réseau ET caches font défaut. Reprend la DA (papier/sauge) et propose
 * de réessayer — à la place de la page d'erreur générique du navigateur.
 */
function offlineFallbackResponse() {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mealing — connexion impossible</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#faf6ef;color:#33322e;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center}
  main{max-width:22rem;padding:2rem}
  h1{font-size:1.35rem;margin:0 0 .5rem}
  p{font-size:.92rem;line-height:1.5;color:#6f6a5f;margin:0 0 1.25rem}
  button{background:#3f6f4f;color:#fff;border:0;border-radius:9999px;padding:.7rem 1.6rem;
    font-size:.95rem;font-weight:600;cursor:pointer}
</style></head><body><main>
<h1>Connexion impossible</h1>
<p>Le réseau n’a pas répondu — ça arrive à la première ouverture, le temps que la
connexion s’établisse (VPN, sortie de veille…). Réessaie dans un instant.</p>
<button onclick="location.reload()">Réessayer</button>
</main></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

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
