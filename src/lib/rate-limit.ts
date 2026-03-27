const globalStore = globalThis as typeof globalThis & {
  sunufarmRateLimitStore?: Map<string, { count: number; resetAt: number }>
}

const store = globalStore.sunufarmRateLimitStore ?? new Map<string, { count: number; resetAt: number }>()

if (!globalStore.sunufarmRateLimitStore) {
  globalStore.sunufarmRateLimitStore = store
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
  const forwardedFor = headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown"
  }

  return headers.get("x-real-ip") ?? "unknown"
}

export function applyRateLimit(options: RateLimitOptions): RateLimitResult {
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

export function createRateLimitHeaders(result: RateLimitResult, limit: number): HeadersInit {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    "Retry-After": String(result.retryAfterSeconds),
  }
}
