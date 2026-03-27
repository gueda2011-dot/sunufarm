import { NextResponse } from "next/server"
import { adminUpdateOrganizationSubscription } from "@/src/actions/subscriptions"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { getRequestAuditContext, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Origine de requete non autorisee." },
      { status: 403 },
    )
  }

  const { organizationId } = await params
  const rateLimit = applyRateLimit({
    key: `admin-subscription:${organizationId}:${getClientIpFromHeaders(request.headers)}`,
    limit: 10,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de modifications d'abonnement. Reessayez dans un instant." },
      { status: 429, headers: createRateLimitHeaders(rateLimit, 10) },
    )
  }

  const body = await request.json()

  const result = await adminUpdateOrganizationSubscription(
    {
      ...body,
      organizationId,
    },
    getRequestAuditContext(request.headers),
  )

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    )
  }

  return NextResponse.json(result)
}
