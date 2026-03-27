const CACHE_NAME = "sunufarm-v1"
const APP_SHELL = [
  "/offline",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(APP_SHELL.map((resource) => cache.add(resource)))
    }),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(event.request)

      if (
        networkResponse.ok &&
        event.request.url.startsWith(self.location.origin)
      ) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(event.request, networkResponse.clone())
      }

      return networkResponse
    } catch {
      const cached = await caches.match(event.request)
      if (cached) return cached

      if (event.request.mode === "navigate") {
        const offlinePage = await caches.match("/offline")
        if (offlinePage) return offlinePage
      }

      return Response.error()
    }
  })())
})
