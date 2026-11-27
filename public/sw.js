/* Service worker de Copiloto Financiero.
 * - Hace la app instalable y rápida: guarda la "cáscara" de la app y los
 *   archivos de /assets (tienen hash, nunca cambian).
 * - Nunca guarda respuestas de Supabase ni de otros orígenes: los datos
 *   financieros siempre se piden a la red.
 * - Recibe notificaciones push y abre la app en la pantalla indicada.
 */
const VERSION = "v1";
const SHELL_CACHE = `copiloto-shell-${VERSION}`;
const ASSET_CACHE = `copiloto-assets-${VERSION}`;
const SHELL = ["/", "/favicon.svg", "/logo.svg", "/manifest.webmanifest", "/brand/icon-192.png", "/brand/logo-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("copiloto-") && ![SHELL_CACHE, ASSET_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google, fuentes: siempre red.

  // Navegación: primero la red (siempre la versión más nueva); sin conexión, la cáscara guardada.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/", { cacheName: SHELL_CACHE })));
    return;
  }

  // Archivos con hash: de la caché si existen; si no, de la red y se guardan.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  // Íconos y manifest: respuesta inmediata desde caché y actualización en segundo plano.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; }).catch(() => cached);
      return cached || network;
    }));
  }
});

// ---- Notificaciones push (fase 2) ----
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || "Copiloto Financiero";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/brand/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    lang: "es",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      return existing.navigate(target).catch(() => undefined);
    }
    return self.clients.openWindow(target);
  })());
});
