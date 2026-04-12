/**
 * SunuFarm — Middleware global d'authentification
 *
 * Rôle : filet de sécurité centralisé. Toutes les routes non listées dans PUBLIC_PATHS
 * exigent une session valide. Les Server Actions et les routes API qui font leur propre
 * vérification (requireSession, auth()) continuent de le faire — ce middleware est une
 * deuxième ligne de défense, pas un remplacement.
 *
 * Routes publiques déclarées explicitement :
 *   - /login, /register, /forgot-password, /reset-password, /verify-email : pages d'auth
 *   - /api/auth/**               : handlers NextAuth (signin, callback, signout, session)
 *   - /api/payments/webhooks/**  : webhooks entrants (Wave, Orange Money) — protégés par HMAC
 *   - /api/cron/**               : jobs Vercel — protégés par CRON_SECRET
 *   - /api/track/**              : analytics légères (pas de données sensibles)
 *   - /sw.js, /manifest.json     : assets PWA
 *
 * Routes protégées (requièrent une session) — NON listées ici :
 *   - /onboarding, /start : pages post-inscription — gèrent elles-mêmes le redirect si pas de session
 *   - /dashboard, /batches, /sales, /farms, etc. : tableau de bord
 *   - /admin/** : espace super-admin
 *   - /api/** (hors exceptions ci-dessus) : toutes les API métier
 */

import { auth } from "@/src/auth"
import { NextResponse } from "next/server"

// NextAuth v5 : le callback reçoit une NextAuthRequest (NextRequest + .auth: Session | null).
// L'import de NextRequest n'est pas nécessaire ici — TypeScript infère le type depuis `auth()`.

const PUBLIC_PATHS: RegExp[] = [
  // Pages d'authentification (route group (auth) — préfixe retiré par Next.js)
  /^\/login(\/|$)/,
  /^\/register(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/verify-email(\/|$)/,

  // NextAuth handlers
  /^\/api\/auth\//,

  // Webhooks paiement — authentifiés par signature HMAC côté handler
  /^\/api\/payments\/webhooks\//,

  // Jobs cron — authentifiés par CRON_SECRET côté handler
  /^\/api\/cron\//,

  // Analytics légères (tracking CTA, pas de données sensibles)
  /^\/api\/track\//,

  // Assets PWA (service worker, manifeste, icônes)
  /^\/sw\.js$/,
  /^\/manifest\.json$/,
  /^\/icons\//,
  /^\/images\//,
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname))
}

export default auth((req) => {
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next()
  }

  // req.auth est Session | null (injecté par NextAuth v5)
  if (!req.auth) {
    // Routes API : répondre 401 JSON, pas de redirect (clients programmatiques)
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", code: "UNAUTHENTICATED" },
        { status: 401 },
      )
    }

    // Pages : redirect vers /login avec callbackUrl pour reprendre après connexion
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  // Le matcher exclut les fichiers statiques Next.js (_next/static, _next/image)
  // et favicon.ico — tout le reste passe par le middleware.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
}
