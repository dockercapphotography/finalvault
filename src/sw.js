// FinalVault Service Worker
//
// injectManifest mode (vite-plugin-pwa) -- this file is the real source;
// the build step injects the precache manifest wherever
// self.__WB_MANIFEST appears below, then emits the built result as
// sw.js. Unlike the old generateSW setup, THIS file is what actually
// runs in both dev and production now -- there's no more divergence
// between what public/sw.js contained and what the generated build
// produced.
//
// The three runtime-caching rules below (shell precache is handled by
// precacheAndRoute; R2 preview images and the two font caches are
// registerRoute calls) are a direct translation of the workbox
// runtimeCaching config that used to live in vite.config.js under
// generateSW -- kept at exact parity with what was already live in
// production. No new caching behavior was added here.

import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Precache the app shell -- injected at build time by vite-plugin-pwa.
// This replaces the old hand-rolled SHELL_URLS install/fetch logic;
// precacheAndRoute already handles install-time caching and serving
// precached assets network-independently.
precacheAndRoute(self.__WB_MANIFEST)

// R2 preview images only -- NOT originals, downloads, watermarks, or
// zip files. Matches the old workbox.runtimeCaching urlPattern exactly.
registerRoute(
  ({ url }) => url.hostname.includes('workers.dev') && url.pathname.includes('/preview/'),
  new NetworkFirst({
    cacheName: 'r2-preview-cache',
    fetchOptions: { credentials: 'omit' },
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

self.skipWaiting()
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

// --- Push notifications (new in 1.5.3) ---
//
// Payload shape sent by the send-push Edge Function (added later in this
// branch): { title, body, url }. Deliberately minimal -- no icon/badge
// customization for v1, matching the "small, contained" spirit of the
// rest of this feature.
self.addEventListener('push', event => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch (err) {
    // Malformed or non-JSON payload -- don't let a bad push crash the
    // service worker or surface a blank notification.
    return
  }

  const title = payload.title || 'FinalVault'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Focuses an existing FinalVault tab if one's open (regardless of which
// page it's on), rather than always opening a new tab -- avoids piling
// up duplicate tabs every time a claim notification is tapped.
self.addEventListener('notificationclick', event => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
