/**
 * Rate limiting hybride : PostgreSQL (partagé) avec fallback in-memory (par instance).
 *
 * COMPORTEMENT EN CAS D'INDISPONIBILITÉ POSTGRESQL :
 *
 *   Toute exception dans applyRateLimit() déclenche le fallback in-memory.
 *   Ce fallback est fonctionnel mais présente deux limites connues :
 *
 *   1. Non partagé entre instances Vercel.
 *      Sur Vercel serverless, chaque cold-start crée une nouvelle instance avec un
 *      compteur à zéro. Avec N instances simultanées, la limite effective est N × limite.
 *      Exemple : 10 req/min configuré → jusqu'à ~50 req/min si 5 instances actives.
 *
 *   2. Remise à zéro au redémarrage de l'instance.
 *      Une instance qui redémarre repart de 0, même si la fenêtre n'est pas expirée.
 *
 *   Ces limitations sont acceptables pour une dégradation gracieuse temporaire.
 *   Si PostgreSQL est indisponible de manière prolongée, les endpoints critiques
 *   (login, AI, paiements) ne sont pas sans protection — ils ont juste une protection
 *   plus faible. Un log WARN est émis à chaque fallback pour alerter les opérateurs.
 *
 *   Recommandation V2 : migrer vers @upstash/ratelimit + Upstash Redis pour un
 *   rate limiting distribué sans dépendance à la base de données principale.
 */

const globalStore = globalThis as typeof globalThis & {
  sunufarmRateLimitStore?: Map<string, { count: number; resetAt: number }>
  sunufarmRateLimitTableReady?: Promise<void>
}

const store = globalStore.sunufarmRateLimitStore ?? new Map<string, { count: number; resetAt: number }>()

if (!globalStore.sunufarmRateLimitStore) {
  globalStore.sunufarmRateLimitStore = store
}

async function ensureRateLimitTable() {
  if (!globalStore.sunufarmRateLimitTableReady) {
    globalStore.sunufarmRateLimitTableReady = import("@/src/lib/prisma")
      .then(async ({ default: prisma }) => {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "RateLimitWindow" (
            "key" TEXT PRIMARY KEY,
            "count" INTEGER NOT NULL,
            "resetAt" TIMESTAMPTZ NOT NULL
          )
        `)
      })
      .catch((error) => {
        globalStore.sunufarmRateLimitTableReady = undefined
        throw error
      })
  }

  return globalStore.sunufarmRateLimitTableReady
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

export interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

export function getClientIpFromHeaders(headers: Headers): string {
  // Sur Vercel, x-real-ip est injecté par l'infrastructure et n'est pas forgeable par le client.
  // x-forwarded-for est contrôlable par l'attaquant — on utilise la DERNIÈRE entrée (proxy de confiance)
  // plutôt que la première (déclarée par le client) si x-real-ip est absent.
  const realIp = headers.get("x-real-ip")
  if (realIp) return realIp.trim()

  const forwardedFor = headers.get("x-forwarded-for")
  if (forwardedFor) {
    // La dernière IP est ajoutée par le proxy de confiance (Vercel edge), pas par le client
    return forwardedFor.split(",").at(-1)?.trim() ?? "unknown"
  }

  return "unknown"
}

function applyInMemoryRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const current = store.get(options.key)

  if (!current || current.resetAt <= now) {
    const resetAt = now + options.windowMs
    store.set(options.key, { count: 1, resetAt })

    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      resetAt,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    }
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  store.set(options.key, current)

  return {
    allowed: true,
    remaining: Math.max(0, options.limit - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}

export async function applyRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    await ensureRateLimitTable()
    const { default: prisma } = await import("@/src/lib/prisma")
    const now = new Date()
    const resetAt = new Date(now.getTime() + options.windowMs)

    const rows = await prisma.$queryRawUnsafe<Array<{
      allowed: boolean
      remaining: number
      resetAtMs: number
      retryAfterSeconds: number
    }>>(
      `
        INSERT INTO "RateLimitWindow" ("key", "count", "resetAt")
        VALUES ($1, 1, $2)
        ON CONFLICT ("key")
        DO UPDATE SET
          "count" = CASE
            WHEN "RateLimitWindow"."resetAt" <= NOW() THEN 1
            WHEN "RateLimitWindow"."count" < $3 THEN "RateLimitWindow"."count" + 1
            ELSE "RateLimitWindow"."count"
          END,
          "resetAt" = CASE
            WHEN "RateLimitWindow"."resetAt" <= NOW() THEN $2
            ELSE "RateLimitWindow"."resetAt"
          END
        RETURNING
          ("count" <= $3) AS "allowed",
          GREATEST(0, $3 - "count") AS "remaining",
          FLOOR(EXTRACT(EPOCH FROM "resetAt") * 1000)::bigint AS "resetAtMs",
          GREATEST(
            1,
            CEIL(EXTRACT(EPOCH FROM ("resetAt" - NOW())))
          )::int AS "retryAfterSeconds"
      `,
      options.key,
      resetAt.toISOString(),
      options.limit,
    )

    const row = rows[0]
    if (!row) {
      // Résultat vide inattendu — fallback in-memory
      console.warn(JSON.stringify({
        level: "warn",
        event: "rate_limit.db_empty_result",
        key: options.key,
        fallback: "in_memory",
      }))
      return applyInMemoryRateLimit(options)
    }

    return {
      allowed: row.allowed,
      remaining: row.remaining,
      resetAt: Number(row.resetAtMs),
      retryAfterSeconds: row.retryAfterSeconds,
    }
  } catch (err) {
    // PostgreSQL indisponible — fallback in-memory avec avertissement explicite.
    // Voir commentaire en tête de fichier pour les implications sécurité.
    console.warn(JSON.stringify({
      level: "warn",
      event: "rate_limit.db_unavailable_fallback",
      key: options.key,
      fallback: "in_memory",
      error: err instanceof Error ? err.message : String(err),
    }))
    return applyInMemoryRateLimit(options)
  }
}

export function createRateLimitHeaders(result: RateLimitResult, limit: number): HeadersInit {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    "Retry-After": String(result.retryAfterSeconds),
  }
}
