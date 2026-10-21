const SHELL_CACHE = 'rotina-shell-v5'
const APP_SHELL = [
  '/painel',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/notification-badge.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('rotina-shell-') && key !== SHELL_CACHE)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return response
  const cache = await caches.open(SHELL_CACHE)
  await cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)
  const fresh = fetch(request)
    .then(response => cacheResponse(request, response))
    .catch(() => null)

  if (cached) {
    void fresh
    return cached
  }

  return (await fresh) || Response.error()
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  return cacheResponse(request, await fetch(request))
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate' && url.pathname === '/painel') {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
  }
})

self.addEventListener('push', event => {
  let payload = {}

  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Rotina da Loja Milionária'
  const options = {
    body: payload.body || 'Sua rotina de hoje já está disponível.',
    icon: payload.icon || '/pwa-icon-192.png',
    badge: payload.badge && payload.badge !== '/pwa-icon-192.png' ? payload.badge : '/notification-badge.png',
    tag: payload.tag || `notificacao-${Date.now()}`,
    renotify: true,
    timestamp: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
    data: {
      url: payload.url || '/painel',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  const targetUrl = new URL(event.notification.data?.url || '/painel', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const sameOriginClient = windowClients.find(client => new URL(client.url).origin === self.location.origin)

        if (sameOriginClient) {
          return sameOriginClient.navigate(targetUrl).then(client => client?.focus())
        }

        return self.clients.openWindow(targetUrl)
      }),
  )
})
