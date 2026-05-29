// sw.js — KMT Service Worker v7
const CACHE = 'kmt-v7';

// Auth-related pages must NEVER be cached — always serve fresh
const NEVER_CACHE = [
  '/login.html',
  '/register.html'
];

// Static assets safe to cache
const SHELL = [
  '/index.html',
  '/dashboard.html',
  '/admin.html',
  '/membership.html',
  '/dropin.html',
  '/style.css',
  '/app.js',
  '/config.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install — cache shell, skip waiting immediately
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(SHELL.map(url => cache.add(url)))
    )
  );
});

// Activate — take control, wipe ALL old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('SW: deleting old cache', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — never cache auth pages, network-first for all HTML
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always pass external requests straight through
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Auth pages: always go to network, never touch cache
  if (NEVER_CACHE.some(p => path === p || path.endsWith(p))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // All HTML navigation: network first, cache as fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then(r => r || caches.match('/index.html'))
        )
    );
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(event.request, res.clone()));
        }
        return res;
      });
    })
  );
});
