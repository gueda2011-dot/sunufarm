import { NextResponse, type NextRequest } from "next/server"
import { handlers } from "@/src/auth"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"

export const GET = handlers.GET

export async function POST(request: NextRequest) {
  const rateLimit = applyRateLimit({
    key: `auth:${getClientIpFromHeaders(request.headers)}`,
    limit: 10,
    windowMs: 15 * 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives de connexion. Reessayez dans quelques minutes." },
      { status: 429, headers: createRateLimitHeaders(rateLimit, 10) },
    )
  }

  const response = await handlers.POST(request)

  Object.entries(createRateLimitHeaders(rateLimit, 10)).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}
