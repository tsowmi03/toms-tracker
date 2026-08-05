const CACHE = 'tracker-shell-v2'
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/tracker-icon.svg',
  '/tracker-icon-192.png',
  '/tracker-icon-512.png',
]

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE)
  const response = await fetch('/index.html')
  const html = await response.clone().text()
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((match) => match[1])
  await cache.put('/index.html', response)
  await cache.addAll([...SHELL, ...assets])
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy))
      }
      return response
    })),
  )
})
