const CACHE_NAME = "sunufarm-app-shell-v5"
const OFFLINE_URL = "/offline"
const OFFLINE_FALLBACK_URL = "/offline?fallback=1"
const CRITICAL_ROUTES = [
  "/dashboard",
  "/daily",
  "/health",
  "/stock",
  "/sales/new",
  "/finances",
  "/eggs",
  "/purchases",
  "/batches",
  "/sales",
  OFFLINE_URL,
  OFFLINE_FALLBACK_URL,
]
const APP_SHELL = [
  "/",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/branding/icon-android-192.png",
  "/branding/icon-flat-square-192.png",
]

const OFFLINE_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#16a34a" />
    <title>SunuFarm hors ligne</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, rgba(34, 197, 94, 0.16), transparent 36%),
          linear-gradient(180deg, #f7fbf7 0%, #eef8f0 100%);
        font-family: Arial, sans-serif;
        color: #111827;
      }
      .card {
        width: min(100%, 560px);
        border-radius: 28px;
        border: 1px solid #d1fae5;
        background: #ffffff;
        padding: 32px 24px;
        box-shadow: 0 18px 50px rgba(17, 24, 39, 0.08);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: #dcfce7;
        color: #166534;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 8px 12px;
      }
      h1 { margin: 18px 0 10px; font-size: 28px; line-height: 1.2; }
      p { margin: 0; color: #4b5563; line-height: 1.6; font-size: 15px; }
      .actions { margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
      .button {
        appearance: none;
        border: 0;
        border-radius: 14px;
        background: #16a34a;
        color: white;
        padding: 14px 18px;
        font-size: 14px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }
      .ghost { background: #f3f4f6; color: #111827; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">Hors ligne</div>
      <h1>Connexion indisponible</h1>
      <p>
        SunuFarm ne detecte pas de reseau. Le shell des pages critiques reste disponible,
        ainsi que les donnees deja mises en cache sur cet appareil.
      </p>
      <div class="actions">
        <button class="button" onclick="window.location.reload()">Reessayer</button>
        <a class="button ghost" href="/offline">Ouvrir le hub offline</a>
      </div>
    </main>
  </body>
</html>`

function createOfflineResponse() {
  return new Response(OFFLINE_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

async function cacheNetworkResponse(request, response) {
  if (!response || !response.ok || !request.url.startsWith(self.location.origin)) {
    return response
  }

  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
  return response
}

async function precacheCriticalRoutes(cache) {
  await Promise.allSettled(
    [...APP_SHELL, ...CRITICAL_ROUTES].map((resource) => cache.add(resource)),
  )
  await cache.put(OFFLINE_URL, createOfflineResponse())
  await cache.put(OFFLINE_FALLBACK_URL, createOfflineResponse())
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => precacheCriticalRoutes(cache)),
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

function isStaticAsset(requestUrl) {
  return (
    requestUrl.pathname.startsWith("/_next/static/") ||
    requestUrl.pathname === "/icon" ||
    requestUrl.pathname === "/apple-icon" ||
    requestUrl.pathname === "/manifest.webmanifest" ||
    requestUrl.pathname.startsWith("/icons/") ||
    requestUrl.pathname.startsWith("/branding/")
  )
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return

  const requestUrl = new URL(event.request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin

  if (!isSameOrigin) return

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cachedPage = await cache.match(event.request) || await cache.match(requestUrl.pathname)

      const networkUpdate = fetch(event.request)
        .then((response) => cacheNetworkResponse(event.request, response))
        .catch(() => null)

      const networkResponse = await networkUpdate
      if (networkResponse) {
        return networkResponse
      }

      if (cachedPage) {
        return cachedPage
      }

      const fallback = await cache.match(OFFLINE_FALLBACK_URL) || await cache.match(OFFLINE_URL)
      return fallback || createOfflineResponse()
    })())
    return
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cachedAsset = await cache.match(event.request)
      if (cachedAsset) {
        event.waitUntil(
          fetch(event.request)
            .then((response) => cacheNetworkResponse(event.request, response))
            .catch(() => null),
        )
        return cachedAsset
      }

      try {
        const networkResponse = await fetch(event.request)
        return await cacheNetworkResponse(event.request, networkResponse)
      } catch {
        return Response.error()
      }
    })())
    return
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      try {
        return await fetch(event.request)
      } catch {
        return Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(event.request)
      return await cacheNetworkResponse(event.request, networkResponse)
    } catch {
      const cached = await caches.match(event.request)
      if (cached) return cached
      return Response.error()
    }
  })())
})

function buildPushNotification(payload) {
  const notification = payload?.notification ?? {}
  const data = payload?.data ?? {}
  const title = notification.title || data.title || "SunuFarm"
  const body = notification.body || data.body || "Nouvelle alerte terrain."
  const link = data.link || payload?.fcmOptions?.link || "/dashboard"

  return {
    title,
    options: {
      body,
      icon: "/branding/icon-android-192.png",
      badge: "/branding/icon-flat-square-192.png",
      data: {
        ...data,
        link,
      },
      tag: data.notificationId || data.resourceId || "sunufarm-alert",
      renotify: true,
    },
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  const notification = buildPushNotification(payload)

  event.waitUntil(
    self.registration.showNotification(notification.title, notification.options),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const link = event.notification.data?.link || "/dashboard"

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    })

    for (const client of allClients) {
      if ("focus" in client) {
        const clientUrl = new URL(client.url)
        const targetUrl = new URL(link, self.location.origin)

        if (clientUrl.origin === targetUrl.origin) {
          if ("navigate" in client) {
            await client.navigate(targetUrl.toString())
          }
          await client.focus()
          return
        }
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(link)
    }
  })())
})
