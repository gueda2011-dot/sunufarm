const CACHE_NAME = "sunufarm-v2"
const OFFLINE_URL = "/offline"
const APP_SHELL = [
  OFFLINE_URL,
  "/icon",
  "/apple-icon",
]

const OFFLINE_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#16a34a" />
    <title>SunuFarm hors ligne</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
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
        width: min(100%, 480px);
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
      h1 {
        margin: 18px 0 10px;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: #4b5563;
        line-height: 1.6;
        font-size: 15px;
      }
      .actions {
        margin-top: 24px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
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
      .ghost {
        background: #f3f4f6;
        color: #111827;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">Hors ligne</div>
      <h1>Connexion indisponible</h1>
      <p>
        SunuFarm ne detecte pas de reseau pour le moment. Vous pouvez reessayer,
        ou revenir aux donnees deja ouvertes sur cet appareil.
      </p>
      <div class="actions">
        <button class="button" onclick="window.location.reload()">Reessayer</button>
        <a class="button ghost" href="/dashboard">Retour au tableau de bord</a>
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(APP_SHELL.map((resource) => cache.add(resource)))
      await cache.put(OFFLINE_URL, createOfflineResponse())
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

async function cacheNetworkResponse(request, response) {
  if (!response || !response.ok || !request.url.startsWith(self.location.origin)) {
    return response
  }

  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
  return response
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return

  const requestUrl = new URL(event.request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin
  const isStaticAsset = isSameOrigin && (
    requestUrl.pathname.startsWith("/_next/static/") ||
    requestUrl.pathname === "/icon" ||
    requestUrl.pathname === "/apple-icon" ||
    requestUrl.pathname === "/manifest.webmanifest" ||
    requestUrl.pathname.startsWith("/icons/")
  )

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request)
        return await cacheNetworkResponse(event.request, networkResponse)
      } catch {
        const cachedPage = await caches.match(event.request)
        if (cachedPage) return cachedPage

        const offlinePage = await caches.match(OFFLINE_URL)
        if (offlinePage) return offlinePage

        return createOfflineResponse()
      }
    })())
    return
  }

  if (isStaticAsset) {
    event.respondWith((async () => {
      const cachedAsset = await caches.match(event.request)
      if (cachedAsset) return cachedAsset

      try {
        const networkResponse = await fetch(event.request)
        return await cacheNetworkResponse(event.request, networkResponse)
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
