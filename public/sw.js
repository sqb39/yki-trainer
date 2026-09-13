const CACHE_NAME = 'yki-trainer-v3'

const BASE_PATH = (() => {
  const match = self.location.pathname.match(/^(.*)\/sw\.js$/)
  return match ? match[1] : ''
})()

function asset(path) {
  return `${BASE_PATH}${path}`
}

const SHELL = [
  asset('/'),
  asset('/index.html'),
  asset('/manifest.webmanifest'),
  asset('/icon.svg'),
  asset('/icon-192.png'),
  asset('/icon-512.png'),
  asset('/apple-touch-icon.png'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL).catch(() => undefined)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached ?? caches.match(asset('/index.html'))),
      ),
  )
})
