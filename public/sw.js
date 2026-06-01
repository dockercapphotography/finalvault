// FinalVault Service Worker
// Minimal shell — satisfies PWA installability criteria.
// Network-first strategy: always tries the network, falls back to cache for the app shell only.

const CACHE_NAME = 'finalvault-shell-v1'
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Network-first for API/Supabase/R2 — never cache these
  if (
    url.pathname.startsWith('/functions/') ||
    url.pathname.startsWith('/rest/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('workers.dev')
  ) return

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful shell responses
        if (response.ok && SHELL_URLS.includes(url.pathname)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
  )
})
