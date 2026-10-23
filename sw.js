// Construye la base relativa al scope del SW — funciona en user-pages y project-pages de GitHub Pages
const BASE = new URL('./', self.location.href).href;

const CACHE_VERSION = 'gym-v9';

const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.webmanifest',
  BASE + 'css/main.css',
  BASE + 'src/app.js',
  BASE + 'src/db.js',
  BASE + 'src/seed.js',
  BASE + 'src/calc.js',
  BASE + 'src/charts.js',
  BASE + 'src/io.js',
  BASE + 'src/views/setup.js',
  BASE + 'src/views/rutina.js',
  BASE + 'src/views/ejercicios.js',
  BASE + 'src/views/registrar.js',
  BASE + 'src/views/progreso.js',
  BASE + 'src/views/config.js',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Para navegaciones, intentar red primero y caer en index.html cacheado
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(BASE + 'index.html').then((cached) => cached || fetch(e.request))
    );
    return;
  }
  // Para assets: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      // Guardar en caché si es de nuestro origen
      if (res.ok && e.request.url.startsWith(BASE)) {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
