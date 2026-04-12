import { getServerEnv } from "@/src/lib/env"

export interface AuditRequestContext {
  ipAddress?: string
  userAgent?: string
  requestId?: string
}

export function getRequestAuditContext(headers: Headers): AuditRequestContext {
  // Priorité à x-real-ip (injecté par Vercel, non forgeable), puis dernière entrée de x-forwarded-for
  const realIp = headers.get("x-real-ip")
  const forwardedFor = headers.get("x-forwarded-for")
  const ipAddress =
    realIp?.trim() ??
    forwardedFor?.split(",").at(-1)?.trim() ??
    undefined
  const userAgent = headers.get("user-agent") ?? undefined
  const requestId = getRequestId(headers)

  return {
    ipAddress,
    userAgent,
    requestId,
  }
}

export function getRequestId(headers: Headers): string {
  return (
    headers.get("x-request-id") ??
    headers.get("x-correlation-id") ??
    crypto.randomUUID()
  )
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
