// sw.js — KMT Service Worker v11
const CACHE = 'kmt-v12';

// Auth-related pages must NEVER be cached — always serve fresh
const NEVER_CACHE = [
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/app2.js',
  '/app.js',
  '/config.js'
];

// Static assets safe to cache
const SHELL = [
  '/index.html',
  '/style.css',
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
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(event.request, clone));
          }
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

// ── Push Notifications ────────────────────────────────────

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kommetjie Muay Thai', {
      body:  data.body  || '',
      icon:  data.icon  || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-96.png',
      data:  { url: data.url || '/dashboard.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});