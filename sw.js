// SVUA Fin: работает без интернета. Свои файлы — сначала из сети (быстрые обновления), без сети — из кеша.
const SHELL = "svuafin-v2";
const FILES = ["./", "index.html", "style.css?v=2", "app.js?v=2", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.open(SHELL).then(async c => {
    try { const r = await fetch(e.request, { cache: "no-cache" }); if (r.ok) c.put(e.request, r.clone()); return r; }
    catch { return (await c.match(e.request)) || (await c.match("./")); }
  }));
});
