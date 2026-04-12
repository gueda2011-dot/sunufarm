import type { NextConfig } from "next";

// Vercel preview deployments inject a toolbar script from vercel.live.
// We relax the CSP for preview only — production stays strict.
const isVercelPreview = process.env.VERCEL_ENV === "preview"

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",

              // unsafe-inline requis pour Next.js (styles inline dans les Server Components).
              // unsafe-eval supprimé — Next.js 14+ ne l'exige plus en production.
              // En preview Vercel, on autorise vercel.live pour la toolbar de feedback.
              "script-src 'self' 'unsafe-inline'" +
                (isVercelPreview ? " https://vercel.live https://*.vercel.live" : ""),

              "style-src 'self' 'unsafe-inline'",

              // img : Supabase storage pour logos/avatars, blob pour previews locaux
              "img-src 'self' data: blob:" +
                " https://*.supabase.co" +
                " https://*.supabase.in",

              "font-src 'self' data:",

              // connect-src : liste exhaustive des domaines contactés par le client
              //   - Supabase : DB REST, storage, realtime
              //   - Firebase/Google : FCM push tokens (firebaseinstallations) + messaging
              //   - Anthropic / OpenAI : proxiés via /api/ai — pas contactés directement depuis le navigateur
              //   - Wave : proxié via /api/payments — pas contacté depuis le navigateur
              //   - ws:/wss: : hot-reload Next.js dev + éventuels websockets Supabase Realtime
              //   - En preview Vercel : vercel.live (toolbar) + Pusher (temps réel toolbar)
              "connect-src 'self'" +
                " https://*.supabase.co" +
                " https://*.supabase.in" +
                " https://api.open-meteo.com" +
                " https://fcm.googleapis.com" +
                " https://firebaseinstallations.googleapis.com" +
                " https://storage.googleapis.com" +
                " wss://fcm.googleapis.com" +
                " ws://localhost:* wss://localhost:*" +
                (isVercelPreview
                  ? " https://vercel.live https://*.vercel.live wss://*.pusher.com https://*.pusher.com"
                  : ""),

              // Service Worker + Web Workers pour PWA
              "worker-src 'self' blob:",

              // frame-src : en preview Vercel, la toolbar utilise des iframes
              isVercelPreview ? "frame-src https://vercel.live" : "frame-src 'none'",

              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
};

export default nextConfig;
