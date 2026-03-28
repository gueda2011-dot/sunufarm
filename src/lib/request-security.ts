import { getServerEnv } from "@/src/lib/env"

export interface AuditRequestContext {
  ipAddress?: string
  userAgent?: string
}

export function getRequestAuditContext(headers: Headers): AuditRequestContext {
  const forwardedFor = headers.get("x-forwarded-for")
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? undefined
  const userAgent = headers.get("user-agent") ?? undefined

  return {
    ipAddress,
    userAgent,
  }
}

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, "")
}

function getAllowedOrigins(): string[] {
  const env = getServerEnv()
  const values = [
    env.AUTH_URL,
    env.NEXT_PUBLIC_APP_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
  ].filter((value): value is string => Boolean(value))

  return [...new Set(values.map(normalizeOrigin))]
}

export function isTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return false

  const normalizedOrigin = normalizeOrigin(origin)
  const allowedOrigins = getAllowedOrigins()
  return allowedOrigins.includes(normalizedOrigin)
}
